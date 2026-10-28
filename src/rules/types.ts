export type Plan = {
  plan_id: string;
  instrument_type_id: string;
  interval_days: number;
  tolerance: number;
  requires_certificate: boolean;
  prohibit_overdue_use: boolean;
  effective_from: string;
  effective_to: string | null;
  version: number;
  status: string;
};
export type CalEvent = {
  calibration_id: string;
  asset_id: string;
  plan_id: string;
  supplier_id: string | null;
  scheduled_date: string | null;
  calibration_date: string | null;
  next_due_date: string | null;
  result: "PASS" | "FAIL" | null;
  measured_value: number | null;
  reference_value: number | null;
  tolerance_used: number;
  interval_days_used: number;
  event_status: "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "FAILED" | "CANCELLED";
};
export type Certificate = {
  certificate_id: string;
  calibration_id: string;
  asset_id: string;
  issue_date: string;
  expiry_date: string | null;
  certificate_status: "VALID" | "EXPIRED" | "REVOKED" | "INVALID";
  document_reference: string | null;
};
export type ExceptionRec = {
  exception_id: string;
  asset_id: string;
  approval_status: "PENDING" | "APPROVED" | "REJECTED" | "EXPIRED" | "REVOKED";
  valid_from: string;
  valid_until: string;
  scope: string;
  approved_by: string | null;
  reason: string;
};
export type AssetLite = {
  asset_id: string;
  instrument_type_id: string;
  lifecycle_status: "ACTIVE" | "QUARANTINED" | "RETIRED";
  retired_at: string | null;
};
export type IssueType =
  | "DUE_DATE_PLAN_MISMATCH"
  | "EXPIRED_USE_WITHOUT_EXCEPTION"
  | "CERTIFICATE_ASSET_MISMATCH"
  | "CERTIFICATE_MISSING"
  | "CERTIFICATE_EXPIRED"
  | "CALIBRATION_FAILED"
  | "IMPACT_ASSESSMENT_MISSING"
  | "UNAUTHORIZED_EXTENSION"
  | "OVERDUE_WORK_ORDER";
export const ISSUE_TYPES: IssueType[] = [
  "DUE_DATE_PLAN_MISMATCH",
  "EXPIRED_USE_WITHOUT_EXCEPTION",
  "CERTIFICATE_ASSET_MISMATCH",
  "CERTIFICATE_MISSING",
  "CERTIFICATE_EXPIRED",
  "CALIBRATION_FAILED",
  "IMPACT_ASSESSMENT_MISSING",
  "UNAUTHORIZED_EXTENSION",
  "OVERDUE_WORK_ORDER",
];
export const RULE_IDS: Record<IssueType, string> = {
  DUE_DATE_PLAN_MISMATCH: "R1-DUE-DATE",
  EXPIRED_USE_WITHOUT_EXCEPTION: "R4-USE-EXPIRED",
  CERTIFICATE_ASSET_MISMATCH: "R5-CERT-ASSET",
  CERTIFICATE_MISSING: "R5-CERT-MISSING",
  CERTIFICATE_EXPIRED: "R5-CERT-EXPIRED",
  CALIBRATION_FAILED: "R7-CAL-FAILED",
  IMPACT_ASSESSMENT_MISSING: "R7-IA-MISSING",
  UNAUTHORIZED_EXTENSION: "R6-EXT-UNAUTH",
  OVERDUE_WORK_ORDER: "R8-WO-OVERDUE",
};
export const SEVERITY: Record<IssueType, "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"> = {
  DUE_DATE_PLAN_MISMATCH: "MEDIUM",
  EXPIRED_USE_WITHOUT_EXCEPTION: "CRITICAL",
  CERTIFICATE_ASSET_MISMATCH: "HIGH",
  CERTIFICATE_MISSING: "HIGH",
  CERTIFICATE_EXPIRED: "MEDIUM",
  CALIBRATION_FAILED: "HIGH",
  IMPACT_ASSESSMENT_MISSING: "CRITICAL",
  UNAUTHORIZED_EXTENSION: "CRITICAL",
  OVERDUE_WORK_ORDER: "LOW",
};
