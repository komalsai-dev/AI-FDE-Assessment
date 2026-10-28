import { applyOps, audit, db, getSetting, nextId, one, pad, stateChange, type Op } from "./db.server";
import { evaluateMeasurement, selectPlan } from "@/rules/calibration";
import { evaluateUse } from "@/rules/compliance";
import { computeDueDate, compactTimestamp } from "@/rules/dates";
import { assertTransition } from "@/rules/lifecycle";
import { failureRequirements, impactWindow, releaseBlockers } from "@/rules/correctiveActions";
import type { CalEvent, Certificate, ExceptionRec, Plan } from "@/rules/types";
import { ROLE_PERMISSIONS, type Role } from "./roles";
import { canonical } from "@/data/generator";
import { finiteMeasurement, independentApprover, assertOwnership, durationHours, validateSetting } from "@/rules/input";

type P = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Ctx = { actor: string; role: Role; ops: Op[] };
async function stageOps(ops: Op[], c: Ctx) { c.ops.push(...ops); }
const now = () => new Date().toISOString();
const need = (v: unknown, name: string) => { if (v === undefined || v === null || v === "") throw new Error(`${name} is required`); };

async function supplierEligible(supplierId: string | null, date: string) {
  if (!supplierId) return;
  const s = await one<P>("suppliers", "supplier_id", supplierId);
  const ok = (s.approval_status === "APPROVED" || s.approval_status === "CONDITIONAL") && (!s.valid_from || s.valid_from <= date) && (!s.valid_to || date <= s.valid_to);
  if (!ok) throw new Error(`Supplier ${supplierId} is not eligible on ${date} (status ${s.approval_status}, valid ${s.valid_from ?? "–"} → ${s.valid_to ?? "–"}).`);
}

async function loadUseContext(assetId: string) {
  const { data: eventIds, error: idsError } = await db.from("calibration_events").select("calibration_id").eq("asset_id", assetId);
  if (idsError) throw new Error(idsError.message);
  const [asset, ev, certs, ex, plans] = await Promise.all([
    one<P>("assets", "asset_id", assetId),
    db.from("calibration_events").select("*").eq("asset_id", assetId),
    db.from("certificates").select("*").in("calibration_id", eventIds?.map((x: P) => x.calibration_id) ?? []),
    db.from("exception_records").select("*").eq("asset_id", assetId),
    db.from("calibration_plans").select("*"),
  ]);
  for (const result of [ev, certs, ex, plans]) if (result.error) throw new Error(result.error.message);
  const num = (e: P) => ({ ...e, tolerance_used: Number(e.tolerance_used), measured_value: e.measured_value == null ? null : Number(e.measured_value), reference_value: e.reference_value == null ? null : Number(e.reference_value) });
  return {
    asset, events: (ev.data ?? []).map(num) as CalEvent[], certsByCal: new Map(((certs.data ?? []) as Certificate[]).map((c) => [c.calibration_id, c])),
    exceptions: (ex.data ?? []) as ExceptionRec[], plansById: new Map(((plans.data ?? []) as Plan[]).map((p) => [p.plan_id, { ...p, tolerance: Number(p.tolerance) }])),
  };
}

/** Next sequence for a prefix that never collides with generated IDs (counter is advanced past the current max). */
async function nextFree(prefix: string, table: string, pk: string) {
  const { data } = await db.from(table).select(pk).like(pk, `${prefix}-%`).order(pk, { ascending: false }).limit(1);
  const max = data?.[0] ? Number(String(data[0][pk]).slice(prefix.length + 1, prefix.length + 7)) || 0 : 0;
  let n = await nextId(prefix);
  if (n <= max) { await db.from("id_counters").update({ value: max }).eq("prefix", prefix); n = await nextId(prefix); }
  return `${prefix}-${pad(n)}`;
}
const newCalId = (assetId: string, date: string) => nextFree(`CAL-${assetId}-${date.slice(0, 4)}`, "calibration_events", "calibration_id");
const newWoId = (date = now()) => nextFree(`WO-${date.slice(0, 4)}`, "work_orders", "work_order_id");

export const handlers: Record<string, (p: P, c: Ctx) => Promise<unknown>> = {
  // ── Assets
  "asset.create": async (p, c) => {
    for (const k of ["asset_name", "instrument_type_id", "location"]) need(p[k], k);
    const id = `AST-${pad(await nextId("AST"))}`;
    const values = { asset_id: id, asset_name: p.asset_name, instrument_type_id: p.instrument_type_id, supplier_id: p.supplier_id || null, location: p.location, serial_number: p.serial_number || null, lifecycle_status: "ACTIVE", commissioned_on: p.commissioned_on || null };
    await stageOps([{ op: "insert", table: "assets", values }, audit("asset", id, "CREATE", c.actor, null, values), stateChange("asset", id, null, "ACTIVE", c.actor, "Registered")], c);
    return { id };
  },
  "asset.update": async (p, c) => {
    const old = await one<P>("assets", "asset_id", p.asset_id);
    const values: P = {};
    for (const k of ["asset_name", "location", "serial_number", "supplier_id", "instrument_type_id"]) if (k in p.fields) values[k] = p.fields[k] || null;
    values.updated_at = now();
    await stageOps([{ op: "update", table: "assets", pk: "asset_id", id: p.asset_id, values, expect: { updated_at: old.updated_at } }, audit("asset", p.asset_id, "UPDATE", c.actor, old, values, p.reason)], c);
    return { id: p.asset_id };
  },
  "asset.retire": async (p, c) => {
    need(p.reason, "reason");
    const a = await one<P>("assets", "asset_id", p.asset_id);
    assertTransition("asset", a.lifecycle_status, "RETIRED");
    await stageOps([{ op: "update", table: "assets", pk: "asset_id", id: a.asset_id, values: { lifecycle_status: "RETIRED", retired_at: now(), updated_at: now() }, expect: { lifecycle_status: a.lifecycle_status } }, audit("asset", a.asset_id, "RETIRE", c.actor, { lifecycle_status: a.lifecycle_status }, { lifecycle_status: "RETIRED" }, p.reason), stateChange("asset", a.asset_id, a.lifecycle_status, "RETIRED", c.actor, p.reason)], c);
    return { id: a.asset_id };
  },
  "asset.release": async (p, c) => {
    need(p.reason, "reason");
    const a = await one<P>("assets", "asset_id", p.asset_id);
    assertTransition("asset", a.lifecycle_status, "ACTIVE");
    const { events } = await loadUseContext(a.asset_id);
    const lastFail = events.filter((e) => e.event_status === "FAILED").sort((x, y) => (y.calibration_date ?? "").localeCompare(x.calibration_date ?? ""))[0];
    const hasNewerPass = events.some((e) => e.event_status === "COMPLETED" && e.result === "PASS" && e.calibration_date && (!lastFail || e.calibration_date > (lastFail.calibration_date ?? "")));
    const [caRead, iaRead] = await Promise.all([
      db.from("corrective_actions").select("*", { count: "exact", head: true }).eq("asset_id", a.asset_id).or("status.neq.COMPLETED,approved_by.is.null"),
      db.from("impact_assessments").select("*", { count: "exact", head: true }).eq("asset_id", a.asset_id).neq("status", "COMPLETED"),
    ]);
    if (caRead.error) throw new Error(caRead.error.message);
    if (iaRead.error) throw new Error(iaRead.error.message);
    const openCa = caRead.count, openIa = iaRead.count;
    const assessmentRead = lastFail ? await db.from("impact_assessments").select("assessment_id").eq("calibration_id", lastFail.calibration_id) : null;
    if (assessmentRead?.error) throw new Error(assessmentRead.error.message);
    const missingIa = lastFail && !assessmentRead?.data?.length ? 1 : 0;
    const blockers = releaseBlockers({ hasNewerPass, openCorrectiveActions: openCa ?? 0, incompleteAssessments: (openIa ?? 0) + missingIa });
    if (blockers.length) throw new Error(`Release blocked: ${blockers.join(" ")}`);
    await stageOps([{ op: "update", table: "assets", pk: "asset_id", id: a.asset_id, values: { lifecycle_status: "ACTIVE", updated_at: now() }, expect: { lifecycle_status: "QUARANTINED", updated_at: a.updated_at } }, audit("asset", a.asset_id, "RELEASE", c.actor, { lifecycle_status: "QUARANTINED" }, { lifecycle_status: "ACTIVE" }, p.reason), stateChange("asset", a.asset_id, "QUARANTINED", "ACTIVE", c.actor, p.reason)], c);
    return { id: a.asset_id };
  },

  // ── Calibration
  "cal.schedule": async (p, c) => {
    need(p.asset_id, "asset_id"); need(p.scheduled_date, "scheduled_date");
    const a = await one<P>("assets", "asset_id", p.asset_id);
    if (a.lifecycle_status === "RETIRED") throw new Error("Cannot schedule calibration for a retired asset.");
    const { data: plans, error: planError } = await db.from("calibration_plans").select("*");
    if (planError) throw new Error(planError.message);
    const plan = selectPlan((plans as Plan[]).map((x) => ({ ...x, tolerance: Number(x.tolerance) })), a.instrument_type_id, p.scheduled_date);
    if (!plan) throw new Error(`No calibration plan effective for ${a.instrument_type_id} on ${p.scheduled_date}.`);
    await supplierEligible(p.supplier_id || null, p.scheduled_date);
    const id = await newCalId(a.asset_id, p.scheduled_date);
    const values = { calibration_id: id, asset_id: a.asset_id, plan_id: plan.plan_id, supplier_id: p.supplier_id || null, scheduled_date: p.scheduled_date, tolerance_used: plan.tolerance, interval_days_used: plan.interval_days, event_status: "SCHEDULED" };
    const ops: Op[] = [{ op: "insert", table: "calibration_events", values }, audit("calibration_event", id, "SCHEDULE", c.actor, null, values), stateChange("calibration_event", id, null, "SCHEDULED", c.actor)];
    if (p.create_work_order) {
      const wo = await newWoId();
      const w = { work_order_id: wo, asset_id: a.asset_id, calibration_id: id, work_order_type: "CALIBRATION", priority: "MEDIUM", status: "OPEN", assigned_to: p.assigned_to || null, due_at: `${p.scheduled_date}T17:00:00Z` };
      ops.push({ op: "insert", table: "work_orders", values: w }, audit("work_order", wo, "CREATE", c.actor, null, w), stateChange("work_order", wo, null, "OPEN", c.actor));
    }
    await stageOps(ops, c);
    return { id };
  },
  "cal.reschedule": async (p, c) => {
    need(p.scheduled_date, "scheduled_date"); need(p.reason, "reason");
    const e = await one<P>("calibration_events", "calibration_id", p.calibration_id);
    if (e.event_status !== "SCHEDULED") throw new Error("Only scheduled events can be rescheduled.");
    const asset = await one<P>("assets", "asset_id", e.asset_id);
    const planRead = await db.from("calibration_plans").select("*");
    if (planRead.error) throw new Error(planRead.error.message);
    const plan = selectPlan(planRead.data, asset.instrument_type_id, p.scheduled_date);
    if (!plan) throw new Error("No plan effective on the requested date");
    await supplierEligible(e.supplier_id, p.scheduled_date);
    await stageOps([{ op: "update", table: "calibration_events", pk: "calibration_id", id: e.calibration_id, values: { scheduled_date: p.scheduled_date, plan_id: plan.plan_id, tolerance_used: plan.tolerance, interval_days_used: plan.interval_days, updated_at: now() }, expect: { event_status: "SCHEDULED" } }, audit("calibration_event", e.calibration_id, "RESCHEDULE", c.actor, { scheduled_date: e.scheduled_date }, { scheduled_date: p.scheduled_date }, p.reason)], c);
    return { id: e.calibration_id };
  },
  "cal.assignSupplier": async (p, c) => {
    const e = await one<P>("calibration_events", "calibration_id", p.calibration_id);
    if (!["SCHEDULED", "IN_PROGRESS"].includes(e.event_status)) throw new Error("Supplier can only be changed before completion.");
    await supplierEligible(p.supplier_id, e.scheduled_date ?? now().slice(0, 10));
    await stageOps([{ op: "update", table: "calibration_events", pk: "calibration_id", id: e.calibration_id, values: { supplier_id: p.supplier_id, updated_at: now() }, expect: { event_status: e.event_status } }, audit("calibration_event", e.calibration_id, "ASSIGN_SUPPLIER", c.actor, { supplier_id: e.supplier_id }, { supplier_id: p.supplier_id })], c);
    return { id: e.calibration_id };
  },
  "cal.start": async (p, c) => {
    const e = await one<P>("calibration_events", "calibration_id", p.calibration_id);
    assertTransition("calibration", e.event_status, "IN_PROGRESS");
    await stageOps([{ op: "update", table: "calibration_events", pk: "calibration_id", id: e.calibration_id, values: { event_status: "IN_PROGRESS", updated_at: now() }, expect: { event_status: e.event_status } }, audit("calibration_event", e.calibration_id, "START", c.actor, { event_status: e.event_status }, { event_status: "IN_PROGRESS" }), stateChange("calibration_event", e.calibration_id, e.event_status, "IN_PROGRESS", c.actor)], c);
    return { id: e.calibration_id };
  },
  "cal.cancel": async (p, c) => {
    need(p.reason, "reason");
    const e = await one<P>("calibration_events", "calibration_id", p.calibration_id);
    assertTransition("calibration", e.event_status, "CANCELLED");
    await stageOps([{ op: "update", table: "calibration_events", pk: "calibration_id", id: e.calibration_id, values: { event_status: "CANCELLED", cancel_reason: p.reason, updated_at: now() }, expect: { event_status: e.event_status } }, audit("calibration_event", e.calibration_id, "CANCEL", c.actor, { event_status: e.event_status }, { event_status: "CANCELLED" }, p.reason), stateChange("calibration_event", e.calibration_id, e.event_status, "CANCELLED", c.actor, p.reason)], c);
    return { id: e.calibration_id };
  },
  "cal.complete": async (p, c) => {
    need(p.calibration_date, "calibration_date"); need(p.measured_value, "measured_value"); need(p.reference_value, "reference_value");
    const e = await one<P>("calibration_events", "calibration_id", p.calibration_id);
    assertTransition("calibration", e.event_status, "COMPLETED");
    const measured = finiteMeasurement(p.measured_value, "measured_value");
    const reference = finiteMeasurement(p.reference_value, "reference_value");
    await supplierEligible(e.supplier_id, p.calibration_date);
    const assetForPlan = await one<P>("assets", "asset_id", e.asset_id);
    const planRead = await db.from("calibration_plans").select("*");
    if (planRead.error) throw new Error(planRead.error.message);
    const effectivePlan = selectPlan(planRead.data, assetForPlan.instrument_type_id, p.calibration_date);
    if (!effectivePlan || effectivePlan.plan_id !== e.plan_id) throw new Error("Actual calibration date requires a different plan; reschedule under that plan before completion.");
    const tol = Number(e.tolerance_used);
    const result = evaluateMeasurement(measured, reference, tol);
    const status = result === "PASS" ? "COMPLETED" : "FAILED";
    const due = result === "PASS" ? computeDueDate(p.calibration_date, e.interval_days_used) : null;
    const values = { event_status: status, result, calibration_date: p.calibration_date, measured_value: Number(p.measured_value), reference_value: Number(p.reference_value), next_due_date: due, updated_at: now() };
    const ops: Op[] = [
      { op: "update", table: "calibration_events", pk: "calibration_id", id: e.calibration_id, values, expect: { event_status: "IN_PROGRESS" } },
      audit("calibration_event", e.calibration_id, "COMPLETE", c.actor, { event_status: e.event_status }, values),
      stateChange("calibration_event", e.calibration_id, "IN_PROGRESS", status, c.actor, `Deviation ${Math.abs(Number(p.measured_value) - Number(p.reference_value)).toFixed(4)} vs tolerance ±${tol}`),
    ];
    if (result === "PASS" && p.issue_certificate) {
      const cert = { certificate_id: `CERT-${e.calibration_id}`, calibration_id: e.calibration_id, asset_id: e.asset_id, issue_date: p.calibration_date, expiry_date: due, certificate_status: "VALID", document_reference: p.document_reference || `SYNTHETIC/${e.calibration_id}.pdf` };
      ops.push({ op: "insert", table: "certificates", values: cert }, audit("certificate", cert.certificate_id, "CREATE", c.actor, null, cert));
    }
    let created: P = {};
    if (result === "FAIL") {
      const req = failureRequirements(e.calibration_id, e.asset_id, p.calibration_date);
      const asset = await one<P>("assets", "asset_id", e.asset_id);
      const ctx = await loadUseContext(e.asset_id);
      const prevPass = ctx.events.filter((x) => x.event_status === "COMPLETED" && x.calibration_date! < p.calibration_date).sort((x, y) => (x.calibration_date! < y.calibration_date! ? -1 : 1)).pop();
      const w = impactWindow(p.calibration_date, prevPass?.calibration_date ?? null, e.interval_days_used);
      const { count, error: countError } = await db.from("production_use").select("*", { count: "exact", head: true }).eq("asset_id", e.asset_id).gte("used_at", w.start).lt("used_at", w.end);
      if (countError) throw new Error(countError.message);
      const alertId = `ALR-${pad(await nextId("ALR"), 6)}-L`;
      const caId = `CA-${pad(await nextId("CA"))}-L`;
      const iaId = `IA-${pad(await nextId("IA"))}-L`;
      if (asset.lifecycle_status === "ACTIVE")
        ops.push({ op: "update", table: "assets", pk: "asset_id", id: e.asset_id, values: { lifecycle_status: "QUARANTINED", updated_at: now() }, expect: { lifecycle_status: "ACTIVE" } }, stateChange("asset", e.asset_id, "ACTIVE", "QUARANTINED", c.actor, `Failed calibration ${e.calibration_id}`), audit("asset", e.asset_id, "QUARANTINE", c.actor, { lifecycle_status: "ACTIVE" }, { lifecycle_status: "QUARANTINED" }, `Failed calibration ${e.calibration_id}`));
      ops.push(
        { op: "insert", table: "alerts", values: { alert_id: alertId, asset_id: e.asset_id, related_entity_type: "calibration_event", related_entity_id: e.calibration_id, issue_type: "CALIBRATION_FAILED", severity: "HIGH", rule_id: "R7-CAL-FAILED", explanation: `Calibration failed: measured ${p.measured_value} vs reference ${p.reference_value}, tolerance ±${tol}.`, details: { calibration_date: p.calibration_date } } },
        { op: "insert", table: "corrective_actions", values: { corrective_action_id: caId, asset_id: e.asset_id, calibration_id: e.calibration_id, alert_id: alertId, action_type: req.correctiveAction.action_type, priority: "HIGH", status: "OPEN", due_at: new Date(Date.now() + 14 * 864e5).toISOString() } },
        { op: "insert", table: "impact_assessments", values: { assessment_id: iaId, asset_id: e.asset_id, calibration_id: e.calibration_id, status: "REQUIRED", assessment_start: w.start, assessment_end: w.end, affected_use_count: count ?? 0 } },
        audit("alert", alertId, "CREATE", c.actor, null, { calibration_id: e.calibration_id, issue_type: "CALIBRATION_FAILED" }), stateChange("alert", alertId, null, "OPEN", c.actor), stateChange("corrective_action", caId, null, "OPEN", c.actor), stateChange("impact_assessment", iaId, null, "REQUIRED", c.actor),
        audit("corrective_action", caId, "CREATE", c.actor, null, { trigger: e.calibration_id }), audit("impact_assessment", iaId, "CREATE", c.actor, null, { window: w, affected_use_count: count ?? 0 }),
      );
      created = { alert_id: alertId, corrective_action_id: caId, assessment_id: iaId, affected_use_count: count ?? 0 };
    }
    await stageOps(ops, c);
    return { id: e.calibration_id, result, next_due_date: due, ...created };
  },

  // ── Certificates
  "cert.create": async (p, c) => {
    need(p.calibration_id, "calibration_id"); need(p.issue_date, "issue_date");
    const e = await one<P>("calibration_events", "calibration_id", p.calibration_id);
    if (e.event_status !== "COMPLETED") throw new Error("Certificates can only be issued for successful (COMPLETED) calibrations.");
    const assetId = p.asset_id || e.asset_id;
    if (assetId !== e.asset_id) throw new Error(`Ownership check failed: event ${e.calibration_id} belongs to ${e.asset_id}, not ${assetId}.`);
    const cert = { certificate_id: `CERT-${e.calibration_id}`, calibration_id: e.calibration_id, asset_id: assetId, issue_date: p.issue_date, expiry_date: p.expiry_date || e.next_due_date, certificate_status: "VALID", document_reference: p.document_reference || null };
    await stageOps([{ op: "insert", table: "certificates", values: cert }, audit("certificate", cert.certificate_id, "CREATE", c.actor, null, cert)], c);
    return { id: cert.certificate_id };
  },
  "cert.revoke": async (p, c) => {
    need(p.reason, "reason");
    const cert = await one<P>("certificates", "certificate_id", p.certificate_id);
    await stageOps([{ op: "update", table: "certificates", pk: "certificate_id", id: cert.certificate_id, values: { certificate_status: "REVOKED" }, expect: { certificate_status: cert.certificate_status } }, audit("certificate", cert.certificate_id, "REVOKE", c.actor, { certificate_status: cert.certificate_status }, { certificate_status: "REVOKED" }, p.reason)], c);
    return { id: cert.certificate_id };
  },

  // ── Work orders
  "wo.create": async (p, c) => {
    for (const k of ["asset_id", "work_order_type", "priority", "due_at"]) need(p[k], k);
    if (p.calibration_id) { const event = await one<P>("calibration_events", "calibration_id", p.calibration_id); assertOwnership(p.asset_id, event.asset_id); }
    const id = await newWoId();
    const values = { work_order_id: id, asset_id: p.asset_id, calibration_id: p.calibration_id || null, work_order_type: p.work_order_type, priority: p.priority, status: "OPEN", assigned_to: p.assigned_to || null, due_at: p.due_at };
    await stageOps([{ op: "insert", table: "work_orders", values }, audit("work_order", id, "CREATE", c.actor, null, values), stateChange("work_order", id, null, "OPEN", c.actor)], c);
    return { id };
  },
  "wo.update": async (p, c) => {
    const w = await one<P>("work_orders", "work_order_id", p.work_order_id);
    const values: P = { updated_at: now() };
    for (const k of ["assigned_to", "priority", "due_at"]) if (p[k] !== undefined) values[k] = p[k] || null;
    await stageOps([{ op: "update", table: "work_orders", pk: "work_order_id", id: w.work_order_id, values, expect: { updated_at: w.updated_at } }, audit("work_order", w.work_order_id, "UPDATE", c.actor, w, values)], c);
    return { id: w.work_order_id };
  },
  "wo.transition": async (p, c) => {
    const w = await one<P>("work_orders", "work_order_id", p.work_order_id);
    assertTransition("work_order", w.status, p.to);
    if (p.to === "CANCELLED") need(p.reason, "reason");
    const values: P = { status: p.to, updated_at: now() };
    if (p.to === "IN_PROGRESS" && !w.started_at) values.started_at = now();
    if (p.to === "COMPLETED") values.completed_at = now();
    if (p.to === "CANCELLED") values.cancel_reason = p.reason;
    await stageOps([{ op: "update", table: "work_orders", pk: "work_order_id", id: w.work_order_id, values, expect: { status: w.status } }, audit("work_order", w.work_order_id, `STATUS_${p.to}`, c.actor, { status: w.status }, values, p.reason), stateChange("work_order", w.work_order_id, w.status, p.to, c.actor, p.reason)], c);
    return { id: w.work_order_id, note: p.to === "COMPLETED" ? "Completing a work order does not restore calibration validity; a new successful calibration is required." : undefined };
  },
  "wo.downtime": async (p, c) => {
    need(p.start_at, "start_at"); need(p.end_at, "end_at"); need(p.reason, "reason");
    const hours = durationHours(p.start_at, p.end_at);
    const w = await one<P>("work_orders", "work_order_id", p.work_order_id);

    const id = `DT-${pad(await nextId("DT"))}-L`;
    const total = Number(w.downtime_hours) + hours;
    await stageOps([
      { op: "insert", table: "downtime_events", values: { downtime_id: id, asset_id: w.asset_id, work_order_id: w.work_order_id, start_at: p.start_at, end_at: p.end_at, reason: p.reason } },
      { op: "update", table: "work_orders", pk: "work_order_id", id: w.work_order_id, values: { downtime_hours: total, updated_at: now() }, expect: { downtime_hours: w.downtime_hours } },
      audit("work_order", w.work_order_id, "DOWNTIME", c.actor, { downtime_hours: w.downtime_hours }, { downtime_hours: total, downtime_id: id }),
    ], c);
    return { id, hours };
  },

  // ── Production use
  "use.request": async (p, c) => {
    for (const k of ["asset_id", "requested_at", "production_line"]) need(p[k], k);
    const ctx = await loadUseContext(p.asset_id);
    const at = new Date(p.requested_at).toISOString().replace(".000Z", "Z");
    const ev = evaluateUse({ ...ctx, asset: ctx.asset as never, line: p.production_line, enforceCurrentLifecycle: true }, at);
    const attemptId = `ATT-${pad(await nextId("ATT"))}`;
    const ops: Op[] = [{ op: "assert", table: "assets", pk: "asset_id", id: p.asset_id, expect: { updated_at: ctx.asset.updated_at, lifecycle_status: ctx.asset.lifecycle_status } }];
    for (const event of ctx.events) ops.push({ op: "assert", table: "calibration_events", pk: "calibration_id", id: event.calibration_id, expect: { event_status: event.event_status, result: event.result, calibration_date: event.calibration_date, plan_id: event.plan_id } });
    for (const cert of ctx.certsByCal.values()) ops.push({ op: "assert", table: "certificates", pk: "certificate_id", id: cert.certificate_id, expect: { certificate_status: cert.certificate_status, expiry_date: cert.expiry_date } });
    for (const extension of ctx.exceptions) ops.push({ op: "assert", table: "exception_records", pk: "exception_id", id: extension.exception_id, expect: { approval_status: extension.approval_status, valid_until: extension.valid_until, approved_by: extension.approved_by } });
    let useId: string | null = null;
    if (ev.decision === "ALLOWED") {
      useId = `USE-${p.asset_id}-${compactTimestamp(at)}`;
      const { data: clash } = await db.from("production_use").select("use_id").like("use_id", `${useId}%`);
      if (clash?.length) useId = `${useId}-${clash.length + 1}`;
      ops.push({ op: "insert", table: "production_use", values: { use_id: useId, asset_id: p.asset_id, used_at: at, production_line: p.production_line, operation_id: p.operation_id || null, decision: "ALLOWED", reason_code: null, rule_id: ev.rule_id, exception_id: ev.exception_id, calibration_id: ev.calibration_id } });
    }
    ops.push({ op: "insert", table: "use_attempts", values: { attempt_id: attemptId, asset_id: p.asset_id, requested_at: at, production_line: p.production_line, operation_id: p.operation_id || null, decision: ev.decision, rule_id: ev.rule_id, reason_code: ev.reason_code, explanation: ev.explanation, evaluation: ev, resulting_use_id: useId, actor: c.actor } });
    ops.push(audit("use_attempt", attemptId, `USE_${ev.decision}`, c.actor, null, ev));
    await stageOps(ops, c);
    return { attempt_id: attemptId, use_id: useId, evaluation: ev };
  },

  // ── Extensions
  "exc.create": async (p, c) => {
    for (const k of ["asset_id", "valid_from", "valid_until", "reason"]) need(p[k], k);
    const id = `EXC-${pad(await nextId("EXC"))}-L`;
    const values = { exception_id: id, asset_id: p.asset_id, approval_status: "PENDING", valid_from: p.valid_from, valid_until: p.valid_until, reason: p.reason, scope: p.scope || "ALL_LINES" };
    await stageOps([{ op: "insert", table: "exception_records", values }, audit("exception", id, "REQUEST", c.actor, null, values), stateChange("exception", id, null, "PENDING", c.actor, p.reason)], c);
    return { id };
  },
  "exc.transition": async (p, c) => {
    const x = await one<P>("exception_records", "exception_id", p.exception_id);
    assertTransition("exception", x.approval_status, p.to);
    if (["REJECTED", "REVOKED"].includes(p.to)) need(p.reason, "reason");
    const values: P = { approval_status: p.to, updated_at: now() };
    if (p.to === "APPROVED") values.approved_by = c.actor;
    await stageOps([{ op: "update", table: "exception_records", pk: "exception_id", id: x.exception_id, values, expect: { approval_status: x.approval_status } }, audit("exception", x.exception_id, p.to, c.actor, { approval_status: x.approval_status }, values, p.reason), stateChange("exception", x.exception_id, x.approval_status, p.to, c.actor, p.reason)], c);
    return { id: x.exception_id };
  },

  // ── Alerts
  "alert.transition": async (p, c) => {
    const a = await one<P>("alerts", "alert_id", p.alert_id);
    assertTransition("alert", a.status, p.to);
    if (p.to === "OPEN") need(p.reason, "reason");
    if (p.to === "RESOLVED") {
      const blockers = await alertResolutionBlockers(a);
      if (blockers.length) throw new Error(`Cannot resolve: ${blockers.join(" ")}`);
    }
    const values: P = { status: p.to, updated_at: now(), resolved_at: p.to === "RESOLVED" ? now() : null };
    await stageOps([{ op: "update", table: "alerts", pk: "alert_id", id: a.alert_id, values, expect: { status: a.status } }, audit("alert", a.alert_id, `STATUS_${p.to}`, c.actor, { status: a.status }, values, p.reason), stateChange("alert", a.alert_id, a.status, p.to, c.actor, p.reason)], c);
    return { id: a.alert_id };
  },
  "alert.assign": async (p, c) => {
    const a = await one<P>("alerts", "alert_id", p.alert_id);
    await stageOps([{ op: "update", table: "alerts", pk: "alert_id", id: a.alert_id, values: { assigned_to: p.assigned_to || null, updated_at: now() } }, audit("alert", a.alert_id, "ASSIGN", c.actor, { assigned_to: a.assigned_to }, { assigned_to: p.assigned_to })], c);
    return { id: a.alert_id };
  },
  "alert.note": async (p, c) => {
    need(p.note, "note");
    await stageOps([{ op: "insert", table: "alert_notes", values: { alert_id: p.alert_id, note: p.note, actor: c.actor } }, audit("alert", p.alert_id, "NOTE", c.actor, null, { note: p.note })], c);
    return { id: p.alert_id };
  },

  // ── Corrective actions & impact assessments
  "ca.update": async (p, c) => {
    const x = await one<P>("corrective_actions", "corrective_action_id", p.id);
    const values: P = { updated_at: now() };
    for (const k of ["assigned_to", "priority", "due_at", "root_cause", "resolution_notes"]) if (p[k] !== undefined) values[k] = p[k] || null;
    await stageOps([{ op: "update", table: "corrective_actions", pk: "corrective_action_id", id: x.corrective_action_id, values, expect: { updated_at: x.updated_at } }, audit("corrective_action", x.corrective_action_id, "UPDATE", c.actor, x, values)], c);
    return { id: p.id };
  },
  "ca.transition": async (p, c) => {
    const x = await one<P>("corrective_actions", "corrective_action_id", p.id);
    assertTransition("corrective_action", x.status, p.to);
    if (p.to === "PENDING_APPROVAL" && (!x.root_cause || !x.resolution_notes)) throw new Error("Root cause and resolution notes are required before submitting for approval.");
    if (p.to === "COMPLETED" && !independentApprover(x.assigned_to, c.actor)) throw new Error("Approval must be given by someone other than the assignee.");
    const values: P = { status: p.to, updated_at: now() };
    if (p.to === "COMPLETED") { values.completed_at = now(); values.approved_by = c.actor; }
    await stageOps([{ op: "update", table: "corrective_actions", pk: "corrective_action_id", id: x.corrective_action_id, values, expect: { status: x.status } }, audit("corrective_action", x.corrective_action_id, `STATUS_${p.to}`, c.actor, { status: x.status }, values, p.reason), stateChange("corrective_action", x.corrective_action_id, x.status, p.to, c.actor, p.reason)], c);
    return { id: p.id };
  },
  "ia.create": async (p, c) => {
    const e = await one<P>("calibration_events", "calibration_id", p.calibration_id);
    if (e.event_status !== "FAILED") throw new Error("Impact assessments are created for failed calibrations.");
    const ctx = await loadUseContext(e.asset_id);
    const prevPass = ctx.events.filter((x) => x.event_status === "COMPLETED" && x.calibration_date! < e.calibration_date).sort((x, y) => (x.calibration_date! < y.calibration_date! ? -1 : 1)).pop();
    const w = impactWindow(e.calibration_date, prevPass?.calibration_date ?? null, e.interval_days_used);
    const { count, error: countError } = await db.from("production_use").select("*", { count: "exact", head: true }).eq("asset_id", e.asset_id).gte("used_at", w.start).lt("used_at", w.end);
    if (countError) throw new Error(countError.message);
    const id = `IA-${pad(await nextId("IA"))}-L`;
    const values = { assessment_id: id, asset_id: e.asset_id, calibration_id: e.calibration_id, status: "REQUIRED", assessment_start: w.start, assessment_end: w.end, affected_use_count: count ?? 0 };
    await stageOps([{ op: "insert", table: "impact_assessments", values }, audit("impact_assessment", id, "CREATE", c.actor, null, values), stateChange("impact_assessment", id, null, "REQUIRED", c.actor)], c);
    return { id };
  },
  "ia.transition": async (p, c) => {
    const x = await one<P>("impact_assessments", "assessment_id", p.id);
    assertTransition("impact_assessment", x.status, p.to);
    const values: P = { status: p.to, updated_at: now() };
    if (p.findings !== undefined) values.findings = p.findings;
    if (p.to === "COMPLETED") { need(p.conclusion, "conclusion"); values.conclusion = p.conclusion; values.completed_at = now(); values.assessed_by = c.actor; }
    await stageOps([{ op: "update", table: "impact_assessments", pk: "assessment_id", id: x.assessment_id, values, expect: { status: x.status } }, audit("impact_assessment", x.assessment_id, `STATUS_${p.to}`, c.actor, { status: x.status }, values), stateChange("impact_assessment", x.assessment_id, x.status, p.to, c.actor)], c);
    return { id: p.id };
  },

  // ── Suppliers
  "supplier.create": async (p, c) => {
    need(p.supplier_name, "supplier_name"); need(p.approval_status, "approval_status");
    const id = `SUP-${pad(await nextId("SUP-L"), 3)}-L`;
    const values = { supplier_id: id, supplier_name: p.supplier_name, approval_status: p.approval_status, valid_from: p.valid_from || null, valid_to: p.valid_to || null };
    await stageOps([{ op: "insert", table: "suppliers", values }, audit("supplier", id, "CREATE", c.actor, null, values)], c);
    return { id };
  },
  "supplier.update": async (p, c) => {
    const s = await one<P>("suppliers", "supplier_id", p.supplier_id);
    const values: P = { updated_at: now() };
    for (const k of ["supplier_name", "approval_status", "valid_from", "valid_to"]) if (p[k] !== undefined) values[k] = p[k] || null;
    await stageOps([{ op: "update", table: "suppliers", pk: "supplier_id", id: s.supplier_id, values, expect: { updated_at: s.updated_at } }, audit("supplier", s.supplier_id, "UPDATE", c.actor, s, values, p.reason)], c);
    return { id: s.supplier_id };
  },

  // ── Settings (versioned)
  "settings.update": async (p, c) => {
    need(p.key, "key");
    validateSetting(p.key, p.value);
    const { data: s, error } = await db.from("settings").select("*").eq("key", p.key).maybeSingle();
    if (error) throw new Error(error.message);
    const version = (s?.version ?? 0) + 1;
    const ops: Op[] = s
      ? [{ op: "update", table: "settings", pk: "key", id: p.key, values: { value: p.value, version, updated_by: c.actor, updated_at: now() }, expect: { version: s.version } }]
      : [{ op: "insert", table: "settings", values: { key: p.key, value: p.value, version, updated_by: c.actor } }];
    ops.push({ op: "insert", table: "settings_history", values: { key: p.key, old_value: s?.value ?? null, new_value: p.value, version, actor: c.actor, reason: p.reason || null } }, audit("setting", p.key, "UPDATE", c.actor, s?.value ?? null, p.value, p.reason));
    await stageOps(ops, c);
    return { id: p.key, version };
  },
};

async function alertResolutionBlockers(a: P): Promise<string[]> {
  const out: string[] = [];
  if (a.issue_type === "IMPACT_ASSESSMENT_MISSING" || a.issue_type === "CALIBRATION_FAILED") {
    const { data: ia, error } = await db.from("impact_assessments").select("status").eq("calibration_id", a.related_entity_id);
    if (error) throw new Error(error.message);
    if (!ia?.length) out.push("An impact assessment must exist for this failed calibration.");
    else if (ia[0].status !== "COMPLETED") out.push("The impact assessment must be COMPLETED.");
  }
  if (a.issue_type === "CALIBRATION_FAILED") {
    const { data: ca, error } = await db.from("corrective_actions").select("status,approved_by").eq("calibration_id", a.related_entity_id);
    if (error) throw new Error(error.message);
    if (!ca?.length || ca.some((x: P) => x.status !== "COMPLETED" || !x.approved_by)) out.push("All corrective actions must be completed and approved.");
  }
  if (a.issue_type === "OVERDUE_WORK_ORDER") {
    const w = await one<P>("work_orders", "work_order_id", a.related_entity_id);
    if (!["COMPLETED", "CANCELLED"].includes(w.status)) out.push("The work order must be completed or cancelled.");
  }
  return out;
}

export async function runAction(action: string, payload: P, role: Role, actorName: string, requestId?: string) {
  const allowed = ROLE_PERMISSIONS[role];
  if (!allowed) throw new Error("Unknown role");
  if (!allowed.includes("*") && !allowed.some((pre) => action.startsWith(pre))) throw new Error(`Role ${role} is not permitted to perform ${action}.`);
  const h = handlers[action];
  if (!h) throw new Error(`Unknown action ${action}`);
  const simDate = await getSetting<string>("simulation_date", "2026-10-28");
  const actor = `${actorName} (${role})`;
  const readReceipt = async () => {
    if (!requestId) return null;
    if (!/^[0-9a-f-]{36}$/i.test(requestId)) throw new Error("Invalid request identifier");
    const { data, error } = await db.from("action_receipts").select("*").eq("request_id", requestId).maybeSingle();
    if (error) throw new Error(error.message);
    if (data && (data.action !== action || data.actor !== actor || canonical([data.payload]) !== canonical([payload]))) throw new Error("Request identifier was already used for different input");
    return data;
  };
  const prior = await readReceipt();
  if (prior) return prior.result;
  const context: Ctx = { actor, role, ops: [] };
  // All eligibility-affecting actions advance the same asset revision. The use
  // transaction locks/compares that revision, including newly inserted events.
  if (["cal.", "cert.", "exc.", "ca.", "ia."].some((prefix) => action.startsWith(prefix))) {
    let assetId = payload.asset_id as string | undefined;
    if (!assetId && payload.calibration_id) assetId = (await one<P>("calibration_events", "calibration_id", payload.calibration_id)).asset_id;
    if (!assetId && payload.certificate_id) assetId = (await one<P>("certificates", "certificate_id", payload.certificate_id)).asset_id;
    if (!assetId && payload.exception_id) assetId = (await one<P>("exception_records", "exception_id", payload.exception_id)).asset_id;
    if (!assetId && payload.corrective_action_id) assetId = (await one<P>("corrective_actions", "corrective_action_id", payload.corrective_action_id)).asset_id;
    if (!assetId && payload.assessment_id) assetId = (await one<P>("impact_assessments", "assessment_id", payload.assessment_id)).asset_id;
    if (assetId) {
      const asset = await one<P>("assets", "asset_id", assetId);
      context.ops.push({ op: "update", table: "assets", pk: "asset_id", id: assetId, values: { updated_at: now() }, expect: { updated_at: asset.updated_at } });
    }
  }
  const result = await h(payload, context);
  const response = { ok: true as const, result, simDate };
  if (requestId) context.ops.push({ op: "insert", table: "action_receipts", values: { request_id: requestId, action, actor, payload, result: response } });
  try { await applyOps(context.ops); } catch (error) {
    const concurrent = await readReceipt();
    if (concurrent) return concurrent.result;
    throw error;
  }
  return response;
}
