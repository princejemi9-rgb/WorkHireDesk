import { readFile, writeFile } from "node:fs/promises";

const source = await readFile("supabase/migrations/202609080005_admin_provisioning.sql", "utf8");
const sql = [
  "-- WorkHireDesk admin provisioning update. Contains no credentials or user IDs.",
  "-- Run only after ADMIN_PORTAL_SETUP.sql and ADMIN_WORKFLOW_SETUP.sql have completed successfully.",
  "-- Run in Supabase SQL Editor as postgres.",
  "begin;",
  source.trim(),
  "notify pgrst, 'reload schema';",
  "commit;",
  "select 'WorkHireDesk admin provisioning is ready.' as setup_status;",
  "",
].join("\n");
await writeFile("ADMIN_PROVISIONING_SETUP.sql", sql);
process.stdout.write("Prepared ADMIN_PROVISIONING_SETUP.sql. No credentials or user IDs included.\n");
