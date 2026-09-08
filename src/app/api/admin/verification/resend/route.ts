import { z } from "zod";
import { NextResponse } from "next/server";
import { sendAuthEmail } from "@/server/auth-email";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== process.env.APP_ORIGIN) return new Response(null, { status: 403 });
  const parsed = z.object({ email: z.email().max(254) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  try { await sendAuthEmail(parsed.data.email, "verification"); }
  catch { return NextResponse.json({ message: "Email service unavailable. Please try again later." }, { status: 503 }); }
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
