import { createHmac, randomUUID } from "node:crypto";
import { isIP } from "node:net";
import { NextResponse } from "next/server";
import { finalSubmissionSchema, documentNames } from "@/validation/application";
import { getServerConfig } from "@/server/config";
import { DOCUMENT_BUCKET, getServiceClient } from "@/server/supabase";
import { encryptSsn } from "@/server/encryption";
import { inspectFile } from "@/server/files";
import { isSameOrigin, readLimitedFormData } from "@/server/request";

export const runtime = "nodejs";
export const maxDuration = 60;
const genericError = "We couldn't submit your application. Please try again.";
const reply = (status: number, data: Record<string, string>) => NextResponse.json(data, { status, headers: { "Cache-Control": "no-store, max-age=0", ...(status === 429 ? { "Retry-After": "900" } : {}) } });

export async function POST(request: Request) {
  if (!isSameOrigin(request, process.env.APP_ORIGIN)) return reply(403, { message: genericError });
  if (!request.headers.get("content-type")?.startsWith("multipart/form-data;")) return reply(400, { message: genericError });
  let config: ReturnType<typeof getServerConfig>;
  try { config = getServerConfig(); } catch { return reply(503, { message: genericError }); }
  const supabase = getServiceClient();
  // Only trust an address written by the configured hosting edge, never a caller's X-Forwarded-For.
  const ip = process.env.VERCEL === "1" ? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() : process.env.NODE_ENV !== "production" ? "127.0.0.1" : undefined;
  if (!ip || !isIP(ip)) return reply(503, { message: genericError });
  const clientHash = createHmac("sha256", config.RATE_LIMIT_HMAC_KEY).update(ip).digest("hex");
  try {
    const { data: allowed, error } = await supabase.rpc("consume_application_rate_limit", { p_key: clientHash });
    if (error) return reply(503, { message: genericError });
    if (allowed !== true) return reply(429, { message: genericError });
  } catch { return reply(503, { message: genericError }); }

  let application: ReturnType<typeof finalSubmissionSchema.parse>;
  const documents: NonNullable<Awaited<ReturnType<typeof inspectFile>>>[] = [];
  try {
    const form = await readLimitedFormData(request);
    const allowedKeys = new Set<string>(["application", ...documentNames]);
    for (const key of form.keys()) if (!allowedKeys.has(key) || form.getAll(key).length !== 1) throw new Error("Invalid request.");
    const raw = form.get("application");
    if (typeof raw !== "string" || raw.length > 10_000) throw new Error("Invalid request.");
    application = finalSubmissionSchema.parse(JSON.parse(raw));
    for (const name of documentNames) {
      const value = form.get(name);
      if (value !== null && !(value instanceof File)) throw new Error("Invalid document.");
      const inspected = await inspectFile(value instanceof File ? value : undefined, name);
      if (inspected) documents.push(inspected);
    }
  } catch { return reply(400, { message: genericError }); }

  // Fingerprint is a keyed hash, never a plain hash of the small SSN search space.
  const fingerprint = createHmac("sha256", config.SUBMISSION_HMAC_KEY).update(JSON.stringify(application));
  for (const doc of documents) fingerprint.update(doc.kind).update(doc.mime).update(doc.bytes);
  const digest = fingerprint.digest("hex");
  const appId = application.submissionId;
  const uploaded: string[] = [];
  const manifest: { kind: string; object_key: string; mime_type: string; size_bytes: number }[] = [];
  let commitStarted = false;
  try {
    // A retry can recover a previously committed response without uploading again.
    const { data: previous, error: lookupError } = await supabase.rpc("lookup_application_receipt", { p_id: appId, p_fingerprint: digest });
    if (lookupError) throw new Error("Submission unavailable.");
    if (typeof previous === "string") return reply(200, { reference: previous });
    for (const doc of documents) {
      const key = `${appId}/${randomUUID()}`;
      // Track before upload: a transport timeout can happen after storage accepts the object.
      uploaded.push(key);
      const { error } = await supabase.storage.from(DOCUMENT_BUCKET).upload(key, doc.bytes, { contentType: doc.mime, upsert: false, cacheControl: "0" });
      if (error) throw new Error("Submission unavailable.");
      manifest.push({ kind: doc.kind, object_key: key, mime_type: doc.mime, size_bytes: doc.size });
    }
    const { ssn, submissionId: _submissionId, ...metadata } = application;
    void _submissionId;
    const encrypted = encryptSsn(ssn, appId, config.SSN_ENCRYPTION_KEY_BASE64, config.SSN_ENCRYPTION_KEY_ID);
    commitStarted = true;
    const { data, error } = await supabase.rpc("submit_job_application", { p_id: appId, p_fingerprint: digest, p_metadata: metadata, p_ssn: encrypted, p_documents: manifest });
    if (error || !data || typeof data.reference !== "string") throw new Error("Submission unavailable.");
    if (!data.created) await supabase.storage.from(DOCUMENT_BUCKET).remove(uploaded);
    return reply(200, { reference: data.reference });
  } catch {
    // Never delete after an uncertain DB commit; reconciliation removes unreferenced objects later.
    if (!commitStarted && uploaded.length) {
      try { await supabase.storage.from(DOCUMENT_BUCKET).remove(uploaded); } catch { /* Reconcile orphaned objects offline. */ }
    }
    return reply(503, { message: genericError });
  }
}
