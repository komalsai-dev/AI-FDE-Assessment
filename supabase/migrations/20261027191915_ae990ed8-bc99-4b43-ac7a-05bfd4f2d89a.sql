
create extension if not exists btree_gist with schema extensions;

create table public.settings (key text primary key, value jsonb not null, version int not null default 1, updated_by text not null default 'system', updated_at timestamptz not null default now());
create table public.settings_history (id bigserial primary key, key text not null, old_value jsonb, new_value jsonb not null, version int not null, actor text not null, reason text, changed_at timestamptz not null default now());
create table public.id_counters (prefix text primary key, value bigint not null default 0);

create table public.instrument_types (instrument_type_id text primary key, type_name text not null unique, measurement_unit text not null, default_tolerance numeric not null check (default_tolerance > 0), description text, created_at timestamptz not null default now());

create table public.suppliers (supplier_id text primary key, supplier_name text not null, approval_status text not null check (approval_status in ('APPROVED','CONDITIONAL','PENDING','SUSPENDED','REVOKED')), valid_from date, valid_to date, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (valid_to is null or valid_from is null or valid_to >= valid_from));

create table public.calibration_plans (plan_id text primary key, instrument_type_id text not null references public.instrument_types(instrument_type_id), interval_days int not null check (interval_days > 0), tolerance numeric not null check (tolerance > 0), requires_certificate boolean not null default true, prohibit_overdue_use boolean not null default true, effective_from date not null, effective_to date, version int not null check (version > 0), status text not null check (status in ('DRAFT','ACTIVE','SUPERSEDED','RETIRED')), created_at timestamptz not null default now(),
 unique (instrument_type_id, version), check (effective_to is null or effective_to > effective_from),
 exclude using gist (instrument_type_id with =, daterange(effective_from, effective_to, '[)') with &&));

create table public.assets (asset_id text primary key check (asset_id ~ '^AST-[0-9]{6}$'), asset_name text not null, instrument_type_id text not null references public.instrument_types(instrument_type_id), supplier_id text references public.suppliers(supplier_id), location text not null, serial_number text unique, lifecycle_status text not null check (lifecycle_status in ('ACTIVE','QUARANTINED','RETIRED')), commissioned_on date, retired_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index on public.assets (instrument_type_id); create index on public.assets (location); create index on public.assets (lifecycle_status);

create table public.calibration_events (calibration_id text primary key check (calibration_id ~ '^CAL-AST-[0-9]{6}-[0-9]{4}-[0-9]{6}$'), asset_id text not null references public.assets(asset_id), plan_id text not null references public.calibration_plans(plan_id), supplier_id text references public.suppliers(supplier_id), scheduled_date date, calibration_date date, next_due_date date, result text check (result in ('PASS','FAIL')), measured_value numeric, reference_value numeric, tolerance_used numeric not null, interval_days_used int not null check (interval_days_used > 0), event_status text not null check (event_status in ('SCHEDULED','IN_PROGRESS','COMPLETED','FAILED','CANCELLED')), cancel_reason text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check ((event_status='COMPLETED' and result='PASS' and calibration_date is not null) or (event_status='FAILED' and result='FAIL' and calibration_date is not null) or (event_status in ('SCHEDULED','IN_PROGRESS','CANCELLED') and result is null)));
create index on public.calibration_events (asset_id, calibration_date); create index on public.calibration_events (event_status); create index on public.calibration_events (scheduled_date);

create table public.certificates (certificate_id text primary key, calibration_id text not null unique references public.calibration_events(calibration_id), asset_id text not null references public.assets(asset_id), issue_date date not null, expiry_date date, certificate_status text not null check (certificate_status in ('VALID','EXPIRED','REVOKED','INVALID')), document_reference text, created_at timestamptz not null default now(), check (expiry_date is null or expiry_date >= issue_date));
create index on public.certificates (asset_id);

create table public.exception_records (exception_id text primary key, asset_id text not null references public.assets(asset_id), exception_type text not null default 'EMERGENCY_EXTENSION' check (exception_type in ('EMERGENCY_EXTENSION')), approval_status text not null check (approval_status in ('PENDING','APPROVED','REJECTED','EXPIRED','REVOKED')), approved_by text, valid_from timestamptz not null, valid_until timestamptz not null, reason text not null, scope text not null default 'ALL_LINES', created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (valid_until > valid_from));
create index on public.exception_records (asset_id);

create table public.work_orders (work_order_id text primary key check (work_order_id ~ '^WO-[0-9]{4}-[0-9]{6}$'), asset_id text not null references public.assets(asset_id), calibration_id text references public.calibration_events(calibration_id), work_order_type text not null check (work_order_type in ('CALIBRATION','MAINTENANCE','CORRECTIVE','INSPECTION')), priority text not null check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')), status text not null check (status in ('OPEN','IN_PROGRESS','BLOCKED','COMPLETED','CANCELLED')), assigned_to text, created_at timestamptz not null default now(), due_at timestamptz not null, started_at timestamptz, completed_at timestamptz, cancel_reason text, downtime_hours numeric not null default 0 check (downtime_hours >= 0), updated_at timestamptz not null default now(),
 check (started_at is null or started_at >= created_at), check (completed_at is null or (started_at is not null and completed_at >= started_at)), check (status <> 'COMPLETED' or completed_at is not null), check (status <> 'CANCELLED' or cancel_reason is not null));
create index on public.work_orders (asset_id); create index on public.work_orders (status);

create table public.downtime_events (downtime_id text primary key, asset_id text not null references public.assets(asset_id), work_order_id text references public.work_orders(work_order_id), start_at timestamptz not null, end_at timestamptz not null, reason text not null, created_at timestamptz not null default now(), check (end_at > start_at));
create index on public.downtime_events (work_order_id);

create table public.production_use (use_id text primary key, asset_id text not null references public.assets(asset_id), used_at timestamptz not null, production_line text not null, operation_id text, decision text not null check (decision in ('ALLOWED','FLAGGED_FOR_REVIEW')), reason_code text, rule_id text, exception_id text references public.exception_records(exception_id), calibration_id text references public.calibration_events(calibration_id), created_at timestamptz not null default now(), check (decision = 'ALLOWED' or reason_code is not null));
create index on public.production_use (asset_id, used_at); create index on public.production_use (decision); create index on public.production_use (used_at);

create table public.use_attempts (attempt_id text primary key, asset_id text not null references public.assets(asset_id), requested_at timestamptz not null, production_line text not null, operation_id text, decision text not null check (decision in ('ALLOWED','BLOCKED','FLAGGED_FOR_REVIEW')), rule_id text not null, reason_code text not null, explanation text not null, evaluation jsonb not null, resulting_use_id text references public.production_use(use_id), actor text not null, created_at timestamptz not null default now());

create table public.alerts (alert_id text primary key, asset_id text references public.assets(asset_id), related_entity_type text not null, related_entity_id text not null, issue_type text not null check (issue_type in ('DUE_DATE_PLAN_MISMATCH','EXPIRED_USE_WITHOUT_EXCEPTION','CERTIFICATE_ASSET_MISMATCH','CERTIFICATE_MISSING','CERTIFICATE_EXPIRED','CALIBRATION_FAILED','IMPACT_ASSESSMENT_MISSING','UNAUTHORIZED_EXTENSION','OVERDUE_WORK_ORDER','OVERDUE_CALIBRATION')), severity text not null check (severity in ('LOW','MEDIUM','HIGH','CRITICAL')), status text not null default 'OPEN' check (status in ('OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED')), rule_id text not null, explanation text not null, details jsonb not null default '{}', assigned_to text, created_at timestamptz not null default now(), resolved_at timestamptz, updated_at timestamptz not null default now(), unique (issue_type, related_entity_type, related_entity_id));
create index on public.alerts (status); create index on public.alerts (asset_id);

create table public.alert_notes (note_id bigserial primary key, alert_id text not null references public.alerts(alert_id), note text not null, actor text not null, created_at timestamptz not null default now());

create table public.corrective_actions (corrective_action_id text primary key, asset_id text not null references public.assets(asset_id), calibration_id text references public.calibration_events(calibration_id), alert_id text references public.alerts(alert_id), action_type text not null, priority text not null check (priority in ('LOW','MEDIUM','HIGH','CRITICAL')), status text not null check (status in ('OPEN','IN_PROGRESS','PENDING_APPROVAL','COMPLETED','CANCELLED')), assigned_to text, due_at timestamptz not null, completed_at timestamptz, approved_by text, root_cause text, resolution_notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (status <> 'COMPLETED' or (completed_at is not null and approved_by is not null)));
create index on public.corrective_actions (asset_id); create index on public.corrective_actions (calibration_id);

create table public.impact_assessments (assessment_id text primary key, asset_id text not null references public.assets(asset_id), calibration_id text not null unique references public.calibration_events(calibration_id), status text not null check (status in ('REQUIRED','IN_PROGRESS','COMPLETED')), assessment_start timestamptz not null, assessment_end timestamptz not null, findings text, affected_use_count int not null default 0, conclusion text, assessed_by text, completed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (assessment_end >= assessment_start), check (status <> 'COMPLETED' or (completed_at is not null and conclusion is not null)));

create table public.audit_records (audit_id bigserial primary key, entity_type text not null, entity_id text not null, action text not null, old_value jsonb, new_value jsonb, actor text not null, "timestamp" timestamptz not null default now(), reason text);
create index on public.audit_records (entity_type, entity_id); create index on public.audit_records ("timestamp");
create table public.state_history (id bigserial primary key, entity_type text not null, entity_id text not null, previous_state text, new_state text not null, reason text, actor text not null, changed_at timestamptz not null default now(), related jsonb);
create index on public.state_history (entity_type, entity_id);

create table public.generation_runs (run_id uuid primary key default gen_random_uuid(), seed bigint not null, scale text not null check (scale in ('starter','full')), generator_version text not null, sim_start date not null, sim_end date not null, status text not null check (status in ('RUNNING','SUCCEEDED','FAILED')), row_counts jsonb not null default '{}', checksums jsonb not null default '{}', progress jsonb not null default '{}', error text, started_at timestamptz not null default now(), finished_at timestamptz);
create table public.evaluation_runs (run_id uuid primary key default gen_random_uuid(), kind text not null check (kind in ('VALIDATION','EVALUATION','REPRODUCIBILITY')), status text not null check (status in ('RUNNING','SUCCEEDED','FAILED')), ground_truth_version text, inputs jsonb not null default '{}', metrics jsonb not null default '{}', summary jsonb not null default '{}', error text, started_at timestamptz not null default now(), finished_at timestamptz);
create table public.ground_truth_cases (case_id text primary key, entity_type text not null, entity_id text not null, issue_type text not null, expected_decision text, expected_violation boolean not null, rule_id text not null, severity text not null, generation_run_id uuid references public.generation_runs(run_id) on delete set null);

-- append-only guard
create or replace function public.prevent_mutation() returns trigger language plpgsql set search_path = public as $$
begin raise exception 'APPEND_ONLY: % rows cannot be modified or deleted', tg_table_name; end $$;
create trigger audit_append_only before update or delete on public.audit_records for each row execute function public.prevent_mutation();
create trigger state_append_only before update or delete on public.state_history for each row execute function public.prevent_mutation();
create trigger gt_append_only before update on public.ground_truth_cases for each row execute function public.prevent_mutation();

-- grants
do $$ declare t text; begin
 foreach t in array array['settings','settings_history','id_counters','instrument_types','suppliers','calibration_plans','assets','calibration_events','certificates','exception_records','work_orders','downtime_events','production_use','use_attempts','alerts','alert_notes','corrective_actions','impact_assessments','audit_records','state_history','generation_runs','evaluation_runs','ground_truth_cases'] loop
  execute format('grant select on public.%I to anon, authenticated', t);
  execute format('grant all on public.%I to service_role', t);
  execute format('alter table public.%I enable row level security', t);
  execute format('create policy "Public read of synthetic prototype data" on public.%I for select to anon, authenticated using (true)', t);
 end loop; end $$;
grant usage, select on all sequences in schema public to service_role;

-- atomic multi-record operations (service role only)
create or replace function public.apply_ops(ops jsonb) returns jsonb language plpgsql security definer set search_path = public as $$
declare op jsonb; t text; cols text; n int; allowed text[] := array['settings','settings_history','instrument_types','suppliers','calibration_plans','assets','calibration_events','certificates','exception_records','work_orders','downtime_events','production_use','use_attempts','alerts','alert_notes','corrective_actions','impact_assessments','audit_records','state_history','evaluation_runs'];
 k text; cond text;
begin
 for op in select * from jsonb_array_elements(ops) loop
  t := op->>'table';
  if not t = any(allowed) then raise exception 'TABLE_NOT_ALLOWED: %', t; end if;
  select string_agg(quote_ident(key), ',') into cols from jsonb_object_keys(op->'values') key;
  if op->>'op' = 'insert' then
   execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', t, cols, cols, t) using op->'values';
  elsif op->>'op' = 'update' then
   cond := format('%I = %L', op->>'pk', op->>'id');
   if op ? 'expect' then
    for k in select jsonb_object_keys(op->'expect') loop
     if jsonb_typeof(op->'expect'->k) = 'null' then cond := cond || format(' and %I is null', k);
     else cond := cond || format(' and %I::text = %L', k, op->'expect'->>k); end if;
    end loop;
   end if;
   execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where %s', t, cols, cols, t, cond) using op->'values';
   get diagnostics n = row_count;
   if n <> 1 then raise exception 'CONCURRENT_MODIFICATION: % % was changed by someone else or does not exist', t, op->>'id'; end if;
  else raise exception 'BAD_OP'; end if;
 end loop;
 return jsonb_build_object('applied', jsonb_array_length(ops));
end $$;
revoke all on function public.apply_ops(jsonb) from public, anon, authenticated;
grant execute on function public.apply_ops(jsonb) to service_role;

create or replace function public.next_ids(p_prefix text, p_count int default 1) returns bigint language plpgsql security definer set search_path = public as $$
declare v bigint; begin
 insert into public.id_counters(prefix, value) values (p_prefix, p_count) on conflict (prefix) do update set value = id_counters.value + p_count returning value into v;
 return v - p_count + 1; end $$;
revoke all on function public.next_ids(text,int) from public, anon, authenticated;
grant execute on function public.next_ids(text,int) to service_role;

create or replace function public.calibra_reset() returns void language plpgsql security definer set search_path = public as $$
begin
 truncate public.alert_notes, public.use_attempts, public.production_use, public.downtime_events, public.corrective_actions, public.impact_assessments, public.alerts, public.work_orders, public.certificates, public.exception_records, public.calibration_events, public.assets, public.calibration_plans, public.suppliers, public.instrument_types, public.audit_records, public.state_history, public.ground_truth_cases, public.id_counters;
end $$;
revoke all on function public.calibra_reset() from public, anon, authenticated;
grant execute on function public.calibra_reset() to service_role;

-- derived asset status (date convention: valid while date < next_due_date; overdue when sim_date >= due)
create or replace view public.v_asset_status with (security_invoker = on) as
with s as (
 select coalesce((select (value #>> '{}')::date from public.settings where key='simulation_date'), date '2026-10-28') as sim_date,
        coalesce((select (value #>> '{}')::int from public.settings where key='warning_threshold_days'), 30) as warn)
select a.asset_id, a.asset_name, a.instrument_type_id, it.type_name, a.supplier_id, a.location, a.serial_number, a.lifecycle_status, a.created_at,
 ld.calibration_id as last_calibration_id, ld.calibration_date as last_calibration_date, ld.result as last_result,
 lp.calibration_id as last_pass_calibration_id, lp.calibration_date as last_pass_date,
 (lp.calibration_date + lp.interval_days_used) as expected_due_date, lp.next_due_date as stored_due_date,
 case when lp.calibration_date is null then null else (s.sim_date - (lp.calibration_date + lp.interval_days_used)) end as days_past_due,
 case when a.lifecycle_status='RETIRED' then 'RETIRED'
      when a.lifecycle_status='QUARANTINED' then 'QUARANTINED'
      when ld.calibration_id is null then 'NO_CALIBRATION'
      when ld.result='FAIL' then 'FAILED'
      when s.sim_date >= lp.calibration_date + lp.interval_days_used then 'OVERDUE'
      when (lp.calibration_date + lp.interval_days_used) - s.sim_date <= s.warn then 'DUE_SOON'
      else 'VALID' end as calc_status
from public.assets a cross join s
join public.instrument_types it on it.instrument_type_id = a.instrument_type_id
left join lateral (select * from public.calibration_events e where e.asset_id=a.asset_id and e.event_status in ('COMPLETED','FAILED') and e.calibration_date <= s.sim_date order by e.calibration_date desc, e.calibration_id desc limit 1) ld on true
left join lateral (select * from public.calibration_events e where e.asset_id=a.asset_id and e.event_status='COMPLETED' and e.calibration_date <= s.sim_date order by e.calibration_date desc, e.calibration_id desc limit 1) lp on true;
grant select on public.v_asset_status to anon, authenticated, service_role;

insert into public.settings(key, value) values
 ('simulation_date', '"2026-10-28"'), ('generator_seed', '20261022'), ('generation_scale', '"starter"'),
 ('warning_threshold_days', '30'), ('default_prohibit_overdue_use', 'true'), ('default_requires_certificate', 'true'),
 ('export_row_limit', '100000'), ('sim_start', '"2025-10-28"'), ('sim_end', '"2026-10-28"');
