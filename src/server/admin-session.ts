import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { getAdminConfig } from "./config";

const COOKIE = "whd_admin";
type Session = { userId: string; accessToken: string; expiresAt: number };

function key() { return Buffer.from(getAdminConfig().ADMIN_SESSION_KEY_BASE64, "base64"); }
function seal(session: Session) {
  const nonce = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key(), nonce);
  const value = Buffer.concat([cipher.update(JSON.stringify(session), "utf8"), cipher.final()]);
  return [nonce, cipher.getAuthTag(), value].map(part => part.toString("base64url")).join(".");
}
function open(value: string): Session | null {
  try {
    const [nonce, tag, ciphertext] = value.split(".").map(part => Buffer.from(part, "base64url"));
    if (!nonce || !tag || !ciphertext) return null;
    const decipher = createDecipheriv("aes-256-gcm", key(), nonce); decipher.setAuthTag(tag);
    const parsed = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
    return typeof parsed.userId === "string" && typeof parsed.accessToken === "string" && typeof parsed.expiresAt === "number" && parsed.expiresAt > Date.now() ? parsed : null;
  } catch { return null; }
}
export async function getAdminSession() { const jar = await cookies(); const value = jar.get(COOKIE)?.value; return value ? open(value) : null; }
export async function setAdminSession(session: Session) {
  const jar = await cookies();
  // API routes also need this cookie for server-side authorization.
  jar.set(COOKIE, "", { path: "/admin", maxAge: 0 });
  jar.set(COOKIE, seal(session), { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: Math.max(1, Math.floor((session.expiresAt - Date.now()) / 1000)) });
}
export async function clearAdminSession() { const jar = await cookies(); jar.set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "strict", path: "/", maxAge: 0 }); }
