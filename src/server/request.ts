import "server-only";
import { MAX_REQUEST_SIZE } from "@/validation/application";

export function isSameOrigin(request: Request, origin: string | undefined) {
  if (!origin) return false;
  try {
    return request.headers.get("origin") === new URL(origin).origin && [null, "same-origin"].includes(request.headers.get("sec-fetch-site"));
  } catch { return false; }
}

export async function readLimitedFormData(request: Request) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_REQUEST_SIZE)) throw new Error("Invalid request.");
  if (!request.body) throw new Error("Invalid request.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      size += next.value.length;
      if (size > MAX_REQUEST_SIZE) { await reader.cancel(); throw new Error("Invalid request."); }
      chunks.push(next.value);
    }
  } finally { reader.releaseLock(); }
  const buffer = Buffer.concat(chunks);
  return new Response(buffer, { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
}
