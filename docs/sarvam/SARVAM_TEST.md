# SARVAM_TEST — a 30–45 minute confidence pass, for you

**Who this is for:** you. You know the product; you won't open a terminal after the setup block. **Every step below was run by the assistant first**, in a real
browser against the **production build** with the **real Sarvam key** (2026-09-20). What you are told to expect is what was observed — not assumed. If something differs
on your machine, that is the finding: stop and tell me exactly what you typed and saw.

You can stop after any group and still have learned something. **A–B (English)** take ~10 min and prove nothing you rely on has changed. **C–E** is the new multilingual
behaviour. **F–G** are the admin screens and the failure case; **H** is the "asked something else mid-draft" case.

---
## 1. Setup (one block, copy-paste)
```bash
cd Aupulens-ERP-main
# .env must already hold: SARVAM_API_KEY=<your key>  SARVAM_API_BASE_URL=https://api.sarvam.ai  SARVAM_ENABLED=true  (+ your Azure keys)
export MONGODB_URI=mongodb://localhost:27017/aupulens_browser_qa     # a throw-away LOCAL database — the fixture refuses any other
npx tsx scripts/seed-platform-demo.ts                                # demo organisations
npx tsx scripts/qa-browser-seed.ts ./qa-out                          # users, customers, invoice history, Sarvam rows, empty tenant
NEXT_PUBLIC_APP_ROOT_DOMAIN=localhost npm run dev                    # first page loads take 10–30 s in dev mode; that is normal
```
* **Log in** at `http://demo-acme.localhost:3000/auth` as **owner@demo-acme.demo** (admin) — password **DemoOwnerPassword123!**. Also: `sales@demo-acme.demo`, `hr@demo-acme.demo`.
  The workspace with **no customers** is `http://qa-empty.localhost:3000/auth` → `sales@qa-empty.demo`.
* **The AI panel:** click the **✦** ("Aupulens Copilot") button in the top bar. Ignore the dashboard behind it.
* **Global Admin** (groups F): open `http://localhost:3000/platform`, then paste in the browser console once:
  `document.cookie="aupulens_admin_session=<contents of qa-out/admin_cookie.txt>; path=/"` and reload (valid 8 h; re-run the seed to refresh).
* **Reset** anytime: `mongosh aupulens_browser_qa --eval 'db.dropDatabase()'` then re-run the two `npx tsx` lines.
* The fixture's Sarvam **price is a placeholder ($0.002 per 1,000 characters)**. For your real price: `SARVAM_COST_PER_1K_CHARS_USD=<price> npx tsx scripts/seed-platform-sarvam-cost-rates.ts` (never leave it blank).

## 2. What has been built (half a page)
1. **Multilingual understanding.** Whatever a user types — Hindi, Tamil and 9 other Indian languages, in native or Roman script, mixed with English, with typos or pasted
   from WhatsApp — reaches the AI as clean English. Sarvam does the language work; Azure OpenAI is still the brain. English never touches Sarvam and is not slower.
2. **Input normalisation.** Typos, stray spaces, emoji, zero-width characters, `45k`, `1,00,000` are fixed on a *copy* on the way to the AI. What you typed is never rewritten in the box,
   and names, invoice numbers, GSTINs, PANs, e-mails and anything in quotes are passed through untouched. When the meaning was changed the reply starts with
   *"I understood this as: …"* and you can say *"no, I meant …"*.
3. **Guided invoice creation.** "Create an invoice" gets you one question at a time (customer picker from your real customers, item choices from your own past invoices), a summary,
   and then the real New Invoice form **filled in — you still click Create**. Everything supplied ⇒ summary only. "Skip the questions and open the form" gives today's partly-filled form.
   (An opt-in per-workspace setting can create a **Draft** for you instead; it ships **off**.) Only the **sales invoice** has this flow.

## 3. Confirmed against the REAL Sarvam API vs. not
**Confirmed live (2026-09-20):** all 11 languages detect and translate; placeholders/entities survive (with the fixes in `LIVE_VERIFICATION.md`); protected text stays verbatim; amounts are value-verified;
invalid key / bad request / oversized / timeout all degrade to the original text; uncached regional latency p95 ≈ 1.0 s (budget 1.5 s); the Azure classification prompt is 22/22 stable.
**Not confirmed:** the *quality* of every phrase by a native speaker (Marathi's `बीजक` is mistranslated as "seed"; the Tamil colloquial `இன்வாய்ஸ் போடுங்க` is read as "Send the invoice" and is
therefore — correctly — **not** treated as a create request); Hindi *replies* are understandable but not polished ("Who ka invoice yah hai?"); the Sarvam **price**.

---
## 4. The tests
Use the AI panel logged in as **owner@demo-acme.demo** unless a step says otherwise. **Answers can be clicked:** every question shows its choices (customers, your past items) and *Back / Skip / Skip the questions — open the form / Cancel* as buttons inside the chat — you can still type instead. Only the newest question has buttons. The typed forms below are what a click sends. Today's date in the examples is 20 Sep 2026, so "30 days" = Tue 20 Oct 2026 — your date will differ; check the *weekday and date agree with 30 days from today*.

### Group A — English, nothing changed
| # | Type | Should happen | Look for / what would be wrong |
|---|---|---|---|
| A1 | `what is my cash balance` | An ordinary answer in ~2–3 s, exactly as before | **No** "I understood this as" line. Wrong: any extra delay, an error, a guided-flow question |
| A2 | `show unpaid invoices` | The Invoices page opens filtered to *unpaid*; the panel says "No — I couldn't find any invoices." (the demo's invoices are drafts) | Wrong: an invoice-creation question |
| A3 | `how many customers do I have` | A list of the four customers with receivables and dates, in ~2 s | Wrong: guided questions |

### Group B — English guided creation
| # | Type | Should happen | Wrong if |
|---|---|---|---|
| B1 | `Create an invoice for Acme Trading, 45000, due 30 days, consulting services` | **A summary and no questions**: Customer **Acme Trading**, Item **consulting services**, Amount **₹45,000**, Quantity **1 (default)**, Due date (weekday + date), Subtotal ₹45,000. Type `yes` → the New Invoice form opens with customer, item, price and due date filled; **nothing is saved until you click Save/Create** | a question was asked; a field is missing/different; the invoice was saved |
| B2 | `Create an invoice` → `Kamal` → `1` → `5000` → `skip` | **Question 1 of 4 · Customer** (one question only) → **Question 2 of 4 · Item / service** with **numbered choices from your own past invoices** (Consulting services / Repairs / Website design) → **Question 3 of 4 · Amount** → **Question 4 of 4 · Due date** → summary with Customer Kamal, Item = choice 1, ₹5,000, "not set (defaults to today)" | more than one question at once; an item you never gave |
| B3 | `Create an invoice for Kamal` → `Skip the questions and open the form` | The New Invoice form opens with **Kamal selected** and no item — today's old behaviour | a wrong customer |
| B4 | `Create an invoice for Kamal, 500` → `Repairs` → `back` → `cancel` | `back` returns to the item question; `cancel` says **"Nothing was created."** | anything created |
| B5 | `Create an invoice for Kamal, 500`, **reload the page**, reopen the panel, type `continue` | The same item question comes back (drafts last 30 min; after that: "That draft has expired… nothing was created") | the draft is lost within 30 min |

### Group C — Regional languages (you don't need to read them)
| # | Type / paste | English meaning | Should happen |
|---|---|---|---|
| C1 | `mujhe invoice banana hai` (Roman Hindi) | I want to make an invoice | The reply starts **> I understood this as: "I need to create invoice"** then **Question 1 of 4 · Customer** — the question text is in Roman Hindi |
| C2 | then `Acme Industries ke liye` | for Acme Industries | "I understood this as: for Acme Industries" → **Question 2 of 4 · Item** in English, with your item choices. (**Acme Industries** is now the customer — verify at the summary) |
| C3 | `Acme க்கு இன்வாய்ஸ் உருவாக்கு` (Tamil) | Create an invoice for Acme | "I understood this as: Create an invoice for Acme" and a **customer choice list: Acme Trading / Acme Industries / Create a new customer "Acme" / Someone else** — it does **not** pick one silently |
| C4 | `Acme के लिए 45000 रुपये का इनवॉइस बनाओ` (Hindi) | Create an invoice for Acme for 45000 rupees | "I understood this as: Create an invoice for 45000 rupees for Acme" (order may vary) → the same Acme choice list. **45000 and Acme unchanged** |
| C5 | `invoice banao for Acme Trading, amount 45000 rupees` (code-mixed) | Create an invoice for Acme Trading, amount 45000 rupees | "I understood this as: create invoice for Acme Trading, amount 45000 rupees" → **Question 3 of 4 · Item** (customer and amount already taken). **Item must not be "amount"** |
Finish C2 with `1`, `12000`, `skip`, then `haan` (Hindi "yes") → the form opens with **Acme Industries** and **12000**. Type `cancel` after each of the others.
**Wrong:** a changed name or amount; a silent customer pick; the reply in a script you can't map back; an error.

### Group D — Messy input
| # | Paste / type | Should happen |
|---|---|---|
| D1 | a WhatsApp-style paste (use Shift+Enter for line breaks): `hi please create  invoice` ⏎ ⏎ `for   Acme Trading 😊😊` ⏎ `45,000 rs   due 30 days` ⏎ ⏎ `thx 🙏` | **Question 4 of 4 · Item / service** — customer (Acme Trading), amount (45,000 → ₹45,000) and due date were all taken; the greeting, emoji and "thx" ignored |
| D2 | `create an invoce for Kamal, 45k` | **> I understood this as: "create an invoice for Kamal, 45000"** (typo fixed, 45k → 45000) then the item question |
| D3 | `PLEASEEEE CREATE AN INVOICE FOR KAMAL 500` | Works; the customer is Kamal; "PLEASEEEE" is not treated as a name |
| D4 | `Create an invoice for Kamal, 700` → `item "Reciept Pad"` → `skip` | Summary shows **Item / service: Reciept Pad — exactly your misspelling**. Then `cancel` |
Your own message always stays on screen exactly as typed. **Wrong:** "Receipt Pad"; the amount changed; a question about the greeting.

### Group E — Protection (nothing "corrected")
| # | Type | Should happen |
|---|---|---|
| E1 | `Create an invoice for Recipt Traders, 500` | A choice list containing **Create a new customer "Recipt Traders"** — spelled exactly as typed (not "Receipt") |
| E2 | `Recipt Traders ke liye invoice banao 500` (Roman) | "I understood this as: create invoice for **Recipt Traders** 500" and the same choice with **"Recipt Traders"** |
| E3 | `Create an invoice for Kamal, 500` → `item "INV-0O42 adjustment"` | Accepted as-is (letter **O**, not zero, kept) → due-date question. At the summary the item reads **INV-0O42 adjustment** |
| E4 | `Kamal ke liye invoice banao 500, GSTIN 27AAPFU0939F1ZV` | "I understood this as: create invoice for Kamal 500, GSTIN **27AAPFU0939F1ZV**" — the GSTIN unchanged, and **not** taken as the item (you are asked for the item) |
`cancel` after each. **Wrong:** any of those strings altered, or a GSTIN/number appearing as an item name.

### Group H — Asking for something else in the middle (reported by a user; fixed and re-run)
| # | Do | Should happen | Wrong if |
|---|---|---|---|
| H1 | `Create an invoice`, then (customer question open) `Invoices less than ₹25,000.` | The assistant **answers it** — the invoice list under ₹25,000 opens ("Yes — found N invoices below ₹25,000…"). The draft is **not** touched. Then `continue` → the same *Question 1 of 4 · Customer* comes back | it offers `Create a new customer "Invoices less than"` |
| H2 | `Create an invoice`, then `create the customer ramesh` | The **New Customer** form opens with **ramesh** already in the name field. Save or leave it, go back to the panel, type `continue` → your invoice draft resumes | a customer called "create the customer ramesh" is offered |
| H3 | `Create an invoice`, then the Roman-Hindi request `Pachchis hazaar se Kam ke saare invoices Ki list mujhe dijiye.` (= "list all invoices below twenty-five thousand") | It is translated ("A list of all invoices for a sum less than 25000…"), answered like H1 (list under ₹25,000 opens) — **not** "I couldn't translate that", and not taken as a customer | the "couldn't translate" notice, or a customer choice list |
| H4 | Click through with buttons only: `Create an invoice` → type `Kamal` → click an item → type `5000` → click **Skip** → click **Yes, open the invoice form** | Ends on the pre-filled New Invoice form (Kamal, that item, ₹5,000). Your clicks appear in the chat as your messages | a button that does nothing; buttons left on old messages |
Also try: any `how many…`, `show…`, `list…`, `what is…` question mid-draft — it is answered and the draft survives; a plain answer (`Kamal`, `Repairs`, `500`) still fills the question.

### Group F — Admin surfaces (Global Admin, see Setup)
| # | Do | Should see |
|---|---|---|
| F1 | Dashboard, scroll to **AI usage by provider (this month)** | Rows for **Azure OpenAI** and **Sarvam (translation)** with requests / tokens / characters / failed / cost, and a **Combined** row. **Sarvam cost > 0** (with the placeholder rate) |
| F2 | Organisations → **Acme Manufacturing** → **AI Usage** | The same split. "Combined spend: ₹… — no monthly cost cap is configured." The Sarvam cost equals *characters × the seeded rate ÷ 1000* |
| F3 | **Configuration** tab | **Multilingual support (Sarvam)**: Effective status **Active**, this organisation **Enabled**, platform switch **On**, key **Configured** (never the key itself), and **Languages actually used** (hi-IN, ta-IN with counts) |
| F4 | Click **Disable for this organisation** | A reason is required (the Confirm button stays disabled until you type one) → status **Disabled**. Back in the AI panel, type `mujhe invoice banana hai`: **no** "I understood this as" line and nothing is translated (your text is passed through untouched) — observed result: the assistant answers with the *how-to* steps ("You can find this at Sales → Invoices → New Invoice…") instead of starting the guided flow, and creates nothing. Then click **Enable** (with a reason) to restore |
| F5 | Same page as the **read-only** admin (paste `qa-out/readonly_cookie.txt` the same way) | You can view; trying to switch shows a clear refusal and nothing changes |
| F6 | The **qa-empty** organisation | "No AI usage recorded yet this month." and "No regional-language requests yet." — not blank tables |

### Group G — Failure (remove the key)
1. Stop the server, blank `SARVAM_API_KEY` in `.env` (or `export SARVAM_API_KEY=`), start it again.
2. English: `Create an invoice for Kamal, 500, Repairs` → summary as normal; `cancel`. **English is unaffected.**
3. Regional, no draft open: `mujhe kal Kamal ke liye invoice banana hai 500` → not translated, so you get a customer *choice list* (1. Kamal 2. Someone else) — never a silent pick. Now, with that draft open, type `Kamal ke liye invoice banao 500 rupaye` → *"I couldn't translate that just now, so I didn't use it. Please answer in English, or try again in a moment."* — **no error screen, nothing created**. `cancel`.
4. Put the key back and restart.
**Wrong:** an error page, a raw stack/JSON message, English slowing down, an invoice appearing.

## 5. What would be a real problem
* A **wrong customer or amount pre-filled** (or picked without you choosing).
* A **protected string altered** — a customer name "fixed", an invoice number, GSTIN, PAN or quoted misspelling changed.
* An **English answer slower** than before, or the "I understood this as" line on plain correct English.
* A **raw error** (stack trace, `{"error":…}`, "Sorry, I encountered an error") in the panel.
* A **cost figure that reads zero** when Sarvam calls were made (Group F).
* The **word "amount"/"price"/"rupees" or a GSTIN as an item name**; a question asked when everything mandatory was supplied.

## 6. Knowingly not done
* **Streamed replies stay in English** (your message is understood; the AI panel streams). The module AI-Assistant pages answer in your language.
* **Only the sales invoice** has the guided flow (customer, bill, expense and the ~50 other create actions behave as before).
* **Phrase quality is not native-speaker-reviewed**, and Hindi/Tamil *replies* are readable but unpolished.
* **The Azure cost cap is not enforced** (`docs/admin/OPEN_QUESTIONS.md`) — the "max cost" limit only stops Sarvam translation.
* A tail (~2 %) of regional requests take longer than the 2 s timeout and fall back to the original text; an uncached regional guided turn takes ~1.4 s.
* Sales users' AI panel Q&A needs the **admin** module (the panel calls an admin route): on a plan without it the panel answers "Sorry, I encountered an error" for ordinary questions. Pre-existing, not part of this work; the fixture enables the module.
* Voice input is designed for, not built (`VOICE_READINESS.md`).
