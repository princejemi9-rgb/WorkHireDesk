import { MailCheck, ShieldCheck } from "lucide-react";
import { VerifyEmailForm } from "@/components/verify-email-form";
import { VerificationResult } from "@/components/verification-result";
export const metadata = { title: "Verify your email" };
export default function VerifyEmailPage() { return <div className="login-page"><div className="login-card"><span className="login-icon"><MailCheck size={27} /></span><span className="eyebrow"><span /> STAFF ACCESS</span><h1>Verify your email</h1><p>Staff access is available after you confirm the email address connected to your account.</p><VerificationResult /><VerifyEmailForm /><small><ShieldCheck size={12} /> Verification protects applicant information from unauthorized access.</small></div></div>; }
