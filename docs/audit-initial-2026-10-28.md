# Calibra initial audit — 28 October 2026

## A. Summary

**Status: inspection completed; repairs awaiting approval. Not acceptance-complete.** This audit used the code-review skill: confirmed findings are reported before changing application behavior. No application code, dependencies, database schema or database records were changed. Only audit documentation, the work checklist and preservation requirements were recorded.

All 14 content pages were source-inspected and opened in Chromium. Each returned HTTP 200; no browser page exceptions were observed. All 35 existing tests passed. These are not evidence that every write workflow works.

## B. Confirmed defect register

All entries below remain open; files listed are responsible files, not changed files. Browser reproduction is explicitly distinguished from source inspection.

| ID | Severity | Affected area / root cause | Evidence and proposed regression |
|---|---|---|---|
| D01 | Critical | Generation starts by resetting existing operational data, including audit history and truth. | `gen.server.ts:startRun`, migration `calibra_reset`; source and live function inspected, never invoked. Test populated-dataset refusal without reset. |
| D02 | High | Optimistic updates compare timestamp text representations rather than typed values. | `apply_ops` uses column `::text`; live SELECT proved SQL timestamp text differs from JSON text for both later calibration events. Test unchanged timestamp accepted and changed timestamp rejected in rollback-safe database verification. |
| D03 | High | Evaluation compares all live findings against baseline-only truth. | Latest persisted run has 366 TP and two unexpected later failures. Separate baseline-cohort scoring from live compliance, without filtering unexplained findings or modifying truth. |
| D04 | High | Checksums omit nested JSON properties because the serializer uses a top-level key array as a recursive property filter. | `generator.ts:canonical`; source inspection and isolated serialization reproduction. Test nested changes and reordered nested keys; version checksum algorithm. |
| D05 | High | Request retries have no durable request identifier; generation audit inserts and progress are separate and not replay-safe. | `actions.server.ts` create/use/downtime handlers; `gen.server.ts:insertAppend/runStep`. Test retry counts and interruption recovery with isolated data. |
| D06 | High | Eligibility reads occur before the write transaction; failed reads can be interpreted as empty events or zero blockers/affected uses. | `actions.server.ts:contextFor`, release, failure follow-up, use.request. Add error propagation and transactional revalidation; test read errors and concurrent quarantine/revocation. |
| D07 | High | Rescheduling changes only the date, without rechecking plan version/supplier; work orders accept an unrelated asset/calibration pair. | `actions.server.ts:cal.reschedule/wo.create`. Test plan boundary and mismatched ownership. Current stored ownership mismatch count is zero. |
| D08 | High | Release/alert remediation treats cancelled corrective actions as cleared instead of requiring completed, approved actions. | `actions.server.ts:asset.release/alert.transition`; shared rule and business documentation require completion. Test cancelled/unapproved actions still block release. |
| D09 | Medium | Missing finite-number validation; certificate checks ignore future issue dates and explicit EXPIRED status; approval compares an assignee name to a decorated actor name. | `actions.server.ts:cal.complete/ca.transition`, `rules/certificates.ts`. Test invalid numbers, future-issued/expired certificates and independent approval. |
| D10 | Medium | Failure follow-up omits some audit/initial-state entries; inclusive impact windows omit fractional seconds; downtime uses lexical timestamp ordering and rounded accumulation. | `actions.server.ts`, `rules/correctiveActions.ts`. Test audit completeness, next-midnight boundary and offset/short-interval downtime. Existing histories will not be fabricated or rewritten. |
| D11 | Medium | Same-page global search updates the URL but not table state. | Browser: `/assets?q=audit-nonexistent-asset` still showed 25 rows and an empty table search. `DataTable.tsx` reads initial search only once. Test same-route search updates. |
| D12 | Medium | Timestamp To-date filters end at midnight at the start of the selected day. | Browser: Audit From/To 2026-10-27 showed zero; direct SELECT found 14 entries that day. Test full-day half-open range. |
| D13 | Medium | Saved evaluation report omits unexpected/missed IDs after reload; cards mix old validation with newer evaluation. | Browser download contained only `metrics` despite FP=2. Source `data-quality.tsx` reads details from temporary state and selects successes from newest 20 mixed runs. Test historic report and latest-success/latest-attempt labels. |
| D14 | Medium | Exports lose sort direction and silently stop at 100,000 rows; pagination lacks a unique tie-breaker; export-limit setting is not consumed. | `DataTable.tsx`, `lib/data.ts`, export handler; source-confirmed. Test tied sorting, descending export and explicit completeness/limit behavior. |
| D15 | Medium | KPI links differ from their counted populations; supplier fail-rate denominator includes unfinished work; report request counts ignore report dates. | `index.tsx`, `suppliers.tsx`, `reports.tsx`; source-confirmed. Test populations, finished-result denominator and date boundaries. |
| D16 | Medium | Reproducibility overall success ignores stored-checksum disagreement; zero-TP nonempty comparison returns unavailable F1; equal-date generator sorting never reaches its tie-breaker. | `gen.server.ts:runReproducibility`, `evaluation/metrics.ts:prf`, generator work-order comparator. Test each calculation independently. |
| D17 | Medium | Data Quality tables overflow the desktop viewport. | Browser at 1280×1800: document horizontal overflow; screenshot confirms clipped evaluation columns. Add scrolling constraints and check table accessibility. |

Detail queries also have undisclosed limits (100 asset-use history rows; 500 affected uses) and some dialogs have no visible loading/read-error distinction. Aggregate pages transfer whole supporting tables for browser aggregation; dashboard load measured 11.64 seconds on the first visit, reports 4.41 seconds, suppliers 4.07 seconds. These timings include network loading and are not a benchmark or proof of a particular bottleneck.

The suspected generic table-tab state bug was **not reproduced**: Audit → State transitions and Production Use → requests loaded without errors. It is not listed as a confirmed defect.

## C. Database

Baseline run: `47d84eaf-1200-4f5f-aa17-afdf89fdc5b6`, generator 1.0.0, seed 20261022, full scale, window 2025-10-28 through 2026-10-28. Completed 2026-10-27 19:58:36.344 UTC.

| Entity | Baseline | Audit initial / final | Delta |
|---|---:|---:|---:|
| assets | 2000 | 2000 / 2000 | 0 |
| calibration_events | 5000 | 5002 / 5002 | +2 |
| production_use | 100000 | 100000 / 100000 | 0 |
| work_orders | 5040 | 5042 / 5042 | +2 |
| alerts | 366 | 368 / 368 | +2 |
| corrective_actions | 174 | 176 / 176 | +2 |
| impact_assessments | 154 | 156 / 156 | +2 |
| audit_records | 2000 | 2014 / 2014 | +14 |
| state_history | 218 | 225 / 225 | +7 |
| ground_truth_cases | 366 | 366 / 366 | 0 |

Other initial counts: instrument_types 8, suppliers 12, calibration_plans 16, certificates 4324, exception_records 106, downtime_events 4837, use_attempts 2, settings 9, settings_history 0, alert_notes 0, generation_runs 3, evaluation_runs 14, id_counters 10.

Audit records 2203–2216 document two subsequent calibration failure tests on AST-000005, at 20:02–20:03 UTC on 27 October. Each scheduled a calibration and work order, started and failed calibration, created corrective action and assessment, then recorded a blocked request. The corresponding events are `CAL-AST-000005-2026-000004` and `CAL-AST-000005-2026-000005`; work orders `WO-2026-003334` and `WO-2026-003335`. They explain the increases without deleting anything. Audit identity sequences have gaps, so maximum audit ID is not a row count.

Reviewed the sole migration plus actual public policies, constraints, indexes, write/reset/ID functions and audit/state/truth triggers. PKs, parent FKs, unique certificate/assessment/alert constraints and plan non-overlap constraints are present. Read-only checks found zero work-order/calibration asset mismatches, zero calibration-plan type mismatches, zero failed events missing corrective actions, zero downtime arithmetic mismatches at 0.02-hour tolerance, and zero BLOCKED actual production-use rows. The 20 certificate mismatches and 20 missing assessments are deliberately labeled anomalies, not zero-integrity failures to erase. No migration was applied. Initial and final core counts match.

Historical failures remain: four validation/evaluation runs contain `*.asc` errors; later runs succeeded. Current `fetchAll` maps the named tables to primary keys, so those specific default failures appear addressed, but lack regression tests. An older generation run still says RUNNING at its reference step despite a newer full run succeeding; its status remains untouched pending a documented interruption policy.

## D. Business rules

Existing executed tests cover due dates, plan versions, tolerances, use decisions, extensions, certificate mismatch/missing/expiry dates, lifecycle matrices, failure requirement helpers and impact windows. Source review identified the gaps in D06–D10. No new action, database rollback, approval or release test was executed. No write workflow was performed during this audit.

## E. Mandatory scenarios

Latest stored evaluation reports 20 expected/20 detected for each: due-date mismatch, expired use without exception, certificate asset mismatch, failure without impact assessment. All 366 truth entries match stored alerts on entity type, entity ID, issue type and rule ID. Existing deterministic tests for the four scenarios passed. A fresh full-scale in-memory generation independently reproduced 366 cases and baseline TP=366/FP=0/FN=0 without touching Supabase. Persisted alert matching is not a fresh live detector run.

## F. Evaluation metrics

Latest stored evaluation `c9952a57-c6cc-4cf7-ae9c-45737134c68f` completed 28 October 07:38:29 UTC: TP=366, FP=2, FN=0, precision=366/368=99.4565%, recall=100%, F1=732/734=99.7275%. The two unmatched findings are CALIBRATION_FAILED for the later event IDs listed above, rule R7-CAL-FAILED. They are real post-generation failures absent from synthetic baseline truth, not demonstrated false detector alarms. Do not delete them or add labels merely to improve the score.

Stored TN=223000 sums different rule-check populations, not unique negative instruments or an independently labeled negative cohort. It must not be presented as a conventional validated true-negative population. Earlier baseline 100% and current live 99.5% are compatible once their datasets are identified.

## G. Page-by-page results

| Page | Observed passed | Failed / unverified |
|---|---|---|
| Dashboard | Loads real KPIs/charts | Drilldown population mismatch source-confirmed; writes untested |
| Assets | List, next-page navigation, create dialog opens | Same-page global search failed; create/edit/retire not submitted |
| Asset detail | Existing AST-000005/history loads | Edit, release, retire not submitted |
| Calibration | List loads | Schedule/reschedule/start/pass/fail not executed this audit |
| Certificates | List loads | Metadata/revoke/export writes untested |
| Work orders | List loads | Create/assign/start/complete/cancel/downtime untested |
| Production use | List and gate-request tab load | Use requests and duplicate submissions untested |
| Alerts/extensions | List loads | Notes, transitions, approvals and revocation untested |
| Corrective actions | List loads | Completion/approval/assessment writes untested |
| Suppliers | List/statistics load | Create/edit untested; fail-rate denominator defect |
| Reports | Reports/charts load | Request date-scope defect source-confirmed; CSV controls untested |
| Data Quality | Counts/history/metrics load; JSON downloads | Download missing IDs; overflow; no new run initiated |
| Audit | List/state tab load | Same-day date filter failed; append-only mutation not attempted |
| Settings | Settings/controls load | Save/export/generation/resume not submitted; generation is destructive |

Read-only distinct interactions exercised: navigation by direct route, tab buttons, text search submission, date inputs, pagination, dialog opening/Escape, and one file download. No claim is made that every button, selector, confirmation, role permission, keyboard path or viewport was tested. Tests ran at 1280×1800 only.

## H. Automated tests

Executed `bunx vitest run`: 3 files, 35 passed, 0 failed, 0 skipped (28 rules, 6 generator, 1 routing). No new regression tests added before repair approval. Preview diagnostic at 07:47:06 UTC says build OK; no manual build/typecheck performed.

## I. Security and performance

Security tool returned a current supply-chain scan from 27 October 20:05:55 UTC with no findings, but **no deep-scan results**. Run a scan from the Security tab before drawing security conclusions. This is not a claim that the app is secure. No independent security review was undertaken.

The documented interface uses demo identities, not authenticated accounts. Hosted authentication configuration and production authorization were not verified; do not claim production readiness. Database reads are explicitly public for synthetic prototype data. Whole-table aggregation, pagination/export ordering and generation replay risks need focused work. No destructive load/performance tests were run.

## J. Remaining work

Approve the repair plan, then implement targeted changes and execute regression tests, isolated rollback/concurrency tests, safe additive live workflows and full export validation. Existing data and failed-run history must remain preserved. Real authenticated role testing needs an approved identity setup; a deep security scan needs Security-tab execution. Actual GitHub repository contents/visibility were not accessible or verified, so submission readiness is not claimed.