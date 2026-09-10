# Render private scanner deployment

The Render services in `render.yaml` deliberately do not serve the website. Keep the Next.js application on Vercel and Supabase as the database and private object store.

## Services to create

Create these two services from the `main` branch, in the **same Render workspace and Frankfurt region**. If your Supabase project is closer to another supported Render region, change both `region` values in `render.yaml` to that region before creating the Blueprint.

| Render service | Type | Plan | Purpose |
| --- | --- | --- | --- |
| `workhiredesk-clamav` | Private Service | `1c-2g` | Runs ClamAV and FreshClam signature updates. It has no public URL. |
| `workhiredesk-document-scanner` | Background Worker | `0.5c-512mb` | Claims pending jobs, downloads private Supabase objects, and submits each scan verdict. It has no inbound address. |

The ClamAV plan needs enough memory for antivirus signatures and reloads. Do not use a free service for either production component.

## Dashboard deployment

1. Push the repository containing `render.yaml` to GitHub.
2. In Render, choose **New** → **Blueprint**, connect `princejemi9-rgb/WorkHireDesk`, select `main`, and review the two services Render discovers.
3. When prompted for secrets, set these values for **workhiredesk-document-scanner** only:

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL` | Your production Supabase project URL, for example `https://PROJECT_REF.supabase.co` |
   | `SUPABASE_SERVICE_ROLE_KEY` | The production Supabase **service_role** secret key |

   Do not set any Vercel-only encryption, session, rate-limit, or submission keys on the worker. Do not set `CLAMD_HOST`; the Blueprint injects Render’s internal hostname. Leave `CLAMD_PORT=3310`, `SCAN_BATCH_SIZE=10`, and `SCAN_INTERVAL_MS=60000` as defined in the Blueprint.
4. Confirm both services use Docker. For the private service, Render builds `docker/clamav.Dockerfile`; for the worker, it builds `docker/scanner.Dockerfile`.
5. Create the Blueprint. Wait for ClamAV to finish its first signature download and for its private-service TCP health check to pass. Then confirm the worker is running in its Logs tab.
6. In the ClamAV service’s **Connect** menu, confirm it displays an **Internal** address only. There must be no public `onrender.com` URL and no manually configured public port.
7. Upload a harmless synthetic PDF in staging and confirm it progresses from `pending` to `clean`. Then submit the EICAR test string only in a disposable staging project and confirm it becomes `rejected`. Never use EICAR or test malware in production applicant data.
8. In Render Logs, confirm signature updates and worker batches continue. Alert on service deploy failures, worker restarts, a growing pending queue, or any `failed` scan records. The worker intentionally keeps processing after a scanner error so subsequent jobs are recorded as `failed`, never `clean`.

## Security properties

`workhiredesk-clamav` is a Render Private Service, so only same-workspace, same-region Render services can access port 3310. The background worker receives its hostname through Render’s `fromService` reference and holds the only Supabase credentials. No secrets are stored in this repository or image.

The worker uses the existing `pending → scanning → clean/rejected/failed` RPC workflow. A connection error, timeout, incomplete ClamAV response, unsupported verdict, storage failure, or limit error resolves to `failed`; only an explicit `OK` response resolves to `clean`.
