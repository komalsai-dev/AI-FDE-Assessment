import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { DataTable } from "@/components/DataTable";
import { FormDialog } from "@/components/FormDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { allRows, fmtDate } from "@/lib/data";
import { looseSearch } from "@/lib/lookups";
import { useAction } from "@/lib/session";

export const Route = createFileRoute("/suppliers")({
  validateSearch: looseSearch,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Suppliers — Calibra" }, { name: "description", content: "Calibration service providers and approval validity." }, { property: "og:title", content: "Suppliers — Calibra" }, { property: "og:description", content: "Supplier approval." }] }),
  component: Suppliers,
});

const STATUSES = ["APPROVED", "CONDITIONAL", "PENDING", "SUSPENDED", "REVOKED"];

function Suppliers() {
  const search = Route.useSearch();
  const act = useAction();
  const stats = useQuery({
    queryKey: ["supplierStats"],
    queryFn: async () => {
      const ev = await allRows("calibration_events", (q) => q.not("supplier_id", "is", null).in("event_status", ["COMPLETED", "FAILED"]), "supplier_id,event_status");
      const m: Record<string, { total: number; failed: number }> = {};
      for (const e of ev) { const s = (m[e.supplier_id] ??= { total: 0, failed: 0 }); s.total++; if (e.event_status === "FAILED") s.failed++; }
      return m;
    },
  });
  const fields = (r?: Record<string, string>) => [
    { name: "supplier_name", label: "Name", required: true, default: r?.supplier_name },
    { name: "approval_status", label: "Approval status", type: "select" as const, options: STATUSES, required: true, default: r?.approval_status },
    { name: "valid_from", label: "Approval valid from", type: "date" as const, default: r?.valid_from ?? "" },
    { name: "valid_to", label: "Approval valid to", type: "date" as const, default: r?.valid_to ?? "" },
  ];
  return (
    <div>
      <PageHeader title="Suppliers" subtitle="Only APPROVED or CONDITIONAL suppliers within their validity window can be assigned calibration work (checked on the server)."
        actions={<FormDialog title="Add supplier" fields={fields()} onSubmit={(v) => act.run("supplier.create", v, "Supplier created")} trigger={(o) => <button className="btn-primary" disabled={!act.can("supplier.create")} onClick={o}><Plus className="h-4 w-4" />New supplier</button>} />} />
      <DataTable table="suppliers" initial={search} defaultSort={{ key: "supplier_id", asc: true }} searchCols={["supplier_id", "supplier_name"]}
        filters={[{ key: "approval_status", label: "Approval", options: STATUSES }]}
        columns={[
          { key: "supplier_id", label: "ID", render: (r) => <span className="mono">{r.supplier_id}</span> },
          { key: "supplier_name", label: "Name" },
          { key: "approval_status", label: "Approval", render: (r) => <StatusBadge value={r.approval_status} /> },
          { key: "valid_from", label: "Valid from", render: (r) => fmtDate(r.valid_from) },
          { key: "valid_to", label: "Valid to", render: (r) => fmtDate(r.valid_to) },
          { key: "events", label: "Calibrations", sortable: false, render: (r) => <Link to="/calibration" search={{ supplier_id: r.supplier_id }} className="text-primary">{stats.data?.[r.supplier_id]?.total ?? 0}</Link> },
          { key: "failrate", label: "Fail rate", sortable: false, render: (r) => { const s = stats.data?.[r.supplier_id]; return s?.total ? `${((s.failed / s.total) * 100).toFixed(1)}%` : "n/a"; } },
        ]}
        actions={(r) => <FormDialog title={`Edit ${r.supplier_id}`} fields={[...fields(r), { name: "reason", label: "Reason", type: "textarea" }]} onSubmit={(v) => act.run("supplier.update", { supplier_id: r.supplier_id, ...v }, "Supplier updated")} trigger={(o) => <button className="btn-outline h-7 px-2" disabled={!act.can("supplier.update")} onClick={o}>Edit</button>} />} />
    </div>
  );
}
