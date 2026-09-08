"use client";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";

export function PasswordChangeForm() {
  const router = useRouter(); const [pending, setPending] = useState(false); const [message, setMessage] = useState(""); const [error, setError] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    if (form.get("newPassword") !== form.get("confirmPassword")) { setError("The new passwords do not match."); return; }
    setPending(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/admin/account/password", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ currentPassword: form.get("currentPassword"), newPassword: form.get("newPassword") }) });
      if (!response.ok) { setError("We couldn’t change your password. Check your current password and try again."); return; }
      setMessage("Password changed. Redirecting to sign in…"); setTimeout(() => router.push("/admin/login"), 900);
    } catch { setError("We couldn’t change your password. Please try again."); } finally { setPending(false); }
  }
  return <form className="password-form" onSubmit={submit}><label>Current password<input name="currentPassword" type="password" autoComplete="current-password" required disabled={pending} /></label><label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={12} required disabled={pending} aria-describedby="password-help" /></label><p id="password-help">At least 12 characters, with upper and lower case letters, a number, and a symbol.</p><label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required disabled={pending} /></label>{error && <p className="login-error" role="alert">{error}</p>}{message && <p className="success-message" role="status">{message}</p>}<button className="primary-button" disabled={pending}>{pending ? "Updating password…" : <><KeyRound size={16} /> Update password</>}</button></form>;
}
