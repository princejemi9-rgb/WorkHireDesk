import { NextResponse } from "next/server";
import { clearAdminSession } from "@/server/admin-session";
export async function POST(request: Request) { if (request.headers.get("origin") !== process.env.APP_ORIGIN) return NextResponse.json({ ok: false }, { status: 403 }); await clearAdminSession(); return NextResponse.json({ ok: true }); }
