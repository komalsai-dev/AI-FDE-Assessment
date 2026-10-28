/**
 * Date convention (used everywhere: generator, UI, server, validation, tests):
 * - Calendar dates are ISO "YYYY-MM-DD" in UTC.
 * - next_due_date = calibration_date + interval_days.
 * - An instrument is valid while the use timestamp is strictly before 00:00 UTC of next_due_date.
 *   i.e. validity EXPIRES AT THE START of the due date.
 * - "Overdue" at simulation date S means S >= next_due_date.
 */
const DAY = 86_400_000;

export function toDate(iso: string): Date {
  return new Date(iso.length === 10 ? `${iso}T00:00:00Z` : iso);
}
export function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(iso: string, days: number): string {
  return isoDate(new Date(toDate(iso).getTime() + days * DAY));
}
export function diffDays(a: string, b: string): number {
  return Math.round((toDate(a.slice(0, 10)).getTime() - toDate(b.slice(0, 10)).getTime()) / DAY);
}
export function computeDueDate(calibrationDate: string, intervalDays: number): string {
  if (intervalDays <= 0) throw new Error("interval_days must be > 0");
  return addDays(calibrationDate, intervalDays);
}
/** True when timestamp `at` falls inside validity (strictly before start of due date). */
export function isWithinValidity(at: string, dueDate: string): boolean {
  return toDate(at).getTime() < toDate(dueDate).getTime();
}
export function isOverdue(simDate: string, dueDate: string): boolean {
  return !isWithinValidity(simDate, dueDate);
}
export function daysOverdue(simDate: string, dueDate: string): number {
  return Math.max(0, diffDays(simDate, dueDate));
}
export function compactTimestamp(iso: string): string {
  return iso.slice(0, 19).replace(/[-:]/g, "");
}
