import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/AppShell";
import { FormDialog, ReasonButton } from "@/components/FormDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { allRows, fmtDate, fmtTs, rows, type Row } from "@/lib/data";
import { LOCATION_OPTIONS, useLookups } from "@/lib/lookups";
import { useAction } from "@/lib/session";

export const Route = createFileRoute("/assets/$assetId")({
  head: ({ params }) => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: `${params.assetId} — Calibra` }, { name: "description", content: `Calibration history, certificates and audit trail for ${params.assetId}.` }, { property: "og:title", content: `${params.assetId} — Calibra` }, { property: "og:description", content: `Calibration history and traceability for ${params.assetId}.` }] }),
  component: AssetDetails,
});

const TABS = ["Calibrations", "Certificates", "Work orders", "Production use", "Alerts", "Audit"] as const;

function AssetDetails() {
  const { assetId } = Route.useParams();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Calibrations");
  const act = useAction();
  const lk = useLookups();
  const q = useQuery({
    queryKey: ["asset", assetId],
    queryFn: async () => {
      const [a] = await rows("v_asset_status", (x) => x.eq("asset_id", assetId));
      if (!a) return null;
      const [cal, certs, wos, uses, alerts, audit, state, ex] = await Promise.all([
        rows("calibration_events", (x) => x.eq("asset_id", assetId).order("calibration_id", { ascending: false })),
        rows("certificates", (x) => x.eq("asset_id", assetId).order("issue_date", { ascending: false })),
        rows("work_orders", (x) => x.eq("asset_id", assetId).order("created_at", { ascending: false })),
        allRows("production_use", (x) => x.eq("asset_id", assetId), "*", "used_at", Number.POSITIVE_INFINITY, false),
        rows("alerts", (x) => x.eq("asset_id", assetId).order("created_at", { ascending: false })),
        rows("audit_records", (x) => x.eq("entity_id", assetId).order("timestamp", { ascending: false })),
        rows("state_history", (x) => x.eq("entity_id", assetId).order("changed_at", { ascending: false })),
        rows("exception_records", (x) => x.eq("asset_id", assetId)),
      ]);
      return { a, cal, certs, wos, uses, alerts, audit, state, ex };
    },
  });
  if (q.isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (q.isError) return <div className="text-destructive">{(q.error as Error).message}</div>;
  if (!q.data) return <div className="panel p-6">Asset {assetId} not found. <Link to="/assets" className="text-primary">Back to assets</Link></div>;
  const { a } = q.data;
  const T = (h: string[], body: React.ReactNode) => <div className="overflow-x-auto"><table className="tbl"><thead><tr>{h.map((x) => <th key={x}>{x}</th>)}</tr></thead><tbody>{body}</tbody></table></div>;

  return (
    <div>
      <Link to="/assets" className="mb-2 inline-flex items-center gap-1 text-[12px] text-muted-foreground"><ArrowLeft className="h-3 w-3" />Assets</Link>
      <PageHeader title={`${a.asset_id} · ${a.asset_name}`} subtitle={`${a.type_name} · ${a.location} · S/N ${a.serial_number ?? "—"}`}
        actions={<>
          <FormDialog title="Edit asset" fields={[{ name: "asset_name", label: "Name", default: a.asset_name, required: true }, { name: "location", label: "Location", type: "select", options: LOCATION_OPTIONS, default: a.location, required: true }, { name: "supplier_id", label: "Supplier", type: "select", options: lk.data?.supplierOptions ?? [], default: a.supplier_id ?? "" }, { name: "serial_number", label: "Serial number", default: a.serial_number ?? "" }, { name: "reason", label: "Reason for change", type: "textarea" }]}
            onSubmit={({ reason, ...fields }) => act.run("asset.update", { asset_id: a.asset_id, fields, reason }, "Asset updated")}
            trigger={(o) => <button className="btn-outline" disabled={!act.can("asset.update") || a.lifecycle_status === "RETIRED"} onClick={o}>Edit</button>} />
          {a.lifecycle_status === "QUARANTINED" && <ReasonButton label="Release from quarantine" title="Release asset" disabled={!act.can("asset.release")} disabledReason="Quality Engineer only" onConfirm={(reason) => act.run("asset.release", { asset_id: a.asset_id, reason }, "Asset released")} />}
          {a.lifecycle_status !== "RETIRED" && <ReasonButton label="Retire" title="Retire asset (history is kept)" danger disabled={!act.can("asset.retire")} onConfirm={(reason) => act.run("asset.retire", { asset_id: a.asset_id, reason }, "Asset retired")} />}
        </>} />
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        {[["Status", <StatusBadge value={a.calc_status} />], ["Lifecycle", <StatusBadge value={a.lifecycle_status} />], ["Last eligible calibration", fmtDate(a.last_pass_date)], ["Next due (calculated)", fmtDate(a.expected_due_date)], ["Stored due", fmtDate(a.stored_due_date)], ["Extensions", q.data.ex.map((e) => `${e.exception_id} ${e.approval_status}`).join(", ") || "None"]].map(([k, v]) => (
          <div key={k as string} className="panel px-3 py-2"><div className="kicker">{k}</div><div className="mt-1 mono">{v}</div></div>
        ))}
      </div>
      {a.expected_due_date && a.stored_due_date && a.expected_due_date !== a.stored_due_date && <div className="mb-4 rounded-md border border-destructive/30 bg-danger-soft px-3 py-2 text-[13px] text-destructive">DUE_DATE_PLAN_MISMATCH — stored due {a.stored_due_date} differs from expected {a.expected_due_date}. The stored value is preserved for investigation.</div>}
      <div className="panel">
        <div className="flex gap-1 overflow-x-auto border-b px-2" role="tablist">
          {TABS.map((t) => <button key={t} role="tab" aria-selected={tab === t} className={`border-b-2 px-3 py-2 text-[13px] ${tab === t ? "border-primary font-medium text-primary" : "border-transparent text-muted-foreground"}`} onClick={() => setTab(t)}>{t}</button>)}
        </div>
        {tab === "Calibrations" && T(["ID", "Plan", "Scheduled", "Calibrated", "Measured / Ref", "Tol.", "Result", "Due", "Status"], q.data.cal.map((e: Row) => <tr key={e.calibration_id}><td className="mono">{e.calibration_id}</td><td className="mono">{e.plan_id}</td><td>{fmtDate(e.scheduled_date)}</td><td>{fmtDate(e.calibration_date)}</td><td className="mono">{e.measured_value ?? "—"} / {e.reference_value ?? "—"}</td><td>±{e.tolerance_used}</td><td><StatusBadge value={e.result} /></td><td>{fmtDate(e.next_due_date)}</td><td><StatusBadge value={e.event_status} /></td></tr>))}
        {tab === "Certificates" && T(["Certificate", "Calibration", "Issued", "Expires", "Status"], q.data.certs.map((c: Row) => <tr key={c.certificate_id}><td className="mono">{c.certificate_id}</td><td className="mono">{c.calibration_id}</td><td>{fmtDate(c.issue_date)}</td><td>{fmtDate(c.expiry_date)}</td><td><StatusBadge value={c.certificate_status} /></td></tr>))}
        {tab === "Work orders" && T(["WO", "Type", "Priority", "Due", "Downtime h", "Status"], q.data.wos.map((w: Row) => <tr key={w.work_order_id}><td className="mono">{w.work_order_id}</td><td>{w.work_order_type}</td><td><StatusBadge value={w.priority} /></td><td>{fmtDate(w.due_at)}</td><td>{w.downtime_hours}</td><td><StatusBadge value={w.status} /></td></tr>))}
        {tab === "Production use" && T(["Use ID", "Used at", "Line", "Decision", "Reason"], q.data.uses.map((u: Row) => <tr key={u.use_id}><td className="mono">{u.use_id}</td><td>{fmtTs(u.used_at)}</td><td>{u.production_line}</td><td><StatusBadge value={u.decision} /></td><td className="mono">{u.reason_code ?? "—"}</td></tr>))}
        {tab === "Alerts" && T(["Alert", "Issue", "Severity", "Status", "Explanation"], q.data.alerts.map((x: Row) => <tr key={x.alert_id}><td className="mono">{x.alert_id}</td><td className="mono">{x.issue_type}</td><td><StatusBadge value={x.severity} /></td><td><StatusBadge value={x.status} /></td><td className="text-[12px]">{x.explanation}</td></tr>))}
        {tab === "Audit" && T(["When", "Kind", "Action / transition", "Actor", "Reason"], [...q.data.audit.map((x: Row) => ({ t: x.timestamp, k: "audit", a: x.action, actor: x.actor, r: x.reason })), ...q.data.state.map((s: Row) => ({ t: s.changed_at, k: "state", a: `${s.previous_state ?? "∅"} → ${s.new_state}`, actor: s.actor, r: s.reason }))].sort((x, y) => (x.t < y.t ? 1 : -1)).map((x, i) => <tr key={i}><td className="mono">{fmtTs(x.t)}</td><td>{x.k}</td><td>{x.a}</td><td>{x.actor}</td><td>{x.r ?? "—"}</td></tr>))}
      </div>
    </div>
  );
}
