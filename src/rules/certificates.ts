import type { CalEvent, Certificate } from "./types";

export type CertCheck =
  | { ok: true }
  | { ok: false; issue: "CERTIFICATE_MISSING" | "CERTIFICATE_EXPIRED" | "CERTIFICATE_ASSET_MISMATCH"; detail: string };

/** Certificate for a calibration event evaluated at a timestamp. Missing/expired/mismatched are distinct. */
export function checkCertificate(ev: CalEvent, cert: Certificate | undefined, at: string, required: boolean): CertCheck {
  if (!cert) return required ? { ok: false, issue: "CERTIFICATE_MISSING", detail: `No certificate for ${ev.calibration_id}` } : { ok: true };
  if (cert.asset_id !== ev.asset_id)
    return { ok: false, issue: "CERTIFICATE_ASSET_MISMATCH", detail: `Certificate asset ${cert.asset_id} ≠ event asset ${ev.asset_id}` };
  if (cert.calibration_id !== ev.calibration_id) return { ok: false, issue: "CERTIFICATE_ASSET_MISMATCH", detail: "Certificate references a different calibration event" };
  if (cert.issue_date > at.slice(0, 10)) return { ok: false, issue: "CERTIFICATE_EXPIRED", detail: `Certificate not issued until ${cert.issue_date}` };
  if (cert.certificate_status === "REVOKED" || cert.certificate_status === "INVALID" || cert.certificate_status === "EXPIRED")
    return { ok: false, issue: "CERTIFICATE_EXPIRED", detail: `Certificate status ${cert.certificate_status}` };
  if (cert.expiry_date && at.slice(0, 10) >= cert.expiry_date)
    return { ok: false, issue: "CERTIFICATE_EXPIRED", detail: `Certificate expired ${cert.expiry_date}` };
  return { ok: true };
}

/** Ownership mismatch, independent of time. */
export function isCertificateMismatched(cert: Certificate, ev: CalEvent | undefined): boolean {
  return !!ev && cert.asset_id !== ev.asset_id;
}
