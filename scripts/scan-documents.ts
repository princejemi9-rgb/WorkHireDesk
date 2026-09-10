import { scanWithClamAv } from "../src/server/clamav";
import { scanNextDocument } from "../src/server/scanner";

export async function runDocumentScanBatch(limit = Number(process.env.SCAN_BATCH_SIZE ?? "10")) {
 if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Invalid scan batch size.");
 let processed = 0;
 while (processed < limit && await scanNextDocument({ scan: scanWithClamAv })) processed++;
 return processed;
}

async function main() {
 const processed = await runDocumentScanBatch();
 process.stdout.write(`Processed ${processed} document scan job${processed === 1 ? "" : "s"}.\n`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/scan-documents.ts")) {
 main().catch(() => { process.stderr.write("Document scan worker failed. Check scanner and service configuration.\n"); process.exitCode = 1; });
}
