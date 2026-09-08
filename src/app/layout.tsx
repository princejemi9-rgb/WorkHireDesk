import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Job Application | WorkHireDesk", template: "%s | WorkHireDesk" },
  description: "Take the next step with WorkHireDesk. Complete your job application through our private, two-step application process.",
  robots: { index: false, follow: false },
};
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Dynamic rendering lets Next apply the per-request CSP nonce to its scripts.
  await headers();
  return <html lang="en"><body><a className="skip-link" href="#main-content">Skip to content</a>{children}</body></html>;
}
