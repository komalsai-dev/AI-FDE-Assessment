import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/AppShell";
import { DataTable } from "@/components/DataTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtTs, type Row } from "@/lib/data";
import { looseSearch } from "@/lib/lookups";

export const Route = createFileRoute("/audit")({
  validateSearch: looseSearch,
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Audit Log — Calibra" }, { name: "description", content: "Append-only audit history of every change." }, { property: "og:title", content: "Audit Log — Calibra" }, { property: "og:description", content: "Append-only audit history." }] }),
  component: Audit,
});

const ENTITIES = ["asset", "calibration_event", "certificate", "work_order", "use_attempt", "exception", "alert", "corrective_action", "impact_assessment", "supplier", "setting"];

function Audit() {
  const search = Route.useSearch();
  const [sel, setSel] = useState<Row | null>(null);
  const [tab, setTab] = useState<"audit" | "state">("audit");
  return (
    <div>
      <PageHeader title="Audit log" subtitle="Append-only: the database rejects updates and deletes of audit and state-history rows." />
      <div className="mb-2 flex gap-1">
        <button className={tab === "audit" ? "btn-primary" : "btn-outline"} onClick={() => setTab("audit")}>Audit records</button>
        <button className={tab === "state" ? "btn-primary" : "btn-outline"} onClick={() => setTab("state")}>State transitions</button>
      </div>
      {tab === "audit" ? (
        <DataTable table="audit_records" initial={search} defaultSort={{ key: "timestamp", asc: false }} searchCols={["entity_id", "actor", "action"]} onRowClick={setSel}
          filters={[{ key: "entity_type", label: "Entity", options: ENTITIES }, { key: "from", label: "From", type: "dateFrom", column: "timestamp" }, { key: "to", label: "To", type: "dateTo", column: "timestamp" }]}
          columns={[
            { key: "timestamp", label: "When", render: (r) => <span className="mono">{fmtTs(r.timestamp)}</span> },
            { key: "entity_type", label: "Entity" },
            { key: "entity_id", label: "ID", render: (r) => <span className="mono">{r.entity_id}</span> },
            { key: "action", label: "Action" },
            { key: "actor", label: "Actor" },
            { key: "reason", label: "Reason" },
          ]} />
      ) : (
        <DataTable table="state_history" initial={search} defaultSort={{ key: "changed_at", asc: false }} searchCols={["entity_id", "actor", "new_state"]}
          filters={[{ key: "entity_type", label: "Entity", options: ENTITIES }]}
          columns={[
            { key: "changed_at", label: "When", render: (r) => <span className="mono">{fmtTs(r.changed_at)}</span> },
            { key: "entity_type", label: "Entity" },
            { key: "entity_id", label: "ID", render: (r) => <span className="mono">{r.entity_id}</span> },
            { key: "previous_state", label: "From" },
            { key: "new_state", label: "To" },
            { key: "actor", label: "Actor" },
            { key: "reason", label: "Reason" },
          ]} />
      )}
      <Dialog open={!!sel} onOpenChange={(o) => !o && setSel(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader><DialogTitle className="mono text-[14px]">Audit #{sel?.audit_id} · {sel?.action}</DialogTitle></DialogHeader>
          {sel && <div className="space-y-2 text-[13px]">
            <div>{sel.entity_type} <span className="mono">{sel.entity_id}</span> · {sel.actor} · {fmtTs(sel.timestamp)}</div>
            {sel.entity_type === "asset" && <Link to="/assets/$assetId" params={{ assetId: sel.entity_id }} className="text-primary">Open asset →</Link>}
            <div className="grid gap-2 md:grid-cols-2">
              <div><div className="kicker">Old value</div><pre className="mono max-h-72 overflow-auto rounded bg-muted p-2">{JSON.stringify(sel.old_value, null, 2)}</pre></div>
              <div><div className="kicker">New value</div><pre className="mono max-h-72 overflow-auto rounded bg-muted p-2">{JSON.stringify(sel.new_value, null, 2)}</pre></div>
            </div>
            {sel.reason && <div>Reason: {sel.reason}</div>}
          </div>}
        </DialogContent>
      </Dialog>
    </div>
  );
}
