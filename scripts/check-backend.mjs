// Read-only checks. Run with --env-file=.env.local; never print credentials or records.
const projectUrl = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!projectUrl || !key) {
  process.stderr.write("Supabase configuration is missing.\n");
  process.exit(1);
}
const headers = { apikey: key, ...(key.startsWith("sb_secret_") ? {} : { Authorization: `Bearer ${key}` }) };
const checks = {};
let networkFailure = false;
async function check(path) {
  try {
    const response = await fetch(new URL(path, projectUrl), { headers, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    const data = await response.json().catch(() => null);
    return { status: response.status, data };
  } catch {
    networkFailure = true;
    return { status: "network_error", data: null };
  }
}
const [table, bucket, schema] = await Promise.all([
  check("/rest/v1/job_applications?select=id&limit=0"),
  check("/storage/v1/bucket/application-documents"),
  check("/rest/v1/"),
]);
checks.projectApi = schema.status === 200 ? "ready" : `unavailable (${schema.status})`;
checks.applicationTable = table.status === 200 ? "ready" : `unavailable (${table.status})`;
checks.privateBucket = bucket.status === 200 && bucket.data?.public === false ? "ready" : bucket.status === 200 ? "unsafe: bucket is public" : `unavailable (${bucket.status})`;
checks.bucketSizeLimit = bucket.data?.file_size_limit === 1048576 ? "ready" : "not verified";
const expectedTypes = ["application/pdf", "image/jpeg", "image/png", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
checks.bucketFileTypes = Array.isArray(bucket.data?.allowed_mime_types) && bucket.data.allowed_mime_types.length === expectedTypes.length && expectedTypes.every(type => bucket.data.allowed_mime_types.includes(type)) ? "ready" : "not verified";
checks.admin_search_applications = schema.data?.paths?.["/rpc/admin_search_applications"] ? "ready" : "not found or inaccessible";
for (const name of ["submit_job_application", "lookup_application_receipt", "consume_application_rate_limit", "list_orphaned_application_documents", "admin_is_staff", "admin_list_applications", "admin_get_application", "admin_update_application_status", "admin_record_login", "admin_get_document_for_download", "admin_search_applications"]) {
  checks[name] = schema.status === 200 && schema.data?.paths?.[`/rpc/${name}`] ? "ready" : "not found or inaccessible";
}
process.stdout.write(JSON.stringify({ checks, note: "No applicant records read or written. Credentials are not displayed." }, null, 2) + "\n");
if (networkFailure) process.exitCode = 2;
else if (Object.values(checks).some(value => value !== "ready")) process.exitCode = 1;
