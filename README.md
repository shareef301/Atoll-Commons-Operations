# Atoll Commons Operations

A private, server-backed operations workspace based on the supplied Atoll Commons screen-flow baseline and navy/teal project-workspace reference.

## Working features

- Dashboard, tasks, projects, activities, governance, finance, obligations, calendar, reports, submissions, rules, access and audit views.
- Sample and organization workspaces saved separately in D1. Switching preserves both sets of records.
- ChatGPT sign-in, server-side role and project/report scope checks, separately recorded governance authority.
- Small milestones with Active and Completed views. Reviewer-only acceptance, structured or uploaded evidence, immutable acceptance cycles, original deadlines and distinct submission/review timestamps.
- Evidence stored in R2 with SHA-256 checksums and authorized downloads.
- Project budget threshold and committee-event deadline calculations. Rule versions and explicit deadline decisions retain prior values.
- Meetings and quorum checks; approved minutes and resolutions lock on finalization.
- Financial registers, linked funding entries, evidence-gated reconciliation, member and asset lifecycle records.
- Report validation, approval gates, locked source snapshots, retained ZIP review packages, manual submission proof and authority-response history.
- ZIP packages include printable HTML, CSV finance schedules, JSON source snapshots, supporting evidence and a checksum manifest. Public membership summaries omit personal identifiers.
- Optimistic concurrency checks and bounded operation-id deduplication prevent stale overwrites and repeated normal record actions.
- Responsive interface and `dir="auto"` text entry for mixed English/Dhivehi content.

## Deployment and security boundaries

The Site is owner-only by default. Creating an app role assignment does not send an invitation or change the Site audience. Authentication headers are trusted only behind the Sites dispatcher; do not expose the Worker directly as a public origin.

The first signed-in account receives a system-owner workspace. Existing app membership links route a user to their assigned workspace. Technical ownership alone does not grant governance decisions in organization mode. Sample mode lets the system owner simulate named reviewers explicitly.

## Release scope

This is a working pilot, not completion of all first-release acceptance criteria in the source specification. These capabilities remain unimplemented or unactivated:

- Automated checkpoint scheduling, delivery/retry queues, email reminders, policy-driven reassignment, takeover access changes, successor confirmation and full outage/recovery handling.
- App-specific MFA enrollment/recovery and time-limited auditor access. Sign-in currently relies on the account and private Sites policy.
- Official bilingual Registrar/MIRA DOCX/PDF/XLSX templates, signature collection, and validated filing-ready document layouts. Current packages support review, printing and data export.
- Bulk opening-record imports, complete multi-step onboarding, and formal project change/budget notification packages.
- Independent approval of rule proposals and automatic recalculation of all affected obligations. Rule review creates a version; existing deadlines require explicit decisions.

Proposed continuity defaults remain inactive. Live project launch is blocked until its formally approved continuity configuration is implemented. This prevents the pilot from claiming the unapproved policy is operational. Government and MIRA filing is always manual.

Legal thresholds and sample dates are configurations from the user-supplied baseline, not independently validated legal advice. The UI marks initial source reviews as pending. Annual sample deadlines require confirmation.

## Development

- `npm install`
- `npm run dev` — local preview with the starter's local sign-in.
- `npm run db:generate` — generate schema-only migrations.
- `npx wrangler d1 execute DB --local --persist-to .wrangler/state --config wrangler.local.json --file drizzle/<migration>.sql` — apply each local migration.
- `npm test` — meaningful domain and export safety checks.
- `npx tsc --noEmit`
- `npm run build`

Production D1 and R2 bindings are declared in `.openai/hosting.json`. Sites applies the committed migrations when publishing. No app secrets are required; `.env*` files remain excluded from source.

## Validation notes

15 domain/export tests and 12 isolated local production-Worker integration checks passed. The integration checks cover authentication, durable read-back, idempotency, stale-write rejection, cross-origin rejection, evidence round-trips, role isolation, workspace separation, report export and filing proof.

Runtime dependencies were patched for reported high-severity issues. Four moderate development-tool advisories remain in the Drizzle migration tool’s transitive legacy esbuild loader; it is not shipped as an application request handler.

Domain checks cover milestone state transitions, distinct authority, project scope, deadline calculations, budget thresholds, linked finance records, immutable report/acceptance snapshots, quorum and filing-proof gates. Export tests cover CSV formula escaping, HTML escaping, Unicode and ZIP integrity.

The WebMCP surface exposes `list_projects`, `open_milestone`, and `create_project` through the same state and server actions. Registration is feature-detected. A supported browser WebMCP validation context was not available during development; this integration is not claimed verified. Browser interaction/visual QA was not requested and has not been run.
