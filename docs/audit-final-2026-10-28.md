# Calibra audit and repair report — 2026-10-28

## A. Summary
**Conditional prototype acceptance, not production readiness.** Existing baseline, anomalies, truth and failed-run evidence were preserved. Confirmed search, date-boundary, ordering, export, scoring, measurement, workflow and transaction defects were repaired. The original two extra alerts were genuine later calibration failures, not detector false positives.

## B. Defect register
| ID / severity | Area and root cause | Repair / files | Verification |
|---|---|---|---|
| D01 High | Generation could reset existing evidence | Empty-dataset guard; `query-order.ts`, `gen.server.ts`, settings | Guard regression passed; no live reset attempted |
| D02 Medium | Wildcard ordering / unstable pagination | Shared concrete PKs and tie-breakers; `data.ts`, `db.server.ts`, DataTable | Ordering tests; fresh validation succeeds; old failures retained |
| D03 Medium | URL search not synchronized on same page | DataTable search synchronization | Browser control check |
| D04 Medium | End-date excluded the selected day | Exclusive next UTC midnight; DataTable/reports | Boundary regression; 14 historical same-day audit rows visible |
| D05 High | Baseline truth scored later operational failures | Provenance cohort; `cohort.ts`, `gen.server.ts`, Data Quality | Live comparison TP366/FP0/FN0; 3 later failures separate |
| D06 Medium | Nested JSON omitted from checksums; undefined zero-score F1 | Recursive canonicalization/version; metrics | Nested evidence/F1 regressions; isolated repeatability |
| D07 High | Timestamp text equality falsely rejected unchanged rows | Typed expectations in `apply_ops` | Live audited WO edit; rollback-safe SQL assertions |
| D08 High | Duplicate retries and unaudited detector writes | Atomic receipts, client in-flight reuse, audited detector ops | Sequential receipt/reused-input tests; concurrent response race not fully verified |
| D09 High | Invalid measurement, ownership and approval inputs | Pure input rules, actions, certificates | Automated regressions; persisted failure/quarantine/blocked request |
| D10 High | Release/use decisions could become stale | Asset revisions plus transactional assertions | Source repair and suite; multi-client release race not executed |
| D11 Medium | Silent export/history limits and wrong report populations | Full pagination, explicit configured Settings limit, history errors and denominator fixes | 100001-row pagination test; historical JSON includes missed/unexpected; not every report total checked |
| D12 Medium | Generation history retry duplicates | Transactional generation-step receipt RPC | Schema reviewed; no populated-dataset generation rerun |
| D13 High | Elevated maintenance function executable by app roles | Restrict `rls_auto_enable()` execution | Post-migration linter: no issues |
| D14 Critical | Demo roles are supplied by browser, not authenticated identity | **Unresolved**; separate real role table/auth needed | Source confirmed; never described as secure production authorization |

## C. Database
Counts at initial audit and after additive testing:

| Entity | Baseline | Initial audit | Final observed |
|---|---:|---:|---:|
| Assets | 2000 | 2000 | 2000 |
| Calibrations | 5000 | 5002 | 5003 |
| Uses | 100000 | 100000 | 100000 |
| Work orders | 5040 | 5042 | 5043 |
| Alerts | 366 | 368 | 369 |
| Corrective actions | 174 | 176 | 177 |
| Impact assessments | 154 | 156 | 157 |
| Audit records | 2000 | 2014 | 2022 |
| State history | 218 | 225 | 228 |
| Ground truth | 366 | 366 | 366 |

The retained new failure is `CAL-AST-000005-2026-000007`; assessment `IA-000003-L` counts 31 affected uses. `ATT-000003` is blocked without an actual-use insert. A subsequent work-order owner edit added one audit row. No baseline deletion, anomaly cleanup or fabricated historical audit entries were performed.

Reviewed FKs, plan exclusions, uniqueness, append-only triggers, RLS and RPC grants. Additive migrations implement typed comparisons, transactional assertions, action/generation receipts, generation history and maintenance-function privilege restriction. Rollback-only migration tests verified equivalent timestamp expectations, stale expectation rejection and full rollback after a later operation fails; fixtures were not retained.

## D. Business rules
Pure rule tests cover UTC due-date expiry, failed calibration, certificate mismatch/expiry, extension approval/scope, prohibited versus flagged use, transition matrices and release blockers. New regressions cover finite measurement, independent approvers, work-order asset ownership and fractional-second impact windows. Browser testing confirmed schedule/start/fail, quarantine, assessment creation, affected-use count and blocked gate attempt persisted after refresh. Full remediation-to-release and all certificate/extension UI sequences remain unverified.

## E. Mandatory anomaly scenarios
Live baseline comparison: due-date mismatch **20/20**, expired use without exception **20/20**, certificate asset mismatch **20/20**, missing impact assessment **20/20**. Each scenario reports PASS. Detector reads operational records only; truth is used afterwards for scoring.

## F. Evaluation metrics
Latest verified baseline comparison (08:14 UTC): **TP366, FP0, FN0; precision100%, recall100%, F1100%**. TN is not meaningful without a validated negative population. Three later failed-calibration findings remain visible separately. Whole-live validation found 369 findings and zero reported integrity issues.

Same-config generation twice was repeatable in memory. Historical checksum agreement was false for several tables and is not a persisted-baseline integrity verdict: generator ordering and checksum semantics changed. Version labels preserve that distinction. Persisted baseline checksum equivalence is **unverified**.

## G. Page-by-page results
All 14 pages returned HTTP200 with no captured page exceptions and no document-level horizontal overflow at 1280×1800.

| Page | Passed interaction evidence | Not tested / acceptance limitation |
|---|---|---|
| Dashboard | Page/KPI rendering; drilldown code repaired | Every KPI total reconciliation |
| Assets | Same-route search control | Every filter/export combination |
| Asset detail | Persisted failed event/history rendering | Full release/retire sequence |
| Calibration | Schedule/start/fail persisted | Every reschedule/cancel/supplier edge case |
| Certificates | Page; pure certificate rules | Complete create/revoke UI cycle |
| Work orders | Owner edit read back after reload | Complete transition/downtime UI cycle |
| Production use | Blocked quarantine attempt, no use insert; tabs | Live ALLOWED and FLAGGED paths |
| Exceptions & Alerts | Page rendering | Full approval/revoke/resolution cycles |
| Corrective Actions | Page; failure-created assessment evidence | Full independent approval/completion cycle |
| Suppliers | Page; denominator source correction | Every edit and SQL-reconciled report total |
| Reports | Page; date population correction | Every downloaded report total |
| Data Quality | Validation/evaluation/repro; historical JSON; no page overflow | Table internal scrolling and all small screens |
| Audit | Same-day 14 rows; Audit/State switching | Every entity filter/export |
| Settings | Page; empty-only warning/explicit export truncation | Live setting mutation and generator interruption |

## H. Automated tests
Prior final run: **55 executed, 55 passed, 0 failed, 0 skipped**, across six files. A receipt-input identity regression was added afterwards; see final command output for the updated total. Tests assert operational rules, deterministic full volumes and uncapped 100001-row pagination, not styling snapshots. Preview diagnostics were clean at 08:18:27 UTC; subsequent edits require the final diagnostic read-back.

## I. Security and performance
Database linter is clean after restricting the maintenance function. Service-role mutation RPCs are not executable by public or authenticated browser roles. This is not an exhaustive security proof. Public synthetic reads and client-selected demo write identities remain inappropriate for confidential production use. No production authorization claim is made.

Initial observed first loads included dashboard11.64s, reports4.41s, suppliers4.07s; these are observations, not controlled benchmarks. Full generation historically takes 5–10 minutes. Large exports/all-history reads can still have memory/latency costs; interrupted generation and hosted-runtime load/concurrency were not stress tested.

## J. Remaining work
1. Implement authenticated identity and separate server-validated user roles before real data or publication; account provisioning/role assignment policy is not established.
2. Execute full remediation/release, ALLOWED/FLAGGED use, certificate/extension, downtime and every-control acceptance matrices in an isolated assessment copy; unexecuted controls are not passes.
3. Stress-test simultaneous receipt retries and asset release/use mutations; committed writes are atomic, but simultaneous retry response behavior is not fully validated.
4. Reconcile all report downloads against SQL, test small-screen layouts and benchmark large exports under hosted limits.
5. Establish an immutable versioned baseline checksum comparison rather than inferring persisted integrity from same-version in-memory repeatability.