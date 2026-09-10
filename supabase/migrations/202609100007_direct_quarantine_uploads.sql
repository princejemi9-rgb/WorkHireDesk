-- Direct browser uploads use short-lived server-issued signed URLs. Files remain private and pending.
alter table private.application_documents drop constraint if exists application_documents_size_bytes_check;
alter table private.application_documents add constraint application_documents_size_bytes_check check (size_bytes > 0 and size_bytes <= 10485760);
update storage.buckets set public = false, file_size_limit = 10485760 where id = 'application-documents';
notify pgrst, 'reload schema';
