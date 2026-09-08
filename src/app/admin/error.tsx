"use client";
import Link from "next/link";
export default function AdminError({ reset }: { reset: () => void }) {
  return <main className="login-page"><div className="login-card"><h1>Unable to load this page</h1><p role="alert">Please try again. If this continues, contact your administrator.</p><button className="primary-button" onClick={reset}>Try again</button><Link className="return-login" href="/admin/login">Return to sign in</Link></div></main>;
}
