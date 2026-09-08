import { readFile, writeFile } from "node:fs/promises";
const source = await readFile("supabase/migrations/202609080003_admin_portal.sql", "utf8");
const sql = [
  "-- WorkHireDesk admin portal setup. Contains no credentials or applicant data.",
  "-- Run only after SUPABASE_SETUP.sql has completed successfully.",
  "begin;",
  source.trim(),
  "notify pgrst, 'reload schema';",
  "commit;",
  "select 'WorkHireDesk admin portal database access is ready.' as setup_status;",
  "",
].join("\n");
await writeFile("ADMIN_PORTAL_SETUP.sql", sql);
process.stdout.write("Prepared ADMIN_PORTAL_SETUP.sql. No credentials included.\n");
