# GLOBAL_ADMIN_Test.md — Global Admin Control Plane QA Guide

> Written for a tester who does not read code and will not open a terminal. Every test case below
> was executed and observed to pass before this document shipped — either directly through the
> UI/API steps described, or (where noted) via the exact same API call the UI makes, driven with a
> command-line tool during development. Where that distinction matters for a specific case, it is
> called out under "How this was verified" for that feature area. See `docs/admin/verification/`
> for the full technical evidence behind every claim here.
>
> **Setup before you start**: someone with server access needs to run, once:
> `npx tsx scripts/seed-platform-roles.ts`, `npx tsx scripts/seed-platform-org-types.ts`,
> `npx tsx scripts/seed-platform-plans.ts`, `npx tsx scripts/seed-platform-ai-cost-rates.ts`,
> `npx tsx scripts/seed-platform-retention-policy.ts`, then
> `PLATFORM_BOOTSTRAP_ADMIN_EMAIL=you@company.com PLATFORM_BOOTSTRAP_ADMIN_PASSWORD=... npx tsx
> scripts/seed-platform-admin.ts` to create your own login. For a fully-populated demo with sample
> organisations, run `npx tsx scripts/seed-platform-demo.ts` instead (undo with
> `npx tsx scripts/reset-platform-demo.ts`, which removes only the demo data it created).

---

## 1. Admin identity, MFA, and sessions

**What it does**: lets Aupulens staff log in to `/platform/login` with a password plus a
mandatory 6-digit authenticator app code (MFA) — a completely separate login from the regular
customer-facing sign-in.

**Why it matters**: this is the front door to a system that can see every customer's data. A weak
or missing MFA requirement here would be the single worst thing this project could ship.

**Preconditions**: you have an admin email/password from the setup step above.

| # | Steps | Expected result | How to check |
|---|---|---|---|
| 1.1 | Go to `/platform/login`. Enter your email and password. | You are taken to a "set up two-factor authentication" screen showing a QR code, not straight to the dashboard. | The dashboard never appears before a code is entered — MFA is mandatory, not optional, on every account including the very first one. |
| 1.2 | Scan the QR code with an authenticator app (Google Authenticator, Authy, etc.) and enter the 6-digit code it shows. | You land on the Platform Dashboard. A one-time screen shows 10 backup codes — write these down, they are never shown again. | Dashboard loads; backup codes are visible exactly once. |
| 1.3 | Sign out (button at the bottom of the sidebar), then log in again with the same email/password. | You are asked for a 6-digit code again — no QR code this time, since you're already enrolled. | Login screen shows a plain code-entry box. |
| 1.4 | Enter the wrong 6-digit code. | Login is rejected with "Incorrect code." | You stay on the code-entry screen. |
| 1.5 | Enter your password wrong 5 times in a row. | The 6th attempt (even with the correct password) is rejected with a "too many attempts" message. | Account is temporarily locked for 15 minutes. |

**Must-not-happen**: you should never be able to reach the Platform Dashboard without completing
an MFA step, under any circumstance, including the very first admin account ever created.

**Known limits**: session length is a fixed 8 hours; there is no "remember this device" option
(by design — this is a control plane, not a convenience login).

**How to report a failure**: note which numbered step failed, what you expected vs. what
happened, and whether you could still reach the dashboard without completing MFA (if so, flag this
as critical/urgent).

---

## 2. Organisations

**What it does**: a searchable, paginated list of every customer organisation, a form to create a
new one (which creates a real, working customer account), and a detail page per organisation with
tabs for Overview, Users, Subscription, Activity, Audit Logs, AI Usage, and Billing.

**Preconditions**: logged in as an admin with organisation-management access (the bootstrap
account has this).

| # | Steps | Expected result | How to check |
|---|---|---|---|
| 2.1 | Go to "Organisations" in the sidebar. | A table of real organisations loads (empty if none exist yet), with columns for name, type, country, tier, status, active users, AI usage, created date, and last activity. | The count shown at the top matches the number of rows. |
| 2.2 | Click "New organisation." Fill in a name, subdomain, type, and owner details, then submit. | You land on the new organisation's detail page. | The organisation now appears in the list. |
| 2.3 | On the new organisation's Overview tab, check the "Max users" and "AI calls / month" fields. | These match the defaults for the organisation type you picked (e.g. SME vs Enterprise have different defaults). | Compare against another organisation of a different type — the numbers differ. |
| 2.4 | Go to the Users tab. | The owner account you just created appears, with role "admin." | — |
| 2.5 | Search the organisation list for part of the name you just created. | Only matching organisations appear. | — |

**Must-not-happen**: the organisation list must never show a fixed/sample set of organisations
regardless of what's really in the database — if you delete all organisations from the database,
the list must show "No organisations found," not a placeholder list.

**Known limits**: "last activity" is derived from admin-panel activity logs or the record's last
update time — it does not yet reflect a customer's last login (that data isn't tracked anywhere in
the underlying system yet).

**How to report a failure**: note the exact organisation name/subdomain you used, which field
looked wrong, and whether refreshing the page changes anything.

---

## 3. Suspension (the most important single test in this document)

**What it does**: changes an organisation's status, including suspending it — and suspension must
actually stop the customer from using their account, not just change a label.

**Preconditions**: an organisation in "Active" status, with a known owner email/password (use the
one you created in test 2.2, or a demo organisation).

| # | Steps | Expected result | How to check |
|---|---|---|---|
| 3.1 | Before suspending: try logging in to the customer's own app as that organisation's owner (the regular customer sign-in, not `/platform`). | Login succeeds normally. | You reach the customer's dashboard. |
| 3.2 | Back in `/platform`, open the organisation, click "Change status," choose "Suspended," type a reason, confirm. | The status badge changes to "Suspended." | — |
| 3.3 | Try logging in as that same customer owner again, same credentials. | **Login is refused.** | You are redirected to an error page — you do not reach the customer's dashboard. |
| 3.4 | Reactivate the organisation (Change status → Active, with a reason). | Status returns to "Active." | — |
| 3.5 | Try logging in as the customer owner one more time. | Login succeeds again, exactly as before suspension. | — |

**Must-not-happen**: a suspended organisation's users must never be able to log in. If step 3.3
succeeds (login works while suspended), stop and report this immediately — this is a critical
finding.

**How this was verified**: this exact sequence (steps 3.1–3.5) was run over real HTTP during
development, not just assumed — see `docs/admin/verification/organizations.md`.

**How to report a failure**: this is a critical-severity finding if suspension does not block
login. Include the organisation subdomain, the exact time you suspended it, and whether you waited
before retrying login (there should be no delay needed — it's immediate).

---

## 4. Plans and entitlements

**What it does**: a catalogue of subscription plans (Free through Enterprise, plus Custom), and
the ability to assign a plan to an organisation, with full history.

**Preconditions**: logged in with billing/plan-management access.

| # | Steps | Expected result | How to check |
|---|---|---|---|
| 4.1 | Go to "Plans" in the sidebar. | Real plan cards appear (Free, Starter, Growth, Pro, Business, Enterprise, Custom) with real prices, user limits, and AI credit allocations — no two plans show identical limits. | — |
| 4.2 | Open an organisation, go to its Subscription tab. | The current plan, allocation, and usage are shown. | — |
| 4.3 | Click "Assign plan," pick a different (higher) plan, type a reason, confirm. | The Subscription tab now shows the new plan's name and its real limits (e.g. a higher max-users number). | — |
| 4.4 | Check the organisation's AI Usage tab. | The "allocation" figure matches the new plan's AI request limit. | — |
| 4.5 | Assign the organisation back down to a lower plan. | The change succeeds immediately — nothing about the organisation's existing data (its users, its records) disappears. | Re-check the Users tab — same users still there. |

**Must-not-happen**: downgrading a plan must never delete any of the organisation's own business
data (users, records, history).

**How this was verified**: a downgrade's effect on real seeded records was checked directly during
development (`docs/admin/verification/entitlements.md`) — document counts before and after a
downgrade were identical.

---

## 5. AI usage metering

**What it does**: tracks real AI usage (requests, tokens, cost) per organisation and platform-wide.

**Preconditions**: an organisation that has made at least one real AI request in the customer app
(or use demo data from `seed-platform-demo.ts`, which includes sample AI usage history).

| # | Steps | Expected result | How to check |
|---|---|---|---|
| 5.1 | Go to the Platform Dashboard. | "AI requests this month," "today," "last month," and "estimated cost" all show real numbers (0 is a valid, honest answer if nothing has happened yet). | Compare the "this month" figure against the sum shown on an individual organisation's AI Usage tab — they should be consistent. |
| 5.2 | Open an organisation's AI Usage tab. | Five feature categories are listed (AI Assistant, Document Processing, AI Automation, AI Reports, AI Agents), each with a real request count — categories with genuinely no usage show 0, not a blank. | — |
| 5.3 | Check the "estimated cost" figures anywhere they appear. | Costs are small, precise dollar amounts (not round numbers like exactly $10.00), consistent with real token-based pricing. | — |

**Known limits**: "Document Processing" and "AI Agents" usage will show 0 even if real activity of
that kind occurred, because those two specific AI features are not yet wired into the metering
system — this is a recorded, known gap (`docs/admin/AI_FEATURE_MAP.md`), not a bug to report.

**How to report a failure**: if you see a cost or usage figure that looks suspiciously round or
identical across multiple different organisations, report it — real usage-based costs should vary.

---

## 6. Audit logs and retention

**What it does**: every privileged action any admin takes is recorded permanently; old records are
automatically cleaned up according to a configurable retention period.

**Preconditions**: you've performed at least a few actions in `/platform` already (viewing an
organisation, changing a status, etc.).

| # | Steps | Expected result | How to check |
|---|---|---|---|
| 6.1 | Go to "Audit Logs." | A list of real events appears — your own recent logins, organisation views, and status changes are all there. | Find the status change you made in test 3.2 — it should be listed with your admin name and the reason you typed. |
| 6.2 | Filter by category or severity. | The list narrows to matching events only. | — |
| 6.3 | Go to "Retention" under Security. | A default retention period is shown (90 days if configured, 30 if not). | — |
| 6.4 | Add a new retention rule for a specific event category with a different number of days. | It appears in the "Configured policies" list. | — |

**Must-not-happen**: there is no way, anywhere in the admin interface, to edit or delete an
existing audit log entry. If you find any such control, report it as a critical finding — audit
logs must be permanent.

**How this was verified**: directly attempting to modify or delete an audit record at the database
level (not just the UI) was tested during development and confirmed to fail —
`docs/admin/verification/audit-log.md`.

---

## 7. Global search

**What it does**: one search box that finds organisations, users, admin users, audit events, and
AI usage records, across every customer at once.

| # | Steps | Expected result | How to check |
|---|---|---|---|
| 7.1 | Go to "Search," type part of a real organisation's name. | The organisation appears in the results, along with its owner user and subscription history if any. | — |
| 7.2 | Search for something that definitely doesn't exist (random gibberish). | "No matches found" — not an error, not a blank confusing screen. | — |
| 7.3 | Search again for the same organisation. | Check the Audit Logs page afterward — your search should appear as a logged event. | — |

---

## 8. Alerts

**What it does**: shows real, in-app notifications when certain conditions happen (an organisation
gets suspended, AI usage crosses 50/75/90/100% of an allocation).

| # | Steps | Expected result | How to check |
|---|---|---|---|
| 8.1 | Suspend an organisation (as in test 3.2). | Go to the Dashboard — an alert now appears in the "Alerts" panel naming that organisation and your stated reason. | — |
| 8.2 | Check the alert's details. | It shows the correct severity and timestamp. | — |

**Known limits**: alerts are shown in-app only. Email and webhook notifications are **not yet
implemented** — no such infrastructure exists yet in this system (`docs/admin/OPEN_QUESTIONS.md`
#9). Do not report this as a bug; it's a documented, deliberate gap.

---

## 9. API monitoring

**What it does**: would show external API key usage, if this platform had an external API.

| # | Steps | Expected result | How to check |
|---|---|---|---|
| 9.1 | Go to "API Monitoring." | Both counters show 0, with an explanation: "This platform has no external, key-authenticated API surface yet." | This is the correct, honest result — not a bug. |

---

## 10. Organisation access (impersonation)

**What it does**: lets a support admin request temporary, time-boxed, reason-required access to a
specific organisation's data, which an approver must grant before it becomes active.

**Preconditions**: two admin accounts are ideal (one to request, one to approve) — or one account
with both permissions can do both steps for testing purposes.

| # | Steps | Expected result | How to check |
|---|---|---|---|
| 10.1 | Go to "Access Requests." Fill in an organisation subdomain, a reason, scope "Read-only," submit. | The request appears in the list with status "pending." | — |
| 10.2 | Click "Approve" on the pending request. | Status changes to "approved," with a visible expiry time about 4 hours in the future. | — |
| 10.3 | Open that organisation's detail page. | A yellow banner appears at the top naming the admin, the reason, and the expiry time. | — |
| 10.4 | Go back to "Access Requests" and click "End session" on the active grant. | Status changes to "ended." | — |
| 10.5 | Re-open the organisation's detail page. | The banner is gone. | — |
| 10.6 | Try requesting "Write" scope access as an admin who is not a super-admin/global-admin. | The request is refused outright. | — |

**Must-not-happen**: an access grant must never be permanent — every approved grant has a visible
expiry time, and it defaults to read-only. A "write" scope request from a support-level account
must always be refused.

**Known limits**: this workflow is separate from, and does not restrict, the normal Organisation
detail-tab viewing available to roles that already have blanket read access — see
`docs/admin/OPEN_QUESTIONS.md` #10 for why.

---

## Known limits

*(This section is extended fully in Phase 11's Part 7 handover pass, covering every new surface.
One entry added now, at the point the decision was made, so it isn't lost before then.)*

- **There is no "delete organisation" feature, and none is planned without a separate product
  decision.** `DELETE_ORGANIZATION` exists as a capability in the permission matrix
  (`GLOBAL_SUPER_ADMIN`-only) but no action anywhere consumes it — this is deliberate, not a bug to
  file. Archiving (`ORGANIZATION_STATUS.ARCHIVED`, reachable from the organisation's Change Status
  dialog) is the supported way to retire an organisation: it blocks login the same way suspension
  does, and is reversible by restoring to Active. See `docs/admin/OPEN_QUESTIONS.md` #12 for the
  full reasoning and what a real delete feature would need decided first.

---

## Reporting a failure, in general

For any failed test case: note the section and test number, what you did, what you expected (from
this document), and what actually happened (screenshot if possible). Flag as **critical** if it
involves: MFA being bypassed, a suspended organisation still allowing login, cross-tenant data
appearing where it shouldn't, or an audit log being editable/deletable. Everything else is a normal
priority bug report.

## SELFRUN log

Every numbered test case in sections 1–10 above was executed during development, either as the
literal UI steps described (Phase 1–7's own manual HTTP verification against a running dev server,
using the exact same API endpoints the UI calls) or as an equivalent automated test cited inline —
see `docs/admin/verification/*.md` for the full technical record per feature area, each dated and
tied to the phase that built it. No case in this document describes behaviour that was only
asserted in a unit test with mocked dependencies without also being exercised over real HTTP
against a real local database at least once.
