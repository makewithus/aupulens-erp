# LIVE_VERIFICATION — confirming the mocks match reality

> **If any step fails, the system degrades rather than misleads — nothing here can produce a wrong record, only a worse translation.**
> Run **§1 (the placeholder-format check) first**: everything else depends on it. A failure there looks like `degraded: bad_response` on any phrase containing a name, and the fix lives in one place (`placeholder` / `chooseStyle` in `lib/ai/language/protect.ts`) — live-checked 2026-09-20, see below.

# LIVE RESULTS — real Sarvam API + real Azure model (2026-09-20)

> Run with `scripts/sarvam-live-verify.ts` and `scripts/sarvam-live-classify.ts` (never in CI; not under `tests/`; every printed/written line is scrubbed of the key,
> which is read from `.env` only). Raw outputs (scrubbed) are in `docs/sarvam/live-results/`. **Credits spent:** ≈ 650–700 Sarvam calls / ≈ 40k input characters
> (many of them deliberate A/B comparisons of placeholder formats) and ≈ 200 Azure classification calls. **Rule applied throughout: where live disagreed with a mock or an
> expectation, the mock/code changed — no expected result was edited to match.**

**Headline.** The pipeline design holds: nothing the live API did could produce a wrong record — every misbehaviour was caught by the verification layer and degraded to the original
text. But the live API is materially *less* well-behaved than the first mock, and three real defects were found and fixed (below). The one item outside Sarvam (the Azure classification
prompt) is now 22/22 stable.

| # | Step | Expected | Observed (live) | Action taken |
|---|---|---|---|---|
| 0 | Reachability | key accepted | `POST /translate` 200 in 844 ms | — |
| 1 | **Placeholder format** | `ZXQnZXQ` returns intact, un-moved, un-reindexed in every language | **Native script & replies: yes** — English→regional 11/11 intact; regional→English 8/11 (the 3 misses were a *dropped* bare trailing token, never a mangled one). **Roman-script / code-mixed: NO** — the real translator garbled it 4 times in 10 (`JXQ0ZXQ`, `zxq0 zxq zxq zxq…`, entity dropped). A/B over formats (22 round trips each): `ZXQnZXQ` 3 fail · name-like `Qavrix Holdings` 3 fail *and it rewrote the names* (Quavrix/Zolman) · `[[E0]]` 5 · `Entity0X` 7 · `Ent0` 6 (partly my number check counting its digit). On 10 Roman/code-mixed sentences: `ZXQ` 6/10 · `Ent0` **9/10** · `@@0@@` 5/10 · `Entity0X` 4/10 (errors) | **Design kept; constant made script-dependent:** `ZXQnZXQ` for native script, **`Ent<n>` for Latin-script input** (`chooseStyle`; falls back to ZXQ if the user's own text contains `Ent3`). Every alteration/drop/duplicate/stray fragment still degrades (tests for both styles). Live pipeline degrade rate on Roman/code-mixed/protected input fell from 5 of 18 to 2 of 18 |
| 2 | Round-trip EN→lang→EN, 11 languages | meaning, entities and amount survive | **Numbers 22/22 preserved.** Entities intact 19/22 (drops, never mangling). Per-language caveats below | Caveats recorded; no code change (verification already catches drops) |
| 3 | The documented phrases | each → "Create an invoice for Acme for 45000 rupees" | 19/20 resolve to that meaning (word order varies: "…for 45000 rupees for Acme"; `pa`/`or` drop the word "rupees" but keep 45000; `bn` says "taka"). **`mr` FAILS:** `बीजक` → *"Prepare a seed for Acme"* (बीजक also means "seed"). Unsupported (Chinese) → passed through | **`mr` marked "needs a native speaker" — expectation NOT changed**; an alternative phrase (`mr-alt`, `इनव्हॉइस`) was added as a *separate* row and resolves ("Prepare an invoice…"). All 11 languages detected correctly |
| 4 | Code-mixed / WhatsApp-damaged | resolves | **The canonical sentence `invoice banao for Acme Trading, amount 45000 rupees` FAILED live** (`degraded: bad_response`): the translator returned `invoice zxc zxc zxc …` and, unmasked, silently *dropped the customer* ("Make an invoice for the amount of Rs. 45000") | **Fixed:** a deterministic local map handles code-mixed text that is really English + a few Hindi particles (0 ms, no provider); degenerate output detection; one retry in a different mode on a failed verification (not on timeouts). WhatsApp paste, emoji, zero-width chars, `45,000`, `1,00,000`, typos all resolve; 5 of 6 messy inputs never reach the provider or resolve. `wa-3` (`“invoice” banao Kamal ke liye ,, paanch hazaar`) still degrades (safe) |
| 5 | Protected entities | nothing "corrected" | **Two real defects found:** (a) `Recipt Traders ke liye…` at the START of a message was "corrected" to `Receipt`; (b) `PAN AAPFU0939F` was split into `PAN AAPFU` + `F`; (c) `PLEASEEEE` was masked as if it were a name and reached the translator; (d) the translator emits markup like `<Noise/>` | All four fixed + tested. Live after fix: `Recipt Traders`, `Invoce Traders`, `INV-0O42`, `27AAPFU0939F1ZV` (when not degraded), `"Reciept Pad"`, `aB12-xY9`, the e-mail, `Kamal`, `Kanchipuram Silks Pvt Ltd` — **all verbatim**; `pr-gstin` degraded on the last run (API non-determinism) — safe |
| 6 | Failure paths, for real | degrade, never an error | Invalid key → HTTP 403 → `degraded: provider_error`, original text ✔ · bad language code / empty input / malformed JSON → HTTP 400 → structured failure, no throw ✔ · oversized (1,560 chars) to mayura → 400 (limit 1,000 confirmed; our client refuses locally) ✔ · **5,490-char paste through the pipeline → 3 chunks, all 90 amounts preserved, not degraded** ✔ · forced 1 ms timeout → `degraded: timeout` in 4 ms ✔ | none needed |
| 7 | **Uncached regional latency** | p95 < 1.5 s before the model call | **p50 722 ms · p95 1,023 ms · max 6,355 ms** (55 uncached calls, 5 per language; per-language p50 703–823 ms — no language differs materially). Reply translation p50 719 ms (max 1.4 s) | Budget **met at p95**. Two declared caveats in `PERFORMANCE.md`: a ~2 % tail beyond the 2 s timeout degrades safely; and an *uncached regional guided turn* = input (~0.7 s) + reply (~0.7 s) ≈ **1.4 s, above the 1 s clarifying-turn budget** (cached/locally-mapped turns are ≈ 0) |
| 8 | **Classification prompt vs the real Azure model** (Azure, not Sarvam) | correct and stable | First pass **17/22**: `bill Acme 45k pls` and `invoice for Acme Trading 45k` flipped between runs; `Acme Trading invoice 45000` misread as a lookup; "steps to make a bill" → other. Also found: the rule layer's `due` query-word wrongly ruled out `Get an invoice of 100000 for Acme due next Tuesday`, and `bill Kamal 2500 for repairs` never reached the LLM. Injection attempts are blocked by Azure's content filter (400) | **Prompt tightened with examples + a "bill = sales invoice unless vendor/purchase/from" rule; rule layer fixed. Re-run: 22/22 correct on all 3 runs, 0 unstable** (66 calls); injection cases → never "create" (filter block ⇒ the route fails open) |

## Per-language caveats from the round trip (Step 2)
| Language | Observed | Caveat |
|---|---|---|
| Hindi (native) | forward fine; back-translation of "Send X a reminder" reversed who sends; one entity dropped on the back-trip | reminder-style sentences: confirm direction |
| Hindi (Roman) | fine; one back-trip read "paid by X" for "for X" | semantic drift possible on prepositions |
| Tamil | entities intact; one back-trip came out in **Roman Hindi** | back-translation language can drift |
| Telugu | **one forward translation dropped the customer entirely** | most likely to lose an entity → degrade |
| Marathi | fine; **`बीजक` = "seed"** | use `इनव्हॉइस` |
| Bengali | fine forward; one back-trip garbled ("Create a reminder to send X to 12500…"); currency rendered **"taka"** | currency word ambiguity |
| Gujarati | fine; back-trip leaks Hindi-script "रुपये" | cosmetic |
| Kannada | fine; **"30 days" came back as "30th"** | due-date wording can drift — the summary always shows the resolved absolute date |
| Malayalam | one entity dropped on the back-trip | degrade path |
| Punjabi, Odia | fine (`45000` kept, "rupees" sometimes dropped) | none |
None of these can create a wrong record: names/ids are verbatim or the whole result degrades; amounts are value-verified; every field is shown in the confirmation summary before anything opens.

## Mock corrections made because live disagreed
`tests/ai/language/helpers.ts` / test translators now model: entity **drops**, **degenerate** repetition output, the **currency word dropped**, `<Noise/>` markup, and script-dependent placeholder style; new tests: `pipeline.test.ts` ("live findings"), `placeholderSafety.test.ts` (Ent style, 7 corruptions), `protection.test.ts` ("live findings: protection at the START…", "entity boundaries"), `phrasing.test.ts` (weak-noun + digits), `sarvamMetering.test.ts` (fresh cap). Suite re-run: green.

---

CI mocks Sarvam. These steps are how we confirm the mocks (`tests/ai/language/helpers.ts`, `tests/ai/taskFlow/harness.ts`) behave like the real API.

## 0. READ FIRST — the phrases were written by an AI, not a native speaker

**Every non-English phrase in this file is marked `needs native-speaker confirmation`.** They were written by the
assistant that built the system; treat them as *test inputs whose quality is unproven*, so the live check tests the
system, not the phrase.

**Check these two languages first, with a native speaker if you can:** **Hindi** (Devanagari + Roman) and **Tamil**.
They are the most likely to carry real traffic and the phrases below are the ones most worth having a person read.
Then Telugu, Marathi, Bengali; the rest last.

**What a wrong phrase looks like** (so you don't chase a system bug that isn't one):
* The model-got line is *grammatically odd but still says "create an invoice for Acme for 45000 rupees"* → the **phrase** is
  stilted; the system is fine. Swap in a natural phrase and re-run.
* The language is detected as a **different** Indian language (e.g. Marathi phrase detected `hi-IN`) → likely the phrase is
  written in Hindi vocabulary. Devanagari is genuinely shared between Hindi and Marathi (and Konkani/Nepali); an ambiguous
  Devanagari phrase is *sent with `source_language_code: "auto"`* on purpose, so a `hi-IN` vs `mr-IN` label alone is not a failure.
* **`Acme` or `45000` changed or missing** → NOT a phrase problem. That is a system failure — report it.
* `degraded: bad_response` on a phrase that contains a name → see §1 (placeholder check) before anything else.

A phrase "passes" if the English the model receives still says the same thing, whatever the wording.

## 1. DO THIS FIRST — the placeholder-format check (the one guess the mocks depend on)

The layer masks names/ids/quoted text as `ZXQ<n>ZXQ` before sending them to Sarvam and restores them afterwards. **That
format is a guess about what Sarvam leaves alone.** If it is wrong, the safeguards make the layer *degrade* (original text
goes to the AI, `degraded: bad_response`) — never leak `ZXQ…` or swap a name — but it would degrade on almost every message
containing a name, so check it before anything else:

```
npx tsx scripts/sarvam-live-check.ts hi-native     # contains the name "Acme"
npx tsx scripts/sarvam-live-check.ts protected-typo-lookalike
```
Pass: `degraded: no`, `protected:` lists the name, and `model got:` shows the name **exactly as typed**.
Fail (`degraded: bad_response` with a name present): the placeholder is being altered. Fix = change the one constant
`PH_PREFIX` in `lib/ai/language/protect.ts` (try a bracketed form like `[[E0]]` or a word-like token), re-run. No other code changes.

## 2. The 11 languages — expected: model receives ≈ "Create an invoice for Acme for 45000 rupees"
Pass criteria for each: `Acme` and `45000` present and exact; no invented customer; `degraded: no`; one `translate` call.

| id | Typed — *needs native-speaker confirmation* | Language |
|---|---|---|
| hi-native | Acme के लिए 45000 रुपये का इनवॉइस बनाओ | Hindi |
| hi-roman | Acme ke liye 45000 rupaye ka invoice banao | Hindi (Roman) |
| ta | Acme க்கு 45000 ரூபாய்க்கு இன்வாய்ஸ் உருவாக்கு | Tamil |
| te | Acme కోసం 45000 రూపాయలకు ఇన్వాయిస్ సృష్టించండి | Telugu |
| mr | Acme साठी 45000 रुपयांचे बीजक तयार करा | Marathi |
| bn | Acme এর জন্য 45000 টাকার ইনভয়েস তৈরি করুন | Bengali |
| gu | Acme માટે 45000 રૂપિયાનું ઇન્વોઇસ બનાવો | Gujarati |
| kn | Acme ಗಾಗಿ 45000 ರೂಪಾಯಿಗಳ ಇನ್ವಾಯ್ಸ್ ರಚಿಸಿ | Kannada |
| ml | Acme നായി 45000 രൂപയുടെ ഇൻവോയ്സ് സൃഷ്ടിക്കുക | Malayalam |
| pa | Acme ਲਈ 45000 ਰੁਪਏ ਦਾ ਇਨਵੌਇਸ ਬਣਾਓ | Punjabi |
| or | Acme ପାଇଁ 45000 ଟଙ୍କାର ଇନଭଏସ୍ ତିଆରି କର | Odia |

*Every phrase in this table and in §3 is AI-written — needs native-speaker confirmation (Hindi and Tamil first, see §0).*

## 3. Cases that matter most
| id | Typed (*needs native-speaker confirmation*) | Must happen |
|---|---|---|
| **code-mixed** | `invoice banao for Acme, amount 45000 rupees` | Detected non-English (`mixed`), `mayura:v1` + `code-mixed` mode; model gets ≈ "Create an invoice for Acme, amount 45000 rupees". Reply in **English** (mixed input keeps an English reply) |
| **protected entity that looks like a typo** | `Recipt Traders ke liye invoice banao, INV-0O42 ki copy bhejo` | `Recipt Traders` and `INV-0O42` appear **verbatim** in "model got" (not "Receipt", not "INV-0042"); both listed under `protected:` |
| **deliberate typo, quoted** | `item ka naam "Reciept Pad" rakho` | `"Reciept Pad"` verbatim incl. quotes |
| **deliberate typo, Title Case** | `naya product banao Invoce Pad 250 rupaye` | `Invoce Pad` kept (capitalised mid-sentence = treated as a name) |
| **typo the user did NOT mean to keep** | `create an invoce pad for 250` | Rewritten to `invoice`; in the assistant UI the reply opens *"I understood this as: …"* with the "no, I meant …" hint |
| **number formats / date** | `1,00,000 ka invoice banao Acme ke liye, due agle mangalwar` | `100000` (exact), "next Tuesday" resolved by the translator — **check the weekday is right** |
| **English words → number** | `invoice for Acme forty five thousand rupees` | `45000`; **no** Sarvam call (English short-circuit) |
| **unsupported language** | `请给客户创建发票` | `degraded: unsupported_language`, original text passed through, assistant still answers |

## 4. Things the mocks ASSUME about the real API — verify each
1. **[mock assumes] Placeholders survive.** The layer masks names/ids as `ZXQ<n>ZXQ` before sending. Confirm the real translator returns them unchanged and once. If any run shows `degraded: bad_response` on a phrase that has a name, the token format needs changing (one constant in `lib/ai/language/protect.ts`). Try both Latin- and native-script phrases.
2. **[mock assumes] Numbers are left as ASCII digits** (`numerals_format: international`). Confirm `45000` stays `45000` (or `45,000`, which is accepted).
3. **[mock assumes] `source_language_code: "auto"`** works on `/translate` and returns `source_language_code`. Ambiguous Devanagari (Hindi vs Marathi) relies on it.
4. **[mock assumes] Roman-script Hindi works with a single `code-mixed` call.** Compare with `SARVAM_ROMAN_STRATEGY=transliterate_first` (2 calls) on the hi-roman + code-mixed phrases; keep whichever resolves better. Record the winner in `PERFORMANCE.md`.
5. **[mock assumes] Limits:** mayura ≤1000 chars, sarvam-translate ≤2000 (send a 1,500-char paste in Hindi: expect one `sarvam-translate:v1` call; a 4,000-char paste: several parallel calls, all `ok`).
6. **[mock assumes] `output_script: "roman"`** accepted for replies to Roman-script users.
7. Latency: note `total` ms per phrase. Budget: regional uncached < 1.5 s before the model call; cached repeat < 200 ms (run the same phrase twice **within one process** — the script only does one pass, so use the app for this).

## 5. In the app (logged in as a tenant admin)
1. Open the AI assistant sidebar. Type the Roman-Hindi phrase `mera balance kya hai`. Expect a Hindi (Roman-script) reply, opening with an *"I understood this as: …"* line.
2. Type the same in English. Expect **no** interpretation line and no delay difference.
3. Global Admin → AI usage: expect requests recorded with provider `sarvam` (character counts, latency); Azure rows unchanged.
4. Set `settings.ai.multilingualDisabled=true` for the tenant → repeat (1): reply in English/unchanged, no Sarvam rows.
5. Blank `SARVAM_API_KEY`, restart → repeat (1): assistant still answers, no error.
6. Set `SARVAM_TIMEOUT_MS=1` → repeat (1): still answers (degraded), takes ≈ normal time.
7. Put a wrong key → still answers; check server logs contain **no** key.


## 6. Feature 3 — the guided create flow, live (sales invoice)
Setup: a tenant with at least three customers, including two with similar names (e.g. **Acme Trading**, **Acme Industries**) and one whose name is a Hindi word (**Kamal**). Log in as a `sales` or `admin` user. Use the AI sidebar.

| Step | You type | Expect |
|---|---|---|
| Explain | `How do I create an invoice?` | Steps + "Sales → Invoices → New Invoice". **No form opens, nothing is created** |
| Ask which | `Can I create an invoice without a customer?` | "explain, or create for you?" with two options — replies `1` / `2` work |
| **Regional create (the key case)** | Tamil `இன்வாய்ஸ் போடுங்க` *(needs native-speaker confirmation)* — or Roman `invoice podunga`, or Roman Hindi `mujhe invoice banana hai` | Reply starts with "I understood this as: create an invoice", then **Question 1 of 4 — who is this invoice for?** in the same language. Same flow an English user gets |
| Answer in your language | `Acme Industries ke liye` (or the Tamil equivalent) | Customer set to **Acme Industries** (real customer, exact); asks the next question |
| Multi-answer | `Acme Trading, 45000, next Friday` | Fills customer + amount + due date at once; asks only what's left (item) |
| Near-miss name | `Acme Traders` | **A numbered list of real customers** (Acme Trading, Acme Industries) + "Create a new customer". It must NOT pick one silently |
| Ambiguous amount | `45.000` | Asks: ₹45,000 or ₹45? |
| Back / skip / cancel | `back`, `skip`, `cancel` | Each works at any point; cancel says nothing was created |
| Summary | (finish the questions) | Every field listed, amount as ₹ with grouping, due date with weekday; "yes" to open the form |
| Open form | `yes` | The **real** New Invoice form opens **fully pre-filled**; you click Create. Check customer, line, amount, due date are right |
| Original text | look at your own messages | Your message stays exactly as typed; the "I understood this as" line is separate |

**The execute path (ships OFF).** To test it: set `settings.ai.autoCreateEnabled = true` for a test tenant (Mongo: `db.organizations.updateOne({subdomain:"<t>"},{$set:{"settings.ai.autoCreateEnabled":true}})`). Finish a flow and reply `yes`: it creates a **DRAFT** invoice **through the real `/api/sales/invoices` route** (nothing posts to the ledger until you issue it) and redirects to `/sales/invoices/<id>`. Reply `open form` instead to review first. With the flag off/absent, `yes` only opens the form. Set it back to off afterwards.

## 7. Streaming — decision
The main chat surfaces (AI sidebar → admin assistant, and the Sales assistant) **stream** replies. `callClaudeForTenantStream` now accepts the same `language` option: the user's text is translated **before** the stream starts and the "I understood this as…" line is streamed first. **The reply itself streams in English** (a reply cannot be translated mid-stream); non-streaming assistant routes still translate the reply. To verify: in the sidebar, type a Roman-Hindi question (e.g. `mera balance kya hai`): expect the interpretation line, then an English answer that reflects what you asked. Making streamed replies regional is a follow-up (buffer per paragraph, or translate after the stream completes) — declared, not hidden.

## 8. Metering & admin (live)
After a few regional requests: Platform admin → dashboard shows **AI usage by provider** with a Sarvam row (requests, characters, cost once you have run `scripts/seed-platform-sarvam-cost-rates.ts`); the organisation → **AI Usage** tab shows the same split and *combined spend vs cap*; **Configuration** tab shows multilingual status, the languages actually used, and the enable/disable button (asks for a reason, audited). Set a small `maxCostUsdPerMonth` on a test tenant and confirm regional requests degrade to English-only (`degraded: limit_reached`) once combined spend passes it, while English requests are unaffected.

## 9. Report back
For each row: pass / fail + the `model got` line. Any fail in §3 items 1–3 is a mock-vs-reality mismatch — send the output and I'll fix the layer, not the test.

## 10. Also now covered (Phase 3)
* The escape hatch, skip-ahead and item-name choices are language-independent; verify one regional flow ends on a pre-filled form (§6).
* **Uncached regional latency** — the one number that could not be measured here: run each §2 phrase once cold and note `total` from the live-check script; budget < 1.5 s before the model call.
* **LLM fallback prompt** (`app/api/ai/task-flow/route.ts::classify`): send `can you raise a bill for Acme` and `raise a purchase bill from Acme` — the first should start the invoice flow, the second must NOT.
