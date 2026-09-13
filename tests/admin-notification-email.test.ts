import { test } from "node:test";
import assert from "node:assert/strict";
import { sendNewApplicationEmail } from "../src/server/admin-notification-email";

test("new-application email contains no applicant sensitive data", async t => {
 process.env.RESEND_API_KEY = "re_synthetic";
 process.env.ADMIN_NOTIFICATION_EMAIL = "admin@example.com";
 process.env.ADMIN_NOTIFICATION_FROM = "WorkHireDesk <notifications@example.com>";
 process.env.APP_ORIGIN = "https://www.workhiredesk.com";
 let request: Request | undefined;
 t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
  request = new Request(input, init);
  return Response.json({ id: "synthetic" }, { status: 200 });
 });
 await sendNewApplicationEmail("WHD-1234ABCD");
 assert.equal(request?.url, "https://api.resend.com/emails");
 const body = await request?.json() as { subject: string; text: string; to: string[] };
 assert.deepEqual(body.to, ["admin@example.com"]);
 assert.match(body.subject, /WHD-1234ABCD/);
 assert.match(body.text, /https:\/\/www\.workhiredesk\.com\/admin/);
 assert.doesNotMatch(body.text, /SSN|document|email address/i);
});
