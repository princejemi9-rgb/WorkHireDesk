import "server-only";
import { redirect } from "next/navigation";
import { getAdminSession } from "./admin-session";
import { getServiceClient } from "./supabase";
import type { AdminFilters, ApplicationSearch } from "@/lib/admin-workflow";
import { z } from "zod";

export type ApplicationStatus = "received" | "reviewing" | "shortlisted" | "rejected";
export type AdminApplication = { id: string; reference_code: string; first_name: string; last_name: string; email: string; position_desired: string; status: ApplicationStatus; created_at: string; document_count: number; pending_documents: number };
export type AdminApplicationDetail = AdminApplication & { date_of_birth: string; address: string; phone: string; previous_employer: string; consent_timestamp: string; documents: { kind: string; scan_status: "pending" | "clean" | "rejected"; created_at: string }[] };

export async function requireAdmin() {
  const session = await getAdminSession(); if (!session) redirect("/admin/login");
  const supabase = getServiceClient();
  const { data: userData, error: userError } = await supabase.auth.getUser(session.accessToken);
  if (userError || userData.user?.id !== session.userId) redirect("/admin/login");
  const { data, error } = await supabase.rpc("admin_is_staff", { p_user_id: session.userId });
  if (error || data !== true) redirect("/admin/login?reason=access");
  return session;
}
export async function getApplication(userId: string, id: string) {
  if (!z.uuid().safeParse(id).success) return null;
  const { data, error } = await getServiceClient().rpc("admin_get_application", { p_user_id: userId, p_application_id: id });
  if (error) throw new Error("Unable to load application.");
  if (!data) return null;
  return data as AdminApplicationDetail;
}
export async function searchApplications(userId: string, filters: AdminFilters): Promise<ApplicationSearch> {
  const { data, error } = await getServiceClient().rpc("admin_search_applications", {
    p_user_id: userId, p_query: filters.query || null, p_status: filters.status || null,
    p_position: filters.position || null, p_date_from: filters.dateFrom || null,
    p_date_to: filters.dateTo || null, p_page: filters.page,
  });
  if (error || !data || !Array.isArray(data.applications)) throw new Error("Unable to load applications.");
  return data as ApplicationSearch;
}
