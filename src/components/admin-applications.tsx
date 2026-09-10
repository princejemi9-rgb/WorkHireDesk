"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { adminFiltersSchema, statusLabels, type AdminFilters, type ApplicationSearch, type ApplicationStatus } from "@/lib/admin-workflow";

export function AdminApplications({ initial }: { initial: ApplicationSearch }) {
  const [result, setResult] = useState(initial);
  const [filters, setFilters] = useState(adminFiltersSchema.parse({}));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function search(next: AdminFilters) {
    if (pending) return;
    setPending(true); setError("");
    try {
      const response = await fetch("/api/admin/search", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      if (!response.ok) throw new Error();
      setResult(await response.json()); setFilters(next);
    } catch { setError("Unable to load applications. Please try again or sign in again."); }
    finally { setPending(false); }
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const parsed = adminFiltersSchema.safeParse({ ...form, page: 0 });
    if (!parsed.success) { setError("Enter a valid date range, with the start before the end."); return; }
    void search(parsed.data);
  }
  return <><div className="admin-title"><div><span className="eyebrow"><span /> APPLICATION INTAKE</span><h1>Applications</h1><p>Search, review, and manage applicant progress securely.</p></div><div className="admin-count"><strong>{result.counts.total}</strong><span>Total applications</span></div></div>
    <div className="admin-stats">{(Object.keys(statusLabels) as ApplicationStatus[]).map(status => <div key={status}><span>{statusLabels[status]}</span><strong>{result.counts[status]}</strong></div>)}</div>
    <form className="admin-filters" onSubmit={submit}>
      <label>Search<input name="query" maxLength={150} placeholder="Name, email, or reference" disabled={pending} /></label>
      <label>Status<select name="status" disabled={pending}><option value="">All statuses</option>{Object.entries(statusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select></label>
      <label>Position<select name="position" disabled={pending}><option value="">All positions</option>{result.positions.map(position => <option key={position}>{position}</option>)}</select></label>
      <label>From (UTC)<input name="dateFrom" type="date" disabled={pending} /></label><label>To (UTC)<input name="dateTo" type="date" disabled={pending} /></label>
      <div className="filter-actions"><button type="submit" disabled={pending}>{pending ? "Searching…" : "Apply filters"}</button><button type="reset" disabled={pending} onClick={() => void search(adminFiltersSchema.parse({}))}>Clear</button></div>
    </form>
    {error && <p className="login-error" role="alert">{error}</p>}
    <h2>Recent applications</h2><p role="status">{result.total} matching applications</p>
    <div className="admin-table-wrap" aria-busy={pending}><table><thead><tr><th>Applicant</th><th>Position</th><th>Received (UTC)</th><th>Documents</th><th>Status</th><th><span className="sr-only">View</span></th></tr></thead><tbody>{result.applications.length ? result.applications.map(item => <tr key={item.id}><td><strong>{item.first_name} {item.last_name}</strong><small>{item.reference_code}</small></td><td>{item.position_desired}</td><td>{new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(item.created_at))}</td><td>{item.document_count}<small>{item.document_count === 1 ? "document available" : "documents available"}</small></td><td><span className={`status status-${item.status}`}>{statusLabels[item.status]}</span></td><td><Link prefetch={false} className="table-link" href={`/admin/applications/${item.id}`}>Review</Link></td></tr>) : <tr><td colSpan={6} className="empty-state">No applications match these filters.</td></tr>}</tbody></table></div>
    <div className="admin-pagination"><button disabled={pending || filters.page === 0} onClick={() => void search({ ...filters, page: filters.page - 1 })}>Previous</button><span>Page {filters.page + 1} of {Math.max(1, Math.ceil(result.total / 25))}</span><button disabled={pending || (filters.page + 1) * 25 >= result.total} onClick={() => void search({ ...filters, page: filters.page + 1 })}>Next</button></div>
  </>;
}
