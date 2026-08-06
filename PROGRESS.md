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

**Committed as:** `<pending — see commit log>` (Phase 0 + this follow-up combined into one checkpoint commit, since the follow-up was requested as "the first thing in Phase 1" before continuing — not a separate phase of its own).
