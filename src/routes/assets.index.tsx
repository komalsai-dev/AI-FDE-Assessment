import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { DataTable } from "@/components/DataTable";
import { FormDialog, ReasonButton } from "@/components/FormDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate } from "@/lib/data";
import { LOCATION_OPTIONS, looseSearch, useLookups } from "@/lib/lookups";
import { useAction } from "@/lib/session";

export const Route = createFileRoute("/assets/")({
  validateSearch: looseSearch,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Assets — Calibra" }, { name: "description", content: "Registered instruments with calculated calibration status." }, { property: "og:title", content: "Assets — Calibra" }, { property: "og:description", content: "Registered instruments with calculated calibration status." }] }),
  component: Assets,
});

function Assets() {
  const search = Route.useSearch();
  const nav = useNavigate();
  const lk = useLookups();
  const act = useAction();
  return (
    <div>
      <PageHeader title="Assets" subtitle="Status is calculated from the latest successful calibration and the plan interval used."
        actions={
          <FormDialog title="Register asset" submitLabel="Create asset" fields={[
            { name: "asset_name", label: "Asset name", required: true },
            { name: "instrument_type_id", label: "Instrument type", type: "select", options: lk.data?.typeOptions ?? [], required: true },
            { name: "location", label: "Location", type: "select", options: LOCATION_OPTIONS, required: true },
            { name: "supplier_id", label: "Supplier", type: "select", options: lk.data?.supplierOptions ?? [] },
            { name: "serial_number", label: "Serial number", help: "Must be unique when provided" },
          ]} onSubmit={async (v) => { const r = await act.run<{ id: string }>("asset.create", v, "Asset created"); if (r) nav({ to: "/assets/$assetId", params: { assetId: r.id } }); return r; }}
            trigger={(open) => <button className="btn-primary" disabled={!act.can("asset.create")} title={act.can("asset.create") ? "" : "Your role cannot create assets"} onClick={open}><Plus className="h-4 w-4" />New asset</button>} />
        } />
      <DataTable filterKey={search.eligible} baseFilter={search.eligible ? (q) => q.in("calc_status", ["VALID", "DUE_SOON"]) : undefined} table="v_asset_status" exportName="assets" initial={search} defaultSort={{ key: "asset_id", asc: true }} searchCols={["asset_id", "asset_name", "serial_number"]}
        onRowClick={(r) => nav({ to: "/assets/$assetId", params: { assetId: r.asset_id } })}
        filters={[
          { key: "instrument_type_id", label: "Type", options: lk.data?.typeOptions ?? [] },
          { key: "location", label: "Location", options: LOCATION_OPTIONS },
          { key: "lifecycle_status", label: "Lifecycle", options: ["ACTIVE", "QUARANTINED", "RETIRED"] },
          { key: "calc_status", label: "Status", options: ["VALID", "DUE_SOON", "OVERDUE", "FAILED", "QUARANTINED", "RETIRED", "NO_CALIBRATION"] },
          { key: "due_from", label: "Due ≥", type: "dateFrom", column: "expected_due_date" },
          { key: "due_to", label: "Due ≤", type: "dateTo", column: "expected_due_date" },
        ]}
        columns={[
          { key: "asset_id", label: "Asset ID", render: (r) => <Link to="/assets/$assetId" params={{ assetId: r.asset_id }} className="mono text-primary" onClick={(e) => e.stopPropagation()}>{r.asset_id}</Link> },
          { key: "asset_name", label: "Name" },
          { key: "type_name", label: "Type" },
          { key: "location", label: "Location" },
          { key: "last_pass_date", label: "Last eligible cal.", render: (r) => <span className="mono">{fmtDate(r.last_pass_date)}</span> },
          { key: "expected_due_date", label: "Next due", render: (r) => <span className="mono">{fmtDate(r.expected_due_date)}</span> },
          { key: "days_past_due", label: "Days overdue", render: (r) => (r.days_past_due >= 0 ? <span className="font-semibold text-destructive">{r.days_past_due}</span> : "—") },
          { key: "lifecycle_status", label: "Lifecycle", render: (r) => <StatusBadge value={r.lifecycle_status} /> },
          { key: "calc_status", label: "Status", render: (r) => <StatusBadge value={r.calc_status} /> },
        ]}
        actions={(r) => r.lifecycle_status !== "RETIRED" ? <ReasonButton label="Retire" title={`Retire ${r.asset_id}`} danger disabled={!act.can("asset.retire")} disabledReason="Quality Engineer or Admin only" onConfirm={(reason) => act.run("asset.retire", { asset_id: r.asset_id, reason }, "Asset retired; history retained")} /> : null}
      />
    </div>
  );
}
