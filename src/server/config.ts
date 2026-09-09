import "server-only";
import { z } from "zod";

const supabaseConfigSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(30),
});
const configSchema = supabaseConfigSchema.extend({
  APP_ORIGIN: z.url(),
  SSN_ENCRYPTION_KEY_BASE64: z.string().regex(/^[A-Za-z0-9+/]{43}=$/),
  SSN_ENCRYPTION_KEY_ID: z.string().regex(/^[a-zA-Z0-9_-]{1,40}$/),
  RATE_LIMIT_HMAC_KEY: z.string().min(32),
  SUBMISSION_HMAC_KEY: z.string().min(32),
});
const adminConfigSchema = configSchema.extend({ ADMIN_SESSION_KEY_BASE64: z.string().regex(/^[A-Za-z0-9+/]{43}=$/) });

export function getServerConfig() {
  const result = configSchema.safeParse(process.env);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map(issue => issue.path.join(".")))].join(", ");
    throw new Error(`Application service is not configured: ${fields || "unknown field"}.`);
  }
  const config = result.data;
  if (Buffer.from(config.SSN_ENCRYPTION_KEY_BASE64, "base64").length !== 32) throw new Error("Application service is not configured.");
  if (process.env.NODE_ENV === "production" && (!config.APP_ORIGIN.startsWith("https://") || !config.SUPABASE_URL.startsWith("https://"))) throw new Error("Application service is not configured.");
  return config;
}

export function getAdminConfig() {
  const result = adminConfigSchema.safeParse(process.env);
  if (!result.success || Buffer.from(result.data.ADMIN_SESSION_KEY_BASE64, "base64").length !== 32) throw new Error("Admin portal is not configured.");
  return result.data;
}

export function getSupabaseConfig() {
  const result = supabaseConfigSchema.safeParse(process.env);
  if (!result.success) throw new Error("Application service is not configured.");
  if (process.env.NODE_ENV === "production" && !result.data.SUPABASE_URL.startsWith("https://")) throw new Error("Application service is not configured.");
  return result.data;
}
