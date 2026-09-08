"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { ApplicationValues, DocumentName } from "@/validation/application";

const emptyValues: ApplicationValues = { firstName: "", lastName: "", dateOfBirth: "", address: "", email: "", phone: "", ssn: "", consent: false, positionDesired: "", previousEmployer: "" };
function useApplicationState() {
  const [values, setValues] = useState<ApplicationValues>(emptyValues);
  const [files, setFiles] = useState<Partial<Record<DocumentName, File>>>({});
  const [personalComplete, setPersonalComplete] = useState(false);
  const [reference, setReference] = useState<string | null>(null);
  const [submissionId, setSubmissionId] = useState<string | null>(null);
  function clear(referenceCode: string) {
    setValues({ ...emptyValues });
    setFiles({});
    setPersonalComplete(false);
    setSubmissionId(null);
    setReference(referenceCode);
  }
  return { values, setValues, files, setFiles, personalComplete, setPersonalComplete, reference, submissionId, setSubmissionId, clear };
}
const ApplicationContext = createContext<ReturnType<typeof useApplicationState> | null>(null);
export function ApplicationProvider({ children }: { children: ReactNode }) {
  const state = useApplicationState();
  return <ApplicationContext.Provider value={state}>{children}</ApplicationContext.Provider>;
}
export function useApplication() {
  const state = useContext(ApplicationContext);
  if (!state) throw new Error("Application provider is required.");
  return state;
}
