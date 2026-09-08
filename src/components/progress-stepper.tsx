import { Check } from "lucide-react";
export function ProgressStepper({ step }: { step: 1 | 2 }) {
  return <nav className="stepper" aria-label="Application progress"><ol>
    {["Personal Information", "Employment Information"].map((label, index) => <li key={label} className={index + 1 === step ? "active" : index + 1 < step ? "complete" : ""} aria-current={index + 1 === step ? "step" : undefined}>
      <span className="step-number">{index + 1 < step ? <Check size={16} /> : `0${index + 1}`}</span><span className="step-label">{label}<small>{index + 1 < step ? "Completed" : index + 1 === step ? "In progress" : "Up next"}</small></span>
    </li>)}
  </ol></nav>;
}
