# Source manifest

**All data is synthetic.** No external dataset and no confidential operational data is used.

| Artifact | Source | Notes |
|---|---|---|
| Instrument types, suppliers, locations, lines | `src/data/referenceData.ts` | Invented names. Tolerances and intervals are typical illustrative values, not taken from any standard |
| Baseline operational records | `src/data/generator.ts` v1.0.0 | Historical seed 20261022; preserved in place |
| Future generated records | `src/data/generator.ts` v1.1.0 | Corrected stable event ordering; recursive checksum version 2 |
| Ground truth | the generator's own labels | Written while anomalies are injected. Never read by the detector |

## Generation assumptions
- Asset mix is a uniform random choice of type. Modes: about 81% valid, 9% overdue, 6% with an upcoming scheduled calibration, 2% in progress, 2% quarantined after a failed last calibration. 1% of valid assets are retired during the window.
- Calibrations: exactly `calibrations / assets` per asset, with the remainder given to randomly chosen assets. Dates are built backwards from a target last date and spaced by the plan interval in effect, minus 0–7 days of jitter. About 5% of earlier events fail, followed by a recalibration 7–14 days later.
- Measurement: PASS deviation is uniform within ±0.8 × tolerance. FAIL deviation is 1.2–2.5 × tolerance. The result is always computed by `evaluateMeasurement`.
- Certificates: issued 0–2 days after each PASS and expiring on the due date. Optional for humidity sensors (50% issued).
- Extensions: on overdue assets, one third APPROVED (14 days from the due date), one third REJECTED, REVOKED or EXPIRED, one third with none.
- Uses: timestamps on a 15-minute grid, uniform over the window. A sample is accepted only when the rule engine returns ALLOWED/WITHIN_VALIDITY. Three uses are added per approved extension. Anomalous uses are injected on top.
- Anomalies per scale (starter 5, full 20): due-date mismatch, missing certificate, certificate–asset mismatch, expired certificate, expired use without extension, unauthorized-extension use, missing impact assessment. Failed calibrations and overdue work orders are labelled naturally.
- Generated records contain no nondeterministic timestamps or random UUIDs. Live workflow records retain real audit times and are not baseline checksum evidence.
