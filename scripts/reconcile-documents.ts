import { DOCUMENT_BUCKET, getServiceClient } from "../src/server/supabase";

// Dry-run by default. No filenames, object keys or applicant data are logged.
async function main() {
  const supabase = getServiceClient();
  const { data, error } = await supabase.rpc("list_orphaned_application_documents");
  if (error || !Array.isArray(data)) throw new Error("Reconciliation unavailable.");
  const paths = data.map((item: { object_key: string }) => item.object_key);
  if (process.argv.includes("--delete") && paths.length) {
    const { error: removalError } = await supabase.storage.from(DOCUMENT_BUCKET).remove(paths);
    if (removalError) throw new Error("Reconciliation incomplete.");
    process.stdout.write(`Removed ${paths.length} unreferenced objects older than 24 hours.\n`);
  } else process.stdout.write(`Found ${paths.length} unreferenced objects older than 24 hours (dry run).\n`);
}
main().catch(() => { process.stderr.write("Document reconciliation failed. Check service configuration and connectivity.\n"); process.exitCode = 1; });
