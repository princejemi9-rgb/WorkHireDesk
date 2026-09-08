import { z } from "zod";
import { getServiceClient } from "@/server/supabase";

export async function POST(request: Request) {
  if (request.headers.get("origin") !== process.env.APP_ORIGIN) return new Response(null, { status: 403 });
  const parsed = z.object({ token: z.string().min(20).max(10000) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return new Response(null, { status: 400 });
  try {
    const { data, error } = await getServiceClient().auth.getUser(parsed.data.token);
    return new Response(null, { status: !error && data.user?.email_confirmed_at ? 204 : 400, headers: { "Cache-Control": "no-store" } });
  } catch { return new Response(null, { status: 503 }); }
}
