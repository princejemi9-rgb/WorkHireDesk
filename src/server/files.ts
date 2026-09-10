import "server-only";
import { fileTypeFromBuffer } from "file-type";
import { fileError, identityTypes, resumeTypes, type DocumentName } from "@/validation/application";

export async function inspectFile(file: File | undefined, name: DocumentName) {
  if (fileError(file, name)) throw new Error("Invalid document.");
  if (!file || file.size === 0) return undefined;
  const bytes = Buffer.from(await file.arrayBuffer());
  const detected = await fileTypeFromBuffer(bytes);
  const allowed = name === "resume" ? resumeTypes : identityTypes;
  if (!detected || !allowed.includes(detected.mime) || detected.mime !== file.type) throw new Error("Invalid document.");
  return { kind: name, bytes, mime: detected.mime, size: bytes.length };
}

export async function inspectUploadedBytes(bytes: Buffer, name: DocumentName, declaredMime: string, declaredSize: number) {
  if (!Number.isInteger(declaredSize) || declaredSize !== bytes.length || !bytes.length || bytes.length > 10 * 1024 * 1024) throw new Error("Invalid document.");
  const detected = await fileTypeFromBuffer(bytes);
  const allowed = name === "resume" ? resumeTypes : identityTypes;
  if (!detected || detected.mime !== declaredMime || !allowed.includes(detected.mime)) throw new Error("Invalid document.");
  return { kind: name, bytes, mime: detected.mime, size: bytes.length };
}
