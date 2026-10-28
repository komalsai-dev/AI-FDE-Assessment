import type { Dataset } from "@/data/generator";
import type { DetectorInput } from "@/rules/validation";

/** Scope every source collection by deterministic baseline identity, never by truth labels. */
export function baselineInput(input: DetectorInput, baseline: Dataset, finishedAt?: string): DetectorInput {
  const ids = (rows: unknown[], key: string) => new Set(rows.map((row) => (row as Record<string, unknown>)[key]));
  const keep = <T,>(rows: T[], baselineRows: unknown[], key: string): T[] => {
    const set = ids(baselineRows, key);
    return rows.filter((row) => set.has((row as Record<string, unknown>)[key]));
  };
  const assessmentCals = ids(baseline.calibration_events, "calibration_id");
  return {
    simDate: baseline.config.simEnd,
    plans: keep(input.plans, baseline.calibration_plans, "plan_id"),
    assets: keep(input.assets, baseline.assets, "asset_id"),
    events: keep(input.events, baseline.calibration_events, "calibration_id"),
    certificates: keep(input.certificates, baseline.certificates, "certificate_id"),
    exceptions: keep(input.exceptions, baseline.exception_records, "exception_id"),
    uses: finishedAt ? input.uses.filter((row) => {
      const created = (row as typeof row & { created_at?: string }).created_at;
      if (!created) throw new Error("Production-use provenance is missing");
      return Date.parse(created) <= Date.parse(finishedAt);
    }) : keep(input.uses, baseline.production_use, "use_id"),
    workOrders: finishedAt ? input.workOrders.filter((row) => {
      const created = (row as typeof row & { created_at?: string }).created_at;
      if (!created) throw new Error("Work-order provenance is missing");
      return Date.parse(created) <= Date.parse(finishedAt);
    }) : keep(input.workOrders, baseline.work_orders, "work_order_id"),
    impactAssessments: input.impactAssessments.filter((row) => assessmentCals.has(row.calibration_id)),
  };
}