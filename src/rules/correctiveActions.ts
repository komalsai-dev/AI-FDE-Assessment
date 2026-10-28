import { addDays, toDate } from "./dates";

/** Impact window for a failed calibration: from the last PASS calibration date (or 1 interval back) to the failure date, inclusive. */
export function impactWindow(failDate: string, lastPassDate: string | null, intervalDays: number) {
  const start = lastPassDate ?? new Date(toDate(failDate).getTime() - intervalDays * 86_400_000).toISOString().slice(0, 10);
  return { start: `${start}T00:00:00Z`, end: `${addDays(failDate, 1)}T00:00:00Z` };
}

export function usesInWindow<T extends { used_at: string }>(uses: T[], w: { start: string; end: string }): T[] {
  const s = toDate(w.start).getTime(), e = toDate(w.end).getTime();
  return uses.filter((u) => { const t = toDate(u.used_at).getTime(); return t >= s && t < e; });
}

/** What a failed calibration requires (Rule 7). */
export function failureRequirements(calibrationId: string, assetId: string, failDate: string) {
  return {
    quarantine: true,
    correctiveAction: { asset_id: assetId, calibration_id: calibrationId, action_type: "RECALIBRATE_OR_REPAIR", priority: "HIGH" as const, due_days: 14 },
    impactAssessment: { asset_id: assetId, calibration_id: calibrationId, status: "REQUIRED" as const },
    alert: { issue_type: "CALIBRATION_FAILED" as const, related_entity_id: calibrationId, failDate },
  };
}

/** A quarantined asset can be released only with a newer PASS calibration, all corrective actions completed and impact assessments completed. */
export function releaseBlockers(input: { hasNewerPass: boolean; openCorrectiveActions: number; incompleteAssessments: number }): string[] {
  const b: string[] = [];
  if (!input.hasNewerPass) b.push("A new successful calibration is required after the failure.");
  if (input.openCorrectiveActions > 0) b.push(`${input.openCorrectiveActions} corrective action(s) not completed/approved.`);
  if (input.incompleteAssessments > 0) b.push(`${input.incompleteAssessments} impact assessment(s) not completed.`);
  return b;
}
