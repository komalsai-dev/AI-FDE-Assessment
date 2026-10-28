import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from "recharts";
import { RefreshCw, CalendarPlus, Factory } from "lucide-react";
import { PageHeader, Stat } from "@/components/AppShell";
import { StatusBadge } from "@/components/StatusBadge";
import { allRows, count, fmtDate, fmtTs, rows, useSettings } from "@/lib/data";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ property: "og:type", content: "website" }, { name: "twitter:card", content: "summary_large_image" }, { title: "Dashboard — Calibra" }, { name: "description", content: "Live calibration compliance KPIs, trends and critical exceptions." }, { property: "og:title", content: "Dashboard — Calibra" }, { property: "og:description", content: "Live calibration compliance KPIs, trends and critical exceptions." }] }),
  component: Dashboard,
});

const C = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
const STATUS_COLOR: Record<string, string> = { VALID: "var(--chart-2)", DUE_SOON: "var(--chart-3)", OVERDUE: "var(--chart-4)", FAILED: "var(--destructive)", QUARANTINED: "var(--chart-4)", RETIRED: "var(--chart-5)", NO_CALIBRATION: "var(--chart-5)" };

function Dashboard() {
  const nav = useNavigate();
  const settings = useSettings();
  const sim = settings.data?.simDate;
  const kpi = useQuery({
    queryKey: ["dashboard", sim],
    enabled: !!sim,
    queryFn: async () => {
      const s = sim!;
      const st = (v: string | string[]) => count("v_asset_status", (q) => (Array.isArray(v) ? q.in("calc_status", v) : q.eq("calc_status", v)));
      const [total, valid, dueSoon, overdue, failedSt, quarantined, retired, nocal, failedEv, prohibited, attemptsBlocked, openAlerts, openCa, overdueWo] = await Promise.all([
        count("assets"), st("VALID"), st("DUE_SOON"), st("OVERDUE"), st("FAILED"), st("QUARANTINED"), st("RETIRED"), st("NO_CALIBRATION"),
        count("calibration_events", (q) => q.eq("event_status", "FAILED")),
        count("production_use", (q) => q.eq("decision", "FLAGGED_FOR_REVIEW")),
        count("use_attempts", (q) => q.eq("decision", "BLOCKED")),
        count("alerts", (q) => q.neq("status", "RESOLVED")),
        count("corrective_actions", (q) => q.not("status", "in", "(COMPLETED,CANCELLED)")),
        count("work_orders", (q) => q.in("status", ["OPEN", "IN_PROGRESS", "BLOCKED"]).lt("due_at", s)),
      ]);
      const alertRows = await allRows("alerts", undefined, "issue_type,severity,status");
      const byType = (t: string) => alertRows.filter((a) => a.issue_type === t && a.status !== "RESOLVED").length;
      const events = await allRows("calibration_events", (q) => q.not("calibration_date", "is", null), "calibration_date,result");
      const dt = await allRows("downtime_events", undefined, "start_at,end_at");
      const cas = await allRows("corrective_actions", undefined, "status");
      const months = new Map<string, { m: string; PASS: number; FAIL: number; downtime: number }>();
      const mk = (m: string) => months.get(m) ?? months.set(m, { m, PASS: 0, FAIL: 0, downtime: 0 }).get(m)!;
      const start = settings.data?.raw.sim_start ?? "2025-10-28";
      for (const e of events) if (e.calibration_date >= start.slice(0, 7) && e.calibration_date <= s) mk(e.calibration_date.slice(0, 7))[e.result as "PASS" | "FAIL"]++;
      let totalDowntime = 0;
      for (const d of dt) { const h = (Date.parse(d.end_at) - Date.parse(d.start_at)) / 36e5; totalDowntime += h; if (d.start_at.slice(0, 10) >= start && d.start_at.slice(0, 10) <= s) mk(d.start_at.slice(0, 7)).downtime += h; }
      const upcoming = await rows("calibration_events", (q) => q.in("event_status", ["SCHEDULED", "IN_PROGRESS"]).order("scheduled_date").limit(8));
      const critical = await rows("alerts", (q) => q.in("severity", ["CRITICAL", "HIGH"]).neq("status", "RESOLVED").order("severity").order("created_at", { ascending: false }).limit(8));
      const activity = await rows("audit_records", (q) => q.order("timestamp", { ascending: false }).limit(10));
      const maint = await rows("work_orders", (q) => q.in("status", ["OPEN", "IN_PROGRESS", "BLOCKED"]).order("due_at").limit(8));
      const sev: Record<string, number> = {};
      for (const a of alertRows) if (a.status !== "RESOLVED") sev[a.severity] = (sev[a.severity] ?? 0) + 1;
      const caSt: Record<string, number> = {};
      for (const c of cas) caSt[c.status] = (caSt[c.status] ?? 0) + 1;
      const issueCounts: Record<string, number> = {};
      for (const a of alertRows) if (a.status !== "RESOLVED") issueCounts[a.issue_type] = (issueCounts[a.issue_type] ?? 0) + 1;
      return {
        total, eligible: valid + dueSoon, dueSoon, overdue, failedEv, prohibited: prohibited, openAlerts, openCa, overdueWo, totalDowntime,
        missingCert: byType("CERTIFICATE_MISSING"), mismatch: byType("CERTIFICATE_ASSET_MISMATCH"), expiredCert: byType("CERTIFICATE_EXPIRED"),
        statusDist: Object.entries({ VALID: valid, DUE_SOON: dueSoon, OVERDUE: overdue, FAILED: failedSt, QUARANTINED: quarantined, RETIRED: retired, NO_CALIBRATION: nocal }).filter(([, v]) => v).map(([name, value]) => ({ name, value })),
        trend: [...months.values()].sort((a, b) => (a.m < b.m ? -1 : 1)).map((x) => ({ ...x, downtime: Math.round(x.downtime) })),
        issues: Object.entries(issueCounts).map(([name, value]) => ({ name: name.replace(/_/g, " "), key: name, value })).sort((a, b) => b.value - a.value),
        sev: Object.entries(sev).map(([name, value]) => ({ name, value })),
        caSt: Object.entries(caSt).map(([name, value]) => ({ name, value })),
        upcoming, critical, activity, maint,
      };
    },
  });
  const d = kpi.data;
  const f = (n?: number) => (n == null ? "…" : n.toLocaleString());

  return (
    <div>
      <PageHeader title="Compliance dashboard" subtitle={`Derived from live records as of simulation date ${sim ?? "…"}. Validity ends at the start of the due date.`}
        actions={<>
          <Link to="/calibration" search={{ new: "1" }} className="btn-outline"><CalendarPlus className="h-4 w-4" />Schedule calibration</Link>
          <Link to="/production-use" search={{ new: "1" }} className="btn-outline"><Factory className="h-4 w-4" />Record use request</Link>
          <button className="btn-primary" onClick={() => kpi.refetch()}><RefreshCw className={`h-4 w-4 ${kpi.isFetching ? "animate-spin" : ""}`} />Refresh</button>
        </>} />
      {kpi.isError && <div className="panel mb-4 p-4 text-destructive">Failed to load dashboard: {(kpi.error as Error).message}</div>}
      {d && d.total === 0 && <div className="panel mb-4 p-4">No data yet. <Link to="/settings" className="text-primary underline">Generate the synthetic dataset in Settings</Link>.</div>}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7">
        <Stat label="Total assets" value={f(d?.total)} onClick={() => nav({ to: "/assets" })} />
        <Stat label="Eligible now" value={f(d?.eligible)} tone="ok" onClick={() => nav({ to: "/assets", search: { eligible: "1" } })} />
        <Stat label="Due soon" value={f(d?.dueSoon)} tone="warn" onClick={() => nav({ to: "/assets", search: { calc_status: "DUE_SOON" } })} />
        <Stat label="Overdue" value={f(d?.overdue)} tone="bad" onClick={() => nav({ to: "/assets", search: { calc_status: "OVERDUE" } })} />
        <Stat label="Failed calibrations" value={f(d?.failedEv)} tone="bad" onClick={() => nav({ to: "/calibration", search: { event_status: "FAILED" } })} />
        <Stat label="Missing certificates" value={f(d?.missingCert)} tone="bad" onClick={() => nav({ to: "/alerts", search: { issue_type: "CERTIFICATE_MISSING" } })} />
        <Stat label="Mismatched certs" value={f(d?.mismatch)} tone="bad" onClick={() => nav({ to: "/alerts", search: { issue_type: "CERTIFICATE_ASSET_MISMATCH" } })} />
        <Stat label="Expired certs" value={f(d?.expiredCert)} tone="warn" onClick={() => nav({ to: "/alerts", search: { issue_type: "CERTIFICATE_EXPIRED" } })} />
        <Stat label="Flagged recorded uses" value={f(d?.prohibited)} tone="bad" hint="actual recorded violations" onClick={() => nav({ to: "/production-use", search: { decision: "FLAGGED_FOR_REVIEW" } })} />
        <Stat label="Open alerts" value={f(d?.openAlerts)} tone="warn" onClick={() => nav({ to: "/alerts", search: { unresolved: "1" } })} />
        <Stat label="Open corrective" value={f(d?.openCa)} tone="warn" onClick={() => nav({ to: "/corrective-actions" })} />
        <Stat label="Overdue work orders" value={f(d?.overdueWo)} tone="warn" onClick={() => nav({ to: "/work-orders", search: { overdue: "1" } })} />
        <Stat label="Total downtime" value={d ? `${Math.round(d.totalDowntime).toLocaleString()} h` : "…"} onClick={() => nav({ to: "/reports" })} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Chart title="Calibration status distribution">
          <PieChart><Pie data={d?.statusDist ?? []} dataKey="value" nameKey="name" innerRadius={50} outerRadius={85} onClick={(x: { name?: string }) => x.name && nav({ to: "/assets", search: { calc_status: x.name } })} className="cursor-pointer">
            {(d?.statusDist ?? []).map((s) => <Cell key={s.name} fill={STATUS_COLOR[s.name]} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
        </Chart>
        <Chart title="Pass / fail trend (monthly)">
          <BarChart data={d?.trend ?? []}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="m" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="PASS" stackId="a" fill="var(--chart-2)" /><Bar dataKey="FAIL" stackId="a" fill="var(--chart-4)" /></BarChart>
        </Chart>
        <Chart title="Open violations by issue type">
          <BarChart data={d?.issues ?? []} layout="vertical" margin={{ left: 40 }}><XAxis type="number" fontSize={11} /><YAxis type="category" dataKey="name" width={130} fontSize={10} /><Tooltip />
            <Bar dataKey="value" fill="var(--chart-1)" className="cursor-pointer" onClick={(x: { key?: string }) => x.key && nav({ to: "/alerts", search: { issue_type: x.key } })} /></BarChart>
        </Chart>
        <Chart title="Alert severity (open)">
          <PieChart><Pie data={d?.sev ?? []} dataKey="value" nameKey="name" outerRadius={85} onClick={(x: { name?: string }) => x.name && nav({ to: "/alerts", search: { severity: x.name } })} className="cursor-pointer">
            {(d?.sev ?? []).map((s, i) => <Cell key={s.name} fill={{ CRITICAL: "var(--destructive)", HIGH: "var(--chart-4)", MEDIUM: "var(--chart-3)", LOW: "var(--chart-5)" }[s.name] ?? C[i]} />)}</Pie><Tooltip /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart>
        </Chart>
        <Chart title="Downtime trend (hours / month)">
          <LineChart data={d?.trend ?? []}><CartesianGrid strokeDasharray="3 3" stroke="var(--border)" /><XAxis dataKey="m" fontSize={11} /><YAxis fontSize={11} /><Tooltip /><Line dataKey="downtime" stroke="var(--chart-1)" strokeWidth={2} dot={false} /></LineChart>
        </Chart>
        <Chart title="Corrective actions by status">
          <BarChart data={d?.caSt ?? []}><XAxis dataKey="name" fontSize={10} /><YAxis fontSize={11} /><Tooltip /><Bar dataKey="value" fill="var(--chart-3)" onClick={(x: { name?: string }) => x.name && nav({ to: "/corrective-actions", search: { status: x.name } })} className="cursor-pointer" /></BarChart>
        </Chart>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Mini title="Critical exceptions" link={{ to: "/alerts", label: "All alerts" }}>
          {d?.critical.map((a) => <tr key={a.alert_id}><td><StatusBadge value={a.severity} /></td><td className="mono">{a.issue_type}</td><td>{a.asset_id ? <Link to="/assets/$assetId" params={{ assetId: a.asset_id }} className="mono text-primary">{a.asset_id}</Link> : "—"}</td><td className="text-[12px] text-muted-foreground">{a.explanation}</td></tr>)}
        </Mini>
        <Mini title="Upcoming calibration schedule" link={{ to: "/calibration", label: "Planner" }}>
          {d?.upcoming.map((e) => <tr key={e.calibration_id}><td className="mono">{fmtDate(e.scheduled_date)}</td><td><Link to="/assets/$assetId" params={{ assetId: e.asset_id }} className="mono text-primary">{e.asset_id}</Link></td><td className="mono text-[11px]">{e.calibration_id}</td><td><StatusBadge value={e.event_status} /></td></tr>)}
        </Mini>
        <Mini title="Upcoming maintenance" link={{ to: "/work-orders", label: "Work orders" }}>
          {d?.maint.map((w) => <tr key={w.work_order_id}><td className="mono">{w.work_order_id}</td><td>{w.work_order_type}</td><td className="mono">{fmtDate(w.due_at)}</td><td><StatusBadge value={w.status} /></td></tr>)}
        </Mini>
        <Mini title="Recent activity" link={{ to: "/audit", label: "Audit log" }}>
          {d?.activity.map((a) => <tr key={a.audit_id}><td className="mono text-[11px]">{fmtTs(a.timestamp)}</td><td>{a.action}</td><td className="mono text-[11px]">{a.entity_type}:{a.entity_id}</td><td className="text-[12px] text-muted-foreground">{a.actor}</td></tr>)}
        </Mini>
      </div>
    </div>
  );
}

function Chart({ title, children }: { title: string; children: React.ReactElement }) {
  return <div className="panel"><div className="panel-head"><span className="panel-title">{title}</span></div><div className="h-60 p-2"><ResponsiveContainer>{children}</ResponsiveContainer></div></div>;
}
function Mini({ title, link, children }: { title: string; link: { to: "/alerts" | "/calibration" | "/work-orders" | "/audit"; label: string }; children: React.ReactNode }) {
  return <div className="panel"><div className="panel-head"><span className="panel-title">{title}</span><Link to={link.to} className="text-[12px] text-primary">{link.label} →</Link></div><table className="tbl"><tbody>{children}</tbody></table></div>;
}
