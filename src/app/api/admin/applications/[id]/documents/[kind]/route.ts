import { z } from "zod";
import { NextResponse } from "next/server";
import { getAdminSession } from "@/server/admin-session";
import { DOCUMENT_BUCKET, getServiceClient } from "@/server/supabase";

const kindSchema = z.enum(["idFront", "idBack", "resume", "taxDocument"]);
const unavailable = () => NextResponse.json({ message: "Document unavailable." }, { status: 404, headers: { "Cache-Control": "no-store" } });

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  const session = await getAdminSession();
  const { id, kind } = await params;
  if (!session || !z.uuid().safeParse(id).success || !kindSchema.safeParse(kind).success) return unavailable();
  try {
    const supabase = getServiceClient();
    const { data: userData, error: userError } = await supabase.auth.getUser(session.accessToken);
    if (userError || userData.user?.id !== session.userId) return unavailable();
    const { data: objectKey, error: permissionError } = await supabase.rpc("admin_get_document_for_download", { p_user_id: session.userId, p_application_id: id, p_kind: kind });
    if (permissionError || typeof objectKey !== "string") return unavailable();
    const { data, error } = await supabase.storage.from(DOCUMENT_BUCKET).createSignedUrl(objectKey, 60, { download: true });
    if (error || !data?.signedUrl) return unavailable();
    return NextResponse.redirect(data.signedUrl, { headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  } catch { return unavailable(); }
}
