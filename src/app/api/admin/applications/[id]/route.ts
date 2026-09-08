import { z } from "zod";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/server/admin-session";
import { getServiceClient } from "@/server/supabase";
const requestSchema = z.object({ status: z.enum(["received", "reviewing", "shortlisted", "rejected"]) });
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (request.headers.get("origin") !== process.env.APP_ORIGIN) return NextResponse.json({ message: "Unable to update." }, { status: 403 });
  const session = await getAdminSession(); if (!session) return NextResponse.json({ message: "Unable to update." }, { status: 401 });
  const { id } = await params; if (!z.uuid().safeParse(id).success) return NextResponse.json({ message: "Unable to update." }, { status: 400 });
  let body: unknown; try { body = await request.json(); } catch { return NextResponse.json({ message: "Unable to update." }, { status: 400 }); }
  const parsed = requestSchema.safeParse(body); if (!parsed.success) return NextResponse.json({ message: "Unable to update." }, { status: 400 });
  const supabase = getServiceClient(); const { data: userData, error: userError } = await supabase.auth.getUser(session.accessToken);
  if (userError || userData.user?.id !== session.userId) return NextResponse.json({ message: "Unable to update." }, { status: 401 });
  const { data: staff, error: staffError } = await supabase.rpc("admin_is_staff", { p_user_id: session.userId });
  if (staffError || staff !== true) return NextResponse.json({ message: "Unable to update." }, { status: 403 });
  const { error } = await supabase.rpc("admin_update_application_status", { p_user_id: session.userId, p_application_id: id, p_status: parsed.data.status });
  return error ? NextResponse.json({ message: "Unable to update." }, { status: 503 }) : NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
