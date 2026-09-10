# Security and operations

## Request and data flow

The anonymous applicant uses React memory across `/apply` routes. Reloading or leaving the application clears the draft; browser history between the two steps retains it. No localStorage, sessionStorage, analytics, session replay, service worker, applicant login, public submission lookup, or client Supabase SDK is used. All fields including SSN arrive once via a same-origin HTTPS multipart POST. Native browser/password-manager behavior is outside application storage controls; SSN autocomplete is disabled.

The server validates shared Zod schemas, consent, all required documents, declared MIME, detected content signatures, individual size (1 MiB), and total body size (4 MiB + 64 KiB). PDF and DOCX resumes are supported; legacy DOC is intentionally excluded because its container cannot reliably establish that the upload is a Word document. JPEG, PNG and PDF are accepted for identification/tax documents. File signatures establish format, not safety or document authenticity.

Rate limits live in Postgres: five attempts per address per 15 minutes, with a global ceiling of 200. IP addresses are HMAC hashed with a dedicated secret and retained at most until the next cleanup after 24 hours. Production trusts only Vercel's `x-vercel-forwarded-for` edge header. Self-hosted production fails closed until an explicitly trusted edge adapter is implemented. Configure edge/WAF rules too: request-level limiting cannot prevent all distributed denial of service or automated applications.

The HTTP response contains only a reference code. Same-origin Origin and Fetch Metadata checks reject cross-origin POSTs. No wildcard CORS is enabled. Per-request nonces secure script execution; pages are dynamic and responses are no-store. No sensitive records or raw exceptions are logged by application code. Do not enable request-body capture in Vercel, proxies, APM, Supabase logging, or error-reporting tools. Restrict access to infrastructure logs because metadata can still contain connection information.

## SSN encryption and key management

`src/server/encryption.ts` uses Node's standard AES-256-GCM implementation, a fresh cryptographically random 96-bit nonce per encryption, and a 128-bit authentication tag. Additional authenticated data is `workhiredesk:ssn:<application UUID>:<key ID>`, binding ciphertext to its application and key version. Only digits are encrypted. The JSON envelope contains algorithm, key ID, nonce, ciphertext and tag; it never includes plaintext or a key.

Generate a random 32-byte key independently for each environment. Put the base64 value in `SSN_ENCRYPTION_KEY_BASE64` in the Vercel secret environment configuration (or your secret manager), never a `NEXT_PUBLIC_` variable, SQL migration, source file, browser, or log. Store `SSN_ENCRYPTION_KEY_ID` alongside it. Use separate random secrets for `SUBMISSION_HMAC_KEY` and `RATE_LIMIT_HMAC_KEY`. The submission fingerprint is an HMAC over the validated payload and document bytes, so stored fingerprints cannot be used to cheaply enumerate SSNs without the secret.

Keep a restricted, encrypted backup of each version of the SSN key outside the database. Losing a key makes its records unrecoverable. Rotate by deploying a new key ID/key for new submissions, retaining old versions in the secret manager, and running an authorized server-side migration that decrypts with the old AAD/key and re-encrypts with new nonces and key ID. Verify counts and recovery before retiring old keys. A future decryption service must select the correct key by ID, authenticate the tag/AAD, enforce staff authorization/MFA, and record only the action and record UUID. No decryption or admin endpoint is exposed in this pass.

This is application encryption, not a claim of a security certification. Service-role credentials can read database ciphertext and stored documents and must be tightly restricted. Production SSN plaintext necessarily exists briefly in applicant memory and server memory during submission; garbage-collected runtimes cannot promise immediate memory zeroization.

## Database, uploads and consistency

`job_applications` stores applicant metadata and server-generated consent timestamps. `private.application_secrets` stores the SSN envelope and fingerprint; `private.application_documents` stores generated UUID paths and quarantine status. Even ordinary metadata is private. All tables have RLS; applicant roles have no table/RPC grants. Service-only security-definer functions use a fixed empty search path. Do not add `private` to Supabase's exposed schemas.

All four document types use the private `application-documents` bucket. No public or signed URLs are created by the applicant flow. Object paths contain only UUIDs; original filenames are never sent to storage or recorded in the database. The restrictive storage policy blocks applicant access even in the presence of a broad permissive policy for other buckets.

Metadata, encrypted SSN and the document manifest commit in a single database transaction. An advisory lock serializes the submission UUID, and an HMAC fingerprint makes retries recover the same reference rather than inserting duplicates. A changed payload with a previously committed UUID is rejected. A lost response can be retried unchanged to recover its receipt.

Storage and Postgres are not one transaction. Failed uploads are cleaned up on a best-effort basis. After a database commit has started, uncertain network failures never trigger deletion that might destroy committed evidence. Schedule the included server-only reconciliation worker before launch: its service-only RPC reads object inventory, compares against `private.application_documents`, and returns only unreferenced objects older than 24 hours. The worker removes them through the Storage API, never direct deletion of `storage.objects` rows. It records counts only and defaults to dry run. This maintenance job is implemented but not deployed or scheduled by this repository.

## Staff portal boundary

The application server downloads and validates every uploaded object's size and actual file type before the submission is committed. Validated documents use `scan_status = validated`. The staff portal uses Supabase Auth, a server-verified `private.admin_staff` allowlist, encrypted httpOnly sessions, and audit records. It lists metadata, changes workflow status, and does not display SSNs, filenames, object paths, or plaintext encryption data. Never render original uploads inline.

The `private` schema intentionally has no direct access for `anon`, `authenticated`, or ordinary application roles. Staff changes use the service-only `public.admin_provision_staff` and `public.admin_revoke_staff` security-definer functions. They require an already active staff actor, require a confirmed email before activation, preserve the Auth user, prevent self-removal and removal of the final active staff member, and write `provision_admin` or `revoke_admin` audit events. Run these functions as `postgres` in the Supabase SQL Editor for an owner-approved handover; do not grant schema access or issue direct `private.admin_staff` writes.

The implemented document route verifies the active staff user and allowlist on every request, obtains the object key only through a security-definer function that requires `scan_status = validated`, records the action, then issues a 60-second signed attachment URL. It returns 404 for unauthorized, unknown, rejected, and failed documents. Do not log signed URLs. Do not add a generic service-role proxy or a public lookup by reference.

Applicant data retention/deletion, access reviews, backup recovery, incident handling and the lawful business purposes for requested fields must be configured by the project owner. Malware scanning and a scheduled reconciliation/retention worker are future enhancements; this release has no legal certification. Follow the launch checklist in README before collecting real applicant data.

## Platform references

- [Next.js CSP and nonce rendering](https://nextjs.org/docs/app/guides/content-security-policy)
- [Supabase storage access control](https://supabase.com/docs/guides/storage/security/access-control)
- [Supabase private buckets](https://supabase.com/docs/guides/storage/buckets/fundamentals)
- [Vercel request headers](https://vercel.com/docs/headers/request-headers)
- [Vercel function limits](https://vercel.com/docs/functions/limitations)
