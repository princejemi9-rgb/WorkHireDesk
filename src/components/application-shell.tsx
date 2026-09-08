import Link from "next/link";
import { ArrowUpRight, BriefcaseBusiness, LockKeyhole, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

export function ApplicationShell({ children }: { children: ReactNode }) {
  return <div className="site-shell">
    <header className="site-header"><div className="header-inner">
      <Link href="/apply" className="brand" aria-label="WorkHireDesk home"><span className="brand-symbol"><BriefcaseBusiness size={21} strokeWidth={1.8} /></span><span>WorkHire<span className="brand-light">Desk</span><span className="brand-dot">.</span></span></Link>
      <div className="header-assurance"><LockKeyhole size={14} /><span>Secure Job Application</span></div>
    </div></header>
    <main id="main-content" className="main-container">
      <div className="intro"><span className="eyebrow"><span /> YOUR NEXT CHAPTER STARTS HERE</span><h1>A new opportunity.<br className="mobile-break" /> A step forward.</h1><p>Bring your experience. Take the next step with WorkHireDesk.</p></div>
      {children}
      <div className="below-card"><ShieldCheck size={16} /><span>Your information is confidential and handled with care.</span></div>
    </main>
    <footer className="site-footer"><span>© {new Date().getFullYear()} WorkHireDesk. All rights reserved.</span><Link href="/privacy">Privacy &amp; Security <ArrowUpRight size={13} /></Link></footer>
  </div>;
}
