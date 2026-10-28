import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { CalendarPlus } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { DataTable } from "@/components/DataTable";
import { FormDialog, ReasonButton } from "@/components/FormDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate, useSettings } from "@/lib/data";
import { looseSearch, useLookups } from "@/lib/lookups";
import { useAction } from "@/lib/session";

export const Route = createFileRoute("/calibration")({
  validateSearch: looseSearch,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Calibration Planner — Calibra" }, { name: "description", content: "Schedule, run and record calibrations with tolerance-based pass/fail." }, { property: "og:title", content: "Calibration Planner — Calibra" }, { property: "og:description", content: "Schedule, run and record calibrations." }] }),
  component: Planner,
});

function Planner() {
  const search = Route.useSearch();
  const act = useAction();
  const lk = useLookups();
  const sim = useSettings().data?.simDate ?? "";
  const openRef = useRef<() => void>(undefined);
  useEffect(() => { if (search.new) setTimeout(() => openRef.current?.(), 50); }, [search.new]);
  const view = search.view;
  const base = view === "overdue" ? (q: any) => q.in("event_status", ["SCHEDULED", "IN_PROGRESS"]).lt("scheduled_date", sim) : view === "upcoming" ? (q: any) => q.eq("event_status", "SCHEDULED").gte("scheduled_date", sim) : undefined; // eslint-disable-line @typescript-eslint/no-explicit-any

  return (
    <div>
      <PageHeader title="Calibration planner" subtitle="Pass/fail is calculated as |measured − reference| ≤ tolerance captured from the plan version. Failures quarantine the asset and open corrective work."
        actions={<>
          {(["", "upcoming", "overdue"] as const).map((v) => <Link key={v} to="/calibration" search={v ? { view: v } : {}} className={view === v || (!view && !v) ? "btn-primary" : "btn-outline"}>{v ? v[0]!.toUpperCase() + v.slice(1) : "All"}</Link>)}
          <FormDialog title="Schedule calibration" submitLabel="Schedule" fields={[
            { name: "asset_id", label: "Asset ID", required: true, help: "e.g. AST-000001" },
            { name: "scheduled_date", label: "Scheduled date", type: "date", required: true, default: sim },
            { name: "supplier_id", label: "Calibration supplier", type: "select", options: lk.data?.supplierOptions ?? [], help: "Only suppliers approved on the scheduled date are accepted" },
            { name: "create_work_order", label: "Create linked work order", type: "checkbox", default: true },
            { name: "assigned_to", label: "Assign work order to" },
          ]} onSubmit={(v) => act.run("cal.schedule", { ...v, asset_id: String(v.asset_id).trim().toUpperCase() }, "Calibration scheduled")}
            trigger={(o) => { openRef.current = o; return <button className="btn-primary" disabled={!act.can("cal.schedule")} onClick={o}><CalendarPlus className="h-4 w-4" />Schedule</button>; }} />
        </>} />
      <DataTable key={view ?? "all"} table="calibration_events" initial={search} baseFilter={base} filterKey={sim} defaultSort={{ key: "scheduled_date", asc: false }} searchCols={["calibration_id", "asset_id"]}
        filters={[{ key: "supplier_id", label: "Supplier", options: lk.data?.suppliers.map((s) => s.supplier_id) ?? [] }, { key: "event_status", label: "Status", options: ["SCHEDULED", "IN_PROGRESS", "COMPLETED", "FAILED", "CANCELLED"] }, { key: "result", label: "Result", options: ["PASS", "FAIL"] }, { key: "from", label: "From", type: "dateFrom", column: "scheduled_date" }, { key: "to", label: "To", type: "dateTo", column: "scheduled_date" }]}
        columns={[
          { key: "calibration_id", label: "Calibration", render: (r) => <span className="mono">{r.calibration_id}</span> },
          { key: "asset_id", label: "Asset", render: (r) => <Link to="/assets/$assetId" params={{ assetId: r.asset_id }} className="mono text-primary">{r.asset_id}</Link> },
          { key: "plan_id", label: "Plan", render: (r) => <span className="mono">{r.plan_id}</span> },
          { key: "supplier_id", label: "Supplier" },
          { key: "scheduled_date", label: "Scheduled", render: (r) => fmtDate(r.scheduled_date) },
          { key: "calibration_date", label: "Calibrated", render: (r) => fmtDate(r.calibration_date) },
          { key: "measured_value", label: "Meas / Ref ± tol", render: (r) => <span className="mono">{r.measured_value ?? "—"} / {r.reference_value ?? "—"} ±{r.tolerance_used}</span> },
          { key: "next_due_date", label: "Due", render: (r) => fmtDate(r.next_due_date) },
          { key: "event_status", label: "Status", render: (r) => <StatusBadge value={r.event_status} /> },
        ]}
        actions={(r) => <>
          {r.event_status === "SCHEDULED" && <>
            <button className="btn-outline h-7 px-2" disabled={!act.can("cal.start")} onClick={() => act.run("cal.start", { calibration_id: r.calibration_id }, "Calibration started")}>Start</button>
            <FormDialog title={`Reschedule ${r.calibration_id}`} fields={[{ name: "scheduled_date", label: "New date", type: "date", required: true, default: r.scheduled_date }, { name: "reason", label: "Reason", type: "textarea", required: true }]} onSubmit={(v) => act.run("cal.reschedule", { calibration_id: r.calibration_id, ...v }, "Rescheduled")} trigger={(o) => <button className="btn-outline h-7 px-2" disabled={!act.can("cal.reschedule")} onClick={o}>Reschedule</button>} />
          </>}
          {(r.event_status === "SCHEDULED" || r.event_status === "IN_PROGRESS") && <FormDialog title="Assign supplier" fields={[{ name: "supplier_id", label: "Supplier", type: "select", options: lk.data?.supplierOptions ?? [], required: true, default: r.supplier_id ?? "" }]} onSubmit={(v) => act.run("cal.assignSupplier", { calibration_id: r.calibration_id, ...v }, "Supplier assigned")} trigger={(o) => <button className="btn-outline h-7 px-2" disabled={!act.can("cal.assignSupplier")} onClick={o}>Supplier</button>} />}
          {r.event_status === "IN_PROGRESS" && <FormDialog title={`Record result · ${r.calibration_id}`} description={`Tolerance ±${r.tolerance_used} (from ${r.plan_id}). Interval ${r.interval_days_used} days.`} submitLabel="Complete" fields={[
            { name: "calibration_date", label: "Calibration date", type: "date", required: true, default: sim },
            { name: "reference_value", label: "Reference value", type: "number", required: true },
            { name: "measured_value", label: "Measured value", type: "number", required: true },
            { name: "issue_certificate", label: "Issue certificate metadata if passed", type: "checkbox", default: true },
            { name: "document_reference", label: "Document reference (synthetic)" },
          ]} onSubmit={async (v) => { const res = await act.run<{ result: string; next_due_date: string; affected_use_count?: number }>("cal.complete", { calibration_id: r.calibration_id, ...v }); if (res) { const { toast } = await import("sonner"); res.result === "PASS" ? toast.success(`PASS — next due ${res.next_due_date}`) : toast.error(`FAIL — asset quarantined; corrective action and impact assessment created (${res.affected_use_count} potentially affected uses)`); } return res; }}
            trigger={(o) => <button className="btn-primary h-7 px-2" disabled={!act.can("cal.complete")} onClick={o}>Complete</button>} />}
          {(r.event_status === "SCHEDULED" || r.event_status === "IN_PROGRESS") && <ReasonButton label="Cancel" title="Cancel calibration" danger disabled={!act.can("cal.cancel")} onConfirm={(reason) => act.run("cal.cancel", { calibration_id: r.calibration_id, reason }, "Cancelled")} />}
          {r.event_status === "COMPLETED" && <Link to="/certificates" search={{ q: r.calibration_id }} className="btn-ghost h-7 px-2 text-primary">Certificate</Link>}
          <Link to="/audit" search={{ q: r.calibration_id }} className="btn-ghost h-7 px-2 text-primary">History</Link>
        </>}
      />
    </div>
  );
}
