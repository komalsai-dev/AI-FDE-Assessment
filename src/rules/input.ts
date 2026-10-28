export function finiteMeasurement(value: unknown, name: string): number {
  if (value === null || value === undefined || (typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") throw new Error(`${name} is required`);
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a finite number`);
  return n;
}
export function independentApprover(assignee: string | null, actor: string): boolean {
  const normalize = (v: string) => v.replace(/\s*\([^)]*\)$/, "").trim().toLowerCase();
  return !!assignee && normalize(assignee) !== normalize(actor);
}
export function assertOwnership(assetId: string, eventAssetId: string) {
  if (assetId !== eventAssetId) throw new Error("Work order asset must match its calibration event asset.");
}
export function durationHours(start: string, end: string): number {
  const a = Date.parse(start), b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) throw new Error("Downtime end must be after start, with valid timestamps.");
  return (b - a) / 3_600_000;
}
export function validateSetting(key: string, value: unknown) {
  if (["simulation_date", "sim_start", "sim_end"].includes(key)) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error("Invalid setting date");
  } else if (["warning_threshold_days", "export_row_limit", "generator_seed"].includes(key)) {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < (key === "export_row_limit" ? 1 : 0)) throw new Error("Setting must be a valid nonnegative integer (export limit at least 1)");
  } else if (["default_requires_certificate", "default_prohibit_overdue_use"].includes(key)) {
    if (typeof value !== "boolean") throw new Error("Policy must be true or false");
  } else if (key === "generation_scale") {
    if (value !== "starter" && value !== "full") throw new Error("Invalid generation scale");
  } else throw new Error("Unsupported setting");
}