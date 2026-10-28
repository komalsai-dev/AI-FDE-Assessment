# Calibra — Synthetic Data Generation & Reproducibility Guide

## 1. Overview & Seed Specifications

Calibra's dataset is generated synthetically to model one full operating year of a modern manufacturing facility (October 28, 2025 to October 28, 2026).

- **Deterministic PRNG:** `mulberry32` (small, 32-bit state, zero dependencies, completely reproducible across platforms).
- **Standard Baseline Seed:** `20261022`
- **Generator Version:** `1.1.0`
- **Canonical Serializer:** `2-recursive-json` (stable key ordering, nested object canonicalization, SHA-256 fingerprints).

---

## 2. Dataset Scale & Volume

| Entity | Starter Scale | Full Assessment Scale (Current Database) |
|---|---:|---:|
| **Assets** | 200 | 2,000 |
| **Calibration Events** | 500 | 5,003 (5,000 baseline + 3 test additions) |
| **Production Use Records** | 10,000 | 100,000 |
| **Work Orders** | 504 | 5,043 (5,040 baseline + 3 test additions) |
| **Certificates** | 432 | 4,324 |
| **Emergency Extensions** | 11 | 106 |
| **Downtime Events** | 480 | 4,837 |
| **Ground-Truth Cases** | 56 | 366 |

---

## 3. Mandatory Anomaly Scenarios (20 Cases Each in Full Scale)

The generator deliberately injects realistic manufacturing non-compliances:

1. **`DUE_DATE_PLAN_MISMATCH` (20 cases):**  
   Artificially offsets the stored `next_due_date` by ±10–40 days relative to `calibration_date + interval_days_used`.
2. **`EXPIRED_USE_WITHOUT_EXCEPTION` (20 cases):**  
   Simulates production equipment usage strictly after the UTC midnight expiration boundary of its calibration without an approved emergency extension.
3. **`CERTIFICATE_ASSET_MISMATCH` (20 cases):**  
   Reassigns a valid calibration certificate to reference a different asset ID.
4. **`IMPACT_ASSESSMENT_MISSING` (20 cases):**  
   Records a calibration failure (`result = 'FAIL'`) but omits the mandatory impact assessment record.

---

## 4. Preservation & Generation Guards

### Non-Destructive In-Memory Verification
To verify dataset integrity without overwriting live records:
1. Navigate to **Data Quality** (`/data-quality`) in the application.
2. Click **Reproducibility check**.
3. The server runs two independent in-memory generation passes under seed `20261022`, computes recursive SHA-256 hashes for all 16 entity collections, and verifies that pass A and pass B produce 100% identical row counts and checksums.

### Safety Refusal Guard
In [`src/lib/query-order.ts`](file:///d:/FDE-Assessment/src/lib/query-order.ts) and [`src/lib/gen.server.ts`](file:///d:/FDE-Assessment/src/lib/gen.server.ts):
```typescript
export function assertGenerationEmpty(counts: Record<string, number>) {
  if (counts.assets && counts.assets > 0) {
    throw new Error("Generation refused: existing assessment records must be preserved.");
  }
}
```
If an administrator attempts to trigger full generation when operational records already exist, the execution is blocked with an error to safeguard historical evidence.
