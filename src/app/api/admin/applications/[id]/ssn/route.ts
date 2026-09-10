import { z } from "zod";
import { authorizeAdminApi } from "@/server/admin-api";
import { isSameOrigin } from "@/server/request";
import { decryptSsn } from "@/server/encryption";
import { getServerConfig } from "@/server/config";
const headers = { "Cache-Control": "no-store, private", "Pragma":"no-cache", "Referrer-Policy":"no-referrer" };
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 if(!isSameOrigin(request,process.env.APP_ORIGIN)) return Response.json({message:"Invalid request."},{status:403,headers});
 try {
 const {session,client}=await authorizeAdminApi();
 const {id}=await params; z.uuid().parse(id);
 if(request.headers.get("x-confirm-ssn-reveal")!=="true") throw new Error("Confirmation required");
 const {data,error}=await client.rpc("admin_ssn_envelope",{p_user_id:session.userId,p_application_id:id,p_reveal:true});
 if(error || !data) throw new Error("Unavailable");
 const config=getServerConfig();
 const ssn=decryptSsn(data,id,config.SSN_ENCRYPTION_KEY_BASE64,config.SSN_ENCRYPTION_KEY_ID);
 return Response.json({ssn:`${ssn.slice(0,3)}-${ssn.slice(3,5)}-${ssn.slice(5)}`},{headers});
 } catch {return Response.json({message:"SSN unavailable. Please sign in again or contact your administrator."},{status:403,headers});}
}
