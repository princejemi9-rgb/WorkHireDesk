import { z } from "zod";

export const statusLabels = { received: "New", reviewing: "Reviewing", shortlisted: "Shortlisted", rejected: "Rejected" } as const;
export type ApplicationStatus = keyof typeof statusLabels;
export const adminFiltersSchema = z.object({
  query: z.string().trim().max(150).default(""),
  status: z.enum(["", "received", "reviewing", "shortlisted", "rejected"]).default(""),
  position: z.string().trim().max(150).default(""),
  dateFrom: z.union([z.literal(""), z.iso.date()]).default(""),
  dateTo: z.union([z.literal(""), z.iso.date()]).default(""),
  page: z.number().int().min(0).max(100000).default(0),
}).refine(value => !value.dateFrom || !value.dateTo || value.dateFrom <= value.dateTo, { message: "Start date must be before the end date." });
export type AdminFilters = z.infer<typeof adminFiltersSchema>;
export type ApplicationRow = { id: string; reference_code: string; first_name: string; last_name: string; position_desired: string; status: ApplicationStatus; created_at: string; document_count: number; pending_documents: number };
export type ApplicationSearch = { applications: ApplicationRow[]; total: number; counts: Record<ApplicationStatus | "total", number>; positions: string[] };
