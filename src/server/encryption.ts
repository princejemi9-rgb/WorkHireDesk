import "server-only";
import { createCipheriv, randomBytes } from "node:crypto";

export function encryptSsn(ssn: string, applicationId: string, keyBase64: string, keyId: string) {
  const key = Buffer.from(keyBase64, "base64");
  if (key.length !== 32) throw new Error("Invalid encryption configuration.");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(`workhiredesk:ssn:${applicationId}:${keyId}`, "utf8"));
  const encrypted = Buffer.concat([cipher.update(ssn.replace(/-/g, ""), "utf8"), cipher.final()]);
  return { algorithm: "aes-256-gcm", key_id: keyId, nonce: nonce.toString("base64"), ciphertext: encrypted.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}
