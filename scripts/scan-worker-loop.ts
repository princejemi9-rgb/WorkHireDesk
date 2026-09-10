import { runDocumentScanBatch } from "./scan-documents";

const batchSize = Number(process.env.SCAN_BATCH_SIZE ?? "10");
const intervalMs = Number(process.env.SCAN_INTERVAL_MS ?? "60000");
if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100 || !Number.isInteger(intervalMs) || intervalMs < 10_000 || intervalMs > 3_600_000) throw new Error("Invalid scanner worker configuration.");

async function runBatch() {
  return runDocumentScanBatch(batchSize);
}

async function main() {
  for (;;) {
    try { await runBatch(); }
    catch { process.stderr.write("Document scan worker failed. Check scanner and service configuration.\n"); }
    await new Promise(resolve => setTimeout(resolve, intervalMs));
  }
}
void main();
