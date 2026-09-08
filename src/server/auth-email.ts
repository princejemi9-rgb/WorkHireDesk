import "server-only";
import { getServerConfig } from "./config";

export async function sendAuthEmail(email: string, kind: "recovery" | "verification") {
  const config = getServerConfig();
  const url = new URL(kind === "recovery" ? "/auth/v1/recover" : "/auth/v1/resend", config.SUPABASE_URL);
  // Supabase expects redirect_to in the query, not the JSON request body.
  url.searchParams.set("redirect_to", new URL(kind === "recovery" ? "/admin/reset-password" : "/admin/verify-email", config.APP_ORIGIN).href);
  const response = await fetch(url, {
    method: "POST", headers: { apikey: config.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(kind === "recovery" ? { email } : { email, type: "signup" }),
    signal: AbortSignal.timeout(15_000), cache: "no-store",
  });
  if (response.status === 429 || response.status >= 500 || response.status === 401 || response.status === 403) throw new Error("Email service unavailable.");
  // Account-dependent errors deliberately produce the same public response.
}
