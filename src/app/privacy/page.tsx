import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ApplicationShell } from "@/components/application-shell";
import { PrivacyNotice } from "@/components/privacy-notice";
export const metadata = { title: "Privacy & Security" };
export default function PrivacyPage() { return <ApplicationShell><article className="application-card privacy-page"><h2>Privacy &amp; Security</h2><p>How sensitive information submitted through WorkHireDesk is handled.</p><PrivacyNotice /><Link href="/apply" className="back-button"><ArrowLeft size={16} /> Return to application</Link></article></ApplicationShell>; }
