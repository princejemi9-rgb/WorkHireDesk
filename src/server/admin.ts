import "server-only";
import { redirect } from "next/navigation";
import { getAdminSession } from "./admin-session";
import { getServiceClient } from "./supabase";
import type { AdminFilters, ApplicationSearch } from "@/lib/admin-workflow";
import { z } from "zod";

export type ApplicationStatus = "received" | "reviewing" | "shortlisted" | "rejected";
export type AdminApplication = { id: string; reference_code: string; first_name: string; last_name: string; email: string; position_desired: string; status: ApplicationStatus; created_at: string; document_count: number; pending_documents: number };
export type AdminApplicationDetail = AdminApplication & { date_of_birth: string; address: string; phone: string; previous_employer: string; consent_timestamp: string; documents: { kind: string; scan_status: "pending" | "scanning" | "clean" | "rejected" | "failed"; created_at: string }[] };

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

export async function getIdentitySummary(userId:string,id:string) {
 const {decryptSsn}=await import("./encryption");const {getServerConfig}=await import("./config");
 const {data,error}=await getServiceClient().rpc("admin_ssn_envelope",{p_user_id:userId,p_application_id:id,p_reveal:false});
 if(error || !data)return "XXXX";
 try {const c=getServerConfig();return decryptSsn(data,id,c.SSN_ENCRYPTION_KEY_BASE64,c.SSN_ENCRYPTION_KEY_ID).slice(-4);}catch{return "XXXX";}
}
export async function getApplicationActivity(userId:string,id:string) {
 const {data,error}=await getServiceClient().rpc("admin_application_activity",{p_user_id:userId,p_application_id:id});
 if(error)throw new Error("Unable to load audit history.");
 return data as {staff_user_id:string;action:string;created_at:string}[];
}
