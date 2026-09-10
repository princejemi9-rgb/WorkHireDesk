-- Optional resume; existing identity requirements remain mandatory.
create or replace function public.submit_job_application(p_id uuid, p_fingerprint text, p_metadata jsonb, p_ssn jsonb, p_documents jsonb) returns jsonb
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

alter table private.admin_audit_events drop constraint admin_audit_events_action_check;
alter table private.admin_audit_events add constraint admin_audit_events_action_check check (action in ('view_list','view_application','update_status','login','document_download','provision_admin','revoke_admin','ssn_revealed'));
create table private.admin_notifications (application_id uuid primary key references public.job_applications(id) on delete cascade, created_at timestamptz not null default now());
create table private.admin_notification_reads (application_id uuid references private.admin_notifications(application_id) on delete cascade, staff_user_id uuid references auth.users(id) on delete cascade, read_at timestamptz not null default now(), primary key(application_id,staff_user_id));
alter table private.admin_notifications enable row level security;
alter table private.admin_notification_reads enable row level security;
revoke all on private.admin_notifications,private.admin_notification_reads from public,anon,authenticated;
create function private.notify_application() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into private.admin_notifications(application_id,created_at) values(new.id,new.created_at); return new; end; $$;
revoke all on function private.notify_application() from public,anon,authenticated;
create trigger application_notification after insert on public.job_applications for each row execute function private.notify_application();
create function public.admin_notifications(p_user_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_active_staff(p_user_id);
 return jsonb_build_object('unread',(select count(*) from private.admin_notifications n where not exists(select 1 from private.admin_notification_reads r where r.application_id=n.application_id and r.staff_user_id=p_user_id)), 'items',coalesce((select jsonb_agg(to_jsonb(t)) from (select n.application_id,a.reference_code,a.first_name,a.last_name,a.position_desired,n.created_at,r.read_at from private.admin_notifications n join public.job_applications a on a.id=n.application_id left join private.admin_notification_reads r on r.application_id=n.application_id and r.staff_user_id=p_user_id order by (r.read_at is null) desc,n.created_at desc limit 50) t),'[]'::jsonb));
end; $$;
create function public.admin_read_notifications(p_user_id uuid,p_application_id uuid default null) returns void language plpgsql security definer set search_path='' as $$
begin
 perform private.require_active_staff(p_user_id);
 insert into private.admin_notification_reads(application_id,staff_user_id) select application_id,p_user_id from private.admin_notifications where p_application_id is null or application_id=p_application_id on conflict do nothing;
end; $$;
create function public.admin_ssn_envelope(p_user_id uuid,p_application_id uuid,p_reveal boolean default false) returns jsonb language plpgsql security definer set search_path='' as $$
declare envelope jsonb;
begin
 perform private.require_active_staff(p_user_id);
 select ssn_envelope into envelope from private.application_secrets where application_id=p_application_id;
 if envelope is null then raise exception 'Application unavailable'; end if;
 if p_reveal then insert into private.admin_audit_events(staff_user_id,application_id,action) values(p_user_id,p_application_id,'ssn_revealed'); end if;
 return envelope;
end; $$;
create function public.admin_application_activity(p_user_id uuid,p_application_id uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 perform private.require_active_staff(p_user_id);
 return coalesce((select jsonb_agg(to_jsonb(t)) from (select staff_user_id,action,created_at from private.admin_audit_events where application_id=p_application_id order by created_at desc limit 100) t),'[]'::jsonb);
end; $$;
alter table private.application_documents drop constraint application_documents_scan_status_check;
alter table private.application_documents add constraint application_documents_scan_status_check check(scan_status in ('pending','scanning','clean','rejected','failed'));
alter table private.application_documents add column scan_token uuid, add column scan_started_at timestamptz, add column scanned_at timestamptz;
create table private.document_scan_events (id uuid primary key default gen_random_uuid(),document_id uuid references private.application_documents(id) on delete set null,status text not null,created_at timestamptz not null default now());
alter table private.document_scan_events enable row level security;
revoke all on private.document_scan_events from public,anon,authenticated;
create function public.claim_document_scan() returns jsonb language plpgsql security definer set search_path='' as $$
declare doc private.application_documents;
begin
 select * into doc from private.application_documents where scan_status='pending' or (scan_status='scanning' and scan_started_at < now()-interval '10 minutes') order by created_at for update skip locked limit 1;
 if doc.id is null then return null; end if;
 update private.application_documents set scan_status='scanning',scan_token=gen_random_uuid(),scan_started_at=now() where id=doc.id returning * into doc;
 insert into private.document_scan_events(document_id,status) values(doc.id,'scanning');
 return jsonb_build_object('id',doc.id,'object_key',doc.object_key,'token',doc.scan_token);
end; $$;
create function public.complete_document_scan(p_document_id uuid,p_token uuid,p_status text) returns void language plpgsql security definer set search_path='' as $$
begin
 if p_status is null or p_status not in ('clean','rejected','failed') then raise exception 'Invalid scan result'; end if;
 update private.application_documents set scan_status=p_status,scanned_at=now(),scan_token=null where id=p_document_id and scan_token=p_token and scan_status='scanning' and scan_started_at > now()-interval '10 minutes';
 if not found then raise exception 'Invalid or expired scan lease'; end if;
 insert into private.document_scan_events(document_id,status) values(p_document_id,p_status);
end; $$;
revoke all on function public.admin_notifications(uuid),public.admin_read_notifications(uuid,uuid),public.admin_ssn_envelope(uuid,uuid,boolean),public.admin_application_activity(uuid,uuid),public.claim_document_scan(),public.complete_document_scan(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.admin_notifications(uuid),public.admin_read_notifications(uuid,uuid),public.admin_ssn_envelope(uuid,uuid,boolean),public.admin_application_activity(uuid,uuid),public.claim_document_scan(),public.complete_document_scan(uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';
