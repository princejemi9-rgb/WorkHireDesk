import "server-only";

export function isSameOrigin(request: Request, origin: string | undefined) {
  if (!origin) return false;
  try {
    return request.headers.get("origin") === new URL(origin).origin && [null, "same-origin"].includes(request.headers.get("sec-fetch-site"));
  } catch { return false; }
}
