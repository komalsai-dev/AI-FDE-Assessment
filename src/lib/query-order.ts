export const PRIMARY_KEYS: Record<string, string> = {
  instrument_types: "instrument_type_id", suppliers: "supplier_id", calibration_plans: "plan_id", assets: "asset_id", v_asset_status: "asset_id", calibration_events: "calibration_id", certificates: "certificate_id", exception_records: "exception_id", work_orders: "work_order_id", downtime_events: "downtime_id", production_use: "use_id", use_attempts: "attempt_id", alerts: "alert_id", corrective_actions: "corrective_action_id", impact_assessments: "assessment_id", ground_truth_cases: "case_id", audit_records: "audit_id", state_history: "id", alert_notes: "note_id", settings_history: "id", evaluation_runs: "run_id", generation_runs: "run_id", settings: "key", id_counters: "prefix",
};
export function primaryKey(table: string): string {
  const key = PRIMARY_KEYS[table];
  if (!key) throw new Error(`Unsupported table: ${table}`);
  return key;
}
export function nextUtcDay(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error("Expected a date in YYYY-MM-DD format");
  const date = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error("Invalid date");
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}
export function assertGenerationEmpty(counts: Record<string, number>) {
  if (Object.values(counts).some((n) => n > 0)) throw new Error("Existing assessment data is preserved. Generation cannot replace a populated dataset; use the isolated reproducibility check instead.");
}