import { ApplicationProvider } from "@/components/application-provider";
import { ApplicationShell } from "@/components/application-shell";
export default function ApplyLayout({ children }: { children: React.ReactNode }) {
  return <ApplicationProvider><ApplicationShell>{children}</ApplicationShell></ApplicationProvider>;
}
