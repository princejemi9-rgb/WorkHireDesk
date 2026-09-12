"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Info, LockKeyhole, UserRound, BriefcaseBusiness } from "lucide-react";
import { useApplication } from "./application-provider";
import { FormField } from "./form-field";
import { FileUploadField } from "./file-upload-field";
import { ProgressStepper } from "./progress-stepper";
import { PrivacyNotice } from "./privacy-notice";
import { SubmitButton } from "./submit-button";
import { consentText } from "@/lib/privacy";
import { employmentSchema, personalSchema, finalSubmissionSchema, fileError, documentNames, type ApplicationValues, type DocumentName } from "@/validation/application";

export function ApplicationForm({ step }: { step: 1 | 2 }) {
  const app = useApplication();
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const checkingStep = step === 2 && !app.personalComplete && !app.reference;
  const inFlight = useRef(false);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (step === 2 && !app.personalComplete && !app.reference) router.replace("/apply");
  }, [step, app.personalComplete, app.reference, router]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); };
    if (Object.values(app.values).some(Boolean)) window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [app.values]);

  function update(name: keyof ApplicationValues, value: string | boolean) {
    app.setValues(old => ({ ...old, [name]: value }));
    setErrors(old => ({ ...old, [name]: "" }));
    setSubmitError("");
  }
  function updateFile(name: DocumentName, file?: File) {
    app.setFiles(old => ({ ...old, [name]: file }));
    setErrors(old => ({ ...old, [name]: "" }));
  }
  function showErrors(next: Record<string, string>) {
    setErrors(next);
    setTimeout(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(), 0);
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (inFlight.current) return;
    const parsed = (step === 1 ? personalSchema : employmentSchema).safeParse(app.values);
    const nextErrors: Record<string, string> = {};
    if (!parsed.success) for (const issue of parsed.error.issues) nextErrors[String(issue.path[0])] ??= issue.message;
    for (const name of (step === 1 ? ["idFront", "idBack"] : ["resume", "taxDocument"]) as DocumentName[]) {
      const problem = fileError(app.files[name], name);
      if (problem) nextErrors[name] = problem;
    }
    if (Object.keys(nextErrors).length) { showErrors(nextErrors); return; }
    if (step === 1) {
      app.setPersonalComplete(true);
      router.push("/apply/employment");
      return;
    }
    const submissionId = app.submissionId ?? crypto.randomUUID();
    app.setSubmissionId(submissionId);
    const finalData = finalSubmissionSchema.safeParse({ ...app.values, submissionId });
    if (!finalData.success || fileError(app.files.idFront, "idFront") || fileError(app.files.idBack, "idBack")) {
      app.setPersonalComplete(false); router.push("/apply"); return;
    }
    inFlight.current = true;
    setPending(true);
    setSubmitError("");
    try {
      const requested = documentNames.flatMap(name => app.files[name] ? [{ kind: name, mimeType: app.files[name]!.type, size: app.files[name]!.size }] : []);
      const preparation = await fetch("/api/applications/uploads", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ submissionId, documents: requested }), credentials: "same-origin", cache: "no-store" });
      const prepared: { uploads?: { kind: DocumentName; objectKey: string; uploadUrl: string; mimeType: string; size: number }[] } = await preparation.json();
      if (!preparation.ok || !prepared.uploads || prepared.uploads.length !== requested.length) throw new Error("Upload preparation failed.");
      await Promise.all(prepared.uploads.map(upload => fetch(upload.uploadUrl, { method: "PUT", headers: { "Content-Type": upload.mimeType, "x-upsert": "false" }, body: app.files[upload.kind]! }).then(response => { if (!response.ok) throw new Error("upload"); }).catch(() => { throw new Error("upload"); })));
      const response = await fetch("/api/applications", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ application: finalData.data, uploads: prepared.uploads.map(({ kind, objectKey, mimeType, size }) => ({ kind, objectKey, mimeType, size })) }), credentials: "same-origin", cache: "no-store" });
      const result: { reference?: string; message?: string; errorId?: string } = await response.json();
      if (!response.ok || !result.reference || !/^WHD-[A-F0-9]{8}$/.test(result.reference)) {
        setSubmitError(response.status === 429 ? "Too many attempts. Please wait 15 minutes before trying again." : submissionMessage(result.errorId));
        return;
      }
      app.clear(result.reference);
      router.replace("/apply/success");
    } catch (caught) {
      setSubmitError(caught instanceof Error && caught.message === "upload" ? "We couldn't upload one of your documents. Please try again." : "We couldn't submit your application. Please try again.");
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  if (checkingStep) return <div className="application-card loading-card" role="status">Preparing your application…</div>;
  const field = (name: keyof ApplicationValues, label: string, extra: Record<string, string> = {}, required = true) => <FormField key={name} id={name} name={name} label={label} value={String(app.values[name])} onChange={event => update(name, event.target.value)} error={errors[name]} required={required} disabled={pending} {...extra} />;
  return <article className="application-card">
    <div className="card-heading"><div><div className="card-kicker">LET’S GET TO KNOW YOU</div><h2>Job Application</h2><p>Complete the information below to submit your application.</p></div><span className="step-count">Step {step} of 2</span></div>
    <ProgressStepper step={step} />
    <form ref={form} onSubmit={submit} noValidate aria-busy={pending}>
      <div className="form-content">
        <div className="section-heading"><span className="section-icon">{step === 1 ? <UserRound size={19} /> : <BriefcaseBusiness size={19} />}</span><div><h3>{step === 1 ? "Personal Information" : "Employment Information"}</h3><p>{step === 1 ? "Start with the details that make you, you." : "Tell us about your experience and the role you’re looking for."}</p></div><span className="required-note"><span>*</span> Required fields</span></div>
        {step === 1 ? <>
          <div className="field-grid">
            {field("firstName", "First Name", { placeholder: "First name", autoComplete: "given-name", maxLength: "100" })}
            {field("lastName", "Last Name", { placeholder: "Last name", autoComplete: "family-name", maxLength: "100" })}
            {field("dateOfBirth", "Date of Birth", { type: "date", autoComplete: "bday", max: new Date().toISOString().slice(0, 10) })}
            {field("phone", "Phone Number", { type: "tel", placeholder: "(555) 555-0123", autoComplete: "tel", maxLength: "30" })}
            <div className="span-two">{field("email", "Email Address", { type: "email", placeholder: "you@example.com", autoComplete: "email", maxLength: "254" })}</div>
            <div className="span-two">{field("address", "Residential Address", { placeholder: "Street address, apartment, city, state and ZIP code", autoComplete: "street-address", maxLength: "300" })}</div>
          </div>
          <div className="section-divider" />
          <div className="section-heading identity-heading"><span className="section-icon"><LockKeyhole size={18} /></span><div><h3>Identity information</h3><p>For employment-related identity verification.</p></div><span className="private-label"><LockKeyhole size={12} /> Private</span></div>
          <div className="ssn-row"><FormField id="ssn" name="ssn" label="Social Security Number" sensitive required type="password" inputMode="numeric" autoComplete="off" data-1p-ignore data-lpignore="true" placeholder="XXX-XX-XXXX" maxLength={11} value={app.values.ssn} disabled={pending} onChange={event => { const digits = event.target.value.replace(/\D/g, "").slice(0, 9); update("ssn", digits.length > 5 ? `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}` : digits.length > 3 ? `${digits.slice(0, 3)}-${digits.slice(3)}` : digits); }} error={errors.ssn} hint="Your SSN is masked to keep it private." /><div className="ssn-guidance"><LockKeyhole size={15} /><p>Sensitive information is only accessible to authorized personnel.</p></div></div>
          <div className="field-grid document-grid"><FileUploadField name="idFront" label="Government-Issued ID — Front" file={app.files.idFront} error={errors.idFront} onChange={file => updateFile("idFront", file)} /><FileUploadField name="idBack" label="Government-Issued ID — Back" file={app.files.idBack} error={errors.idBack} onChange={file => updateFile("idBack", file)} /></div>
          <div className="document-tip"><Info size={14} /><span>Make sure all four corners are visible and the details are easy to read.</span></div>
          <PrivacyNotice />
          <div className="consent-field"><label><input id="consent" type="checkbox" checked={app.values.consent} onChange={event => update("consent", event.target.checked)} required aria-invalid={!!errors.consent} aria-describedby={errors.consent ? "consent-error" : undefined} /><span>{consentText} <span className="required">*</span></span></label>{errors.consent && <p id="consent-error" className="field-error">{errors.consent}</p>}</div>
        </> : <>
          <div className="completed-note"><span><Check size={16} /> Personal information complete</span><button type="button" disabled={pending} onClick={() => router.push("/apply")}>Edit details</button></div>
          <div className="field-grid employment-fields">{field("positionDesired", "Position Desired (Optional)", { placeholder: "e.g. Customer Support Specialist", autoComplete: "off", maxLength: "150" }, false)}{field("previousEmployer", "Previous Employer (Optional)", { placeholder: "Company name, or N/A if none", autoComplete: "organization", maxLength: "150" }, false)}</div>
          <div className="section-divider" />
          <div className="section-heading"><div><h3>Supporting documents</h3><p>Add your resume and any relevant tax documentation.</p></div></div>
          <FileUploadField name="resume" label="CV / Resume" optional file={app.files.resume} error={errors.resume} disabled={pending} onChange={file => updateFile("resume", file)} />
          <div className="tax-upload"><FileUploadField name="taxDocument" label="W-2 or 1099" optional file={app.files.taxDocument} error={errors.taxDocument} disabled={pending} onChange={file => updateFile("taxDocument", file)} /><p className="field-hint"><LockKeyhole size={12} /> Tax documents are sensitive and stored privately. This upload is optional.</p></div>
          <div className="submission-note"><ShieldIcon /><p><strong>Ready when you are.</strong><br />Please review your details before submitting. Your information will be handled according to the privacy notice you acknowledged.</p></div>
        </>}
        {Object.values(errors).some(Boolean) && <p className="form-error-summary" role="alert">Please check the highlighted fields before continuing.</p>}
        {submitError && <div className="submission-error" role="alert">{submitError}</div>}
      </div>
      <div className="form-actions">{step === 1 ? <span className="action-note"><LockKeyhole size={13} /> Your privacy comes first</span> : <button className="back-button" type="button" disabled={pending} onClick={() => router.push("/apply")}><ArrowLeft size={16} /> Back<span className="desktop-text"> to Personal Information</span></button>}<SubmitButton pending={pending}>{step === 1 ? "Continue to Employment Information" : "Submit Application"}</SubmitButton></div>
    </form>
  </article>;
}

function submissionMessage(errorId?: string) {
  return errorId ? `We couldn't submit your application. Please try again. If this continues, contact us with error ID ${errorId}.` : "We couldn't submit your application. Please try again.";
}

function ShieldIcon() { return <LockKeyhole size={20} aria-hidden="true" />; }
