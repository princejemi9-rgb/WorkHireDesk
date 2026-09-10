"use client";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useCallback,useEffect,useState } from "react";
type Notice={application_id:string;first_name:string;last_name:string;reference_code:string;position_desired:string;created_at:string;read_at:string|null};
export function AdminNotifications(){
 const [data,setData]=useState<{unread:number;items:Notice[]}>({unread:0,items:[]});const [error,setError]=useState("");
 const refresh=useCallback(async()=>{try{const r=await fetch("/api/admin/notifications",{cache:"no-store"});if(!r.ok)throw new Error();setData(await r.json());setError("");}catch{setError("Notifications unavailable.");}},[]);
 useEffect(()=>{const initial=setTimeout(()=>void refresh(),0);const timer=setInterval(()=>void refresh(),30000);return ()=>{clearTimeout(initial);clearInterval(timer);};},[refresh]);
 async function read(applicationId:string|null){try{const r=await fetch("/api/admin/notifications",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({applicationId})});if(!r.ok)throw new Error();await refresh();}catch{setError("Unable to mark notifications read.");}}
 return <details className="notifications"><summary aria-label={`Notifications, ${data.unread} unread`}><Bell size={19}/><span>{data.unread}</span></summary><section className="notification-panel"><h2>New applications</h2><button onClick={()=>void read(null)}>Mark all as read</button>{error&&<p role="alert">{error}</p>}{!data.items.length&&!error&&<p>No new applications.</p>}<ul>{data.items.map(n=><li key={n.application_id} className={n.read_at?"":"unread"}><Link href={`/admin/applications/${n.application_id}`}><strong>{n.first_name} {n.last_name}</strong><span>{n.reference_code} {"\u00b7"} {n.position_desired}</span><time>{new Date(n.created_at).toLocaleString()}</time></Link>{!n.read_at&&<button onClick={()=>void read(n.application_id)}>Mark read</button>}</li>)}</ul><p>Latest 50 notifications; unread shown first.</p></section></details>;
}
