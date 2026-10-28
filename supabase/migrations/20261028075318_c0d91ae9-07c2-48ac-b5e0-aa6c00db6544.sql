CREATE OR REPLACE FUNCTION public.apply_ops(ops jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public AS $function$
declare op jsonb; t text; cols text; n int; allowed text[] := array['settings','settings_history','instrument_types','suppliers','calibration_plans','assets','calibration_events','certificates','exception_records','work_orders','downtime_events','production_use','use_attempts','alerts','alert_notes','corrective_actions','impact_assessments','audit_records','state_history','evaluation_runs']; k text; cond text;
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
     cond := cond || format(' and %I is not distinct from (select %I from jsonb_populate_record(null::public.%I, $2))', k, k, t);
    end loop;
   end if;
   execute format('update public.%I set (%s) = (select %s from jsonb_populate_record(null::public.%I, $1)) where %s', t, cols, cols, t, cond) using op->'values', coalesce(op->'expect','{}'::jsonb);
   get diagnostics n = row_count;
   if n <> 1 then raise exception 'CONCURRENT_MODIFICATION: % % was changed by someone else or does not exist', t, op->>'id'; end if;
  else raise exception 'BAD_OP'; end if;
 end loop;
 return jsonb_build_object('applied', jsonb_array_length(ops));
end $function$;