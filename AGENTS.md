
# Calibra architecture rules
- Business rules live only in `src/rules/` as pure functions. The UI, server actions, generator, detector and tests all import them, so behaviour stays identical everywhere.
- Every write goes through `runActionFn` → `src/lib/actions.server.ts`, which uses `applyOps` (the `apply_ops` RPC, one transaction, optimistic `expect`). The browser only reads, which gives atomicity, auditing and server-side role checks.
- Every action appends `audit_records`, and `state_history` for state changes. Those tables are append-only by trigger, which keeps traceability tamper-resistant.
- The detector (`rules/validation.ts`) must never read `ground_truth_cases`. Evaluation only compares against ground truth afterwards.
- The generator is deterministic. Never add wall-clock times or random IDs to generated rows, because reproducibility checksums depend on it.
- Generation runs as resumable server steps (`gen.server.ts`) with idempotent upserts, so long runs survive worker and request limits.
- Date convention: validity ends at the start of `next_due_date` (UTC). Keep the SQL view `v_asset_status` in sync with `rules/calibration.ts`.
- Live-created IDs use a `-L` suffix, or advance counters past existing maxima, so they never collide with generated sequences.
- Shared query ordering uses `src/lib/query-order.ts` for primary keys and deterministic tie-breakers, so pagination and exports use the same stable identity.
- Checksum algorithms carry a version and recursively preserve nested JSON evidence; historical checksums must not be silently reinterpreted.
- Eligibility and remediation actions advance the asset revision in the same transaction; release and use compare it to reject stale decisions.
