import { ArrowRight, LoaderCircle } from "lucide-react";
export function SubmitButton({ pending, children }: { pending?: boolean; children: React.ReactNode }) {
  return <button className="primary-button" type="submit" disabled={pending}>{pending ? <><LoaderCircle size={17} className="spinner" /> Submitting application…</> : <>{children}<ArrowRight size={17} /></>}</button>;
}
