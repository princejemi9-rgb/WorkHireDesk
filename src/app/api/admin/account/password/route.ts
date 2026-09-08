import { z } from "zod";
import { NextResponse } from "next/server";
import { clearAdminSession, getAdminSession } from "@/server/admin-session";
import { getServerConfig } from "@/server/config";
import { getServiceClient } from "@/server/supabase";

const password = z.string().min(12).max(200).refine(value => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value));
const schema = z.object({ currentPassword: z.string().min(1).max(200), newPassword: password });
export async function POST(request: Request) {
  if (request.headers.get("origin") !== process.env.APP_ORIGIN) return NextResponse.json({ message: "Unable to change password." }, { status: 403 });
  const session = await getAdminSession(); if (!session) return NextResponse.json({ message: "Unable to change password." }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Unable to change password." }, { status: 400 });
  try {
    const config = getServerConfig(); const supabase = getServiceClient(); const { data: currentUser, error: userError } = await supabase.auth.getUser(session.accessToken); const email = currentUser.user?.email;
    if (userError || currentUser.user?.id !== session.userId || !email) return NextResponse.json({ message: "Unable to change password." }, { status: 401 });
    const { data: staff, error: staffError } = await supabase.rpc("admin_is_staff", { p_user_id: session.userId });
    if (staffError || staff !== true) return NextResponse.json({ message: "Unable to change password." }, { status: 403 });
    const verify = await fetch(new URL("/auth/v1/token?grant_type=password", config.SUPABASE_URL), { method: "POST", headers: { apikey: config.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ email, password: parsed.data.currentPassword }), signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (!verify.ok) return NextResponse.json({ message: "Unable to change password." }, { status: 401 });
    const update = await fetch(new URL("/auth/v1/user", config.SUPABASE_URL), { method: "PUT", headers: { apikey: config.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${session.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ password: parsed.data.newPassword }), signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (!update.ok) return NextResponse.json({ message: "Unable to change password." }, { status: 503 });
    await clearAdminSession(); return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "Unable to change password." }, { status: 503 }); }
}
