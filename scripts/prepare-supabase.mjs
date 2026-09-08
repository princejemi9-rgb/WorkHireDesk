import { readFile, readdir, writeFile } from "node:fs/promises";

const migrationFiles = (await readdir("supabase/migrations")).sort().map(file => `supabase/migrations/${file}`);
const migrations = await Promise.all(migrationFiles.map(file => readFile(file, "utf8")));
const assertions = (await readFile("supabase/tests/access.sql", "utf8"))
  .replace(/^--.*\r?\n/, "")
  .replace(/^begin;\s*$/m, "")
  .replace(/^rollback;\s*$/m, "")
  .trim();
const sql = [
  "-- WorkHireDesk: first-time Supabase setup. Contains no credentials or applicant data.",
  "-- Paste this whole file into your project's Supabase SQL Editor and run as postgres.",
  "-- Use this OR the individual migrations, not both. Existing tables are not dropped.",
  "-- Everything commits together only after the access checks pass.",
  "begin;",
  ...migrations.map((sql, index) => `\n-- Source: ${migrationFiles[index]}\n${sql.trim()}`),
  "\n-- Verify access restrictions before committing.",
  assertions,
  "notify pgrst, 'reload schema';",
  "commit;",
  "select 'WorkHireDesk database and private storage are ready.' as setup_status;",
  "",
].join("\n");
await writeFile("SUPABASE_SETUP.sql", sql);
process.stdout.write("Prepared SUPABASE_SETUP.sql. No credentials included.\n");
