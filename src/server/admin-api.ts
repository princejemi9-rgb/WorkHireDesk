import "server-only";
import { getAdminSession } from "./admin-session";
import { getServiceClient } from "./supabase";
export async function authorizeAdminApi() {
 const session = await getAdminSession();
 if (!session) throw new Error("Unauthorized");
 const client = getServiceClient();
 const { data, error } = await client.auth.getUser(session.accessToken);
 if (error || data.user?.id !== session.userId) throw new Error("Unauthorized");
 const staff = await client.rpc("admin_is_staff", { p_user_id: session.userId });
 if (staff.error || staff.data !== true) throw new Error("Unauthorized");
 return { session, client };
}
