import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { POST } from "../src/app/api/applications/route";

const id = randomUUID();
const payload = { submissionId: id, firstName: "Synthetic", lastName: "Applicant", dateOfBirth: "1990-01-15", address: "Test address", email: "test@example.com", phone: "2025550123", ssn: "123-45-6789", consent: true, positionDesired: "Engineer", previousEmployer: "N/A" };
function request() {
  const body = new FormData();
  body.set("application", JSON.stringify(payload));
  for (const name of ["idFront", "idBack", "resume"]) body.set(name, new File(["%PDF-1.4\n% synthetic fixture\n%%EOF"], "private-original-name.pdf", { type: "application/pdf" }));
  return new Request("http://localhost:3000/api/applications", { method: "POST", body, headers: { origin: "http://localhost:3000" } });
}

test("submission boundary encrypts data, returns only receipt, handles retries and failures", async t => {
  process.env.APP_ORIGIN = "http://localhost:3000";
  process.env.SUPABASE_URL = "https://test-project.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "synthetic-test-service-key-with-no-real-access";
  process.env.SSN_ENCRYPTION_KEY_BASE64 = randomBytes(32).toString("base64");
  process.env.SSN_ENCRYPTION_KEY_ID = "test-v1";
  process.env.RATE_LIMIT_HMAC_KEY = randomBytes(32).toString("hex");
  process.env.SUBMISSION_HMAC_KEY = randomBytes(32).toString("hex");
  delete process.env.VERCEL;
  const calls: { url: string; method?: string; body: unknown }[] = [];
  let scenario = "success";
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method, body: init?.body });
    if (url.includes("consume_application_rate_limit")) return Response.json(scenario !== "limited");
    if (url.includes("lookup_application_receipt")) return Response.json(scenario === "retry" ? "WHD-1234ABCD" : null);
    if (url.includes("submit_job_application")) {
      if (scenario === "uncertain") return Response.json({ message: "internal database detail" }, { status: 500 });
      return Response.json({ reference: "WHD-1234ABCD", created: true });
    }
    if (url.includes("/storage/v1/object/")) return Response.json({ Key: "synthetic" });
    throw new Error("Unexpected test request");
  });
  const result = await POST(request());
  assert.equal(result.status, 200);
  assert.deepEqual(await result.json(), { reference: "WHD-1234ABCD" });
  const commit = calls.find(c => c.url.includes("submit_job_application"));
  assert.ok(commit);
  const stored = JSON.parse(String(commit.body));
  assert.equal(stored.p_metadata.ssn, undefined);
  assert.equal(stored.p_ssn.algorithm, "aes-256-gcm");
  assert.ok(!String(commit.body).includes(payload.ssn));
  assert.equal(stored.p_documents.length, 3);
  assert.ok(calls.filter(c => c.url.includes("/storage/")).every(c => !c.url.includes("private-original-name")));
  assert.ok(stored.p_documents.every((doc: { object_key: string }) => doc.object_key.startsWith(`${id}/`)));

  scenario = "retry"; calls.length = 0;
  assert.equal((await POST(request())).status, 200);
  assert.equal(calls.filter(c => c.url.includes("/storage/")).length, 0);

  scenario = "limited"; calls.length = 0;
  assert.equal((await POST(request())).status, 429);
  assert.equal(calls.length, 1);

  scenario = "uncertain"; calls.length = 0;
  const failure = await POST(request());
  assert.equal(failure.status, 503);
  assert.deepEqual(await failure.json(), { message: "We couldn't submit your application. Please try again." });
  assert.equal(calls.some(c => c.method === "DELETE"), false);
});
