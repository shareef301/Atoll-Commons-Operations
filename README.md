# Atoll Commons Operations

A private, server-backed operations workspace based on the supplied Atoll Commons screen-flow baseline and navy/teal project-workspace reference.

## Working features

- Dashboard, tasks, projects, activities, governance, finance, obligations, calendar, reports, submissions, rules, access and audit views.
- Sample and organization workspaces saved separately in SQLite on a persistent volume. Switching preserves both sets of records.
- Google sign-in with an owner/member allowlist, server-side role and project/report scope checks, separately recorded governance authority.
- Small milestones with Active and Completed views. Reviewer-only acceptance, structured or uploaded evidence, immutable acceptance cycles, original deadlines and distinct submission/review timestamps.
- Evidence stored privately on the persistent volume with SHA-256 checksums and authorized downloads.
- Project budget threshold and committee-event deadline calculations. Rule versions and explicit deadline decisions retain prior values.
- Meetings and quorum checks; approved minutes and resolutions lock on finalization.
- Financial registers, linked funding entries, evidence-gated reconciliation, member and asset lifecycle records.
- Report validation, approval gates, locked source snapshots, retained ZIP review packages, manual submission proof and authority-response history.
- ZIP packages include printable HTML, CSV finance schedules, JSON source snapshots, supporting evidence and a checksum manifest. Public membership summaries omit personal identifiers.
- Optimistic concurrency checks and bounded operation-id deduplication prevent stale overwrites and repeated normal record actions.
- Responsive interface and `dir="auto"` text entry for mixed English/Dhivehi content.

## Railway deployment

Prepared for **https://ops.atollcommons.org**. Follow [DEPLOYMENT-RAILWAY.md](DEPLOYMENT-RAILWAY.md) for the persistent volume, Google OAuth credentials, owner account, DNS, deployment, data migration, and recovery steps.

The root Dockerfile builds a standalone Node server. Railway supplies its port. `railway.json` configures `/api/health` and one replica; startup validates configuration/storage and applies checked migrations. Records and evidence are stored under `DATA_DIR` (a Railway volume mounted at `/data`). The original Cloudflare/Sites runtime is no longer used.

## Authentication and access

Only the configured owner or an existing workspace member may sign in. Google authorization uses PKCE, state and nonce checks, verified email, and a pinned provider identity. Sessions are random tokens stored only as hashes, expire after eight hours, and use Secure/HttpOnly/SameSite cookies on HTTPS. Logout revokes the server-side session. Caller-supplied Sites authentication headers are ignored. Mutation endpoints require the configured application origin and enforce request-size bounds.

Only the configured initial owner may create a workspace. App memberships route colleagues to their assigned workspace and scope. Technical ownership does not grant governance authority in organization mode. Sample mode lets the system owner explicitly simulate named reviewers.

## Release scope

This is a working pilot, not completion of all first-release acceptance criteria in the source specification. These capabilities remain unimplemented or unactivated:

- Automated checkpoint scheduling, delivery/retry queues, email reminders, policy-driven reassignment, takeover access changes, successor confirmation and full outage/recovery handling.
- App-specific MFA enrollment/recovery and time-limited auditor access. Account security is provided by Google sign-in.
- Official bilingual Registrar/MIRA DOCX/PDF/XLSX templates, signature collection, and validated filing-ready document layouts. Current packages support review, printing and data export.
- Bulk opening-record imports, complete multi-step onboarding, and formal project change/budget notification packages.
- Independent approval of rule proposals and automatic recalculation of all affected obligations. Rule review creates a version; existing deadlines require explicit decisions.

Proposed continuity defaults remain inactive. Live project launch is blocked until its formally approved continuity configuration is implemented. This prevents the pilot from claiming the unapproved policy is operational. Government and MIRA filing is always manual.

Legal thresholds and sample dates are configurations from the user-supplied baseline, not independently validated legal advice. The UI marks initial source reviews as pending. Annual sample deadlines require confirmation.

## Development and validation

- `npm ci`
- Create `.env.local` using the local-development example in `.env.example`.
- `npm run dev` — interactive local preview; development sign-in cannot run in production.
- `npm run db:generate` — generate the next schema migration after editing `db/schema.ts`.
- `npm run check` — type checks.
- `npm test` — domain, export, storage and deployment configuration tests.
- `npm run build` — standalone Node artifact at `dist/standalone`.
- `npm run test:railway` — production-artifact checks in disposable storage, including restart persistence and backup/restore.
- `npm start` — production startup; requires the deployment variables and persistent data directory.

See the deployment guide for backup, restore, and non-destructive import of original pilot records. Local data, backups and secrets are excluded from source and container build context.

Milestone popup browser checks passed for active/completed records, evidence expansion, nested review-form cancellation, close-button and Escape behavior. The Railway adapter is tested separately through its built server. Real Google sign-in and the actual Railway/DNS deployment need live credentials and service configuration.

The WebMCP surface exposes `list_projects`, `open_milestone`, and `create_project` through the same application state and authenticated server actions. Registration is feature-detected; this integration is not claimed independently verified.
