import { expectedDue, latestFinished, latestPass } from "./calibration";
import { checkCertificate } from "./certificates";
import { isWithinValidity, toDate } from "./dates";
import { findCoveringExtension } from "./exceptions";
import type { AssetLite, CalEvent, Certificate, ExceptionRec, Plan } from "./types";

export type UseDecision = "ALLOWED" | "BLOCKED" | "FLAGGED_FOR_REVIEW";
export type UseEvaluation = {
  decision: UseDecision;
  rule_id: string;
  reason_code: string;
  explanation: string;
  calibration_id: string | null;
  plan_id: string | null;
  due_date: string | null;
  certificate_status: string;
  exception_id: string | null;
  exception_note: string | null;
};

export type UseContext = {
  asset: AssetLite;
  events: CalEvent[];
  certsByCal: Map<string, Certificate>;
  exceptions: ExceptionRec[];
  plansById: Map<string, Plan>;
  line: string;
  /** Lifecycle at evaluation time. For historical replay pass "ACTIVE" unless retired. */
  enforceCurrentLifecycle: boolean;
};

/** Rule 4: production-use decision at timestamp `at`. Pure and deterministic. */
export function evaluateUse(ctx: UseContext, at: string): UseEvaluation {
  const base = { calibration_id: null, plan_id: null, due_date: null, certificate_status: "N/A", exception_id: null, exception_note: null };
  const { asset } = ctx;
  if (asset.lifecycle_status === "RETIRED" && (!asset.retired_at || toDate(asset.retired_at) <= toDate(at)))
    return { ...base, decision: "BLOCKED", rule_id: "R2-LIFECYCLE", reason_code: "ASSET_RETIRED", explanation: `${asset.asset_id} is retired.` };
  if (ctx.enforceCurrentLifecycle && asset.lifecycle_status === "QUARANTINED")
    return { ...base, decision: "BLOCKED", rule_id: "R2-LIFECYCLE", reason_code: "ASSET_QUARANTINED", explanation: `${asset.asset_id} is quarantined; an extension cannot release it.` };

  const lf = latestFinished(ctx.events, at);
  if (!lf) return { ...base, decision: "BLOCKED", rule_id: "R2-ELIGIBILITY", reason_code: "NO_VALID_CALIBRATION", explanation: "No completed calibration on or before this time." };
  if (lf.result === "FAIL")
    return { ...base, calibration_id: lf.calibration_id, plan_id: lf.plan_id, decision: "BLOCKED", rule_id: "R7-CAL-FAILED", reason_code: "CALIBRATION_FAILED",
      explanation: `Latest calibration ${lf.calibration_id} on ${lf.calibration_date} FAILED. Extensions cannot release a failed instrument.` };

  const lp = latestPass(ctx.events, at) as CalEvent;
  const plan = ctx.plansById.get(lp.plan_id) ?? null;
  const due = expectedDue(lp) as string;
  const info = { ...base, calibration_id: lp.calibration_id, plan_id: lp.plan_id, due_date: due };

  if (isWithinValidity(at, due)) {
    const cc = checkCertificate(lp, ctx.certsByCal.get(lp.calibration_id), at, plan?.requires_certificate ?? true);
    if (!cc.ok)
      return { ...info, certificate_status: cc.issue, decision: "FLAGGED_FOR_REVIEW", rule_id: "R5-CERT", reason_code: cc.issue,
        explanation: `Calibration valid until ${due} (exclusive) but certificate check failed: ${cc.detail}.` };
    return { ...info, certificate_status: "VALID", decision: "ALLOWED", rule_id: "R4-USE", reason_code: "WITHIN_VALIDITY",
      explanation: `Calibration ${lp.calibration_id} valid; due ${due} (validity ends at start of due date).` };
  }

  const ext = findCoveringExtension(ctx.exceptions, asset.asset_id, at, ctx.line);
  if (ext.covering)
    return { ...info, certificate_status: "N/A", decision: "ALLOWED", rule_id: "R6-EXTENSION", reason_code: "AUTHORIZED_EXTENSION",
      exception_id: ext.covering.exception_id, exception_note: `Approved by ${ext.covering.approved_by}, valid ${ext.covering.valid_from} → ${ext.covering.valid_until}`,
      explanation: `Overdue since ${due}, but approved extension ${ext.covering.exception_id} covers this time and line. Original due date unchanged.` };

  const note = ext.rejectedReason;
  if (plan && !plan.prohibit_overdue_use)
    return { ...info, decision: "FLAGGED_FOR_REVIEW", rule_id: "R4-USE-EXPIRED", reason_code: "EXPIRED_USE_WITHOUT_EXCEPTION", exception_note: note,
      explanation: `Overdue since ${due}; plan ${lp.plan_id} allows overdue use with review. ${note ?? "No extension."}` };
  return { ...info, decision: "BLOCKED", rule_id: "R4-USE-EXPIRED", reason_code: "EXPIRED_USE_WITHOUT_EXCEPTION", exception_note: note,
    explanation: `Calibration expired at start of ${due}; plan ${lp.plan_id} prohibits overdue use and no valid extension exists. ${note ?? ""}`.trim() };
}

/** A use that already happened is never "BLOCKED": anything the gate would not allow is flagged. */
export function recordedUseDecision(ev: UseEvaluation): "ALLOWED" | "FLAGGED_FOR_REVIEW" {
  return ev.decision === "ALLOWED" ? "ALLOWED" : "FLAGGED_FOR_REVIEW";
}
