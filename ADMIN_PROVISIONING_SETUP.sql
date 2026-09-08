-- WorkHireDesk admin provisioning update. Contains no credentials or user IDs.
-- Run only after ADMIN_PORTAL_SETUP.sql and ADMIN_WORKFLOW_SETUP.sql have completed successfully.
-- Run in Supabase SQL Editor as postgres.
begin;
-- Keep staff provisioning behind a narrow, auditable server-only boundary.
-- This does not grant direct access to the private schema or its tables.

alter table private.admin_audit_events drop constraint if exists admin_audit_events_action_check;
alter table private.admin_audit_events add constraint admin_audit_events_action_check
  check (action in (
    'view_list', 'view_application', 'update_status', 'login', 'document_download',
    'provision_admin', 'revoke_admin'
  ));

create function public.admin_provision_staff(
  p_actor_user_id uuid,
  p_target_user_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_active_staff(p_actor_user_id);

  if p_target_user_id is null then
    raise exception 'Target user is required';
  end if;

  if not exists (
    select 1
    from auth.users as u
    where u.id = p_target_user_id
      and u.email_confirmed_at is not null
  ) then
    raise exception 'Target user must have a confirmed email';
  end if;

  insert into private.admin_staff (user_id, active)
  values (p_target_user_id, true)
  on conflict (user_id) do update set active = true;

  insert into private.admin_audit_events (staff_user_id, action, metadata)
  values (
    p_actor_user_id,
    'provision_admin',
    jsonb_build_object('target_user_id', p_target_user_id)
  );
end;
$$;

create function public.admin_revoke_staff(
  p_actor_user_id uuid,
  p_target_user_id uuid
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_active_staff(p_actor_user_id);

  if p_target_user_id is null then
    raise exception 'Target user is required';
  end if;
  if p_actor_user_id = p_target_user_id then
    raise exception 'Staff cannot revoke their own access';
  end if;
  if not exists (
    select 1 from private.admin_staff
    where user_id = p_target_user_id and active
  ) then
    raise exception 'Target user is not an active staff member';
  end if;
  if (select count(*) from private.admin_staff where active) <= 1 then
    raise exception 'Cannot revoke the last active staff member';
  end if;

  update private.admin_staff set active = false where user_id = p_target_user_id;
  insert into private.admin_audit_events (staff_user_id, action, metadata)
  values (
    p_actor_user_id,
    'revoke_admin',
    jsonb_build_object('target_user_id', p_target_user_id)
  );
end;
$$;

revoke all on function public.admin_provision_staff(uuid, uuid) from public, anon, authenticated;
revoke all on function public.admin_revoke_staff(uuid, uuid) from public, anon, authenticated;
grant execute on function public.admin_provision_staff(uuid, uuid) to service_role;
grant execute on function public.admin_revoke_staff(uuid, uuid) to service_role;
notify pgrst, 'reload schema';
commit;
select 'WorkHireDesk admin provisioning is ready.' as setup_status;
