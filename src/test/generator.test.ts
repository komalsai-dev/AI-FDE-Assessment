import { describe, expect, it } from "vitest";
import { generate, checksums, rowCounts, DEFAULT_CONFIG, SCALES } from "@/data/generator";
import { detect } from "@/rules/validation";
import { compare } from "@/evaluation/metrics";
import { duplicateIds, badPattern, ID_PATTERNS, downtimeMismatch, missingFks } from "@/evaluation/integrity";

const ds = generate(DEFAULT_CONFIG);

describe("generator (starter scale)", () => {
  it("produces exact core counts", () => {
    expect(ds.assets).toHaveLength(SCALES.starter.assets);
    expect(ds.calibration_events).toHaveLength(SCALES.starter.calibrations);
    expect(ds.production_use).toHaveLength(SCALES.starter.uses);
  });
  it("IDs follow conventions and are unique", () => {
    for (const [t, re] of Object.entries(ID_PATTERNS)) {
      const rows = ds[t as keyof typeof ID_PATTERNS] as Record<string, string>[];
      const key = Object.keys(rows[0]!)[0]!;
      expect(badPattern(rows, key, re, t)).toEqual([]);
      expect(duplicateIds(rows, key, t)).toEqual([]);
    }
  });
  it("foreign keys resolve and downtime reconciles", () => {
    const assets = new Set(ds.assets.map((a) => a.asset_id));
    expect(missingFks(ds.calibration_events, "calibration_id", "asset_id", assets, "e")).toEqual([]);
    expect(missingFks(ds.production_use, "use_id", "asset_id", assets, "u")).toEqual([]);
    expect(downtimeMismatch(ds.work_orders, ds.downtime_events)).toEqual([]);
  });
  it("contains all four mandatory anomalies in ground truth", () => {
    const types = new Set(ds.ground_truth_cases.map((g) => g.issue_type));
    for (const t of ["DUE_DATE_PLAN_MISMATCH", "EXPIRED_USE_WITHOUT_EXCEPTION", "CERTIFICATE_ASSET_MISMATCH", "IMPACT_ASSESSMENT_MISSING"]) expect(types.has(t as never)).toBe(true);
  });
  it("detector matches ground truth (no misses, no unexpected)", () => {
    const { findings, checked } = detect({ simDate: DEFAULT_CONFIG.simEnd, plans: ds.calibration_plans, assets: ds.assets, events: ds.calibration_events, certificates: ds.certificates, exceptions: ds.exception_records, uses: ds.production_use, workOrders: ds.work_orders, impactAssessments: ds.impact_assessments as { calibration_id: string }[] });
    const r = compare(findings, ds.ground_truth_cases, checked);
    expect(r.missed).toEqual([]);
    expect(r.unexpected).toEqual([]);
    expect(r.overall.precision).toBe(1);
    expect(r.overall.recall).toBe(1);
  });
  it("is reproducible with the same seed and differs with another seed", async () => {
    const again = generate(DEFAULT_CONFIG);
    expect(rowCounts(again)).toEqual(rowCounts(ds));
    expect(await checksums(again)).toEqual(await checksums(ds));
    const other = generate({ ...DEFAULT_CONFIG, seed: 1 });
    expect((await checksums(other)).assets).not.toBe((await checksums(ds)).assets);
  });
});
