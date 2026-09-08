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
