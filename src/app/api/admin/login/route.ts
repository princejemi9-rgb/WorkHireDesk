import { z } from "zod";
import { NextResponse } from "next/server";
import { setAdminSession } from "@/server/admin-session";
import { getServiceClient } from "@/server/supabase";
import { getServerConfig } from "@/server/config";

const credentials = z.object({ email: z.email().max(254), password: z.string().min(8).max(200) });
export async function POST(request: Request) {
  if (request.headers.get("origin") !== process.env.APP_ORIGIN) return NextResponse.json({ message: "Unable to sign in." }, { status: 403 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ message: "Unable to sign in." }, { status: 400 }); }
  const parsed = credentials.safeParse(body); if (!parsed.success) return NextResponse.json({ message: "Unable to sign in." }, { status: 400 });
  try {
    const config = getServerConfig(); const url = new URL("/auth/v1/token?grant_type=password", config.SUPABASE_URL);
    const response = await fetch(url, { method: "POST", headers: { apikey: config.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json" }, body: JSON.stringify(parsed.data), signal: AbortSignal.timeout(15_000), cache: "no-store" });
    const session = await response.json().catch(() => null) as { access_token?: string; expires_in?: number; user?: { id?: string; email_confirmed_at?: string | null }; code?: string; message?: string } | null;
    if (!response.ok) {
      console.error("Supabase Auth staff sign-in rejected.", { status: response.status, code: session?.code ?? "unknown" });
      const unverified = session?.code === "email_not_confirmed" || /email not confirmed/i.test(session?.message ?? "");
      return NextResponse.json({ message: "Unable to sign in.", reason: unverified ? "verify_email" : (session?.code ?? "auth_rejected") }, { status: unverified ? 403 : 401 });
    }
    if (!session?.access_token || !session.user?.id || typeof session.expires_in !== "number") return NextResponse.json({ message: "Unable to sign in." }, { status: 401 });
    if (!session.user.email_confirmed_at) return NextResponse.json({ message: "Verify your email before signing in.", reason: "verify_email" }, { status: 403 });
    const supabase = getServiceClient(); const { data: isStaff, error } = await supabase.rpc("admin_is_staff", { p_user_id: session.user.id });
    if (error || isStaff !== true) return NextResponse.json({ message: "Unable to sign in." }, { status: 403 });
    const { error: auditError } = await supabase.rpc("admin_record_login", { p_user_id: session.user.id });
    if (auditError) return NextResponse.json({ message: "Unable to sign in." }, { status: 503 });
    await setAdminSession({ userId: session.user.id, accessToken: session.access_token, expiresAt: Date.now() + Math.min(session.expires_in, 8 * 60 * 60) * 1000 });
    return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Admin sign-in failed.", error instanceof Error ? error.message : "Unknown error.");
    return NextResponse.json({ message: "Unable to sign in." }, { status: 503 });
  }
}
