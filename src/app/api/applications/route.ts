import { createHmac, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { finalSubmissionSchema, documentNames, type DocumentName } from "@/validation/application";
import { getServerConfig } from "@/server/config";
import { DOCUMENT_BUCKET, getServiceClient } from "@/server/supabase";
import { encryptSsn } from "@/server/encryption";
import { inspectUploadedBytes } from "@/server/files";
import { isSameOrigin } from "@/server/request";
export const runtime = "nodejs"; export const maxDuration = 60;
const error = (status = 400, errorId?: string) => NextResponse.json({ message: "We couldn't submit your application. Please try again.", ...(errorId ? { errorId } : {}) }, { status, headers: { "Cache-Control": "no-store, max-age=0" } });
type Upload = { kind: DocumentName; objectKey: string; mimeType: string; size: number };
export async function POST(request: Request) {
 if (!isSameOrigin(request, process.env.APP_ORIGIN)) return error(403);
 let stage = "request";
 try {
  const config=getServerConfig(); stage="validation"; const body=await request.json() as {application:unknown;uploads:Upload[]}; const application=finalSubmissionSchema.parse(body.application);
  if (!Array.isArray(body.uploads)||body.uploads.length<2||body.uploads.length>4) throw new Error(); const kinds=new Set(body.uploads.map(x=>x.kind)); if(kinds.size!==body.uploads.length||!kinds.has("idFront")||!kinds.has("idBack"))throw new Error();
  const client=getServiceClient(), id=application.submissionId, documents=[] as Awaited<ReturnType<typeof inspectUploadedBytes>>[];
  stage="document_validation"; for(const upload of body.uploads){if(!documentNames.includes(upload.kind)||!Number.isInteger(upload.size)||!new RegExp(`^${id}/[a-f0-9-]{36}$`).test(upload.objectKey))throw new Error();const object=await client.storage.from(DOCUMENT_BUCKET).download(upload.objectKey);if(object.error||!object.data)throw new Error();documents.push(await inspectUploadedBytes(Buffer.from(await object.data.arrayBuffer()),upload.kind,upload.mimeType,upload.size));}
  const hash=createHmac("sha256",config.SUBMISSION_HMAC_KEY).update(JSON.stringify(application));for(const doc of documents)hash.update(doc.kind).update(doc.mime).update(doc.bytes);const fingerprint=hash.digest("hex");
  stage="receipt_lookup"; const previous=await client.rpc("lookup_application_receipt",{p_id:id,p_fingerprint:fingerprint});if(previous.error)throw new Error();if(typeof previous.data==="string")return NextResponse.json({reference:previous.data},{headers:{"Cache-Control":"no-store"}});
  const {ssn,submissionId,...metadata}=application;void submissionId;const p_documents=documents.map(doc=>({kind:doc.kind,object_key:body.uploads.find(x=>x.kind===doc.kind)!.objectKey,mime_type:doc.mime,size_bytes:doc.size}));
  stage="database_submission"; const saved=await client.rpc("submit_job_application",{p_id:id,p_fingerprint:fingerprint,p_metadata:metadata,p_ssn:encryptSsn(ssn,id,config.SSN_ENCRYPTION_KEY_BASE64,config.SSN_ENCRYPTION_KEY_ID),p_documents});if(saved.error||!saved.data?.reference)throw new Error();return NextResponse.json({reference:saved.data.reference},{headers:{"Cache-Control":"no-store"}});
 }catch {
  const errorId=`app-${randomUUID()}`;
  console.error(JSON.stringify({ event: "application_submission_failed", errorId, stage }));
  return error(400, errorId);
 }
}
