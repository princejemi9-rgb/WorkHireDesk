"use client";
import Link from "next/link";
import { Check, ArrowLeft, LockKeyhole } from "lucide-react";
import { useApplication } from "./application-provider";
export function SuccessState() {
  const { reference } = useApplication();
  if (!reference) return <article className="application-card success-card"><h2>Your application starts here</h2><p>Complete both steps to receive your application reference.</p><Link className="primary-button" href="/apply"><ArrowLeft size={16} /> Go to application</Link></article>;
  return <article className="application-card success-card"><div className="success-icon"><Check size={32} /></div><span className="eyebrow">THE NEXT STEP IS TAKEN</span><h2>Application Submitted</h2><p>Thank you for submitting your job application. Your information has been received successfully.</p><div className="reference-box"><span>Application Reference:</span><strong>{reference}</strong></div><p className="close-note">You may safely close this page.</p><div className="success-private"><LockKeyhole size={14} /> Your information remains private and confidential.</div></article>;
}
