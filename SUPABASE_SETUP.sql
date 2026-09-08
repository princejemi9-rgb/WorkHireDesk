-- WorkHireDesk: first-time Supabase setup. Contains no credentials or applicant data.
-- Paste this whole file into your project's Supabase SQL Editor and run as postgres.
-- Use this OR the individual migrations, not both. Existing tables are not dropped.
-- Everything commits together only after the access checks pass.
begin;

-- Source: supabase/migrations/202609070001_application_intake.sql
-- Run with the Supabase migration role. No applicant-facing grants or policies.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.job_applications (
  id uuid primary key,
  reference_code text not null unique check (reference_code ~ '^WHD-[A-F0-9]{8}$'),
  first_name text not null,
  last_name text not null,
  date_of_birth date not null,
  address text not null,
  email text not null,
  phone text not null,
  position_desired text not null,
  previous_employer text not null,
  status text not null default 'received' check (status in ('received', 'reviewing', 'closed')),
  consent_accepted boolean not null check (consent_accepted),
  consent_version text not null default '2026-09-07',
  consent_timestamp timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table private.application_secrets (
  application_id uuid primary key references public.job_applications(id) on delete cascade,
  ssn_envelope jsonb not null check (
    ssn_envelope->>'algorithm' = 'aes-256-gcm'
    and ssn_envelope ?& array['key_id', 'nonce', 'ciphertext', 'tag']
  ),
  submission_fingerprint text not null check (submission_fingerprint ~ '^[a-f0-9]{64}$')
);

create table private.application_documents (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.job_applications(id) on delete cascade,
  kind text not null check (kind in ('idFront', 'idBack', 'resume', 'taxDocument')),
  object_key text not null unique,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0 and size_bytes <= 1048576),
  scan_status text not null default 'pending' check (scan_status in ('pending', 'clean', 'rejected')),
  created_at timestamptz not null default now(),
  unique (application_id, kind)
);

create table private.application_rate_limits (
  key_hash text primary key,
  window_start timestamptz not null,
  attempts integer not null
);

alter table public.job_applications enable row level security;
alter table private.application_secrets enable row level security;
alter table private.application_documents enable row level security;
alter table private.application_rate_limits enable row level security;
revoke all on public.job_applications from public, anon, authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
grant select, insert, update, delete on public.job_applications to service_role;
-- No RLS policies grant applicants access; service operations remain server-only.

create function private.touch_application_timestamp() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end;
$$;
create trigger touch_application_timestamp before update on public.job_applications
for each row execute function private.touch_application_timestamp();

create function public.consume_application_rate_limit(p_key text) returns boolean
language plpgsql security definer set search_path = '' as $$
declare local_count integer; global_count integer;
begin
  if p_key !~ '^[a-f0-9]{64}$' then return false; end if;
  delete from private.application_rate_limits where window_start < now() - interval '1 day';
  -- A global ceiling limits distributed abuse and growth of the per-address table.
  insert into private.application_rate_limits as limits (key_hash, window_start, attempts)
  values ('global', now(), 1)
  on conflict (key_hash) do update set
    attempts = case when limits.window_start < now() - interval '15 minutes' then 1 else limits.attempts + 1 end,
    window_start = case when limits.window_start < now() - interval '15 minutes' then now() else limits.window_start end
  returning attempts into global_count;
  if global_count > 200 then return false; end if;
  insert into private.application_rate_limits as limits (key_hash, window_start, attempts)
  values (p_key, now(), 1)
  on conflict (key_hash) do update set
    attempts = case when limits.window_start < now() - interval '15 minutes' then 1 else limits.attempts + 1 end,
    window_start = case when limits.window_start < now() - interval '15 minutes' then now() else limits.window_start end
  returning attempts into local_count;
  return local_count <= 5;
end;
$$;

create function public.lookup_application_receipt(p_id uuid, p_fingerprint text) returns text
language plpgsql security definer set search_path = '' as $$
declare result text;
begin
  select a.reference_code into result from public.job_applications a
  join private.application_secrets s on s.application_id = a.id
  where a.id = p_id and s.submission_fingerprint = p_fingerprint;
  return result;
end;
$$;

create function public.submit_job_application(p_id uuid, p_fingerprint text, p_metadata jsonb, p_ssn jsonb, p_documents jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare receipt text; saved_fingerprint text; doc jsonb;
begin
  -- Serializes concurrent retries of the same randomly generated submission ID.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text, 0));
  select a.reference_code, s.submission_fingerprint into receipt, saved_fingerprint
  from public.job_applications a join private.application_secrets s on a.id = s.application_id where a.id = p_id;
  if receipt is not null then
    if saved_fingerprint <> p_fingerprint then raise exception 'Submission conflict'; end if;
    return jsonb_build_object('reference', receipt, 'created', false);
  end if;
  if p_metadata->>'consent' is distinct from 'true' then raise exception 'Consent required'; end if;
  if jsonb_typeof(p_documents) <> 'array' or jsonb_array_length(p_documents) not between 3 and 4 then raise exception 'Invalid documents'; end if;
  if not (p_documents @> '[{"kind":"idFront"}]' and p_documents @> '[{"kind":"idBack"}]' and p_documents @> '[{"kind":"resume"}]') then raise exception 'Required documents missing'; end if;
  loop
    receipt := 'WHD-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8));
    begin
      insert into public.job_applications (
        id, reference_code, first_name, last_name, date_of_birth, address, email, phone,
        position_desired, previous_employer, consent_accepted
      ) values (
        p_id, receipt, p_metadata->>'firstName', p_metadata->>'lastName', (p_metadata->>'dateOfBirth')::date,
        p_metadata->>'address', p_metadata->>'email', p_metadata->>'phone',
        p_metadata->>'positionDesired', p_metadata->>'previousEmployer', true
      );
      exit;
    exception when unique_violation then
      -- Retry the rare reference collision. The ID is serialized above.
      if exists (select 1 from public.job_applications where id = p_id) then raise; end if;
    end;
  end loop;
  insert into private.application_secrets (application_id, ssn_envelope, submission_fingerprint) values (p_id, p_ssn, p_fingerprint);
  for doc in select value from jsonb_array_elements(p_documents) loop
    if doc->>'object_key' !~ ('^' || p_id::text || '/[a-f0-9-]{36}$') then raise exception 'Invalid object key'; end if;
    insert into private.application_documents (application_id, kind, object_key, mime_type, size_bytes)
    values (p_id, doc->>'kind', doc->>'object_key', doc->>'mime_type', (doc->>'size_bytes')::integer);
  end loop;
  return jsonb_build_object('reference', receipt, 'created', true);
end;
$$;

revoke all on function private.touch_application_timestamp() from public, anon, authenticated;
revoke all on function public.consume_application_rate_limit(text) from public, anon, authenticated;
revoke all on function public.lookup_application_receipt(uuid, text) from public, anon, authenticated;
revoke all on function public.submit_job_application(uuid, text, jsonb, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.consume_application_rate_limit(text) to service_role;
grant execute on function public.lookup_application_receipt(uuid, text) to service_role;
grant execute on function public.submit_job_application(uuid, text, jsonb, jsonb, jsonb) to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('application-documents', 'application-documents', false, 1048576,
  array['application/pdf', 'image/jpeg', 'image/png', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Restrictive policy also protects this bucket if another project's broad permissive policies exist.
create policy "Deny applicant document access" on storage.objects as restrictive
for all to anon, authenticated
using (bucket_id <> 'application-documents')
with check (bucket_id <> 'application-documents');

-- Source: supabase/migrations/202609070002_document_reconciliation.sql
-- Inventory only: delete orphaned objects through the Storage API, never SQL.
create function public.list_orphaned_application_documents() returns table(object_key text)
language sql security definer set search_path = '' as $$
  select o.name from storage.objects o
  where o.bucket_id = 'application-documents'
    and o.created_at < now() - interval '24 hours'
    and not exists (select 1 from private.application_documents d where d.object_key = o.name)
  order by o.created_at asc
  limit 100;
$$;
revoke all on function public.list_orphaned_application_documents() from public, anon, authenticated;
grant execute on function public.list_orphaned_application_documents() to service_role;

-- Source: supabase/migrations/202609080003_admin_portal.sql
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

-- Source: supabase/migrations/202609080004_admin_workflow_and_documents.sql
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

-- Verify access restrictions before committing.
do $$
begin
  assert not has_table_privilege('anon', 'public.job_applications', 'SELECT'), 'anon table access';
  assert not has_table_privilege('authenticated', 'public.job_applications', 'SELECT'), 'authenticated table access';
  assert not has_schema_privilege('anon', 'private', 'USAGE'), 'private schema access';
  assert not has_function_privilege('anon', 'public.submit_job_application(uuid,text,jsonb,jsonb,jsonb)', 'EXECUTE'), 'anon RPC access';
  assert not has_function_privilege('authenticated', 'public.lookup_application_receipt(uuid,text)', 'EXECUTE'), 'authenticated receipt access';
  assert (select public = false from storage.buckets where id = 'application-documents'), 'bucket must be private';
  assert (select relrowsecurity from pg_class where oid = 'public.job_applications'::regclass), 'RLS required';
end;
$$;
notify pgrst, 'reload schema';
commit;
select 'WorkHireDesk database and private storage are ready.' as setup_status;
