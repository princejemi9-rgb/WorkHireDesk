"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthFragment } from "./use-auth-fragment";

export function VerificationResult() {
  const fragment = useAuthFragment();
  const values = new URLSearchParams(fragment ?? "");
  const token = values.get("access_token");
  const [result, setResult] = useState("");
  useEffect(() => {
    if (!token) return;
    let active = true;
    void fetch("/api/admin/verification/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then(response => { if (active) setResult(response.ok ? "Email verified. You can now sign in with your approved staff account." : "Unable to verify this link. Request a new email below."); })
      .catch(() => { if (active) setResult("Unable to check confirmation. Please try signing in again."); });
    return () => { active = false; };
  }, [token]);
  const message = values.has("error") ? "This verification link is invalid or expired. Request a new email below." : result || (token ? "Checking your email confirmation…" : "");
  return <>{message && <p role="status">{message}</p>}<Link className="return-login" href="/admin/login">Return to sign in</Link></>;
}
