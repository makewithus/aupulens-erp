# QA GUIDE — testing multilingual input without speaking the language

You do **not** need to read Hindi or Tamil. Copy the phrase, paste it into the AI sidebar, and compare what happens with the
"English meaning" and "expected outcome" columns. Where a reply comes back in the same language, the *shape* is what you check
(a numbered question, a summary with ₹ amounts, a form opening) — the numbers, names and ₹ amounts inside are never translated,
so you can verify them by eye. Phrases were AI-written and **need native-speaker confirmation** (Hindi/Tamil first).

Prereqs: Sarvam key in `.env` (see `../../sarvam_setup.md`); a `sales`/`admin` login; customers **Acme Trading**, **Acme Industries**, **Kamal**.
Faster, no UI: `npx tsx scripts/sarvam-live-check.ts` prints what the AI would receive for each phrase.

## A. Understanding (the AI receives clean English)
| # | Paste this | English meaning | Expected outcome |
|---|---|---|---|
| A1 | `Acme के लिए 45000 रुपये का इनवॉइस बनाओ` (Hindi) | Create an invoice for Acme for 45000 rupees | Starts the guided invoice flow; reply opens "I understood this as: create an invoice…"; amount **45000** and **Acme** unchanged |
| A2 | `Acme ke liye 45000 rupaye ka invoice banao` (Roman Hindi) | same | same |
| A3 | `Acme க்கு 45000 ரூபாய்க்கு இன்வாய்ஸ் உருவாக்கு` (Tamil) | same | same |
| A4 | `invoice banao for Acme, amount 45000 rupees` (code-mixed) | Create an invoice for Acme, amount 45000 rupees | Flow starts; **reply is in English** (mixed input keeps an English reply) |
| A5 | `create an invoce for Acme Trading, 45k` (English, typo + 45k) | Create an invoice for Acme Trading, 45000 | Works like English always did; "I understood this as" shows `invoice` and `45000` |
| A6 | `请给客户创建发票` (Chinese — unsupported) | (unsupported) | No error; assistant answers as it does today; no translation attempted |

## B. Things that must NOT be "fixed"
| # | Paste | Meaning | Expected |
|---|---|---|---|
| B1 | `Recipt Traders ke liye invoice banao, INV-0O42 ki copy bhejo` | Make an invoice for Recipt Traders; send the copy of INV-0O42 | "Recipt Traders" and "INV-0O42" appear exactly as typed everywhere — never "Receipt", never "INV-0042" |
| B2 | `item ka naam "Reciept Pad" rakho` | Name the item "Reciept Pad" | Quoted text verbatim |
| B3 | `Create an invoice for Invoce Traders, 500` | (a customer whose name looks like a typo) | If a customer with that exact name exists it is used as typed |
| B4 | `Create an invoice for Kamal, 500` | (a person's name that is also a Hindi word) | Customer **Kamal**; conversation stays English |

## C. Guided flow (all expected in English unless you type regional text)
| # | Type | Expected |
|---|---|---|
| C1 | `How do I create an invoice?` | Steps and the screen path; **nothing opens or is created** |
| C2 | `Can I create an invoice without a customer?` | Asks: explain, or create for you? (reply 1 or 2) |
| C3 | `Create an invoice` | "Question 1 of 4 · Customer" — **one** question |
| C4 | `Acme Trading, 45000, next Friday` | Fills 3 fields at once; asks only the item |
| C5 | `Acme Traders` (doesn't exist) | Numbered list of **real** customers (Acme Trading / Acme Industries) + "create new" — **never auto-picked** |
| C6 | `45.000` as the amount | "₹45,000 or ₹45?" |
| C7 | `back`, `skip`, `cancel` | Work anywhere; cancel says nothing was created |
| C8 | `yes` at the summary | The **real invoice form opens fully filled in**; you click Create |
| C9 | (abandon, wait 30+ min, type an answer) | "That draft has expired… nothing was created" |
| C10 | Log in as an HR-only user, `Create an invoice` | Clear refusal — not a blank screen |
| C11 | With Sarvam unreachable (wrong key), regional text | Assistant still answers (English fallback); a regional *answer* mid-flow is not used and you're told why |

## D. Regional flow, end to end
Type `mujhe invoice banana hai` → answer each question in Roman Hindi (`Acme Industries ke liye`, then the item, `12000`, `skip`), then `haan`.
Expected: same questions as English (in Hindi, Roman script), then the pre-filled invoice form with **Acme Industries**, your item and ₹12,000.

## E. Admin
Platform admin → dashboard: "AI usage by provider" (Azure + Sarvam + combined). Organisation → AI Usage: provider split + spend vs cap.
Configuration: multilingual status, languages used, enable/disable (asks a reason).
