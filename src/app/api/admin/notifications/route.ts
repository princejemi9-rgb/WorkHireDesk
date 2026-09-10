import { z } from "zod";
import { authorizeAdminApi } from "@/server/admin-api";
import { isSameOrigin } from "@/server/request";
const headers = { "Cache-Control": "no-store" };
export async function GET() {
 try { const {session,client}=await authorizeAdminApi();
 const {data,error}=await client.rpc("admin_notifications",{p_user_id:session.userId});
 if(error) throw error; return Response.json(data,{headers});
 } catch { return Response.json({message:"Notifications unavailable."},{status:403,headers}); }
}
export async function POST(request:Request) {
 if(!isSameOrigin(request,process.env.APP_ORIGIN)) return Response.json({message:"Invalid request."},{status:403,headers});
 try { const {session,client}=await authorizeAdminApi();
 const body=z.object({applicationId:z.uuid().nullable()}).strict().parse(await request.json());
 const {error}=await client.rpc("admin_read_notifications",{p_user_id:session.userId,p_application_id:body.applicationId});
 if(error) throw error; return Response.json({ok:true},{headers});
 } catch { return Response.json({message:"Unable to update notifications."},{status:403,headers}); }
}
