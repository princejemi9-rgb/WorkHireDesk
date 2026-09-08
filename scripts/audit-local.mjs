import { readFile, readdir } from "node:fs/promises";
import { parseEnv } from "node:util";

const local = parseEnv(await readFile(".env.local", "utf8"));
const example = parseEnv(await readFile(".env.example", "utf8"));
const keys = Object.keys(example);
const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "APP_ORIGIN", "SSN_ENCRYPTION_KEY_BASE64", "SSN_ENCRYPTION_KEY_ID", "RATE_LIMIT_HMAC_KEY", "SUBMISSION_HMAC_KEY", "ADMIN_SESSION_KEY_BASE64"];
const placeholders = Object.values(example).some(value => value.includes("replace-with") || value.includes("YOUR_PROJECT"));
console.log(JSON.stringify({ templateHasRequiredKeys: required.every(key => key in example), templateContainsNoLiveValues: placeholders, localHasRequiredKeys: required.every(key => typeof local[key] === "string" && local[key].length > 0), localOriginIsHttps: local.APP_ORIGIN?.startsWith("https://"), keyType: local.SUPABASE_SERVICE_ROLE_KEY?.startsWith("sb_secret_") ? "secret" : "legacy JWT" }));
const sensitive = Object.entries(local).filter(([key, value]) => /KEY/.test(key) && value.length > 25).map(([, value]) => value);
let exposed = false;
async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${entry.name}`;
    if (entry.isDirectory()) { await scan(path); continue; }
    const data = await readFile(path, "utf8");
    if (sensitive.some(value => data.includes(value))) { exposed = true; console.error(`Secret found in ${path}`); }
  }
}
await scan("src");
try { await scan(".next/static"); } catch { console.log("Client bundle not available for inspection."); }
console.log(JSON.stringify({ sourceAndClientBundleSecretScan: exposed ? "FAILED" : "passed" }));
if (exposed) process.exitCode = 1;
