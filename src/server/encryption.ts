import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

export function encryptSsn(ssn: string, applicationId: string, keyBase64: string, keyId: string) {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new Error("Invalid encryption configuration.");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(`workhiredesk:ssn:${applicationId}:${keyId}`, "utf8"));
  const encrypted = Buffer.concat([cipher.update(ssn.replace(/-/g, ""), "utf8"), cipher.final()]);
  return { algorithm: "aes-256-gcm", key_id: keyId, nonce: nonce.toString("base64"), ciphertext: encrypted.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function decryptSsn(envelope: ReturnType<typeof encryptSsn>, applicationId: string, keyBase64: string, keyId: string) {
  if (envelope.algorithm !== "aes-256-gcm" || envelope.key_id !== keyId) throw new Error("Unsupported encryption key.");
  const key = Buffer.from(keyBase64, "base64");
  const nonce = Buffer.from(envelope.nonce, "base64");
  const tag = Buffer.from(envelope.tag, "base64");
  if (key.length !== 32 || nonce.length !== 12 || tag.length !== 16) throw new Error("Invalid encryption configuration.");
  const decipher = createDecipheriv("aes-256-gcm", key, nonce);
  decipher.setAAD(Buffer.from(`workhiredesk:ssn:${applicationId}:${keyId}`, "utf8"));
  decipher.setAuthTag(tag);
  const ssn = Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64")), decipher.final()]).toString("utf8");
  if (!/^\d{9}$/.test(ssn)) throw new Error("Invalid identity data.");
  return ssn;
}
