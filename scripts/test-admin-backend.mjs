import { createServer } from 'node:http';
import { createCipheriv } from 'node:crypto';
const id='11111111-1111-4111-8111-111111111111';
const staff='22222222-2222-4222-8222-222222222222';
const key=Buffer.alloc(32,7), nonce=Buffer.alloc(12,8);
const cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(Buffer.from(`workhiredesk:ssn:${id}:test-v1`));
const ciphertext=Buffer.concat([cipher.update('123456789'),cipher.final()]).toString('base64');
const envelope={algorithm:'aes-256-gcm',key_id:'test-v1',nonce:nonce.toString('base64'),ciphertext,tag:cipher.getAuthTag().toString('base64')};
let read=false;
const application={id,reference_code:'WHD-1234ABCD',first_name:'Synthetic',last_name:'Applicant',email:'synthetic@example.com',phone:'2025550123',date_of_birth:'1990-01-15',address:'Synthetic address',position_desired:'Engineer',previous_employer:'N/A',status:'received',created_at:'2026-09-10T10:00:00Z',consent_timestamp:'2026-09-10T10:00:00Z',document_count:4,documents:[{kind:'idFront'},{kind:'idBack'},{kind:'resume'},{kind:'taxDocument'}]};
createServer(async(req,res)=>{
 let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):{};
 res.setHeader('Content-Type','application/json');
 function send(data,status=200){res.statusCode=status;res.end(JSON.stringify(data));}
 if(req.url==='/health')return send({ok:true});
 if(req.url==='/auth/v1/user')return send({id:staff,email:'staff@example.com'});
 const rpc=req.url?.split('/').pop();
 if(rpc==='admin_is_staff')return send(true);
 if(rpc==='admin_get_application')return send(application);
 if(rpc==='admin_ssn_envelope')return send(envelope);
 if(rpc==='admin_application_activity')return send([{staff_user_id:staff,action:'view_application',created_at:application.created_at}]);
 if(rpc==='admin_notifications')return send({unread:read?0:1,items:[{application_id:id,...Object.fromEntries(['reference_code','first_name','last_name','position_desired','created_at'].map(k=>[k,application[k]])),read_at:read?application.created_at:null}]});
 if(rpc==='admin_read_notifications'){read=true;return send(null);}
 if(rpc==='admin_search_applications')return send({applications:[application],total:1,counts:{total:1,received:1,reviewing:0,shortlisted:0,rejected:0},positions:['Engineer']});
 if(rpc==='admin_get_document_for_download')return ['idFront','idBack','resume','taxDocument'].includes(body.p_kind)?send(`${id}/synthetic`):send({message:'Document unavailable'},400);
 if(req.url?.startsWith('/storage/v1/object/sign/'))return send({signedURL:'/object/sign/application-documents/synthetic?token=synthetic'});
 return send({message:'Unsupported synthetic endpoint'},404);
}).listen(4319,'127.0.0.1');
