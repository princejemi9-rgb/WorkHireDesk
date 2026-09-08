import Link from "next/link";
import { ArrowLeft, Settings, ShieldCheck } from "lucide-react";
import { requireAdmin } from "@/server/admin";
import { PasswordChangeForm } from "@/components/password-change-form";

export const dynamic = "force-dynamic";

export default async function AccountPage() {
  await requireAdmin();
  return <div className="admin-shell"><header className="admin-header"><Link href="/admin" className="brand"><span className="brand-symbol"><ShieldCheck size={20} /></span><span>WorkHire<span className="brand-light">Desk</span><span className="brand-dot">.</span></span></Link><span className="staff-label"><ShieldCheck size={14} /> Staff portal</span></header><section className="admin-content account-page"><Link href="/admin" className="back-button"><ArrowLeft size={16} /> Back to applications</Link><div className="account-card"><span className="account-icon"><Settings size={24} /></span><span className="eyebrow"><span /> ACCOUNT SECURITY</span><h1>Change password</h1><p>Use a new, unique password for your staff account. You will be signed out after it changes.</p><PasswordChangeForm /></div></section></div>;
}
