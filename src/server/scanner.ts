import "server-only";
import { DOCUMENT_BUCKET, getServiceClient } from "./supabase";
// Run in a trusted, isolated worker. The adapter must scan the entire immutable object.
export interface MalwareScanner { scan(bytes: Uint8Array): Promise<"clean" | "rejected"> }
export async function scanNextDocument(scanner: MalwareScanner) {
 const client=getServiceClient();
 const {data:job,error}=await client.rpc("claim_document_scan");
 if(error)throw new Error("Unable to claim scan.");
 if(!job)return false;
 let status:"clean"|"rejected"|"failed"="failed";
 try {
  const {data,error}=await client.storage.from(DOCUMENT_BUCKET).download(job.object_key);
  if(error || !data || data.size>10*1024*1024)throw new Error("Document unavailable.");
  const verdict=await scanner.scan(new Uint8Array(await data.arrayBuffer()));
  if(verdict==="clean" || verdict==="rejected")status=verdict;
 } catch { /* No document contents, paths, or scanner diagnostics in logs. */ }
 const result=await client.rpc("complete_document_scan",{p_document_id:job.id,p_token:job.token,p_status:status});
 if(result.error)throw new Error("Unable to record scan result.");
 return true;
}
