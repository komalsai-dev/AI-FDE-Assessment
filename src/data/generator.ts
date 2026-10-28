import { evaluateMeasurement, selectPlan } from "@/rules/calibration";
import { evaluateUse, recordedUseDecision } from "@/rules/compliance";
import { impactWindow } from "@/rules/correctiveActions";
import { addDays, compactTimestamp, computeDueDate, toDate } from "@/rules/dates";
import { RULE_IDS, SEVERITY, type AssetLite, type CalEvent, type Certificate, type ExceptionRec, type IssueType, type Plan } from "@/rules/types";
import { detect } from "@/rules/validation";
import { INSTRUMENT_TYPES, LINES, LOCATIONS, SUPPLIERS } from "./referenceData";

export const GENERATOR_VERSION = "1.1.0";
export const SCALES = {
  starter: { assets: 200, calibrations: 500, uses: 10_000, anomalies: 5 },
  full: { assets: 2000, calibrations: 5000, uses: 100_000, anomalies: 20 },
} as const;
export type Scale = keyof typeof SCALES;
export type GenConfig = { seed: number; scale: Scale; simStart: string; simEnd: string };
export const DEFAULT_CONFIG: GenConfig = { seed: 20261022, scale: "starter", simStart: "2025-10-28", simEnd: "2026-10-28" };

/** mulberry32: small, fast, deterministic PRNG. */
export function prng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (min: number, max: number) => min + Math.floor(next() * (max - min + 1)),
    pick: <T,>(arr: readonly T[]) => arr[Math.floor(next() * arr.length)] as T,
    chance: (p: number) => next() < p,
  };
}

const pad = (n: number, w = 6) => String(n).padStart(w, "0");
const round = (x: number, d = 4) => Math.round(x * 10 ** d) / 10 ** d;

export type Dataset = ReturnType<typeof generate>;

export function generate(cfg: GenConfig) {
  const S = SCALES[cfg.scale];
  const r = prng(cfg.seed);
  const sim = cfg.simEnd;

  // 1-3 reference data
  const instrument_types = INSTRUMENT_TYPES.map((t) => ({
    instrument_type_id: t.id, type_name: t.name, measurement_unit: t.unit, default_tolerance: t.tol, description: t.description, created_at: "2023-01-01T00:00:00Z",
  }));
  const suppliers = SUPPLIERS.map((s) => ({ supplier_id: s.id, supplier_name: s.name, approval_status: s.status, valid_from: s.from, valid_to: s.to, created_at: "2023-01-01T00:00:00Z", updated_at: "2023-01-01T00:00:00Z" }));
  const plans: Plan[] = [];
  for (const t of INSTRUMENT_TYPES) {
    plans.push({ plan_id: `PLN-${t.id}-V1`, instrument_type_id: t.id, interval_days: t.interval[0], tolerance: t.tol, requires_certificate: t.cert, prohibit_overdue_use: t.prohibit, effective_from: "2023-01-01", effective_to: "2026-04-01", version: 1, status: "SUPERSEDED" });
    plans.push({ plan_id: `PLN-${t.id}-V2`, instrument_type_id: t.id, interval_days: t.interval[1], tolerance: round(t.tol * (t.interval[1] < t.interval[0] ? 0.9 : 1)), requires_certificate: t.cert, prohibit_overdue_use: t.prohibit, effective_from: "2026-04-01", effective_to: null, version: 2, status: "ACTIVE" });
  }
  const planById = new Map(plans.map((p) => [p.plan_id, p]));
  const typeById = new Map<string, (typeof INSTRUMENT_TYPES)[number]>(INSTRUMENT_TYPES.map((t) => [t.id, t]));
  const calSuppliers = SUPPLIERS.filter((s) => s.status === "APPROVED" || s.status === "CONDITIONAL");
  const assetSuppliers = SUPPLIERS.filter((s) => s.status === "APPROVED");

  // 4 assets
  type Mode = "valid" | "overdue" | "scheduled" | "inprogress" | "failed";
  const assets: (AssetLite & { asset_name: string; supplier_id: string; location: string; serial_number: string; commissioned_on: string; created_at: string; updated_at: string })[] = [];
  const modes: Mode[] = [];
  for (let i = 1; i <= S.assets; i++) {
    const t = r.pick(INSTRUMENT_TYPES);
    const x = r.next();
    const mode: Mode = x < 0.09 ? "overdue" : x < 0.15 ? "scheduled" : x < 0.17 ? "inprogress" : x < 0.19 ? "failed" : "valid";
    const retired = mode === "valid" && r.chance(0.01);
    const id = `AST-${pad(i)}`;
    assets.push({
      asset_id: id, asset_name: `${t.name} ${t.id}-${pad(i, 4)}`, instrument_type_id: t.id, supplier_id: r.pick(assetSuppliers).id,
      location: r.pick(LOCATIONS), serial_number: `SN-${t.id}-${pad(r.int(100000, 999999))}-${pad(i, 5)}`,
      lifecycle_status: mode === "failed" ? "QUARANTINED" : retired ? "RETIRED" : "ACTIVE",
      retired_at: retired ? `${addDays(cfg.simStart, r.int(120, 330))}T08:00:00Z` : null,
      commissioned_on: "2023-01-01", created_at: "2023-01-01T00:00:00Z", updated_at: "2023-01-01T00:00:00Z",
    });
    modes.push(mode);
  }

  // 5 calibration events (exact total)
  const counts = assets.map(() => Math.floor(S.calibrations / S.assets));
  let extra = S.calibrations - counts.reduce((a, b) => a + b, 0);
  const order = assets.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) { const j = r.int(0, i); [order[i], order[j]] = [order[j] as number, order[i] as number]; }
  for (const i of order) { if (extra <= 0) break; counts[i]!++; extra--; }

  const events: CalEvent[] = [];
  const evByAsset = new Map<string, CalEvent[]>();
  const yearSeq = new Map<string, number>();
  const calId = (asset: string, date: string) => { const k = `${asset}-${date.slice(0, 4)}`; const n = (yearSeq.get(k) ?? 0) + 1; yearSeq.set(k, n); return `CAL-${k}-${pad(n)}`; };
  assets.forEach((a, idx) => {
    const t = typeById.get(a.instrument_type_id)!;
    const k = counts[idx]!;
    const mode = modes[idx]!;
    const intervalAt = (d: string) => selectPlan(plans, a.instrument_type_id, d)!.interval_days;
    // dates from latest backward
    const dates: string[] = new Array(k);
    const fails: boolean[] = new Array(k).fill(false);
    const I = intervalAt(sim);
    let last: string;
    if (mode === "scheduled" || mode === "inprogress") last = mode === "scheduled" ? addDays(sim, r.int(3, 28)) : addDays(sim, -r.int(1, 3));
    else if (mode === "overdue") last = addDays(sim, -I - r.int(10, Math.max(20, Math.floor(I * 0.5))));
    else last = addDays(sim, -r.int(5, Math.floor(I * 0.85)));
    dates[k - 1] = last;
    if (mode === "failed") fails[k - 1] = true;
    for (let j = k - 2; j >= 0; j--) {
      fails[j] = r.chance(0.05);
      const nextD = dates[j + 1]!;
      if (j === k - 2 && (mode === "scheduled" || mode === "inprogress")) { dates[j] = addDays(nextD, -intervalAt(addDays(nextD, -I)) + r.int(0, 5)); continue; }
      dates[j] = fails[j] ? addDays(nextD, -r.int(7, 14)) : addDays(nextD, -intervalAt(addDays(nextD, -I)) + r.int(0, 7));
    }
    for (let j = 0; j < k; j++) {
      const d = dates[j]!;
      const plan = selectPlan(plans, a.instrument_type_id, d)!;
      const future = (mode === "scheduled" || mode === "inprogress") && j === k - 1;
      const id = calId(a.asset_id, d);
      const sup = r.pick(calSuppliers).id;
      if (future) {
        const ev: CalEvent = { calibration_id: id, asset_id: a.asset_id, plan_id: plan.plan_id, supplier_id: sup, scheduled_date: d, calibration_date: null, next_due_date: null, result: null, measured_value: null, reference_value: null, tolerance_used: plan.tolerance, interval_days_used: plan.interval_days, event_status: mode === "scheduled" ? "SCHEDULED" : "IN_PROGRESS" };
        events.push(ev); (evByAsset.get(a.asset_id) ?? evByAsset.set(a.asset_id, []).get(a.asset_id)!).push(ev);
        continue;
      }
      const ref = t.nominal;
      const dev = fails[j] ? plan.tolerance * (1.2 + r.next() * 1.3) * (r.chance(0.5) ? 1 : -1) : plan.tolerance * (r.next() * 1.6 - 0.8);
      const measured = round(ref + dev);
      const result = evaluateMeasurement(measured, ref, plan.tolerance);
      const ev: CalEvent = {
        calibration_id: id, asset_id: a.asset_id, plan_id: plan.plan_id, supplier_id: sup, scheduled_date: addDays(d, -r.int(0, 3)), calibration_date: d,
        next_due_date: result === "PASS" ? computeDueDate(d, plan.interval_days) : null, result, measured_value: measured, reference_value: ref,
        tolerance_used: plan.tolerance, interval_days_used: plan.interval_days, event_status: result === "PASS" ? "COMPLETED" : "FAILED",
      };
      events.push(ev); (evByAsset.get(a.asset_id) ?? evByAsset.set(a.asset_id, []).get(a.asset_id)!).push(ev);
    }
  });

  // 6 certificates (baseline valid)
  const certificates: Certificate[] = [];
  for (const e of events) {
    if (e.event_status !== "COMPLETED") continue;
    const p = planById.get(e.plan_id)!;
    if (!p.requires_certificate && !r.chance(0.5)) continue;
    const expiry = e.next_due_date!;
    certificates.push({ certificate_id: `CERT-${e.calibration_id}`, calibration_id: e.calibration_id, asset_id: e.asset_id, issue_date: addDays(e.calibration_date!, r.int(0, 2)), expiry_date: expiry, certificate_status: expiry <= sim ? "EXPIRED" : "VALID", document_reference: `SYNTHETIC/${e.calibration_id}.pdf` });
  }

  const truth: { entity_type: string; entity_id: string; issue_type: IssueType; expected_decision: string | null }[] = [];
  const label = (issue_type: IssueType, entity_type: string, entity_id: string, expected_decision: string | null = null) => truth.push({ issue_type, entity_type, entity_id, expected_decision });
  const A = S.anomalies;
  const passEvents = events.filter((e) => e.event_status === "COMPLETED");
  const takeDistinct = <T,>(pool: T[], n: number, used: Set<T>) => { const out: T[] = []; let guard = 0; while (out.length < n && guard++ < pool.length * 20) { const x = r.pick(pool); if (!used.has(x)) { used.add(x); out.push(x); } } return out; };
  const touched = new Set<CalEvent>();

  // Scenario 1: due date inconsistent with plan
  for (const e of takeDistinct(passEvents, A, touched)) { e.next_due_date = addDays(computeDueDate(e.calibration_date!, e.interval_days_used), (r.chance(0.5) ? 1 : -1) * r.int(10, 40)); label("DUE_DATE_PLAN_MISMATCH", "calibration_event", e.calibration_id); }
  // Missing required certificates
  const certByCal = new Map(certificates.map((c) => [c.calibration_id, c]));
  const reqCertEvents = passEvents.filter((e) => planById.get(e.plan_id)!.requires_certificate && certByCal.has(e.calibration_id));
  for (const e of takeDistinct(reqCertEvents, A, touched)) { certificates.splice(certificates.indexOf(certByCal.get(e.calibration_id)!), 1); certByCal.delete(e.calibration_id); label("CERTIFICATE_MISSING", "calibration_event", e.calibration_id); }
  // Scenario 3: certificate refers to another asset
  const certPool = passEvents.filter((e) => certByCal.has(e.calibration_id));
  for (const e of takeDistinct(certPool, A, touched)) { const c = certByCal.get(e.calibration_id)!; let other = r.pick(assets).asset_id; while (other === e.asset_id) other = r.pick(assets).asset_id; c.asset_id = other; label("CERTIFICATE_ASSET_MISMATCH", "certificate", c.certificate_id); }
  // Expired certificates
  for (const e of takeDistinct(certPool, A, touched)) { const c = certByCal.get(e.calibration_id)!; c.expiry_date = addDays(c.issue_date, Math.floor(e.interval_days_used / 2)); c.certificate_status = c.expiry_date <= sim ? "EXPIRED" : "VALID"; label("CERTIFICATE_EXPIRED", "certificate", c.certificate_id); }

  // 7 exceptions on overdue assets
  const exceptions: ExceptionRec[] = [];
  const overdueAssets = assets.filter((_, i) => modes[i] === "overdue");
  const noExtOverdue: typeof assets = [];
  const badExt: { asset: (typeof assets)[number]; ex: ExceptionRec }[] = [];
  const goodExt: ExceptionRec[] = [];
  let exN = 0;
  overdueAssets.forEach((a, i) => {
    const lp = [...evByAsset.get(a.asset_id)!].filter((e) => e.event_status === "COMPLETED").pop();
    if (!lp) return;
    const due = computeDueDate(lp.calibration_date!, lp.interval_days_used);
    const g = i % 3;
    if (g === 2) { noExtOverdue.push(a); return; }
    const status = g === 0 ? "APPROVED" : (["REJECTED", "REVOKED", "EXPIRED"] as const)[i % 9 < 3 ? 0 : i % 9 < 6 ? 1 : 2];
    const ex: ExceptionRec = { exception_id: `EXC-${pad(++exN)}`, asset_id: a.asset_id, approval_status: status, approved_by: status === "REJECTED" ? null : "quality.lead@plant.example", valid_from: `${due}T00:00:00Z`, valid_until: `${addDays(due, 14)}T00:00:00Z`, scope: r.chance(0.7) ? "ALL_LINES" : r.pick(LINES), reason: "Supplier backlog; emergency production run" };
    exceptions.push(ex);
    if (status === "APPROVED") goodExt.push(ex); else badExt.push({ asset: a, ex });
  });

  // 9 production use (exact total U)
  const ctxFor = (a: AssetLite) => ({ asset: a, events: evByAsset.get(a.asset_id) ?? [], certsByCal: certByCal, exceptions: exceptions.filter((x) => x.asset_id === a.asset_id), plansById: planById, enforceCurrentLifecycle: false });
  const assetById = new Map(assets.map((a) => [a.asset_id, a]));
  const production_use: { use_id: string; asset_id: string; used_at: string; production_line: string; operation_id: string; decision: string; reason_code: string | null; rule_id: string; exception_id: string | null; calibration_id: string | null; created_at: string }[] = [];
  const usedIds = new Set<string>();
  const pushUse = (a: AssetLite, at: string, line: string, exception_id: string | null, forceDecision?: { decision: string; reason: string; rule: string }) => {
    const ev = evaluateUse({ ...ctxFor(a), line }, at);
    let id = `USE-${a.asset_id}-${compactTimestamp(at)}`;
    for (let s = 2; usedIds.has(id); s++) id = `USE-${a.asset_id}-${compactTimestamp(at)}-${s}`;
    usedIds.add(id);
    const decision = forceDecision?.decision ?? recordedUseDecision(ev);
    production_use.push({ use_id: id, asset_id: a.asset_id, used_at: at, production_line: line, operation_id: `OP-${pad(r.int(1, 9999), 4)}`, decision, reason_code: forceDecision ? forceDecision.reason : decision === "ALLOWED" ? null : ev.reason_code, rule_id: forceDecision?.rule ?? ev.rule_id, exception_id: exception_id ?? ev.exception_id, calibration_id: ev.calibration_id, created_at: at });
    return ev;
  };
  const randTs = (from: string, to: string) => { const s = toDate(from).getTime(), e = toDate(to).getTime(); const q = 15 * 60_000; return new Date(Math.floor((s + r.next() * (e - s - q)) / q) * q).toISOString().replace(".000Z", "Z"); };
  // Scenario 2: expired use without exception
  for (const a of noExtOverdue.slice(0, A)) {
    const lp = (evByAsset.get(a.asset_id) ?? []).filter((e) => e.event_status === "COMPLETED").pop()!;
    const due = computeDueDate(lp.calibration_date!, lp.interval_days_used);
    pushUse(a, randTs(`${due}T00:00:00Z`, `${sim}T00:00:00Z`), r.pick(LINES), null);
    label("EXPIRED_USE_WITHOUT_EXCEPTION", "production_use", production_use[production_use.length - 1]!.use_id, "BLOCKED");
  }
  // Unauthorized extension reliance
  for (const { asset, ex } of badExt.slice(0, A)) {
    const at = randTs(ex.valid_from, ex.valid_until);
    pushUse(asset, at, ex.scope === "ALL_LINES" ? r.pick(LINES) : ex.scope, ex.exception_id, { decision: "FLAGGED_FOR_REVIEW", reason: "UNAUTHORIZED_EXTENSION", rule: RULE_IDS.UNAUTHORIZED_EXTENSION });
    label("UNAUTHORIZED_EXTENSION", "production_use", production_use[production_use.length - 1]!.use_id, "BLOCKED");
  }
  // Authorized extension uses (valid baseline)
  for (const ex of goodExt) for (let k = 0; k < 3; k++) {
    const a = assetById.get(ex.asset_id)!;
    const line = ex.scope === "ALL_LINES" ? r.pick(LINES) : ex.scope;
    const at = randTs(ex.valid_from, ex.valid_until < `${sim}T00:00:00Z` ? ex.valid_until : `${sim}T00:00:00Z`);
    if (evaluateUse({ ...ctxFor(a), line }, at).decision === "ALLOWED") pushUse(a, at, line, null);
  }
  // Baseline allowed uses
  const active = assets.filter((a) => a.lifecycle_status !== "RETIRED" || a.retired_at);
  while (production_use.length < S.uses) {
    for (let tries = 0; tries < 50; tries++) {
      const a = r.pick(active);
      const at = randTs(`${cfg.simStart}T00:00:00Z`, `${sim}T00:00:00Z`);
      const line = r.pick(LINES);
      const ev = evaluateUse({ ...ctxFor(a), line }, at);
      if (ev.decision === "ALLOWED" && ev.reason_code === "WITHIN_VALIDITY") { pushUse(a, at, line, null); break; }
    }
  }
  production_use.sort((x, y) => (x.used_at < y.used_at ? -1 : x.used_at > y.used_at ? 1 : x.use_id < y.use_id ? -1 : 1));

  // 8 work orders + downtime
  const work_orders: { work_order_id: string; asset_id: string; calibration_id: string | null; work_order_type: string; priority: string; status: string; assigned_to: string | null; created_at: string; due_at: string; started_at: string | null; completed_at: string | null; cancel_reason: string | null; downtime_hours: number; updated_at: string }[] = [];
  const downtime_events: { downtime_id: string; asset_id: string; work_order_id: string; start_at: string; end_at: string; reason: string; created_at: string }[] = [];
  const woSeq = new Map<string, number>();
  const woId = (d: string) => { const y = d.slice(0, 4); const n = (woSeq.get(y) ?? 0) + 1; woSeq.set(y, n); return `WO-${y}-${pad(n)}`; };
  const techs = ["m.ortega", "s.iyer", "k.nakamura", "a.mensah", "l.fischer"];
  const sortedEvents = [...events].sort((x, y) => {
    const a = x.calibration_date ?? x.scheduled_date ?? "";
    const b = y.calibration_date ?? y.scheduled_date ?? "";
    return a.localeCompare(b) || x.calibration_id.localeCompare(y.calibration_id);
  });
  for (const e of sortedEvents) {
    const d = (e.calibration_date ?? e.scheduled_date)!;
    const created = `${addDays(d, -7)}T08:00:00Z`;
    const id = woId(created);
    if (e.event_status === "SCHEDULED" || e.event_status === "IN_PROGRESS") {
      const ip = e.event_status === "IN_PROGRESS";
      work_orders.push({ work_order_id: id, asset_id: e.asset_id, calibration_id: e.calibration_id, work_order_type: "CALIBRATION", priority: "MEDIUM", status: ip ? "IN_PROGRESS" : "OPEN", assigned_to: r.pick(techs), created_at: created, due_at: `${addDays(d, ip ? 1 : 2)}T17:00:00Z`, started_at: ip ? `${d}T08:00:00Z` : null, completed_at: null, cancel_reason: null, downtime_hours: 0, updated_at: created });
      if (ip && addDays(d, 1) < sim) label("OVERDUE_WORK_ORDER", "work_order", id);
      continue;
    }
    const hours = r.int(1, 6);
    const start = `${d}T08:00:00Z`, end = `${d}T${String(8 + hours).padStart(2, "0")}:00:00Z`;
    work_orders.push({ work_order_id: id, asset_id: e.asset_id, calibration_id: e.calibration_id, work_order_type: "CALIBRATION", priority: "MEDIUM", status: "COMPLETED", assigned_to: r.pick(techs), created_at: created, due_at: `${d}T17:00:00Z`, started_at: start, completed_at: end, cancel_reason: null, downtime_hours: hours, updated_at: end });
    downtime_events.push({ downtime_id: `DT-${pad(downtime_events.length + 1)}`, asset_id: e.asset_id, work_order_id: id, start_at: start, end_at: end, reason: "Calibration", created_at: end });
  }
  // Open maintenance backlog, some overdue
  for (let k = 0; k < A * 2; k++) {
    const a = r.pick(assets.filter((x) => x.lifecycle_status === "ACTIVE"));
    const created = `${addDays(sim, -r.int(20, 60))}T09:00:00Z`;
    const overdue = k % 2 === 0;
    const id = woId(created);
    work_orders.push({ work_order_id: id, asset_id: a.asset_id, calibration_id: null, work_order_type: "MAINTENANCE", priority: r.pick(["LOW", "MEDIUM", "HIGH"]), status: "OPEN", assigned_to: r.pick(techs), created_at: created, due_at: overdue ? `${addDays(sim, -r.int(2, 15))}T17:00:00Z` : `${addDays(sim, r.int(3, 30))}T17:00:00Z`, started_at: null, completed_at: null, cancel_reason: null, downtime_hours: 0, updated_at: created });
    if (overdue) label("OVERDUE_WORK_ORDER", "work_order", id);
  }

  // 10-11 corrective actions & impact assessments for failed calibrations
  const failed = events.filter((e) => e.event_status === "FAILED");
  const iaMissing = new Set(takeDistinct(failed, Math.min(A, Math.floor(failed.length / 2)), new Set()).map((e) => e.calibration_id));
  const corrective_actions: Record<string, unknown>[] = [];
  const impact_assessments: Record<string, unknown>[] = [];
  const usesByAsset = new Map<string, string[]>();
  for (const u of production_use) (usesByAsset.get(u.asset_id) ?? usesByAsset.set(u.asset_id, []).get(u.asset_id)!).push(u.used_at);
  failed.forEach((e, i) => {
    label("CALIBRATION_FAILED", "calibration_event", e.calibration_id);
    const evs = evByAsset.get(e.asset_id)!;
    const later = evs.some((x) => x.event_status === "COMPLETED" && x.calibration_date! > e.calibration_date!);
    const prevPass = evs.filter((x) => x.event_status === "COMPLETED" && x.calibration_date! < e.calibration_date!).pop();
    const w = impactWindow(e.calibration_date!, prevPass?.calibration_date ?? null, e.interval_days_used);
    const affected = (usesByAsset.get(e.asset_id) ?? []).filter((t) => t >= w.start && t < w.end).length;
    const created = `${e.calibration_date}T18:00:00Z`;
    corrective_actions.push({ corrective_action_id: `CA-${pad(i + 1)}`, asset_id: e.asset_id, calibration_id: e.calibration_id, alert_id: null, action_type: "RECALIBRATE_OR_REPAIR", priority: "HIGH", status: later ? "COMPLETED" : i % 2 ? "IN_PROGRESS" : "OPEN", assigned_to: r.pick(techs), due_at: `${addDays(e.calibration_date!, 14)}T17:00:00Z`, completed_at: later ? `${addDays(e.calibration_date!, 6)}T16:00:00Z` : null, approved_by: later ? "quality.lead@plant.example" : null, root_cause: later ? "Sensor drift; element replaced" : null, resolution_notes: later ? "Repaired and recalibrated" : null, created_at: created, updated_at: created });
    if (iaMissing.has(e.calibration_id)) { label("IMPACT_ASSESSMENT_MISSING", "calibration_event", e.calibration_id); return; }
    impact_assessments.push({ assessment_id: `IA-${pad(impact_assessments.length + 1)}`, asset_id: e.asset_id, calibration_id: e.calibration_id, status: later ? "COMPLETED" : "IN_PROGRESS", assessment_start: w.start, assessment_end: w.end, findings: later ? `${affected} production uses reviewed in window` : null, affected_use_count: affected, conclusion: later ? "No product impact beyond tolerance band" : null, assessed_by: later ? "quality.lead@plant.example" : null, completed_at: later ? `${addDays(e.calibration_date!, 10)}T12:00:00Z` : null, created_at: created, updated_at: created });
  });

  // 12 alerts = detector output on the generated operational data (no ground truth used)
  const { findings } = detect({ simDate: sim, plans, assets, events, certificates, exceptions, uses: production_use, workOrders: work_orders, impactAssessments: impact_assessments as { calibration_id: string }[] });
  const caByCal = new Map(corrective_actions.map((c) => [c.calibration_id as string, c]));
  const alerts = findings.map((f, i) => {
    const ca = f.issue_type === "CALIBRATION_FAILED" ? caByCal.get(f.entity_id) : undefined;
    const resolved = ca?.status === "COMPLETED";
    return { alert_id: `ALR-${pad(i + 1)}`, asset_id: f.asset_id && assetById.has(f.asset_id) ? f.asset_id : null, related_entity_type: f.entity_type, related_entity_id: f.entity_id, issue_type: f.issue_type, severity: f.severity, status: resolved ? "RESOLVED" : "OPEN", rule_id: f.rule_id, explanation: f.explanation, details: f.details, assigned_to: null, created_at: `${sim}T00:00:00Z`, resolved_at: resolved ? (ca!.completed_at as string) : null, updated_at: `${sim}T00:00:00Z` };
  });

  // 13 audit + state history (deterministic timestamps)
  const audit_records = assets.map((a) => ({ entity_type: "asset", entity_id: a.asset_id, action: "CREATE", old_value: null, new_value: { lifecycle_status: a.lifecycle_status }, actor: "system:generator", timestamp: a.created_at, reason: "Synthetic data generation" }));
  const state_history = [
    ...failed.map((e) => ({ entity_type: "calibration_event", entity_id: e.calibration_id, previous_state: "IN_PROGRESS", new_state: "FAILED", reason: "Measured deviation outside tolerance", actor: "system:generator", changed_at: `${e.calibration_date}T12:00:00Z`, related: { asset_id: e.asset_id } })),
    ...assets.filter((a) => a.lifecycle_status !== "ACTIVE").map((a) => ({ entity_type: "asset", entity_id: a.asset_id, previous_state: "ACTIVE", new_state: a.lifecycle_status, reason: a.lifecycle_status === "RETIRED" ? "End of service life" : "Failed calibration", actor: "system:generator", changed_at: a.retired_at ?? `${sim}T00:00:00Z`, related: null })),
  ];

  // 14 ground truth (separate)
  const ground_truth_cases = truth.map((t, i) => ({ case_id: `GT-${pad(i + 1)}`, entity_type: t.entity_type, entity_id: t.entity_id, issue_type: t.issue_type, expected_decision: t.expected_decision, expected_violation: true, rule_id: RULE_IDS[t.issue_type], severity: SEVERITY[t.issue_type] }));

  return { config: cfg, instrument_types, suppliers, calibration_plans: plans, assets, calibration_events: events, certificates, exception_records: exceptions, work_orders, downtime_events, production_use, corrective_actions, impact_assessments, alerts, audit_records, state_history, ground_truth_cases };
}

export const ENTITY_TABLES = ["instrument_types", "suppliers", "calibration_plans", "assets", "calibration_events", "certificates", "exception_records", "work_orders", "downtime_events", "production_use", "corrective_actions", "impact_assessments", "alerts", "audit_records", "state_history", "ground_truth_cases"] as const;
export type EntityTable = (typeof ENTITY_TABLES)[number];

export function rowCounts(ds: Dataset): Record<string, number> {
  return Object.fromEntries(ENTITY_TABLES.map((t) => [t, (ds[t] as unknown[]).length]));
}

export const CHECKSUM_VERSION = "2-recursive-json";

/** Canonical serialization: stable key order, one JSON per line. */
export function canonical(rows: unknown[]): string {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value !== null && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, stable(item)]));
    return value;
  };
  return rows.map((row) => JSON.stringify(stable(row))).join("\n");
}
export async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
export async function checksums(ds: Dataset): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const t of ENTITY_TABLES) out[t] = await sha256(canonical(ds[t] as unknown[]));
  return out;
}
