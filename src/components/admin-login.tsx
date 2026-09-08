"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import Link from "next/link";

export function AdminLogin() {
  const router = useRouter(); const [pending, setPending] = useState(false); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setError(""); const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/login", { method: "POST", body: JSON.stringify({ email: form.get("email"), password: form.get("password") }), headers: { "Content-Type": "application/json" }, credentials: "same-origin" });
      const result = await response.json().catch(() => null) as { reason?: string } | null;
      if (response.ok) router.push("/admin"); else if (result?.reason === "verify_email") router.push("/admin/verify-email"); else setError("We couldn’t sign you in. Check your credentials and staff access.");
    } catch { setError("We couldn’t sign you in. Please try again."); } finally { setPending(false); }
  }
  return <div className="login-page"><div className="login-card"><span className="login-icon"><ShieldCheck size={27} /></span><span className="eyebrow"><span /> STAFF ACCESS</span><h1>WorkHireDesk portal</h1><p>Sign in with an authorized staff account.</p><form onSubmit={submit}><label>Email<input name="email" type="email" autoComplete="username" required disabled={pending} /></label><label>Password<input name="password" type="password" autoComplete="current-password" required disabled={pending} /></label><Link className="forgot-password" href="/admin/forgot-password">Forgot password?</Link>{error && <p className="login-error" role="alert">{error}</p>}<button className="primary-button" disabled={pending}>{pending ? "Signing in…" : <><LockKeyhole size={16} /> Sign in securely</>}</button></form><small>Access is limited to staff approved for application review.</small></div></div>;
}
