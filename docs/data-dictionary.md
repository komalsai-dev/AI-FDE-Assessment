# Data dictionary

R = required, O = optional. All timestamps are `timestamptz` in UTC, and all dates are ISO `date`.

## instrument_types
| Field | Type | Req | Rules |
|---|---|---|---|
| instrument_type_id | text PK | R | 3-letter code |
| type_name | text | R | unique |
| measurement_unit | text | R | bar, °C, kg, m³/h, pH, N·m, µS/cm, %RH |
| default_tolerance | numeric | R | > 0, in measurement_unit |
| description | text | O | |

## suppliers
| supplier_id | text PK | R | `SUP-###` |
|---|---|---|---|
| supplier_name | text | R | |
| approval_status | text | R | APPROVED, CONDITIONAL, PENDING, SUSPENDED, REVOKED |
| valid_from / valid_to | date | O | valid_to ≥ valid_from. Eligibility is checked at the scheduled date |

## calibration_plans
| plan_id | text PK | R | `PLN-<type>-V<n>` |
|---|---|---|---|
| instrument_type_id | FK | R | |
| interval_days | int | R | > 0 |
| tolerance | numeric | R | > 0, absolute, in type unit |
| requires_certificate / prohibit_overdue_use | bool | R | default true |
| effective_from / effective_to | date | R/O | half-open [from, to). No overlap per type |
| version | int | R | > 0, unique per type |
| status | text | R | DRAFT, ACTIVE, SUPERSEDED, RETIRED |

## assets
| asset_id | text PK | R | `^AST-\d{6}$`, immutable |
|---|---|---|---|
| asset_name, location | text | R | |
| instrument_type_id | FK | R | |
| supplier_id | FK | O | |
| serial_number | text | O | unique when present |
| lifecycle_status | text | R | ACTIVE, QUARANTINED, RETIRED (transitions in `rules/lifecycle.ts`) |
| retired_at | timestamptz | O | set on retirement. History is kept |

## calibration_events
| calibration_id | text PK | R | `CAL-<asset>-<year>-######` |
|---|---|---|---|
| asset_id, plan_id | FK | R | |
| supplier_id | FK | O | must be eligible on the date |
| scheduled_date | date | O | |
| calibration_date | date | O | required when COMPLETED/FAILED |
| next_due_date | date | O | **derived**: calibration_date + interval_days_used (PASS only) |
| result | text | O | PASS, FAIL. Null until completed |
| measured_value / reference_value | numeric | O | |
| tolerance_used / interval_days_used | numeric/int | R | captured from the plan version at scheduling |
| event_status | text | R | SCHEDULED, IN_PROGRESS, COMPLETED, FAILED, CANCELLED. A check constraint keeps it consistent with result |

## certificates
| certificate_id | text PK | R | `CERT-<calibration_id>` |
|---|---|---|---|
| calibration_id | FK unique | R | one certificate per event |
| asset_id | FK | R | must equal the event's asset |
| issue_date | date | R | |
| expiry_date | date | O | ≥ issue_date. Defaults to the calibration due date |
| certificate_status | text | R | VALID, EXPIRED, REVOKED, INVALID |
| document_reference | text | O | synthetic reference only |

## exception_records (emergency extensions)
exception_id PK; asset_id FK; exception_type = EMERGENCY_EXTENSION; approval_status PENDING, APPROVED, REJECTED, EXPIRED, REVOKED; approved_by O; valid_from < valid_until (R); reason R; scope = `ALL_LINES` or a line ID.

## work_orders
work_order_id `WO-<year>-######`; asset_id FK; calibration_id FK O; work_order_type CALIBRATION, MAINTENANCE, CORRECTIVE, INSPECTION; priority LOW to CRITICAL; status OPEN, IN_PROGRESS, BLOCKED, COMPLETED, CANCELLED; assigned_to O; created_at ≤ started_at ≤ completed_at; due_at R; cancel_reason required when CANCELLED; downtime_hours **derived** = Σ(downtime_events.end − start) in hours.

## downtime_events
downtime_id PK; asset_id FK; work_order_id FK O; start_at < end_at; reason R.

## production_use (uses that happened)
use_id PK; asset_id FK; used_at R; production_line R (LINE-A to LINE-F); operation_id O; decision ALLOWED or FLAGGED_FOR_REVIEW; reason_code required unless ALLOWED; rule_id; exception_id FK O; calibration_id FK O (the calibration that justified the use).

## use_attempts (gate requests)
attempt_id `ATT-######`; asset_id; requested_at; production_line; decision ALLOWED, BLOCKED, FLAGGED_FOR_REVIEW; rule_id; reason_code; explanation; evaluation (jsonb with the full decision); resulting_use_id (null unless allowed); actor.

## alerts
alert_id PK; asset_id O; related_entity_type and related_entity_id R; issue_type (DUE_DATE_PLAN_MISMATCH, EXPIRED_USE_WITHOUT_EXCEPTION, CERTIFICATE_ASSET_MISMATCH, CERTIFICATE_MISSING, CERTIFICATE_EXPIRED, CALIBRATION_FAILED, IMPACT_ASSESSMENT_MISSING, UNAUTHORIZED_EXTENSION, OVERDUE_WORK_ORDER); severity; status OPEN, ACKNOWLEDGED, IN_PROGRESS, RESOLVED; rule_id; explanation; details jsonb; assigned_to; resolved_at. Notes are in `alert_notes`.

## corrective_actions
corrective_action_id; asset_id; calibration_id; alert_id O; action_type; priority; status OPEN, IN_PROGRESS, PENDING_APPROVAL, COMPLETED, CANCELLED; assigned_to; due_at; completed_at and approved_by (required when COMPLETED); root_cause; resolution_notes.

## impact_assessments
assessment_id; asset_id; calibration_id (unique); status REQUIRED, IN_PROGRESS, COMPLETED; assessment_start ≤ assessment_end; findings; affected_use_count (**derived** from production_use in the window); conclusion (required when COMPLETED); assessed_by; completed_at.

## audit_records / state_history
Append-only. audit has entity_type, entity_id, action, old_value, new_value (jsonb), actor, timestamp, reason. state_history has previous_state, new_state, reason, actor, changed_at, related.

## settings / settings_history
Key/value jsonb with version. Every change writes a history row (old, new, version, actor, reason).

## generation_runs / evaluation_runs / ground_truth_cases
See `docs/schema.md`. Ground truth has case_id, entity_type, entity_id, issue_type, expected_decision, expected_violation, rule_id, severity.
