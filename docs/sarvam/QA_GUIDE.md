# QA GUIDE — Sarvam multilingual layer + guided invoice creation

For a tester who does **not** speak an Indian language. Everything is click-and-read: paste a phrase, compare with the English
meaning and the expected result. Names, ₹ amounts, dates and invoice numbers are **never translated**, so you can verify them by eye
even when the sentence around them is in Hindi or Tamil.

> Phrases were written by an AI, not a native speaker — **each one needs native-speaker confirmation** (Hindi and Tamil first).
> A stilted phrase is not a bug if the English meaning still comes through; a changed name or amount always is.
> If a step fails, the system degrades to the original text — it cannot create a wrong record, only give a worse translation.

**Where:** the AI panel — click the ✦ **Aupulens Copilot** button in the top bar. (The same flow works on every module's *AI Assistant*
page.) **Set-up:** a workspace with customers **Acme Trading**, **Acme Industries**, **Kamal**, some past invoices, and logins for a
Sales user, an HR user, and a workspace with no customers. Sarvam key set (see `sarvam_setup.md`) — or use the bundled mock (below).

---
## 1. English — everything supplied (should show a summary and NO questions)
| Step | Type / click | You should see |
|---|---|---|
| 1 | `Create an invoice for Acme Trading, 45000, due 30 days, consulting services` | A summary: Customer **Acme Trading**, Item **consulting services**, Amount **₹45,000**, Quantity **1 (default)**, Due date with weekday, Subtotal ₹45,000. **No "Question 1 of 4".** |
| 2 | `yes` | The **New Invoice** form opens with customer, item, price and due date already filled. Nothing is saved until you click **Save**. |

## 2. English — with gaps (guided, one question at a time)
| Step | Type | You should see |
|---|---|---|
| 1 | `Create an invoice` | **Question 1 of 4 · Customer** — a single question, with "back / open the form / cancel" hints |
| 2 | `Kamal` | **Question 2 of 4 · Item / service** with numbered choices taken from **this workspace's own past invoices** (e.g. 1. Consulting services, 2. Website design…). Nothing is pre-selected or invented |
| 3 | `1` (or type a new item) | Amount question |
| 4 | `5000` | Due-date question (optional — you may `skip`) |
| 5 | `skip` | Summary |
| 6 | `yes` | Pre-filled form opens |

Variations: `Acme, 45000, next Friday` in one message fills three answers at once and skips ahead. `back` returns one question.
`cancel` says nothing was created. Abandon a draft, reload the page, type `continue` — the same question returns (drafts last 30 minutes;
after that: "That draft has expired… nothing was created").

## 3. The escape hatch — "Skip the questions and open the form"
At **any** question type `Skip the questions and open the form` (or `open the form`). The invoice form opens immediately with whatever you
already answered (e.g. customer Kamal, no item). This is the old "dump text, edit a half-filled form" behaviour — nothing is lost.

## 4. Safety checks (these must NOT be "fixed" by the assistant)
| Type | Expected |
|---|---|
| `Create an invoice for Acme Traders, 500` (no such customer) | A numbered list of **real** customers (Acme Trading, Acme Industries) plus "Create a new customer". It never picks one silently |
| `…, 45.000` as the amount | Asks: ₹45,000 or ₹45? |
| `…, 200 x 5` | Asks you to give quantity and price separately |
| `…, -500` | "I couldn't read a negative number…" |
| `…, 1.5 crore` | "very large — please confirm" |
| `create an invoce for Kamal, 45k` | Reply starts **"I understood this as: … invoice … 45000"**. Then type `no, I meant create an invoice for Acme Industries, 4500, Repairs` — the summary switches to Acme Industries / ₹4,500 |

## 5. Regional languages (mock or live Sarvam) — expected outcomes, no Hindi/Tamil needed
| # | Paste | English meaning | Expected |
|---|---|---|---|
| A | `mujhe invoice banana hai` (Roman Hindi) | I want to make an invoice | Reply begins **I understood this as: create an invoice** then **Question 1 of 4** — in Hindi (Roman script) with live Sarvam; with the mock, the reply shows a `[hi]` marker |
| B | then `Acme Industries ke liye` | for Acme Industries | Customer set to **Acme Industries** (exactly as typed) → next question |
| C | item `1`, amount `12000`, `skip`, then `haan` | 1 = first choice, 12000, skip, yes | Summary shows **Acme Industries** and **₹12,000** unchanged; `haan` opens the pre-filled form |
| D | `இன்வாய்ஸ் போடுங்க` (Tamil) | make an invoice | Same flow, language shown as Tamil (ta-IN in the trace) |
| E | `Acme के लिए 45000 रुपये का इनवॉइस बनाओ` (Hindi) | Create an invoice for Acme for 45000 rupees | Flow starts; **Acme** and **45000** unchanged |
| F | `invoice banao for Acme, amount 45000 rupees` (mixed) | Create an invoice for Acme, amount 45000 rupees | Flow starts; reply in **English** (mixed input keeps an English reply) |
| G | `Recipt Traders ke liye invoice banao, INV-0O42 ki copy bhejo` | invoice for Recipt Traders; send copy of INV-0O42 | "Recipt Traders" and "INV-0O42" appear **exactly** as typed — never "Receipt" / "INV-0042" |
| H | `请给客户创建发票` (Chinese, unsupported) | — | No error; the assistant answers as it always did |
Your own message always stays on screen exactly as typed.

## 6. Permissions and empty states
| Who | Do | Expected |
|---|---|---|
| **HR user** | AI panel: `Create an invoice for Kamal` | A clear message: *you don't have access to create invoices with your current role* — nothing created |
| **HR user** | open `/sales/invoices/new` in the address bar | Sent away by the app's own gate — never a blank page |
| **Workspace with no customers** | `Create an invoice` | "You don't have any customers yet…" and the **New Customer** form opens |
| **No sign-in** | (API) | 401, not a blank screen |
| Sarvam down / wrong key / tenant switch off | regional text | The assistant still answers; text is passed untranslated; nothing wrong is created |

## 7. Auto-create (off by default)
For a test workspace only: turn on `settings.ai.autoCreateEnabled`. Finish a flow and reply `yes`: a **Draft** invoice is created through the normal invoice
route (nothing posts to the ledger until you issue it) and you land on it. `open form` instead reviews first. Turn the flag off again — `yes` then only
opens the form.

## 8. Admin screens (Global Admin)
| Screen | Expected |
|---|---|
| Dashboard → **AI usage by provider** | Azure OpenAI and Sarvam rows (requests, tokens, characters, failed, cost) and a **Combined** row |
| Organisation → **AI Usage** | Same split; "Combined spend ₹x … no monthly cost cap" or "of the ₹y cap — translation pauses once reached" |
| Organisation → **Configuration** | *Multilingual support (Sarvam)*: Effective status, this-organisation switch, platform switch, key **Configured** (never the key), and **Languages actually used** with counts |
| Disable / Enable button | Asks for a **reason**; updates; writes an audit record; a regional message afterwards is passed untranslated |
| Read-only admin | Can view; clicking the switch shows a clear refusal and nothing changes |
| Empty tenant | "No AI usage recorded yet this month." / "No regional-language requests yet." |

## Known limits (plain English)
* **Streamed replies stay in English** — your regional message is understood, the answer streams in English (non-streaming assistants answer in your language).
* **Only the sales invoice** has the guided flow. Customer, vendor bill, expense and the other ~50 create actions keep their existing behaviour (regional input still reaches them).
* **Sarvam behaviour is mock-verified** until the live check (`LIVE_VERIFICATION.md`); the placeholder format used to protect names is **unconfirmed** against the real API.
* **Phrases need native-speaker review.**
* **The Azure cost cap is not enforced** — a tenant's "max cost" limit only stops Sarvam translation, not Azure (see `docs/admin/OPEN_QUESTIONS.md`).
* **Pre-existing:** creating a draft invoice with no customer through the API returns HTTP 500 with a raw message. The assistant can never send that (proved by test).

---
## Self-run log
Every row below was run by the assistant in a **real browser** (Chrome, driven by `docs/sarvam/qa-browser/run.mjs`) against a seeded demo workspace with
a mock Sarvam server. Method for every row: **browser**. Re-run: see `docs/sarvam/qa-browser/README.md`.

| # | Area | Expected | Method | Result |
|---|---|---|---|---|
| P1 | Platform dashboard | AI usage by provider card lists Azure OpenAI and Sarvam with requests, characters, cost, and a Combined row | browser | **PASS** — Sarvam (translation) 15 0 11,066 1 ₹0.0181 |
| P2 | Platform dashboard — loading | While the summary is in flight the page shows a loading state, not a blank/broken card | browser | **PASS** — page chrome shown, no half-rendered provider card while the summary is held 6s; card appears when data arrives |
| P3 | Platform dashboard — empty | A month with no AI usage shows 'No AI usage recorded yet this month.' | browser | **PASS** |
| P4 | Platform dashboard — error | If the summary API fails the page shows an error/empty state, never a blank screen | browser | **PASS** — DG OVERVIEW Dashboard Search ORGANISATIONS Organisations BILLING Plans SECURITY Audit Logs Security Log Admin  |
| O1 | Org → AI Usage tab | Provider split table (Azure + Sarvam) with real numbers; Sarvam cost = seeded rate × characters; combined spend line | browser | **PASS** — Sarvam (translation) 25 0 11652 1 ₹0.0193 |
| O2 | Org → AI Usage: combined spend vs cap | With a monthly cost cap set, the tab shows 'of the ₹<cap> monthly cost cap — translation pauses once reached' | browser | **PASS** |
| O3 | Org → AI Usage: empty | A tenant with no AI usage says 'No AI usage recorded yet this month.' (not a blank table) | browser | **PASS** |
| O4 | Org → Configuration: multilingual status | Effective status, tenant switch, platform switch, key 'Configured' (never the key), languages used with counts | browser | **PASS** — hi-IN 16 3 Sep 19, 2026, 11:19 PM GMT+5:30 // ta-IN 4 0 Sep 19, 2026, 11:19 PM GMT+5:30 |
| O5 | Org → Configuration: toggle the per-tenant switch | Disable needs a reason, updates the status, writes an audit record, and really turns translation off for that tenant; re-enabling restores it | browser | **PASS** — audit rows: 5 |
| O6 | Org → Configuration: empty languages | 'No regional-language requests yet.' for a tenant that never used one | browser | **PASS** |
| O7 | Org → Configuration: error state | If saving the switch fails the admin sees an error toast and the status does not change | browser | **PASS** |
| O8 | Org → Configuration: loading state | While the tab loads the admin sees 'Loading configuration…' (not blank) | browser | **PASS** |
| O9 | Permission — read-only platform admin | Can view; trying to change the switch shows a clear refusal and nothing changes | browser | **PASS** |
| C1 | Chat — English, everything supplied | Summary only (no questions); 'yes' opens the real invoice form fully pre-filled (customer, item, ₹45000, due date +30 days) | browser | **PASS** |
| C2 | Chat — English with gaps (guided) | One question at a time with progress; item choices come from this tenant's invoice history; summary; form opens pre-filled | browser | **PASS** |
| C3 | Chat — escape hatch | 'Skip the questions and open the form' opens a partly pre-filled form (customer known, no item) — today's behaviour | browser | **PASS** |
| C4 | Chat — back and cancel | 'back' returns to the previous question; 'cancel' says nothing was created and the draft is closed | browser | **PASS** |
| C5 | Chat — resume after abandoning | Reload the page mid-flow, ask to continue: the same question comes back with the answers kept | browser | **PASS** |
| C6 | Chat — near-miss customer name | 'Acme Traders' does not exist: a numbered list of real customers is offered; nothing is picked silently | browser | **PASS** |
| C7 | Chat — 'I understood this as…' and its correction path | A typo + '45k' is shown back as 'I understood this as: … 45000'; 'no, I meant …' redoes the request | browser | **PASS** |
| C8 | Chat — loading state | While the flow is thinking, your message is already on screen with a loading bubble (not a frozen input) | browser | **PASS** |
| C9 | Chat — error state (fails open) | If the guided-flow service is down the assistant still answers (the older create path) — never a dead end | browser | **PASS** — landed on: http://demo-acme.localhost:3100/sales/invoices/new |
| C10 | Chat — English path untouched | A normal English question makes NO guided-flow request at all | browser | **PASS** |
| C11 | Sales AI Assistant page | The same guided flow works on a module assistant page (not only the sidebar) | browser | **PASS** |
| R1 | Regional — Roman Hindi create, end to end | 'mujhe invoice banana hai' → 'I understood this as: create an invoice' + Question 1 (in the reply language); answers in Hindi; ends on a pre-filled form | browser | **PASS** |
| R2 | Regional — Tamil script | Tamil 'இன்வாய்ஸ் போடுங்க' starts the same flow (detected ta-IN) | browser | **PASS** |
| R3 | Regional — your own text stays on screen | The chat bubble shows exactly what you typed, never the normalised copy | browser | **PASS** |
| R4 | Regional — provider down (fails open) | With Sarvam unreachable the assistant still answers; no error screen; a degraded record is logged; nothing wrong is created | browser | **PASS** — degraded records 4→5 |
| X1 | Permission — HR user asks for an invoice | A clear refusal in the chat ('you don't have access…'), never a blank screen; nothing is created | browser | **PASS** |
| X2 | Permission — HR user opens /sales directly | Redirected away by the app's own gate, page has content (not blank) | browser | **PASS** — redirected to http://demo-acme.localhost:3100/hr/dashboard |
| X3 | Empty state — tenant with no customers | Says so plainly and opens the New Customer form (no dead end, no invoice flow) | browser | **PASS** |
| X4 | Unauthenticated API call | The guided-flow endpoint refuses with a clear 401, not an HTML/blank response | browser | **PASS** — status 401 |
| E1 | Execute path (flag ON for this tenant) | 'yes' creates a DRAFT through the real route and lands on the new invoice; nothing posted to the ledger | browser | **PASS** — created INV-0002 as draft, total 700 |
| E2 | Execute path (flag OFF again) | Same conversation only OPENS the form; no invoice is created | browser | **PASS** |

Summary: 34/34 steps passed in a real browser. Bugs found by this pass and fixed before sign-off are listed below.

### Defects the browser pass found (all fixed and re-run)
1. **The global AI panel never ran the guided flow.** Only the seven module AI-Assistant pages called `tryAiCreateFlow`; the sidebar has its own send path, so the surface most people use ignored the new flow (and regional create requests never reached the create router there). Fixed: `AiSidebar.handleSend` now consults the same flow (`runTaskFlow`), shows the user's message with a loading bubble immediately, and classifies on the pipeline's English. Covered by C1–C10, R1–R3.
2. **My first form check was too weak** — it passed because the chat panel contained the customer's name. The runner now asserts the *form's own* customer control and input values (and found the form needs a few seconds in dev mode to show the customer).
3. Seed script: a **blank** price seeded a free (₹0) rate (fixed earlier; re-verified on screen in O1: ₹ on the dashboard equals characters × the seeded rate).
4. Runner/environment only (not product): multi-tenant logins fail with `TenantMismatch` if `NEXTAUTH_URL` is pinned to one tenant's host.
