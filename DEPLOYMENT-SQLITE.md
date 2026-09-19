# Optional SQLite deployment on Railway

This is the retained SQLite profile. For the configured Supabase backend, use [DEPLOYMENT-RAILWAY.md](DEPLOYMENT-RAILWAY.md).

Target address: **https://ops.atollcommons.org**.

The application is packaged as a standalone Node.js service. Railway builds the root `Dockerfile`; `railway.json` configures the startup health check and one replica. Cloudflare Workers, D1, R2, and the Sites sign-in dispatcher are no longer required at runtime. The retained `.openai/hosting.json` and `wrangler.local.json` describe the original pilot only.

## Before the first deployment

1. Create a Railway service from this repository (or upload it with the Railway CLI). Keep its root directory at the directory containing `Dockerfile` and `railway.json`.
2. **Attach a persistent volume at `/data` before starting the service.** Both `atoll.sqlite` and the `files/` directory live there. Do not use the container's temporary filesystem for organizational records. Leave the service at one replica; do not enable serverless sleeping.
3. Create a Google OAuth **Web application** client. Use only the `openid`, `email`, and `profile` sign-in scopes. Register this exact authorized redirect URI:

   `https://ops.atollcommons.org/auth/callback`

   If the Google consent screen remains in Testing, add the intended accounts as test users. Choose an Internal audience only if all intended users belong to your Google Workspace organization; otherwise configure the appropriate External audience. The app's own membership list independently restricts access. See [Google's sign-in setup](https://developers.google.com/identity/gsi/web/guides/get-google-api-clientid) and [OIDC redirect requirements](https://developers.google.com/identity/openid-connect/reference).

4. Add these **runtime service variables** in Railway:

   | Variable | Value |
   | --- | --- |
   | `APP_URL` | `https://ops.atollcommons.org` |
   | `DATA_DIR` | `/data` |
   | `OWNER_EMAIL` | Your exact Google account email; the initial administrator |
   | `GOOGLE_CLIENT_ID` | The OAuth Web client ID |
   | `GOOGLE_CLIENT_SECRET` | Its client secret |

   The image sets `NODE_ENV=production` and `HOST=0.0.0.0`. Railway supplies `PORT` and the volume mount variable. Do not set `AUTH_MODE=development` in Railway. Do not expose secrets through `VITE_*`, `NEXT_PUBLIC_*`, Git, Docker build arguments, or chat messages. The app uses random, server-stored session tokens and does not require a shared password or a session-signing secret.

5. Add **`ops.atollcommons.org`** under the service's custom domains. At the DNS provider for `atollcommons.org`, create the `ops` **CNAME** using the exact target Railway displays. Add any ownership-verification record Railway requests. Do not guess the CNAME target or change the apex domain's existing website/mail records. Wait for Railway's domain verification and HTTPS certificate to become active. [Railway networking documentation](https://docs.railway.com/networking/public-networking).
6. Deploy. The startup command applies versioned migrations, checks storage, then starts the app on Railway's port. `/api/health` must return HTTP 200 before Railway routes traffic. It intentionally returns no organizational data. Missing storage, required settings, or migration errors prevent startup. [Railway health checks](https://docs.railway.com/deployments/healthchecks).
7. Sign in at the target address using `OWNER_EMAIL`. A new installation starts with clearly marked sample records. Assign colleagues in **Organization & settings → Users & roles**, using their exact Google account emails. Assigning a role does not send email. Governance authority remains a separate recorded appointment.
8. Enable scheduled volume backups in Railway's **Backups** panel. Keep an independent verified application backup before major upgrades. Railway supports scheduled volume backups, including SQLite data. [Railway backups](https://docs.railway.com/volumes/backups).

No Railway project, Google OAuth client, DNS record, or hosted deployment has been created by these source changes. Google sign-in must still be tested with the real configured client.

## Existing pilot records

The original local data under `.wrangler/state` has not been changed or shipped in the container. Decide whether to start with fresh sample data or migrate that pilot before entering real records in Railway.

The importer reads the original database without modifying it, copies every workspace and membership, and changes the one original system-owner login email to the new `OWNER_EMAIL`. Original audit attribution and workspace IDs remain intact. It refuses to overwrite a destination or silently omit evidence.

```sh
node scripts/import-sites.mjs \
  --source /absolute/path/to/original.sqlite \
  --output /absolute/path/to/new-atoll-data \
  --owner-email your-google-account@example.org
```

Use the actual original D1 SQLite file under `.wrangler/state/v3/d1/miniflare-D1DatabaseObject/`, not `metadata.sqlite`. If the pilot contains evidence, first export each object to a directory with each filename equal to its file record ID, then pass `--files /absolute/path/to/exported-evidence`. The importer verifies sizes and SHA-256 checksums. It will stop if any file is missing. For a hosted original, export its D1 database and evidence privately first; the importer takes an SQLite database file, not a SQL dump.

Create an application backup from the migrated directory and restore it to an **empty** Railway volume while the app is stopped. Keep the original pilot as the rollback copy. Upload these private records only to the intended Railway service.

## Backups and restore

An application backup captures a consistent SQLite snapshot, every referenced evidence file across both sample and organization workspaces, and a SHA-256 manifest. Active sign-in sessions and pending OAuth flows are excluded, so restoring requires fresh sign-in. The backup includes private organizational data; store it privately outside the running service as well as any same-volume copy.

Run in the service environment, choosing a new output directory:

```sh
DATA_DIR=/data node scripts/backup.mjs /data/backups/2026-09-13
```

Download that backup to independent private storage. A backup retained only on the same volume does not protect against loss of that volume. To restore, stop the app and use an empty replacement volume/directory:

```sh
DATA_DIR=/empty/replacement-data node scripts/restore.mjs /path/to/backup
```

Restore verifies checksums, database integrity, and the presence of all referenced evidence before copying. It refuses to overwrite an existing database or evidence directory. Point `DATA_DIR` at the restored volume and start the app. Confirm sign-in, record counts, and a sample evidence download before retiring the rollback copy.

## Updates and operating limits

- Run one application instance against this SQLite volume. For multiple replicas or high write throughput, migrate the database to PostgreSQL and evidence to object storage first.
- A volume-backed service has a brief interruption during replacement deployments. Railway prevents two deployments mounting the same volume simultaneously. Health checks are deployment readiness checks, not continuous uptime monitoring. [Railway's volume health-check behavior](https://docs.railway.com/deployments/healthchecks).
- Take a backup before applying new migrations. Applied migration checksums are checked at startup; do not edit an already-applied migration. A code rollback after a schema change may also require restoring its matching backup.
- The app uses Google account security; its own MFA enrollment/recovery flow is not implemented. Require suitable account protection for organizational users.
- Initial-owner identity recovery or reassignment should be handled as an explicit administrative operation, with a backup and audit record. Changing `OWNER_EMAIL` does not transfer an existing workspace membership automatically.
- Automatic reminders/transfers, complete continuity automation, and official filing templates remain outside this pilot's implemented scope. See `README.md` before treating the app as a finished compliance system.

## Local checks

```sh
npm ci
npm run check
npm test
npm run build
npm run test:railway
```

`test:railway` runs the built artifact in an isolated temporary filesystem with disposable records. It checks API authorization, header-spoof rejection, production-only sign-in boundaries, origin and request-size protection, milestone review, file access, role scope, restart persistence, report export, filing proof, logout, and backup/restore. It does not contact Google or claim that real OAuth credentials have been tested.

For the local interactive preview, create `.env.local` using the development example in `.env.example`, then run `npm run dev`. Local preview sign-in is only available outside production with `AUTH_MODE=development`.
