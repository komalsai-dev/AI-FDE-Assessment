# Validation summary

Historical results below come from initial runs recorded in `evaluation_runs` (seed 20261022, simulation date 2026-10-28). Current verified results and limitations are in `audit-final-2026-10-28.md`.

## Full scale (2,000 assets / 5,000 calibrations / 100,000 uses)
- Generation: **SUCCEEDED**. Every entity's actual row counts match the expected counts.
- Integrity checks (PK, FK, enum, date order, ID format, downtime arithmetic, status/result): **0 issues**.
- Detector findings: 366, all matching ground truth (0 unexpected).
- Ground-truth evaluation: TP 366, FP 0, FN 0. Precision 1.00, recall 1.00, F1 1.00. Historical TN 222,996 was not a validated negative population and is no longer reported as meaningful.
- Mandatory scenarios:

| Scenario | Expected | Detected |
|---|---|---|
| DUE_DATE_PLAN_MISMATCH | 20 | 20 |
| EXPIRED_USE_WITHOUT_EXCEPTION | 20 | 20 |
| CERTIFICATE_ASSET_MISMATCH | 20 | 20 |
| IMPACT_ASSESSMENT_MISSING | 20 | 20 |

- Reproducibility: two in-memory runs are **identical** in every table (row counts and SHA-256), and they match the checksums stored for the run.

## Starter scale (200 / 500 / 10,000)
56 ground-truth cases, precision and recall 1.00, 0 integrity issues, reproducible.

## Categories
1. Valid baseline records: no integrity issues.
2. Deliberate anomalies: all detected and labelled in ground truth.
3. Later workflow findings are now separated from baseline scoring; they do not require regenerating or deleting existing assessment data.

Re-run any of these from the Data Quality page. The numbers above are not hardcoded in the app.
