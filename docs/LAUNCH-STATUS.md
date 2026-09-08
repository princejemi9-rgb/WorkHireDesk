# Launch status — September 8, 2026

The supplied Supabase server credentials now connect successfully to the project's live Data API. `.env.local` contains the normalized project URL, the supplied server key, and the existing encryption/HMAC keys. Neither environment file is tracked by Git.

The read-only live check found that the application table, required RPCs, and private document bucket are not ready yet. The combined `SUPABASE_SETUP.sql` file is prepared for the Supabase SQL Editor; the provided API key cannot execute arbitrary database migrations. No live applicant records were read or written during verification.

Remaining sequence:

1. Run the prepared SQL in the project's SQL Editor with the postgres role.
2. Run `npm run supabase:check` and verify all checks report ready.
3. Verify a synthetic end-to-end submission against this backend and remove only the test records/documents afterward.
4. Connect the project to Vercel, set server environment variables and the canonical HTTPS APP_ORIGIN, configure the domain, then verify the deployed flow.
5. Schedule cleanup and configure retention; implement scanning and staff authorization before exposing documents through a future admin dashboard.

Vercel account/deployment access has not been configured in this workspace. The site is not publicly deployed yet.

The combined setup file passed the local PostgreSQL transaction/access tests (6 backend tests passed). No live migrations have been run by this workspace.
