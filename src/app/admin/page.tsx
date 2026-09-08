import Link from "next/link";
import { ClipboardList, Settings } from "lucide-react";
import { requireAdmin, searchApplications } from "@/server/admin";
import { adminFiltersSchema } from "@/lib/admin-workflow";
import { LogoutButton } from "@/components/logout-button";
import { AdminApplications } from "@/components/admin-applications";

export const dynamic = "force-dynamic";
export default async function AdminPage() {
  const session = await requireAdmin();
  const initial = await searchApplications(session.userId, adminFiltersSchema.parse({}));
  return <div className="admin-shell"><header className="admin-header"><Link href="/admin" className="brand"><span className="brand-symbol"><ClipboardList size={20} /></span><span>WorkHire<span className="brand-light">Desk</span><span className="brand-dot">.</span></span></Link><div><Link className="account-link" href="/admin/account"><Settings size={14} /> Account</Link><LogoutButton /></div></header><main className="admin-content"><AdminApplications initial={initial} /></main></div>;
}
