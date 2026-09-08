import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export const metadata = { title: "Reset staff password" };
export default function ForgotPasswordPage() { return <div className="login-page"><div className="login-card"><span className="login-icon"><KeyRound size={27} /></span><span className="eyebrow"><span /> STAFF ACCESS</span><h1>Reset your password</h1><p>Enter your staff email and we’ll send a secure password reset link if an account is eligible.</p><ForgotPasswordForm /><Link className="return-login" href="/admin/login"><ArrowLeft size={14} /> Return to sign in</Link></div></div>; }
