import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Factory } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { DataTable } from "@/components/DataTable";
import { FormDialog } from "@/components/FormDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtTs, useSettings } from "@/lib/data";
import { LINE_OPTIONS, looseSearch } from "@/lib/lookups";
import { useAction } from "@/lib/session";
import type { UseEvaluation } from "@/rules/compliance";

export const Route = createFileRoute("/production-use")({
  validateSearch: looseSearch,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Production Use — Calibra" }, { name: "description", content: "Gate production use on calibration validity, certificates and extensions." }, { property: "og:title", content: "Production Use — Calibra" }, { property: "og:description", content: "Production-use compliance decisions." }] }),
  component: ProductionUse,
});

function ProductionUse() {
  const search = Route.useSearch();
  const act = useAction();
  const sim = useSettings().data?.simDate ?? "2026-10-28";
  const [tab, setTab] = useState<"uses" | "attempts">(search.tab === "attempts" ? "attempts" : "uses");
  const [last, setLast] = useState<{ attempt_id: string; use_id: string | null; evaluation: UseEvaluation } | null>(null);
  const openRef = useRef<() => void>(undefined);
  useEffect(() => { if (search.new) setTimeout(() => openRef.current?.(), 50); }, [search.new]);

  return (
    <div>
      <PageHeader title="Production use" subtitle="Recorded uses (things that happened) are kept separate from use requests evaluated by the gate. Blocked requests never create a use record."
        actions={<FormDialog title="Request production use" description="Evaluated at the requested time against lifecycle, latest calibration, due date, certificate and extensions." submitLabel="Evaluate & submit" fields={[
          { name: "asset_id", label: "Asset ID", required: true },
          { name: "requested_at", label: "Requested time", type: "datetime-local", required: true, default: `${sim}T08:00` },
          { name: "production_line", label: "Line", type: "select", options: LINE_OPTIONS, required: true, default: "LINE-A" },
          { name: "operation_id", label: "Operation ID" },
        ]} onSubmit={async (v) => { const r = await act.run<{ attempt_id: string; use_id: string | null; evaluation: UseEvaluation }>("use.request", { ...v, asset_id: String(v.asset_id).trim().toUpperCase() }); if (r) setLast(r); return r; }}
          trigger={(o) => { openRef.current = o; return <button className="btn-primary" disabled={!act.can("use.request")} onClick={o}><Factory className="h-4 w-4" />New use request</button>; }} />} />

      {last && (
        <div className={`panel mb-4 border-l-4 p-4 ${last.evaluation.decision === "ALLOWED" ? "border-l-success" : last.evaluation.decision === "BLOCKED" ? "border-l-destructive" : "border-l-warning"}`}>
          <div className="flex items-center gap-2"><StatusBadge value={last.evaluation.decision} /><span className="mono">{last.evaluation.rule_id} · {last.evaluation.reason_code}</span><button className="btn-ghost ml-auto h-7 px-2" onClick={() => setLast(null)}>Dismiss</button></div>
          <p className="mt-2 text-[13px]">{last.evaluation.explanation}</p>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[12px] md:grid-cols-4">
            {[["Request", last.attempt_id], ["Use record", last.use_id ?? "none (not used)"], ["Calibration", last.evaluation.calibration_id], ["Plan", last.evaluation.plan_id], ["Due date", last.evaluation.due_date], ["Certificate", last.evaluation.certificate_status], ["Extension", last.evaluation.exception_id], ["Extension note", last.evaluation.exception_note]].map(([k, v]) => <div key={k as string}><dt className="kicker">{k}</dt><dd className="mono">{v ?? "—"}</dd></div>)}
          </dl>
        </div>
      )}

      <div className="mb-2 flex gap-1">
        <button className={tab === "uses" ? "btn-primary" : "btn-outline"} onClick={() => setTab("uses")}>Recorded uses</button>
        <button className={tab === "attempts" ? "btn-primary" : "btn-outline"} onClick={() => setTab("attempts")}>Use requests (gate decisions)</button>
      </div>
      {tab === "uses" ? (
        <DataTable table="production_use" initial={search} defaultSort={{ key: "used_at", asc: false }} searchCols={["use_id", "asset_id", "operation_id"]}
          filters={[{ key: "decision", label: "Decision", options: ["ALLOWED", "FLAGGED_FOR_REVIEW"] }, { key: "production_line", label: "Line", options: LINE_OPTIONS }, { key: "from", label: "From", type: "dateFrom", column: "used_at" }, { key: "to", label: "To", type: "dateTo", column: "used_at" }]}
          columns={[
            { key: "use_id", label: "Use ID", render: (r) => <span className="mono">{r.use_id}</span> },
            { key: "asset_id", label: "Asset", render: (r) => <Link to="/assets/$assetId" params={{ assetId: r.asset_id }} className="mono text-primary">{r.asset_id}</Link> },
            { key: "used_at", label: "Used at", render: (r) => <span className="mono">{fmtTs(r.used_at)}</span> },
            { key: "production_line", label: "Line" },
            { key: "operation_id", label: "Operation" },
            { key: "decision", label: "Decision", render: (r) => <StatusBadge value={r.decision} /> },
            { key: "reason_code", label: "Reason", render: (r) => <span className="mono text-[11px]">{r.reason_code ?? "—"}</span> },
            { key: "calibration_id", label: "Calibration", render: (r) => <span className="mono text-[11px]">{r.calibration_id ?? "—"}</span> },
            { key: "exception_id", label: "Extension" },
          ]} />
      ) : (
        <DataTable table="use_attempts" defaultSort={{ key: "created_at", asc: false }} searchCols={["attempt_id", "asset_id"]}
          filters={[{ key: "decision", label: "Decision", options: ["ALLOWED", "BLOCKED", "FLAGGED_FOR_REVIEW"] }, { key: "production_line", label: "Line", options: LINE_OPTIONS }]}
          columns={[
            { key: "attempt_id", label: "Request", render: (r) => <span className="mono">{r.attempt_id}</span> },
            { key: "asset_id", label: "Asset", render: (r) => <Link to="/assets/$assetId" params={{ assetId: r.asset_id }} className="mono text-primary">{r.asset_id}</Link> },
            { key: "requested_at", label: "Requested", render: (r) => <span className="mono">{fmtTs(r.requested_at)}</span> },
            { key: "production_line", label: "Line" },
            { key: "decision", label: "Decision", render: (r) => <StatusBadge value={r.decision} /> },
            { key: "rule_id", label: "Rule", render: (r) => <span className="mono text-[11px]">{r.rule_id}</span> },
            { key: "explanation", label: "Explanation", render: (r) => <span className="text-[12px]">{r.explanation}</span> },
            { key: "resulting_use_id", label: "Use record" },
            { key: "actor", label: "Actor" },
          ]} />
      )}
    </div>
  );
}
