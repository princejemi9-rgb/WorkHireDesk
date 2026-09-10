import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { z } from "zod";
import { NextResponse } from "next/server";
import { documentNames, identityTypes, MAX_FILE_SIZE, resumeTypes } from "@/validation/application";
import { getServerConfig } from "@/server/config";
import { DOCUMENT_BUCKET, getServiceClient } from "@/server/supabase";
import { isSameOrigin } from "@/server/request";

const requestSchema = z.object({ submissionId: z.uuid(), documents: z.array(z.object({ kind: z.enum(documentNames), mimeType: z.string(), size: z.number().int().positive().max(MAX_FILE_SIZE) })).min(2).max(4) }).strict();
const response = (status: number) => NextResponse.json({ message: "We couldn't prepare your uploads. Please try again." }, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
 if (!isSameOrigin(request, process.env.APP_ORIGIN)) return response(403);
 try {
  const config = getServerConfig(); const body = requestSchema.parse(await request.json());
  const kinds = new Set(body.documents.map(d => d.kind));
  if (kinds.size !== body.documents.length || !kinds.has("idFront") || !kinds.has("idBack")) throw new Error();
  for (const document of body.documents) if (!(document.kind === "resume" ? resumeTypes : identityTypes).includes(document.mimeType)) throw new Error();
  const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : process.env.NODE_ENV !== "production" ? "127.0.0.1" : undefined;
  if (!ip || !isIP(ip)) throw new Error();
  const client = getServiceClient();
  const key = createHmac("sha256", config.RATE_LIMIT_HMAC_KEY).update(ip).digest("hex");
  const limit = await client.rpc("consume_application_rate_limit", { p_key: key }); if (limit.error || limit.data !== true) return response(429);
  const uploads = await Promise.all(body.documents.map(async document => {
   const objectKey = `${body.submissionId}/${randomUUID()}`;
   const signed = await client.storage.from(DOCUMENT_BUCKET).createSignedUploadUrl(objectKey);
   if (signed.error || !signed.data?.signedUrl) throw new Error();
   return { kind: document.kind, objectKey, mimeType: document.mimeType, size: document.size, uploadUrl: signed.data.signedUrl };
  }));
  return NextResponse.json({ uploads }, { headers: { "Cache-Control": "no-store" } });
 } catch { return response(400); }
}
