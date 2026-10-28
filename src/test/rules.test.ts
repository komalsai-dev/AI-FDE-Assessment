import { describe, expect, it } from "vitest";
import { computeDueDate, isOverdue, isWithinValidity, daysOverdue } from "@/rules/dates";
import { evaluateMeasurement, selectPlan, latestPass, calibrationStatus } from "@/rules/calibration";
import { evaluateUse, recordedUseDecision } from "@/rules/compliance";
import { checkCertificate } from "@/rules/certificates";
import { canTransition, assertTransition } from "@/rules/lifecycle";
import { failureRequirements, releaseBlockers, impactWindow, usesInWindow } from "@/rules/correctiveActions";
import { detect } from "@/rules/validation";
import { compare, prf } from "@/evaluation/metrics";
import { duplicateIds, missingFks } from "@/evaluation/integrity";
import type { CalEvent, Certificate, ExceptionRec, Plan } from "@/rules/types";

const plan: Plan = { plan_id: "PLN-PRS-V1", instrument_type_id: "PRS", interval_days: 90, tolerance: 0.5, requires_certificate: true, prohibit_overdue_use: true, effective_from: "2023-01-01", effective_to: "2026-04-01", version: 1, status: "SUPERSEDED" };
const plan2: Plan = { ...plan, plan_id: "PLN-PRS-V2", interval_days: 60, effective_from: "2026-04-01", effective_to: null, version: 2, status: "ACTIVE" };
const ev = (o: Partial<CalEvent>): CalEvent => ({ calibration_id: "CAL-AST-000001-2025-000001", asset_id: "AST-000001", plan_id: plan.plan_id, supplier_id: "SUP-001", scheduled_date: "2025-10-01", calibration_date: "2025-10-01", next_due_date: "2025-12-30", result: "PASS", measured_value: 10.1, reference_value: 10, tolerance_used: 0.5, interval_days_used: 90, event_status: "COMPLETED", ...o });
const asset = { asset_id: "AST-000001", instrument_type_id: "PRS", lifecycle_status: "ACTIVE" as const, retired_at: null };
const cert = (o: Partial<Certificate> = {}): Certificate => ({ certificate_id: "CERT-CAL-AST-000001-2025-000001", calibration_id: "CAL-AST-000001-2025-000001", asset_id: "AST-000001", issue_date: "2025-10-01", expiry_date: "2025-12-30", certificate_status: "VALID", document_reference: null, ...o });
const ctx = (events: CalEvent[], certs: Certificate[] = [cert()], exceptions: ExceptionRec[] = []) => ({ asset, events, certsByCal: new Map(certs.map((c) => [c.calibration_id, c])), exceptions, plansById: new Map([[plan.plan_id, plan], [plan2.plan_id, plan2]]), line: "LINE-A", enforceCurrentLifecycle: true });

describe("dates", () => {
  it("due = calibration date + interval (Oct 1 + 90 = Dec 30)", () => expect(computeDueDate("2025-10-01", 90)).toBe("2025-12-30"));
  it("validity expires at start of due date", () => {
    expect(isWithinValidity("2025-12-29T23:59:59Z", "2025-12-30")).toBe(true);
    expect(isWithinValidity("2025-12-30T00:00:00Z", "2025-12-30")).toBe(false);
    expect(isOverdue("2025-12-30", "2025-12-30")).toBe(true);
    expect(daysOverdue("2026-01-04", "2025-12-30")).toBe(5);
  });
  it("rejects non-positive interval", () => expect(() => computeDueDate("2025-10-01", 0)).toThrow());
});

describe("calibration", () => {
  it("selects plan version by effective date (half-open)", () => {
    expect(selectPlan([plan, plan2], "PRS", "2026-03-31")?.version).toBe(1);
    expect(selectPlan([plan, plan2], "PRS", "2026-04-01")?.version).toBe(2);
  });
  it("pass within tolerance, fail outside", () => {
    expect(evaluateMeasurement(10.5, 10, 0.5)).toBe("PASS");
    expect(evaluateMeasurement(10.51, 10, 0.5)).toBe("FAIL");
  });
  it("failed or scheduled events never extend validity", () => {
    const evs = [ev({}), ev({ calibration_id: "CAL-AST-000001-2025-000002", calibration_date: "2025-12-01", result: "FAIL", event_status: "FAILED", next_due_date: null }), ev({ calibration_id: "CAL-AST-000001-2026-000001", calibration_date: null, result: null, event_status: "SCHEDULED", scheduled_date: "2026-01-10" })];
    expect(latestPass(evs, "2026-02-01")?.calibration_id).toBe("CAL-AST-000001-2025-000001");
    expect(calibrationStatus("ACTIVE", evs, "2025-12-15", 30).status).toBe("FAILED");
  });
  it("detects overdue instrument", () => expect(calibrationStatus("ACTIVE", [ev({})], "2026-01-02", 30).status).toBe("OVERDUE"));
  it("quarantined instrument is not eligible even if not due", () => expect(calibrationStatus("QUARANTINED", [ev({})], "2025-11-01", 30).status).toBe("QUARANTINED"));
});

describe("production use", () => {
  it("allowed within valid window", () => expect(evaluateUse(ctx([ev({})]), "2025-11-15T10:00:00Z").decision).toBe("ALLOWED"));
  it("Scenario 2: blocked after expiry without exception", () => {
    const r = evaluateUse(ctx([ev({})]), "2026-01-05T10:00:00Z");
    expect(r.decision).toBe("BLOCKED");
    expect(r.reason_code).toBe("EXPIRED_USE_WITHOUT_EXCEPTION");
    expect(r.due_date).toBe("2025-12-30");
    expect(recordedUseDecision(r)).toBe("FLAGGED_FOR_REVIEW");
  });
  const ext: ExceptionRec = { exception_id: "EXC-000001", asset_id: "AST-000001", approval_status: "APPROVED", approved_by: "qa", valid_from: "2025-12-30T00:00:00Z", valid_until: "2026-01-13T00:00:00Z", scope: "ALL_LINES", reason: "x" };
  it("allowed under valid extension, original due date preserved", () => {
    const r = evaluateUse(ctx([ev({})], [cert()], [ext]), "2026-01-05T10:00:00Z");
    expect(r.decision).toBe("ALLOWED");
    expect(r.exception_id).toBe("EXC-000001");
    expect(r.due_date).toBe("2025-12-30");
  });
  it("blocked outside extension validity", () => expect(evaluateUse(ctx([ev({})], [cert()], [ext]), "2026-01-14T10:00:00Z").decision).toBe("BLOCKED"));
  it("rejected / out-of-scope extension does not authorize", () => {
    expect(evaluateUse(ctx([ev({})], [cert()], [{ ...ext, approval_status: "REVOKED" }]), "2026-01-05T10:00:00Z").decision).toBe("BLOCKED");
    expect(evaluateUse(ctx([ev({})], [cert()], [{ ...ext, scope: "LINE-C" }]), "2026-01-05T10:00:00Z").decision).toBe("BLOCKED");
  });
  it("failed instrument is not released by an extension", () => {
    const failed = ev({ calibration_id: "CAL-AST-000001-2025-000002", calibration_date: "2025-12-01", result: "FAIL", event_status: "FAILED", next_due_date: null });
    expect(evaluateUse(ctx([ev({}), failed], [cert()], [ext]), "2026-01-05T10:00:00Z").reason_code).toBe("CALIBRATION_FAILED");
  });
});

describe("certificates", () => {
  it("Scenario 3: asset mismatch", () => expect(checkCertificate(ev({}), cert({ asset_id: "AST-000002" }), "2025-11-01", true)).toMatchObject({ ok: false, issue: "CERTIFICATE_ASSET_MISMATCH" }));
  it("missing required certificate", () => expect(checkCertificate(ev({}), undefined, "2025-11-01", true)).toMatchObject({ issue: "CERTIFICATE_MISSING" }));
  it("missing certificate is fine when not required", () => expect(checkCertificate(ev({}), undefined, "2025-11-01", false).ok).toBe(true));
  it("expired certificate", () => expect(checkCertificate(ev({}), cert({ expiry_date: "2025-11-01" }), "2025-11-10", true)).toMatchObject({ issue: "CERTIFICATE_EXPIRED" }));
});

describe("lifecycle & corrective actions", () => {
  it("valid and invalid transitions", () => {
    expect(canTransition("calibration", "SCHEDULED", "IN_PROGRESS")).toBe(true);
    expect(canTransition("calibration", "COMPLETED", "SCHEDULED")).toBe(false);
    expect(() => assertTransition("work_order", "COMPLETED", "OPEN")).toThrow(/INVALID_TRANSITION/);
  });
  it("failed calibration requires quarantine, CA, IA and alert", () => {
    const req = failureRequirements("CAL-X", "AST-000001", "2025-12-01");
    expect(req.quarantine).toBe(true);
    expect(req.correctiveAction.priority).toBe("HIGH");
    expect(req.impactAssessment.status).toBe("REQUIRED");
    expect(req.alert.issue_type).toBe("CALIBRATION_FAILED");
  });
  it("impact window covers uses since last pass", () => {
    const w = impactWindow("2025-12-01", "2025-10-01", 90);
    expect(usesInWindow([{ used_at: "2025-09-30T10:00:00Z" }, { used_at: "2025-11-01T10:00:00Z" }, { used_at: "2025-12-01T20:00:00Z" }], w)).toHaveLength(2);
  });
  it("release blocked until new pass + CA + IA complete", () => {
    expect(releaseBlockers({ hasNewerPass: false, openCorrectiveActions: 1, incompleteAssessments: 1 })).toHaveLength(3);
    expect(releaseBlockers({ hasNewerPass: true, openCorrectiveActions: 0, incompleteAssessments: 0 })).toHaveLength(0);
  });
});

describe("detector", () => {
  const base = { simDate: "2026-01-10", plans: [plan, plan2], assets: [asset, { ...asset, asset_id: "AST-000002" }], exceptions: [], workOrders: [] };
  it("Scenario 1: due date mismatch shows expected and actual", () => {
    const { findings } = detect({ ...base, events: [ev({ next_due_date: "2026-01-15" })], certificates: [cert()], uses: [], impactAssessments: [] });
    const f = findings.find((x) => x.issue_type === "DUE_DATE_PLAN_MISMATCH");
    expect(f?.details).toMatchObject({ expected: "2025-12-30", actual: "2026-01-15" });
  });
  it("Scenario 4: failed calibration without impact assessment", () => {
    const failed = ev({ result: "FAIL", event_status: "FAILED", next_due_date: null });
    const { findings } = detect({ ...base, events: [failed], certificates: [], uses: [], impactAssessments: [] });
    expect(findings.map((f) => f.issue_type).sort()).toEqual(["CALIBRATION_FAILED", "IMPACT_ASSESSMENT_MISSING"]);
    const ok = detect({ ...base, events: [failed], certificates: [], uses: [], impactAssessments: [{ calibration_id: failed.calibration_id }] });
    expect(ok.findings.some((f) => f.issue_type === "IMPACT_ASSESSMENT_MISSING")).toBe(false);
  });
  it("expired use and certificate mismatch detected", () => {
    const { findings } = detect({ ...base, events: [ev({})], certificates: [cert({ asset_id: "AST-000002" })], uses: [{ use_id: "U1", asset_id: "AST-000001", used_at: "2026-01-02T08:00:00Z", production_line: "LINE-A", exception_id: null }], impactAssessments: [] });
    expect(findings.map((f) => f.issue_type)).toEqual(expect.arrayContaining(["EXPIRED_USE_WITHOUT_EXCEPTION", "CERTIFICATE_ASSET_MISMATCH"]));
  });
});

describe("metrics & integrity", () => {
  it("precision / recall / zero denominators", () => {
    expect(prf({ tp: 8, fp: 2, fn: 2, tn: 88 })).toMatchObject({ precision: 0.8, recall: 0.8 });
    expect(prf({ tp: 0, fp: 0, fn: 0, tn: 5 })).toMatchObject({ precision: null, recall: null, f1: null });
  });
  it("ground-truth comparison counts TP/FP/FN/TN", () => {
    const k = (id: string) => ({ entity_type: "certificate", entity_id: id, issue_type: "CERTIFICATE_ASSET_MISMATCH" });
    const r = compare([k("A"), k("B")], [k("A"), k("C")], { CERTIFICATE_ASSET_MISMATCH: 10 });
    expect(r.perIssue.CERTIFICATE_ASSET_MISMATCH).toMatchObject({ tp: 1, fp: 1, fn: 1, tn: 7 });
  });
  it("duplicate IDs and missing FKs are detected", () => {
    expect(duplicateIds([{ id: "a" }, { id: "a" }], "id", "t")).toHaveLength(1);
    expect(missingFks([{ id: "x", p: "nope" }], "id", "p", new Set(["p1"]), "t")).toHaveLength(1);
  });
});
