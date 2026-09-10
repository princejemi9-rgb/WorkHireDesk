import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { POST } from "../src/app/api/applications/route";
test("finalization validates direct private uploads before saving the application",async t=>{
 const id=randomUUID(),pdf=Buffer.from("%PDF-1.4\n% synthetic fixture\n%%EOF"),application={submissionId:id,firstName:"Synthetic",lastName:"Applicant",dateOfBirth:"1990-01-15",address:"Test address",email:"test@example.com",phone:"2025550123",ssn:"123-45-6789",consent:true,positionDesired:"Engineer",previousEmployer:"N/A"};
 const uploads=["idFront","idBack"].map(kind=>({kind,objectKey:`${id}/${randomUUID()}`,mimeType:"application/pdf",size:pdf.length}));
 process.env.APP_ORIGIN="http://localhost:3000";process.env.SUPABASE_URL="https://test-project.supabase.co";process.env.SUPABASE_SERVICE_ROLE_KEY="synthetic-test-service-key-with-no-real-access";process.env.SSN_ENCRYPTION_KEY_BASE64=randomBytes(32).toString("base64");process.env.SSN_ENCRYPTION_KEY_ID="test-v1";process.env.RATE_LIMIT_HMAC_KEY=randomBytes(32).toString("hex");process.env.SUBMISSION_HMAC_KEY=randomBytes(32).toString("hex");
 const calls:string[]=[];t.mock.method(globalThis,"fetch",async (input: string | URL | Request)=>{const url=String(input);calls.push(url);if(url.includes("lookup_application_receipt"))return Response.json(null);if(url.includes("submit_job_application"))return Response.json({reference:"WHD-1234ABCD",created:true});if(url.includes("/storage/v1/object/"))return new Response(pdf,{headers:{"content-type":"application/pdf"}});throw new Error("Unexpected request");});
 const result=await POST(new Request("http://localhost:3000/api/applications",{method:"POST",headers:{origin:"http://localhost:3000","content-type":"application/json"},body:JSON.stringify({application,uploads})}));
 assert.equal(result.status,200);assert.deepEqual(await result.json(),{reference:"WHD-1234ABCD"});assert.ok(calls.some(url=>url.includes("submit_job_application")));assert.ok(!calls.some(url=>url.includes(application.ssn)));
});
