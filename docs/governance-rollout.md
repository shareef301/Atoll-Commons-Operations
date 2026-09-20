# Governance workflows

## What this release provides

- Membership dues: MVR 50 monthly, due before the 5th in Maldives time. Tracking begins only after an authorized person confirms each billing start and unpaid opening balance. Missing opening information is labelled unconfirmed, not unpaid. Payments allocate existing reconciled income receipts, so income is not duplicated. Corrections and private follow-up notes retain history. No dues action removes a member.
- Decisions: complete proposals, deadlines, individual ExCo responses, conflict declarations, revisions and a separately recorded formal outcome. A formal outcome requires a finalized meeting, quorum, signed evidence and a procedure attestation. General meetings require an explicitly confirmed eligible-member count; missing forms cannot silently lower quorum.
- Member communications: complete wording and recipients are reviewed by current ExCo. A configured safeguard requires two reviewers, a majority, or all current ExCo, with someone other than the author included. Changed wording, recipients, policy or review authority require fresh review. A requested correction blocks approval until revision. Publication and email require a separate explicit ExCo release.

## Access setup

Open **Organization & settings → Users & roles** as the system owner.

1. Confirm each person's sign-in email. Assign **ExCo member** and link the correct current committee appointment. The Treasurer may keep the **Treasurer** app role with the appointment linked; the Secretary may keep **Compliance secretary** with the appointment linked. A role title or an old governance checkbox alone does not confer ExCo voting authority. The system owner must also link their appointment to vote or review as ExCo.
2. General-member logins must use the confirmed email on an active member profile. **General member** receives only released messages addressed to that email. The server excludes private collections, files, exports, internal discussions, other recipients and member profiles.
3. For future staff, choose **Authorized staff**, the specific dues or drafting grants, a delegation expiry and an authority reference. Staff cannot approve or release member emails.
4. Use **Disabled** to revoke app access. Reassigning access does not send an invitation. Technical system owners retain administrator access to private records; assign this role sparingly.

All current ExCo appointments must have verified login assignments before a response request can be opened. Existing assignments are not expanded by deploying this release. The current missing Treasurer email and two outstanding membership forms need confirmation before full rollout.

## Starting dues

Open **Membership dues**, select a person and choose **Confirm opening balance**. Enter the agreed first billing month and unpaid dues from before that month, checking receipts already collected. Do not guess these from application dates. Later payments are entered in Finance and reconciled against evidence, then allocated under **Record payment** in the dues record. An opening amount may be corrected with a reason; the billing start remains fixed. No interest, penalty, fee waiver or expulsion is inferred or automated.

## Email activation on Railway

The implementation uses the Resend email API. Provider selection and account setup still require the organization's confirmation. Supabase sign-in mail is a separate service and is not changed by these variables.

1. In Resend, verify a sending domain controlled by Atoll Commons using the provider's required DNS records. Keep the existing mailbox receiving mail. Obtain a sending-only API key through the provider's dashboard.
2. Add Railway runtime variables: `RESEND_API_KEY` (secret), `MAIL_FROM` (verified sender email), `MAIL_REPLY_TO` (monitored help mailbox), and `MAIL_ENABLED=true`. Keep `APP_URL=https://ops.atollcommons.org`. Never commit credentials or put them in browser/public variables.
3. Confirm **ExCo review & email** shows configured. Record the ExCo-approved review policy and reference. Draft and review an appropriate message before the authorized final release.
4. Use **Email ExCo for review** on a draft to send the complete text privately to ExCo with a review link. This never sends the draft to general members. A decision's email contains its full explanation, deadline, response options and a secure sign-in link. Published member emails contain the exact reviewed text. Each recipient receives a separate email; no shared CC/BCC list and no automatic private attachment is added.

Queue status **Provider accepted** means the provider accepted the request, not that the recipient received or read it. Inspect provider delivery/bounce results when needed. The worker claims jobs atomically, persists the payload and an idempotency key, and reuses both for retries. After three uncertain attempts or 23 hours it stops with **Needs attention**. Check the provider before creating a replacement notice. Revoked recipients or changed authority cancel unsent jobs. Setting `MAIL_ENABLED=false` pauses the worker and blocks new release; review existing queued work before re-enabling. Sample workspaces never send emails.

No real emails or invitations were sent during development. There are no automatic dues reminders or automatic general-member announcements. Member email release is blocked until the provider and safeguard are configured.

## Source findings and procedural limits

Reviewed against the supplied **Hingaa Gavaaidhu.pdf**, the [Associations Act 3/2022](https://mvlaw.gov.mv/dv/legislations/3/consolidations/2), and the [NGO Regulation 2024/R-74](https://moha.sgp1.digitaloceanspaces.com/download/file/NGO%20Gavaaidhu%202024.pdf) on 20 September 2026.

- The supplied constitution sets the MVR 50 monthly fee before the 5th. It does not establish an automatic fee-specific expulsion process.
- Its meeting procedures require ExCo/general meetings, quorum, votes and signed records. App responses are recorded as consultation; they do not automatically replace those procedures or matters reserved for the general membership.
- The AGM notice requires at least ten days. Member-facing categories include meeting notices/agendas, annual activity and financial reports, plans, elections, policy changes and participation opportunities. Whether a particular item must be circulated depends on the applicable provision and meeting.
- Regulation section 35(b), PDF page 27 / printed page 21, provides inspection rights for specified organizational records, including the membership register, accounts, documents and annual reports/accounts. ExCo editorial review of outgoing communications must not override lawful inspection requests. Handle those requests through the Secretary and the applicable procedure.
- A general minimum of **15 members was not verified** in the reviewed Act or current regulation. The election report's 15 voters and the 13 identified profiles are different facts. Keep the two missing forms outstanding; do not infer departures or encode an unsupported minimum.
- The current regulation's section 34(c) concerns annual reporting of membership-register changes before 15 January. This release does not automatically create or file that obligation; the Secretary should review applicability and record it through Compliance.

## Deployment and verification

The additive migration `supabase/migrations/20260920035235_governance_access_roles.sql` expands the allowed app roles without changing RLS policies or grants. Existing workspaces normalize the new collections to empty arrays; deployment does not seed debts, payments, votes or messages.

Run `npm run check`, `npm test`, `npm run build`, then `npm run test:railway` with Node 22.16 or later. Tests cover dues/date boundaries, general-member JSON/file/export isolation, ExCo identity and expiry, review invalidation, independent release, concurrent queue claims, uncertain-send retries and the standalone Railway artifact. Use synthetic local data for UI testing. Referrer policy remains private off-site while allowing same-site form posts to retain their Origin for CSRF validation ([MDN explanation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy)).
