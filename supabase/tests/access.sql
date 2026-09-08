-- Run against a disposable Supabase project after the migration. Rolls back test data.
begin;
do $$
begin
  assert not has_table_privilege('anon', 'public.job_applications', 'SELECT'), 'anon table access';
  assert not has_table_privilege('authenticated', 'public.job_applications', 'SELECT'), 'authenticated table access';
  assert not has_schema_privilege('anon', 'private', 'USAGE'), 'private schema access';
  assert not has_function_privilege('anon', 'public.submit_job_application(uuid,text,jsonb,jsonb,jsonb)', 'EXECUTE'), 'anon RPC access';
  assert not has_function_privilege('authenticated', 'public.lookup_application_receipt(uuid,text)', 'EXECUTE'), 'authenticated receipt access';
  assert not has_function_privilege('anon', 'public.admin_provision_staff(uuid,uuid)', 'EXECUTE'), 'anon staff provisioning access';
  assert not has_function_privilege('authenticated', 'public.admin_revoke_staff(uuid,uuid)', 'EXECUTE'), 'authenticated staff revocation access';
  assert (select public = false from storage.buckets where id = 'application-documents'), 'bucket must be private';
  assert (select relrowsecurity from pg_class where oid = 'public.job_applications'::regclass), 'RLS required';
end;
$$;
rollback;
