# AUPULENS — GLOBAL ADMIN CONTROL PLANE
# PHASE 9 — COVERAGE AUDIT, INTEGRATION HARDENING & PRE-QA

> **Phases 0–8 are accepted.** The work is disciplined: the cross-tenant gateway enforced by
> source-grep, the append-only audit store with the `.save()` guard a surface copy would have
> missed, suspension verified end-to-end over real HTTP, the `middleware.ts` 401 trap found by
> tracing control flow before shipping, and the honest empty states where data genuinely doesn't
> exist. That is the standard.
>
> **But "all 8 phases complete" is not the same as "every requirement in the CTO's document is
> implemented."** This phase closes that distinction before anything reaches the test team or an
> investor demo.
>
> Save this to `docs/admin/BRIEF-PHASE-9-COVERAGE.md`. Branch `global/admin`. Commit locally.
> Do not push. Do not merge.

---

# PART 0 — DECISIONS THAT UNBLOCK YOUR OPEN QUESTIONS

## 0.1 The §30 permission matrix, literal — `OPEN_QUESTIONS.md` #6 is now answered

You were right to flag that the matrix was never quoted to you, and right to implement it as data
so a correction is a seed re-run. Here it is verbatim from the source document:

| Capability | GLOBAL_SUPER_ADMIN | GLOBAL_ADMIN | AI_ADMIN | BILLING_ADMIN | READ_ONLY_ADMIN |
|---|---|---|---|---|---|
| View Organisations | Yes | Yes | Yes | Yes | Yes |
| Create Organisation | Yes | Yes | No | No | No |
| Suspend Organisation | Yes | Yes | No | No | No |
| Change Plan | Yes | Yes | No | **Yes** | No |
| Configure AI Limits | Yes | **No** | Yes | No | No |
| View AI Usage | Yes | Yes | Yes | Yes | Yes |
| View Audit Logs | Yes | Yes | Yes | Yes | Yes |
| Delete Organisation | Yes | No | No | No | No |
| Manage Global Admins | Yes | No | No | No | No |
| Security Configuration | Yes | No | No | No | No |

**Two cells almost certainly contradict what you seeded.** Your inferred default gave
`GLOBAL_ADMIN` "everything except delete-organisation / manage-admin-users / manage-security-config"
— which would grant it **Configure AI Limits**, and the matrix says **No**. And `BILLING_ADMIN`
must have **Change Plan**, which your inference may or may not have granted. Correct
`lib/platform/auth/roleMatrix.ts`, re-run the seed, and confirm
`tests/platform/permissionMatrix.test.ts` now generates from these ten rows exactly.

**`SUPPORT_ADMIN` and `SECURITY_ADMIN` are not in the matrix** — they appear only in §25's role
list. Keep your inferred defaults for those two, and mark them clearly in `roleMatrix.ts` as
*inferred, not specified*, so the distinction survives.

## 0.2 `OPEN_QUESTIONS.md` #10 — `SUPPORT_ADMIN` and standing access

Answered: **`SUPPORT_ADMIN` keeps the organisation *list*, but requires an active access grant to
open an organisation's *detail* tabs.** That is the reading of §26 that actually means something —
"supported access, not standing access" — and it gives the access-request workflow you built a real
job instead of leaving it as unwired infrastructure.

`GLOBAL_SUPER_ADMIN`, `GLOBAL_ADMIN`, `AI_ADMIN`, `BILLING_ADMIN` and `READ_ONLY_ADMIN` keep
standing detail access per the matrix above. Only `SUPPORT_ADMIN` and `SECURITY_ADMIN` are gated.
This is the one-file change plus the detail-function check you already scoped.

## 0.3 Confirmed as-is, no further action

- **#1 `master-admin`**: stays untouched, parallel, indefinitely. Add one line to
  `docs/admin/README.md` telling a future engineer which login is which and why both exist.
- **#2 status → `isActive`**: correct, verified, keep.
- **#4 MRR/ARR**: stays an honest empty state. Do not compute it from `tier`.
- **#9 email/webhook alerts**: in-app only, structurally enforced. Correct.
- **#11 `mongod` crashes**: environment, documented, fine.

---

# PART 1 — THE COVERAGE AUDIT (do this before writing any code)

Produce `docs/admin/COVERAGE_MATRIX.md`: **one row per numbered requirement in the source
document, §1 through §33.** Not per phase — per requirement. Where a section contains a list
(§3's columns, §7's tabs and fields, §13's dashboard metrics, §24's KPIs and panels, §28's alert
conditions), **each item gets its own row.**

| § | Requirement (verbatim) | Status | Implementation (file/route/UI) | Evidence | Gap |
|---|---|---|---|---|---|

Status is one of: `IMPLEMENTED` · `PARTIAL` · `MISSING` · `DECLARED_NOT_POSSIBLE` (with the real
data reason, e.g. MRR).

**This matrix is the artefact that proves nothing was left uncovered.** It is also what your CTO
can point at in an investor meeting. Build it honestly — a `MISSING` row is worth more than an
optimistic `IMPLEMENTED` one, because the second kind is what gets found on stage.

---

# PART 2 — GAPS I CAN ALREADY SEE FROM YOUR OWN DOCUMENTATION

Your logs are candid enough that several gaps are visible without re-reading the code. Verify each
against the matrix, then act per the classification.

## 2.1 MUST CLOSE — these are specified features, not edge cases

**§8 — "Global Admin must be able to manage subscription plans."** You built a catalogue you can
*view* and assign, and recorded "no UI exists yet to configure a Plan's own features." Viewing is
not managing. Build plan create/edit: price, billing cycle, max users, max companies, storage, API
requests, AI credits, AI requests, available modules, automation limits, document limits, support
level, feature flags. Gated on `MANAGE_PLANS` (map to Change Plan / Super Admin per 0.1).

**§11 — Custom enterprise plans.** The override layer exists in `OrganizationEntitlement`. There is
no way for an admin to *create* one. Build the override editor on the organisation's Subscription
tab: unlimited users, higher company counts, custom AI credits, custom module set. §11 is an
explicit requirement with a worked example.

**§15 — "Global Admin should be able to configure" monthly credits, daily credits, max requests,
max tokens, max cost.** You built `AiLimit` and all four at-limit behaviours, then recorded "no
admin UI to edit `AiLimit`/`AiOverageConfig`/`AiCostRate` rows yet (seed scripts only)." A limit an
admin cannot set is not a limit. Build the editor on the organisation's AI Usage tab, gated on
`CONFIGURE_AI_LIMITS` — which, per 0.1, `GLOBAL_ADMIN` does **not** have and `AI_ADMIN` does. That
gating is itself a good test of the corrected matrix.

**§16 — Overage controls**: enabled/disabled, rate, hard limit, soft limit, alert thresholds. Same
treatment, same tab.

**§24 — Dashboard KPIs.** You have organisation count, admin count, audit events and AI usage.
The specification lists: Total Organisations, Active Organisations, Trial Organisations, Suspended
Organisations, Total Users, Active Users, MRR, ARR, Active Subscriptions, Upgrades, Downgrades,
AI Requests, AI Cost, AI Credits Used, Storage Used, API Usage, System Errors, Security Alerts.

Most of these are computable from data you already have — organisation counts by status,
user counts across tenants via the gateway, subscription counts and upgrade/downgrade counts from
`SubscriptionEvent`, AI figures from the rollups, security alerts from `PlatformAlert`, system
errors from whatever error signal exists. **Build every KPI that real data supports. For the ones
that don't have data (MRR, ARR, Storage Used, API Usage), render the honest empty state you
already use — but render the tile, so the operator can see the metric exists and why it's blank.**
A missing tile reads as an oversight; an empty tile with a reason reads as honesty.

**§24 — Operational panels**: Recent Organisations, Recent Subscription Changes, AI Usage Alerts,
Security Alerts, System Errors, Recent Global Admin Actions. You have an Alerts panel. Build the
rest — every one of them is a small query against data you already store, and together they are
what makes the dashboard look like a control plane rather than a stat page.

**§7 — Organisation detail tabs.** You shipped 7 of 11 and recorded the rest as deferred. Close
them: **Modules** (view and toggle the organisation's enabled modules, driven by entitlements —
this is the natural home for the §10 entitlement UI), **Configuration** (country, currency,
timezone, tax jurisdiction, the settings applied at creation), **Security** (MFA status of the
organisation's users, recent logins, failed-login count, active sessions — whatever the tenant data
genuinely supports), **Billing** (subscription history from `SubscriptionEvent`, current plan,
allocation — with the revenue line honestly blank).

**§7 — Overview fields**: Storage and Monthly Revenue are in the specified field list. If neither
is computable, they still appear as labelled, explained empty states.

**§3 — Organisation list columns.** The specification names: Organisation ID, Name, Type, Country,
Region, Subscription, Status, Users, AI Usage, Usage %, Created Date, Last Activity. Your list
shows name, type, country, **tier**, status, active users, AI usage, created, last activity.
Check: Organisation ID, Region, and **Usage %** appear missing, and "tier" should be the resolved
**plan** from the entitlement resolver, not the legacy `Organization.tier` label — otherwise the
list contradicts the Subscription tab for any organisation with an assigned plan. That
inconsistency would be found in the first ten minutes of QA.

**§18 — Organisation activity log filters**: user, action, module, date, IP, device, severity.
`ActivityLog` is free text with no structured fields, which you documented. Implement every filter
the data supports, and **state in the UI itself** which filters are unavailable and why. Do not
render a filter control that silently returns everything.

## 2.2 DECLARE, don't build

Confirm each is in the coverage matrix as `DECLARED_NOT_POSSIBLE` with its reason, and in the QA
document's "known limits":

- MRR / ARR (no platform billing exists)
- Email and webhook alert delivery (no sending infrastructure)
- External API monitoring with real traffic (no external API exists)
- Invoice ID / transaction ID in global search (no platform-level concept)
- Document Processing and AI Agents usage buckets (not yet instrumented)
- Storage used per organisation (unless a real figure is derivable from Cloudinary)

## 2.3 §31 — the data model list

`system_logs` and `security_logs` are named in §31 and appear in your brief's namespace plan, but
nothing in your logs says `PlatformSystemLog` or `PlatformSecurityLog` was built. Either build them
(a security log is the natural sink for failed admin logins, permission denials, suspicious access —
all of which §21's SECURITY category already defines) or record in the matrix that `PlatformAuditLog`
covers both with a `severity`-based view, which is a defensible design. **Decide and document;
don't leave it ambiguous.**

## 2.4 §25 — security controls not yet evidenced

MFA and session timeout are done. The specification also lists **IP/device monitoring** and
**privileged action confirmation**. You capture IP and user agent on sessions; surface them (an
admin sessions view, and a flag when a session appears from a new IP). And privileged actions —
delete organisation, manage global admins, security configuration — need an explicit confirmation
step, not just a capability check. §25 calls it out by name.

---

# PART 3 — INTEGRATION WITH THE EXISTING SYSTEM

This is what the user is most concerned about, and there is one finding in your own Phase 0
document that matters more than everything else in this brief.

## 3.1 `lib/middleware/moduleGate.ts` already exists — reconcile with it before anything else

`SYSTEM_INVENTORY_DELTA.md` §1 records: *"`lib/middleware/moduleGate.ts` bypasses
subscription-tier/module gating entirely for this role."* **A module gate already exists in this
codebase.** It reads `lib/constants/tiers.ts::getTierLimits()` — the hardcoded tier logic you
correctly identified as the anti-pattern §10 forbids.

Meanwhile Phase 3b built `lib/platform/entitlements/enforce.ts` and wired it into **one** of 424
routes, with the other 423 tracked as future work.

**Investigate and report before changing anything:** what does `moduleGate` already gate, where is
it applied, and how many routes or modules does it already cover? If it is applied broadly, then
the correct integration is **one change, not 423**: make `getTierLimits()` / `moduleGate` resolve
through `resolveEntitlements()` — with the existing hardcoded tiers as the fallback when no
entitlement row exists, exactly the bridge your resolver already implements.

That single change would make §10 genuinely true across everything `moduleGate` already protects,
without touching 423 route files. If instead `moduleGate` turns out to be narrow or barely used,
say so, and Phase 3b's route-by-route plan stands.

**Either way, do not leave two parallel enforcement mechanisms in the codebase** — that is exactly
the duplicate-module failure this project has avoided everywhere else. Resolve it, document the
decision, and make sure `enforce.ts` and `moduleGate` cannot diverge.

## 3.2 Integration verification — prove each seam, don't assume it

Produce `docs/admin/verification/INTEGRATION.md` with a proof for each:

| Seam | What must be proven |
|---|---|
| `middleware.ts` | The new `/platform` branch and the widened `isPublicApi` exemption changed no existing route's matching. Test a route from each module, authenticated and not |
| `auth.ts` | An admin session cannot satisfy a tenant route; a tenant session cannot satisfy a platform route; `master-admin` still works exactly as before |
| `Organization` additive fields | Every pre-existing reader of `Organization` still behaves identically with `status`/`organizationType`/`region` present and absent |
| `isActive` side-effect | Suspension blocks login; reactivation restores it; no other code path that reads `isActive` is disturbed |
| `SubscriptionEvent` | The new `plan_assigned` and `status_changed` types don't break any existing reader that switches on `type` |
| `lib/ai/tenantAi.ts` | The `*WithUsage` switch is invisible to every existing caller. You fixed two test files twice for this — prove there is no third consumer |
| `lib/ai/claude.ts` | Original `callClaude` / `callClaudeWithHistory` / `callClaudeStream` untouched and still used correctly elsewhere |
| `lib/constants/tiers.ts` | Existing tenant-facing reads unchanged, whatever 3.1 decides |
| `ActivityLog` | Still written only by `lib/logger.ts`; the platform audit store never writes to it |
| `vercel.json` | Your two new cron entries do not disturb the pre-existing ones. Your Phase 4 note says the file was found empty at repo root despite the inventory claiming otherwise — **resolve that discrepancy**. If the pre-existing crons are genuinely unregistered, that is a live production problem worth reporting even though it is not yours |

That last one deserves attention. If `vercel.json` really is missing the CRM, sales and
business-health cron entries the inventory documented, then scheduled jobs are not running in
production. Confirm it, and report it separately — it is out of your scope to fix but not out of
scope to flag.

---

# PART 4 — THE PRE-EXISTING AI-RUNTIME REGRESSION (`OPEN_QUESTIONS.md` #5)

Three files, five tests, failing deterministically on this branch —
`ai07AccrualIntelligence`, `ai21StatementIntelligenceEdgeCases`, `ai29ControlMonitoringEdgeCases` —
which were passing on 2026-09-03 and failing by 2026-09-09.

You were correct not to fix them inside the admin brief. But **these are the AI workflows the CTO
is about to demo**, and they are failing in accrual intelligence, statement intelligence and
control monitoring. "Out of scope" is the right call for a phase; it is the wrong call for a
release.

Do this now, as a separate, clearly-labelled piece of work:
1. **Diagnose each of the five.** Product bug or test bug? Get to a root cause, not a symptom.
2. **Find what changed** between 09-03 and 09-09 on `main` that caused it — `git log` between those
   dates over `lib/aiRuntime/**` and the accounting libs they touch.
3. **If it is a product bug, fix it** with a regression test, in a commit clearly separated from
   the admin work so it can be cherry-picked or reverted independently.
4. **If it is a test bug** (a stale expectation, a date-dependent assertion — the AI project found
   a real wall-clock bug of exactly this shape), fix the test and say so.

Report this separately from the admin report. Your user needs to know whether the AI layer that
was signed off two weeks ago is still sound.

---

# PART 5 — THE REGRESSION PROOF THE PROJECT HASN'T HAD YET

Every phase deferred the full UI scan with a defensible reason. The reasons were good; the
cumulative effect is that **no phase of this project has ever run the full targeted UI regression
scan**, and 127 files have been touched.

Run it now, properly, per `docs/ai/UI_REGRESSION.md`:
- Production build (`npm run build:local` + `start`), not a dev server.
- The targeted route list: every route whose module appears in
  `git diff --stat main...global/admin`'s import graph, **plus** the fixed 20-route canary, **plus**
  all 36 new `/platform/*` routes.
- Compare against the baseline. The four known-broken routes may fail; nothing else may.
- Record the result in `docs/admin/verification/INTEGRATION.md`.

Also settle the baseline question: `SYSTEM_INVENTORY_DELTA.md` §7 says `artifacts/api-surface.txt`
went 412 → 424 before you started; Phase 8 reports 448 API routes and 252 pages in the production
manifest. Produce the final diff — **every added route enumerated, every pre-existing route
confirmed unchanged** — so "zero regression" is a list, not an assertion.

---

# PART 6 — YOUR OWN QA PASS, BEFORE THE TEST TEAM'S

Your SELFRUN log says every case was executed "via UI-equivalent HTTP steps or a cited automated
test." That was honest, and it was the right standard for a build phase. It is not the standard for
a handover, because the test team will be clicking, and a route that works over `curl` can still be
unreachable through the interface.

**Re-run every case in `docs/admin/GLOBAL_ADMIN_Test.md` in a real browser**, against the demo
tenant, clicking what a tester would click. For each: observed result, and a screenshot for
anything visual. Update the SELFRUN log with **how** each was observed this time — "browser",
not "equivalent HTTP call".

Any case that fails: **fix the product and re-run.** Never soften the expected result — the whole
value of that document is that QA can trust its expectations.

Then extend the QA document to cover everything Part 2 adds — plan management, custom plans, AI
limits, overage, the new tabs, the new KPIs and panels, the security controls. Every new case gets
the same browser-verified treatment.

---

# PART 7 — STOP GATE

```
[ ] §30 matrix corrected to the literal table; GLOBAL_ADMIN no longer has Configure AI Limits;
    BILLING_ADMIN has Change Plan; SUPPORT_ADMIN/SECURITY_ADMIN marked as inferred
[ ] SUPPORT_ADMIN detail access requires an active grant (0.2)
[ ] COVERAGE_MATRIX.md complete: one row per requirement, §1–§33, every list item its own row
[ ] Zero rows left ambiguous — everything is IMPLEMENTED, PARTIAL with a plan, MISSING with a
    reason, or DECLARED_NOT_POSSIBLE with the data reason
[ ] §8 plan management UI (create/edit a plan's features)
[ ] §11 custom enterprise override editor
[ ] §15 AI limit editor, gated on CONFIGURE_AI_LIMITS
[ ] §16 overage controls
[ ] §24 every KPI that real data supports; the rest as explained empty tiles, not absent tiles
[ ] §24 all six operational panels
[ ] §7 all 11 tabs present; Storage and Monthly Revenue as explained empty states
[ ] §3 list shows Organisation ID, Region, Usage %, and the RESOLVED plan (not legacy tier)
[ ] §18 filters implemented where data supports them; unavailable ones stated in the UI
[ ] §25 IP/device visibility and privileged-action confirmation
[ ] §31 system/security logs built, or documented as covered by PlatformAuditLog severity views
[ ] moduleGate vs enforce.ts reconciled; one mechanism, documented decision, no divergence
[ ] INTEGRATION.md: every seam in 3.2 proven, not assumed
[ ] vercel.json cron discrepancy investigated and reported
[ ] The 3 AI-runtime failures diagnosed and fixed, in separate commits, reported separately
[ ] Full targeted UI regression scan run for the first time; result recorded
[ ] API surface diff enumerated route by route
[ ] Every QA case re-run in a real browser; SELFRUN log updated with "browser" as the method
[ ] QA document extended to cover every Part 2 addition, browser-verified
[ ] Full suite green vs the recorded baseline; tsc clean; eslint introduces nothing new
[ ] Production build clean
```

---

# PART 8 — HOW TO REPORT

Three reports, in order. Do not batch them.

**Report 1 — after Part 1 and Part 3.1.** The coverage matrix summary: how many requirements are
implemented, partial, missing, and declared-not-possible. Plus the `moduleGate` finding, which
changes how much work Part 2 actually is. **Stop and report here before building anything** — if
the matrix shows more gaps than Part 2 lists, the plan needs adjusting before you start.

**Report 2 — after Part 2 and Part 4.** What was built, and the AI-runtime diagnosis.

**Report 3 — final.** The stop gate with evidence, the browser SELFRUN summary, the UI scan and
API diff results, and an explicit list of anything still open.

---

## Two things to hold on to

**Work carefully and narrowly.** This codebase is large, the existing features are in use, and
they will not be re-tested from scratch. Every change in this phase should be additive, scoped to
one thing, and followed by the relevant existing test file — the way Phase 3b proved enforcement on
one route with a pre-existing test rather than a bulk edit. Where a change touches shared code
(`moduleGate`, `tiers.ts`), that is its own commit with its own verification.

**Be as candid in the coverage matrix as you have been everywhere else.** The documentation you
produced across nine phases is unusually honest — the deferred tabs, the one-of-424 routes, the
inferred matrix, the environment incidents you refused to quietly retry away. That honesty is what
makes this build trustworthy. A coverage matrix with a few `MISSING` rows and real reasons is a
better artefact for an investor conversation than a green one nobody can verify.
