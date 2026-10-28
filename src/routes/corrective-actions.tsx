import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/AppShell";
import { DataTable } from "@/components/DataTable";
import { FormDialog } from "@/components/FormDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate, fmtTs, rows, allRows, type Row } from "@/lib/data";
import { looseSearch } from "@/lib/lookups";
import { canTransition } from "@/rules/lifecycle";
import { useAction } from "@/lib/session";

export const Route = createFileRoute("/corrective-actions")({
  validateSearch: looseSearch,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Corrective Actions — Calibra" }, { name: "description", content: "Corrective actions and impact assessments for failed calibrations." }, { property: "og:title", content: "Corrective Actions — Calibra" }, { property: "og:description", content: "Corrective workflow." }] }),
  component: Page,
});

function Page() {
  const search = Route.useSearch();
  const act = useAction();
  const [tab, setTab] = useState<"ca" | "ia">(search.tab === "ia" ? "ia" : "ca");
  const [affected, setAffected] = useState<Row | null>(null);
  return (
    <div>
      <PageHeader title="Corrective actions & impact assessments" subtitle="Failed calibrations open a corrective action and a required impact assessment. Completion needs root cause, resolution and approval by someone other than the assignee." />
      <div className="mb-2 flex gap-1">
        <button className={tab === "ca" ? "btn-primary" : "btn-outline"} onClick={() => setTab("ca")}>Corrective actions</button>
        <button className={tab === "ia" ? "btn-primary" : "btn-outline"} onClick={() => setTab("ia")}>Impact assessments</button>
      </div>
      {tab === "ca" ? (
        <DataTable table="corrective_actions" initial={search} defaultSort={{ key: "created_at", asc: false }} searchCols={["corrective_action_id", "asset_id", "calibration_id", "assigned_to"]}
          filters={[{ key: "status", label: "Status", options: ["OPEN", "IN_PROGRESS", "PENDING_APPROVAL", "COMPLETED", "CANCELLED"] }, { key: "priority", label: "Priority", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] }]}
          columns={[
            { key: "corrective_action_id", label: "CA", render: (r) => <span className="mono">{r.corrective_action_id}</span> },
            { key: "asset_id", label: "Asset", render: (r) => <Link to="/assets/$assetId" params={{ assetId: r.asset_id }} className="mono text-primary">{r.asset_id}</Link> },
            { key: "calibration_id", label: "Failed calibration", render: (r) => <span className="mono text-[11px]">{r.calibration_id}</span> },
            { key: "priority", label: "Priority", render: (r) => <StatusBadge value={r.priority} /> },
            { key: "assigned_to", label: "Assignee" },
            { key: "due_at", label: "Due", render: (r) => fmtDate(r.due_at) },
            { key: "root_cause", label: "Root cause" },
            { key: "approved_by", label: "Approved by" },
            { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
          ]}
          actions={(r) => <>
            {!["COMPLETED", "CANCELLED"].includes(r.status) && <FormDialog title={`Update ${r.corrective_action_id}`} fields={[{ name: "assigned_to", label: "Assignee", default: r.assigned_to ?? "" }, { name: "priority", label: "Priority", type: "select", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: r.priority }, { name: "due_at", label: "Due", type: "datetime-local", default: r.due_at?.slice(0, 16) }, { name: "root_cause", label: "Root cause", type: "textarea", default: r.root_cause ?? "" }, { name: "resolution_notes", label: "Resolution / investigation notes", type: "textarea", default: r.resolution_notes ?? "" }]} onSubmit={(v) => act.run("ca.update", { id: r.corrective_action_id, ...v }, "Saved")} trigger={(o) => <button className="btn-outline h-7 px-2" disabled={!act.can("ca.update")} onClick={o}>Edit</button>} />}
            {canTransition("corrective_action", r.status, "IN_PROGRESS") && <button className="btn-outline h-7 px-2" disabled={!act.can("ca.transition")} onClick={() => act.run("ca.transition", { id: r.corrective_action_id, to: "IN_PROGRESS" }, "In progress")}>Start</button>}
            {canTransition("corrective_action", r.status, "PENDING_APPROVAL") && <button className="btn-outline h-7 px-2" disabled={!act.can("ca.transition")} onClick={() => act.run("ca.transition", { id: r.corrective_action_id, to: "PENDING_APPROVAL" }, "Submitted for approval")}>Submit</button>}
            {r.status === "PENDING_APPROVAL" && <button className="btn-primary h-7 px-2" disabled={!act.can("ca.transition")} onClick={() => act.run("ca.transition", { id: r.corrective_action_id, to: "COMPLETED" }, "Approved & completed")}>Approve</button>}
          </>} />
      ) : (
        <DataTable table="impact_assessments" defaultSort={{ key: "created_at", asc: false }} searchCols={["assessment_id", "asset_id", "calibration_id"]}
          filters={[{ key: "status", label: "Status", options: ["REQUIRED", "IN_PROGRESS", "COMPLETED"] }]}
          columns={[
            { key: "assessment_id", label: "Assessment", render: (r) => <span className="mono">{r.assessment_id}</span> },
            { key: "asset_id", label: "Asset", render: (r) => <Link to="/assets/$assetId" params={{ assetId: r.asset_id }} className="mono text-primary">{r.asset_id}</Link> },
            { key: "calibration_id", label: "Failed calibration", render: (r) => <span className="mono text-[11px]">{r.calibration_id}</span> },
            { key: "assessment_start", label: "Window", render: (r) => <span className="mono text-[11px]">{fmtDate(r.assessment_start)} → {fmtDate(r.assessment_end)}</span> },
            { key: "affected_use_count", label: "Affected uses", render: (r) => <button className="text-primary underline" onClick={() => setAffected(r)}>{r.affected_use_count}</button> },
            { key: "conclusion", label: "Conclusion" },
            { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
          ]}
          actions={(r) => <>
            {r.status === "REQUIRED" && <button className="btn-outline h-7 px-2" disabled={!act.can("ia.transition")} onClick={() => act.run("ia.transition", { id: r.assessment_id, to: "IN_PROGRESS" }, "Assessment started")}>Start</button>}
            {r.status === "IN_PROGRESS" && <FormDialog title={`Complete ${r.assessment_id}`} fields={[{ name: "findings", label: "Findings", type: "textarea", required: true, default: r.findings ?? "" }, { name: "conclusion", label: "Conclusion", type: "textarea", required: true }]} onSubmit={(v) => act.run("ia.transition", { id: r.assessment_id, to: "COMPLETED", ...v }, "Assessment completed")} trigger={(o) => <button className="btn-primary h-7 px-2" disabled={!act.can("ia.transition")} onClick={o}>Complete</button>} />}
          </>} />
      )}
      <AffectedDialog ia={affected} onClose={() => setAffected(null)} />
    </div>
  );
}

function AffectedDialog({ ia, onClose }: { ia: Row | null; onClose: () => void }) {
  const q = useQuery({ queryKey: ["affected", ia?.assessment_id], enabled: !!ia, queryFn: () => { if (!ia) throw new Error("Assessment required"); return allRows("production_use", (x) => { let q = x.eq("asset_id", ia.asset_id).gte("used_at", ia.assessment_start); return ia.assessment_end.includes("T00:00:00") ? q.lt("used_at", ia.assessment_end) : q.lte("used_at", ia.assessment_end); }, "*", "used_at"); } });
  return (
    <Dialog open={!!ia} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Potentially affected production uses</DialogTitle></DialogHeader>
        {q.isLoading && <div>Loading affected uses…</div>}
        {q.isError && <div className="text-destructive">{q.error.message}</div>}
        <div className="max-h-96 overflow-y-auto"><table className="tbl"><thead><tr><th>Use</th><th>When</th><th>Line</th><th>Operation</th></tr></thead><tbody>
          {q.data?.map((u) => <tr key={u.use_id}><td className="mono">{u.use_id}</td><td>{fmtTs(u.used_at)}</td><td>{u.production_line}</td><td>{u.operation_id}</td></tr>)}
          {q.data?.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted-foreground">No uses in the window.</td></tr>}
        </tbody></table></div>
      </DialogContent>
    </Dialog>
  );
}
