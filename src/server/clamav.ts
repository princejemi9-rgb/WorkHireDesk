import "server-only";
import { Socket } from "node:net";

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
const CONNECT_TIMEOUT_MS = 10_000;
const SCAN_TIMEOUT_MS = 45_000;

function scannerConfig() {
  const host = process.env.CLAMD_HOST;
  const port = Number(process.env.CLAMD_PORT ?? "3310");
  if (!host || !/^[a-zA-Z0-9.-]+$/.test(host) || !Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Document scanner is not configured.");
  }
  return { host, port };
}

/** Interpret a clamd INSTREAM response without retaining file content or scanner diagnostics. */
export function parseClamdResult(response: string): "clean" | "rejected" {
  const verdict = response.replace(/\0/g, "").trim();
  if (/\bOK$/i.test(verdict)) return "clean";
  if (/\bFOUND$/i.test(verdict)) return "rejected";
  throw new Error("Document scanner did not return a definitive result.");
}

/**
 * Private-network ClamAV INSTREAM client. Do not expose clamd to the internet.
 * Errors and limit responses deliberately fail closed in scanNextDocument.
 */
export async function scanWithClamAv(bytes: Uint8Array): Promise<"clean" | "rejected"> {
  if (!bytes.length || bytes.length > MAX_DOCUMENT_BYTES) throw new Error("Invalid document size.");
  const { host, port } = scannerConfig();
  return new Promise((resolve, reject) => {
    const socket = new Socket();
    const chunks: Buffer[] = [];
    let settled = false;
    const finish = (error?: Error, result?: "clean" | "rejected") => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error); else resolve(result!);
    };
    const timeout = setTimeout(() => finish(new Error("Document scan timed out.")), SCAN_TIMEOUT_MS);
    socket.setTimeout(SCAN_TIMEOUT_MS);
    socket.once("error", () => finish(new Error("Document scanner unavailable.")));
    socket.once("timeout", () => finish(new Error("Document scan timed out.")));
    socket.on("data", (chunk: Buffer) => chunks.push(chunk));
    socket.once("end", () => {
      clearTimeout(timeout);
      try { finish(undefined, parseClamdResult(Buffer.concat(chunks).toString("utf8"))); }
      catch { finish(new Error("Document scanner did not return a definitive result.")); }
    });
    socket.connect(port, host, () => {
      socket.write(Buffer.from("zINSTREAM\0", "utf8"));
      const size = Buffer.alloc(4); size.writeUInt32BE(bytes.length);
      socket.write(size); socket.write(Buffer.from(bytes)); socket.write(Buffer.alloc(4));
      socket.end();
    });
    socket.setTimeout(CONNECT_TIMEOUT_MS);
    socket.once("connect", () => socket.setTimeout(SCAN_TIMEOUT_MS));
  });
}
