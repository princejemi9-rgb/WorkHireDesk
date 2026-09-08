import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

const file = ".env.local";
const values = {
  SSN_ENCRYPTION_KEY_BASE64: randomBytes(32).toString("base64"),
  SSN_ENCRYPTION_KEY_ID: `ssn-${new Date().toISOString().slice(0, 10).replaceAll("-", "")}`,
  RATE_LIMIT_HMAC_KEY: randomBytes(32).toString("hex"),
  SUBMISSION_HMAC_KEY: randomBytes(32).toString("hex"),
  ADMIN_SESSION_KEY_BASE64: randomBytes(32).toString("base64"),
};

const source = await readFile(file, "utf8");
const found = new Set();
const next = source.split(/\r?\n/).map(line => {
  const match = /^([A-Z0-9_]+)=/.exec(line);
  if (!match || !(match[1] in values)) return line;
  found.add(match[1]);
  return `${match[1]}=${values[match[1]]}`;
}).join("\n");
if (found.size !== Object.keys(values).length) throw new Error(".env.local is missing a required application secret.");
await writeFile(file, next.endsWith("\n") ? next : `${next}\n`, { mode: 0o600 });
process.stdout.write("Rotated SSN, submission, rate-limit, and admin-session secrets in .env.local. Values were not printed.\n");
