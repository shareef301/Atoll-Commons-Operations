# Atoll Commons Operations

A private, server-backed operations workspace based on the supplied Atoll Commons screen-flow baseline and navy/teal project-workspace reference.

## Working features

- Dashboard, tasks, projects, activities, governance, finance, obligations, calendar, reports, submissions, rules, access and audit views.
- Sample and organization workspaces saved separately in Supabase Postgres (or local SQLite for offline development). Switching preserves both sets of records.
- Supabase sign-in with an owner/member allowlist, server-side role and project/report scope checks, separately recorded governance authority.
- Small milestones with Active and Completed views. Reviewer-only acceptance, structured or uploaded evidence, immutable acceptance cycles, original deadlines and distinct submission/review timestamps.
- Evidence stored in a private Supabase Storage bucket with SHA-256 checksums and authorized downloads.
- Project budget threshold and committee-event deadline calculations. Rule versions and explicit deadline decisions retain prior values.
- Meetings and quorum checks; approved minutes and resolutions lock on finalization.
- Financial registers, linked funding entries, evidence-gated reconciliation, member and asset lifecycle records.
- Report validation, approval gates, locked source snapshots, retained ZIP review packages, manual submission proof and authority-response history.
- ZIP packages include printable HTML, CSV finance schedules, JSON source snapshots, supporting evidence and a checksum manifest. Public membership summaries omit personal identifiers.
- Optimistic concurrency checks and bounded operation-id deduplication prevent stale overwrites and repeated normal record actions.
- Responsive interface and `dir="auto"` text entry for mixed English/Dhivehi content.

## Railway deployment

Prepared for **https://ops.atollcommons.org**. Follow [DEPLOYMENT-RAILWAY.md](DEPLOYMENT-RAILWAY.md) for the Supabase connection, administrator account, sign-in delivery, DNS, deployment, and recovery steps.

The root Dockerfile builds a standalone Node server. Railway supplies its port. `railway.json` configures `/api/health`; startup validates configuration and checks Supabase tables and the private evidence bucket. Supabase mode requires no Railway data volume. Database migrations are retained under `supabase/migrations/` and applied separately from app startup. The local SQLite adapter remains available; see [DEPLOYMENT-SQLITE.md](DEPLOYMENT-SQLITE.md).

## Authentication and access

Supabase Auth validates sign-in; server cookies are HttpOnly, SameSite=Lax and Secure on HTTPS. The app verifies the user, signed claims, active Supabase session, current email allowlist, and pinned account identity. Deleted users, revoked sessions, removed memberships, anonymous users, and self-edited profile claims cannot grant app access. The auth proxy refreshes cookies; authenticated responses are not cached. Mutation endpoints check the configured origin and request size.

App tables have RLS enabled and no public/client grants. Only the server credential can access complete snapshots and transaction functions. API routes enforce roles and project/report scopes before returning records or downloading evidence. Keep `SUPABASE_SECRET_KEY` server-only. A publishable key or ordinary authenticated Supabase user cannot read these tables or storage objects directly.

Only the configured initial owner may create a workspace. Membership assignments let colleagues sign in with their assigned email; assigning access does not send an email. Formal governance authority is recorded separately. Sample mode lets the system owner explicitly simulate named reviewers.

Email links are supported with PKCE and exact callback URLs. Supabase's default email delivery is limited to project team members and is unsuitable for wider organization use; configure custom SMTP before onboarding colleagues. Google through Supabase can be enabled after configuring its OAuth provider.

## Release scope

This is a working pilot, not completion of all first-release acceptance criteria in the source specification. These capabilities remain unimplemented or unactivated:

- Automated checkpoint scheduling, delivery/retry queues, email reminders, policy-driven reassignment, takeover access changes, successor confirmation and full outage/recovery handling.
- App-specific MFA enrollment/recovery and time-limited auditor access. Account security is provided by the configured Supabase sign-in provider.
- Official bilingual Registrar/MIRA DOCX/PDF/XLSX templates, signature collection, and validated filing-ready document layouts. Current packages support review, printing and data export.
- Bulk opening-record imports, complete multi-step onboarding, and formal project change/budget notification packages.
- Independent approval of rule proposals and automatic recalculation of all affected obligations. Rule review creates a version; existing deadlines require explicit decisions.

Proposed continuity defaults remain inactive. Live project launch is blocked until its formally approved continuity configuration is implemented. This prevents the pilot from claiming the unapproved policy is operational. Government and MIRA filing is always manual.

Legal thresholds and sample dates are configurations from the user-supplied baseline, not independently validated legal advice. The UI marks initial source reviews as pending. Annual sample deadlines require confirmation.

## Development and validation

- `npm ci`
- Create `.env.local` using the local-development example in `.env.example`.
- `npm run dev` — interactive local preview; development sign-in cannot run in production.
- `npm run db:generate` — generate a local SQLite migration after editing `db/schema.ts`; cloud migrations are in `supabase/migrations/`.
- `npm run check` — type checks.
- `npm test` — domain, export, storage and deployment configuration tests.
- `npm run build` — standalone Node artifact at `dist/standalone`.
- `npm run test:railway` — production-artifact checks in disposable SQLite storage.
- `npm run test:supabase` — opt-in checks against the explicitly configured Supabase project with temporary test users/records and cleanup.
- `npm start` — production startup; requires the selected backend’s deployment variables.

See the deployment guide for backup, restore, and non-destructive import of original pilot records. Local data, backups and secrets are excluded from source and container build context.

Milestone popup browser checks passed for active/completed records, evidence expansion, nested review-form cancellation, close-button and Escape behavior. The Railway adapter is tested separately through its built server. Real member email delivery, optional Google sign-in, and Railway/DNS deployment require their final service configuration.

The WebMCP surface exposes `list_projects`, `open_milestone`, and `create_project` through the same application state and authenticated server actions. Registration is feature-detected; this integration is not claimed independently verified.
