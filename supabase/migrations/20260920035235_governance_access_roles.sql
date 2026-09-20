-- App roles stay server-controlled. Existing RLS and service-role-only grants remain.
alter table public.ops_memberships drop constraint ops_memberships_role_check;
alter table public.ops_memberships add constraint ops_memberships_role_check
  check (role in ('System owner','Compliance secretary','Treasurer','Project lead',
    'Project participant','Project sponsor','Continuity deputy','Approver','Auditor',
    'Observer','ExCo member','General member','Authorized staff','Disabled'));
