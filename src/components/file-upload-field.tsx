"use client";
import { useRef, useState, type DragEvent } from "react";
import { Upload, FileCheck2, X, AlertCircle } from "lucide-react";
import { fileError, type DocumentName } from "@/validation/application";

type Props = { name: DocumentName; label: string; file?: File; error?: string; optional?: boolean; disabled?: boolean; onChange: (file?: File) => void };
export function FileUploadField({ name, label, file, error, optional, disabled, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [selectionError, setSelectionError] = useState<string>();
  const visibleError = selectionError || error;
  const resume = name === "resume";
  function choose(next?: File) {
    if (disabled) return;
    const problem = next ? fileError(next, name) : undefined;
    setSelectionError(problem);
    if (!problem) onChange(next);
    if (input.current) input.current.value = "";
  }
  function drop(event: DragEvent) { event.preventDefault(); setDragging(false); if (event.dataTransfer.files.length > 1) setSelectionError("Please select one file at a time."); else choose(event.dataTransfer.files[0]); }
  return <div className="field upload-field"><label id={`${name}-label`} htmlFor={name}>{label} {optional ? <span className="optional-badge">Optional</span> : <span className="required">*</span>}</label>
    <div className={`upload-area ${dragging ? "dragging" : ""} ${file ? "has-file" : ""} ${visibleError ? "upload-error" : ""}`} onDragOver={event => { event.preventDefault(); if (!disabled) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop}>
      <input ref={input} id={name} type="file" className="sr-only" accept={resume ? ".pdf,.docx" : ".pdf,.jpg,.jpeg,.png"} disabled={disabled} aria-labelledby={`${name}-label`} aria-required={!optional} aria-invalid={!!visibleError} aria-describedby={`${name}-help${visibleError ? ` ${name}-error` : ""}`} onChange={event => choose(event.target.files?.[0])} />
      <span className="upload-icon">{file ? <FileCheck2 size={21} /> : <Upload size={21} />}</span>
      {file ? <><p className="selected-file">{file.name}</p><p className="upload-help">{Math.ceil(file.size / 1024)} KB · Ready to submit</p><div className="upload-actions"><button type="button" disabled={disabled} onClick={() => input.current?.click()}>Replace file</button><button type="button" disabled={disabled} onClick={() => choose()} aria-label={`Remove ${label}`}><X size={13} /> Remove</button></div></> : <><p className="upload-prompt"><button type="button" disabled={disabled} onClick={() => input.current?.click()}>Click to upload</button><span> or drag and drop</span></p><p className="upload-help" id={`${name}-help`}>{resume ? "PDF or DOCX" : "PDF, JPG or PNG"} · Max. 1 MB</p></>}
      {file && <span id={`${name}-help`} className="sr-only">{resume ? "PDF or DOCX" : "PDF, JPG or PNG"}, maximum 1 MB.</span>}
    </div>
    {visibleError && <p id={`${name}-error`} className="field-error" role="alert"><AlertCircle size={13} />{visibleError}</p>}
  </div>;
}
