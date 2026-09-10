"use client";
import { useEffect, useRef, useState } from "react";
export function SsnReveal({applicationId,lastFour}:{applicationId:string;lastFour:string}) {
 const [ssn,setSsn]=useState<string>(); const [pending,setPending]=useState(false); const [error,setError]=useState("");
 const generation=useRef(0);
 useEffect(()=>{ const counter=generation; const hide=()=>{generation.current++;setSsn(undefined);}; window.addEventListener("blur",hide); document.addEventListener("visibilitychange",hide); window.addEventListener("pagehide",hide); return ()=>{counter.current++;window.removeEventListener("blur",hide);document.removeEventListener("visibilitychange",hide);window.removeEventListener("pagehide",hide);}; },[]);
 useEffect(()=>{if(ssn){const timer=setTimeout(()=>setSsn(undefined),30000);return ()=>clearTimeout(timer);}},[ssn]);
 async function reveal(){
 if(!window.confirm("This action will be logged. Reveal this applicant's SSN?"))return;
 const current=++generation.current;setPending(true);setError("");
 try {const response=await fetch(`/api/admin/applications/${applicationId}/ssn`,{method:"POST",headers:{"x-confirm-ssn-reveal":"true"},cache:"no-store"});if(!response.ok)throw new Error();const data=await response.json();if(current===generation.current && !document.hidden)setSsn(data.ssn);}
 catch{setError("Unable to reveal SSN. Please sign in again or contact your administrator.");}finally{setPending(false);}
 }
 return <div><h3>Social Security Number</h3><p className="ssn-value">{ssn || `\u2022\u2022\u2022-\u2022\u2022-${lastFour}`}</p>{ssn?<button type="button" onClick={()=>{generation.current++;setSsn(undefined);}}>Hide</button>:<button type="button" disabled={pending} onClick={reveal}>{pending?"Authorizing...":"Reveal SSN"}</button>}<p className="card-intro">Access is logged. Revealed numbers hide after 30 seconds or when you leave this window.</p>{error&&<p role="alert">{error}</p>}</div>;
}
