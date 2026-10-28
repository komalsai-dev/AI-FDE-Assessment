import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { DataTable } from "@/components/DataTable";
import { FormDialog, ReasonButton } from "@/components/FormDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate, useSettings } from "@/lib/data";
import { looseSearch } from "@/lib/lookups";
import { canTransition } from "@/rules/lifecycle";
import { useAction } from "@/lib/session";

export const Route = createFileRoute("/work-orders")({
  validateSearch: looseSearch,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Work Orders — Calibra" }, { name: "description", content: "Calibration, maintenance and corrective work with downtime tracking." }, { property: "og:title", content: "Work Orders — Calibra" }, { property: "og:description", content: "Work orders and downtime." }] }),
  component: WorkOrders,
});

function WorkOrders() {
  const search = Route.useSearch();
  const act = useAction();
  const sim = useSettings().data?.simDate ?? "";
  const base = search.overdue ? (q: any) => q.in("status", ["OPEN", "IN_PROGRESS", "BLOCKED"]).lt("due_at", sim) : undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  return (
    <div>
      <PageHeader title="Work orders" subtitle="Completing a work order never restores calibration validity — a new successful calibration is required."
        actions={<>
          <Link to="/work-orders" search={search.overdue ? {} : { overdue: "1" }} className={search.overdue ? "btn-primary" : "btn-outline"}>Overdue only</Link>
          <FormDialog title="Create work order" fields={[
            { name: "asset_id", label: "Asset ID", required: true },
            { name: "work_order_type", label: "Type", type: "select", options: ["CALIBRATION", "MAINTENANCE", "CORRECTIVE", "INSPECTION"], required: true },
            { name: "priority", label: "Priority", type: "select", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], required: true, default: "MEDIUM" },
            { name: "due_at", label: "Due", type: "datetime-local", required: true },
            { name: "assigned_to", label: "Assign to" },
            { name: "calibration_id", label: "Linked calibration ID (optional)" },
          ]} onSubmit={(v) => act.run("wo.create", { ...v, asset_id: String(v.asset_id).trim().toUpperCase() }, "Work order created")}
            trigger={(o) => <button className="btn-primary" disabled={!act.can("wo.create")} onClick={o}><Plus className="h-4 w-4" />New work order</button>} />
        </>} />
      <DataTable key={search.overdue ?? "all"} table="work_orders" initial={search} baseFilter={base} filterKey={sim} defaultSort={{ key: "due_at", asc: false }} searchCols={["work_order_id", "asset_id", "assigned_to"]}
        filters={[{ key: "status", label: "Status", options: ["OPEN", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"] }, { key: "priority", label: "Priority", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"] }, { key: "work_order_type", label: "Type", options: ["CALIBRATION", "MAINTENANCE", "CORRECTIVE", "INSPECTION"] }]}
        columns={[
          { key: "work_order_id", label: "WO", render: (r) => <span className="mono">{r.work_order_id}</span> },
          { key: "asset_id", label: "Asset", render: (r) => <Link to="/assets/$assetId" params={{ assetId: r.asset_id }} className="mono text-primary">{r.asset_id}</Link> },
          { key: "calibration_id", label: "Calibration", render: (r) => <span className="mono text-[11px]">{r.calibration_id ?? "—"}</span> },
          { key: "work_order_type", label: "Type" },
          { key: "priority", label: "Priority", render: (r) => <StatusBadge value={r.priority} /> },
          { key: "assigned_to", label: "Owner" },
          { key: "due_at", label: "Due", render: (r) => <span className={["OPEN", "IN_PROGRESS", "BLOCKED"].includes(r.status) && r.due_at < sim ? "font-semibold text-destructive" : ""}>{fmtDate(r.due_at)}</span> },
          { key: "downtime_hours", label: "Downtime h" },
          { key: "status", label: "Status", render: (r) => <StatusBadge value={r.status} /> },
        ]}
        actions={(r) => <>
          {canTransition("work_order", r.status, "IN_PROGRESS") && <button className="btn-outline h-7 px-2" disabled={!act.can("wo.transition")} onClick={() => act.run("wo.transition", { work_order_id: r.work_order_id, to: "IN_PROGRESS" }, "Work started")}>Start</button>}
          {canTransition("work_order", r.status, "BLOCKED") && <button className="btn-outline h-7 px-2" disabled={!act.can("wo.transition")} onClick={() => act.run("wo.transition", { work_order_id: r.work_order_id, to: "BLOCKED" }, "Marked blocked")}>Block</button>}
          {canTransition("work_order", r.status, "COMPLETED") && <button className="btn-primary h-7 px-2" disabled={!act.can("wo.transition")} onClick={() => act.run("wo.transition", { work_order_id: r.work_order_id, to: "COMPLETED" }, "Completed (calibration validity unchanged)")}>Complete</button>}
          {!["COMPLETED", "CANCELLED"].includes(r.status) && <FormDialog title={`Edit ${r.work_order_id}`} fields={[{ name: "assigned_to", label: "Owner", default: r.assigned_to ?? "" }, { name: "priority", label: "Priority", type: "select", options: ["LOW", "MEDIUM", "HIGH", "CRITICAL"], default: r.priority }, { name: "due_at", label: "Due", type: "datetime-local", default: r.due_at?.slice(0, 16) }]} onSubmit={(v) => act.run("wo.update", { work_order_id: r.work_order_id, ...v }, "Updated")} trigger={(o) => <button className="btn-outline h-7 px-2" disabled={!act.can("wo.update")} onClick={o}>Edit</button>} />}
          <FormDialog title={`Record downtime · ${r.work_order_id}`} description="Duration is calculated from start and end." fields={[{ name: "start_at", label: "Start", type: "datetime-local", required: true }, { name: "end_at", label: "End", type: "datetime-local", required: true }, { name: "reason", label: "Reason", required: true }]} onSubmit={(v) => act.run("wo.downtime", { work_order_id: r.work_order_id, ...v }, "Downtime recorded")} trigger={(o) => <button className="btn-outline h-7 px-2" disabled={!act.can("wo.downtime")} onClick={o}>Downtime</button>} />
          {canTransition("work_order", r.status, "CANCELLED") && <ReasonButton label="Cancel" title="Cancel work order" danger disabled={!act.can("wo.transition")} onConfirm={(reason) => act.run("wo.transition", { work_order_id: r.work_order_id, to: "CANCELLED", reason }, "Cancelled")} />}
        </>}
      />
    </div>
  );
}
