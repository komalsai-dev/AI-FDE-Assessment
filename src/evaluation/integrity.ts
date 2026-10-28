/** Structural validation over plain rows: PK uniqueness, FK integrity, enums, date order, ID formats, downtime arithmetic. */
export type Issue = { check: string; table: string; id: string; message: string };

export function duplicateIds<T>(rows: T[], key: keyof T, table: string): Issue[] {
  const seen = new Set<unknown>(); const out: Issue[] = [];
  for (const r of rows) { const k = r[key]; if (seen.has(k)) out.push({ check: "PK_DUPLICATE", table, id: String(k), message: `Duplicate ${String(key)} ${String(k)}` }); seen.add(k); }
  return out;
}
export function missingFks<T>(rows: T[], key: keyof T, fk: keyof T, parents: Set<string>, table: string, optional = false): Issue[] {
  const out: Issue[] = [];
  for (const r of rows) { const v = r[fk] as unknown; if (v == null) { if (!optional) out.push({ check: "FK_NULL", table, id: String(r[key]), message: `${String(fk)} is required` }); continue; } if (!parents.has(String(v))) out.push({ check: "FK_MISSING", table, id: String(r[key]), message: `${String(fk)}=${String(v)} not found` }); }
  return out;
}
export function invalidEnums<T>(rows: T[], key: keyof T, field: keyof T, allowed: readonly string[], table: string): Issue[] {
  return rows.filter((r) => !allowed.includes(String(r[field]))).map((r) => ({ check: "ENUM_INVALID", table, id: String(r[key]), message: `${String(field)}=${String(r[field])}` }));
}
export function badPattern<T>(rows: T[], key: keyof T, re: RegExp, table: string): Issue[] {
  return rows.filter((r) => !re.test(String(r[key]))).map((r) => ({ check: "ID_FORMAT", table, id: String(r[key]), message: `ID does not match ${re}` }));
}
export function dateOrder<T>(rows: T[], key: keyof T, a: keyof T, b: keyof T, table: string): Issue[] {
  return rows.filter((r) => r[a] != null && r[b] != null && String(r[b]) < String(r[a])).map((r) => ({ check: "DATE_ORDER", table, id: String(r[key]), message: `${String(b)} before ${String(a)}` }));
}
export function downtimeMismatch(wos: { work_order_id: string; downtime_hours: number }[], dts: { work_order_id: string | null; start_at: string; end_at: string }[]): Issue[] {
  const sum = new Map<string, number>();
  for (const d of dts) if (d.work_order_id) sum.set(d.work_order_id, (sum.get(d.work_order_id) ?? 0) + (Date.parse(d.end_at) - Date.parse(d.start_at)) / 3_600_000);
  return wos.filter((w) => Math.abs((sum.get(w.work_order_id) ?? 0) - Number(w.downtime_hours)) > 0.01).map((w) => ({ check: "DOWNTIME_ARITHMETIC", table: "work_orders", id: w.work_order_id, message: `downtime_hours ${w.downtime_hours} ≠ Σ events ${sum.get(w.work_order_id) ?? 0}` }));
}

export const ID_PATTERNS = {
  assets: /^AST-\d{6}$/,
  calibration_events: /^CAL-AST-\d{6}-\d{4}-\d{6}$/,
  certificates: /^CERT-CAL-AST-\d{6}-\d{4}-\d{6}$/,
  work_orders: /^WO-\d{4}-\d{6}$/,
  production_use: /^USE-AST-\d{6}-\d{8}T\d{6}(-\d+)?$/,
};
