const REVEAL_TIMEOUT_MS = 15_000;

export async function requestSsnReveal(applicationId: string, timeoutMs = REVEAL_TIMEOUT_MS) {
 const controller = new AbortController();
 const timeout = setTimeout(() => controller.abort(), timeoutMs);
 try {
  const response = await fetch(`/api/admin/applications/${applicationId}/ssn`, {
   method: "POST", headers: { "x-confirm-ssn-reveal": "true" }, cache: "no-store", signal: controller.signal,
  });
  if (!response.ok) throw new Error("SSN reveal rejected");
  const data = await response.json() as { ssn?: unknown };
  if (typeof data.ssn !== "string" || !/^\d{3}-\d{2}-\d{4}$/.test(data.ssn)) throw new Error("Invalid SSN reveal response");
  return data.ssn;
 } finally {
  clearTimeout(timeout);
 }
}
