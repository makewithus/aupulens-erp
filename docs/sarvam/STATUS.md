# STATUS — final (branch `sarvam`, Phase 3 sign-off)

**Verified how:** **browser** = driven in real Chrome against a seeded demo workspace (34 steps, `QA_GUIDE.md` self-run log) ·
**test** = automated tests, Sarvam mocked · **live key** = only provable with a real Sarvam key (the user's step,
`LIVE_VERIFICATION.md`). Nothing below is "pending": the live-key items are declared boundaries with a reason (no key exists in this environment).

## ⚠ ESCALATION 1 — the Azure cost cap does not cap Azure spend
`AiLimit.maxCostUsdPerMonth` ("Max cost/mo" on the organisation's AI limits, Global Admin) **implies** a spending limit. For Azure OpenAI — the
larger provider — it **does nothing**: `tenantAi.ts` enforces only the call-count cap and the platform ceiling. Only Sarvam translation honours the cost
cap (combined Azure+Sarvam spend, `lib/platform/ai/spend.ts`). **Fix shape:** extend that same `costCapReached` gate into `callClaudeForTenant` /
`…Stream` and return a gated result. Deliberately not changed here (it alters behaviour for every tenant with a cap set). Full paragraph:
`docs/admin/OPEN_QUESTIONS.md`. Do this before the cost cap is advertised to customers.

## ⚠ ESCALATION 2 — pre-existing 500 on a customerless draft invoice
`POST /api/sales/invoices` with `status: "draft"` and no customer skips the route's checks, then the model rejects it → **HTTP 500 with a raw Mongoose
message** (not a 400). Nothing invalid is stored. **Unreachable from the assistant** — proved: registry-driven `validatePayload` runs before any POST, and a
1,500-conversation randomised test (execute flag ON) asserts every POST that ever happens is complete (`tests/ai/taskFlow/guards.test.ts`).

## Feature table
| Feature | Implemented | Verified how | Notes |
|---|---|---|---|
| Language pipeline (detect / protect / normalise / translate / respond), English short-circuit | Yes | test (134+) · browser (English path makes **zero** guided-flow requests: C10) | English p95 ≈ 0.04 ms |
| Value-based number check; placeholder-corruption safety net | Yes | test | 4 required cases + 8 mangling patterns |
| Sarvam client (timeout, 1 retry, never throws; speech = interface only) | Yes | test | real endpoint shapes read from docs; **live key** confirms |
| Provider down / wrong key / tenant switch off → fails open | Yes | **browser** (R4 with the mock stopped: still answers, degraded record written, nothing created) · test | |
| Streaming (input side; reply streams in English) | Yes | test · browser (sidebar is the streaming surface) | declared limit: streamed replies stay English |
| Guided create — explain / do / ask / ask-which | Yes | browser (C1–C4, C11) · test | |
| Skip-ahead (all mandatory supplied ⇒ summary only) | Yes | browser (C1) · test | optional due date shown in summary, changeable |
| **Escape hatch** "Skip the questions and open the form" at every question | Yes | browser (C3) · test (5 phrasings × every stage) | opens a partial form = old behaviour; never creates, even with auto-create ON |
| **Item name**: never defaulted; tenant's recent items offered | Yes | browser (C2: choices come from the seeded history) · test | |
| Unusual English phrasings + **LLM fallback** when rules are unsure | Yes | test (60+ phrasings; LLM mocked) | "raise a bill for Acme" → LLM; vendor/lookup/other messages never reach it; failure ⇒ legacy path. Real-LLM behaviour = **live key** for Azure prompt wording |
| Slot filling: choices, multi-answer, back, skip, change, cancel, progress, resume/expire | Yes | browser (C2, C4, C5) · test | drafts 30 min |
| Answers in the user's language; reply in that language; "I understood this as…" + correction (`no, I meant …`) | Yes | browser (R1–R3, C7) with the mock · test | real translation quality = **live key** |
| Registry + **drift test that fails CI** | Yes | test (mutation-proven) | only the sales invoice is wired |
| Default path (ON): summary → confirm → pre-filled form | Yes | browser (C1–C3, R1; asserts the form's own customer/item/price/due date) | |
| Execute path (OFF by default) | Yes | browser (E1 creates a **Draft** through the real route, lands on it, exactly one record; E2 flag off ⇒ none) · test both states | |
| Permissions: refusal, never blank | Yes | browser (X1 HR refusal, X2 /sales gate, X4 401, O9 read-only admin) | |
| Empty states | Yes | browser (X3 no customers → New Customer form; P3/O3/O6 no AI usage / no languages) | |
| Loading / error states | Yes | browser (P2, P4, O7, O8, C8, C9) | |
| Metering: provider dimension, server-side cost; seeded rate reaches real figures | Yes | test · **browser** (O1: on-screen Sarvam ₹ = Σ characters × the seeded rate, computed from the DB) | seed script refuses a blank price |
| Dashboard + org AI Usage split by provider; combined spend vs cap | Yes | **browser** (P1, O1, O2) | |
| Cost cap gates Sarvam on combined spend; regional turns charge the AI counter | Yes | test | Azure not gated — Escalation 1 |
| Configuration tab: status, languages used, audited per-tenant switch | Yes | **browser** (O4–O8; toggling wrote an audit record and really turned translation off for that tenant) | |
| Stable baseline | Yes | test — see `BASELINE.md` | shared-config edit, below |
| Docs & QA | Yes | — | `QA_GUIDE`, `LIVE_VERIFICATION`, `PERFORMANCE`, `VOICE_READINESS`, `BASELINE`, `DISCOVERY`, `sarvam_setup.md`, `qa-browser/README` |
| Voice | Designed, not built (as briefed) | n/a | `VOICE_READINESS.md` |
| Sarvam real-API behaviour, placeholder format, phrase quality, uncached regional latency | Mocked here | **live key** | first step of `LIVE_VERIFICATION.md` |

## Known limits (plain English)
* Streamed replies stay in English (your message is understood; non-streaming assistants answer in your language).
* Only the **sales invoice** has the guided flow. Customer, bill, expense and ~50 other create actions are unchanged (regional input reaches them).
* Sarvam behaviour is **mock-verified** until the live check; the `ZXQnZXQ` placeholder format is **unconfirmed** (wrong ⇒ degrades, never misleads).
* Every non-English phrase needs native-speaker review (Hindi, Tamil first).
* The Azure cost cap is not enforced (Escalation 1). The customerless-draft 500 is pre-existing (Escalation 2).
* Browser QA ran in **dev mode** (first loads are slow) with a mock Sarvam; production build and real provider are separate confirmations.

## Merge notes
* **Branch:** `sarvam`, local only — **not pushed, not merged**. Cut from `e3eff17`. `Final commit `aaec2b5`; 12 commits ahead of the branch point.`
* **One shared-config edit:** `vitest.config.ts` — `hookTimeout` 10 s→30 s, `testTimeout` 5 s→15 s (affects **every** suite in the repo). Why: Mongo-backed suites' heavy `beforeAll`
  sits at the old limits under load; the timeout-only flakiness **reproduced on the untouched branch point** (1 of 7 runs there), so it pre-dates this branch. Revertible
  in one line if CI on a quieter machine behaves differently. Evidence and the 30/15-vs-45/20 decision: `BASELINE.md`.
* **Before it works (env):** `SARVAM_API_KEY` (from the Sarvam dashboard), `SARVAM_API_BASE_URL=https://api.sarvam.ai`, `SARVAM_ENABLED=true`, `SARVAM_TIMEOUT_MS=2000`;
  **`SARVAM_COST_PER_1K_CHARS_USD` set to the real price — NOT blank** (a blank used to seed a ₹0 rate; the script now refuses). No key ⇒ the product runs English-only, no errors.
* **Run once:** `SARVAM_COST_PER_1K_CHARS_USD=<price> npx tsx scripts/seed-platform-sarvam-cost-rates.ts`.
* **Additive schema:** `AiUsageRecord.provider/callType/characters`, `AiCostRate.provider/costPerThousandCharacters`, `Organization.settings.ai.multilingualDisabled/autoCreateEnabled`, new `AiLanguageInteraction` (90-day TTL). No migration needed; historical rows default to Azure.
* **Order vs other branches (measured with `git merge-tree` dry-runs, nothing merged):**
  * `sarvam` + `global/admin` → **merges cleanly** (they overlap on the platform dashboard, org detail page and `lib/platform/organizations/detail.ts`, but git resolves it).
  * `sarvam` + `ai/workflows` → **conflicts, none in files this branch touched**: `app/api/cron/ai/runtime-sweep/route.ts`, `lib/aiRuntime/workflows/ai-29-control-monitoring/index.ts`,
    `tests/ai/aiRuntime/ai07AccrualIntelligence.test.ts`, `tests/ai/aiRuntime/ai21StatementIntelligenceEdgeCases.test.ts` — they come from `ai/workflows` and `sarvam` having
    different histories (merge-bases `dc3e1f7` / `e3dcb33`), so whoever lands second resolves them. `ai/workflows` also auto-merges cleanly with the files we both edit
    (`tenantAi.ts`, `AiSidebar.tsx`, `app/api/ai/command/route.ts`, `statuses.ts`). Suggested order: **`global/admin`, then `ai/workflows`, then `sarvam`** (smallest conflict surface last); run the
    `BASELINE.md` command after each merge.
* **Auto-create** stays off everywhere until QA enables `settings.ai.autoCreateEnabled` per tenant (a data change).

## Suite result
Fresh `git worktree` of the final commit, `npx vitest run --maxWorkers=3` ×3: **219 files / 2348 tests / 0 failed / 0 pending, identical at test level** (30 s/15 s timeouts — `BASELINE.md`). `tsc --noEmit` exit 0 · `next build` exit 0 · `eslint` clean on every file this branch touched · clean tree. Browser QA: **34/34** steps pass (`QA_GUIDE.md`).
