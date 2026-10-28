import { expectedDue, latestFinished, latestPass } from "./calibration";
import { extensionCovers, findCoveringExtension } from "./exceptions";
import { isWithinValidity, toDate } from "./dates";
import { RULE_IDS, SEVERITY, type AssetLite, type CalEvent, type Certificate, type ExceptionRec, type IssueType, type Plan } from "./types";

export type DetectorInput = {
  simDate: string;
  plans: Plan[];
  assets: AssetLite[];
  events: CalEvent[];
  certificates: Certificate[];
  exceptions: ExceptionRec[];
  uses: { use_id: string; asset_id: string; used_at: string; production_line: string; exception_id: string | null }[];
  workOrders: { work_order_id: string; asset_id: string; status: string; due_at: string }[];
  impactAssessments: { calibration_id: string }[];
};

export type Finding = {
  entity_type: "calibration_event" | "certificate" | "production_use" | "work_order";
  entity_id: string;
  asset_id: string | null;
  issue_type: IssueType;
  rule_id: string;
  severity: string;
  explanation: string;
  details: Record<string, unknown>;
};

/** Compliance detector. Reads only operational source records — never ground truth. */
export function detect(input: DetectorInput): { findings: Finding[]; checked: Record<IssueType, number> } {
  const f: Finding[] = [];
  const checked = Object.fromEntries(Object.keys(RULE_IDS).map((k) => [k, 0])) as Record<IssueType, number>;
  const add = (issue: IssueType, entity_type: Finding["entity_type"], entity_id: string, asset_id: string | null, explanation: string, details: Record<string, unknown>) =>
    f.push({ issue_type: issue, entity_type, entity_id, asset_id, rule_id: RULE_IDS[issue], severity: SEVERITY[issue], explanation, details });

  const plans = new Map(input.plans.map((p) => [p.plan_id, p]));
  const evById = new Map(input.events.map((e) => [e.calibration_id, e]));
  const certByCal = new Map(input.certificates.map((c) => [c.calibration_id, c]));
  const iaCals = new Set(input.impactAssessments.map((i) => i.calibration_id));
  const evByAsset = new Map<string, CalEvent[]>();
  for (const e of input.events) (evByAsset.get(e.asset_id) ?? evByAsset.set(e.asset_id, []).get(e.asset_id)!).push(e);
  const exByAsset = new Map<string, ExceptionRec[]>();
  for (const x of input.exceptions) (exByAsset.get(x.asset_id) ?? exByAsset.set(x.asset_id, []).get(x.asset_id)!).push(x);
  const exById = new Map(input.exceptions.map((x) => [x.exception_id, x]));

  for (const e of input.events) {
    if (e.event_status === "COMPLETED") {
      checked.DUE_DATE_PLAN_MISMATCH++;
      const exp = expectedDue(e);
      if (exp && e.next_due_date !== exp)
        add("DUE_DATE_PLAN_MISMATCH", "calibration_event", e.calibration_id, e.asset_id,
          `Stored due ${e.next_due_date} ≠ expected ${exp} (${e.calibration_date} + ${e.interval_days_used} days).`, { expected: exp, actual: e.next_due_date, plan_id: e.plan_id });
      const plan = plans.get(e.plan_id);
      checked.CERTIFICATE_MISSING++;
      if (plan?.requires_certificate && !certByCal.has(e.calibration_id))
        add("CERTIFICATE_MISSING", "calibration_event", e.calibration_id, e.asset_id, `Plan ${e.plan_id} requires a certificate; none recorded.`, { plan_id: e.plan_id });
    }
    if (e.event_status === "FAILED") {
      checked.CALIBRATION_FAILED++;
      checked.IMPACT_ASSESSMENT_MISSING++;
      add("CALIBRATION_FAILED", "calibration_event", e.calibration_id, e.asset_id,
        `Calibration failed: measured ${e.measured_value} vs reference ${e.reference_value}, tolerance ±${e.tolerance_used}.`, { calibration_date: e.calibration_date });
      if (!iaCals.has(e.calibration_id))
        add("IMPACT_ASSESSMENT_MISSING", "calibration_event", e.calibration_id, e.asset_id, `Failed calibration ${e.calibration_id} has no impact assessment.`, { calibration_date: e.calibration_date });
    }
  }

  for (const c of input.certificates) {
    const ev = evById.get(c.calibration_id);
    checked.CERTIFICATE_ASSET_MISMATCH++;
    checked.CERTIFICATE_EXPIRED++;
    if (ev && ev.asset_id !== c.asset_id)
      add("CERTIFICATE_ASSET_MISMATCH", "certificate", c.certificate_id, c.asset_id,
        `Certificate references asset ${c.asset_id} but event ${ev.calibration_id} belongs to ${ev.asset_id}.`, { certificate_asset: c.asset_id, event_asset: ev.asset_id });
    const due = ev ? expectedDue(ev) : null;
    if (c.certificate_status === "REVOKED" || c.certificate_status === "INVALID" || (due && c.expiry_date && c.expiry_date < due))
      add("CERTIFICATE_EXPIRED", "certificate", c.certificate_id, c.asset_id,
        `Certificate ${c.certificate_status === "VALID" || c.certificate_status === "EXPIRED" ? `expires ${c.expiry_date}, before calibration due ${due}` : `status ${c.certificate_status}`}.`, { expiry_date: c.expiry_date, due });
  }

  for (const u of input.uses) {
    checked.EXPIRED_USE_WITHOUT_EXCEPTION++;
    checked.UNAUTHORIZED_EXTENSION++;
    const evs = evByAsset.get(u.asset_id) ?? [];
    const lf = latestFinished(evs, u.used_at);
    const lp = latestPass(evs, u.used_at);
    if (u.exception_id) {
      const ex = exById.get(u.exception_id);
      const r = ex ? extensionCovers(ex, u.asset_id, u.used_at, u.production_line) : { ok: false, why: "unknown extension" };
      if (!r.ok) { add("UNAUTHORIZED_EXTENSION", "production_use", u.use_id, u.asset_id, `Use relied on extension ${u.exception_id}: ${r.why}.`, { exception_id: u.exception_id }); continue; }
    }
    if (!lf || lf.result === "FAIL" || !lp) continue;
    const due = expectedDue(lp) as string;
    if (!isWithinValidity(u.used_at, due) && !findCoveringExtension(exByAsset.get(u.asset_id) ?? [], u.asset_id, u.used_at, u.production_line).covering)
      add("EXPIRED_USE_WITHOUT_EXCEPTION", "production_use", u.use_id, u.asset_id, `Used ${u.used_at} after due ${due} with no valid extension.`, { due, used_at: u.used_at, calibration_id: lp.calibration_id });
  }

  const sim = toDate(input.simDate).getTime();
  for (const w of input.workOrders) {
    checked.OVERDUE_WORK_ORDER++;
    if (["OPEN", "IN_PROGRESS", "BLOCKED"].includes(w.status) && toDate(w.due_at).getTime() < sim)
      add("OVERDUE_WORK_ORDER", "work_order", w.work_order_id, w.asset_id, `Work order due ${w.due_at.slice(0, 10)} is still ${w.status}.`, { due_at: w.due_at });
  }
  return { findings: f, checked };
}

export const findingKey = (x: { entity_type: string; entity_id: string; issue_type: string }) => `${x.issue_type}|${x.entity_type}|${x.entity_id}`;
