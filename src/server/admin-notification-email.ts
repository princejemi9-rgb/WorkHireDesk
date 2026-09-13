import "server-only";

const resendEndpoint = "https://api.resend.com/emails";

export async function sendNewApplicationEmail(reference: string) {
 const apiKey = process.env.RESEND_API_KEY;
 const recipient = process.env.ADMIN_NOTIFICATION_EMAIL;
 const from = process.env.ADMIN_NOTIFICATION_FROM;
 const origin = process.env.APP_ORIGIN;
 if (!apiKey || !recipient || !from || !origin) {
  console.warn(JSON.stringify({ event: "admin_notification_email_skipped", reason: "not_configured" }));
  return;
 }
 try {
  const response = await fetch(resendEndpoint, {
   method: "POST",
   headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
   body: JSON.stringify({
    from, to: [recipient], subject: `New WorkHireDesk application: ${reference}`,
    text: `A new application has been submitted (${reference}). Sign in to WorkHireDesk to review it securely: ${new URL("/admin", origin)}`,
   }),
   signal: AbortSignal.timeout(10_000), cache: "no-store",
  });
  if (!response.ok) console.error(JSON.stringify({ event: "admin_notification_email_failed", status: response.status }));
 } catch {
  console.error(JSON.stringify({ event: "admin_notification_email_failed", reason: "request_error" }));
 }
}
