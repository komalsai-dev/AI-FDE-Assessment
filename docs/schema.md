# Schema & relationships

All primary keys are immutable text IDs. Display labels are never used as foreign keys.

| Entity | PK pattern | Relationships (cardinality) |
|---|---|---|
| instrument_types | `PRS`, `TMP`, … | 1 — N calibration_plans, 1 — N assets |
| suppliers | `SUP-001` | 0..1 — N assets, 0..1 — N calibration_events |
| calibration_plans | `PLN-<type>-V<n>` | N — 1 instrument_type. No overlapping effective ranges per type (`EXCLUDE USING gist`) |
| assets | `AST-000001` | 1 — N calibration_events, work_orders, production_use, exception_records |
| calibration_events | `CAL-<asset>-<year>-000001` | N — 1 asset, N — 1 plan (captures `tolerance_used`, `interval_days_used`), 0..1 — 1 certificate (unique `calibration_id`), 0..1 impact assessment |
| certificates | `CERT-<calibration_id>` | 1 — 1 calibration_event. `asset_id` must match the event's asset in valid data (checked by the detector, not by an FK, so anomalies can be represented) |
| exception_records | `EXC-000001` | N — 1 asset |
| work_orders | `WO-<year>-000001` | N — 1 asset, 0..1 — 1 calibration_event, 1 — N downtime_events |
| downtime_events | `DT-000001` | N — 0..1 work_order |
| production_use | `USE-<asset>-<YYYYMMDDTHHMMSS>[-n]` | N — 1 asset, 0..1 extension, 0..1 calibration |
| use_attempts | `ATT-000001` | N — 1 asset, 0..1 — 1 resulting production_use |
| alerts | `ALR-…` | 0..1 asset. Unique (issue_type, related_entity_type, related_entity_id) |
| corrective_actions | `CA-…` | N — 1 asset, 0..1 calibration, 0..1 alert |
| impact_assessments | `IA-…` | 1 — 1 failed calibration |
| audit_records / state_history | bigserial | Polymorphic (entity_type, entity_id). Append-only |
| generation_runs / evaluation_runs | uuid | Metadata only. Kept out of exported records so checksums stay reproducible |
| ground_truth_cases | `GT-000001` | Separate from detector inputs |

**ID collisions:** a use ID gets `-2`, `-3`, … appended when an asset is used twice at the same second. Live-created alerts, corrective actions, impact assessments, extensions and downtime events use a `-L` suffix so they can never collide with generated sequences. Calibration and work-order IDs advance their counter past the current maximum.

**View:** `v_asset_status` holds the last finished calibration, the last PASS, the expected and stored due dates, days past due, and the calculated status at the configured simulation date.
