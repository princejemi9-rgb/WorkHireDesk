import Link from "next/link";
import { ArrowLeft, KeyRound } from "lucide-react";
import { ResetPasswordForm } from "@/components/reset-password-form";

export const metadata = { title: "Set a new password" };
export default function ResetPasswordPage() { return <div className="login-page"><div className="login-card"><span className="login-icon"><KeyRound size={27} /></span><span className="eyebrow"><span /> ACCOUNT RECOVERY</span><h1>Set a new password</h1><p>Choose a strong, unique password to restore your staff access.</p><ResetPasswordForm /><Link className="return-login" href="/admin/login"><ArrowLeft size={14} /> Return to sign in</Link></div></div>; }
