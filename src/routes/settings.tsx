import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Database, Download } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { exportFn, generationStepFn, resumeGenerationFn, startGenerationFn } from "@/lib/calibra.functions";
import { count, download, fmtTs, rows, useSettings } from "@/lib/data";
import { useAction, useSession } from "@/lib/session";
import { GENERATOR_VERSION, SCALES, type Scale } from "@/data/generator";

export const Route = createFileRoute("/settings")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Settings — Calibra" }, { name: "description", content: "Simulation date, policies, data generation and exports." }, { property: "og:title", content: "Settings — Calibra" }, { property: "og:description", content: "Configuration and data generation." }] }),
  component: Settings,
});

const EXPORT_TABLES = ["instrument_types", "suppliers", "calibration_plans", "assets", "calibration_events", "certificates", "exception_records", "work_orders", "downtime_events", "production_use", "use_attempts", "corrective_actions", "impact_assessments", "alerts", "audit_records", "state_history", "ground_truth_cases", "settings_history", "generation_runs", "evaluation_runs"];

function Settings() {
  const s = useSettings();
  const act = useAction();
  const { role } = useSession();
  const qc = useQueryClient();
  const start = useServerFn(startGenerationFn);
  const step = useServerFn(generationStepFn);
  const resume = useServerFn(resumeGenerationFn);
  const exp = useServerFn(exportFn);
  const [form, setForm] = useState({ simulation_date: "", warning_threshold_days: "30", default_prohibit_overdue_use: true, default_requires_certificate: true, export_row_limit: "100000" });
  const [gen, setGen] = useState({ seed: "20261022", scale: "starter" as Scale, simStart: "2025-10-28", simEnd: "2026-10-28" });
  const [progress, setProgress] = useState<{ i: number; n: number; step: string } | null>(null);
  const [exportSel, setExportSel] = useState({ table: "assets", format: "csv" as "csv" | "json" | "sql" });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!s.data) return;
    const r = s.data.raw;
    setForm({ simulation_date: r.simulation_date ?? "", warning_threshold_days: String(r.warning_threshold_days ?? 30), default_prohibit_overdue_use: r.default_prohibit_overdue_use ?? true, default_requires_certificate: r.default_requires_certificate ?? true, export_row_limit: String(r.export_row_limit ?? 100000) });
    setGen((g) => ({ ...g, seed: String(r.generator_seed ?? 20261022), scale: (r.generation_scale ?? "starter") as Scale }));
  }, [s.data]);

  const conn = useQuery({ queryKey: ["conn"], queryFn: async () => { const t = Date.now(); const n = await count("settings"); return { ok: n >= 0, ms: Date.now() - t }; }, retry: false });
  const history = useQuery({ queryKey: ["settings_history"], queryFn: () => rows("settings_history", (q) => q.order("changed_at", { ascending: false }).limit(15)) });
  const runs = useQuery({ queryKey: ["gen-runs"], queryFn: () => rows("generation_runs", (q) => q.order("started_at", { ascending: false }).limit(5)) });

  const save = async (key: string, value: unknown) => {
    const reason = window.prompt(`Reason for changing ${key}?`) ?? "";
    const r = await act.run("settings.update", { key, value, reason }, `${key} updated (versioned)`);
    if (r) qc.invalidateQueries();
  };

  const runGeneration = async (resuming = false) => {
    if (!resuming && !window.confirm(`Generate ${gen.scale} data only if the assessment dataset is empty? Existing records will never be replaced.`)) return;
    try {
      setProgress({ i: 0, n: 1, step: resuming ? "resuming" : "checking data preservation" });
      const { run_id, steps, startIndex = 0 } = resuming ? await resume({ data: { role } }) : { ...(await start({ data: { cfg: { seed: Number(gen.seed), scale: gen.scale, simStart: gen.simStart, simEnd: gen.simEnd }, role } })), startIndex: 0 };
      for (let i = startIndex; i < steps.length; i++) {
        setProgress({ i, n: steps.length, step: steps[i]! });
        const r = await step({ data: { runId: run_id, step: steps[i]!, role } });
        if (r.done) { r.status === "SUCCEEDED" ? toast.success(`Generation succeeded: ${r.actual.assets} assets, ${r.actual.calibration_events} calibrations, ${r.actual.production_use} uses`) : toast.error("Generation finished with row-count mismatches"); }
      }
    } catch (e) { toast.error(`Generation failed: ${(e as Error).message}`); }
    setProgress(null);
    qc.invalidateQueries();
  };

  const runExport = async () => {
    setExporting(true);
    try {
      const r = await exp({ data: exportSel });
      download(`${exportSel.table}.${exportSel.format}`, r.content, exportSel.format === "json" ? "application/json" : exportSel.format === "sql" ? "application/sql" : "text/csv");
      if (r.truncated) toast.warning(`Exported ${r.rows.toLocaleString()} of ${r.total.toLocaleString()} rows — configured export limit reached`);
      else toast.success(`Exported ${r.rows.toLocaleString()} rows`);
    } catch (e) { toast.error((e as Error).message); }
    setExporting(false);
  };

  const Row2 = ({ label, children, help }: { label: string; children: React.ReactNode; help?: string }) => <div className="grid items-center gap-2 border-b px-4 py-3 md:grid-cols-[220px_1fr]"><div><div className="text-[13px] font-medium">{label}</div>{help && <div className="text-[11px] text-muted-foreground">{help}</div>}</div><div className="flex flex-wrap items-center gap-2">{children}</div></div>;
  const isAdmin = role === "ADMIN";

  return (
    <div>
      <PageHeader title="Settings" subtitle="Policy changes are versioned in settings history and never rewrite historical decisions." />
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="panel">
          <div className="panel-head"><span className="panel-title">Simulation & policy</span></div>
          <Row2 label="Simulation date" help="All derived statuses recalculate from this date"><input type="date" className="field w-44" value={form.simulation_date} onChange={(e) => setForm({ ...form, simulation_date: e.target.value })} /><button className="btn-primary" disabled={!isAdmin} onClick={() => save("simulation_date", form.simulation_date)}>Save</button></Row2>
          <Row2 label="Due-soon warning threshold" help="Days before due date"><input type="number" className="field w-28" value={form.warning_threshold_days} onChange={(e) => setForm({ ...form, warning_threshold_days: e.target.value })} /><button className="btn-primary" disabled={!isAdmin} onClick={() => save("warning_threshold_days", Number(form.warning_threshold_days))}>Save</button></Row2>
          <Row2 label="Default overdue-use policy" help="Applied to new plan versions; existing plans keep their own flag"><select className="field w-48" value={String(form.default_prohibit_overdue_use)} onChange={(e) => setForm({ ...form, default_prohibit_overdue_use: e.target.value === "true" })}><option value="true">Prohibit (block)</option><option value="false">Allow with review (flag)</option></select><button className="btn-primary" disabled={!isAdmin} onClick={() => save("default_prohibit_overdue_use", form.default_prohibit_overdue_use)}>Save</button></Row2>
          <Row2 label="Default certificate requirement"><select className="field w-48" value={String(form.default_requires_certificate)} onChange={(e) => setForm({ ...form, default_requires_certificate: e.target.value === "true" })}><option value="true">Required</option><option value="false">Optional</option></select><button className="btn-primary" disabled={!isAdmin} onClick={() => save("default_requires_certificate", form.default_requires_certificate)}>Save</button></Row2>
          <Row2 label="Export row limit"><input type="number" className="field w-32" value={form.export_row_limit} onChange={(e) => setForm({ ...form, export_row_limit: e.target.value })} /><button className="btn-primary" disabled={!isAdmin} onClick={() => save("export_row_limit", Number(form.export_row_limit))}>Save</button></Row2>
          <Row2 label="Backend connection">{conn.isLoading ? "Checking…" : conn.data?.ok ? <span className="badge-ok">CONNECTED · {conn.data.ms} ms</span> : <span className="badge-bad">UNREACHABLE</span>}</Row2>
          <Row2 label="Application version"><span className="mono">Calibra 1.0.0 · generator {GENERATOR_VERSION}</span></Row2>
          {!isAdmin && <div className="px-4 py-3 text-[12px] text-warning">Switch to the OT/IT Administrator role to change settings.</div>}
        </div>

        <div className="panel">
          <div className="panel-head"><span className="panel-title">Synthetic data generation</span></div>
          <Row2 label="Seed"><input className="field w-40" value={gen.seed} onChange={(e) => setGen({ ...gen, seed: e.target.value.replace(/\D/g, "") })} /></Row2>
          <Row2 label="Scale" help={`Starter ${SCALES.starter.assets}/${SCALES.starter.calibrations}/${SCALES.starter.uses.toLocaleString()} · Full ${SCALES.full.assets}/${SCALES.full.calibrations}/${SCALES.full.uses.toLocaleString()} (assets/calibrations/uses)`}>
            <select className="field w-40" value={gen.scale} onChange={(e) => setGen({ ...gen, scale: e.target.value as Scale })}><option value="starter">Starter</option><option value="full">Full</option></select></Row2>
          <Row2 label="Simulation window"><input type="date" className="field w-40" value={gen.simStart} onChange={(e) => setGen({ ...gen, simStart: e.target.value })} /> → <input type="date" className="field w-40" value={gen.simEnd} onChange={(e) => setGen({ ...gen, simEnd: e.target.value })} /></Row2>
          <div className="px-4 py-3">
            <button className="btn-primary" disabled={!isAdmin || !!progress} title={isAdmin ? "" : "Admin only"} onClick={() => runGeneration(false)}><Database className="h-4 w-4" />{progress ? "Generating…" : "Generate dataset"}</button>
            {!progress && runs.data?.[0]?.status === "RUNNING" && <button className="btn-outline ml-2" disabled={!isAdmin} onClick={() => runGeneration(true)}>Resume interrupted run</button>}
            {progress && <div className="mt-3 space-y-1"><Progress value={((progress.i + 1) / progress.n) * 100} /><div className="text-[12px] text-muted-foreground">Step {progress.i + 1}/{progress.n}: {progress.step}</div></div>}
          </div>
          <table className="tbl"><thead><tr><th>Started</th><th>Scale</th><th>Seed</th><th>Status</th><th>Assets / Cal / Uses</th></tr></thead><tbody>
            {runs.data?.map((r) => <tr key={r.run_id}><td className="mono">{fmtTs(r.started_at)}</td><td>{r.scale}</td><td className="mono">{r.seed}</td><td><StatusBadge value={r.status} /></td><td className="mono text-[11px]">{r.row_counts?.actual ? `${r.row_counts.actual.assets} / ${r.row_counts.actual.calibration_events} / ${r.row_counts.actual.production_use}` : r.error ?? "—"}</td></tr>)}
          </tbody></table>
        </div>

        <div className="panel">
          <div className="panel-head"><span className="panel-title">Data export</span></div>
          <Row2 label="Table"><select className="field w-56" value={exportSel.table} onChange={(e) => setExportSel({ ...exportSel, table: e.target.value })}>{EXPORT_TABLES.map((t) => <option key={t}>{t}</option>)}</select></Row2>
          <Row2 label="Format"><select className="field w-40" value={exportSel.format} onChange={(e) => setExportSel({ ...exportSel, format: e.target.value as "csv" })}><option value="csv">CSV</option><option value="json">JSON</option><option value="sql">SQL inserts</option></select>
            <button className="btn-primary" disabled={exporting} onClick={runExport}><Download className="h-4 w-4" />{exporting ? "Exporting…" : "Export"}</button></Row2>
        </div>

        <div className="panel">
          <div className="panel-head"><span className="panel-title">Settings history</span></div>
          <table className="tbl"><thead><tr><th>When</th><th>Key</th><th>v</th><th>Old → New</th><th>Actor</th><th>Reason</th></tr></thead><tbody>
            {history.data?.map((h) => <tr key={h.id}><td className="mono">{fmtTs(h.changed_at)}</td><td className="mono">{h.key}</td><td>{h.version}</td><td className="mono text-[11px]">{JSON.stringify(h.old_value)} → {JSON.stringify(h.new_value)}</td><td>{h.actor}</td><td>{h.reason}</td></tr>)}
            {history.data?.length === 0 && <tr><td colSpan={6} className="py-4 text-center text-muted-foreground">No changes yet.</td></tr>}
          </tbody></table>
        </div>
      </div>
    </div>
  );
}
