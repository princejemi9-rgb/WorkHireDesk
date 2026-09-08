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
