import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { sendAuthEmail } from "../src/server/auth-email";

test("auth emails use Supabase redirect query parameter, neutral account errors, and visible service failures", async () => {
  const original = { ...process.env }; const realFetch = globalThis.fetch;
  Object.assign(process.env, { SUPABASE_URL: 'https://synthetic.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'test-only-key-'.repeat(5), APP_ORIGIN: 'https://example.com', SSN_ENCRYPTION_KEY_BASE64: randomBytes(32).toString('base64'), SSN_ENCRYPTION_KEY_ID: 'test', RATE_LIMIT_HMAC_KEY: 'a'.repeat(32), SUBMISSION_HMAC_KEY: 'b'.repeat(32) });
  try {
    for (const kind of ['recovery', 'verification'] as const) {
      globalThis.fetch = async (input, init) => {
        const url = new URL(String(input));
        assert.equal(url.pathname, kind === 'recovery' ? '/auth/v1/recover' : '/auth/v1/resend');
        assert.equal(url.searchParams.get('redirect_to'), `https://example.com/admin/${kind === 'recovery' ? 'reset-password' : 'verify-email'}`);
        assert.equal(JSON.parse(String(init?.body)).email, 'test@example.com');
        assert.ok(!String(init?.body).includes('redirect_to'));
        return new Response('{}', { status: 400 });
      };
      await sendAuthEmail('test@example.com', kind);
    }
    globalThis.fetch = async () => new Response('{}', { status: 429 });
    await assert.rejects(sendAuthEmail('test@example.com', 'recovery'), /Email service unavailable/);
    globalThis.fetch = async () => new Response('{}', { status: 503 });
    await assert.rejects(sendAuthEmail('test@example.com', 'verification'), /Email service unavailable/);
  } finally { globalThis.fetch = realFetch; process.env = original; }
});
