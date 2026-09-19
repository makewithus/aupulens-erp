# LIVE_VERIFICATION — confirming the mocks match reality

CI mocks Sarvam. These steps are how we confirm the mocks (`tests/ai/language/helpers.ts`, `pipeline.test.ts`) behave like the real API. Every assumption below that a mock encodes is marked **[mock assumes]**.

## 0. Prerequisites
1. Follow `sarvam_setup.md` (key in `.env`, restart).
2. `npx tsx scripts/sarvam-live-check.ts` — prints, per phrase, what the model would receive. Run one phrase with `npx tsx scripts/sarvam-live-check.ts hi-roman`.

## 1. The 11 languages — expected: model receives ≈ "Create an invoice for Acme for 45000 rupees"
Pass criteria for each: `Acme` and `45000` present and exact; no invented customer; `degraded: no`; one `translate` call.

| id | Typed | Language |
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

(The phrases were written by an AI, not a native speaker — if one reads unnaturally, note it and swap it; a translation that still resolves is a pass.)

## 2. Cases that matter most
| id | Typed | Must happen |
|---|---|---|
| **code-mixed** | `invoice banao for Acme, amount 45000 rupees` | Detected non-English (`mixed`), `mayura:v1` + `code-mixed` mode; model gets ≈ "Create an invoice for Acme, amount 45000 rupees". Reply in **English** (mixed input keeps an English reply) |
| **protected entity that looks like a typo** | `Recipt Traders ke liye invoice banao, INV-0O42 ki copy bhejo` | `Recipt Traders` and `INV-0O42` appear **verbatim** in "model got" (not "Receipt", not "INV-0042"); both listed under `protected:` |
| **deliberate typo, quoted** | `item ka naam "Reciept Pad" rakho` | `"Reciept Pad"` verbatim incl. quotes |
| **deliberate typo, Title Case** | `naya product banao Invoce Pad 250 rupaye` | `Invoce Pad` kept (capitalised mid-sentence = treated as a name) |
| **typo the user did NOT mean to keep** | `create an invoce pad for 250` | Rewritten to `invoice`; in the assistant UI the reply opens *"I understood this as: …"* with the "no, I meant …" hint |
| **number formats / date** | `1,00,000 ka invoice banao Acme ke liye, due agle mangalwar` | `100000` (exact), "next Tuesday" resolved by the translator — **check the weekday is right** |
| **English words → number** | `invoice for Acme forty five thousand rupees` | `45000`; **no** Sarvam call (English short-circuit) |
| **unsupported language** | `请给客户创建发票` | `degraded: unsupported_language`, original text passed through, assistant still answers |

## 3. Things the mocks ASSUME about the real API — verify each
1. **[mock assumes] Placeholders survive.** The layer masks names/ids as `ZXQ<n>ZXQ` before sending. Confirm the real translator returns them unchanged and once. If any run shows `degraded: bad_response` on a phrase that has a name, the token format needs changing (one constant in `lib/ai/language/protect.ts`). Try both Latin- and native-script phrases.
2. **[mock assumes] Numbers are left as ASCII digits** (`numerals_format: international`). Confirm `45000` stays `45000` (or `45,000`, which is accepted).
3. **[mock assumes] `source_language_code: "auto"`** works on `/translate` and returns `source_language_code`. Ambiguous Devanagari (Hindi vs Marathi) relies on it.
4. **[mock assumes] Roman-script Hindi works with a single `code-mixed` call.** Compare with `SARVAM_ROMAN_STRATEGY=transliterate_first` (2 calls) on the hi-roman + code-mixed phrases; keep whichever resolves better. Record the winner in `PERFORMANCE.md`.
5. **[mock assumes] Limits:** mayura ≤1000 chars, sarvam-translate ≤2000 (send a 1,500-char paste in Hindi: expect one `sarvam-translate:v1` call; a 4,000-char paste: several parallel calls, all `ok`).
6. **[mock assumes] `output_script: "roman"`** accepted for replies to Roman-script users.
7. Latency: note `total` ms per phrase. Budget: regional uncached < 1.5 s before the model call; cached repeat < 200 ms (run the same phrase twice **within one process** — the script only does one pass, so use the app for this).

## 4. In the app (logged in as a tenant admin)
1. Open the AI assistant sidebar. Type the Roman-Hindi phrase `mera balance kya hai`. Expect a Hindi (Roman-script) reply, opening with an *"I understood this as: …"* line.
2. Type the same in English. Expect **no** interpretation line and no delay difference.
3. Global Admin → AI usage: expect requests recorded with provider `sarvam` (character counts, latency); Azure rows unchanged.
4. Set `settings.ai.multilingualDisabled=true` for the tenant → repeat (1): reply in English/unchanged, no Sarvam rows.
5. Blank `SARVAM_API_KEY`, restart → repeat (1): assistant still answers, no error.
6. Set `SARVAM_TIMEOUT_MS=1` → repeat (1): still answers (degraded), takes ≈ normal time.
7. Put a wrong key → still answers; check server logs contain **no** key.

> Known gap (by design, until Feature 3): the "create …" shortcut (`tryAiCreateFlow`) triggers on English words, so a regional-language *create* request currently reaches the assistant's Q&A path rather than opening a pre-filled form. Slot-filling for that is the next report.

## 5. Report back
For each row: pass / fail + the `model got` line. Any fail in §3 items 1–3 is a mock-vs-reality mismatch — send the output and I'll fix the layer, not the test.
