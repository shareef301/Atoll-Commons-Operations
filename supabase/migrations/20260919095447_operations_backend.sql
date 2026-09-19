-- Application records are accessible only through the trusted app server.
-- Client JWTs never receive complete workspace snapshots or evidence access.
create table public.ops_workspaces (
  id text primary key,
  owner_email text not null,
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  revision integer not null default 0 check (revision >= 0),
  created_at timestamptz not null default now()
);
create table public.ops_memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id text not null references public.ops_workspaces(id),
  email text not null unique check (email = lower(trim(email))),
  name text not null,
  role text not null check (role in ('System owner','Compliance secretary','Treasurer','Project lead','Project participant','Project sponsor','Continuity deputy','Approver','Auditor','Observer')),
  projects jsonb not null default '[]' check (jsonb_typeof(projects) = 'array'),
  governance integer not null default 0 check (governance in (0,1)),
  authority_ref text not null default ''
);
create index ops_memberships_workspace_idx on public.ops_memberships(workspace_id);
-- Retain the original account binding even if an Auth user is deleted.
create table public.ops_identities (
  email text primary key,
  user_id uuid not null unique,
  created_at timestamptz not null default now()
);
alter table public.ops_workspaces enable row level security;
alter table public.ops_memberships enable row level security;
alter table public.ops_identities enable row level security;
revoke all on public.ops_workspaces, public.ops_memberships, public.ops_identities from public, anon, authenticated;
grant select, insert, update, delete on public.ops_workspaces, public.ops_memberships, public.ops_identities to service_role;

create function public.ops_bind_identity(p_email text, p_user_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  insert into public.ops_identities(email,user_id) values(p_email,p_user_id) on conflict(email) do nothing;
  return exists(select 1 from public.ops_identities where email=p_email and user_id=p_user_id);
end;
$$;

create function public.ops_bootstrap(p_id text, p_email text, p_name text, p_data jsonb)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(hashtextextended(p_email,0));
  if exists(select 1 from public.ops_memberships where email=p_email) then return; end if;
  insert into public.ops_workspaces(id,owner_email,data) values(p_id,p_email,p_data);
  insert into public.ops_memberships(workspace_id,email,name,role) values(p_id,p_email,p_name,'System owner');
end;
$$;

create function public.ops_save_workspace(p_id text, p_revision integer, p_data jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.ops_workspaces set data=p_data,revision=revision+1 where id=p_id and revision=p_revision;
  return found;
end;
$$;

create function public.ops_switch_workspace(p_id text, p_revision integer, p_data jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
declare prior public.ops_workspaces;
begin
  select * into prior from public.ops_workspaces where id=p_id for update;
  if not found or prior.revision<>p_revision then return false; end if;
  if prior.data->>'mode' not in ('sample','live') or p_data->>'mode' not in ('sample','live') or prior.data->>'mode'=p_data->>'mode' then
    raise exception 'Invalid workspace switch';
  end if;
  insert into public.ops_workspaces(id,owner_email,data,revision,created_at)
    values(p_id || '::' || (prior.data->>'mode'),prior.owner_email,prior.data,prior.revision,prior.created_at)
    on conflict(id) do update set data=excluded.data,revision=excluded.revision;
  update public.ops_workspaces set data=p_data,revision=revision+1 where id=p_id;
  return true;
end;
$$;

create function public.ops_assign_access(p_id text, p_revision integer, p_data jsonb, p_member jsonb)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.ops_workspaces set data=p_data,revision=revision+1 where id=p_id and revision=p_revision;
  if not found then return false; end if;
  insert into public.ops_memberships(workspace_id,email,name,role,projects,governance,authority_ref)
    values(p_id,p_member->>'email',p_member->>'name',p_member->>'role',p_member->'projects',(p_member->>'governance')::integer,p_member->>'authority_ref')
    on conflict(email) do update set name=excluded.name,role=excluded.role,projects=excluded.projects,governance=excluded.governance,authority_ref=excluded.authority_ref
    where public.ops_memberships.workspace_id=p_id;
  if not found then raise exception 'Account belongs to another workspace'; end if;
  return true;
end;
$$;

revoke all on function public.ops_bind_identity(text,uuid), public.ops_bootstrap(text,text,text,jsonb), public.ops_save_workspace(text,integer,jsonb), public.ops_switch_workspace(text,integer,jsonb), public.ops_assign_access(text,integer,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.ops_bind_identity(text,uuid), public.ops_bootstrap(text,text,text,jsonb), public.ops_save_workspace(text,integer,jsonb), public.ops_switch_workspace(text,integer,jsonb), public.ops_assign_access(text,integer,jsonb,jsonb) to service_role;

-- Verify revocation as well as the JWT on every app request. The server can
-- inspect only session identifiers, ownership and the explicit expiry limit.
grant select(id,user_id,not_after) on auth.sessions to service_role;
create function public.ops_session_active(p_session_id uuid,p_user_id uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from auth.sessions where id=p_session_id and user_id=p_user_id and (not_after is null or not_after>now()));
$$;
revoke all on function public.ops_session_active(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ops_session_active(uuid,uuid) to service_role;

-- Standard uploads are 10 MB; generated report packages can be up to 30 MB.
insert into storage.buckets(id,name,public,file_size_limit)
values('operations-evidence','operations-evidence',false,31457280);
-- No anon/authenticated object policies: downloads use the app's scoped endpoint.
