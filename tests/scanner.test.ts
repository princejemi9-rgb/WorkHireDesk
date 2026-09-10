import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanNextDocument } from '../src/server/scanner';
import { parseClamdResult } from "../src/server/clamav";

test("ClamAV result parsing only releases explicit clean verdicts", () => {
 assert.equal(parseClamdResult("stream: OK\u0000"), "clean");
 assert.equal(parseClamdResult("stream: Win.Test.EICAR_HDB-1 FOUND\u0000"), "rejected");
 for (const result of ["stream: INSTREAM size limit exceeded", "stream: ERROR", ""]) {
  assert.throws(() => parseClamdResult(result));
 }
});
test('scanner boundary fails closed on download failures, scanner errors and unknown verdicts',async t=>{
 process.env.SUPABASE_URL='https://test-project.supabase.co';process.env.SUPABASE_SERVICE_ROLE_KEY='synthetic-test-service-key-with-no-real-access';
 let outcome='clean',empty=false,downloadFails=false;const results:string[]=[];
 t.mock.method(globalThis,'fetch',async(input:string|URL|Request,init?:RequestInit)=>{
 const url=String(input);
 if(url.includes('claim_document_scan'))return Response.json(empty?null:{id:'synthetic',token:'lease',object_key:'synthetic/path'});
 if(url.includes('complete_document_scan')){results.push(JSON.parse(String(init?.body)).p_status);return Response.json(null);}
 if(url.includes('/storage/'))return downloadFails?Response.json({message:'Unavailable'},{status:400}):new Response('synthetic');
 throw new Error('Unexpected request');
 });
 const scanner={scan:async()=>{if(outcome==='error')throw new Error('Sensitive diagnostics');return outcome as 'clean'|'rejected';}};
 for(outcome of ['clean','rejected','error','unexpected'])assert.equal(await scanNextDocument(scanner),true);
 downloadFails=true;assert.equal(await scanNextDocument(scanner),true);
 empty=true;assert.equal(await scanNextDocument(scanner),false);
 assert.deepEqual(results,['clean','rejected','failed','failed','failed']);
});
