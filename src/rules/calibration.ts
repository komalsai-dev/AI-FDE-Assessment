import { computeDueDate, isWithinValidity } from "./dates";
import type { CalEvent, Plan } from "./types";

/** Select the plan version effective for an instrument type at a date (half-open [from, to)). */
export function selectPlan(plans: Plan[], instrumentTypeId: string, date: string): Plan | null {
  const matches = plans.filter(
    (p) =>
      p.instrument_type_id === instrumentTypeId &&
      p.status !== "DRAFT" &&
      p.effective_from <= date &&
      (p.effective_to === null || date < p.effective_to),
  );
  if (matches.length > 1) throw new Error(`Ambiguous plan versions for ${instrumentTypeId} at ${date}`);
  return matches[0] ?? null;
}

/** Pass when |measured - reference| <= tolerance. */
export function evaluateMeasurement(measured: number, reference: number, tolerance: number): "PASS" | "FAIL" {
  return Math.abs(measured - reference) <= tolerance + 1e-12 ? "PASS" : "FAIL";
}

export function expectedDue(ev: Pick<CalEvent, "calibration_date" | "interval_days_used">): string | null {
  return ev.calibration_date ? computeDueDate(ev.calibration_date, ev.interval_days_used) : null;
}

function finished(ev: CalEvent) {
  return (ev.event_status === "COMPLETED" || ev.event_status === "FAILED") && ev.calibration_date !== null;
}

/** Latest completed-or-failed event on or before `at` (date part). */
export function latestFinished(events: CalEvent[], at: string): CalEvent | null {
  const d = at.slice(0, 10);
  let best: CalEvent | null = null;
  for (const e of events) {
    if (!finished(e) || (e.calibration_date as string) > d) continue;
    if (!best || (e.calibration_date as string) > (best.calibration_date as string) ||
      (e.calibration_date === best.calibration_date && e.calibration_id > best.calibration_id)) best = e;
  }
  return best;
}

/** Latest successful (PASS) event on or before `at`. Scheduled / in-progress never extend validity. */
export function latestPass(events: CalEvent[], at: string): CalEvent | null {
  return latestFinished(events.filter((e) => e.event_status === "COMPLETED" && e.result === "PASS"), at);
}

export type CalStatus = "RETIRED" | "QUARANTINED" | "NO_CALIBRATION" | "FAILED" | "OVERDUE" | "DUE_SOON" | "VALID";

export function calibrationStatus(
  lifecycle: string,
  events: CalEvent[],
  simDate: string,
  warnDays: number,
): { status: CalStatus; due: string | null; lastPass: CalEvent | null } {
  const lp = latestPass(events, simDate);
  const due = lp ? expectedDue(lp) : null;
  if (lifecycle === "RETIRED") return { status: "RETIRED", due, lastPass: lp };
  if (lifecycle === "QUARANTINED") return { status: "QUARANTINED", due, lastPass: lp };
  const lf = latestFinished(events, simDate);
  if (!lf) return { status: "NO_CALIBRATION", due, lastPass: lp };
  if (lf.result === "FAIL") return { status: "FAILED", due, lastPass: lp };
  if (!due || !isWithinValidity(simDate, due)) return { status: "OVERDUE", due, lastPass: lp };
  const left = (Date.parse(due) - Date.parse(simDate)) / 86_400_000;
  return { status: left <= warnDays ? "DUE_SOON" : "VALID", due, lastPass: lp };
}
