import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { DataTable } from "@/components/DataTable";
import { FormDialog, ReasonButton } from "@/components/FormDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fmtTs, rows, type Row } from "@/lib/data";
import { LINE_OPTIONS, looseSearch } from "@/lib/lookups";
import { canTransition } from "@/rules/lifecycle";
import { ISSUE_TYPES } from "@/rules/types";
import { useAction } from "@/lib/session";

export const Route = createFileRoute("/alerts")({
  validateSearch: looseSearch,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Exceptions & Alerts — Calibra" }, { name: "description", content: "Investigate rule violations and manage emergency extensions." }, { property: "og:title", content: "Exceptions & Alerts — Calibra" }, { property: "og:description", content: "Alerts and extensions." }] }),
  component: Alerts,
});

function Alerts() {
  const search = Route.useSearch();
  const act = useAction();
  const [tab, setTab] = useState<"alerts" | "extensions">(search.tab === "extensions" ? "extensions" : "alerts");
  const [open, setOpen] = useState<Row | null>(null);
  return (
    <div>
      <PageHeader title="Exceptions & alerts" subtitle="Resolving an alert never changes instrument eligibility or erases the finding. Resolution requires the underlying conditions to be met." />
      <div className="mb-2 flex gap-1">
        <button className={tab === "alerts" ? "btn-primary" : "btn-outline"} onClick={() => setTab("alerts")}>Alerts</button>
        <button className={tab === "extensions" ? "btn-primary" : "btn-outline"} onClick={() => setTab("extensions")}>Emergency extensions</button>
      </div>
      {tab === "alerts" ? (
        <DataTable filterKey={search.unresolved} baseFilter={search.unresolved ? (q) => q.neq("status", "RESOLVED") : undefined} table="alerts" initial={search} defaultSort={{ key: "created_at", asc: false }} searchCols={["alert_id", "asset_id", "related_entity_id", "explanation"]} onRowClick={setOpen}
          filters={[{ key: "issue_type", label: "Issue", options: ISSUE_TYPES }, { key: "severity", label: "Severity", options: ["CRITICAL", "HIGH", "MEDIUM", "LOW"] }, { key: "status", label: "Status", options: ["OPEN", "ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"] }]}
          columns={[
            { key: "alert_id", label: "Alert", render: (r) => <span className="mono text-[11px]">{r.alert_id}</span> },
            { key: "issue_type", label: "Issue", render: (r) => <span className="mono text-[11px]">{r.issue_type}</span> },
            { key: "severity", label: "Severity", render: (r) => <StatusBadge value={r.severity} /> },
            { key: "asset_id", label: "Asset", render: (r) => (r.asset_id ? <Link to="/assets/$assetId" params={{ assetId: r.asset_id }} className="mono text-primary" onClick={(e) => e.stopPropagation()}>{r.asset_id}</Link> : "—") },
            { key: "related_entity_id", label: "Related record", render: (r) => <span className="mono text-[11px]">{r.related_entity_type}: {r.related_entity_id}</span> },
            { key: "assigned_to", label: "Assignee" },
            { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
          ]} />
      ) : <Extensions />}
      <AlertSheet alert={open} onClose={() => setOpen(null)} act={act} />
    </div>
  );
}

function AlertSheet({ alert, onClose, act }: { alert: Row | null; onClose: () => void; act: ReturnType<typeof useAction> }) {
  const q = useQuery({
    queryKey: ["alertDetail", alert?.alert_id],
    enabled: !!alert,
    queryFn: async () => {
      const [cur] = await rows("alerts", (x) => x.eq("alert_id", alert!.alert_id));
      const [notes, audit, ia, ca] = await Promise.all([
        rows("alert_notes", (x) => x.eq("alert_id", alert!.alert_id).order("created_at")),
        rows("audit_records", (x) => x.in("entity_id", [alert!.alert_id, alert!.related_entity_id]).order("timestamp", { ascending: false })),
        rows("impact_assessments", (x) => x.eq("calibration_id", alert!.related_entity_id)),
        rows("corrective_actions", (x) => x.eq("calibration_id", alert!.related_entity_id)),
      ]);
      return { cur, notes, audit, ia, ca };
    },
  });
  const a = q.data?.cur ?? alert;
  return (
    <Sheet open={!!alert} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        {q.isLoading && <div className="p-4">Loading investigation…</div>}
        {q.isError && <div className="p-4 text-destructive">{q.error.message}</div>}
        {a && <>
          <SheetHeader><SheetTitle className="mono text-[14px]">{a.alert_id}</SheetTitle></SheetHeader>
          <div className="space-y-4 px-4 pb-6 text-[13px]">
            <div className="flex flex-wrap gap-2"><StatusBadge value={a.severity} /><StatusBadge value={a.status} /><span className="mono">{a.issue_type} · {a.rule_id}</span></div>
            <p>{a.explanation}</p>
            <pre className="mono overflow-x-auto rounded bg-muted p-2">{JSON.stringify(a.details, null, 2)}</pre>
            <div className="flex flex-wrap gap-2">
              {(["ACKNOWLEDGED", "IN_PROGRESS", "RESOLVED"] as const).filter((t) => canTransition("alert", a.status, t)).map((t) => <button key={t} className={t === "RESOLVED" ? "btn-primary" : "btn-outline"} disabled={!act.can("alert.transition")} onClick={() => act.run("alert.transition", { alert_id: a.alert_id, to: t }, `Alert ${t.toLowerCase().replace("_", " ")}`)}>{t === "ACKNOWLEDGED" ? "Acknowledge" : t === "IN_PROGRESS" ? "Mark in progress" : "Resolve"}</button>)}
              {a.status === "RESOLVED" && <ReasonButton label="Reopen" title="Reopen alert" disabled={!act.can("alert.transition")} onConfirm={(reason) => act.run("alert.transition", { alert_id: a.alert_id, to: "OPEN", reason }, "Reopened")} />}
              <FormDialog title="Assign alert" fields={[{ name: "assigned_to", label: "Assignee", default: a.assigned_to ?? "" }]} onSubmit={(v) => act.run("alert.assign", { alert_id: a.alert_id, ...v }, "Assigned")} trigger={(o) => <button className="btn-outline" disabled={!act.can("alert.assign")} onClick={o}>Assign</button>} />
              {a.issue_type === "IMPACT_ASSESSMENT_MISSING" && !q.data?.ia.length && <button className="btn-outline" disabled={!act.can("ia.create")} onClick={() => act.run("ia.create", { calibration_id: a.related_entity_id }, "Impact assessment created")}>Create impact assessment</button>}
            </div>
            <section><div className="kicker mb-1">Related</div>
              <ul className="space-y-1">
                {a.asset_id && <li>Asset: <Link to="/assets/$assetId" params={{ assetId: a.asset_id }} className="mono text-primary">{a.asset_id}</Link></li>}
                <li>{a.related_entity_type}: <span className="mono">{a.related_entity_id}</span></li>
                {q.data?.ia.map((x) => <li key={x.assessment_id}>Impact assessment <span className="mono">{x.assessment_id}</span> <StatusBadge value={x.status} /></li>)}
                {q.data?.ca.map((x) => <li key={x.corrective_action_id}>Corrective action <span className="mono">{x.corrective_action_id}</span> <StatusBadge value={x.status} /></li>)}
                {(q.data?.ia.length || q.data?.ca.length) ? <li><Link to="/corrective-actions" className="text-primary">Open corrective actions →</Link></li> : null}
              </ul>
            </section>
            <section><div className="kicker mb-1">Investigation notes</div>
              {q.data?.notes.map((n) => <div key={n.note_id} className="mb-1 rounded border p-2"><div className="text-[11px] text-muted-foreground">{fmtTs(n.created_at)} · {n.actor}</div>{n.note}</div>)}
              <FormDialog title="Add investigation note" fields={[{ name: "note", label: "Note", type: "textarea", required: true }]} onSubmit={(v) => act.run("alert.note", { alert_id: a.alert_id, ...v }, "Note added")} trigger={(o) => <button className="btn-outline mt-1" disabled={!act.can("alert.note")} onClick={o}>Add note</button>} />
            </section>
            <section><div className="kicker mb-1">Audit</div>
              {q.data?.audit.map((x) => <div key={x.audit_id} className="text-[12px]"><span className="mono">{fmtTs(x.timestamp)}</span> {x.action} · {x.actor}{x.reason ? ` — ${x.reason}` : ""}</div>)}
            </section>
          </div>
        </>}
      </SheetContent>
    </Sheet>
  );
}

function Extensions() {
  const act = useAction();
  return (
    <DataTable table="exception_records" defaultSort={{ key: "created_at", asc: false }} searchCols={["exception_id", "asset_id"]}
      filters={[{ key: "approval_status", label: "Status", options: ["PENDING", "APPROVED", "REJECTED", "EXPIRED", "REVOKED"] }]}
      toolbar={<FormDialog title="Request emergency extension" description="Extensions never change the original due date; they authorize use separately within scope and validity." fields={[
        { name: "asset_id", label: "Asset ID", required: true },
        { name: "valid_from", label: "Valid from", type: "datetime-local", required: true },
        { name: "valid_until", label: "Valid until", type: "datetime-local", required: true },
        { name: "scope", label: "Scope", type: "select", options: ["ALL_LINES", ...LINE_OPTIONS], default: "ALL_LINES", required: true },
        { name: "reason", label: "Reason", type: "textarea", required: true },
      ]} onSubmit={(v) => act.run("exc.create", { ...v, asset_id: String(v.asset_id).trim().toUpperCase() }, "Extension requested (pending approval)")} trigger={(o) => <button className="btn-primary" disabled={!act.can("exc.create")} onClick={o}><Plus className="h-4 w-4" />Request</button>} />}
      columns={[
        { key: "exception_id", label: "Extension", render: (r) => <span className="mono">{r.exception_id}</span> },
        { key: "asset_id", label: "Asset", render: (r) => <Link to="/assets/$assetId" params={{ assetId: r.asset_id }} className="mono text-primary">{r.asset_id}</Link> },
        { key: "valid_from", label: "From", render: (r) => fmtTs(r.valid_from) },
        { key: "valid_until", label: "Until", render: (r) => fmtTs(r.valid_until) },
        { key: "scope", label: "Scope" },
        { key: "approved_by", label: "Approver" },
        { key: "reason", label: "Reason" },
        { key: "approval_status", label: "Status", render: (r) => <StatusBadge value={r.approval_status} /> },
      ]}
      actions={(r) => <>
        {r.approval_status === "PENDING" && <button className="btn-primary h-7 px-2" disabled={!act.can("exc.transition")} onClick={() => act.run("exc.transition", { exception_id: r.exception_id, to: "APPROVED" }, "Extension approved")}>Approve</button>}
        {r.approval_status === "PENDING" && <ReasonButton label="Reject" title="Reject extension" danger disabled={!act.can("exc.transition")} onConfirm={(reason) => act.run("exc.transition", { exception_id: r.exception_id, to: "REJECTED", reason }, "Rejected")} />}
        {r.approval_status === "APPROVED" && <ReasonButton label="Revoke" title="Revoke extension" danger disabled={!act.can("exc.transition")} onConfirm={(reason) => act.run("exc.transition", { exception_id: r.exception_id, to: "REVOKED", reason }, "Revoked")} />}
      </>} />
  );
}
