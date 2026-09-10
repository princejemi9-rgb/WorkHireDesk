-- This release makes documents available after server-side type and byte validation.
-- The bucket stays private; staff access still goes through the audited download RPC.
drop function if exists public.claim_document_scan();
drop function if exists public.complete_document_scan(uuid, uuid, text);
drop table if exists private.document_scan_events;

alter table private.application_documents drop constraint if exists application_documents_scan_status_check;
update private.application_documents
set scan_status = 'validated', scan_token = null, scan_started_at = null, scanned_at = coalesce(scanned_at, now())
where scan_status in ('pending', 'scanning', 'clean');
alter table private.application_documents
  alter column scan_status set default 'validated',
  add constraint application_documents_scan_status_check check (scan_status in ('validated', 'rejected', 'failed'));
alter table private.application_documents
  drop column if exists scan_token,
  drop column if exists scan_started_at,
  drop column if exists scanned_at;

create or replace function public.admin_get_document_for_download(p_user_id uuid, p_application_id uuid, p_kind text) returns text
language plpgsql security definer set search_path = '' as $$
declare result text;
begin
  perform private.require_active_staff(p_user_id);
  select d.object_key into result
  from private.application_documents d
  where d.application_id = p_application_id and d.kind = p_kind and d.scan_status = 'validated';
  if result is null then raise exception 'Document unavailable'; end if;
  insert into private.admin_audit_events (staff_user_id, application_id, action, metadata)
  values (p_user_id, p_application_id, 'document_download', jsonb_build_object('kind', p_kind));
  return result;
end;
$$;

create or replace function public.admin_get_application(p_user_id uuid, p_application_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.require_active_staff(p_user_id);
  select jsonb_build_object(
    'id', a.id, 'reference_code', a.reference_code, 'first_name', a.first_name, 'last_name', a.last_name,
    'email', a.email, 'phone', a.phone, 'date_of_birth', a.date_of_birth, 'address', a.address,
    'position_desired', a.position_desired, 'previous_employer', a.previous_employer, 'status', a.status,
    'created_at', a.created_at, 'consent_timestamp', a.consent_timestamp,
    'document_count', (select count(*) from private.application_documents d where d.application_id = a.id and d.scan_status = 'validated'),
    'documents', coalesce((select jsonb_agg(jsonb_build_object('kind', d.kind, 'created_at', d.created_at) order by d.created_at)
      from private.application_documents d where d.application_id = a.id and d.scan_status = 'validated'), '[]'::jsonb)
  ) into result from public.job_applications a where a.id = p_application_id;
  if result is not null then
    insert into private.admin_audit_events (staff_user_id, application_id, action) values (p_user_id, p_application_id, 'view_application');
  end if;
  return result;
end;
$$;

create or replace function public.admin_search_applications(
  p_user_id uuid, p_query text default null, p_status text default null, p_position text default null,
  p_date_from date default null, p_date_to date default null, p_page integer default 0
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  perform private.require_active_staff(p_user_id);
  if p_page is null or p_page < 0 or p_page > 100000 then raise exception 'Invalid page'; end if;
  if p_date_from > p_date_to then raise exception 'Invalid date range'; end if;
  insert into private.admin_audit_events (staff_user_id, action) values (p_user_id, 'view_list');
  with filtered as (
    select a.* from public.job_applications a
    where (p_query is null or position(lower(left(p_query, 150)) in lower(concat_ws(' ', a.first_name, a.last_name, a.email, a.reference_code))) > 0)
      and (p_status is null or a.status = p_status) and (p_position is null or a.position_desired = p_position)
      and (p_date_from is null or a.created_at >= (p_date_from::timestamp at time zone 'UTC'))
      and (p_date_to is null or a.created_at < ((p_date_to + 1)::timestamp at time zone 'UTC'))
  ), page_rows as (
    select a.id, a.reference_code, a.first_name, a.last_name, a.position_desired, a.status, a.created_at,
      (select count(*) from private.application_documents d where d.application_id = a.id and d.scan_status = 'validated') as document_count
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

revoke all on function public.admin_get_document_for_download(uuid,uuid,text), public.admin_get_application(uuid,uuid), public.admin_search_applications(uuid,text,text,text,date,date,integer) from public, anon, authenticated;
grant execute on function public.admin_get_document_for_download(uuid,uuid,text), public.admin_get_application(uuid,uuid), public.admin_search_applications(uuid,text,text,text,date,date,integer) to service_role;
notify pgrst, 'reload schema';
