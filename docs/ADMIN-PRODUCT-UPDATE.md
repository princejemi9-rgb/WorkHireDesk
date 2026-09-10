# Admin product update — deployment and verification

## Apply SQL

For an existing project with migrations 001–005 installed, run `supabase/migrations/202609100006_admin_product_updates.sql` in a transaction as the database owner. Do not rerun the first-time setup on an existing database. For a new project, use the regenerated `SUPABASE_SETUP.sql` OR all migrations in order. The migration retains private tables, RLS, service-role-only RPC permissions, quarantine defaults, mandatory ID front/back, and audit restrictions.

## Supabase and server configuration

Keep `application-documents` private, with its existing restrictive policies, 1 MB limit and MIME allowlist. Keep service credentials server-side. Apply the migration before deploying the UI; its final NOTIFY refreshes the PostgREST schema cache. No Realtime publication or browser Supabase credentials are needed.

Existing variables remain required: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_ORIGIN`, `ADMIN_SESSION_KEY_BASE64`, `SSN_ENCRYPTION_KEY_BASE64`, `SSN_ENCRYPTION_KEY_ID`, `RATE_LIMIT_HMAC_KEY`, and `SUBMISSION_HMAC_KEY`. Use HTTPS in production. Retain the encryption key and ID used for existing SSNs: this implementation rejects unknown key IDs rather than guessing a key. Multi-key rotation needs an explicit server-side keyring before retiring old keys.

Only active entries in `private.admin_staff` can use the new RPCs. API routes also validate the current Supabase Auth token. No new permission is granted to anonymous or ordinary authenticated users. Existing staff provisioning stays unchanged.

## Notifications

An AFTER INSERT trigger creates one notification in the same transaction as application submission. Failed submissions roll back the notification; idempotent retries create no duplicate. Notifications start with new submissions after this migration; historic applications are not backfilled. Database read receipts are per staff member and survive reloads. The bell refreshes every 30 seconds, lists up to 50 items with unread first, and counts all unread notifications. Staff can open the application, mark one read, or mark all read. Opening alone does not mark it read. Payloads contain only application ID/reference, applicant name, desired position, submission timestamp and read timestamp.

## SSN reveal

The detail page receives only the last four digits, decrypted on the server. An explicit confirmation triggers a same-origin POST with a confirmation header. The server verifies the live Auth user and active staff membership, then obtains the envelope through a staff-checked RPC that records `ssn_revealed` before releasing data. If auditing fails, nothing is revealed. The audit row contains staff ID, application ID and timestamp; no SSN or encryption envelope. A failed decryption can leave an audit entry recording the attempted release.

AES-256-GCM decryption checks the key ID and authenticates the application-bound AAD and tag. The response uses `Cache-Control: no-store, private`. Plaintext exists only in transient UI state; Hide, a 30-second timer, blur, visibility changes, page exit and unmount remove it. No browser storage is used. Recent-login step-up was considered: the existing session has expiry but no trusted authentication-time field, so no guessed recency check was added. Current token validity and membership are checked on every reveal. MFA/recent-auth step-up remains a possible additional deployment control.

## Documents and scanner deployment

Downloads remain blocked unless scan status is exactly `clean`. The existing server route checks Auth and the staff-scoped download RPC, records the download audit event, and creates a 60-second signed download URL. No storage paths appear in application JSON. The browser necessarily sees the temporary signed URL when following the redirect. This is a bearer link usable until expiry; an audit records each link issuance, not every reuse of that same URL within its lifetime.

`src/server/clamav.ts` implements a private-network ClamAV `INSTREAM` adapter, and `scripts/scan-documents.ts` processes up to `SCAN_BATCH_SIZE` jobs per run. `docker-compose.scanner.yml` supplies an isolated starting deployment with no public scanner port. A trusted worker claims one job, downloads the private object server-side, invokes the adapter and records the verdict. Unknown verdicts, exceptions and download failures become `failed`, never clean. Claims use row locks, random lease tokens and a ten-minute lease. Expired scanning jobs can be reclaimed, and stale results are rejected. Failed jobs stay blocked for operator investigation; requeue deliberately only after fixing the underlying issue. Scan transitions are persisted in `private.document_scan_events`.

Deploy the Compose stack or equivalent isolated worker with a private ClamAV `clamd` service and current signature updates through `freshclam`. The supplied worker processes a batch every 60 seconds. Configure `StreamMaxLength` above 10 MiB, bounded scan time below ten minutes, archive expansion limits, encrypted-document detection and limit-exceeded detection. Only an explicit complete clean result may return `clean`; scanner errors, unsupported/encrypted content and incomplete scans must not do so. Keep the daemon off public networks and protect worker service credentials. Treat uploaded objects as immutable; never overwrite a previously scanned object key. Monitor pending age, failed results and signature freshness. Validate the worker with EICAR in a disposable staging project before real document access is considered operational.

Primary deployment references: [ClamAV scanning](https://docs.clamav.net/manual/Usage/Scanning.html), [INSTREAM protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html), [daemon configuration](https://github.com/Cisco-Talos/clamav/blob/main/etc/clamd.conf.sample).

## Synthetic testing

`playwright.admin.config.ts` launches an isolated loopback backend containing only synthetic records and fixed test credentials. It overrides the real Supabase environment for that test server only. Authorized synthetic staff can view its clean resume; anonymous requests remain denied. This mechanism never marks any real Supabase object clean, and no production route or environment flag bypasses scanning. Database tests exercise synthetic scan transitions in an ephemeral PGlite instance. There is no need for a production-capable manual clean override.

Run `npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`, `npm.cmd run test:e2e`, and `npm.cmd exec playwright test -- --config=playwright.admin.config.ts`. Run the browser suites sequentially because Next development servers share the build directory. The synthetic browser tests verify application UX and API integration, while PGlite tests verify actual SQL authorization. Neither substitutes for testing deployed Supabase Auth, RLS and Storage together.

## Production blockers

Apply and verify the new live migration; deploy and validate the malware adapter/worker; verify live staff login, SSN decryption with existing keys, audit persistence and signed Storage downloads in staging. Local/synthetic tests alone do not establish production readiness. Final verification results are recorded below after the checks finish.

## Files changed

- `.gitignore`
- `SUPABASE_SETUP.sql`
- `eslint.config.mjs`
- `next.config.ts`
- `playwright.config.ts`
- `scripts/check-backend.mjs`
- `src/app/admin/applications/[id]/page.tsx`
- `src/app/admin/page.tsx`
- `src/app/globals.css`
- `src/components/application-form.tsx`
- `src/server/admin.ts`
- `src/server/encryption.ts`
- `src/validation/application.ts`
- `tests/database.test.ts`
- `tests/e2e/application.spec.ts`
- `tests/security.test.ts`
- `tests/submission.test.ts`
- `tsconfig.json`
- `docs/ADMIN-PRODUCT-UPDATE.md`
- `playwright.admin.config.ts`
- `scripts/test-admin-backend.mjs`
- `src/app/api/admin/applications/[id]/ssn/route.ts`
- `src/app/api/admin/notifications/route.ts`
- `src/components/admin-notifications.tsx`
- `src/components/ssn-reveal.tsx`
- `src/server/admin-api.ts`
- `src/server/scanner.ts`
- `supabase/migrations/202609100006_admin_product_updates.sql`
- `tests/e2e/admin-product.spec.ts`
- `tests/scanner.test.ts`

The pre-existing `.vercel` ignore and `.codex/` content were preserved; only the synthetic build-directory ignore was added to `.gitignore`.
