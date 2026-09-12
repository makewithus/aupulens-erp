# AUPULENS — GLOBAL ADMIN, PHASE 11
# CLOSE-OUT: EVERY PARTIAL SECTION, UI QUALITY, PERFORMANCE & GO-LIVE READINESS

> **This is the final build brief.** After it, the only work left is verification and handover.
>
> I have read `COVERAGE_MATRIX.md` in full. It is an unusually honest document and the summary line
> at the bottom is the right read: every `PARTIAL` row has a working, tested backend, and what is
> missing is almost entirely the admin UI to configure and display it. That is a good position.
>
> This brief closes all ten `PARTIAL` rows, resolves the three places the matrix says it *cannot
> confirm something* (by supplying the missing verbatim text), and adds the quality bar this has to
> meet before it goes live: consistent with the existing theme, smooth to actually use, fast, and
> correct on every edge case.
>
> Save to `docs/admin/BRIEF-PHASE-11-CLOSEOUT.md` and commit it before starting.
> **Build the to-do list in Part 8 as your first action and work it in order.**
> Branch `global/admin`. Commit locally. Never push.

---

# PART 0 — THREE THINGS THE MATRIX SAYS IT CANNOT CONFIRM. HERE THEY ARE.

## 0.1 §7 — the exact eleven tabs

The matrix says *"the exact 11-tab list was never quoted verbatim, so this project cannot enumerate
the missing 4 with certainty."* From `SOURCE-SPEC.md` §7, verbatim:

> **Tabs:** Overview, Users, Subscription, AI Usage, Modules, Configuration, Activity, Audit Logs,
> Security, Billing, Usage.

You have seven: Overview, Users, Subscription, AI Usage, Activity, Audit Logs, Billing.

**The four missing are: Modules, Configuration, Security, Usage.** No ambiguity remains — build
exactly those four. See Part 1.2 for what each must contain.

And §7's Overview field list, also verbatim:

> Organisation Name, Organisation ID, Plan, Status, Country, Created Date, Active Users, Storage,
> AI Usage, Monthly Revenue, Last Activity.

Every one of those eleven appears on the Overview tab. Storage and Monthly Revenue appear as
labelled, explained empty states — present with a reason, never absent.

## 0.2 §33 — the full fifteen rules

The matrix says *"the full numbered list of hard rules under §33 was never quoted in one place…
Cannot confirm total coverage of a list this project has never seen in full."* Here it is:

1. Every organisation must have a unique Tenant ID.
2. Every tenant-scoped database record must be tenant-isolated.
3. Global Admin actions must always be auditable.
4. AI usage must be metered independently from the UI.
5. Subscription entitlements must be configuration-driven, not hard-coded.
6. Plan changes must never silently delete tenant data.
7. Audit logs must be append-only/immutable to ordinary application users.
8. Organisation suspension must immediately affect authentication and/or transaction access
   according to defined policy.
9. Global Admin access to tenant data must be explicitly permissioned and logged.
10. AI cost and usage calculations must be server-side and tamper-resistant.
11. Logs must contain structured event types, not only human-readable descriptions.
12. All timestamps should be stored consistently, preferably UTC, with organisation timezone
    applied at presentation.
13. Global Admin and Organisation Admin must have completely separate permission domains.
14. Sensitive prompts, financial data, credentials, and personal data should not be unnecessarily
    duplicated into logs.
15. Every privileged action should have an identifiable actor, timestamp, tenant, session, and
    outcome.

**Produce `docs/admin/verification/HARD_RULES.md`: one row per rule, the proof, and the test.**
Rule 12 is the one I would expect to be weakest — check every timestamp display in the admin UI
applies the organisation's timezone rather than the server's, and every stored value is UTC. The AI
project found a real UTC/local bug of exactly this shape that nine rounds of testing missed.

## 0.3 §3 — confirm the status enum matches

The matrix flags *"check exact 8-value match, not yet re-verified."* Verbatim from §3:

> `INVITED, ONBOARDING, TRIAL, ACTIVE, SUSPENDED, PAYMENT_HOLD, CANCELLED, ARCHIVED`

Confirm `ORGANIZATION_STATUS` carries exactly these eight, that every one is reachable through the
UI, and that the transition table permits only sensible moves. `PAYMENT_HOLD` in particular — check
it exists and does something, or it is a label that lies.

---

# PART 1 — CLOSE EVERY PARTIAL ROW

## 1.1 §3 — Organisation list

**Missing columns:** Organisation ID, Region, Usage %.
**Incorrect column:** "tier" (legacy label) must become the **entitlement-resolved plan**.

That last one is a correctness bug, not a cosmetic one — after the Group A bridge, the list and the
Subscription tab will show different things for the same organisation, and QA will find it in ten
minutes. Fix it at the source: `list.ts` resolves through `resolveEntitlements()`, same as detail.

Usage % is `current-period AI consumption ÷ plan allocation`. Handle the null-allocation case
explicitly: show "—" with a tooltip, never `NaN`, never `Infinity`, never a made-up 0%.

## 1.2 §7 — the four missing tabs

**Modules** — the organisation's enabled modules, resolved from entitlements, with the source of
each shown (base plan or override). Toggling a module is an override edit, so route it through the
existing `setOverride()` rather than a new path, and audit it. Show which modules the plan grants
versus which an override has changed.

**Configuration** — country, currency, timezone, tax jurisdiction, and the organisation-type
defaults applied at creation. Editable where safe; audited. Changing country must not silently
re-derive currency and timezone underneath an admin who has customised them — warn instead.

**Security** — the organisation's own users' MFA status, recent logins, failed-login counts, and
active sessions, to whatever depth the tenant data genuinely supports. Anything unavailable is an
explained empty state naming what is missing. This tab reads tenant data, so it goes through the
gateway and is audited like everything else.

**Usage** — distinct from AI Usage: storage, API requests, user count against the plan limits, and
document counts where available. Most of these will be honest empty states; the point of the tab is
that an operator can see limit consumption in one place, with each unavailable figure explaining
why.

**Overview** gains Storage and Monthly Revenue as labelled empty states (0.1).

## 1.3 §18 — Activity log filters

Today there are none. Verbatim from §18, the filters named are: **User, Action, Module, Date, IP,
Device, Severity.**

`ActivityLog` is free text with a single writer, so most of these have nothing to filter on.
Implement **Date** at minimum, plus **User** if any user reference exists on the record. For every
filter you cannot implement, show the control **disabled with a tooltip explaining why** — not
absent, and never present-but-inert. An operator who sees no filters assumes a bug; one who sees a
disabled control with a reason understands the system.

Keep the §20 note about the module-name axis on this tab so the two are not confused.

## 1.4 §21 / §31 — decide the security and system log question

This has been open since Phase 9 and it is now blocking two rows. **Decide it.**

My recommendation, given §28's four new alert conditions and the capability-denial stream now
flowing: build a **Security log view** over `PlatformAuditLog`, filtered to `SECURITY` severity and
the `SECURITY` event category, as a first-class page. Not a new collection — one store, a dedicated
view. That satisfies §31's intent (operators can see security events as a distinct thing) without
splitting the audit trail across collections, which would make the append-only guarantee harder to
hold in two places instead of one.

Whatever you decide, **write the decision into `DECISIONS.md`** with the reasoning, and update both
rows so neither says "undecided" again.

## 1.5 §24 — the eighteen KPIs and six panels

Verbatim from §24.

**KPIs:** Total Organisations, Active Organisations, Trial Organisations, Suspended Organisations,
Total Users, Active Users, MRR, ARR, Active Subscriptions, Upgrades, Downgrades, AI Requests,
AI Cost, AI Credits Used, Storage Used, API Usage, System Errors, Security Alerts.

Fourteen of those are computable from data you already hold — organisation counts by status,
user counts via the gateway, subscription/upgrade/downgrade counts from `SubscriptionEvent`, the AI
figures from rollups, security alerts from `PlatformAlert`, and **System Errors now has a real
source in the scheduler's job-failure records**. Build all fourteen.

MRR, ARR, Storage Used and API Usage render as **explained empty tiles** — present, greyed, with a
one-line reason. A missing tile reads as an oversight; an empty tile with a reason reads as honesty,
and an investor or operator can tell the difference.

**Panels:** Recent Organisations, Recent Subscription Changes, AI Usage Alerts, Security Alerts,
System Errors, Recent Global Admin Actions. You have one. Build the other five — each is a small
query over data you already store, and together they are what makes this look like a control plane
rather than a stats page.

## 1.6 §25 — IP/device visibility and privileged-action confirmation

**IP/device**: an Admin Sessions view listing active and recent sessions with IP, user agent,
started, last seen, and the ability to revoke one. Flag a session from an IP that admin has not used
before. The data is already captured on `AdminSession` — this is display plus one comparison.

**Privileged-action confirmation**: §25 names it explicitly. Required on **delete organisation**,
**manage global admins**, and **security configuration**. Reuse the pattern from the plan editor —
type-to-confirm plus a stated consequence, not a bare "are you sure". The confirmation is recorded
in the audit entry for the action.

## 1.7 §28 — mass data export

The one condition reclassified from impossible to missing. `lib/crm/exportEngine.ts` +
`app/api/crm/bulk/route.ts` is a real export feature with no audit signal.

Add a thin, additive audit write at the bulk-export route: actor, tenant, entity type, record count,
format. Wrapped so it can never throw back into the export. Then the alert is a threshold on record
count, using the same `PlatformAlertConfig` and dedupe as the other four.

That takes §28 to **7 of 10**, with three genuinely impossible and documented.

## 1.8 §14 and §20 — leave as they are, but make them legible

Both are correctly resolved with real data ceilings. No further build work. What they need is that
the QA document and the UI say so plainly, so nobody files a bug against a documented limit.

## 1.9 §26 and §19 — the two re-verification items the matrix names

§26: the `SUPPORT_ADMIN` detail-access gate is unit-tested only. **Verify over real HTTP with a
live `SUPPORT_ADMIN` account** — no grant, blocked; grant approved, allowed; grant expired, blocked
again.

§19: `PlatformAuditLog` never writing to `ActivityLog` is currently an inference. **Prove it in
`INTEGRATION.md`** with a source-grep, same technique as the gateway test.

---

# PART 2 — THE UI QUALITY BAR

Everything above adds screens. They have to look and feel like part of this product, not like an
internal tool bolted on. This section is as much a requirement as the functional ones.

## 2.1 Match the existing theme, do not invent one

Read how the existing ERP modules are built — `/finance`, `/sales`, `/crm` dashboards and their
components — and match them: the same component library, spacing scale, typography, colour tokens,
table patterns, form controls, button hierarchy, card composition, and empty-state styling. If the
repo has design tokens or shared components, use them; do not write parallel styling.

The platform surface can be visually distinct enough that an operator knows they are in the control
plane — a different accent, a distinct header — but it must be recognisably the same product.

## 2.2 Every screen handles four states

For every page, panel, table and tile:

- **Loading** — a skeleton or spinner, never a blank flash, never layout shift when data arrives.
- **Empty** — an explanation and, where relevant, the action that would populate it. Never a bare
  "No data".
- **Error** — a readable message and a retry. Never a raw stack trace, never a silent blank.
- **Populated** — the real thing.

A screen that only handles the populated state will fail on a tester's first empty tenant.

## 2.3 Usability details that decide whether this is pleasant to use

- Tables: server-side pagination, sortable where it makes sense, a visible total count, sensible
  column widths, and no horizontal scroll on a normal laptop.
- Long values (organisation names, reasons, user agents) truncate with the full value on hover.
- Every destructive or privileged action states its consequence before confirming.
- Every form validates inline, keeps the user's input on failure, and shows a specific error —
  never "something went wrong".
- Every mutation gives feedback: success toast, updated row, or a clear failure.
- Dates show the organisation's timezone with the zone named (Hard Rule 12).
- Money and large numbers are formatted consistently with the rest of the product.
- Keyboard accessible: tab order, focus states, Escape closes dialogs.
- Responsive down to a laptop width at minimum. This is an internal tool, so a phone is not
  required — but nothing may be unusable or clipped at 1280px.
- **Run IDs and record IDs are visible and copyable**, so a QA bug report can carry one.

## 2.4 Navigation

The platform sidebar should reflect the §2 hierarchy — Organisations, Subscriptions/Billing, AI
Usage, Platform Configuration, Security & Access, Audit Logs, Monitoring. Group the new pages
sensibly rather than appending them in build order. An operator should find a feature without
being told where it is.

---

# PART 3 — PERFORMANCE

Measure, do not assume. Record in `docs/admin/verification/PERFORMANCE.md`.

| Surface | Budget (p95) |
|---|---|
| Platform dashboard, fully loaded | < 2s |
| Organisation list, first page | < 1s |
| Organisation detail, any tab | < 1.5s |
| Global search | < 1.5s |
| Audit log view, filtered | < 1.5s |
| Any mutation (assign plan, set limit, change status) | < 1s |
| Scheduler run-due, typical | within its own window |

Test at realistic scale: **500+ organisations, 100k+ audit rows, 50k+ AI usage records.** The demo
tenant is not enough to find an N+1.

Specific things to check, because they are where this design will hurt:
- The organisation list computes derived fields per row (active users, last activity, AI usage). At
  500 rows that must be batched, not per-row. The matrix says it is batched per page — verify at
  scale.
- Dashboard KPIs will be fourteen separate queries unless they are parallelised or aggregated.
- Audit log filtering needs the right indexes; confirm they exist for the filter combinations the
  UI offers.
- Global search across many collections — check it does not scan.

Any breach: fix it, or make it explicitly async with a visible loading state and say so in the doc.

---

# PART 4 — EDGE CASES

Test every one of these against every new surface. Where it does not apply, say why.

**Data shape** — zero records; exactly one; 500+; a record with every optional field null; names
with unicode, apostrophes, emoji, 200 characters; amounts that are zero, negative, or very large;
a tenant with no users; an organisation created one minute ago and one created two years ago.

**Configuration** — no plan assigned; no AI limit; no retention policy; no account mapping; no
organisation type; an organisation whose plan was deleted or deactivated; `planAssignmentPending`
set.

**Boundaries** — usage at exactly 0%, 50%, 75%, 90%, 100%, and over 100%; a limit of zero; a
period boundary at month end; an organisation created on 29 February; timezone edges around
midnight (Hard Rule 12).

**State** — suspended, archived, cancelled, payment-hold organisations rendered everywhere they
appear; a grant expiring while a page is open; two admins editing the same plan concurrently; a
session revoked mid-request.

**Permissions** — every one of the seven roles against every new screen. Each must either work or
be refused cleanly with an explanation — **never a blank page, never a crash, never a silent
partial render**.

**Failure** — the database slow or unavailable; a gateway read denied; a scheduler job failing
mid-run; a mutation failing after a partial write.

**The adversarial question, once per screen:** *what input would make this show a confidently wrong
number that an operator would believe?* A usage percentage against a null allocation, a cost from a
missing rate, a KPI summing a stale rollup, a count that silently excludes suspended organisations.
Find them and test them. **A wrong number that looks right is the worst failure this product can
have**, because an operator will act on it.

---

# PART 5 — VERIFY EVERYTHING

Then run Phase 10's Part 3 sweep, unchanged, over the whole matrix.

A row is **VERIFIED** only when: reachable through the UI by the right role; works end to end,
observed; refused for the wrong role, observed; handles empty, missing-config and bad-input without
an error page or a fabricated value; and all data is real.

`COVERAGE_MATRIX.md` gains a **second status column**: *Implemented* and *Verified working*
separately. Those are different claims and the distinction is the whole point of the document now
that it is read outside engineering.

The nine cross-phase integration checks from Phase 10 Part 3.2 still stand — particularly that the
plan shown in the list, the detail tab and the AI allocation all agree for the same organisation,
before and after a plan change.

---

# PART 6 — RELEASE GATES

```
[ ] Full targeted UI regression scan — production build, targeted routes + 20-route canary +
    every /platform route. Still never run in this project.
[ ] Route-by-route API surface diff: every added route enumerated, every existing one unchanged
[ ] INTEGRATION.md complete, including §19's source-grep proof
[ ] HARD_RULES.md: all 15, each with proof and test
[ ] PERFORMANCE.md: every budget measured at realistic scale
[ ] Clean tree + fresh-worktree build and test at every gate
[ ] Full suite, tsc, eslint, production build all green against baseline
[ ] noStaticData.test.ts clean against every new page
[ ] Golden-dataset suite run and pass rate reported (Addendum A Part 1, still open)
[ ] Four-claim-failures section written (Addendum A Part 3, still open)
```

---

# PART 7 — HANDOVER

Extend `GLOBAL_ADMIN_Test.md` to every new surface: the four tabs, the eighteen KPIs and six
panels, activity filters, admin sessions, privileged confirmations, the security log view, the
mass-export alert, and the scheduled-jobs panel.

**Re-run every case — old and new — in a real browser.** SELFRUN says "browser", with a screenshot
for anything visual. A failing case means fix the product and re-run. Never soften an expected
result.

The known-limits section, in plain English, must include: MRR/ARR, storage, API usage, external API
monitoring, invoice/transaction search, the AI Agents bucket, email/webhook alerts, the three
impossible alert conditions, §20's tenant-module axis, the fixed `PLAN_KEY` enum, and the
scheduling situation — what runs on events, what needs the external trigger or a manual run, and
how a tester can tell.

---

# PART 8 — TO-DO LIST

```
SUPPLIED TEXT (Part 0)
[ ] §7's four missing tabs identified: Modules, Configuration, Security, Usage
[ ] HARD_RULES.md: all 15 rules, proof + test each; rule 12 checked hardest
[ ] ORGANIZATION_STATUS confirmed as exactly the 8 values; PAYMENT_HOLD does something real

CLOSE THE PARTIALS (Part 1)
[ ] §3 list: Organisation ID, Region, Usage % (null-safe), resolved plan not legacy tier
[ ] §7: Modules tab
[ ] §7: Configuration tab
[ ] §7: Security tab
[ ] §7: Usage tab
[ ] §7: Overview gains Storage + Monthly Revenue as explained empty states
[ ] §18: Date filter minimum; unavailable filters disabled with a reason
[ ] §21/§31: security log view decided, built, recorded in DECISIONS.md
[ ] §24: 14 real KPIs built; 4 as explained empty tiles
[ ] §24: all six operational panels
[ ] §25: Admin Sessions view with IP/device and new-IP flag
[ ] §25: privileged-action confirmation on the three named actions
[ ] §28: export audit signal + alert (7 of 10)
[ ] §26: SUPPORT_ADMIN gate verified over real HTTP
[ ] §19: ActivityLog isolation proven by source-grep

QUALITY (Parts 2-4)
[ ] Theme matched to existing modules; no parallel styling
[ ] Every screen: loading, empty, error, populated
[ ] Usability checklist 2.3 applied to every new surface
[ ] Sidebar reorganised to the §2 hierarchy
[ ] Performance measured at 500+ orgs / 100k+ audit rows; every budget met or fixed
[ ] Full edge-case matrix per surface, including the adversarial question
[ ] All seven roles against every new screen

VERIFY & RELEASE (Parts 5-7)
[ ] Matrix gains a separate "Verified working" column; every row filled
[ ] Phase 10 Part 3 sweep complete; every failure fixed
[ ] Nine cross-phase integration checks
[ ] All release gates in Part 6
[ ] QA document extended; every case re-run in a browser
[ ] Known limits in plain English
[ ] Final readiness statement
```

---

# PART 9 — RULES, UNCHANGED

Additive only · no static data · every privileged action audited · entitlements stay configuration ·
plan changes never delete tenant data · audit append-only · cross-tenant only through the gateway ·
UTC stored, tenant timezone displayed · no sensitive data in logs · full suite green before and
after every commit · clean tree and fresh-worktree verification at every gate · commit locally on
`global/admin`, **never push, never merge to `main`**.

---

Report at each of: Part 1 complete · Parts 2–4 complete · Part 5 complete · final.

Ask before acting only if a fix would require a non-additive change to existing tenant code, or if
the verification sweep turns up a whole feature that does not work rather than a bug in one that
does. Everywhere else, proceed.

---

One last thing. The matrix's closing line — *"every PARTIAL row's backend is IMPLEMENTED; what's
missing is almost entirely the admin UI to configure it"* — is both accurate and the reason this
phase is finishable. But it also means the remaining work is the part a human actually touches, and
therefore the part that will be judged. The backend discipline in this project has been excellent.
Give the surface the same care: an operator who hits a blank screen, a `NaN`, or a spinner that
never resolves will not trust the correct numbers sitting behind it.
