import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Download } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/AppShell";
import { nextUtcDay } from "@/lib/query-order";
import { allRows, download, pct, rows, toCsv, useSettings, type Row } from "@/lib/data";

export const Route = createFileRoute("/reports")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Reports — Calibra" }, { name: "description", content: "Compliance, certificate coverage, downtime and supplier performance reports." }, { property: "og:title", content: "Reports — Calibra" }, { property: "og:description", content: "Operational reports." }] }),
  component: Reports,
});

type Report = { id: string; title: string; denominator: string; rows: Row[]; chart?: { x: string; bars: string[] } };

function Reports() {
  const s = useSettings().data;
  const [from, setFrom] = useState("2025-10-28");
  const [to, setTo] = useState("2026-10-28");
  const q = useQuery({
    queryKey: ["reports", from, to, s?.simDate],
    enabled: !!s,
    queryFn: async (): Promise<Report[]> => {
      const [status, events, certs, uses, attempts, alerts, cas, wos, dts, sups, evals] = await Promise.all([
        allRows("v_asset_status", undefined, "asset_id,type_name,calc_status,days_past_due,expected_due_date,location"),
        allRows("calibration_events", (x) => x.gte("calibration_date", from).lte("calibration_date", to), "calibration_id,asset_id,plan_id,supplier_id,calibration_date,result,event_status"),
        allRows("certificates", undefined, "calibration_id,asset_id,certificate_status"),
        allRows("production_use", (x) => x.eq("decision", "FLAGGED_FOR_REVIEW").gte("used_at", from).lt("used_at", nextUtcDay(to)), "use_id,asset_id,used_at,reason_code"),
        allRows("use_attempts", (x) => x.neq("decision", "ALLOWED").gte("requested_at", from).lt("requested_at", nextUtcDay(to)), "attempt_id,asset_id,requested_at,decision,reason_code"),
        allRows("alerts", undefined, "issue_type,status,severity"),
        allRows("corrective_actions", undefined, "status,due_at,completed_at"),
        allRows("work_orders", undefined, "work_order_id,work_order_type,status,priority,due_at"),
        allRows("downtime_events", (x) => x.gte("start_at", from).lt("start_at", nextUtcDay(to)), "start_at,end_at,reason,asset_id"),
        rows("suppliers"),
        rows("evaluation_runs", (x) => x.eq("kind", "EVALUATION").eq("status", "SUCCEEDED").order("started_at", { ascending: false }).limit(1)),
      ]);
      const group = <T,>(arr: T[], k: (x: T) => string) => { const m: Record<string, T[]> = {}; for (const x of arr) (m[k(x)] ??= []).push(x); return m; };
      const byType = group(status.filter((x) => x.calc_status !== "RETIRED"), (x) => x.type_name);
      const compliance = Object.entries(byType).map(([type, xs]) => { const ok = xs.filter((x) => ["VALID", "DUE_SOON"].includes(x.calc_status)).length; return { type, in_scope: xs.length, compliant: ok, overdue: xs.filter((x) => x.calc_status === "OVERDUE").length, failed_or_quarantined: xs.filter((x) => ["FAILED", "QUARANTINED"].includes(x.calc_status)).length, compliance_rate: pct(ok / xs.length) }; });
      const overdue = status.filter((x) => x.calc_status === "OVERDUE").sort((a, b) => b.days_past_due - a.days_past_due).map((x) => ({ asset_id: x.asset_id, type: x.type_name, location: x.location, due: x.expected_due_date, days_overdue: x.days_past_due }));
      const months = group(events.filter((e) => e.result), (e) => e.calibration_date.slice(0, 7));
      const passFail = Object.entries(months).sort().map(([m, xs]) => ({ month: m, PASS: xs.filter((x) => x.result === "PASS").length, FAIL: xs.filter((x) => x.result === "FAIL").length, fail_rate: pct(xs.filter((x) => x.result === "FAIL").length / xs.length) }));
      const certSet = new Map(certs.map((c) => [c.calibration_id, c]));
      const completed = events.filter((e) => e.event_status === "COMPLETED");
      const covByPlan = group(completed, (e) => e.plan_id);
      const coverage = Object.entries(covByPlan).sort().map(([plan, xs]) => { const withC = xs.filter((x) => certSet.has(x.calibration_id)); const mism = withC.filter((x) => certSet.get(x.calibration_id)!.asset_id !== x.asset_id).length; return { plan, completed_calibrations: xs.length, with_certificate: withC.length, missing: xs.length - withC.length, mismatched: mism, coverage: pct(withC.length / xs.length) }; });
      const prohibited = [...uses.map((u) => ({ kind: "recorded use (flagged)", id: u.use_id, asset_id: u.asset_id, at: u.used_at, reason: u.reason_code })), ...attempts.map((a) => ({ kind: `request ${a.decision}`, id: a.attempt_id, asset_id: a.asset_id, at: a.requested_at, reason: a.reason_code }))];
      const vio = Object.entries(group(alerts, (a) => a.issue_type)).map(([issue, xs]) => ({ issue, total: xs.length, open: xs.filter((x) => x.status !== "RESOLVED").length, resolved: xs.filter((x) => x.status === "RESOLVED").length }));
      const caR = Object.entries(group(cas, (c) => c.status)).map(([status, xs]) => ({ status, count: xs.length, share: pct(xs.length / cas.length) }));
      const backlog = Object.entries(group(wos.filter((w) => ["OPEN", "IN_PROGRESS", "BLOCKED"].includes(w.status)), (w) => `${w.work_order_type}|${w.priority}`)).map(([k, xs]) => ({ type: k.split("|")[0], priority: k.split("|")[1], open: xs.length, overdue: xs.filter((x) => x.due_at < s!.simDate).length }));
      const dtM = Object.entries(group(dts, (d) => d.start_at.slice(0, 7))).sort().map(([month, xs]) => ({ month, events: xs.length, hours: Math.round(xs.reduce((a, d) => a + (Date.parse(d.end_at) - Date.parse(d.start_at)) / 36e5, 0) * 10) / 10 }));
      const bySup = group(events.filter((e) => e.supplier_id && e.result), (e) => e.supplier_id);
      const supR = sups.map((sp) => { const xs = bySup[sp.supplier_id] ?? []; const f = xs.filter((x) => x.result === "FAIL").length; return { supplier: sp.supplier_name, status: sp.approval_status, calibrations: xs.length, failed: f, fail_rate: xs.length ? pct(f / xs.length) : "n/a" }; });
      const ev = evals[0];
      const gtR = ev ? Object.entries(ev.metrics.perIssue as Record<string, Row>).map(([issue, m]) => ({ issue, tp: m.tp, fp: m.fp, fn: m.fn, tn: m.tn, precision: pct(m.precision), recall: pct(m.recall), f1: pct(m.f1) })) : [];
      return [
        { id: "compliance", title: "Calibration compliance by instrument type", denominator: "Non-retired assets per type; compliant = VALID or DUE_SOON at the simulation date", rows: compliance, chart: { x: "type", bars: ["compliant", "overdue", "failed_or_quarantined"] } },
        { id: "overdue", title: "Overdue instruments", denominator: "Assets whose latest successful calibration due date ≤ simulation date", rows: overdue },
        { id: "passfail", title: "Pass / fail by month", denominator: "Completed + failed calibrations in the date range", rows: passFail, chart: { x: "month", bars: ["PASS", "FAIL"] } },
        { id: "coverage", title: "Certificate coverage by plan", denominator: "Successful calibrations per plan version in the date range", rows: coverage },
        { id: "prohibited", title: "Prohibited use", denominator: "Recorded uses flagged for review + blocked/flagged gate requests", rows: prohibited },
        { id: "violations", title: "Violations by issue type", denominator: "All alerts (detector findings)", rows: vio, chart: { x: "issue", bars: ["open", "resolved"] } },
        { id: "ca", title: "Corrective-action completion", denominator: "All corrective actions", rows: caR },
        { id: "backlog", title: "Work-order backlog", denominator: "Open / in-progress / blocked work orders", rows: backlog },
        { id: "downtime", title: "Downtime by month", denominator: "Downtime events started in the date range", rows: dtM, chart: { x: "month", bars: ["hours"] } },
        { id: "suppliers", title: "Supplier performance", denominator: "Calibrations with a result in the date range, per supplier", rows: supR },
        { id: "gt", title: "Ground-truth evaluation (latest run)", denominator: ev ? `Evaluation run ${ev.run_id.slice(0, 8)} · ${ev.finished_at?.slice(0, 16)}` : "No evaluation run yet — run one on Data Quality", rows: gtR },
      ];
    },
  });
  return (
    <div>
      <PageHeader title="Reports" subtitle="Every metric is computed from live records; denominators are stated under each report."
        actions={<div className="flex items-center gap-2 text-[12px]">From <input type="date" className="field w-36" value={from} onChange={(e) => setFrom(e.target.value)} /> To <input type="date" className="field w-36" value={to} onChange={(e) => setTo(e.target.value)} /></div>} />
      {q.isLoading && <div className="text-muted-foreground">Computing reports…</div>}
      {q.isError && <div className="text-destructive">{(q.error as Error).message}</div>}
      <div className="grid gap-4 xl:grid-cols-2">
        {q.data?.map((r) => (
          <div key={r.id} className="panel">
            <div className="panel-head"><div><div className="panel-title">{r.title}</div><div className="text-[11px] text-muted-foreground">{r.denominator}</div></div>
              <button className="btn-outline" disabled={!r.rows.length} onClick={() => download(`report-${r.id}.csv`, toCsv(r.rows))}><Download className="h-3.5 w-3.5" />CSV</button></div>
            {r.chart && r.rows.length > 0 && <div className="h-52 p-2"><ResponsiveContainer><BarChart data={r.rows}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey={r.chart.x} fontSize={10} /><YAxis fontSize={10} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />{r.chart.bars.map((b, i) => <Bar key={b} dataKey={b} fill={`var(--chart-${i + 1})`} />)}</BarChart></ResponsiveContainer></div>}
            <div className="max-h-72 overflow-auto"><table className="tbl"><thead><tr>{Object.keys(r.rows[0] ?? { "no data": "" }).map((k) => <th key={k}>{k.replace(/_/g, " ")}</th>)}</tr></thead>
              <tbody>{r.rows.slice(0, 200).map((x, i) => <tr key={i}>{Object.values(x).map((v, j) => <td key={j} className="mono">{v == null ? "—" : String(v)}</td>)}</tr>)}</tbody></table>
              {r.rows.length > 200 && <div className="px-3 py-2 text-[12px] text-muted-foreground">Showing 200 of {r.rows.length}; export for all.</div>}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
