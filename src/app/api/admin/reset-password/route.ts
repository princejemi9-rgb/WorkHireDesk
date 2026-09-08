import { z } from "zod";
import { NextResponse } from "next/server";
import { getServerConfig } from "@/server/config";
const password = z.string().min(12).max(200).refine(value => /[a-z]/.test(value) && /[A-Z]/.test(value) && /\d/.test(value) && /[^A-Za-z0-9]/.test(value));
const schema = z.object({ token: z.string().min(20).max(10_000), newPassword: password });
export async function POST(request: Request) {
  if (request.headers.get("origin") !== process.env.APP_ORIGIN) return NextResponse.json({ message: "Unable to reset password." }, { status: 403 });
  const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return NextResponse.json({ message: "Unable to reset password." }, { status: 400 });
  try { const config = getServerConfig(); const response = await fetch(new URL("/auth/v1/user", config.SUPABASE_URL), { method: "PUT", headers: { apikey: config.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${parsed.data.token}`, "Content-Type": "application/json" }, body: JSON.stringify({ password: parsed.data.newPassword }), signal: AbortSignal.timeout(15_000), cache: "no-store" }); return response.ok ? NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } }) : NextResponse.json({ message: "Unable to reset password." }, { status: 400 }); } catch { return NextResponse.json({ message: "Unable to reset password." }, { status: 503 }); }
}
