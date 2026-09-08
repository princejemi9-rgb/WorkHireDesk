import { NextResponse } from "next/server";
import { adminFiltersSchema } from "@/lib/admin-workflow";
import { getAdminSession } from "@/server/admin-session";
import { getServiceClient } from "@/server/supabase";
import { searchApplications } from "@/server/admin";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== process.env.APP_ORIGIN) return new Response(null, { status: 403 });
  const filters = adminFiltersSchema.safeParse(await request.json().catch(() => null));
  if (!filters.success) return new Response(null, { status: 400 });
  const session = await getAdminSession();
  if (!session) return new Response(null, { status: 401 });
  try {
    const { data, error } = await getServiceClient().auth.getUser(session.accessToken);
    if (error || data.user?.id !== session.userId) return new Response(null, { status: 401 });
    return NextResponse.json(await searchApplications(session.userId, filters.data), { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "Unable to load applications." }, { status: 503 }); }
}
