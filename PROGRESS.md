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

**Judgment calls:** kept `lib/ai/claude.ts`'s filename/exports despite being Azure-backed now (avoids touching call sites — flagged as a future cleanup). `CLAUDE_DEFAULT_MODEL` reads `AZURE_OPENAI_DEPLOYMENT_NAME` at module-load time rather than being hardcoded (Azure deployment names have no universal default).

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
