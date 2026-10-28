CREATE TABLE public.action_receipts (request_id uuid PRIMARY KEY, action text NOT NULL, actor text NOT NULL, payload jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.action_receipts TO service_role;
ALTER TABLE public.action_receipts ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.generation_step_receipts (run_id uuid NOT NULL REFERENCES public.generation_runs(run_id), step text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(run_id,step));
GRANT ALL ON public.generation_step_receipts TO service_role;
ALTER TABLE public.generation_step_receipts ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.apply_ops(ops jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $function$
declare op jsonb; t text; cols text; n int; allowed text[] := array['action_receipts','settings','settings_history','instrument_types','suppliers','calibration_plans','assets','calibration_events','certificates','exception_records','work_orders','downtime_events','production_use','use_attempts','alerts','alert_notes','corrective_actions','impact_assessments','audit_records','state_history','evaluation_runs']; k text; cond text; matched boolean;
begin
 for op in select * from jsonb_array_elements(ops) loop
  t := op->>'table';
  if not t = any(allowed) then raise exception 'TABLE_NOT_ALLOWED: %', t; end if;
  cond := format('%I = %L', op->>'pk', op->>'id');
  if op ? 'expect' then
   for k in select jsonb_object_keys(op->'expect') loop
    cond := cond || format(' and %I is not distinct from (select %I from jsonb_populate_record(null::public.%I, $2))', k, k, t);
   end loop;
  end if;
  if op->>'op' = 'assert' then
   execute format('select true from public.%I where %s for update',t,cond) into matched using '{}'::jsonb,coalesce(op->'expect','{}'::jsonb);
   if matched is distinct from true then raise exception 'CONCURRENT_MODIFICATION: % changed during validation',t; end if;
  else
   select string_agg(quote_ident(key), ',') into cols from jsonb_object_keys(op->'values') key;
   if op->>'op' = 'insert' then
    execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1)', t, cols, cols, t) using op->'values';
   elsif op->>'op' = 'update' then
    execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where %s', t, cols, cols, t, cond) using op->'values',coalesce(op->'expect','{}'::jsonb);
    get diagnostics n = row_count;
    if n <> 1 then raise exception 'CONCURRENT_MODIFICATION: % % changed or missing',t,op->>'id'; end if;
   else raise exception 'BAD_OP'; end if;
  end if;
 end loop;
 return jsonb_build_object('applied',jsonb_array_length(ops));
end $function$;
REVOKE ALL ON FUNCTION public.apply_ops(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.apply_ops(jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.append_generation_history(p_run_id uuid,p_audit jsonb,p_state jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $function$
begin
 perform 1 from generation_runs where run_id=p_run_id and status='RUNNING' for update;
 if not found then raise exception 'Generation is not running'; end if;
 if exists(select 1 from generation_step_receipts where run_id=p_run_id and step='audit') then return; end if;
 insert into audit_records(entity_type,entity_id,action,old_value,new_value,actor,timestamp,reason) select entity_type,entity_id,action,old_value,new_value,actor,timestamp,reason from jsonb_populate_recordset(null::audit_records,p_audit);
 insert into state_history(entity_type,entity_id,previous_state,new_state,reason,actor,changed_at,related) select entity_type,entity_id,previous_state,new_state,reason,actor,changed_at,related from jsonb_populate_recordset(null::state_history,p_state);
 insert into generation_step_receipts(run_id,step) values(p_run_id,'audit');
 update generation_runs set progress=jsonb_build_object('last_step','audit','at',now()) where run_id=p_run_id;
end $function$;
REVOKE ALL ON FUNCTION public.append_generation_history(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.append_generation_history(uuid,jsonb,jsonb) TO service_role;