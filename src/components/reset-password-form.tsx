"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { KeyRound } from "lucide-react";
import { useAuthFragment } from "./use-auth-fragment";

export function ResetPasswordForm() {
  const router = useRouter(); const [pending, setPending] = useState(false); const [submitError, setError] = useState(""); const [message, setMessage] = useState("");
  const fragment = useAuthFragment();
  const values = new URLSearchParams(fragment ?? "");
  const token = values.get("type") === "recovery" ? values.get("access_token") : null;
  const error = submitError || (fragment !== null && !token ? "This reset link is invalid or has expired. Request another one." : "");
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const form = new FormData(event.currentTarget); if (form.get("newPassword") !== form.get("confirmPassword")) { setError("The new passwords do not match."); return; } if (!token) { setError("This reset link is invalid or has expired. Request another one."); return; } setPending(true); setError(""); try { const response = await fetch("/api/admin/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ token, newPassword: form.get("newPassword") }) }); if (!response.ok) { setError("This reset link is invalid or has expired. Request another one."); return; } setMessage("Password updated. Redirecting to sign in…"); setTimeout(() => router.push("/admin/login"), 900); } catch { setError("We couldn’t reset your password. Please try again."); } finally { setPending(false); } }
  return <form className="password-form" onSubmit={submit}><label>New password<input name="newPassword" type="password" autoComplete="new-password" minLength={12} required disabled={pending} aria-describedby="reset-password-help" /></label><p id="reset-password-help">At least 12 characters, with upper and lower case letters, a number, and a symbol.</p><label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" minLength={12} required disabled={pending} /></label>{error && <p className="login-error" role="alert">{error}</p>}{message && <p className="success-message" role="status">{message}</p>}<button className="primary-button" disabled={pending}>{pending ? "Updating password…" : <><KeyRound size={16} /> Update password</>}</button></form>;
}
