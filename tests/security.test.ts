import { test } from "node:test";
import assert from "node:assert/strict";
import { createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { personalSchema, employmentSchema, fileError, MAX_FILE_SIZE } from "../src/validation/application";
import { encryptSsn, decryptSsn } from "../src/server/encryption";
import { inspectFile } from "../src/server/files";
import { isSameOrigin } from "../src/server/request";

const personal = { firstName: "Test", lastName: "Applicant", dateOfBirth: "1990-01-15", address: "Synthetic test address", email: "applicant@example.com", phone: "(202) 555-0123", ssn: "123-45-6789", consent: true };
test("shared schemas reject invalid dates, consent, contact details and SSNs", () => {
  assert.equal(personalSchema.safeParse(personal).success, true);
  for (const changes of [{ dateOfBirth: "2025-02-30" }, { dateOfBirth: "2999-01-01" }, { consent: false }, { email: "invalid" }, { phone: "0000000000" }, { ssn: "000-45-6789" }, { ssn: "123-00-6789" }, { ssn: "900-45-6789" }, { firstName: "   " }]) {
    assert.equal(personalSchema.safeParse({ ...personal, ...changes }).success, false);
  }
  assert.equal(employmentSchema.safeParse({ positionDesired: "Engineer", previousEmployer: "N/A" }).success, true);
  assert.equal(employmentSchema.safeParse({ positionDesired: "", previousEmployer: "" }).success, true);
  assert.equal(employmentSchema.safeParse({ positionDesired: "x".repeat(151), previousEmployer: "" }).success, false);
  assert.equal(employmentSchema.safeParse({ positionDesired: "", previousEmployer: "x".repeat(151) }).success, false);
});

test("AES-GCM uses distinct nonces and binds ciphertext to the application", () => {
  const key = randomBytes(32);
  const id = randomUUID();
  const first = encryptSsn(personal.ssn, id, key.toString("base64"), "v1");
  const second = encryptSsn(personal.ssn, id, key.toString("base64"), "v1");
  assert.notEqual(first.nonce, second.nonce);
  assert.ok(!JSON.stringify(first).includes(personal.ssn));
  function decrypt(applicationId: string) {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(first.nonce, "base64"));
    decipher.setAAD(Buffer.from(`workhiredesk:ssn:${applicationId}:v1`));
    decipher.setAuthTag(Buffer.from(first.tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(first.ciphertext, "base64")), decipher.final()]).toString();
  }
  assert.equal(decrypt(id), personal.ssn.replace(/-/g, ""));
  assert.throws(() => decrypt(randomUUID()));
  assert.throws(() => encryptSsn(personal.ssn, id, "bad-key", "v1"));
});

test("uploads enforce size, actual format, and optional tax documentation", async () => {
  const pdf = new File(["%PDF-1.4\n% synthetic format fixture\n%%EOF"], "fixture.pdf", { type: "application/pdf" });
  assert.equal((await inspectFile(pdf, "idFront"))?.mime, "application/pdf");
  assert.equal(await inspectFile(undefined, "taxDocument"), undefined);
  assert.equal(fileError(undefined, "resume"), undefined);
  assert.equal(await inspectFile(undefined, "resume"), undefined);
  assert.ok(fileError(undefined, "idFront"));
  assert.ok(fileError(undefined, "idBack"));
  assert.equal(MAX_FILE_SIZE, 10 * 1024 * 1024);
  assert.ok(fileError(new File([new Uint8Array(MAX_FILE_SIZE + 1)], "large.pdf", { type: "application/pdf" }), "resume"));
  await assert.rejects(inspectFile(new File(["<script>invalid</script>"], "fake.pdf", { type: "application/pdf" }), "idFront"));
  await assert.rejects(inspectFile(new File(["%PDF-1.4\n"], "fake.png", { type: "image/png" }), "idBack"));
});

test("request guard rejects foreign/missing origins", () => {
  assert.equal(isSameOrigin(new Request("https://example.com", { headers: { origin: "https://example.com" } }), "https://example.com"), true);
  assert.equal(isSameOrigin(new Request("https://example.com", { headers: { origin: "https://attacker.example" } }), "https://example.com"), false);
  assert.equal(isSameOrigin(new Request("https://example.com"), "https://example.com"), false);
});

test("production SSN decryptor authenticates key, application, ciphertext and tag",()=>{
 const key=randomBytes(32).toString("base64"), id=randomUUID();
 const envelope=encryptSsn(personal.ssn,id,key,"v1");
 assert.equal(decryptSsn(envelope,id,key,"v1"),"123456789");
 assert.throws(()=>decryptSsn(envelope,randomUUID(),key,"v1"));
 assert.throws(()=>decryptSsn(envelope,id,randomBytes(32).toString("base64"),"v1"));
 assert.throws(()=>decryptSsn(envelope,id,key,"v2"));
 assert.throws(()=>decryptSsn({...envelope,tag:randomBytes(16).toString("base64")},id,key,"v1"));
 assert.throws(()=>decryptSsn({...envelope,ciphertext:randomBytes(9).toString("base64")},id,key,"v1"));
});
