# CTO Feature Spec Rollout — Progress Log

Running log of the multi-phase rollout implementing the CTO AI/SaaS feature
spec on `main`, following the audit delivered earlier. Appended to after each
phase (not each commit). See `docs/_context/MEMORY.md` for this codebase's
own session-memory convention — this file is the user-facing counterpart.

**Test baseline going in (before any Phase 0 work): 669/669 passing, 68 files, `tsc --noEmit` clean.**

---

## Phase 0 — Azure OpenAI migration

Status: **Done, approved by user.**

- `lib/ai/claude.ts` rewritten to call Azure OpenAI (`openai` npm SDK's `AzureOpenAI` client) instead of Anthropic. Exported names (`callClaude`, `callClaudeWithHistory`, `CLAUDE_DEFAULT_MODEL`, etc.) kept stable so the 8 existing call sites didn't need touching.
- `lib/ai/tenantAi.ts`: comments only, logic unchanged.
- `app/api/ai/command/route.ts`: was instantiating its own direct Anthropic client, bypassing tenant gating entirely — rewired through `callClaudeForTenant`.
- `models/Organization.ts`: removed hardcoded `"claude-sonnet-4-6"` schema default on `settings.ai.model`.
- `.env`/`.env.example`: added the 4 Azure vars. `.env.example` had to be recreated from scratch — it didn't exist on `main` at all (deleted in a commit, `7c61522`, that's in `main`'s history but not `feature/native-ai`'s).
- `package.json`: added `openai`, removed `@anthropic-ai/sdk` (confirmed zero remaining importers first).
- Tests updated for the new provider: `tests/ai/claude.test.ts` rewritten to mock `openai`'s `AzureOpenAI`; `tests/saas/aiLimits.test.ts` and `organization-schema.test.ts` updated for the new default-model value.
- `SETUP_AI.md` created at repo root.

**Judgment calls:** kept `lib/ai/claude.ts`'s filename/exports despite being Azure-backed now (avoids touching call sites — flagged as a future cleanup). `CLAUDE_DEFAULT_MODEL` reads the chat-deployment env var at module-load time rather than being hardcoded (Azure deployment names have no universal default). *(Go-live update: the env var was reconciled from `AZURE_OPENAI_DEPLOYMENT_NAME` to the real `AZURE_OPENAI_CHAT_DEPLOYMENT` — see the "Go-Live" section at the end.)*

**Real TS gotcha found and worked around:** `if (result.gated) return...; result.text` doesn't type-check in this project because `tsconfig.json` has `strictNullChecks: false`, which breaks normal discriminated-union narrowing (confirmed via isolated repro — passes with `--strictNullChecks`, fails without). Did not touch the project-wide tsconfig. Fixed locally everywhere this pattern occurs by narrowing on `"text" in result"` instead of `result.gated`, which works either way. This recurs throughout Phase 0's follow-up below — noted once here, not repeated per occurrence.

**What could not be verified:** no live call against a real Azure OpenAI endpoint — this sandbox has no real Azure credentials. Verified by type-check + full mocked test suite only.

**Test results: 669/669 before → 669/669 after.**

---

## Phase 0 follow-up — route all 6 AI-assistant call sites through `callClaudeForTenant`

Status: **Done.**

User-flagged gap from the Phase 0 report: `tenantAi.ts`'s tenant kill-switch and monthly call-cap enforcement had **zero production callers** before this session — Finance/Sales/Inventory/HR/Admin all called the bare `callClaude()`/`callClaudeWithHistory()` directly, and Manufacturing's classification call did too. The command-center route fixed in Phase 0 was the only real caller. This meant the kill-switch and cap were fully built, unit-tested, and completely unenforced in the live app.

Fixed all 6:

- **Finance, Sales, Inventory, HR, Admin**: each route's `generateResponse`/`generateResponseWithClaude` (the main user-visible AI call) now resolves `{ tier, aiSettings }` via `resolveTenantAiSettings(tenantId)` once per request and calls `callClaudeForTenant` instead of the bare client. When gated, the route returns `403` with `{ error, code, currentTier?, requiredAction? }` — matching the shape `tenantAi.ts` already defined for exactly this purpose — instead of silently falling back to the deterministic non-AI summary. A real API failure (not gating) still falls back to the deterministic summary as before — that fallback behavior is unchanged, only tenant-level gating is now enforced ahead of it.
- **Admin** specifically: its separate intent-classification call (`analyzeQueryIntent`) was deliberately left on the bare `callClaude()` — this matches `tenantAi.ts`'s own documented convention ("internal classification calls... may still use callClaude() directly to avoid counting internal bookkeeping against the user's quota"). Only the main response generator was converted.
- **Manufacturing** required a different fix: it has no separate "main response" call at all — its plain-conversation path is 100% deterministic (zero AI), and its only real AI usage is inside `analyzeIntentAndExtractData` (task-intent classification), called from two places in the route (new-task path and continuation-of-task path). Per the user's explicit instruction to verify blocking on *all* 6 routes, this classification call was routed through `callClaudeForTenant` too — a deliberate departure from the "internal classification is exempt" convention, made because Manufacturing would otherwise have no AI call site to gate at all and could never be shown as blocked. Two other functions in that file (`analyzeTaskIntent`, `extractDataWithClaude`) call the bare client but are dead code with zero call sites anywhere — confirmed via grep, left untouched since they're unreachable (Phase 1 dead-code cleanup is the more appropriate place to remove them, not this fix).

**Verified with tests, not just wired up in theory** — for each of the 6 routes:
- A real (non-gated) call still returns 200 with a real response.
- `AI_DISABLED` (kill-switch on) returns 403 with the correct error code, and — checked explicitly — the route does **not** write to `ChatHistory` in the gated case (no wasted persistence for a call that never happened).
- `AI_LIMIT_REACHED` (monthly cap hit) returns 403 with the correct error code and `requiredAction: "upgrade"`.
- `resolveTenantAiSettings` is called with the actual authenticated tenant, not a hardcoded one.
- The pre-existing auth guards (401 on missing session/role/tenantId) are unaffected by this change.

`tests/ai/financeAiRoute.test.ts` (pre-existing) was updated to mock `lib/ai/tenantAi` instead of `lib/ai/claude` directly — its two tests that asserted "uses callClaudeWithHistory vs callClaude" no longer made sense once the branching moved inside the now-mocked wrapper, so they were replaced with equivalent assertions on the `history` option passed to `callClaudeForTenant`, plus 3 new gating tests. Five new test files were added for Sales/Inventory/HR/Manufacturing/Admin — these routes had no prior test coverage at all, so this is net-new coverage focused specifically on what the user asked to verify (gating), not full parity with Finance's more extensive pre-existing suite (DB query scoping, etc.) — noted as a deliberate scope choice, not an oversight.

**Test results: 669/669 → 698/698** (added 26 new tests across 5 new files + net +3 in the updated finance file). `tsc --noEmit` clean, `eslint` clean on every touched file.

**Committed as:** `dac4916` (Phase 0 + this follow-up combined into one checkpoint commit, since the follow-up was requested as "the first thing in Phase 1" before continuing — not a separate phase of its own).

---

## Phase 1 — Quick wins

Status: **Done.**

1. **Sidebar links uncommented** for Finance, Sales, Inventory, HR, Manufacturing AI assistants in `config/sidebar/*.ts` — all 5 pages were already fully functional, just unreachable via navigation. (Admin's `/admin/ai-assistant` was left alone — it was never in the original audit's list of 5 modules to fix, and CRM's `/crm/ai` was already live.)
2. **Built `app/accept-invite/page.tsx`**, wired to the existing `POST /api/auth/org/accept` route. Handles: missing token, not-signed-in (shows a "sign in with the invited email, then reopen this link" message + link to `/auth`), success (shows the workspace URL to sign in at), and API errors (already-accepted/revoked/expired/wrong-email, surfaced verbatim from the route's own message). Confirmed via reading `middleware.ts` that `/accept-invite` isn't swept into any of the module-specific auth gates (doesn't match any gated path prefix) and that `/api/auth/org/accept` is exempted from the blanket API-session-check (`isAuthApi` since it's under `/api/auth`), so the route's own `auth()` check and 401 response reach the page as expected.
   **Known UX limitation, not fixed:** `SignInForm.tsx`'s sign-in flow always redirects to the user's role dashboard after login — it doesn't support a `callbackUrl` return path. So after signing in from the accept-invite page's "Sign In" link, the user lands on their dashboard rather than being bounced back to finish accepting — they have to reopen the original invite link once more. Fixing this would mean changing the app-wide sign-in redirect behavior for every login, which felt like too large a blast radius for a Phase 1 quick win; flagged here rather than silently left unfixed.
3. **Desktop build fixes:**
   - `public/logo.png` (referenced by `electron-builder`'s icon config, didn't exist) — created from `app/favicon.ico`, which despite its extension is actually 428×397 PNG data (not a real `.ico` container). This is the closest-to-square, largest icon-shaped asset in the repo — the two other candidate PNGs (`logo-dark.png`, `logo-white(1).png`) are 890×228 wordmark banners, wrong aspect ratio for an app icon entirely. **Flagged, not fully resolved:** 428×397 isn't square either, so `electron-builder`'s auto-generated icon set will still look slightly off; a real 1024×1024 square icon from the design team is the actual fix. Could not generate one myself (no image editing tool available).
   - Fixed the Windows-only `set VAR=value && ...` build script syntax (confirmed broken empirically in Phase 0's audit — silently no-ops on bash) by switching to `cross-env` (added as a devDependency) across all 5 electron scripts (`electron:dev`, `electron:build`, `electron:build:win/mac/linux`). Re-verified empirically post-fix: `cross-env ELECTRON_BUILD=true node ...` correctly sets `process.env.ELECTRON_BUILD`, where the old `set` syntax left it unset on this shell.
   - **Not fixed, out of scope for this pass:** the `API_BASE_URL` wiring gap (the packaged app's static export has no way to reach the app's ~330 dynamic API routes since no `fetch()` call site actually uses `lib/config.ts`'s `API_BASE_URL`) — this is a real architectural gap the original audit flagged, but it means auditing and updating every data-fetching call site in the app, which is a much larger, higher-risk change than "fix a build script." Left as a documented gap, not attempted here.
4. **Dead-code cleanup, partial + deliberately scoped down:** removed `analyzeTaskIntent()` and `extractDataWithClaude()` from `app/api/manufacturing/ai-assistant/route.ts` — both confirmed zero-call-site duplicates of logic the actually-used `analyzeIntentAndExtractData()`/`extractDataFromMessage()` already cover. Removed the now-unused bare `callClaude` import alongside them.
   **Deliberately deferred to Phase 2, not forgotten:** the CRM dead-AI-engine files originally listed for this cleanup (`lib/crm/ai/leadScoringAI.ts`, `conversationEngine.ts`, `dataCompletion.ts`, `winProbability.ts`, `lib/crm/dataGovernance/{dataQualityEngine,dataHealthScore}.ts`, `lib/crm/dealRisk.ts`) are exactly the files Phase 2 needs to turn into genuinely LLM-backed implementations of the same features. Deleting them now only to recreate equivalent files immediately in Phase 2 would be wasted, contradictory work — so this cleanup item is being done as part of Phase 2 instead (either by repurposing these exact files for the real implementation, or deleting whichever ones end up genuinely superseded once Phase 2's real versions land). Noted here so it isn't mistaken for an oversight.

**Test results: 698/698 → 698/698** (no new tests added this phase — all changes were either navigation config, a new client page with no existing test harness for client pages of this kind, or build tooling, none of which this codebase's `vitest` suite currently covers; the manufacturing dead-code removal is covered by the Phase 0-follow-up gating tests already passing unchanged). `tsc --noEmit` clean, `eslint` clean.

---

## Phase 2 — CRM AI genuinely LLM-backed

Status: **Done**, with two deliberate, documented scope decisions (below) rather than a literal 1:1 rebuild of every dead file.

**Core building block:** `lib/crm/ai/llmInsight.ts` — one shared `getLlmCrmInsight(tenantId, task, recordJson)` function every genuinely LLM-backed CRM feature now goes through, instead of each feature hand-rolling its own prompt/parse/error-handling. Returns a typed `{ok:true, score?, riskLevel?, confidence, summary, reasoning, suggestedAction?, draftMessage?}` result, or a gated/failed outcome the caller falls back on. Confidence is always taken from the model's own stated value — never fabricated (this replaces the exact `Math.floor(Math.random()*20)+75` bug found in the old dead `leadScoringAI.ts`). Fully unit tested (9 tests) including the fabrication-prevention behavior specifically.

**Wired into real, reachable call sites:**
- **Lead scoring** (`lib/crm/leadScoring.ts` → `scoreLeadWithAi`, called from `POST /api/crm/leads` and `PUT /api/crm/leads/[id]`): real LLM assessment of each lead using its actual fields, persisted to the same `lead_score` field as before. Falls back to the original deterministic `calculateLeadScore()` when AI is gated/unavailable — verified by test that the fallback score is exactly what the old deterministic function would have produced. Writes a `CrmAIInsight` (severity based on score band) only when the AI call actually ran.
- **Deal risk detection + win probability support** (`app/api/crm/opportunities/[id]/route.ts` GET): the existing deterministic `evaluateOpportunityHealth()` engine stays authoritative for *whether* a deal is at risk (predictable, no AI cost on every view); when it flags Warning/At Risk/Critical, a real LLM call explains *why* in plain language and suggests one next action, surfaced as `aiAssessment` in the API response and rendered as a real card on the Opportunity detail page (`app/crm/opportunities/[id]/page.tsx`). **Deliberate scope decision:** a perfectly healthy opportunity gets no AI commentary at all (no call made) — win-probability "support" here means AI-generated reasoning when the deterministic engine has something to explain, not a running commentary on every deal regardless of state; the numeric probability itself (stage-based `PROBABILITY_MAP`, unchanged) already covers the baseline "what's the number" need.
- **Churn risk reasoning** (`lib/crm/churnRisk.ts`'s `computeAndStoreChurnRisk`, already called on every Account detail page load): for High/Critical accounts only (same cost-control logic as deal risk), a real LLM call explains the risk and suggests a retention action, surfaced via a new `churnRisk.aiSuggestedAction` field and rendered on `app/crm/accounts/[id]/page.tsx`. The bulk multi-account `scanTenantChurnRisk()` (used for tenant-wide scans) deliberately stays 100% deterministic — calling AI per-account in a bulk loop over potentially hundreds of accounts was judged not worth the cost/latency for what's fundamentally a triage list.
- **Next best action + suggested follow-up messages** (`lib/crm/ai/nextBestAction.ts` → `getNextBestActionWithAi`, wired into `GET /api/crm/ai/recommendations` — previously built but **never called from any UI** per the audit — and into `app/api/crm/accounts/[id]/route.ts`, rendered on the Account detail page): one LLM call returns both a next action and a ready-to-send draft follow-up message (`draftMessage`, a new field added to the shared helper's schema for this). **Also fixed a real bug found in the original audit while touching this file**: the deterministic fallback (`determineNextBestAction`) had no `"Account"` branch at all — the one real call site that passed `entityType: "Account"` always silently fell through to the generic default regardless of account state; added a real Account branch (churn-risk-aware) as part of this work.
- **Conversation summaries + call note summaries** (new `lib/crm/ai/conversationSummary.ts`, wired into `POST /api/crm/activities`): when a Call or Meeting activity is logged with a substantive note (≥20 chars) against a Lead/Opportunity/Account/Case, a real LLM call produces a structured summary (summary, key decisions, risks, follow-ups, action items, sentiment) and persists it to the previously-orphaned `CrmConversationSummary` model. Best-effort — never blocks or fails activity creation if AI is gated/unavailable. A new `GET /api/crm/conversation-summaries` route + a real display panel on the Opportunity detail page prove this end-to-end (Lead/Account pages could reuse the identical pattern but weren't wired — noted, not silently dropped). This single feature covers both "conversation summaries" and "call note summaries" from the spec — treated as one real pipeline rather than two near-duplicate ones, since a call note *is* a (short) conversation.
- **`/crm/ai` (AI Insights inbox)**: no code change needed — it already correctly read from `CrmAIInsight`, the bug was that nothing ever wrote to it. It now shows real data because the four features above write to it.
- **`/crm/ai/dashboard` (AI Control Center)**: was 100% hardcoded static markup (confirmed via the original audit — no `fetch()` call anywhere in the file). Rebuilt with a real backing route (`GET /api/crm/ai/dashboard`) computing real numbers: at-risk deal count + pipeline value (running the same deterministic `evaluateOpportunityHealth()` across all open opportunities — cheap, no AI/DB cost beyond one query, unlike the per-opportunity AI call which stays scoped to the single-record detail view), high-churn account count (real `churn_risk` field query), forecast confidence (derived from the existing real `lib/crm/forecast.ts` engine — weighted/total pipeline ratio), data health % (see below), and top active `CrmAIInsight` recommendations. Added a sidebar entry (`config/sidebar/crm.ts`, "AI Control Center") — it had none before.
- **Data completion suggestions** (new `lib/crm/dataCompletion.ts`, backs the dashboard's "Data Health" widget): real required-field-presence scan across a tenant's leads (company name, budget range, email, phone, timeline). **Deliberate scope decision, same reasoning as duplicate detection staying rule-based**: this is NOT an LLM call — checking whether a field is null/empty across potentially thousands of records is a mechanical completeness check, not a judgment task, and an LLM call per record would add real cost/latency for zero benefit over a plain field-presence check. Unit tested (4 tests).

**Deliberately left rule-based, not forced into an LLM call for its own sake:** duplicate detection (`lib/crm/ai/duplicateAssistant.ts`, unchanged) and the new data-completion scanner — both are mechanical/deterministic-shaped problems where a real algorithm is the professionally correct tool, not a shortfall. Forcing an LLM call here would have been slower, non-deterministic, and more expensive for strictly worse results — noted explicitly so this isn't mistaken for skipped work.

**Dead code fully resolved** (the item explicitly deferred from Phase 1): deleted `lib/crm/ai/{churnPrediction,winProbability,leadScoringAI,conversationEngine}.ts`, `lib/crm/dealRisk.ts`, `lib/crm/dataGovernance/{dataQualityEngine,dataHealthScore}.ts` — all confirmed zero-importer before deletion, all now genuinely superseded by real, wired implementations rather than sitting unused next to them. `predictChurn(account, [], [])` (the audit's specific "hardcoded empty arrays, dead-end computation" finding) is gone from `app/api/crm/accounts/[id]/route.ts` entirely, replaced by the real `getNextBestActionWithAi` + the already-real `computeAndStoreChurnRisk`.

**Test results: 698/698 → 716/716** (698 baseline → 706 after the shared `llmInsight` helper (9 tests) + lead AI-scoring route tests (5 tests) → 716 after `dataCompletion` (4 tests) + a `draftMessage` passthrough test on the shared helper). `tsc --noEmit` clean, `eslint` clean on every touched file. Deliberately did not add full integration-test parity for every wired route (opportunities/accounts/activities) beyond the shared helper + one full route (leads) — same "scope tests to what's most valuable, not exhaustive parity" call made and accepted in the Phase 0 follow-up.

**What could not be verified:** same sandbox limitation as Phase 0 — no real Azure OpenAI credentials here, so every AI-path test above is against a mocked `callClaudeForTenant`, not a live model response. The mocked tests prove the wiring/fallback/persistence logic is correct; they can't prove real Azure OpenAI will reliably return well-formed JSON for these prompts in production — worth a live smoke test once real credentials exist.

---

## Phase 3 — SaaS Platform Integration gaps

Status: **Done**, except multi-tenant DB isolation which is an assessment-only deliverable per your own instruction (implementation, if wanted, is explicitly its own future phase).

- **OAuth (Google/Microsoft) wired for real.** `lib/auth/oauthSignIn.ts` was already fully built and unit-tested (28 tests, unchanged and still passing) but never reachable — `auth.ts` registered only `CredentialsProvider`. Added `GoogleProvider`/`MicrosoftEntraID` (registered only when their env vars are set — an unconfigured provider doesn't show a button that fails on click), and a real `signIn` callback that calls `resolveOAuthSignIn()` using the request hostname (same `getTenantFromHost()` parser middleware uses, no divergence). Added real "Continue with Google/Microsoft" buttons to `SignInForm.tsx`, populated via NextAuth's own `getProviders()` so they only render when a provider is actually live.
- **Team permissions — `User.permissions[]` now genuinely enforced.** It was declared on the schema and never read anywhere. Added it to the session/JWT claims (`auth.config.ts`, `auth.ts`'s `authorize()`, and `resolveOAuthSignIn`), and wired it into `lib/crm/rbac.ts`'s `hasPermission`/`requireRole` as a per-user ALLOW-list override on top of the existing role-based check (e.g. letting one specific sales rep get `lead.delete` without promoting them to admin — never revokes what the role already grants). Extracted `CRM_PERMISSIONS` into a new client-safe `lib/crm/permissions.ts` (the original `lib/crm/rbac.ts` imports `next/server`, which throws when bundled for a client component) and built a real checklist editor into the existing `EditUserDialog` on `/admin/users` — no new page needed, this is where an admin already edits a user. 11 new tests (`tests/crm/rbac.test.ts`) covering both the pre-existing behavior (locked in) and the new override.
- **Workspace switching — real, but deliberately not an instant one-click switch.** New `GET /api/auth/my-workspaces` lists every organization a signed-in email actually belongs to (a person can hold a separate `User` document per org, same password hash, created via the invite-accept flow) — real data, not a stub. New `WorkspaceSwitcher` dropdown in `DashboardHeader` (only renders when there's actually more than one workspace to switch between). **Deliberate scope decision:** clicking another workspace takes you to its real login page with your email pre-filled, not a silent session-swap — building a custom cross-tenant session-swap token was judged too security-sensitive to implement safely in this pass without a dedicated review; this is the safe, honest version of "switch workspace," not a corner cut.
- **Billing history — real writes, not just a route that always returns empty.** `models/SubscriptionEvent.ts`'s own comment documented an intended `appendSubscriptionEvent()` write helper that never existed — built it (`lib/billing/appendSubscriptionEvent.ts`) and wired it into the two real org-creation paths (`app/api/auth/register/route.ts` — initial signup, `app/api/auth/org/create/route.ts` — additional org for an existing user) as a `created` event, and into a new real tier-change action (a `PATCH` field added to the already-existing `app/api/master-admin/tenants/[id]/route.ts`, with a tier selector added to the master-admin tenant card UI) as `upgraded`/`downgraded`. **Honest limitation, not glossed over:** there is still no real payment gateway anywhere in this codebase (`lib/sales/paymentGateway.ts` says so explicitly), so `payment_succeeded`/`payment_failed`/`renewed` events are not fired by anything — faking a payment event with no real payment behind it would be worse than the gap. Built the actual `GET /api/billing/history` UI page (`/admin/billing`) that was missing — the API route existed but nothing ever called it.
- **Workspace settings UI — built from scratch.** `Organization.settings` had full schema support for branding/tax/currency/AI preferences, and the AI sub-object was even genuinely enforced downstream (`lib/ai/tenantAi.ts`) — but no route let anyone edit any of it after signup, and the sidebar's "Settings" entry was explicitly commented out + `disabled: true`. Built `GET/PATCH /api/admin/org-settings` and a real form page (`/admin/settings`) covering all of it: org name, theme color/logo, email footer/PDF header branding, currency/country/state/address, GST toggle + GSTIN, and the AI kill-switch/deployment-override/token-limit fields (with an explicit note in the UI that the kill-switch takes effect immediately). Uncommented and pointed the sidebar entry at the real page.
- **Multi-tenant isolation — assessment only, not implemented (per your instruction).** Current architecture: shared MongoDB collections, every document scoped by a `tenantId` field, enforced by convention (Golden Rule #1 in this repo's `CLAUDE.md`) rather than by the database engine itself. Assessment:
  - **Case for staying on shared-collection isolation:** it's simpler to operate (one connection pool, one set of indexes, one migration to run), it's what every existing route/model/test in this codebase already assumes, and MongoDB's per-document filtering is a well-understood, widely-used SaaS pattern (this is how the large majority of multi-tenant B2B SaaS products actually run) — a real DB-per-tenant migration would touch effectively every route in the app (`connectDB()` would need to become tenant-aware, not just imported once), is a multi-week undertaking on its own, and the earlier audit already flagged that tenant-scoping in this codebase leans on a `|| "default-tenant"` fallback pattern in ~223 files rather than a hard 401 — meaning the *real* near-term risk isn't "wrong isolation model," it's "a session bug could silently leak into the shared default-tenant bucket," which a DB-per-tenant migration doesn't fix on its own (a route with a fallback bug would just connect to the wrong tenant's database instead of reading the wrong tenant's collection — same class of bug, different blast radius).
  - **Case for migrating:** genuine, common reasons a real SaaS product does move to DB-per-tenant are (a) a specific enterprise customer's contract or compliance regime (HIPAA, certain financial-services requirements, some enterprise procurement checklists) explicitly requires physical data separation, not just logical; (b) a noisy-neighbor performance problem at scale (one huge tenant's query load affecting others); (c) needing per-tenant backup/restore/deletion granularity beyond what a filtered export can give you.
  - **Recommendation:** don't migrate based on the CTO spec's wording alone — none of the three real triggers above are confirmed to apply yet. Instead, prioritize fixing the `|| "default-tenant"` fallback pattern (already flagged in the original audit, not part of this rollout's phases) as a much cheaper, higher-value hardening step that addresses the actual risk. If a specific compliance requirement or enterprise deal is the real driver, that's the trigger to greenlight DB-per-tenant as its own dedicated phase — flagging this back to you rather than guessing.

**Test results: 727/727 → 730/730** (11 new `rbac.test.ts` tests + 3 new `myWorkspaces.test.ts` tests, minus one pre-existing test file (`orgCreate.test.ts`) needing its mock of `lib/constants/statuses` extended and `lib/billing/appendSubscriptionEvent` mocked — a mechanical mock-completeness fix, not a behavior change; see inline comment added to that test file). `tsc --noEmit` clean, `eslint` clean on every touched file.

**What could not be verified:** OAuth sign-in itself needs real Google/Microsoft OAuth app credentials to test end-to-end — not available in this sandbox. The wiring is verified by type-check + the existing 28-test suite for `resolveOAuthSignIn()` (unchanged, still passing) + confirming `auth.ts` correctly constructs and conditionally registers the providers, but an actual browser-based OAuth round-trip was not performed.

---

## Phase 4 — AI Native ERP System gaps

Status: **Mostly done.** 4 of 6 sub-items fully built and tested; 2 sub-items (Command Center real execution, Manufacturing confirm-UI + AI-memory) deliberately scoped down / deferred with reasons below.

- **NL workflow automation — now actually runs, and rules can be created from the UI.**
  - **The scheduler gap was systemic, not just the automations route:** there was no `vercel.json` crons block and no scheduler config anywhere — meaning *all five* existing cron routes (crm automations, crm contract-check, crm sla-check, sales reminders-evaluation, sales subscriptions-billing) were dead, never invoked by anything, not just the automation one. Created `vercel.json` with a real `crons` schedule for all of them (+ the new business-health one). **Important technical fix:** Vercel Cron only sends GET, but three of these routes were POST-only — refactored each to a shared `handler` exported as both `GET` and `POST` so scheduling actually works (the two already-GET routes were fine). Documented in `SETUP_INTEGRATIONS.md` that a non-Vercel deployment must point its own scheduler at these same URLs with the `Authorization: Bearer $CRON_SECRET` header.
  - **The "New Rule" button (previously had no onClick handler at all) now opens a real, functional rule builder** (`components/crm/NewAutomationRuleModal.tsx`): pick entity + trigger, an optional condition (field/operator/value), and an action (type + JSON payload) — POSTs to the already-existing `/api/crm/automations` and creates a rule the engine actually executes. **Deliberate scope decision per your pre-answered call:** this is a form, not a drag-and-drop React Flow canvas. The `/crm/workflows` "Visual Workflow Designer" static mock is left as-is — a real functional form that persists executable rules was judged more valuable than a prettier canvas that saves nothing. Noted, not silently dropped.
- **Projects module — built for real, matching Manufacturing's simplicity.** The audit found a dead, zero-reference `models/Project.ts`. Enhanced it (status/priority/progress/owner/members/dates), and built the full module: `GET/POST /api/projects` + `GET/PUT/DELETE /api/projects/[id]` (tenant-scoped), a list page with inline create (`/projects`), a detail page with edit/delete (`/projects/[id]`), a sidebar config, a module-switcher tile, and — a real bug fix found along the way — the `project` role (which exists in the `User` role enum) was **missing from `getRoleDashboard()` in both `middleware.ts` and `SignInForm.tsx`**, so a project-role user's login fell through to the default; added `case "project" → /projects`. Added a middleware role gate for `/projects` + `/api/projects` (project/admin/master-admin). 5 new API tests.
- **Automated business-health summaries with revenue forecasting — built end to end.** The audit found none existed. New `models/BusinessHealthSummary.ts` + `lib/ai/businessHealth.ts` (generates a per-tenant AI summary — summary/highlights/concerns/revenue-outlook — over live finance + sales aggregates and the real `calculateForecast` pipeline math, going through the tenant-gated `callClaudeForTenant`, best-effort per tenant so one gated/failed tenant never breaks the run) + a real cron route (`/api/cron/business-health`, scheduled in `vercel.json`) + a read route (`/api/admin/business-health`) + a real dashboard widget (`BusinessHealthCard`, rendered on the admin dashboard, shows nothing until a summary exists rather than a placeholder).
- **Isolated AI memory (extend to Manufacturing) — DEFERRED, documented.** Finance/Sales/Inventory/HR already persist `ChatHistory`; Manufacturing keeps chat state client-side only. Threading `ChatHistory` through Manufacturing's assistant requires surgery on a large, complex multi-branch client chat component (`app/manufacturing/ai-assistant/page.tsx`, ~250 lines of task-state logic) with real regression risk, for a lower-value consistency win. Scoped out of this pass and flagged here rather than rushed — the pattern to copy is any of the other five routes' `ChatHistory` upsert.
- **Manufacturing confirmation gating (raise to Finance's explicit-button standard) — DEFERRED, documented, and note the backend is already safe.** The backend already requires an explicit `confirmAction: true` + `actionData` to execute anything (it does NOT auto-execute) — the audit's concern was the *frontend* inferring confirmation from a keyword match ("yes"/"ok") in the next chat message rather than a discrete button. That's a frontend-UX refinement to the same large chat component as above; the security-relevant gate (backend requiring an explicit confirm flag) is real and unchanged. Scoped out with the same reasoning; flagged, not hidden.
- **Global AI Command Center real data + real execution — PARTIALLY done / honestly scoped.** In Phase 0 this route was already re-pointed through the tenant-gated abstraction. Genuinely wiring "search data" and "explain reports" to live cross-module data, and replacing the acknowledged-fake "action succeeded" branch with real (confirm-gated) execution of arbitrary actions, is a substantial and *security-sensitive* piece (an AI that can execute arbitrary mutations needs the same propose→preview→confirm→audit rigor the Finance module has, generalized across every module) — larger than the other Phase 4 items combined and not safely rushable. Deferred with this explicit note rather than shipping a half-wired "execute" path that could mutate data without proper gating (which would violate the no-fake-AI / mandatory-confirmation ground rules). The "navigate" capability continues to work as before.

**Test results: 730/730 → 735/735** (5 new Projects API tests). `tsc --noEmit` clean, `eslint` clean.

---

## Phase 5 — Invoice PDF generation & WhatsApp link

Status: **Done**, with the PDF item resolved via the honest-relabel path your pre-answered call allowed (a faithful server-side PDF rewrite is genuinely infeasible here — see below).

- **WhatsApp sharing now actually works for the recipient.** The bug: the shared `wa.me` link pointed at the **session-gated** `/api/sales/invoices/[id]/pdf` route, so any external recipient (who by definition has no ERP login) got a 401 instead of the invoice. Fixed properly:
  - New `lib/publicLinks.ts` — HMAC-signed, time-limited (30-day) tokens keyed by `ENCRYPTION_KEY`, with constant-time verification. A link can't be forged without the key and stops working after expiry. 7 unit tests covering wrong-id / wrong-resource / expired / tampered / wrong-key / garbage.
  - New public, session-less route `app/api/public/invoice/[id]` — verifies the signed token, then renders the invoice; authorization is the token, not a session (tenant is read off the invoice doc since a valid token already proves authorization for exactly that invoice). Allowlisted in `middleware.ts` (`isPublicSignedApi`) so it isn't blanket-401'd.
  - New authenticated `app/api/sales/invoices/[id]/share-link` mints the signed link; the invoice page's `whatsappShare()` now calls it and shares a link the recipient can actually open.
  - Refactored the shared rendering out of the authenticated PDF route into `lib/invoiceTemplates/renderInvoiceHtml.ts` so both the authenticated and public routes render identical output with no duplication (the authenticated route is now much smaller and behavior-preserving).
- **PDF generation — kept the working HTML/browser-print approach and relabeled the button honestly**, per your pre-answered guidance. Investigated the server-side-library path: the invoice engine has 9 bespoke templates built as rich HTML/CSS (heavy tables, HSN summaries, print CSS, landscape orientation). `@react-pdf/renderer` uses its own React primitives (`<Document>/<Page>/<View>/<Text>`) and cannot render HTML/CSS at all — using it would mean rewriting all 9 templates from scratch in a different rendering model, a large project with real fidelity risk, not a Phase-5-sized change. No Chromium-free library can faithfully render the existing templates (the route's own comment already documented why puppeteer was avoided — no verified Chromium binary in this environment). So per your instruction's fallback, the "Download PDF" button (which never produced a PDF binary — it opened printable HTML) is relabeled to the honest **"Print / Save as PDF"**; the actual behavior (open print-quality HTML → browser's Save-as-PDF) is unchanged and works. A real server-side PDF binary would be its own dedicated project (either a headless-Chromium rendering service, or a full template rewrite in a PDF-native lib) — flagged, not faked.

**Test results: 735/735 → 742/742** (7 new `publicLinks` tests). `tsc --noEmit` clean, `eslint` clean.

---

## Phase 6 — Expansion Modules

Status: **2 of 12 built and tested this pass (6.1, 6.6); the other 10 are honestly deferred with a specific approach documented for each.** These are, by the CTO spec's own framing, large forward-looking modules — several are multi-week greenfield projects individually (a real Razorpay/WhatsApp integration, a Tally XML connector, an 8-level org hierarchy, a React Flow visual builder, a digital-twin graph, an OCR pipeline). Building shallow stubs of all ten to "check the box" would violate the no-fake-work ground rule far more than doing a few properly and being straight about the rest — so that's the call I made, per your explicit permission to scope down and document rather than either balloon or fake.

### Built this pass

- **6.1 Universal Enterprise Search — done.** New `/api/search` extends the CRM-only search to genuinely cover Sales (invoices, customers, orders), Inventory (items), HR (employees), and Projects too, **role-scoped server-side** (an HR user's search never touches Sales/CRM data, admins search everything — 5 tests covering the scoping). Wired the app-wide header search component (`components/dashboard/GlobalSearch`) to actually query records (debounced) and show them in a "Records" section alongside the existing page-navigation filter — previously that box only fuzzy-filtered the sidebar menu, never touched data.
- **6.6 AI Studio — done (analytics; settings already landed in Phase 3).** The editable AI preferences (model / kill-switch / token limit) were built in Phase 3's workspace settings. This adds the cost/usage side: `/api/admin/ai-usage` reads the per-tenant `AiUsage` counters (already tracked by `lib/ai/usage.ts`) against the tier cap, and a real `/admin/ai-studio` page shows current-month usage, remaining allowance, %-used meter, AI on/off status, and a 12-month usage-history bar chart. Sidebar entry added. RAG knowledge bases + multi-agent orchestration are explicitly flagged in the UI and here as a future increment (a substantial feature on its own, per your pre-answered scope).

### Deferred — with the real approach for each (see also `SETUP_INTEGRATIONS.md`)

- **6.2 Role-Based Workspaces — substantially already satisfied; not rebuilt.** The app already has genuinely role-tailored dashboards (admin sees a cross-module exec view, HR sees HR KPIs, each module its own), gated by role — the audit rated this 🟡 for being module-level rather than sub-persona-level (CFO vs general Finance staff). Adding a few more per-role KPI widgets would have been largely redundant with what's already there; true sub-persona tailoring needs a sub-role concept the `User.role` model doesn't have yet. Documented as the honest state rather than shipping redundant widgets.
- **6.3 Low-Code (approval-workflow builder + layout/print builder).** The real generic custom-field system (`models/CustomField.ts`) already exists and works. A configurable approval-workflow builder would extend the automation-rule pattern just built in Phase 4 (`AutomationRule` + the new rule-builder form) toward multi-step approval chains; a print-format builder would build on the existing invoice-template selection. Both are real feature builds, deferred.
- **6.4 Document Intelligence (OCR).** Approach + Azure Document Intelligence setup documented in `SETUP_INTEGRATIONS.md` §5 — natural fit with the existing Azure account and Cloudinary uploads; needs the Azure resource credentials.
- **6.5 Smart Enterprise Calendar.** Would add a unifying `Calendar` model/API aggregating the dates already scattered across Task/LeaveRequest/Attendance/Payment/Payroll models, plus AI conflict detection (reusing the `callClaudeForTenant` infra). The orphaned `components/crm/TaskCalendar.tsx` is a starting point. Real build, deferred.
- **6.7 Aupulens Connect (Razorpay + WhatsApp Business API).** Both documented in `SETUP_INTEGRATIONS.md` §2–3, including exactly which env vars, webhook endpoints, and — importantly — the existing seams to build into (`lib/sales/paymentGateway*.ts` honest stubs for Razorpay; the `send_whatsapp` automation action for WhatsApp; and `appendSubscriptionEvent()` so real payments flow into the billing UI already built in Phase 3). Needs live merchant/Meta credentials.
- **6.8 Enterprise Org Management (8-level hierarchy).** You pre-answered "don't scope down" — which is exactly why it's deferred rather than half-built: Company→Region→Branch→Office→Warehouse→Department→Team→Employee as real related models, with per-entity localized currency/language/timezone/tax and consolidated cross-entity reporting, is genuinely core structural work touching the tenant model, most modules' queries, and reporting — a dedicated phase of its own, not a slice of a shared pass.
- **6.9 Universal ERP Migration (Tally connector).** Approach documented in `SETUP_INTEGRATIONS.md` §4 — extends the existing CSV/XLS importer with a Tally XML parse + ledger/voucher mapping step; needs real sample Tally exports to build the mapping against (its XML is version-idiosyncratic).
- **6.10 Visual ERP Builder (React Flow canvas).** The functional rule-builder *form* from Phase 4 already lets users create executable automation rules; a drag-and-drop React Flow canvas over the same `AutomationRule` backend is the visual layer on top — a substantial front-end build, deferred.
- **6.11 Digital Business Twin.** Would build a relationship graph (Customer→Vendor→Order→Cash-flow) from real aggregation queries across existing models, plus one real simulation (e.g. cash-flow impact of a late invoice). Real build, deferred.
- **6.12 Marketplace.** Lowest priority per your own pre-answered call, and depends on several of the above (AI Studio, Visual Builder, Invoice Templates) being mature enough to have something worth publishing. Deferred.

**Test results: 742/742 → 747/747** (5 new universal-search tests). `tsc --noEmit` clean, `eslint` clean.

---

## Summary across the whole rollout

**Test baseline: 669/669 → 747/747** (net +78 tests; every phase ended green, `tsc --noEmit` and `eslint` clean throughout; no phase was left with a red suite).

**Fully done and verified (mocked, since this sandbox has no live external credentials):** Phase 0 Azure migration, the tenantAi follow-up (all 6 assistants gated), Phase 1 quick wins, Phase 2 (CRM AI genuinely LLM-backed), Phase 3 (OAuth wiring, per-user permissions, workspace switcher, billing events + UI, workspace settings UI), Phase 4 (cron scheduler for 6 jobs, functional automation rule-builder, full Projects module, business-health summaries), Phase 5 (signed public invoice links; honest PDF relabel), Phase 6.1 (universal search) and 6.6 (AI usage analytics).

**Done but not live-verifiable without real credentials:** every AI code path (verified against a mocked `callClaudeForTenant`, not a live Azure model — needs real `AZURE_OPENAI_*`); OAuth sign-in (needs real Google/Microsoft app credentials); the cron schedule (needs a `CRON_SECRET` + a deploy).

**Explicitly scoped down / deferred (with reasons above and in `SETUP_INTEGRATIONS.md`):** Command Center real-execution (security-sensitive, Phase 4); AI-memory-to-Manufacturing + Manufacturing confirm-UI (frontend polish, backend already safe, Phase 4); server-side PDF binary (needs Chromium or a full template rewrite, Phase 5); and Phase 6 items 6.2–6.5 and 6.7–6.12 (each a real, sizable module — several needing external service credentials).

---

## Go-Live — Step A (config reconciliation + live smoke test)

Status: **Config reconciliation DONE and clean; live smoke test BLOCKED by a genuine Azure setup gap — stopped here per the "missing external credential" rule, before Step B/C.**

**Step A.1 — env var reconciliation (done).** Real credentials use `AZURE_OPENAI_CHAT_DEPLOYMENT` (+ a new `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`), not Phase 0's `AZURE_OPENAI_DEPLOYMENT_NAME`. Reconciled properly (not aliased): updated `lib/ai/claude.ts` (the reader + the config-error message), `tests/ai/claude.test.ts`, `.env.example`, `SETUP_AI.md`, and `models/Organization.ts`. Grep confirms zero remaining `AZURE_OPENAI_DEPLOYMENT_NAME` references anywhere except one intentional line in this doc explaining the rename itself.

**Step A.2 — embeddings support (done).** Added `embedText()` + `EMBEDDING_DEFAULT_MODEL` to `lib/ai/claude.ts` (reads `AZURE_OPENAI_EMBEDDING_DEPLOYMENT`). *(Update, next pass: the light-tier model plan was dropped — only `gpt-4o` + `text-embedding-ada-002` are used; the `CLAUDE_LIGHT_MODEL`/`AZURE_OPENAI_CHAT_DEPLOYMENT_LIGHT` idea from this step was removed and replaced by per-feature `max_tokens` caps in `lib/ai/featureLimits.ts` — see the "Two-model AI completion" section at the end.)*

**Step A.3 — live smoke test (BLOCKED — this is the stop condition).** Ran a real, non-mocked call against the live endpoint (`scripts/smoke-azure.ts`, kept for you to re-run). Result: **every chat + embedding call returns HTTP 404 `DeploymentNotFound`.** Diagnosed precisely with raw `curl`, not guessed:
  - The API key + endpoint are **valid** — `GET /openai/models` returns 200 (lists available *base* models), so auth and the resource are fine.
  - But `GET /openai/deployments?api-version=2023-03-15-preview` returns **`{"data": []}`** — the `aupulens-openai` resource has **zero model deployments**. Neither `gpt-4o` (chat) nor `text-embedding-ada-002` (embedding) is actually deployed.
  - This isn't an SDK or code issue — raw curl to the deployment path returns the same `DeploymentNotFound`. The code is correct; the Azure resource just has no deployments in it yet.
  - **What you need to do:** in the Azure Portal (or Azure AI Foundry) for the `aupulens-openai` resource, create model deployments and set `AZURE_OPENAI_CHAT_DEPLOYMENT` / `AZURE_OPENAI_EMBEDDING_DEPLOYMENT` in `.env` to the exact deployment names you choose (they can be anything — the env var must match the name in the Portal). Then re-run `npx tsx scripts/smoke-azure.ts` — it verifies a real completion, an embedding, and that a wrong deployment name errors clearly. Creating deployments needs Portal/management access this environment doesn't have, which is why I can't do it from here.

**Step A.4 — budget guardrail (checked; needs a decision).** Ran `scripts/check-ai-budget.ts` against the live DB (28 tenants). Findings:
  - `maxTokensPerCall` is a safe **1024** for every tenant; no tenant has an unset/unlimited value. Monthly caps are always tier-derived (never unset) — architecturally there's no "unlimited cap" hole.
  - **BUT 24 of 28 tenants are on the `enterprise` tier = a 10,000 calls/month cap each** (~240k calls/mo across all tenants). For a ₹10k trial that is *not* conservative. Most are obviously throwaway test orgs (`test`, `test18`, `xyz`, `mmmmmmmmmmm`, …), but a few (`aupulens`, `makewithus`, `mwus-dev`) may be real — so I did **not** unilaterally downgrade tenant tiers or globally lower the enterprise cap (that's a data/business decision, and the wrong call would throttle a real workspace). There's zero interim spend risk because the AI is fully blocked anyway (no deployment). **Recommended before flipping AI on:** either downgrade the test tenants to `starter`, or (safer/reversible) I can add an env-driven global trial ceiling (`AI_GLOBAL_MONTHLY_CAP`) that hard-caps calls under the tier cap during the trial — your call, I'll implement whichever you pick.

**Not started (correctly): Steps B and C.** The instruction says do not proceed past Step A until it's confirmed working live. It can't be, because the resource has no deployments — a genuine external-setup gap only you can close (Portal access). So model tiering (B) and the remaining Phase 6 work (C) are not started. `tsc`/`eslint`/`vitest` all clean (747/747) with the reconciliation in place. Once you create the Azure deployments (and decide the budget guardrail), say the word and I'll re-run the live smoke test and continue straight into Step B → C.

---

## Two-model AI completion pass — config + cost control + safety guards done; live verification BLOCKED (same Azure gap)

Went to complete/live-verify the AI feature scope (A–G) on the strict
two-model plan (`gpt-4o` + `text-embedding-ada-002`, **no** light tier).
Re-checked the live Azure resource first, per the required self-check.

**BLOCKER, unchanged and re-confirmed:** the `aupulens-openai` resource
**still has zero model deployments.** `GET /openai/deployments` returns
`{"data": []}` (verified again this pass), and every completion/embedding
call still 404s `DeploymentNotFound`. So despite the note that the models
are "already deployed," they are not deployed on the resource this
`AZURE_OPENAI_ENDPOINT` points at. Until a chat + embedding deployment
actually exist on that resource (or `.env` points at the resource where
they were created), **no live AI call can succeed**, so none of the
required live self-checks (paste real request/response + token count) can be
produced. That specific verification is paused on this external gap — not
faked.

**What was done anyway (genuinely independent of a live call, real + tested):**

- **Light-tier model plan fully removed** (as instructed). Grep-confirmed
  zero remaining `AZURE_OPENAI_CHAT_DEPLOYMENT_LIGHT` / `CLAUDE_LIGHT_MODEL` /
  `gpt-4o-mini` / `gpt-3.5` references anywhere in code, env files, or docs.
  Removed the export and the "model tiering" section from `SETUP_AI.md` and
  `.env.example`.
- **Cost control via per-feature `max_tokens` caps** (`lib/ai/featureLimits.ts`,
  the replacement for the cheap tier). Chosen values + reasoning:
  `suggestion: 256` (lead scoring, deal risk, churn, win-probability,
  next-best-action, data completion — compact JSON, fires on every
  create/update), `intent: 200` (Command Center classification — tiny
  navigate/action JSON), `summary: 384` (call/conversation + business-health
  summaries — short bullet arrays), `draft: 300`, `anomaly: 300`,
  `chat: 1024` (only the genuinely conversational module assistants keep the
  large cap), `rag: 700`. Wired into `llmInsight.ts` (was 512→256),
  `conversationSummary.ts` (512→384), `businessHealth.ts` (700→384), and the
  Command Center route (default 1024→200). *(Actual measured token counts to
  validate these caps against real usage are pending the live-call blocker —
  the caps are set from expected structured-output sizes and can be tuned
  once real responses are observable.)*
- **AI safety guards — explicit tests added** (`tests/ai/aiSafetyGuards.test.ts`,
  `tests/ai/chatHistoryIsolation.test.ts`, 6 tests): a deliberately tight cap
  of 3/month allows calls 1–3 and blocks the 4th with `AI_LIMIT_REACHED`,
  feature-agnostic (proven with a lead-scoring-style and a Finance-style
  prompt), with no model call and no usage increment on the blocked request;
  and cross-tenant AI-memory isolation — a `ChatHistory` read is always
  scoped to the *calling* tenant, so tenant B's identical-conversationId
  query is bound to B and can't surface tenant A's history (read + write
  sides both asserted). These are exactly the "with no cheap tier, the cap is
  the backstop" and "cross-tenant leak is a real risk" guards called for.
- **CRM `VoiceNotes.tsx` — real transcription, no model needed** (the one AI
  item unaffected by the two-model constraint since it's browser-native).
  Replaced the hardcoded `"Voice note transcribed (Pending API integration)"`
  string with real client-side `SpeechRecognition`/`webkitSpeechRecognition`
  transcription (same pattern as the Command Center), running alongside the
  audio recording, with an editable transcript before save and a graceful
  "not supported in this browser" fallback. Also dropped the `recordId:
  "mock_id"` placeholder — the note now links to a real record when a
  `recordId` prop is supplied, else saves as an unlinked general note.

**Not done (blocked on the live Azure gap):** the live self-checks and the
live-verified *completion* of scope sections A–G. The feature code for most
of A already exists from Phase 2 (real gpt-4o calls with deterministic
fallback); what this pass could not do is exercise them against a live model
to confirm and paste real responses, because the resource has no deployments.

**Test results: 747/747 → 753/753** (6 new safety-guard tests). `tsc`,
`eslint`, `vitest` all clean.

---

## Go-Live — Azure is LIVE and verified (real calls, not mocks)

The deployment gap is resolved and the AI is genuinely working end-to-end.

**Root cause of the earlier 404s:** the models were deployed in a *different*
resource than `.env` pointed at. `gpt-4o` + `text-embedding-ada-002` live in
**`krrish-6151-resource`** (an AI Foundry resource, endpoint
`krrish-6151-resource.services.ai.azure.com`), but `.env` had
**`aupulens-openai`**'s endpoint + key — a separate, empty resource in the
same RG. Fixed by pointing `AZURE_OPENAI_ENDPOINT` at the Foundry resource and
the key at its key (verified the Foundry endpoint serves the classic Azure
OpenAI `/openai/deployments/.../chat/completions` path — raw curl returned 401
for a bad key and 200 for the real one).

**Real bug #1 found + fixed — connect timeout.** The Foundry endpoint is slow
to first-respond (~17s from here). Node's `fetch` (undici) has a **default 10s
connect timeout**, so every SDK call aborted at ~10.5s with a spurious "Request
timed out" — while `curl` (no such default) succeeded at 17s. Isolated it to
the undici layer (raw `node fetch` failed identically; raw fetch with a custom
`undici.Agent({connect:{timeout:60s}})` succeeded — HTTP 200 in 17.1s). Fix:
`lib/ai/claude.ts` now builds the `AzureOpenAI` client with a custom fetch
backed by a dedicated undici `Agent` (60s connect, 120s headers/body) + a 120s
SDK timeout. Added `undici` as an explicit dependency. Scoped to AI calls only
(not a global dispatcher).

**Real bug #2 found + fixed — stale Anthropic model override in the DB.** Live
testing (impossible before) surfaced that 4 of 28 orgs (incl. `default-tenant`)
still had `settings.ai.model = "claude-sonnet-4-6"` persisted from the
pre-Azure era — Phase 0 removed the schema *default* but existing documents
kept the stored value. Since `callClaudeForTenant` uses the tenant's model
override as the Azure deployment name, those tenants got a 400
("model 'claude-sonnet-4-6' does not support deploymentless inference") on
*every* AI call. Two-part fix: (a) durable guard in `resolveTenantAiSettings`
strips any `claude-*` model override so it falls back to the real Azure
deployment (with a new test); (b) one-time migration
`scripts/migrate-clear-stale-ai-model.ts` cleared the stored values (DB now
shows 0 stale, all unset). This is exactly the class of bug mocks can't catch.

**Live self-checks (real `gpt-4o` / `text-embedding-ada-002`, key redacted):**

- *Finance completion* — prompt: "In one short sentence, what does a positive
  net income mean for a business?" → response: "A positive net income means a
  business's revenues exceed its expenses, indicating profitability."
- *Lead scoring (lightweight)* — prompt: score a Referral/10k-50k lead, JSON
  only → response: `{"score":85,"confidence":90,"summary":"...strong
  likelihood of conversion...","reasoning":...,"suggestedAction":...}`.
  **Real token usage: prompt=85, completion=131, total=216** — the full
  structured output fits comfortably under the `suggestion` cap of **256**
  (validated: won't truncate a good response, still hard-stops a runaway one).
- *Embeddings* — `text-embedding-ada-002` returned a real **1536-dim** vector.
- *Failure mode* — a deliberately wrong deployment name returns a clear
  **404 DeploymentNotFound**, not a silent failure.
- *Usage counter* — a real `callClaudeForTenant` for `default-tenant` moved the
  `AiUsage` counter **0 → 1**, confirming the monthly cap / kill-switch is
  live-wired end to end (not just unit-tested).

**Test results: 753/753 → 754/754** (new stale-model-stripping test). `tsc`,
`eslint`, `vitest` all clean. Kept `scripts/smoke-azure.ts` + `smoke-usage.ts`
+ `check-ai-budget.ts` + `migrate-clear-stale-ai-model.ts` as go-live
utilities; removed the throwaway network-diagnosis scripts.

**Budget guardrail still pending your call:** 24/28 tenants on the enterprise
tier (10k/mo cap). Now that AI genuinely runs and costs real money, this
matters — say whether to downgrade the test tenants or add the env-driven
trial ceiling.

---

## AI_GLOBAL_MONTHLY_CAP — env-driven global ceiling (decision: NOT tier downgrade)

**Decision:** Add a platform-wide monthly ceiling that sits ABOVE the per-tier
caps, rather than downgrading tenant tiers. Rationale: 24/28 tenants are
enterprise-tier and several may be *real* workspaces indistinguishable from
test orgs — downgrading risks breaking a live customer. A global ceiling is
orthogonal: it never touches a tier, and hard-stops total platform spend at the
trial budget regardless of how many tenants are active.

**Implementation:** `lib/ai/usage.ts` — `getGlobalMonthlyCap()` reads
`AI_GLOBAL_MONTHLY_CAP` (default 17000). A reserved `__platform__` tenantId
counter is incremented alongside each per-tenant counter on every successful
call, so `getGlobalAiUsageCount()` is O(1). `lib/ai/tenantAi.ts` checks the
global ceiling FIRST (gated code `AI_GLOBAL_LIMIT_REACHED`), before the
per-tenant tier cap.

### The math (grounded in real measurements + real Azure pricing)

- **Cost per call (measured + priced):**
  - Measured lead-scoring call = 85 in / 131 out tokens. Features range from
    small (`suggestion` 256-cap) to `chat` (1024-cap), so we blend UP for
    safety: assume an *average* call ≈ **400 input + 250 output tokens**.
  - Azure gpt-4o pricing: **$2.50 / 1M input**, **$10.00 / 1M output**.
  - Input: 400 × $2.50/1M = $0.0010. Output: 250 × $10/1M = $0.0025.
  - Per call ≈ **$0.0035**, rounded up to **$0.004** for headroom.
  - FX ₹84/USD → **₹0.336 per call**.
- **Budget allocation:** trial budget ₹10,000. Allocate **₹6,000 (60%)** to AI,
  leaving ₹4,000 margin for Mongo/hosting/other.
- **Cap = ₹6,000 / ₹0.336 ≈ 17,857 calls/month.** Rounded DOWN to a clean
  **17,000** for extra margin.
- **Worst-case spend at the cap:** 17,000 × ₹0.336 = **₹5,712** — inside the
  ₹6,000 AI allocation, ₹10k total budget safe.

### Sanity check against real activity

`scripts/check-active-tenants.ts` (real DB): **7 identifiably active tenants**
(have leads / opportunities / invoices / ai-usage / chat) out of 28 orgs.
17,000 / 7 ≈ **2,428 calls per active tenant per month** — generous for a
trial, while still hard-stopping a runaway loop (a bad loop doing thousands of
calls/hour trips the ceiling in hours and every workspace stops). The number is
sized off *identifiable active* tenants, not all 28.

Override anytime with `AI_GLOBAL_MONTHLY_CAP=<n>` in `.env`.

---

## Stale/invalid model-override health check (guardrail)

**Problem it prevents:** a tenant's `settings.ai.model` override that doesn't
name a currently-deployed Azure deployment (a leftover `claude-*` name, a typo,
a deleted deployment) makes every AI call for that tenant 400 with
`DeploymentNotFound` — a silent, per-call failure that only surfaces as a broken
feature. `resolveTenantAiSettings` already strips `claude-*` defensively, but
that *hides* the misconfiguration rather than surfacing it.

**What was added:**
- `lib/ai/modelHealth.ts` — `getDeployedChatModelNames()` (from
  `AZURE_OPENAI_CHAT_DEPLOYMENT` + optional `AZURE_OPENAI_EXTRA_CHAT_DEPLOYMENTS`),
  a pure `classifyModelOverride()` (deployed → valid; `claude-*` → stale
  migration name; `*embed*` → wrong type; else → not deployed), and
  `checkTenantModelOverrides()` scanning every tenant with an override.
- **Deploy-time gate:** `scripts/check-model-health.ts` (`npm run
  check:model-health`) — exits **non-zero** if any stale override exists, so a
  bad config fails the deploy loudly instead of shipping quietly.
- **Admin-visible panel:** AI Studio (`/admin/ai-studio`) now shows a red
  "Model configuration problem" panel listing each flagged workspace + reason,
  or a green "healthy" panel otherwise. A workspace admin sees only their own
  tenant; a master-admin sees the whole platform. The same page now also shows
  the platform trial-ceiling bar.

**Live verification (real DB):**
- `check-model-health.ts` against the real DB: deployed = `gpt-4o`, 0 overrides,
  ✅ all good (the earlier migration cleared the 4 stale ones).
- Temporarily set `default-tenant`'s override to `claude-sonnet-4-6` →
  `checkTenantModelOverrides()` returned **stale count 1**, flagged with reason
  "Stale Anthropic model name (pre-Azure migration)…"; after unset → **0**.
- 6 classifier unit tests pass.

---

## Scope A — all 10 Native ERP AI functionalities: validated live + clean fallback

`scripts/verify-native-ai.ts` exercises every one against **real gpt-4o**, then
forces the global ceiling to prove each falls back deterministically (no
exception) when AI is unavailable. Actual output captured:

| # | Functionality | AI-ON (real gpt-4o) | FALLBACK (gated) |
|---|---|---|---|
| 1 | Lead scoring | score 85, conf 90 (LLM) | deterministic 45 |
| 2 | Next best action | real tailored recommendation | "Send Proposal" (rule) |
| 3 | Deal risk | real risk narrative + action | rule-based level only |
| 4 | Conversation summary | stored (LLM) | no-op, activity still saved |
| 5 | Call-note summary | (same path as #4) | no-op |
| 6 | Follow-up message | real 2-3 sentence draft | none (no draft) |
| 7 | Win probability | 75% (LLM) | deterministic 53% |
| 8 | Churn risk | real retention action | rule score + level only |
| 9 | Duplicate detection | **caught "IBM" = "International Business Machines" @95%** | 0 (Levenshtein abstains — correct) |
| 10 | Data completion | **inferred `expected_timeline="Q3"` from notes** | manual-fill list, nothing invented |

**What changed this pass:** #7/#9/#10 were deterministic-only before. Added
genuine AI layers following the established `getLlmCrmInsight` + fallback
pattern: `lib/crm/winProbability.ts`, an AI completion layer in
`lib/crm/dataCompletion.ts` (`suggestLeadCompletions` — suggests, never
auto-writes), and `detectDuplicatesWithAi` in `duplicateAssistant.ts` (semantic
adjudication merged with the deterministic hits, deterministic kept when both
match). Wired in: leads/contacts create routes now use AI-assisted dedup;
opportunity detail route adds win probability (AI only when already flagged, so
a healthy deal costs nothing extra); new on-demand
`POST /api/crm/leads/[id]/complete` for data-completion suggestions.

**The two edge cases that matter most, both verified:** (a) the semantic dupe
("IBM") the old matcher structurally could not catch is now caught, and (b) the
gated path returns a sensible deterministic value for all 10 with zero
exceptions — the whole point of "AI-native with clean fallback". 8 new
deterministic-fallback unit tests pass.

---

## Scope B — AI Command Center: real search, real explain, generalized confirm-gated executor

**Real "search data":** extracted the Phase-6.1 universal search into
`lib/search/universalSearch.ts` (`runUniversalSearch`) so the header search box
AND the Command Center's `search` intent run the same role-scoped, cross-module
(CRM/Sales/Inventory/HR/Projects) query. `app/api/search/route.ts` is now a thin
wrapper over it.

**Real "explain reports":** the `explain_report` intent pulls a compact LIVE
metrics snapshot (open opps, total/weighted pipeline, stage breakdown, lead
counts) and has gpt-4o explain it grounded strictly in those numbers, with a
non-AI fallback that returns the raw snapshot when gated.

**Generalized propose→preview→confirm→execute→audit executor** (mirrors
Finance's `AiActionProposal`): new `models/AiCommandProposal.ts` (free-form
`actionType`, `destructive` flag, TTL-expiry), `lib/ai/commandActions.ts`
registry (`create_task`, `update_lead_status`, and the destructive `delete_lead`),
and three routes — `POST /api/ai/command/actions` (propose/preview, **never
mutates**), `.../[id]/confirm` (the ONLY mutating route; executes + writes a
`CrmAuditLog`), `.../[id]/reject`. The main `/api/ai/command` route classifies
NL → intent and dispatches; actions resolve a lead by name and refuse to guess
on an ambiguous destructive target.

**Live verification (real gpt-4o + real DB):**
- **Destructive example stops at confirm** (`scripts/verify-command-executor.ts`):
  proposed `delete_lead` → status `proposed`, **lead still exists** ("proposal
  is inert"); only after confirm → lead deleted **and** a `deleted` audit record
  written; reject path left a second lead untouched.
- **Intent routing** (`scripts/verify-command-intents.ts`): "find leads at
  Nimbus"→search, "explain my pipeline"→explain_report(pipeline), "take me to
  the invoices page"→navigate, "delete the lead John Smith"→action/delete_lead,
  "create a task to call the CFO tomorrow"→action/create_task. The last surfaced
  a param-naming variation (`taskDescription` vs `title`) → made the action
  lenient (accepts title/taskDescription/description; maps "tomorrow"→1 day).
- 9 new registry/preview unit tests (preview-never-mutates contract, invalid
  status/unknown action rejection, destructive flag). 780 tests pass.

---

## Scope C — Manufacturing assistant: explicit confirm button + ChatHistory persistence + isolation

**Explicit UI confirm button (replaces keyword matching):** the Manufacturing
assistant page previously inferred confirmation by scanning the typed message
for "yes"/"confirm"/"ok"/"go ahead" (and cancel for "no"/"stop"/…) — so an
ambiguous reply like *"yes, but change the quantity"* could silently execute a
mutation. Removed that entirely. A pending action now renders an explicit
**Confirm / Cancel** button bar; typing never triggers execution
(`confirmAction:false` always on typed messages). The mutation only runs via
`resolvePendingAction(true)` → the backend's existing `confirmAction && actionData`
→ `executeAction` path.

**ChatHistory persistence extended to Manufacturing:** the page already had the
full chat-history sidebar UI, but the routes it called
(`/api/manufacturing/chat-history` + `/archive`) **did not exist** — every save
404'd. Added them (GET list / POST create+update / DELETE / PATCH archive),
mirroring Finance but correctly stamping the schema-required
`module: "manufacturing"` **and** a unique `conversationId` (the older Finance
route predates both required fields). Every query is scoped by userId + tenantId
+ module.

**Explicit cross-tenant isolation test + live check:**
- `tests/ai/manufacturingChatHistory.test.ts` (9 tests): create stamps
  module+conversationId; GET/DELETE/PATCH are all bound to the calling tenant;
  tenant B's scoped GET can never list tenant A's chats.
- `scripts/verify-mfg-chat.ts` (real DB): a chat created for `verify-tenant-A`
  is seen by A's scoped query (1) and **invisible** to B's (0). PASS, cleaned up.
- 787 tests pass total.

---

## Scope D — NL-to-rule workflow automation (end-to-end) + business-health low-data handling

**NL → automation rule:** `lib/crm/ai/nlToRule.ts` turns a plain-English
description into a structured `CrmAutomationRule`, **validated against the
engine's actual vocabulary** (11 triggers / 6 entities / 8 operators / 12 action
types) — a hallucinated trigger/entity is coerced to a safe default with a
warning, invalid conditions/unsupported actions are dropped, and a rule with no
supported action is rejected outright. New route `POST /api/crm/automations/parse`
(gated by `manage_workflows`) returns the parsed rule for **review** — it does
not save; the user persists it via the existing create route (human in the loop).
The rule is created **disabled** for review.

Also fixed a real pre-existing engine bug: `automationEngine.ts`'s `create_task`
action set `owner_id` but not the schema-required `assigned_to_id`, so **every**
automation-created task silently failed validation. Now it assigns correctly —
which is what makes the flow genuinely end-to-end.

**Business-health low/no-data handling:** `generateBusinessHealthSummary` used to
call the LLM even for a tenant with zero data (the fetchers return a zeros
summary *object*, so a naive presence check wasn't enough). Added
`hasMeaningfulData` that inspects the actual activity numbers
(revenue/transactions/orders/pipeline/opps); a low-data tenant now gets a
deterministic "not enough activity yet" summary and a new `insufficient_data`
status — **no wasted AI call, no invented insights**.

**Live verification (real gpt-4o + real DB):** `scripts/verify-nl-rule.ts`:
- "When a new lead is created with a High priority, create a follow-up task"
  → parsed to trigger=record_created, entity=Lead, condition priority=equals=High,
  action=create_task (0 warnings) → saved → engine fired → execution logged
  **status=Completed** (task actually created) — full end-to-end.
- Empty tenant → status **insufficient_data**, deterministic summary stored, no
  AI call.
- 6 new parser-validation unit tests (vocabulary coercion, dropping invalid,
  gated outcome). 793 tests pass.

---

## Scope E — AI Studio: cost analytics (done) + scoped RAG + health-check panel (done)

Analytics with real numbers and the stale-model health-check panel were already
built (Phase 6.6 + the health-check task above); this scope adds **scoped RAG**.

**Scoped RAG** (`lib/ai/rag.ts` + `models/AiEmbedding.ts`):
- **index** — embeds a tenant's own invoices + CRM notes via
  `text-embedding-ada-002` (1536-dim), upserted per source doc (bounded to 50/
  source to cap cost).
- **retrieve** — tries MongoDB Atlas **`$vectorSearch`** (index
  `ai_embedding_index`); on any error/absence falls back to in-memory **cosine
  similarity** over the tenant's stored vectors. The answer shows which path ran.
- **answer** — gpt-4o answers grounded STRICTLY in retrieved chunks (cites
  bracket numbers), told to say "I don't have that" rather than invent.
- Every query is **tenant-scoped** end to end.
- Route `POST /api/admin/ai-studio/rag` (`action: index | query`, admin-only) +
  a knowledge-base panel on `/admin/ai-studio` (build index, ask, see answer +
  retrieval method). Atlas index setup documented in `SETUP_AI.md`.

**Live verification (real embeddings + real gpt-4o + real DB)**
(`scripts/verify-rag.ts`):
- Indexed **30 real docs** (15 invoices + 15 CRM notes), embeddingConfigured=true.
- Query "What invoices do we have and what is their status?" → real grounded
  answer citing retrieved invoices (e.g. "Invoice INV-0051 … total 1180 [1]"),
  via **cosine_fallback** (no Atlas index on this cluster — the documented path).
- Cross-tenant retrieve for a different tenant → **0 chunks** (tenant-scoped).
- 3 unit tests (cosine ranking, tenant-scoped fallback query, vector-search
  path). 796 tests pass.

---

## Scope F — AI Copilot: real Finance anomaly detection + draft correspondence

Meeting/call summaries are already covered by Scope A (conversation/call-note
summaries). This scope adds the two remaining Copilot pieces.

**Finance anomaly detection** (`lib/finance/anomalyDetection.ts`): a deterministic
scan over the tenant's invoices flags three classes — **amount_outlier**
(> mean + 2.5σ, needs ≥5 invoices + real spread), **duplicate_suspect** (same
customer + identical amount within 7 days → possible double-billing), and
**long_overdue** (overdue + dated > 60 days). Detection is deterministic
(statistics, predictable); an AI layer (`explainAnomalies`) narrates *which to
tackle first and why*, with the deterministic descriptions as the fallback.
Route: `GET /api/finance/ai/anomalies`.

**Draft correspondence** (`lib/finance/draftCorrespondence.ts` +
`POST /api/finance/ai/draft-correspondence`): AI-drafts a payment reminder for an
invoice (tone auto-escalates friendly → firm → final_notice by days overdue),
returning editable subject+body for a human to review — it never sends. Falls
back to a deterministic template when AI is gated/unavailable.

**Live verification (real gpt-4o + real DB)** (`scripts/verify-finance-ai.ts`):
- Scanned **28 real invoices** (mean 4748, σ 6492) → 12 anomalies
  (1 outlier, 1 long-overdue, 10 duplicate-suspects in the seed data).
- A synthetic set exercised all 3 types; AI explanation was real and grounded
  ("Invoice INV-OUTLIER … Highly overdue (200 days) … amount outlier …").
- Draft correspondence for a 200-days-overdue invoice → real **"Final Notice"**
  email (tone auto-escalated), professional body.
- 9 new unit tests (each anomaly type + non-flag cases + both fallbacks).
  805 tests pass.

---

## Scope G — Universal search: semantic embedding upgrade (keyword fallback retained)

The universal search already spanned CRM/Sales/Inventory/HR/Projects (Phase 6.1,
extracted to `lib/search/universalSearch.ts` in Scope B). Scope G layers
**semantic** search on top:

- `runSemanticSearch` embeds the query (`text-embedding-ada-002`) and retrieves
  via the same tenant-scoped RAG path (Atlas `$vectorSearch` → cosine fallback)
  over the indexed invoices + CRM notes — so a natural-language query matches
  records it shares no keyword with. Role-gated like keyword search (CRM/Sales
  sources), and returns `[]` (never throws) when embeddings are off/unindexed.
- `runCombinedSearch` runs the keyword baseline ALWAYS and merges semantic hits
  on top (de-duplicated by id) — so results never regress vs. before. Exposed via
  `GET /api/search?semantic=true` and used automatically by the AI Command
  Center's `search` intent (NL queries benefit most).

**Live verification (real embeddings + real DB)** (`scripts/verify-semantic-search.ts`):
- Query "money customers still owe us" → **keyword: 0** results (no literal
  match) but **semantic: 5** (invoices at 80-81% relevance, including an overdue
  one) → **PASS: semantic surfaced matches keyword missed**.
- Keyword baseline for "INV" still returns 5 (fallback path intact).
- 6 unit tests (role gating, embeddings-off skip, retrieval-error skip,
  keyword-only vs merged). **811 tests pass.**

---

## A–G scope: COMPLETE

All of A–G implemented, each with live gpt-4o/embedding verification against the
real DB, edge cases, and per-feature commits. Full suite: **811 passing**, `tsc`
+ `eslint` clean. Kept verification scripts under `scripts/verify-*.ts` and
`scripts/check-*.ts` as reproducible live checks.

---

## Part 1.1 — `|| "default-tenant"` fallback hardening (security)

**The risk (your Phase 3 flag):** an authenticated session missing `tenantId`
(a JWT/session regression) would SILENTLY read/write the shared `default-tenant`
bucket instead of failing — a cross-tenant data hazard. A prior session hardened
only the highest-risk Finance/HR-payroll *writes* (14 handlers); the remaining
~200 occurrences across reads and other writes still fell back.

**This pass completed the remediation:** converted **215 occurrences across 118
files** from the silent fallback to a hard 401 via the existing
`requireTenantId(session)` helper (returns a 401 `NextResponse` when tenantId is
missing, else null). The transformation was scripted (guard-per-variable) with
`tsc --noEmit` + full `eslint` + `vitest` as the safety net, then the handful of
inline/odd cases fixed by hand.

**Concrete before/after** (e.g. `GET /api/manufacturing/chat-history`):
- *Before:* `const tenantId = session.user.tenantId || "default-tenant";` →
  a tenantless session queries `ChatHistory.find({ tenantId: "default-tenant" })`
  — silently returns another workspace's chats.
- *After:*
  ```
  const tenantIdGuard = requireTenantId(session);
  if (tenantIdGuard) return tenantIdGuard;   // → 401, DB never queried
  const tenantId = session.user.tenantId;
  ```

**Deliberately left as legitimate exceptions** (documented, not changed):
- `app/api/auth/register`, `.../password-reset/request`, `.../password-reset/confirm`
  — **pre-authentication** flows that derive the tenant from the *request*
  (subdomain/body/header), not a session; `DEFAULT_TENANT_ID` is the base-domain
  default for a signup/reset with no subdomain. No session to hard-fail on.
- `app/api/tenant/status` — a string *comparison* against `"default-tenant"`, not
  a fallback.
- `lib/logger.ts` — changed to log `"unknown"` (not `"default-tenant"`) so a
  tenantless activity log is visibly anomalous rather than misattributed.

**Test:** `tests/auth/requireTenantId.test.ts` (6) proves the helper 401s on a
tenantless/empty/absent session, and — at the route level — that a converted
route returns 401 and **never queries the DB** (no default-tenant read) when
tenantId is missing, while a real tenant proceeds scoped correctly.
**Tests 811 → 817**, `tsc`/`eslint` clean.

---

## Part 1.2 — Accept-invite callbackUrl support

**The gap:** `/accept-invite` already links to `/auth?callbackUrl=<invite-link>`,
but `SignInForm.tsx` ignored `callbackUrl` and always redirected to the role
dashboard — so an invited user had to manually re-open the invite link after
signing in.

**Fix:** `SignInForm` now reads `callbackUrl` and, on successful credential OR
OAuth login, returns the user there instead of the dashboard. Validation lives in
`lib/auth/safeCallbackUrl.ts` (unit-tested): only **same-origin relative paths**
are honoured — absolute URLs, protocol-relative (`//evil.com`), backslash tricks
(`/\evil.com`), and `javascript:`/encoded-absolute payloads are all rejected to
prevent an open-redirect. When there's no safe callbackUrl, the flow is
**unchanged** (role dashboard). Updated the invite-page copy since the user is
now auto-returned rather than told to re-open the link.

**Tests:** `tests/auth/safeCallbackUrl.test.ts` (7) covers the happy path
(plain + URL-encoded invite links), the no-callback default, and every
open-redirect vector. Tests 817 → 824, `tsc`/`eslint` clean.

---

## Part 2.1 (6.10) — Visual ERP Builder (React Flow canvas over AutomationRule)

Replaced the static "Visual Workflow Designer" mock (`app/crm/workflows`) with a
real **React Flow** (`@xyflow/react` v12) drag-and-drop canvas that is a visual
layer over the SAME `AutomationRule` backend the form builder uses:
- `components/crm/VisualWorkflowBuilder.tsx` — custom Trigger / Condition /
  Action nodes with inline config selects, connectable, with minimap/controls.
- `lib/crm/workflowGraph.ts` — a **pure** `compileGraphToRule` that turns the
  node graph into the exact `{ name, entity, trigger, conditions, actions }`
  payload `POST /api/crm/automations` expects, with the same vocabulary
  validation (one trigger, ≥1 action, unknown values coerced with warnings,
  invalid conditions/actions dropped). Publish → same endpoint → same real,
  executing rules. The form builder (`NewAutomationRuleModal`) stays as an
  alternate entry point.

**Real bug caught by the production build (not just tests):** the client
component imported the rule vocabulary from `nlToRule.ts`, which transitively
pulls the Node-only AI client (`undici`/`node:crypto`) — this **failed
`next build`** ("UnhandledSchemeError: node:crypto") and would have broken the
page at runtime. Fixed by extracting the vocabulary into a dependency-free
`lib/crm/automationVocabulary.ts` that both server (`nlToRule`) and client
(`VisualWorkflowBuilder`) import. **`next build` now succeeds (exit 0).**

**Tests:** `tests/crm/workflowGraph.test.ts` (7) — valid compile, name/trigger/
action requirements, vocabulary coercion, dropping invalid, malformed-JSON
payload tolerance. 824 → 831 tests; `tsc`/`eslint` clean; **full `next build`
green**.

---

## Part 2.2 (6.3) — Low-Code: configurable multi-step approval chains + print-format builder

**Approval workflow (replaces the hardcoded 3-tier discount router):**
`models/crm/ApprovalPolicy.ts` — a tenant-editable, ordered chain of steps, each
routed to an approver role and gated by optional thresholds (avg discount % and/
or amount). `lib/crm/approvalEngine.ts` now:
- uses the configured policy when one exists (multi-step chain via the pure,
  tested `applicableSteps`), else falls back to the **legacy 3-tier behaviour
  unchanged** (backward compatible);
- `approveQuote` **advances the chain** — approving a non-final step routes to
  the next applicable step and keeps the quote pending, finalizing only after
  the last step. Chain state tracked via new `step_index`/`total_steps`/
  `approver_role`/`policy_id` fields on `ApprovalRequest`.
- API: `GET/POST /api/crm/approval-policies` (gated by `manage_workflows`).

**Real pre-existing bug fixed:** the engine looked up approvers by `role:"Admin"`
but the User enum is lowercase `"admin"`, so the fallback **never matched and
every non-auto approval threw** "No Manager or Admin user found". `findApprover`
is now case-insensitive with a lowercase-`admin` fallback.

**Print-format builder (on top of the invoice-template selection system):**
`app/sales/print-format-builder/page.tsx` — pick a base template and tweak the
print format (accent colour, striped rows, HSN visibility, font, footer note)
with a **live preview** that re-renders as you change things, then save. Save
persists to `DocumentSettings` (which the PDF/preview renderer already consumes)
and sets the default template. Added a `POST` override mode to the template
preview route so unsaved tweaks render live.

**Live verification (real DB + real renderer):**
- `scripts/verify-approval-chain.ts`: a 2-step policy routed a 30%-discount quote
  Submit → Manager (step 1/2) → approve → Executive (step 2/2, quote still
  pending) → approve → **Approved**. PASS.
- `scripts/verify-print-format.ts`: rendering with red vs green accent + striped
  toggle produces HTML that **contains each override and genuinely differs** —
  the customization is really applied, not cosmetic.
- 6 new pure-routing unit tests. 831 → **837**; `tsc`/`eslint` clean.

---

## Part 2.3 (6.5) — Smart Enterprise Calendar (unified aggregation + AI conflicts)

- `models/CalendarEvent.ts` — user-created events (meetings/reminders/deadlines).
- `lib/calendar/aggregateEvents.ts` — `getCalendarEvents` merges those with
  **derived** events pulled live from across modules (CRM tasks, HR leave &
  attendance, finance payments, payroll) into one normalised, **role-scoped**
  list (a user only sees sources their role can access). Plus a pure
  `detectConflicts` (crowded deadline days; deadlines colliding with team
  leave/absence).
- `lib/calendar/conflictInsight.ts` — AI **prioritisation** of conflicts via
  `callClaudeForTenant`, kept in the small `suggestion` token cap (lightweight
  classification, not a chat), with a deterministic severity-ordered fallback.
- API: `GET/POST /api/calendar`, `GET /api/calendar/conflicts?ai=true`.
- **Rebuilt the orphaned `components/crm/TaskCalendar.tsx`** (was CRM-tasks-only,
  imported nowhere) into a unified week grid — colour-coded by source, with an
  AI "Detect conflicts" button and conflict-day highlighting — and mounted it at
  the new `/calendar` page.

**Live verification (real DB + real gpt-4o)** (`scripts/verify-calendar.ts`):
- Aggregated **508 real events** across a 3-month window (500 tasks, 7 payments,
  1 leave); **41 conflicts** detected in real data.
- A crafted 2-deadlines-on-a-leave-day collision → flagged **high** severity;
  AI prioritisation ran (real gpt-4o) and suggested rescheduling.
- 6 pure conflict-detector unit tests. 837 → **843**; `tsc`/`eslint` clean.

---

## Part 2.4 (6.8) — Enterprise Organization Management (8-level hierarchy)

Built **additively** (an overlay — does NOT replace Department/Employee, so every
existing module query is unaffected):
- `models/OrgUnit.ts` — one self-referential tree modelling all 8 levels
  (Company → Region → Branch → Office → Warehouse → Department → Team →
  Employee) via a `level` field, a **materialized `path`** (ancestor ids) for
  single-query subtree lookups, per-node `localization` (currency / language /
  timezone / taxRegime), and optional `linkedDepartmentId`/`linkedEmployeeId`
  so nodes reference existing data instead of duplicating it.
- `lib/org/hierarchy.ts` — pure, tested: `isValidChildLevel` (strict level
  ordering, skips allowed), `resolveLocalization` (inherit each field from the
  nearest ancestor that sets it), `buildTree`, `consolidateSubtree`.
- API: `GET/POST /api/org/units` (create validates level order + computes path),
  `GET /api/org/units/[id]/consolidated` — subtree counts by level, **effective
  inherited localization**, and real headcount rolled up from linked
  Departments + Employee-level nodes.
- UI: `/admin/org-structure` — tree view, add-unit form, and a live consolidated
  report panel per node.
- **Migration path (opt-in, not auto-run):** `scripts/migrate-seed-orgunits.ts`
  seeds a Company root + a linked Department node per existing Department
  (mirroring Department parent links), idempotent per tenant — existing data
  untouched.

**Live verification (real DB)** (`scripts/verify-org-hierarchy.ts`): built a full
Company→…→Employee chain; level validation **rejected** placing a Company under a
Team; the US-Region **materialized-path subtree returned exactly 7** nodes; and a
Team's **effective localization correctly inherited** currency=USD (from Region),
taxRegime=GST-IN (from Company), timezone=America/New_York. PASS.
8 pure-helper unit tests. 843 → **851**; `tsc`/`eslint` clean; suite green at
every step (additive model → no regressions).
