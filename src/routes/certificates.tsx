import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { DataTable } from "@/components/DataTable";
import { FormDialog, ReasonButton } from "@/components/FormDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { fmtDate, useSettings } from "@/lib/data";
import { looseSearch } from "@/lib/lookups";
import { useAction } from "@/lib/session";

export const Route = createFileRoute("/certificates")({
  validateSearch: looseSearch,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Certificates — Calibra" }, { name: "description", content: "Calibration certificate metadata, ownership checks and coverage issues." }, { property: "og:title", content: "Certificates — Calibra" }, { property: "og:description", content: "Certificate reconciliation." }] }),
  component: Certificates,
});

function Certificates() {
  const search = Route.useSearch();
  const act = useAction();
  const sim = useSettings().data?.simDate;
  return (
    <div>
      <PageHeader title="Certificates" subtitle="Synthetic certificate metadata only — not authentic accreditation documents. Missing, expired and mismatched certificates are separate issue types."
        actions={<>
          <Link to="/alerts" search={{ issue_type: "CERTIFICATE_MISSING" }} className="btn-outline">Missing</Link>
          <Link to="/alerts" search={{ issue_type: "CERTIFICATE_EXPIRED" }} className="btn-outline">Expired</Link>
          <Link to="/alerts" search={{ issue_type: "CERTIFICATE_ASSET_MISMATCH" }} className="btn-outline">Mismatched</Link>
          <FormDialog title="Add certificate metadata" description="The asset must match the calibration event's asset." fields={[
            { name: "calibration_id", label: "Calibration ID", required: true },
            { name: "asset_id", label: "Asset ID", help: "Leave blank to use the event's asset" },
            { name: "issue_date", label: "Issue date", type: "date", required: true, default: sim },
            { name: "expiry_date", label: "Expiry date", type: "date", help: "Defaults to the calibration due date" },
            { name: "document_reference", label: "Document reference" },
          ]} onSubmit={(v) => act.run("cert.create", { ...v, calibration_id: String(v.calibration_id).trim(), asset_id: v.asset_id ? String(v.asset_id).trim().toUpperCase() : "" }, "Certificate linked")}
            trigger={(o) => <button className="btn-primary" disabled={!act.can("cert.create")} onClick={o}><Plus className="h-4 w-4" />New certificate</button>} />
        </>} />
      <DataTable table="certificates" initial={search} defaultSort={{ key: "issue_date", asc: false }} searchCols={["certificate_id", "calibration_id", "asset_id"]}
        filters={[{ key: "certificate_status", label: "Status", options: ["VALID", "EXPIRED", "REVOKED", "INVALID"] }, { key: "from", label: "Issued ≥", type: "dateFrom", column: "issue_date" }]}
        columns={[
          { key: "certificate_id", label: "Certificate", render: (r) => <span className="mono">{r.certificate_id}</span> },
          { key: "asset_id", label: "Cert. asset", render: (r) => <Link to="/assets/$assetId" params={{ assetId: r.asset_id }} className="mono text-primary">{r.asset_id}</Link> },
          { key: "calibration_id", label: "Calibration", render: (r) => <span className="mono">{r.calibration_id}</span> },
          { key: "ownership", label: "Ownership", sortable: false, render: (r) => r.calibration_id.slice(4, 14) === r.asset_id ? <span className="badge-ok">MATCH</span> : <span className="badge-bad">MISMATCH · event {r.calibration_id.slice(4, 14)}</span> },
          { key: "issue_date", label: "Issued", render: (r) => fmtDate(r.issue_date) },
          { key: "expiry_date", label: "Expires", render: (r) => fmtDate(r.expiry_date) },
          { key: "certificate_status", label: "Status", render: (r) => <StatusBadge value={r.certificate_status} /> },
          { key: "document_reference", label: "Document" },
        ]}
        actions={(r) => <>
          <Link to="/alerts" search={{ q: r.certificate_id }} className="btn-ghost h-7 px-2 text-primary">Alerts</Link>
          {r.certificate_status !== "REVOKED" && <ReasonButton label="Revoke" title="Revoke certificate" danger disabled={!act.can("cert.revoke")} onConfirm={(reason) => act.run("cert.revoke", { certificate_id: r.certificate_id, reason }, "Certificate revoked")} />}
        </>}
      />
    </div>
  );
}
