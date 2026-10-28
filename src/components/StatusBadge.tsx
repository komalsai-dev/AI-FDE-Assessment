const MAP: Record<string, string> = {
  VALID: "badge-ok", ACTIVE: "badge-ok", COMPLETED: "badge-ok", PASS: "badge-ok", ALLOWED: "badge-ok", APPROVED: "badge-ok", RESOLVED: "badge-ok", SUCCEEDED: "badge-ok",
  DUE_SOON: "badge-warn", SCHEDULED: "badge-info", IN_PROGRESS: "badge-info", OPEN: "badge-warn", ACKNOWLEDGED: "badge-info", PENDING: "badge-warn", PENDING_APPROVAL: "badge-warn", REQUIRED: "badge-warn", CONDITIONAL: "badge-warn", FLAGGED_FOR_REVIEW: "badge-warn", MEDIUM: "badge-warn", RUNNING: "badge-info", BLOCKED: "badge-bad",
  OVERDUE: "badge-bad", FAILED: "badge-bad", FAIL: "badge-bad", QUARANTINED: "badge-bad", EXPIRED: "badge-bad", REVOKED: "badge-bad", REJECTED: "badge-bad", INVALID: "badge-bad", SUSPENDED: "badge-bad", CRITICAL: "badge-bad", HIGH: "badge-bad", NO_CALIBRATION: "badge-bad",
  RETIRED: "badge-neutral", CANCELLED: "badge-neutral", LOW: "badge-neutral",
};
export function StatusBadge({ value }: { value?: string | null }) {
  if (!value) return <span className="text-muted-foreground">—</span>;
  return <span className={MAP[value] ?? "badge-neutral"}>{value.replace(/_/g, " ")}</span>;
}
