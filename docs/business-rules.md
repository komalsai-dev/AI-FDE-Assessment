# Business rules

The rules are implemented once in `src/rules/` and reused by the UI, the server actions, the generator, the detector and the tests.

| ID | Rule | Implementation |
|---|---|---|
| R1 | `next_due_date = calibration_date + interval_days_used`. **Validity ends at 00:00 UTC on the due date.** Overdue when `sim_date >= due`. Failed, scheduled or in-progress events never extend validity. | `rules/dates.ts`, `rules/calibration.ts` |
| R1-DUE-DATE | A stored `next_due_date` that differs from the expected value raises `DUE_DATE_PLAN_MISMATCH`. The stored value is preserved, never overwritten. | `rules/validation.ts` |
| R2 | Eligibility comes from lifecycle (RETIRED/QUARANTINED block), the latest finished calibration (FAIL blocks), the latest PASS and its due date, and certificate conditions. | `rules/compliance.ts` |
| R3 | Overdue detection and days overdue are computed in `v_asset_status` (SQL) and `calibrationStatus` (TS), both using the same convention. | migration, `rules/calibration.ts` |
| R4 | A use request returns ALLOWED, BLOCKED or FLAGGED_FOR_REVIEW, with the rule ID, reason code, explanation, calibration, plan, due date, certificate status and extension. Overdue use without a valid extension is BLOCKED when the plan prohibits it, otherwise FLAGGED. A use that already happened is recorded as FLAGGED, never as BLOCKED. Requests are stored separately in `use_attempts`. | `rules/compliance.ts`, `use.request` |
| R5 | Certificate checks raise MISSING, EXPIRED (expiry before the calibration due date, or REVOKED/INVALID) and ASSET_MISMATCH as separate issue types. New certificates must match the event's asset. | `rules/certificates.ts`, `cert.create` |
| R6 | An extension authorizes use only if it is APPROVED, has an approver, the time is inside [valid_from, valid_until), and the scope covers the line. The original due date is never changed. An extension cannot release a failed or quarantined instrument. Using a non-authorizing extension raises `UNAUTHORIZED_EXTENSION`. | `rules/exceptions.ts` |
| R7 | A failed calibration preserves the FAIL result and, in one transaction, quarantines the asset and creates a CALIBRATION_FAILED alert, a corrective action, and a REQUIRED impact assessment. The assessment window runs from the last PASS to the failure, and affected uses are counted. Release needs a newer PASS, all corrective actions completed and approved, and all impact assessments completed. Completing a work order never restores validity. | `rules/correctiveActions.ts`, `cal.complete`, `asset.release` |
| R8 | Lifecycle transition matrices exist for calibration, work order, alert, corrective action, impact assessment, extension and asset. Invalid transitions throw `INVALID_TRANSITION`. Some transitions require a reason. | `rules/lifecycle.ts` |
| R9 | Derived values (due dates, decisions, downtime, alerts, metrics) are computed from source records. Nothing is assigned randomly. | generator + detector |
| R10 | Every write appends `audit_records` and, for state changes, `state_history`. Both tables are append-only (DB trigger). | `db.server.ts` |
| R11 | `apply_ops` runs all of an action's writes in one transaction. Updates carry optimistic expectations (`expect`), so concurrent transitions fail with `CONCURRENT_MODIFICATION`. Unique constraints (certificate per event, alert per issue+entity, impact assessment per event) give idempotency. | migration |

**Corrective action approval:** submitting needs a root cause and resolution notes. The approver must be a different person from the assignee.

**Alert resolution:** needs the underlying condition to be met (impact assessment completed, corrective actions completed, work order closed). Resolving an alert never changes eligibility.
