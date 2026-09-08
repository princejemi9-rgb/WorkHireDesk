"use client";
import { useRouter } from "next/navigation";
export function LogoutButton() { const router = useRouter(); return <button className="logout-button" onClick={async () => { await fetch("/api/admin/logout", { method: "POST", credentials: "same-origin" }); router.push("/admin/login"); }}>Sign out</button>; }
