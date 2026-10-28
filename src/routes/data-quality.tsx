import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Download, Play } from "lucide-react";
import { PageHeader, Stat } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { evaluationFn, reproducibilityFn, validationFn } from "@/lib/calibra.functions";
import { count, download, fmtTs, pct, rows, allRows, toCsv, type Row } from "@/lib/data";

export const Route = createFileRoute("/data-quality")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Data Quality & Evaluation — Calibra" }, { name: "description", content: "Validation, ground-truth evaluation and reproducibility checks." }, { property: "og:title", content: "Data Quality — Calibra" }, { property: "og:description", content: "Validation and evaluation." }] }),
  component: DataQuality,
});

const TABLES = ["assets", "instrument_types", "calibration_plans", "calibration_events", "certificates", "work_orders", "downtime_events", "production_use", "use_attempts", "suppliers", "alerts", "audit_records", "exception_records", "corrective_actions", "impact_assessments", "state_history", "ground_truth_cases"];

function DataQuality() {
  const qc = useQueryClient();
  const validate = useServerFn(validationFn);
  const evaluate = useServerFn(evaluationFn);
  const repro = useServerFn(reproducibilityFn);
  const [busy, setBusy] = useState<string | null>(null);
  const [val, setVal] = useState<Awaited<ReturnType<typeof validationFn>> | null>(null);
  const [ev, setEv] = useState<Awaited<ReturnType<typeof evaluationFn>> | null>(null);
  const [rp, setRp] = useState<Awaited<ReturnType<typeof reproducibilityFn>> | null>(null);

  const counts = useQuery({ queryKey: ["dq-counts"], queryFn: async () => Object.fromEntries(await Promise.all(TABLES.map(async (t) => [t, await count(t)] as const))) });
  const runs = useQuery({ queryKey: ["dq-runs"], queryFn: () => allRows("evaluation_runs", undefined, "*", "started_at", Number.POSITIVE_INFINITY, false) });
  const gen = useQuery({ queryKey: ["dq-gen"], queryFn: () => rows("generation_runs", (q) => q.eq("status", "SUCCEEDED").order("started_at", { ascending: false }).limit(1)) });
  const lastEval = ev?.metrics ?? runs.data?.find((r) => r.kind === "EVALUATION" && r.status === "SUCCEEDED")?.metrics;
  const lastVal = val?.summary ?? runs.data?.find((r) => r.kind === "VALIDATION" && r.status === "SUCCEEDED")?.summary;

  const go = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name);
    try { await fn(); toast.success(`${name} finished`); } catch (e) { toast.error(`${name} failed: ${(e as Error).message}`); }
    setBusy(null);
    qc.invalidateQueries();
  };

  const integ = (lastVal as Row | undefined)?.integrity?.byCheck ?? {};
  const byIssue = (lastVal as Row | undefined)?.findings?.byIssue ?? {};
  const g = gen.data?.[0];
  const evaluatedRun = runs.data?.find((r) => r.kind === "EVALUATION" && r.status === "SUCCEEDED");
  const operational = ev?.summary?.operationalFindings ?? evaluatedRun?.summary?.operationalFindings ?? [];

  return (
    <div>
      <PageHeader title="Data quality & evaluation" subtitle="Validation and the compliance detector read only operational records. Ground truth is used solely for scoring."
        actions={<>
          <button className="btn-outline" disabled={!!busy} onClick={() => go("Validation", async () => setVal(await validate({ data: { syncAlerts: false } })))}><Play className="h-3.5 w-3.5" />{busy === "Validation" ? "Running…" : "Run validation"}</button>
          <button className="btn-outline" disabled={!!busy} onClick={() => go("Compliance evaluation", async () => setVal(await validate({ data: { syncAlerts: true } })))}><Play className="h-3.5 w-3.5" />{busy === "Compliance evaluation" ? "Running…" : "Run compliance evaluation"}</button>
          <button className="btn-primary" disabled={!!busy} onClick={() => go("Ground-truth comparison", async () => setEv(await evaluate()))}><Play className="h-3.5 w-3.5" />{busy === "Ground-truth comparison" ? "Running…" : "Compare with ground truth"}</button>
          <button className="btn-outline" disabled={!!busy} onClick={() => go("Reproducibility check", async () => setRp(await repro()))}><Play className="h-3.5 w-3.5" />{busy === "Reproducibility check" ? "Running…" : "Reproducibility check"}</button>
        </>} />

      <div className="mb-3 text-[12px] text-muted-foreground">Validation result: {fmtTs(runs.data?.find((r) => r.kind === "VALIDATION" && r.status === "SUCCEEDED")?.finished_at)} · latest failed run: {fmtTs(runs.data?.find((r) => r.status === "FAILED")?.finished_at)}</div>
      <div className="mb-3 text-[12px] text-muted-foreground">Evaluation: {evaluatedRun ? fmtTs(evaluatedRun.finished_at) : "not run"} · latest attempt: {runs.data?.[0]?.kind} {runs.data?.[0]?.status} · scoring scope: {lastEval?.scope ?? "historical live-versus-baseline comparison"}</div>
      {operational.length > 0 && <div className="mb-3 border-l-4 border-warning p-3 text-[12px]">Live findings outside baseline: {operational.length}{operational.map((f: Row) => <div key={`${f.issue_type}-${f.entity_id}`} className="mono">{f.issue_type} · {f.entity_id} · {f.rule_id}</div>)}</div>}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <Stat label="Generation" value={<StatusBadge value={g?.status ?? "NONE"} />} hint={g ? `${g.scale} · seed ${g.seed}` : "no run"} />
        <Stat label="Validation" value={<StatusBadge value={(lastVal as Row | undefined)?.status ?? "NOT RUN"} />} hint={lastVal ? `${(lastVal as Row).integrity.total} integrity issues` : ""} />
        <Stat label="Precision" value={pct(lastEval?.overall?.precision)} tone="ok" />
        <Stat label="Recall" value={pct(lastEval?.overall?.recall)} tone="ok" />
        <Stat label="F1" value={pct(lastEval?.overall?.f1)} tone="ok" />
        <Stat label="GT cases" value={counts.data?.ground_truth_cases?.toLocaleString() ?? "…"} />
        <Stat label="Due-date mismatches" value={byIssue.DUE_DATE_PLAN_MISMATCH ?? "—"} tone="warn" />
        <Stat label="Cert mismatches" value={byIssue.CERTIFICATE_ASSET_MISMATCH ?? "—"} tone="warn" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <div className="panel min-w-0 overflow-x-auto"><div className="panel-head"><span className="panel-title">Entity row counts</span>{g && <span className="text-[11px] text-muted-foreground">expected = last generation</span>}</div>
          <table className="tbl"><thead><tr><th>Table</th><th className="text-right">Rows</th><th className="text-right">Expected</th></tr></thead><tbody>
            {TABLES.map((t) => { const exp = g?.row_counts?.expected?.[t]; const n = counts.data?.[t]; return <tr key={t}><td className="mono">{t}</td><td className="text-right tabular-nums">{n?.toLocaleString() ?? "…"}</td><td className={`text-right tabular-nums ${exp != null && n != null && exp !== n ? "text-warning" : "text-muted-foreground"}`}>{exp?.toLocaleString() ?? "—"}</td></tr>; })}
          </tbody></table>
          <div className="px-3 py-2 text-[11px] text-muted-foreground">Rows above "expected" reflect workflow activity after generation.</div>
        </div>

        <div className="panel min-w-0 overflow-x-auto"><div className="panel-head"><span className="panel-title">Validation checks</span>{val && <button className="btn-outline" onClick={() => download("validation-errors.csv", toCsv(val.issues as Row[]))}><Download className="h-3.5 w-3.5" />Errors</button>}</div>
          <table className="tbl"><tbody>
            {["PK_DUPLICATE", "FK_MISSING", "FK_NULL", "ENUM_INVALID", "DATE_ORDER", "ID_FORMAT", "DOWNTIME_ARITHMETIC", "LIFECYCLE_RESULT"].map((c) => <tr key={c}><td className="mono">{c}</td><td className="text-right">{lastVal ? <span className={integ[c] ? "badge-bad" : "badge-ok"}>{integ[c] ?? 0}</span> : "—"}</td></tr>)}
          </tbody></table>
          {lastVal && <div className="space-y-1 border-t px-3 py-2 text-[12px]">
            <div>1 · Valid baseline records: integrity issues <b>{(lastVal as Row).integrity.total}</b></div>
            <div>2 · Deliberate anomalies detected as expected: <b>{(lastVal as Row).findings.expectedAnomalies}</b></div>
            <div>3 · Unexpected findings (generator/app defects or new workflow data): <b>{(lastVal as Row).findings.unexpected}</b></div>
          </div>}
        </div>

        <div className="panel min-w-0 overflow-x-auto"><div className="panel-head"><span className="panel-title">Detector findings by issue</span></div>
          <table className="tbl"><tbody>{Object.entries(byIssue).map(([k, v]) => <tr key={k}><td className="mono">{k}</td><td className="text-right">{String(v)}</td></tr>)}</tbody></table>
          {!lastVal && <div className="p-4 text-muted-foreground">Run validation to populate.</div>}
        </div>
      </div>

      {lastEval && (
        <div className="mt-4 grid min-w-0 gap-4 lg:grid-cols-2">
          <div className="panel min-w-0 overflow-x-auto"><div className="panel-head"><span className="panel-title">Four mandatory scenarios — expected vs actual</span></div>
            <table className="tbl"><thead><tr><th>Scenario</th><th>Expected</th><th>Detected</th><th>Result</th><th>Examples</th></tr></thead><tbody>
              {(lastEval.scenarios as Row[]).map((s) => <tr key={s.issue_type}><td className="mono">{s.issue_type}</td><td>{s.expected}</td><td>{s.detected}</td><td>{s.pass ? <span className="badge-ok">PASS</span> : <span className="badge-bad">FAIL</span>}</td><td className="mono text-[11px]">{s.sample.join(", ")}</td></tr>)}
            </tbody></table></div>
          <div className="panel min-w-0 overflow-x-auto"><div className="panel-head"><span className="panel-title">Detection by issue type</span>
            <button className="btn-outline" onClick={() => download("evaluation-report.json", JSON.stringify({ metrics: lastEval, operationalFindings: operational, missed: ev?.missed ?? runs.data?.find((r) => r.kind === "EVALUATION" && r.status === "SUCCEEDED")?.summary?.missed, unexpected: ev?.unexpected ?? runs.data?.find((r) => r.kind === "EVALUATION" && r.status === "SUCCEEDED")?.summary?.unexpected }, null, 2), "application/json")}><Download className="h-3.5 w-3.5" />Report</button></div>
            <table className="tbl"><thead><tr><th>Issue</th><th>TP</th><th>FP</th><th>FN</th><th>TN</th><th>Precision</th><th>Recall</th><th>F1</th></tr></thead><tbody>
              {Object.entries(lastEval.perIssue as Record<string, Row>).map(([k, m]) => <tr key={k}><td className="mono text-[11px]">{k}</td><td>{m.tp}</td><td>{m.fp}</td><td>{m.fn}</td><td>{"n/a"}</td><td>{pct(m.precision)}</td><td>{pct(m.recall)}</td><td>{pct(m.f1)}</td></tr>)}
              <tr className="font-semibold"><td>Overall</td><td>{lastEval.overall.tp}</td><td>{lastEval.overall.fp}</td><td>{lastEval.overall.fn}</td><td>{"n/a"}</td><td>{pct(lastEval.overall.precision)}</td><td>{pct(lastEval.overall.recall)}</td><td>{pct(lastEval.overall.f1)}</td></tr>
            </tbody></table>
            <div className="px-3 py-2 text-[11px] text-muted-foreground">n/a = zero denominator. TN is not reported: no independently labeled negative population is defined.</div>
          </div>
        </div>
      )}

      {rp && <div className="mt-3 text-[12px]">Current-code repeatability: {String(rp.repeatable)} · recorded checksum agreement: {String(rp.storedAgreement)} · persisted baseline comparison: not verified · checksum algorithm {rp.checksum_version}</div>}
      {rp && (
        <div className="panel mt-4"><div className="panel-head"><span className="panel-title">Reproducibility — two runs, seed {rp.config.seed}, {rp.config.scale}</span>{rp.identical ? <span className="badge-ok">IDENTICAL</span> : <span className="badge-bad">DIFFERENT</span>}</div>
          <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Table</th><th>Rows A</th><th>Rows B</th><th>SHA-256 A</th><th>SHA-256 B</th><th>Matches stored</th></tr></thead><tbody>
            {rp.tables.map((t: Row) => <tr key={t.table}><td className="mono">{t.table}</td><td>{t.rowsA}</td><td>{t.rowsB}</td><td className="mono text-[10px]">{t.checksumA.slice(0, 20)}…</td><td className={`mono text-[10px] ${t.identical ? "" : "text-destructive"}`}>{t.checksumB.slice(0, 20)}…</td><td>{t.matchesStored == null ? "—" : t.matchesStored ? <span className="badge-ok">yes</span> : <span className="badge-bad">no</span>}</td></tr>)}
          </tbody></table></div></div>
      )}

      <div className="panel mt-4 overflow-x-auto"><div className="panel-head"><span className="panel-title">Previous runs</span></div>
        <table className="tbl"><thead><tr><th>Started</th><th>Kind</th><th>Status</th><th>Key result</th><th>Error</th></tr></thead><tbody>
          {runs.data?.map((r) => <tr key={r.run_id}><td className="mono">{fmtTs(r.started_at)}</td><td>{r.kind}</td><td><StatusBadge value={r.status} /></td>
            <td className="mono text-[11px]">{r.kind === "EVALUATION" ? `P ${pct(r.metrics?.overall?.precision)} · R ${pct(r.metrics?.overall?.recall)}` : r.kind === "VALIDATION" ? `${r.summary?.integrity?.total ?? "?"} integrity issues · ${r.summary?.findings?.total ?? "?"} findings` : r.summary?.identical == null ? "" : r.summary.identical ? "identical" : "different"}</td><td className="text-destructive">{r.error ?? ""}</td></tr>)}
        </tbody></table></div>
    </div>
  );
}
