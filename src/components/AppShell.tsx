import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Activity, AlertTriangle, BarChart3, Bell, ClipboardCheck, Database, FileBadge, Gauge, History, LayoutDashboard, Menu, Settings, ShieldCheck, Truck, Wrench, X, Factory } from "lucide-react";
import { count, useSettings } from "@/lib/data";
import { useSession } from "@/lib/session";
import { ROLES, ROLE_LABEL, type Role } from "@/lib/roles";

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/assets", label: "Assets", icon: Gauge },
  { to: "/calibration", label: "Calibration Planner", icon: ClipboardCheck },
  { to: "/certificates", label: "Certificates", icon: FileBadge },
  { to: "/work-orders", label: "Work Orders", icon: Wrench },
  { to: "/production-use", label: "Production Use", icon: Factory },
  { to: "/alerts", label: "Exceptions & Alerts", icon: AlertTriangle },
  { to: "/corrective-actions", label: "Corrective Actions", icon: ShieldCheck },
  { to: "/suppliers", label: "Suppliers", icon: Truck },
  { to: "/reports", label: "Reports", icon: BarChart3 },
  { to: "/data-quality", label: "Data Quality", icon: Database },
  { to: "/audit", label: "Audit Log", icon: History },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const [mobile, setMobile] = useState(false);
  const settings = useSettings();
  const { role, setRole, actor, setActor } = useSession();
  const openAlerts = useQuery({ queryKey: ["openAlerts"], queryFn: () => count("alerts", (q) => q.neq("status", "RESOLVED")) });
  const nav = useNavigate();
  const [search, setSearch] = useState("");

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const s = search.trim().toUpperCase();
    if (/^AST-\d{6}$/.test(s)) nav({ to: "/assets/$assetId", params: { assetId: s } });
    else if (/^\d{1,6}$/.test(s)) nav({ to: "/assets/$assetId", params: { assetId: `AST-${s.padStart(6, "0")}` } });
    else nav({ to: "/assets", search: { q: search.trim() } });
  };

  const sidebar = (
    <nav className="flex h-full flex-col bg-sidebar text-sidebar-foreground">
      <div className="flex items-center gap-2 px-4 py-4">
        <div className="grid h-8 w-8 place-items-center rounded bg-sidebar-primary text-sidebar-primary-foreground"><Activity className="h-4 w-4" /></div>
        <div><div className="text-[15px] font-semibold text-sidebar-accent-foreground">Calibra</div><div className="text-[10px] uppercase tracking-wider opacity-70">Calibration & Compliance</div></div>
      </div>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-2">
        {NAV.map((n) => (
          <Link key={n.to} to={n.to} onClick={() => setMobile(false)} activeOptions={{ exact: n.to === "/" }}
            className="flex items-center gap-2.5 rounded px-2.5 py-1.5 text-[13px] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            activeProps={{ className: "bg-sidebar-accent text-sidebar-accent-foreground font-medium" }}>
            <n.icon className="h-4 w-4 opacity-80" />{n.label}
          </Link>
        ))}
      </div>
      <div className="border-t border-sidebar-border px-4 py-3 text-[11px] opacity-70">Prototype · synthetic data · demo identities</div>
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 hidden h-screen w-56 shrink-0 lg:block">{sidebar}</aside>
      {mobile && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-foreground/40" onClick={() => setMobile(false)} />
          <div className="absolute inset-y-0 left-0 w-60">{sidebar}</div>
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-12 items-center gap-3 border-b bg-card px-4">
          <button className="btn-ghost h-8 px-2 lg:hidden" onClick={() => setMobile(!mobile)} aria-label="Open navigation">{mobile ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}</button>
          <form onSubmit={go} className="hidden md:block"><input className="field w-64" placeholder="Jump to asset (AST-000123) or search" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Global search" /></form>
          <div className="ml-auto flex items-center gap-3">
            <Link to="/settings" className="hidden items-center gap-1.5 rounded border bg-muted px-2 py-1 text-[12px] sm:flex" title="Simulation date — change in Settings">
              <span className="kicker">Sim date</span><span className="mono font-semibold">{settings.data?.simDate ?? "…"}</span>
            </Link>
            <Link to="/alerts" search={{ status: "OPEN" }} className="relative btn-ghost h-8 px-2" aria-label="Open alerts">
              <Bell className="h-4 w-4" />
              {!!openAlerts.data && <span className="absolute -right-1 -top-1 rounded-full bg-destructive px-1 text-[10px] font-semibold text-destructive-foreground">{openAlerts.data > 999 ? "999+" : openAlerts.data}</span>}
            </Link>
            <select className="field w-auto" value={role} onChange={(e) => setRole(e.target.value as Role)} aria-label="Demo role">
              {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <input className="field hidden w-28 xl:block" value={actor} onChange={(e) => setActor(e.target.value)} aria-label="Demo user name" />
          </div>
        </header>
        <main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div><h1 className="page-title">{title}</h1>{subtitle && <p className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</p>}</div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, tone, onClick, hint }: { label: string; value: ReactNode; tone?: "ok" | "warn" | "bad"; onClick?: () => void; hint?: string }) {
  const c = tone === "bad" ? "text-destructive" : tone === "warn" ? "text-warning" : tone === "ok" ? "text-success" : "text-foreground";
  return (
    <button onClick={onClick} disabled={!onClick} className="panel px-3.5 py-3 text-left transition-colors enabled:hover:border-primary/50 disabled:cursor-default">
      <div className="kicker">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${c}`}>{value}</div>
      {hint && <div className="text-[11px] text-muted-foreground">{hint}</div>}
    </button>
  );
}
