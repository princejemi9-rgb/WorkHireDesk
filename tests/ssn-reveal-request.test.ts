import { test } from "node:test";
import assert from "node:assert/strict";
import { requestSsnReveal } from "../src/lib/ssn-reveal-request";

test("SSN reveal aborts a stalled browser request and validates the response", async t => {
 let aborted = false;
 t.mock.method(globalThis, "fetch", async (_input: string | URL | Request, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
  init?.signal?.addEventListener("abort", () => { aborted = true; reject(new DOMException("Aborted", "AbortError")); }, { once: true });
 }));
 await assert.rejects(requestSsnReveal("11111111-1111-4111-8111-111111111111", 10), { name: "AbortError" });
 assert.equal(aborted, true);
});

test("SSN reveal accepts only a full formatted SSN response", async t => {
 t.mock.method(globalThis, "fetch", async () => Response.json({ ssn: "123-45-6789" }));
 assert.equal(await requestSsnReveal("11111111-1111-4111-8111-111111111111", 20), "123-45-6789");
});
