# DISCOVERY — Sarvam multilingual layer (branch `sarvam`, 2026-09-19)

## 1. Where user text reaches the AI (pipeline wiring points)
Client surfaces: `components/dashboard/AiSidebar.tsx` (global panel), `components/dashboard/CommandCenterInput.tsx`, and 7 per-module pages `app/{admin,finance,sales,inventory,hr,manufacturing,crm}/ai-assistant/page.tsx`.
Server routes taking free user text → `callClaudeForTenant` (lib/ai/tenantAi.ts):
- `/api/{admin,finance,sales,inventory,hr,manufacturing,crm}/ai-assistant` (Q&A)
- `/api/ai/command` (intent classify → propose action/workflow; uses `AiCommandProposal`)
- `/api/ai/prefill` (create-form extraction), `/api/ai/complete`
- `/api/{sales,inventory}/ai-memory-query`, `/api/sales/invoices/ai-draft|ai-notes`
- Doc intel (`lib/docIntel/extractor.ts`) takes files, not typed text — out of scope.
**Wiring decision:** pipeline is applied server-side at a single new helper called at the top of the text-taking routes (ai-assistant x7, command, prefill), plus client `tryAiCreateFlow` stays the create entry. Never in input fields.

## 2. Existing create machinery (important — shrinks Feature 3)
- `lib/ai/createFlow.ts::tryAiCreateFlow` — every assistant surface calls it first. Verb regex (`CREATE_VERB_RX`) + `findCreateTarget` (lib/ai/createTargets.ts, ~50 targets, typo-tolerant) → `/api/ai/prefill` extracts fields → `stashPrefill` → **navigate to the real form pre-filled; the user clicks Create**. It does NOT execute creation. Missing customer → redirects to New Customer form.
- `/api/ai/command` + `AiCommandProposal` + `lib/accounting/aiActions.ts`: propose→confirm→execute, but only 7 Finance-config actions (create/update/delete account, lock/unlock, budget, banking rule). **No invoice/bill/customer/expense create action.**
- `lib/aiRuntime/nl/` (356 lines) = maps chat to the 30 *analysis workflows* (`workflowIntentMap`, `runWorkflowFromChat`), not record creation. `resolveIntent`/memory there is not slot filling. **AI-NL layer does NOT already do Feature 3.** `AiMemory` `ai_nl_session` scope exists for conversation state.
- No slot-filling / multi-turn create exists anywhere.

## 3. Required fields (source of truth)
Sales invoice: `app/api/sales/invoices/route.ts` POST (lines ~127-132) enforces for non-draft: `customerId`, ≥1 `lineItems`. Mongoose `models/sales/SalesInvoice.ts` requires per line `name`, `qty>=1`, `unitPrice>=0`; `number` is auto-generated. Route validation is minimal and lives inline in the route; prefill spec (`app/api/ai/prefill/route.ts` `invoice` spec) marks `customerName` and line `name` REQUIRED. Two invoice concepts exist (Finance `Invoice` vs Sales `SalesInvoice`; assistant targets Sales). No shared validation schema to import — Feature 3 will derive required slots from the Mongoose model `required` paths + the route's extra checks via a small declarative registry that is unit-tested against the route/model (drift test).
Bill / expense / customer: prefill specs exist (`REQUIRED` markers in prefill route); routes not yet audited.

## 4. Metering
`lib/platform/ai/instrumentation.ts::recordAiUsage` → `AiUsageRecord` (fields: tenantId, feature bucket enum, modelName, tokens, estimatedCostUsd, latency, status). `AiCostRate` keyed by `modelName`, per-million-token rates only. **No provider dimension** — additive `provider` (default "azure_openai") + Sarvam per-character rate needed. Caps: per-tenant `getAiUsageCount` (call counter) + global cap in `callClaudeForTenant`; Sarvam calls would need to count in the same counters (combined spend). Tenant switch: `Organization.settings.ai.disabled` (models/admin/Organization.ts:145 `ai` block).

## 5. Latency baseline (measured 2026-09-19, sandbox → Azure chat deployment, max_tokens 5, 3 runs)
3.52s (cold), 2.05s, 1.85s. Local Mongo up on 27017. Sarvam reachable (403 without key, 0.52s RTT). This is a raw single-call floor; end-to-end route baselines to be added to PERFORMANCE.md before/after wiring.

## 6. Sarvam API (from docs.sarvam.ai, read 2026-09-19)
Base `https://api.sarvam.ai`; auth header `api-subscription-key`.
- `POST /text-lid` `{input (≤1000 chars)}` → `{request_id, language_code, script_code}`. Codes: en-IN hi-IN bn-IN gu-IN kn-IN ml-IN mr-IN od-IN pa-IN ta-IN te-IN; scripts Latn Deva Beng Gujr Knda Mlym Orya Guru Taml Telu.
- `POST /translate` `{input, source_language_code|auto, target_language_code, model: mayura:v1 (≤1000 chars) | sarvam-translate:v1 (≤2000), mode: formal|modern-colloquial|classic-colloquial|code-mixed, speaker_gender, output_script (mayura only), numerals_format}` → `{request_id, translated_text, source_language_code}`. Errors 400/403/422/429/500.
- `POST /transliterate` `{input (≤1000), source_language_code, target_language_code, numerals_format, spoken_form, spoken_form_numerals_language}` → `{transliterated_text,...}`; languages: the 11 above.
- Speech: ASR/TTS exist (saarika / bulbul) — interface only this pass. (Repo already has Azure speech: lib/ai/speechToText.ts.)
- Docs pages for /translate & /transliterate under `api-reference-docs/text/*` 404; verified via `api-reference/text/translate-text` and the transliterate cookbook. Re-verify against the live dashboard once a key is available.
No API key is available in this sandbox → all Sarvam calls mocked; live verification is the user's step (sarvam_setup.md).

## 7. Baseline tests
`docs/ai/BASELINE_FAILURES.md`: 46 files fail (Atlas DNS blocked), 3 tests in invoiceLineTotal.route.test.ts — not ours. New tests must set a local `MONGODB_URI` override. Full baseline to be re-recorded on this branch before first feature commit.

## 8. Feature 3 scope (proposed)
Cover ONE flow perfectly first: **sales invoice** (explain / do / ask, slot-fill customer + line items + due date, confirm, then execute via existing `POST /api/sales/invoices` logic and redirect to `/sales/invoices/[id]`). Customer/expense/bill only if the pattern holds. Not covered (recorded): other ~45 create targets keep the existing prefill-and-navigate behaviour unchanged.
