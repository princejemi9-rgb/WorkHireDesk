import { readFile, writeFile } from "node:fs/promises";

const source = await readFile("supabase/migrations/202609080004_admin_workflow_and_documents.sql", "utf8");
const sql = [
  "-- WorkHireDesk admin workflow update. Contains no credentials or applicant data.",
  "-- Run only after ADMIN_PORTAL_SETUP.sql has completed successfully.",
  "begin;",
  source.trim(),
  "notify pgrst, 'reload schema';",
  "commit;",
  "select 'WorkHireDesk admin workflow is ready.' as setup_status;",
  "",
].join("\n");
await writeFile("ADMIN_WORKFLOW_SETUP.sql", sql);
process.stdout.write("Prepared ADMIN_WORKFLOW_SETUP.sql. No credentials included.\n");
