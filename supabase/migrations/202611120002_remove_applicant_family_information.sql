-- Stop collecting and exposing legacy family and birth-place information.
-- Columns are intentionally retained to preserve historical records.
create or replace function public.submit_job_application(p_id uuid, p_fingerprint text, p_metadata jsonb, p_ssn jsonb, p_documents jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare receipt text; saved_fingerprint text; doc jsonb;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_id::text, 0));
  select a.reference_code, s.submission_fingerprint into receipt, saved_fingerprint
  from public.job_applications a join private.application_secrets s on a.id = s.application_id where a.id = p_id;
  if receipt is not null then
    if saved_fingerprint <> p_fingerprint then raise exception 'Submission conflict'; end if;
    return jsonb_build_object('reference', receipt, 'created', false);
  end if;
  if p_metadata->>'consent' is distinct from 'true' then raise exception 'Consent required'; end if;
  if jsonb_typeof(p_documents) <> 'array' or jsonb_array_length(p_documents) not between 2 and 4 then raise exception 'Invalid documents'; end if;
  if not (p_documents @> '[{"kind":"idFront"}]' and p_documents @> '[{"kind":"idBack"}]') then raise exception 'Required documents missing'; end if;
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

revoke all on function public.submit_job_application(uuid,text,jsonb,jsonb,jsonb), public.admin_get_application(uuid,uuid) from public, anon, authenticated;
grant execute on function public.submit_job_application(uuid,text,jsonb,jsonb,jsonb), public.admin_get_application(uuid,uuid) to service_role;
notify pgrst, 'reload schema';
