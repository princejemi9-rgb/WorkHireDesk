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
