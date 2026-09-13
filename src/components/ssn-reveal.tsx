"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { requestSsnReveal } from "@/lib/ssn-reveal-request";

export function SsnReveal({ applicationId, lastFour }: { applicationId: string; lastFour: string }) {
 const [ssn, setSsn] = useState<string>();
 const [pending, setPending] = useState(false);
 const [error, setError] = useState("");
 const generation = useRef(0);

 useEffect(() => {
  const hide = () => { generation.current++; setSsn(undefined); };
  window.addEventListener("blur", hide);
  document.addEventListener("visibilitychange", hide);
  window.addEventListener("pagehide", hide);
  return () => {
   window.removeEventListener("blur", hide);
   document.removeEventListener("visibilitychange", hide);
   window.removeEventListener("pagehide", hide);
  };
 }, []);

 useEffect(() => {
  if (!ssn) return;
  const timer = setTimeout(() => setSsn(undefined), 30_000);
  return () => clearTimeout(timer);
 }, [ssn]);

 async function reveal() {
  if (!window.confirm("This action will be logged. Reveal this applicant's SSN?")) return;
  const current = ++generation.current;
  setPending(true);
  setError("");
  try {
   const value = await requestSsnReveal(applicationId);
   if (current === generation.current && !document.hidden) setSsn(value);
  } catch {
   setSsn(undefined);
   setError("Authentication failed. Please sign in again and retry.");
  } finally {
   setPending(false);
  }
 }

 return <div><h3>Social Security Number</h3><p className="ssn-value">{ssn || `•••-••-${lastFour}`}</p>{ssn ? <button type="button" onClick={() => { generation.current++; setSsn(undefined); }}>Hide</button> : <button type="button" disabled={pending} onClick={reveal}>{pending ? "Authorizing..." : "Reveal SSN"}</button>}<p className="card-intro">Access is logged. Revealed numbers hide after 30 seconds or when you leave this window.</p>{error && <p role="alert">{error} <Link href="/admin/login">Sign in</Link></p>}</div>;
}
