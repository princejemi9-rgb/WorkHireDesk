-- WorkHireDesk admin workflow update. Contains no credentials or applicant data.
-- Run only after ADMIN_PORTAL_SETUP.sql has completed successfully.
begin;
-- Complete the staff workflow and permit tightly scoped downloads of clean documents.
-- A separate scanning service must be the only actor that changes scan_status to clean.

alter table public.job_applications drop constraint if exists job_applications_status_check;
-- Closed did not encode a hiring decision; return legacy records for review.
update public.job_applications set status = 'reviewing' where status = 'closed';
alter table public.job_applications add constraint job_applications_status_check
  check (status in ('received', 'reviewing', 'shortlisted', 'rejected'));

alter table private.admin_audit_events drop constraint if exists admin_audit_events_action_check;
alter table private.admin_audit_events add constraint admin_audit_events_action_check
  check (action in ('view_list', 'view_application', 'update_status', 'login', 'document_download'));

drop function if exists public.admin_list_applications(uuid);
create function public.admin_list_applications(
  p_user_id uuid,
  p_query text default null,
  p_status text default null,
  p_position text default null,
  p_date_from date default null,
  p_date_to date default null
) returns table (
  id uuid, reference_code text, first_name text, last_name text, email text,
  position_desired text, status text, created_at timestamptz,
  document_count bigint, pending_documents bigint
) language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_active_staff(p_user_id);
  if p_status is not null and p_status not in ('received', 'reviewing', 'shortlisted', 'rejected') then
    raise exception 'Invalid status';
  end if;
  insert into private.admin_audit_events (staff_user_id, action, metadata)
  values (p_user_id, 'view_list', jsonb_strip_nulls(jsonb_build_object('status', p_status, 'position', p_position, 'date_from', p_date_from, 'date_to', p_date_to)));
  return query
    select a.id, a.reference_code, a.first_name, a.last_name, a.email, a.position_desired, a.status, a.created_at,
      count(d.id), count(d.id) filter (where d.scan_status = 'pending')
    from public.job_applications a
    left join private.application_documents d on d.application_id = a.id
    where (p_query is null or concat_ws(' ', a.first_name, a.last_name, a.email, a.reference_code, a.position_desired) ilike '%' || left(p_query, 150) || '%')
      and (p_status is null or a.status = p_status)
      and (p_position is null or a.position_desired = left(p_position, 150))
      and (p_date_from is null or a.created_at >= p_date_from)
      and (p_date_to is null or a.created_at < p_date_to + interval '1 day')
    group by a.id
    order by a.created_at desc;
end;
$$;

create function public.admin_record_login(p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_active_staff(p_user_id);
  insert into private.admin_audit_events (staff_user_id, action) values (p_user_id, 'login');
end;
$$;

create function public.admin_get_document_for_download(p_user_id uuid, p_application_id uuid, p_kind text) returns text
language plpgsql security definer set search_path = '' as $$
declare result text;
begin
  perform private.require_active_staff(p_user_id);
  select d.object_key into result
  from private.application_documents d
  where d.application_id = p_application_id and d.kind = p_kind and d.scan_status = 'clean';
  if result is null then raise exception 'Document unavailable'; end if;
  insert into private.admin_audit_events (staff_user_id, application_id, action, metadata)
  values (p_user_id, p_application_id, 'document_download', jsonb_build_object('kind', p_kind));
  return result;
end;
$$;

create or replace function public.admin_update_application_status(p_user_id uuid, p_application_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_active_staff(p_user_id);
  if p_status not in ('received', 'reviewing', 'shortlisted', 'rejected') then raise exception 'Invalid status'; end if;
  update public.job_applications set status = p_status where id = p_application_id;
  if not found then raise exception 'Application not found'; end if;
  insert into private.admin_audit_events (staff_user_id, application_id, action, metadata)
  values (p_user_id, p_application_id, 'update_status', jsonb_build_object('status', p_status));
end;
$$;

revoke all on function public.admin_list_applications(uuid, text, text, text, date, date) from public, anon, authenticated;
revoke all on function public.admin_record_login(uuid) from public, anon, authenticated;
revoke all on function public.admin_get_document_for_download(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.admin_update_application_status(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.admin_list_applications(uuid, text, text, text, date, date) to service_role;
grant execute on function public.admin_record_login(uuid) to service_role;
grant execute on function public.admin_get_document_for_download(uuid, uuid, text) to service_role;
grant execute on function public.admin_update_application_status(uuid, uuid, text) to service_role;

create function public.admin_search_applications(p_user_id uuid, p_query text default null, p_status text default null, p_position text default null, p_date_from date default null, p_date_to date default null, p_page integer default 0) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.require_active_staff(p_user_id);
  if p_page is null or p_page < 0 or p_page > 100000 then raise exception 'Invalid page'; end if;
  if p_date_from > p_date_to then raise exception 'Invalid date range'; end if;
  -- Never record search text, which can contain names or email addresses.
  insert into private.admin_audit_events (staff_user_id, action) values (p_user_id, 'view_list');
  with filtered as (
    select a.* from public.job_applications a
    where (p_query is null or position(lower(left(p_query, 150)) in lower(concat_ws(' ', a.first_name, a.last_name, a.email, a.reference_code))) > 0)
      and (p_status is null or a.status = p_status)
      and (p_position is null or a.position_desired = p_position)
      and (p_date_from is null or a.created_at >= (p_date_from::timestamp at time zone 'UTC'))
      and (p_date_to is null or a.created_at < ((p_date_to + 1)::timestamp at time zone 'UTC'))
  ), page_rows as (
    select a.id, a.reference_code, a.first_name, a.last_name, a.position_desired, a.status, a.created_at,
      (select count(*) from private.application_documents d where d.application_id = a.id) as document_count,
      (select count(*) from private.application_documents d where d.application_id = a.id and d.scan_status = 'pending') as pending_documents
    from filtered a order by a.created_at desc, a.id desc limit 25 offset p_page * 25
  ) select jsonb_build_object(
    'applications', coalesce((select jsonb_agg(to_jsonb(p) order by p.created_at desc, p.id desc) from page_rows p), '[]'::jsonb),
    'total', (select count(*) from filtered),
    'counts', (select jsonb_build_object('total', count(*), 'received', count(*) filter (where status = 'received'), 'reviewing', count(*) filter (where status = 'reviewing'), 'shortlisted', count(*) filter (where status = 'shortlisted'), 'rejected', count(*) filter (where status = 'rejected')) from public.job_applications),
    'positions', coalesce((select jsonb_agg(position_desired order by position_desired) from (select distinct position_desired from public.job_applications) positions), '[]'::jsonb)
  ) into result;
  return result;
end;
$$;
revoke all on function public.admin_search_applications(uuid,text,text,text,date,date,integer) from public, anon, authenticated;
grant execute on function public.admin_search_applications(uuid,text,text,text,date,date,integer) to service_role;
notify pgrst, 'reload schema';
commit;
select 'WorkHireDesk admin workflow is ready.' as setup_status;
