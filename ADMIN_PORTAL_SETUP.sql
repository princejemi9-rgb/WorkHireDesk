-- WorkHireDesk admin portal setup. Contains no credentials or applicant data.
-- Run only after SUPABASE_SETUP.sql has completed successfully.
begin;
-- Staff accounts are explicit allowlist entries linked to Supabase Auth users.
create table private.admin_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table private.admin_audit_events (
  id uuid primary key default gen_random_uuid(),
  staff_user_id uuid not null references auth.users(id),
  application_id uuid references public.job_applications(id) on delete set null,
  action text not null check (action in ('view_list', 'view_application', 'update_status', 'login')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table private.admin_staff enable row level security;
alter table private.admin_audit_events enable row level security;
revoke all on private.admin_staff, private.admin_audit_events from public, anon, authenticated;

create function private.require_active_staff(p_user_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from private.admin_staff where user_id = p_user_id and active) then raise exception 'Not authorized'; end if;
end; $$;

create function public.admin_is_staff(p_user_id uuid) returns boolean language plpgsql security definer set search_path = '' as $$
begin return exists (select 1 from private.admin_staff where user_id = p_user_id and active); end; $$;

create function public.admin_list_applications(p_user_id uuid) returns table (
  id uuid, reference_code text, first_name text, last_name text, email text, position_desired text, status text, created_at timestamptz, document_count bigint, pending_documents bigint
) language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_active_staff(p_user_id);
  insert into private.admin_audit_events (staff_user_id, action) values (p_user_id, 'view_list');
  return query select a.id, a.reference_code, a.first_name, a.last_name, a.email, a.position_desired, a.status, a.created_at,
    count(d.id), count(d.id) filter (where d.scan_status = 'pending')
    from public.job_applications a left join private.application_documents d on d.application_id = a.id
    group by a.id order by a.created_at desc;
end; $$;

create function public.admin_get_application(p_user_id uuid, p_application_id uuid) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.require_active_staff(p_user_id);
  select jsonb_build_object('id', a.id, 'reference_code', a.reference_code, 'first_name', a.first_name, 'last_name', a.last_name, 'email', a.email, 'phone', a.phone, 'date_of_birth', a.date_of_birth, 'address', a.address, 'position_desired', a.position_desired, 'previous_employer', a.previous_employer, 'status', a.status, 'created_at', a.created_at, 'consent_timestamp', a.consent_timestamp, 'document_count', (select count(*) from private.application_documents d where d.application_id = a.id), 'pending_documents', (select count(*) from private.application_documents d where d.application_id = a.id and d.scan_status = 'pending'), 'documents', coalesce((select jsonb_agg(jsonb_build_object('kind', d.kind, 'scan_status', d.scan_status, 'created_at', d.created_at) order by d.created_at) from private.application_documents d where d.application_id = a.id), '[]'::jsonb)) into result from public.job_applications a where a.id = p_application_id;
  if result is not null then insert into private.admin_audit_events (staff_user_id, application_id, action) values (p_user_id, p_application_id, 'view_application'); end if;
  return result;
end; $$;

create function public.admin_update_application_status(p_user_id uuid, p_application_id uuid, p_status text) returns void language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_active_staff(p_user_id);
  if p_status not in ('received', 'reviewing', 'closed') then raise exception 'Invalid status'; end if;
  update public.job_applications set status = p_status where id = p_application_id;
  if not found then raise exception 'Application not found'; end if;
  insert into private.admin_audit_events (staff_user_id, application_id, action, metadata) values (p_user_id, p_application_id, 'update_status', jsonb_build_object('status', p_status));
end; $$;

revoke all on function private.require_active_staff(uuid) from public, anon, authenticated;
revoke all on function public.admin_is_staff(uuid) from public, anon, authenticated;
revoke all on function public.admin_list_applications(uuid) from public, anon, authenticated;
revoke all on function public.admin_get_application(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_update_application_status(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_is_staff(uuid) to service_role;
grant execute on function public.admin_list_applications(uuid) to service_role;
grant execute on function public.admin_get_application(uuid, uuid) to service_role;
grant execute on function public.admin_update_application_status(uuid, uuid, text) to service_role;
notify pgrst, 'reload schema';
commit;
select 'WorkHireDesk admin portal database access is ready.' as setup_status;
