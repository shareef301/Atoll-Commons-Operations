create function public.ops_export_records()
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'workspaces',(select coalesce(jsonb_agg(w),'[]'::jsonb) from public.ops_workspaces w),
    'memberships',(select coalesce(jsonb_agg(m),'[]'::jsonb) from public.ops_memberships m),
    'identities',(select coalesce(jsonb_agg(i),'[]'::jsonb) from public.ops_identities i)
  );
$$;
create function public.ops_restore_records(p_records jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  lock table public.ops_workspaces,public.ops_memberships,public.ops_identities in access exclusive mode;
  if exists(select 1 from public.ops_workspaces) or exists(select 1 from public.ops_memberships) or exists(select 1 from public.ops_identities) then
    raise exception 'Restore requires empty application tables';
  end if;
  if jsonb_typeof(p_records->'workspaces') is distinct from 'array' or jsonb_typeof(p_records->'memberships') is distinct from 'array' or jsonb_typeof(p_records->'identities') is distinct from 'array' then
    raise exception 'Invalid backup records';
  end if;
  insert into public.ops_workspaces select * from jsonb_populate_recordset(null::public.ops_workspaces,p_records->'workspaces');
  insert into public.ops_memberships select * from jsonb_populate_recordset(null::public.ops_memberships,p_records->'memberships');
  insert into public.ops_identities select * from jsonb_populate_recordset(null::public.ops_identities,p_records->'identities');
end;
$$;
revoke all on function public.ops_export_records(),public.ops_restore_records(jsonb) from public,anon,authenticated;
grant execute on function public.ops_export_records(),public.ops_restore_records(jsonb) to service_role;
