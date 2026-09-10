# WorkHireDesk

Mobile-first, two-step job application built with Next.js App Router, TypeScript, Tailwind CSS, Zod and Supabase. The starting workspace was empty. All code in this repository was added for this project.

## Run locally

Use Node.js 24 LTS and npm. In Windows PowerShell, use `npm.cmd` if script execution policy blocks `npm.ps1`.

```sh
npm ci
npm run dev
```

Open http://localhost:3000/apply. The UI works without credentials. Submissions fail closed until you configure the backend; there are no simulated production submissions.

Copy `.env.example` to `.env.local` and replace all placeholders using credentials from a dedicated development Supabase project. Never commit `.env.local`. Generate each independent secret using a trusted password/secret manager; the encryption key must be exactly 32 random bytes encoded as base64. All configuration is server-only.

## Routes and files

| Path | Purpose |
| --- | --- |
| `/apply` | Personal information, masked SSN, ID uploads, exact client privacy notice and consent |
| `/apply/employment` | Position, employer, resume and optional tax upload |
| `/apply/success` | In-memory receipt; direct visits never claim a successful submission |
| `/privacy` | Privacy and security notice |
| `src/components` | Reusable shell, stepper, fields, uploads, consent and success UI |
| `src/validation/application.ts` | Shared personal, employment, final and upload validation |
| `src/app/api/applications/route.ts` | Same-origin, rate-limited server submission |
| `src/server` | Server-only Supabase client, encryption, request limits and file inspection |
| `supabase/migrations` | Metadata/private schemas, RLS, private bucket and service-only RPCs |
| `supabase/tests/access.sql` | Database security assertions for a disposable project |
| `scripts/reconcile-documents.ts` | Dry-run/default cleanup of abandoned uploads |
| `docs/SECURITY.md` | Key management, trust boundaries, admin architecture and operations |

Drafts live only in memory and survive back/forward navigation between form steps. Refreshing or leaving the application loses the draft. ID/tax uploads accept PDF/JPEG/PNG; resumes accept PDF/DOCX. Legacy `.doc` is excluded.

Each file is limited to 10 MiB. The browser first requests server-authorized, one-time object paths and signed upload URLs, uploads directly to the private quarantine bucket, then sends only upload metadata to the application server. The server downloads and validates the completed bytes before committing the application. Files remain pending and unavailable to staff until malware scanning marks them clean. Service credentials never reach the browser.

## Supabase setup (manual)

1. Create a dedicated project and choose its region according to your organization's data requirements. Enable appropriate backup/recovery and access restrictions.
2. For a new project, open `SUPABASE_SETUP.sql`, paste the entire file into a new query, and run it as `postgres`. It applies all four migrations in order and verifies access restrictions in one transaction. Alternatively, apply the individual files in chronological order using a linked Supabase CLI. Choose one method; do not run both against an already configured database. SQL Editor setup does not record CLI migration history, so baseline it before later adopting the CLI.
3. Confirm `application-documents` is **private**, its size/type restrictions are present, RLS is enabled, and neither `anon` nor `authenticated` can read applicant tables or call intake RPCs. Run `supabase/tests/access.sql` against a disposable/staging project.
4. Keep the `private` schema outside Data API exposed schemas. Copy the project URL and server service-role key into server environment variables. No anon/browser key is needed by this implementation.
5. Configure and schedule the reconciliation command below. Set your retention/deletion policy before collection and implement its scheduled worker. Restrict database/storage access to staff with a documented business need.

Run `npm run supabase:check` after setup. This makes read-only checks of the application table, required RPCs, and the private bucket's size/type restrictions. It does not read applicant records, submit applications, or print credentials. Regenerate the combined setup file with `npm run supabase:prepare` whenever the migrations change.

## Admin portal setup

The staff portal is available at `/admin`, but it remains locked until you explicitly authorize staff. It has dashboard totals, search, status/position/date filters, pagination, application details, password recovery, email verification, logout, and audited workflow changes. It never displays an SSN, original filename, or storage path.

1. For the already configured project, run `ADMIN_PORTAL_SETUP.sql`, then `ADMIN_WORKFLOW_SETUP.sql`, then `ADMIN_PROVISIONING_SETUP.sql`, in that order. Do not rerun `SUPABASE_SETUP.sql`. Regenerate the setup files with their matching `npm run admin:*:prepare` command if a migration changes.
2. In Supabase Authentication, create an email/password user for each staff member and require email confirmation. Enforce MFA before granting production staff access.
3. Staff provisioning is deliberately restricted to audited security-definer functions. Do not grant access to `private`, change RLS, or insert into `private.admin_staff` directly. In Supabase SQL Editor, run the following as `postgres`, replacing both placeholders. The actor must already be an active staff user and the target must have a confirmed email:

```sql
select public.admin_provision_staff(
  'CURRENT_ACTIVE_ADMIN_AUTH_USER_UUID',
  'CONFIRMED_NEW_STAFF_AUTH_USER_UUID'
);
```

4. Verify the new staff member can sign in at `/admin/login`, view the dashboard, and complete a non-destructive workflow check. Keep the current admin active until this succeeds.
5. After verification, run the following as `postgres` to deactivate the departing admin. This keeps the Auth account and audit history; it only removes WorkHireDesk staff access. The function refuses self-revocation and removal of the last active staff member.

```sql
select public.admin_revoke_staff(
  'VERIFIED_REMAINING_ADMIN_AUTH_USER_UUID',
  'DEPARTING_ADMIN_AUTH_USER_UUID'
);
```

6. Keep `ADMIN_SESSION_KEY_BASE64` secret and copy it to the deployment environment with the other server-only variables.

### Staff email verification and passwords

In Supabase Authentication → Providers → Email, turn on **Confirm email**. In Authentication → URL Configuration, set the production Site URL to the canonical HTTPS domain and add these exact redirect URLs: `https://YOUR_DOMAIN/admin/verify-email` and `https://YOUR_DOMAIN/admin/reset-password`; also add their localhost equivalents for local testing. Configure a trusted SMTP provider before production; Supabase's default email service is for limited testing only. Use Supabase's confirmation and recovery templates with `{{ .ConfirmationURL }}` so the configured redirect is preserved. Unconfirmed staff accounts are routed to `/admin/verify-email`, where they can request another confirmation email.

Staff can change only their own password from `/admin/account`. The form verifies the current password, requires 12+ characters with upper-case, lower-case, number, and symbol, then clears the secure staff session. Password changes never use the service-role key to set a password.

The staff sign-in screen also has **Forgot password?**. Its recovery request always returns the same message whether or not an account exists. The Supabase recovery email points to `/admin/reset-password`; its token stays in the browser URL fragment and is removed before the new password is sent to the server for verification and update.

After the SQL runs, use `npm run supabase:check` again; every `admin_*` function check must report ready. Then sign in with a confirmed, allowlisted staff user and verify search, a status change, password reset, email verification, and a clean-document download in staging. A document only receives a download link after an external scanner safely marks it `clean`; the scanner itself is not in this repository.

## Vercel setup (manual)

1. Import this repository as a Next.js project. Use Node 24, `npm ci`, and `npm run build`.
2. Add each `.env.example` variable in the appropriate environment. Set `APP_ORIGIN` to the exact canonical HTTPS origin (for example `https://workhiredesk.com`), with no path. Use separate secrets/projects for development and production. Never use `NEXT_PUBLIC_` for service or encryption secrets.
3. Configure WorkHireDesk.com and its DNS. Redirect alternate domains to the canonical origin. Set a separate matching `APP_ORIGIN` for protected preview deployments if submission tests are needed there.
4. Enable Vercel system environment variables (`VERCEL=1` is used to select the trusted edge IP header). Production outside Vercel deliberately rejects submissions until its trusted proxy adapter is implemented.
5. Configure WAF/edge rate limits, restrict deployment/admin access, and disable request-body capture, session replay, and sensitive payload logging in all infrastructure integrations. The application adds no analytics.
6. Run a staging submission with synthetic data; verify private storage, encrypted SSN, consent timestamp, the receipt and unchanged retry behavior. Verify denied anonymous reads/downloads with actual Supabase credentials. Do not use real applicant information for tests.
7. Deploy and monitor a malware-scanning service before staff downloads are enabled. The schema records `pending` by default. The implemented download endpoint authorizes an active staff session on every request, records the action, and redirects only clean files to 60-second signed attachment URLs. Nothing in this repository performs the scan or promotes a document to `clean`.

No Supabase project, credentials, DNS change, Vercel deployment or external scheduled job is created automatically by this repository.

## Verification

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

Browser tests use installed Google Chrome locally and Playwright Chromium in CI (`npx playwright install chromium`). They use synthetic fixtures and intercept responses **only inside tests**. They verify both applicant steps, errors, back navigation, optional uploads, receipt behavior, desktop/mobile layout and empty browser storage. Unit/integration tests check dates/contact details/consent, GCM binding and nonce uniqueness, MIME spoofing, request size/origin checks, encrypted submission payloads, unchanged retries, rate limiting, email redirect construction, audit records, admin authorization, search filters, statuses, and clean-download gating. A local PGlite PostgreSQL test applies all migrations unchanged against a minimal Supabase storage/role scaffold. Supabase HTTP calls in automated integration tests are isolated test doubles; real database/storage/Auth integration must be verified in staging.

For a production browser check, build first, set `E2E_PRODUCTION=1`, and run `npm run test:e2e` with no existing development server on port 3000.

## Abandoned upload maintenance

With `.env.local` loaded on a trusted worker, run:

```sh
npm run reconcile:documents
npm run reconcile:documents -- --delete
```

The first command is a dry run. The second deletes up to 100 unreferenced objects older than 24 hours through the Storage API. Schedule hourly and monitor count-only failures; if the batch reaches 100, rerun until the backlog is cleared. A worker with injected environment variables can run `node --conditions=react-server --import tsx scripts/reconcile-documents.ts --delete` instead. The cleanup worker needs only SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY; it does not require the SSN encryption key. Do not publish this worker as an anonymous endpoint.

Review [the full security design](docs/SECURITY.md), especially key recovery/rotation and the future admin boundary, before accepting real applicant data.

Platform guidance: [Next.js installation](https://nextjs.org/docs/app/getting-started/installation), [Supabase storage access control](https://supabase.com/docs/guides/storage/security/access-control), and [Vercel function limits](https://vercel.com/docs/functions/limitations).
