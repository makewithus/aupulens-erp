# AUPULENS — MULTILINGUAL UNDERSTANDING, INPUT NORMALISATION & INTERACTIVE TASK COMPLETION
## Implementation Brief — branch `sarvam` (saved so it survives context compaction)

> Branch `sarvam` only. Commit locally. NEVER push, NEVER merge, until the user has tested and approved.
> Use CLAUDE.md + docs/_context/* for architecture; scan code only when needed, and smartly.
> Create `sarvam_setup.md` (repo root) explaining how to get API keys from the Sarvam AI dashboard and put them in `.env`.
> Test every feature after implementation; nothing existing may break.

## PART 0 — Goal
Indian users type Hindi/Tamil/Telugu/Marathi/Bengali/Gujarati/Kannada/Malayalam/Punjabi/Odia, often Roman-script, code-mixed, typo-ridden, WhatsApp-pasted. Azure OpenAI (the brain) is unchanged. Build a layer in front so the AI receives clean English of what the user meant.
1. Multilingual understanding (Sarvam): detect, transliterate/translate to English, optionally reply in user's language. Sarvam = language; Azure OpenAI = reasoning.
2. Input normalisation: fix typos/spacing/paste damage on the way to the model — never in the text box.
3. Interactive task completion: enough info → act; missing → ask one question at a time; "how do I" → explain.
Success: Coimbatore shop owner typing messy Tamil gets the same outcome as an English user in Mumbai, same speed.

## PART 1 — Hard rules
1. Azure OpenAI remains the brain. Sarvam never decides actions / generates accounting answers / replaces lib/ai/claude.ts / lib/ai/tenantAi.ts.
2. Additive only. No existing signature/route/component/model changes shape. Layer off ⇒ identical behaviour.
3. English input must not get slower: short-circuit before any Sarvam call. Measure and prove.
4. Never autocorrect the user's text box. Normalise a copy; original is stored/displayed/echoed.
5. Never alter protected entities: names, invoice numbers, GSTINs, PANs, product codes, SKUs, amounts, dates, emails, phones, URLs, anything in quotes.
6. Fail open: Sarvam slow/error/unconfigured ⇒ pass original text to Azure OpenAI, log it.
7. Never act on a guess: low confidence ⇒ ask. Most important for anything creating/changing a financial record.
8. Every AI call metered incl. Sarvam, as a second provider with own cost.
9. No secrets in code: .env, documented in .env.example, never logged, never sent to client.
10. Full test suite green before/after every commit vs baseline (docs/ai/BASELINE_FAILURES.md); tsc --noEmit clean; eslint clean on touched files.
11. Sarvam mocked in tests; CI never makes live calls.

## PART 2 — Discovery (no feature code before)
Read docs/ai/SYSTEM_INVENTORY.md, GLOSSARY.md, lib/ai/claude.ts (Azure OpenAI despite name), lib/ai/tenantAi.ts (callClaudeForTenant chokepoint: kill switch, monthly cap, metering), lib/ai/featureLimits.ts, lib/accounting/aiIntent.ts, aiActions.ts (buildActionPreview/executeAction), models/ai/AiCommandProposal.ts, AiActionProposal.ts, ChatHistory.ts, AiMemory.ts (ai_nl_session scope), lib/aiRuntime/ (AI-NL layer), lib/constants/statuses.ts (enums as *_VALUES), docs/ai/BASELINE_FAILURES.md.
Produce docs/sarvam/DISCOVERY.md: every place user text reaches AI; what AI-NL layer already does; where required fields for invoice/bill/customer/expense are really defined; measured AI latency baseline; Sarvam API version; which flows covered/not covered.

## PART 3 — Pipeline: lib/ai/language/
user text → detect() → protect() → normalise() → translate() (Sarvam, only if not English) → unprotect() → [Azure OpenAI unchanged] → respond() (translate reply back if user wrote in regional language).
- Short-circuit early: script heuristics + wordlist before any API call.
- Protect before normalise; mask, transform, restore; restoration exact.
- Traceable result object: { original, detectedLanguage, script, confidence, normalised, translated, entitiesProtected[], providerCalls[], totalLatencyMs, degraded, degradedReason } stored with the interaction.
- Show interpretation: when materially changed, reply opens "I understood this as: …" with a correction path.
- Cache: same tenant, identical input, short window; short common phrases cache aggressively.
- Hard timeout per provider call (default 2s, configurable); on failure pass original through, degraded:true + reason, log.

## PART 4 — Feature 1: Sarvam
Client lib/ai/language/sarvam/client.ts: key from env, per-call timeout, one retry on transient only, structured errors, never throws into caller. Capabilities in order: detection, transliteration (Roman→native and back), translation (to/from English), speech ASR/TTS (interfaces only; no UI now). Read Sarvam docs before implementing; record API version in DISCOVERY.md.
Config .env/.env.example: SARVAM_API_KEY, SARVAM_API_BASE_URL, SARVAM_ENABLED=true, SARVAM_TIMEOUT_MS=2000, SARVAM_DEFAULT_TARGET_LANGUAGE=en. Per-tenant switch in Organization.settings (additive) + global kill switch following settings.ai.disabled pattern. Unconfigured ⇒ English-only; product works with no key.
Languages: explicit list in lib/constants/statuses.ts. Code-mixed input ("invoice banao for Acme, amount 45000 rupees") tested explicitly.
Replies in user's language: never translate protected entities, amounts, dates, identifiers, or UI labels.

## PART 5 — Feature 2: Normalisation
Fixes: typos, spacing, WhatsApp paste damage (line breaks, invisible chars, smart quotes, emoji), grammar that confuses intent, number formats (45,000 / 45000 / 45k / forty five thousand / 1,00,000), date formats, domain misspellings (invoce, recipt, GSTN). Never touches protected entities (incl. quoted text). Runs in pipeline only. Deterministic first (whitespace, invisibles, quotes, numbers, dictionary); model pass only for what rules cannot fix. Low confidence / material meaning change ⇒ say what was understood + offer correction; for financial creates ⇒ ask.

## PART 6 — Feature 3: Interactive tasks
Explain ("How do I create an invoice?") / Do ("Create invoice for Acme, 45,000, due 30 days" → draft and take them there) / Ask ("Create an invoice" → one question at a time). Ambiguous explain-vs-do ⇒ ask which.
Slot filling: extend AiCommandProposal / aiIntent / aiActions and AI-NL memory; no parallel chat. Required fields read from the same source the real route validates against (not a hand-written list). One question at a time; states what/why; real choices (customer picker from actual customers); answers accepted in user's language via the pipeline; multi-answer ("Acme, 45000, next Friday"); back / change / skip optional / cancel; progress "3 of 5"; reference resolution reused from AI-NL ("same customer as last time", "next Friday"); TTL resume/expiry.
Confirm/execute/redirect: summary + confirmation (amounts/identifiers unchanged); execute via existing route/service the real UI uses; respect permissions/entitlements/validation/approvals; redirect to created record; on failure explain plainly and keep collected answers.
Scope: highest-value records the action layer supports; one flow perfect > five half-working. Record covered/uncovered in DISCOVERY.md.

## PART 7 — Metering & admin
provider dimension on AiUsageRecord (additive, default existing provider). Extend AiCostRate for Sarvam (server-side configurable, never hardcoded). Record every Sarvam call (type, characters, latency, outcome). Platform AI dashboard cost/requests split by provider. Tenant limits apply to combined spend. Org Configuration tab: multilingual enabled? languages used.

## PART 8 — Performance budgets (p95) → docs/sarvam/PERFORMANCE.md
English added latency <50ms · deterministic normalisation <100ms · regional cached <200ms · regional uncached full pipeline <1.5s before model call · each clarifying question turn <1s. Measure existing AI latency before/after; prove English path did not regress.

## PART 9 — Edge cases (test all; say why if N/A)
Language: pure Devanagari Hindi; Roman Hindi; English + 2 Hindi words; Tamil with English product names; three languages in one sentence; unsupported language; no language (numbers); one word; 2,000-char paste.
Damage: WhatsApp paste w/ line breaks+emoji; smart quotes; zero-width chars; ALL CAPS; no punctuation; "pleaseeee"; numbers as words; "45k"; 1,00,000; "agle mangalwar".
Protection: company name that is a common misspelling; invoice number that looks like a typo; mixed-case product code; quoted deliberate misspelling; GSTIN; person's name that is a Hindi word.
Conversation: change mind mid-task; answer with a question; three answers at once; answer fails validation; abandon & return; "cancel"; unrelated question mid-task; tenant with no customers.
Failure: Sarvam timeout; error; nonsense; key missing/invalid; tenant AI switch off; tenant at AI limit; Azure fails after successful translation.
Adversarial per flow: what input makes it create the WRONG record confidently (misread amount, name normalised into a different existing customer, date parsed to wrong year)? Test them.

## PART 10 — Voice: designed for, not built
Define ASR interface in client; no UI. Write docs/sarvam/VOICE_READINESS.md (UI, permissions, streaming, TTS playback remaining).

## PART 11 — Checklist
DISCOVERY: DISCOVERY.md; Sarvam docs read.
PIPELINE: lib/ai/language/ (detect, protect, normalise, translate, unprotect, respond); traceable result stored; English <50ms proven; cache/timeouts/fail-open.
FEATURE 1: typed client; detect/transliterate/translate; .env + .env.example + per-tenant + global kill switch; works with no key; reply in user language; code-mixed tested.
FEATURE 2: deterministic pass; entity protection exact restoration; model pass only when needed; never touches input field; "I understood this as…".
FEATURE 3: explain/do/ask + ask-which; required fields from real validation source; one question/progress/choices/multi-answer/back/skip/cancel; AI-NL reference resolution; summary+confirm; execute via existing route; redirect; failure keeps answers.
METERING: provider dimension; AiCostRate; dashboard split; combined limits; Configuration tab status.
QUALITY: performance measured; edge matrix; mocks only; suite green vs baseline; tsc; eslint; clean tree.
HANDOVER: VOICE_READINESS.md; QA test guide (phrases + expected English + expected outcome); final status table.

## PART 12 — Reporting
Report 1 after Discovery — STOP and report before building. Report 2 after pipeline + Feature 1 (with English-path latency). Report 3 after Features 2 and 3. Report 4 final (status table, perf, edge results, scoped-out, open items).
Ask before acting only if: change would modify an existing tenant route's behaviour; Sarvam API lacks something assumed; Feature 3's required-field discovery shows routes validate inconsistently.
Closing notes: English path must not regress. Worst outcome is a confidently wrong record, not a bad translation.
