import { z } from "zod";

export const MAX_FILE_SIZE = 1024 * 1024;
export const MAX_REQUEST_SIZE = 4 * MAX_FILE_SIZE + 64 * 1024;
export const identityTypes = ["application/pdf", "image/jpeg", "image/png"];
export const resumeTypes = ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
export const documentNames = ["idFront", "idBack", "resume", "taxDocument"] as const;
export type DocumentName = typeof documentNames[number];

const text = (label: string, max = 100) => z.string().trim().min(1, `${label} is required.`).max(max, `${label} is too long.`).refine(v => !/[\u0000-\u001f\u007f]/.test(v), "Please remove unsupported characters.");
export const personalSchema = z.object({
  firstName: text("First name"),
  lastName: text("Last name"),
  dateOfBirth: z.string().refine(value => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const date = new Date(`${value}T00:00:00Z`);
    const today = new Date();
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date < today && date.getUTCFullYear() >= today.getUTCFullYear() - 120;
  }, "Enter a valid date of birth in the past."),
  address: text("Residential address", 300),
  email: z.email("Enter a valid email address.").max(254),
  phone: z.string().trim().max(30).refine(v => /^(1)?[2-9]\d{2}[2-9]\d{6}$/.test(v.replace(/[\s()+.-]/g, "")), "Enter a valid U.S. phone number."),
  ssn: z.string().regex(/^\d{3}-?\d{2}-?\d{4}$/, "Enter a 9-digit Social Security Number.").refine(v => {
    const digits = v.replace(/-/g, "");
    return !/^(000|666|9\d\d)/.test(digits) && digits.slice(3, 5) !== "00" && digits.slice(5) !== "0000";
  }, "Enter a valid Social Security Number."),
  consent: z.boolean().refine(v => v, "Please acknowledge the privacy notice to continue."),
});
export const employmentSchema = z.object({
  positionDesired: text("Position desired", 150),
  previousEmployer: text("Previous employer", 150),
});
export const finalSubmissionSchema = personalSchema.extend(employmentSchema.shape).extend({ submissionId: z.uuid() });
export type PersonalValues = z.infer<typeof personalSchema>;
export type EmploymentValues = z.infer<typeof employmentSchema>;
export type ApplicationValues = PersonalValues & EmploymentValues;

export function fileError(file: File | undefined, name: DocumentName): string | undefined {
  if (!file || file.size === 0) return name === "taxDocument" ? undefined : "Please select a file.";
  if (file.size > MAX_FILE_SIZE) return "Choose a file smaller than 1 MB.";
  const types = name === "resume" ? resumeTypes : identityTypes;
  if (!types.includes(file.type)) return name === "resume" ? "Choose a PDF or DOCX file." : "Choose a PDF, JPG, or PNG file.";
}
