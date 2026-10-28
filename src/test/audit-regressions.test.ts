import { describe, expect, it } from "vitest";
import { assertGenerationEmpty, nextUtcDay, primaryKey } from "@/lib/query-order";
import { canonical, DEFAULT_CONFIG, generate } from "@/data/generator";
import { prf } from "@/evaluation/metrics";
import { assertOwnership, durationHours, finiteMeasurement, independentApprover } from "@/rules/input";
import { checkCertificate } from "@/rules/certificates";
import { baselineInput } from "@/evaluation/cohort";
import { detect } from "@/rules/validation";
import { impactWindow, usesInWindow } from "@/rules/correctiveActions";

describe("audit regressions", () => {
  it("never permits replacement of the 2000-asset assessment", () => {
    expect(() => assertGenerationEmpty({ assets: 2000 })).toThrow("preserved");
    expect(() => assertGenerationEmpty({ audit_records: 2014 })).toThrow("preserved");
    expect(() => assertGenerationEmpty({ assets: 0 })).not.toThrow();
  });
  it.each([["calibration_plans", "plan_id"], ["exception_records", "exception_id"], ["certificates", "certificate_id"]])("orders %s by a concrete primary key", (table, key) => {
    expect(primaryKey(table)).toBe(key);
    expect(() => primaryKey("unknown")).toThrow();
  });
  it("includes the full selected date, excluding next midnight", () => {
    expect(nextUtcDay("2026-10-27")).toBe("2026-10-28T00:00:00.000Z");
    expect(() => nextUtcDay("2026-02-30")).toThrow();
  });
  it("nested evidence changes affect canonical data", () => {
    expect(canonical([{ details: { a: 1 } }])).not.toBe(canonical([{ details: { a: 2 } }]));
    expect(canonical([{ details: { a: 1, b: 2 } }])).toBe(canonical([{ details: { b: 2, a: 1 } }]));
  });
  it("nonempty wholly wrong predictions have zero F1", () => {
    expect(prf({ tp: 0, fp: 1, fn: 1, tn: 0 }).f1).toBe(0);
    expect(prf({ tp: 0, fp: 0, fn: 0, tn: 0 }).f1).toBeNull();
  });
  it("measurements must be finite", () => {
    expect(finiteMeasurement("0", "measurement")).toBe(0);
    for (const value of ["abc", "Infinity", "", null, NaN]) expect(() => finiteMeasurement(value, "measurement")).toThrow();
  });
  it("work orders cannot reference another asset's event", () => {
    expect(() => assertOwnership("AST-000001", "AST-000002")).toThrow();
  });
  it("a decorated actor name cannot approve their own assigned work", () => {
    expect(independentApprover("Alex", "Alex (QUALITY)")).toBe(false);
    expect(independentApprover("Alex", "Pat (QUALITY)")).toBe(true);
  });
  it("downtime compares instants, not timestamp text", () => {
    expect(durationHours("2026-10-28T10:00:00+02:00", "2026-10-28T09:00:00Z")).toBe(1);
    expect(() => durationHours("bad", "bad")).toThrow();
  });
  it("future and explicitly expired certificates cannot authorize use", () => {
    const ds = generate(DEFAULT_CONFIG);
    const cert = ds.certificates.find((c) => c.certificate_status === "VALID");
    if (!cert) throw new Error("Fixture missing certificate");
    const event = ds.calibration_events.find((e) => e.calibration_id === cert.calibration_id);
    if (!event) throw new Error("Fixture missing event");
    expect(checkCertificate(event, { ...cert, issue_date: "2027-01-01" }, "2026-10-28T12:00:00Z", true).ok).toBe(false);
    expect(checkCertificate(event, { ...cert, certificate_status: "EXPIRED", expiry_date: "2027-01-01" }, "2026-10-28T12:00:00Z", true).ok).toBe(false);
  });
  it("preserves required full-scale baseline volumes", () => {
    const ds = generate({ ...DEFAULT_CONFIG, seed: 20261022, scale: "full" });
    expect(ds.assets).toHaveLength(2000);
    expect(ds.calibration_events).toHaveLength(5000);
    expect(ds.production_use).toHaveLength(100000);
    expect(ds.ground_truth_cases).toHaveLength(366);
  });
  it("baseline provenance retains all 100000 production uses and excludes later activity", () => {
    const ds = generate({ ...DEFAULT_CONFIG, scale: "full" });
    const input = { simDate: ds.config.simEnd, plans: ds.calibration_plans, assets: ds.assets, events: ds.calibration_events, certificates: ds.certificates, exceptions: ds.exception_records, uses: ds.production_use.map((row) => ({ ...row, created_at: "2026-10-27T19:00:00Z" })), workOrders: ds.work_orders.map((row) => ({ ...row, created_at: "2026-10-27T19:00:00Z" })), impactAssessments: ds.impact_assessments as { calibration_id: string }[] };
    input.uses.push({ ...input.uses[0], use_id: "USE-LATER", created_at: "2026-10-28T10:00:00Z" } as typeof input.uses[number]);
    const scoped = baselineInput(input, ds, "2026-10-27T19:58:36Z");
    expect(scoped.uses).toHaveLength(100000);
    expect(detect(scoped).findings).toHaveLength(366);
    expect(scoped.impactAssessments).toHaveLength(154);
  });
  it("failure-day fractional seconds are included but next midnight is excluded", () => {
    const window = impactWindow("2026-10-28", "2026-06-28", 180);
    expect(window.end).toBe("2026-10-29T00:00:00Z");
    const result = usesInWindow([{ used_at: "2026-10-28T23:59:59.999Z" }, { used_at: "2026-10-29T00:00:00Z" }], window);
    expect(result).toEqual([{ used_at: "2026-10-28T23:59:59.999Z" }]);
  });
});