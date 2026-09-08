import { ShieldCheck } from "lucide-react";
import { privacyParagraphs } from "@/lib/privacy";
export function PrivacyNotice() {
  return <aside className="privacy-notice" aria-labelledby="privacy-title"><div className="privacy-heading"><ShieldCheck size={19} /><h3 id="privacy-title">SSN &amp; Government-Issued ID Privacy Notice</h3></div><div className="privacy-copy">{privacyParagraphs.map(p => <p key={p}>{p}</p>)}</div></aside>;
}
