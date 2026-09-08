"use client";
import { useState, type FormEvent } from "react";
import { Send } from "lucide-react";

export function ForgotPasswordForm() {
  const [pending, setPending] = useState(false); const [sent, setSent] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); setPending(true); try { await fetch("/api/admin/password-recovery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: form.get("email") }), credentials: "same-origin" }); } finally { setPending(false); setSent(true); } }
  return <form className="verify-form" onSubmit={submit}>{sent ? <p className="success-message" role="status">If this staff account is eligible, a password reset link has been sent. Check your inbox and spam folder.</p> : <><label>Staff email<input name="email" type="email" autoComplete="email" required disabled={pending} /></label><button className="primary-button" disabled={pending}>{pending ? "Sending…" : <><Send size={16} /> Send reset link</>}</button></>}</form>;
}
