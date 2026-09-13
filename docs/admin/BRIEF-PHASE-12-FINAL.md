# AUPULENS — GLOBAL ADMIN, PHASE 12 (UPDATED)
# FINAL SESSION: SEEDING, VERIFICATION, QUALITY, RELEASE GATES & SIGN-OFF

> **This supersedes the earlier Phase 12 brief.** Two things changed: data that does not exist may
> now be seeded (Part 0), and the manual test guide is now a named, specified deliverable (Part 7).
>
> **Treat this as the last session.** Whatever is not finished here ships unfinished. Build Part 11's
> to-do list as your first action, work it top to bottom, and if time runs short stop at a clean
> commit and say exactly where you stopped — never leave something half-done and unreported.
>
> Save to `docs/admin/BRIEF-PHASE-12-FINAL.md` and commit before starting.
> Branch `global/admin`. Commit locally. **Never push. Never merge to `main`.**
>
> Part 1 is accepted: all 33 sections implemented, all ten `PARTIAL` rows closed, the three
> "cannot confirm" items resolved. The hard-rule-12 timezone bug you found — every admin timestamp
> rendering in the viewing admin's browser timezone, unlabelled — is exactly the class of defect
> `HARD_RULES.md` existed to surface, and it would have reached production silently.

---

# PART 0 — SEEDING, AND RE-TRIAGING WHAT WAS DECLARED IMPOSSIBLE

## 0.1 The rule that does not change

**Never fabricate a value inside a production code path.** A number an operator sees must be
derived from something real, or must not be shown.

**But seeding real data into the demo tenant is not fabrication — it is how a feature becomes
testable.** The product is pre-launch; there is no live data yet. So where a feature's *mechanism*
is real but there is no data flowing through it, seed the data and make the feature demonstrable.

The distinction, precisely:

| Allowed | Not allowed |
|---|---|
| Seeding `ApiUsage` rows for the demo tenant so the monitoring screen renders and can be tested | Hard-coding an API-usage number into the dashboard component |
| Persisting file sizes at upload so storage becomes a real, computed figure | Estimating storage from a record count |
| Deriving MRR from assigned plans' real prices, labelled as contracted | Deriving MRR from a tier label with an invented price |
| A seed script that creates realistic history in `ai-demo-tenant` | A component that returns sample data when the query is empty |

Everything seeded lives in the demo tenant and is removed by `reset-platform-demo.ts`. No seed
script writes to a real tenant.

## 0.2 Re-triage every `DECLARED_NOT_POSSIBLE` item — several are now buildable

The declared list was built phase by phase, and the system has changed underneath it. **Check each
against the code as it stands today, not against an earlier phase's wording.** My reading is that
at least five of these are now real work rather than real ceilings:

**MRR and ARR — likely buildable, and honestly.** `Plan` carries a real `price` and
`billingCycle`. `OrganizationEntitlement` records which organisations are on which plan. So
*contracted* monthly recurring revenue is a real sum over active subscriptions, not an invention.
Build it, and **label it precisely**: "Contracted MRR — the sum of assigned plan prices for active
organisations. No payments are collected; this is not realised revenue." ARR is that × 12 with the
same label. That is honest, useful, and green. If you disagree after looking, say why.

**Storage Used — buildable.** Your own audit found the specific mechanism: `lib/upload.ts` knows
each file's byte size at upload and enforces a limit with it, then throws the value away. Persist
it — a lightweight per-tenant storage-usage record, written additively at the existing upload call
site, wrapped so it can never fail an upload. Then Storage Used is real, and the §7 Usage tab and
the §24 KPI both have a genuine figure. Backfill is not required; state that the figure counts from
the point instrumentation began.

**System error spike — buildable.** You now have `SchedulerJobRun` failure state feeding the System
Errors KPI. That is a real error signal. Wire the §28 alert condition to it with a configurable
threshold, using the same `PlatformAlertConfig` and dedupe as the other seven.

**Invoice / transaction search — re-check.** The earlier claim was "no platform-level invoice
concept." But tenant invoices are real — `models/finance/Invoice.ts` and
`models/sales/SalesInvoice.ts` — and global search is already cross-tenant through the gateway.
Searching a tenant invoice ID from the control plane looks buildable. Check it; if it is, build it;
if there is a real obstacle, record the specific one.

**Webhook alert delivery — buildable; email is not.** A webhook delivery is an HTTP POST to a
configured URL with a signed payload. Build it, with the target URL configurable per alert type on
the security-config page, retries capped, delivery result recorded on the alert. Email needs SMTP
credentials this environment does not have — leave it as an adapter interface with a clear
"not configured" state, so wiring a provider later is configuration rather than code.

**Genuinely still ceilings, after checking:** the AI Agents usage bucket (no signal distinct from
AI Automation — both are the same `AiWorkflowRun` mechanism), payment-failure alerts (the gateway
integration is real but deliberately stubbed), and §20's tenant-module axis (`ActivityLog` has no
structured module field and inferring one from prose is the heuristic this project has correctly
declined throughout). **Unusual API usage** depends on whether you build real API-key issuance — if
you do not, it stays declared.

**Report the re-triage before building.** I want to see which moved and why, because it changes how
much of this session is build work.

## 0.3 Seed the demo tenant properly

Extend `seed-platform-demo.ts` so **every screen has something real to show**:

- 15–20 organisations across every status, type and plan — including suspended, archived,
  payment-hold, trial, and one with `planAssignmentPending`.
- Tenant users per organisation with varied MFA status and login history.
- 12+ months of AI usage across all feature buckets and multiple models, so the dashboard's
  trends, Top Models and Top Organisations are meaningful rather than single-row.
- Audit and security events across every category and severity, spanning enough time for retention
  and filtering to be testable.
- Subscription history with real upgrades and downgrades, including one large downgrade that
  triggers its alert.
- Alerts of every wired condition, some resolved and some open.
- Scheduler job runs including one failed, so the System Errors KPI and the Scheduled Jobs panel
  are non-empty.
- Admin users across several roles, so a tester can log in as `SUPPORT_ADMIN` and `READ_ONLY_ADMIN`
  and see the permission boundaries for themselves.
- Storage and API-usage rows once 0.2's instrumentation exists.
- One access-request in each lifecycle state.

Deterministic and seeded, so it reproduces exactly. `reset-platform-demo.ts` must return a broken
state to a clean one — testers will break things.

**Also seed a deliberately empty organisation**, so the empty-state behaviour in Part 2.2 is
testable without deleting anything.

---

# PART 1 — WHAT "DONE" MEANS THIS SESSION

Every row of `COVERAGE_MATRIX.md` ends in exactly one of two states:

- **`VERIFIED`** — implemented *and* proven working end to end against Part 5's five-point standard.
- **`DECLARED_NOT_POSSIBLE`** — with a reason checked directly against the code **in this session**,
  after the 0.2 re-triage.

**Zero rows may end as partial, pending, unknown, in progress, or untested.**

---

# PART 2 — THE UI QUALITY BAR

## 2.1 Theme consistency

Read how `/finance`, `/sales` and `/crm` are built and match them: component library, spacing scale,
typography, colour tokens, table patterns, form controls, button hierarchy, card composition,
empty-state styling. Use the repo's shared components and tokens; no parallel styling. The platform
surface may be distinguishable — a different accent, a distinct header — but must read as the same
product. Walk every `/platform/**` page and fix anything that looks like a different application.

## 2.2 Four states, every surface

Every page, panel, table, tile and dialog handles: **Loading** (skeleton, no blank flash, no layout
shift), **Empty** (an explanation and the action that would populate it — never a bare "No data"),
**Error** (readable message plus retry — never a stack trace, never a silent blank), and
**Populated**. The seeded empty organisation from 0.3 is how you test the second one.

## 2.3 Usability

Tables server-side paginated, sortable where sensible, visible total count, no horizontal scroll at
1280px · long values truncate with full value on hover · every destructive or privileged action
states its consequence before confirming · forms validate inline, keep input on failure, give a
specific error · every mutation gives feedback · **dates show the organisation's timezone with the
zone named, on every surface including tables, tooltips and the audit log** · money and large
numbers formatted consistently · keyboard accessible with focus states and Escape closing dialogs ·
**record IDs and run IDs visible and copyable** so a bug report can carry one.

## 2.4 Navigation

The sidebar reflects §2's hierarchy — Organisations, Subscription/Billing, AI Usage, Platform
Configuration, Security & Access, Audit Logs, Platform Monitoring — not build order.

---

# PART 3 — PERFORMANCE AT REALISTIC SCALE

Seed **500+ organisations, 100k+ audit rows, 50k+ AI usage records** (separate from the QA demo
seed) and measure. Record in `docs/admin/verification/PERFORMANCE.md`.

| Surface | Budget (p95) |
|---|---|
| Platform dashboard, fully loaded | < 2s |
| Organisation list, first page | < 1s |
| Organisation detail, any tab | < 1.5s |
| Global search | < 1.5s |
| Audit log / security log, filtered | < 1.5s |
| Any mutation | < 1s |

Check specifically: the organisation list's per-row derived fields at 500 rows, not 30; the
eighteen KPIs as one parallelised gateway call; indexes for every audit and security log filter
combination the UI offers; and that global search does not scan.

Any breach: fix it, or make it explicitly async with a visible loading state and record why.

---

# PART 4 — MANUAL TEST GUIDE: `docs/admin/GLOBAL_ADMIN_TEST.md`

**This is the deliverable the user reviews and hands to the test team.** Treat it as a product in
its own right.

## 4.1 Who reads it

**A finance-literate tester who does not read code, will not open a terminal, and has never seen
this system.** Every instruction must be performable by clicking. No commands, no file paths, no
API references, no jargon.

If a feature can only be observed in the database, either surface it in the UI or say plainly in
the guide that it is not observable and why — a feature QA cannot see is a feature QA cannot sign
off.

## 4.2 Structure — front matter, before the feature sections

1. **What this system is** — one page, plain English. What the Global Admin does, who uses it, and
   how it differs from the customer-facing product.
2. **Getting started** — the URL, how to log in, MFA enrolment step by step, and what to do if
   locked out. Name the seeded accounts and which role each has, so a tester can switch roles.
3. **The demo data** — what has been seeded and what to expect: how many organisations, which are
   suspended or archived, which has no data at all. So a tester knows what "correct" looks like.
4. **How to read a result** — what the Attention/Alerts queue is, what an audit event is, what an
   explained empty state means and why it is not a bug.
5. **How to report a problem** — what to capture: the screen, the exact steps, what they expected
   from this guide, what happened, the record ID shown on screen, and a screenshot. Severity
   guidance: what counts as critical (MFA bypassed, suspended organisation still logging in,
   another organisation's data visible, an audit record editable) versus normal.
6. **Known limits — read before reporting anything.** The plain-English list from Part 8.3.

## 4.3 One section per feature area — this exact shape

```
## <Number>. <Feature name in plain English>

### What it does
Two or three sentences. What a person uses this for.

### Why it matters
One sentence: what goes wrong if it is broken.

### Before you start
What must be true first — which login, which organisation, anything that must have been done.

### Test cases

| # | Priority | What you do | What you should see | How to check it worked |
|---|----------|-------------|---------------------|------------------------|

### What must NOT happen
Bullet list of things that would be serious bugs if observed.

### Known limits — do not report these
Bullet list, plain English, with the reason for each.

### If something fails
What to capture and where the ID is on screen.
```

## 4.4 Rules for writing the cases

- **"What you do" must be literally clickable**: *"Click Organisations in the left menu, then click
  Acme Trading, then open the Subscription tab, click Assign plan, choose Pro, type 'Upgrade for
  testing' as the reason, and click Confirm."* Not *"assign a plan."*
- **"What you should see" must be specific enough to be wrong**: *"The plan changes to Pro, the max
  users figure changes from 5 to 50, and a new row appears in the history below showing your admin
  name, today's date and the reason you typed."* Not *"the plan updates."*
- **Every feature area gets at least one case that should produce nothing** — the false-positive
  check. Testers only look for those if told to.
- **Every feature area gets at least one permission case** — try it as a role that should be
  refused, confirm a clear refusal rather than a blank screen.
- **Priority each case P1, P2 or P3.** P1 alone must cover every feature's core path, so a two-day
  QA cycle still covers everything.
- Order the sections the way a tester would work: log in → organisations → plans → AI → logs →
  security → monitoring.

## 4.5 Cover every feature

One section each, at minimum: admin login and MFA · admin sessions · manage global admins ·
organisations list and search · create organisation · organisation statuses including suspension
and payment hold and archiving · all eleven detail tabs · plans and plan editing · assigning a plan
and custom overrides · AI usage dashboard · per-organisation AI usage, limits and overage · audit
logs and filters · security log · activity log and its filters · retention · global search · alerts ·
organisation access requests · API monitoring · scheduled jobs · platform dashboard KPIs and panels.

## 4.6 Every case must have been run by you, in a browser, before this ships

Not "the test covers it" — clicked, observed. Keep `docs/admin/GLOBAL_ADMIN_TEST_SELFRUN.md`: case
number, when run, observed result, pass or fail, and for failures the fix and the re-run.

**Any case that fails: fix the product and re-run.** Never soften the expected result to match what
the code does — that would make this document worse than useless, because QA would sign off on a
broken build using your own words.

---

# PART 5 — VERIFY EVERY FEATURE

## 5.1 The standard

A row is **VERIFIED** only when all five hold: reachable through the UI by the role §30 says should
reach it · works end to end against the demo tenant, **observed** · refused for a role that should
not have it, **observed** · handles empty, missing-configuration and bad-input without an error page
or a fabricated value · all data real.

## 5.2 The sweep

Every `COVERAGE_MATRIX.md` row, §1 to §33, against 5.1. Add the **second status column**:
*Implemented* and *Verified working*, kept separate.

Nine cross-cutting checks, because they are where phases meet:

| Check | What to prove |
|---|---|
| Plan consistency | List, Subscription tab, Modules tab and AI allocation all agree for one organisation, before and after a plan change |
| Downgrade safety | Document counts across tenant collections identical before and after |
| Entitlement bridge | Untouched tenant byte-identical to pre-bridge; tenant with an explicit entitlement gets the admin's intent |
| AI limits gating | `GLOBAL_ADMIN` refused, `AI_ADMIN` allowed — observed in the UI |
| Support access | `SUPPORT_ADMIN` blocked without a grant, allowed with one, blocked again on expiry |
| Suspension | Blocks tenant login; reactivation restores it |
| `PAYMENT_HOLD` | Blocks login, and is reversible |
| Cross-tenant audit | Every gateway read audited, including read-only and zero-result |
| Retention | Deletes what it should, keeps what it should, deletion itself audited |

## 5.3 Edge cases

**Data** — zero records; exactly one; 500+; every optional field null; unicode, apostrophes, emoji,
200-character names; zero, negative and very large amounts; a tenant with no users.

**Configuration** — no plan; no AI limit; no retention policy; no organisation type;
`planAssignmentPending` set; a deactivated plan still assigned.

**Boundaries** — usage at 0, 50, 75, 90, 100 and over 100 percent; a limit of zero; month end;
29 February; **midnight in the organisation's timezone versus the server's**.

**State** — suspended, archived, cancelled and payment-hold organisations rendered everywhere they
appear; a grant expiring while a page is open; two admins editing the same plan concurrently; a
session revoked mid-request.

**Permissions** — all seven roles against every screen. Each must work or be refused cleanly.
**Never a blank page, never a crash, never a silent partial render.**

**Failure** — database slow or unavailable; gateway read denied; scheduler job failing mid-run;
mutation failing after a partial write.

## 5.4 The adversarial question, once per screen

*What input would make this show a confidently wrong number an operator would believe?*

You found one of exactly this shape already — the naive status query undercounting active
organisations because `status` is unset on pre-existing records. Find the rest: a usage percentage
against a null allocation, a cost from a missing rate, a KPI over a stale rollup, a count that
excludes a status silently, a total that omits a second code path, **contracted MRR mistaken for
collected revenue**. A wrong number that looks right is the worst failure this product can have.

## 5.5 Fix everything

Every failure found is fixed, regression-tested and re-verified this session. Anything that
genuinely cannot be fixed goes to known limits in plain English and to the final report's open
items. **Nothing gets quietly left.**

---

# PART 6 — RELEASE GATES

```
[ ] Full targeted UI regression scan — production build, targeted routes + 20-route canary +
    every /platform route. NEVER RUN IN THIS PROJECT. ~140 files touched. Only the four
    known-broken baseline routes may fail.
[ ] Route-by-route API surface diff
[ ] INTEGRATION.md complete — middleware, auth, Organization additive fields, isActive,
    SubscriptionEvent, tenantAi, claude.ts, tiers.ts, ActivityLog, moduleGate, upload
    instrumentation, scheduler hooks
[ ] HARD_RULES.md — all 15, proof and test each
[ ] PERFORMANCE.md — every budget measured at scale
[ ] noStaticData.test.ts clean against every /platform page
[ ] Clean tree + fresh-worktree build and test
[ ] Full suite, tsc, eslint, production build green against baseline
[ ] Golden-dataset suite run across the AI workflows; pass rate reported
[ ] Four-claim-failures section written in docs/ai/ with the two preventing checks
```

---

# PART 7 — THE FINAL STATUS REPORT

Produce `docs/admin/FINAL_STATUS.md` with **exactly this table**, one row per section:

```
| § | Feature | Implemented | Verified working | Notes |
|---|---------|-------------|------------------|-------|
```

- `Implemented` is **Yes** or **Declared-not-possible**. Nothing else.
- `Verified working` is **Verified (browser)**, **Verified (automated + HTTP)**, or **Declared**.
  Nothing else.
- **No cell may say partial, pending, in progress, unknown, TBD, or blank.**
- `Notes` carries the data reason for anything declared, in one plain-English line.

Then five short sections: **Totals** (verified, declared, and the statement that zero are partial) ·
**What the test team is receiving** · **Known limits** · **Open items** (or "none") ·
**Readiness statement** — one paragraph on whether you consider this ready for QA.

---

# PART 8 — KNOWN LIMITS, PLAIN ENGLISH

After the 0.2 re-triage, the final list goes in both `FINAL_STATUS.md` and the test guide. Each
item gets one plain sentence and its reason. Expect it to be shorter than it was — several items
should have moved to built.

Whatever remains, plus: the fixed `PLAN_KEY` enum, delete-organisation deliberately unbuilt with
archiving as the supported path, the unavailable activity filters, and **the scheduling situation**
— what runs on events, what needs the external trigger or a manual run, and how a tester can tell.

---

# PART 9 — IF TIME RUNS SHORT

Strict priority. Stop at a clean commit and say exactly where.

1. **Part 0.2 re-triage and 0.3 seeding** — everything else depends on having data to test against.
2. **Part 5's verification sweep and every fix it produces.**
3. **Part 4's test guide, P1 cases, browser-verified.**
4. **Part 6's UI regression scan.**
5. **Part 7's final status table.**
6. Part 2's UI polish.
7. Part 3's performance measurement.

One to five is the minimum for a credible handover. Below that can be an open item without damaging
the delivery.

---

# PART 10 — BEFORE MERGE (record it, do not do it)

Note in `FINAL_STATUS.md`: `ai/workflows` holds the 30 AI workflows and should receive the four
`[AI-runtime]` fixes committed on this branch (kill-switch class defect, ai-07, ai-21, ai-29),
which are cherry-pickable. `global/admin` holds this work. Record merge order, expected conflicts,
and that `vercel.json` stays cron-free on the free plan with the scheduler's external trigger
configured instead.

---

# PART 11 — TO-DO LIST

```
SEED & RE-TRIAGE (Part 0)
[ ] Re-triage every DECLARED item against today's code; report what moved before building
[ ] MRR/ARR from real plan prices, labelled "contracted, not collected"
[ ] Storage Used — persist upload byte sizes additively; KPI and Usage tab become real
[ ] System error spike alert wired to scheduler job failures
[ ] Invoice/transaction search re-checked; built if possible
[ ] Webhook alert delivery built; email left as a configurable adapter
[ ] Demo seed extended per 0.3, including one deliberately empty organisation
[ ] reset-platform-demo verified from a broken state

VERIFY (Part 5) — THE PRIORITY
[ ] Every matrix row against the five-point standard; second status column added
[ ] Nine cross-cutting checks
[ ] Edge-case matrix per surface
[ ] Adversarial question per screen
[ ] Every failure fixed, regression-tested, re-verified

TEST GUIDE (Part 4)
[ ] GLOBAL_ADMIN_TEST.md — front matter + every feature area, clickable steps, specific
    expected results, false-positive and permission cases, priorities
[ ] Every case run in a browser; SELFRUN log written
[ ] Known limits in plain English

RELEASE GATES (Part 6)
[ ] UI regression scan (first time ever)
[ ] API surface diff; INTEGRATION.md, HARD_RULES.md, PERFORMANCE.md complete
[ ] noStaticData clean; clean tree; fresh worktree; suite/tsc/eslint/build green
[ ] Golden-dataset pass rate; four-claim-failures section

QUALITY (Parts 2-3)
[ ] Theme matched; four states everywhere; usability checklist; sidebar reorganised
[ ] Timezone display verified on every surface
[ ] Performance measured at scale; breaches fixed

SIGN-OFF (Part 7)
[ ] FINAL_STATUS.md with the exact table and five sections
[ ] Merge notes (Part 10)
```

---

# PART 12 — RULES, UNCHANGED

Additive only · **no fabricated values in production code paths — seeding the demo tenant is fine,
inventing a number in a component is not** · every privileged action audited · entitlements stay
configuration · plan changes never delete tenant data · audit append-only · cross-tenant only
through the gateway · UTC stored, tenant timezone displayed · no sensitive data in logs · full suite
green before and after every commit · clean tree and fresh-worktree verification at every gate ·
commit locally on `global/admin`, **never push, never merge to `main`**.

Ask before acting only if a fix would require a non-additive change to existing tenant code, or if
the sweep turns up a whole feature that does not work rather than a bug in one that does.

---

Across twelve phases this project has found a fail-open `act()`, a dead `maxAutonomyLevel`, a
kill-switch bypass across nine workflows, an undercounted KPI, a timezone bug in every timestamp,
eight silently deregistered cron jobs, a stale claim hiding a real miscount, and a suite passing
against uncommitted code. **Every one was found by someone trying to break a specific thing.**

A verification sweep that finds nothing has not been rigorous — it has confirmed the tests you
already wrote still pass. Do the hard version once more, fix what it finds, write the guide so a
tester can repeat it without you, and then this is genuinely ready.
