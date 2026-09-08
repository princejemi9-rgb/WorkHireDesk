import type { InputHTMLAttributes } from "react";
import { AlertCircle } from "lucide-react";
type Props = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; sensitive?: boolean };
export function FormField({ label, error, hint, sensitive, id, ...props }: Props) {
  return <div className="field"><label htmlFor={id}>{label} {props.required && <span className="required">*</span>}{sensitive && <span className="sensitive-badge">Sensitive</span>}</label>
    <input id={id} aria-invalid={!!error} aria-describedby={[hint ? `${id}-hint` : "", error ? `${id}-error` : ""].filter(Boolean).join(" ") || undefined} {...props} />
    {hint && <p className="field-hint" id={`${id}-hint`}>{hint}</p>}
    {error && <p className="field-error" id={`${id}-error`}><AlertCircle size={13} />{error}</p>}
  </div>;
}
