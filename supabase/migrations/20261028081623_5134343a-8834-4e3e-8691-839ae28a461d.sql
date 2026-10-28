DO $tests$
declare original public.settings%rowtype; current_version integer; caught boolean := false;
begin
 select * into original from public.settings where key='warning_threshold_days';
 begin
  perform public.apply_ops(jsonb_build_array(jsonb_build_object('op','update','table','settings','pk','key','id',original.key,'values',jsonb_build_object('version',original.version+1),'expect',jsonb_build_object('updated_at',to_jsonb(original)->>'updated_at'))));
  select version into current_version from public.settings where key=original.key;
  if current_version <> original.version+1 then raise exception 'Typed timestamp check failed'; end if;
  raise exception using errcode='P0002',message='rollback successful typed timestamp fixture';
 exception when no_data_found then null;
 end;
 select version into current_version from public.settings where key=original.key;
 if current_version <> original.version then raise exception 'Fixture rollback failed'; end if;
 begin
  perform public.apply_ops(jsonb_build_array(jsonb_build_object('op','update','table','settings','pk','key','id',original.key,'values',jsonb_build_object('version',original.version+1),'expect',jsonb_build_object('version',original.version)),jsonb_build_object('op','update','table','settings','pk','key','id','nonexistent_audit_fixture','values',jsonb_build_object('version',1))));
 exception when others then
  if SQLERRM not like 'CONCURRENT_MODIFICATION:%' then raise; end if;
  caught := true;
 end;
 if not caught then raise exception 'Expected transaction failure missing'; end if;
 select version into current_version from public.settings where key=original.key;
 if current_version <> original.version then raise exception 'Atomic rollback failed'; end if;
 begin
  perform public.apply_ops(jsonb_build_array(jsonb_build_object('op','assert','table','settings','pk','key','id',original.key,'expect',jsonb_build_object('version',original.version+10))));
  raise exception 'Stale expectation was accepted';
 exception when others then
  if SQLERRM not like 'CONCURRENT_MODIFICATION:%' then raise; end if;
 end;
end $tests$;