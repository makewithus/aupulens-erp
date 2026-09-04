# AUPULENS — AI-NATIVE FINANCE OPERATING LAYER
# CHUNK 2 of 8 — BATCH A: ACCOUNTING CORE (AI-01, AI-02, AI-03, AI-04)

> **Prerequisite met.** Chunk 1 is accepted: Phase 0 artifacts exist, `lib/aiRuntime/` is live,
> `AI-00-SMOKE` passes all 10 stages, 1021/1021 tests green, one additive API route.
> The `act()` fail-closed fix you found and shipped is exactly the behaviour this brief wants —
> keep finding those.
>
> Save this file to `docs/ai/BRIEF-02-BATCH-A.md`.
>
> **Everything in Chunk 1 still applies unchanged** — Hard Rules (0.3), working protocol (0.4),
> UI regression protocol (0.6), 10 stages (2.1), the single autonomy gate (2.3), tool layer
> (2.4), output envelope (2.9), safety assertions (4.5), Definition of Done (Part 8), and the
> rejection list (Part 9).
>
> **This chunk is written against your actual discovery findings**, not generic assumptions.
> Where `CAPABILITY_MAP.md`, `GLOSSARY.md` or `OPEN_QUESTIONS.md` recorded something, this brief
> uses your repo's real names and resolves the decisions you flagged. Where this chunk and your
> Phase 0 documents disagree about a fact in the codebase, **your documents win** — re-verify and
> record the correction in `OPEN_QUESTIONS.md`.

---

# PART A — DECISIONS YOU RAISED, NOW ANSWERED

These resolve `OPEN_QUESTIONS.md` items 1, 2, 4 and 6, plus the invoice-model ambiguity you
flagged in `SYSTEM_INVENTORY.md`. Treat each as settled; do not re-litigate them mid-batch.

## A.1 Which invoice model does Batch A touch? — **Finance `Invoice` only**

You correctly flagged that `models/finance/Invoice.ts` and `models/sales/SalesInvoice.ts` are
two live, unmerged concepts.

**Decision:** Batch A operates exclusively on `models/finance/Invoice.ts`.

| Workflow | Model it touches | `moveType` |
|---|---|---|
| AI-01 | `models/finance/Invoice.ts` | `in_invoice` (vendor bill) — same as `billCreate.ts` already does |
| AI-02 | `JournalEntry.lineIds[].accountId`, `BankStatement`, `Expense`, `Invoice` lines | n/a |
| AI-03 | `BankStatement` ↔ `BankReconciliation` ↔ `Invoice` / `JournalEntry` | both |
| AI-04 | `models/finance/Expense.ts` | n/a |

`models/sales/SalesInvoice.ts` and `models/sales/Payment.ts` are **out of scope for Batch A**.
They enter at AI-05 (Chunk 5), which is where the AR side lives. If AI-03 encounters a bank line
that can only be explained by a `SalesInvoice`, it must classify it as `unknown_ar_side` and
escalate — **do not reach across into the Sales module in this batch.** Record every such case;
the count is useful evidence for AI-05's design.

## A.2 `check_permission` — **per-module routing, wrapping the real RBAC** (resolves OQ #2)

Your two options were: a new AI service-principal permission model, or per-module routing to the
existing RBAC. **Take the second.** It matches "wrap, don't rewrite" and avoids inventing a
parallel authorisation system that would then need to be kept in sync forever.

Implement `check_permission(tenantId, userId, module, action)` as a router:
- `module === "crm"` → `lib/crm/rbac.ts`
- everything else → `lib/org/rbac.ts`
- unknown module → **deny**, and raise an `OPEN_QUESTIONS.md` entry naming the module

The tool stays one registered tool with one signature; the routing is internal. Every tool that
writes must declare its `module` in registry metadata so `callTool()` can route correctly without
each workflow passing it.

**Fail closed on the gap you found:** there is no cross-module permission helper today, so for
any `(module, action)` pair the router cannot map to a real RBAC check, `check_permission`
returns **deny**, not pass. A placeholder that returns `true` is worse than no tool.

## A.3 Idempotency store — **make it DB-backed before the first write tool ships** (resolves OQ #4)

You were right that a process-scoped `Map` is insufficient once retries happen in a fresh
serverless invocation. AI-01 ships the first write tool (`draft_bill`), so this is **Task 0 of
this batch**, not a follow-up.

Add `models/ai/AiToolCall.ts`: `{tenantId, runId, toolName, idempotencyKey, argsHash, status
(in_flight|succeeded|failed), result, recordRefs[], createdAt, completedAt}` with a compound
unique index on `{tenantId, toolName, idempotencyKey}`.

`callTool()` semantics for write tools: insert `in_flight` first (the unique index is the lock);
on duplicate-key, read the existing row — if `succeeded`, return its stored result without
executing; if `in_flight` and older than a timeout, treat as failed and allow one retry; if
`failed`, allow retry. Keep the in-memory `Map` in front of it as a fast path.

## A.4 Kill-switch composition — **both switches, both tested** (resolves OQ #6)

AI-01, AI-02 and AI-04 all call the LLM. Their `reason()` stage routes through
`lib/ai/tenantAi.ts::callClaudeForTenant()` (which enforces `Organization.settings.ai.disabled`
and the monthly cap), and the executor separately checks `AiWorkflowPolicy.killSwitchEnabled`.

Required test in AI-01: with `killSwitchEnabled: true` but `org.settings.ai.disabled: true`, the
run completes with `status: "no_action"` and a reason chain naming the tenant-level switch — it
does **not** throw, and it does **not** fall back to a heuristic guess at the accounting.
Your OQ #1 kill-switch semantics (`false` = blocked) are confirmed correct as implemented.

## A.5 Autonomy ceiling for the whole of Batch A — **DRAFT**

The generic brief permits `EXECUTE` for several of these workflows. **Not yet.** Until
`check_permission` is wired to real RBAC and validated in production, and until each workflow has
override-rate data from real users, **no workflow in Batch A may exceed `DRAFT` for anything that
touches the ledger.**

Concretely, in this batch:
- Nothing auto-posts a `JournalEntry`. `draft_journal` yes; `post_journal` no.
- Nothing auto-creates a non-draft `Invoice`. `state: DRAFT` only, as `billCreate.ts` already does.
- AI-03 may set a `BankReconciliation` match link at `EXECUTE` **only** for exact deterministic
  matches (Pass 1), because that is reversible, non-ledger state. Fuzzy matches (Pass 2) are
  `RECOMMEND` regardless of confidence, this batch.
- AI-02 may set the account on an existing **draft** record at `EXECUTE`. It may not touch a
  posted or validated one.

Build the `EXECUTE` code paths and gate them behind the autonomy gate as designed — then ship
with the per-workflow threshold configured such that they don't fire. The point is that raising
autonomy later is a config change, not a code change. Record the intended future level in each
plan file.

## A.6 Tax — **there is no tax engine to call, and you must not build one**

`SYSTEM_INVENTORY.md` established that tax math is inline in `lib/sales/invoiceMath.ts` and
equivalent Finance-side logic, with `models/finance/TaxRate.ts` as the rate table. There is no
`calculateTax()` entry point.

For Batch A: AI-01 and AI-04 **select a `TaxRate` record** (an existing, deterministic lookup)
and let the existing inline invoice/expense math compute amounts. They never compute a tax
figure themselves, and they never create or modify a `TaxRate`. If the extracted document's
stated tax amount disagrees with what the selected `TaxRate` implies, that is an **escalation**,
not a reconciliation the AI performs. Building a centralised tax engine is AI-12's problem
(Chunk 6) and is explicitly out of scope here.

## A.7 Dimensions — **`Project` is the only one that exists**

You found no cost-centre/class dimension on `JournalLineSchema`. AI-02 must therefore:
- treat `Project` (`models/shared/Project.ts`) as the only assignable dimension,
- **not** add dimension fields to `JournalLineSchema` (that is a schema change to a core
  financial model, outside additive-only bounds for this batch),
- report "dimension unavailable" rather than silently coding without one.

Raise the missing-dimension gap once in `OPEN_QUESTIONS.md` with the business impact, and move on.

---

# PART B — TASK 0: FOUNDATION HARDENING (do this before AI-02)

Small, and every workflow in this batch depends on it.

```
[ ] models/ai/AiToolCall.ts + persistent idempotency in callTool()      (A.3)
[ ] check_permission routed to real lib/org/rbac.ts / lib/crm/rbac.ts,
    deny-by-default on unmapped module/action                            (A.2)
[ ] Register the Batch A tools (see Part C) — real wrappers, no stubs
[ ] emitEvent() call sites added at the real business-logic locations    (B.2)
[ ] A shared LLM-call helper in lib/aiRuntime/ that routes through
    callClaudeForTenant(), returns {proposal, confidence, rawReasons},
    and is trivially mockable in tests                                   (A.4)
```

## B.1 Event emission is the whole point — do not skip it

Part 9, item 2: "a workflow that only runs when a user clicks something" is a rejection
criterion. `CAPABILITY_MAP.md` records that today `docIntel` is 100% manual-upload-triggered.
Batch A must change that.

`emitEvent()` calls are the thin, additive registration hooks Part 0.4 STEP 3 explicitly allows
inside existing domain modules. They must be wrapped so they can never throw back into the
business route (your `eventBus.ts` already guarantees this — confirm with a test that
deliberately registers a throwing workflow and asserts the invoice still gets created).

## B.2 Exact call sites for this batch

| Event | Emit from | Consumed by |
|---|---|---|
| `document.received` | `POST /api/document-intelligence/extract`, after `ExtractedDocument` is created | AI-01 |
| `bill.created` | `lib/docIntel/billCreate.ts::createDraftBill()`, after the `Invoice` is created | AI-02, AI-27 (later) |
| `invoice.created` | Finance `Invoice` creation route(s), `moveType` in payload | AI-02, AI-03 |
| `bank.transaction.imported` | `/api/finance/bank/import`, once per `BankStatement` line batch | AI-03 |
| `expense.submitted` | `/api/finance/expenses` create route | AI-04 |
| `journal.posted` | `lib/accounting/posting.ts`, after `voucherStatus` reaches `posted` | AI-03, AI-23 (later) |
| `user.corrected_ai_output` | Wherever a user edits an AI-proposed account or field | learning loop |
| scheduled `ai.sweep.hourly` | the existing `app/api/cron/ai/runtime-sweep` route | AI-03 continuous sweep |

Emit the event with the record ID and `tenantId` only — **not** a fat payload. The context
service re-reads current state; a stale payload is a bug factory.

---

# PART C — TOOLS TO REGISTER IN THIS BATCH

Wrap real existing code. Where a wrapper has nothing real behind it, do not register it.

| Tool | Side effect | Wraps | Max autonomy |
|---|---|---|---|
| `get_invoice` | read | Finance `Invoice` queries, tenant-scoped | — |
| `get_vendor` | read | `models/admin/Vendor.ts` | — |
| `get_ledger` | read | posted `JournalEntry` queries | — |
| `get_journal` | read | `JournalEntry` by id | — |
| `get_bank_transactions` | read | `BankStatement` queries | — |
| `get_period_status` | read | `TransactionLock` + `PeriodClosing` | — |
| `get_source_document` | read | `ExtractedDocument` + Cloudinary URL | — |
| `get_chart_of_accounts` | read | `models/finance/Account.ts`, active + postable only | — |
| `run_duplicate_scan` | analyse | `lib/docIntel/duplicateCheck.ts` (extended, see AI-01) | — |
| `draft_bill` | draft | `lib/docIntel/billCreate.ts::createDraftBill()` | DRAFT |
| `draft_journal` | draft | `lib/accounting/posting.ts::buildJournalEntryPayload` + `journal-validation.ts` | DRAFT |
| `set_draft_account` | execute | sets `accountId` on a **draft-only** record | EXECUTE |
| `reconcile_transaction` | execute | `BankReconciliation` match link; calls `assertTransactionNotLocked` first | EXECUTE |
| `link_evidence` | execute | attaches an `ExtractedDocument` / Cloudinary ref to a record | EXECUTE |
| `create_task` | execute | `AiAttentionItem` via the attention engine | EXECUTE |

`post_journal`, `draft_payment`, `allocate_receipt`, `send_reminder`, `submit_filing` and
`place_payment_hold` are **not registered in this batch.** Nothing here is allowed to need them.

`draft_journal` must delegate Dr=Cr balance and category validation to
`lib/accounting/journal-validation.ts` and `smart-rules.ts` — the accounting policy engine is
authoritative (Hard Rule 3). If the model's proposal fails `smart-rules.ts`, the engine wins, the
disagreement is logged to the decision trace, and the run escalates.

---

# PART D — THE FOUR WORKFLOWS

Build in this order: **AI-02 → AI-01 → AI-03 → AI-04.**

This is a change from the generic build order, and it is deliberate. `CAPABILITY_MAP.md` shows
AI-01's ingestion path already exists and works, while AI-02's classification engine does not
exist at all despite `BankingRule` sitting there unused. AI-01 and AI-04 both need to classify.
Build the classifier first, then wire the existing ingestion to it.

Each workflow gets its own branch and its own PR.

---

## AI-02 — Ledger classification *(build first)*

**Business meaning.** Deciding which GL account (and, here, which `Project`) a transaction line
belongs to. Today a human picks from a dropdown. This picks it, using how this tenant has coded
this vendor/description before, and learns from every correction.

**What you found.** `models/finance/BankingRule.ts` is a real deterministic rule table —
`criteria[]` with any/all matching, `accountId`, `associatedAccountIds[]` — and **nothing applies
it to anything.** Its only consumer creates rules and never uses them. `lib/accounting/
smart-rules.ts` validates Dr/Cr semantics but does not classify. There is no vendor default
account field.

**So the single highest-value thing in this workflow is the missing engine, not the model call.**
A deterministic `BankingRule` engine alone would already improve the product. Build that first,
make sure it works standing alone, then add the AI fallback behind it.

**Triggers.** `bill.created`, `invoice.created`, `bank.transaction.imported`, `expense.submitted`.
Also directly callable as a service by AI-01, AI-03 and AI-04 — a workflow calling another
workflow's classifier is fine; it still runs through the executor and gets its own run record.

**Algorithm.**
1. **`BankingRule` engine (deterministic, no model).** Load active rules for the tenant, evaluate
   `criteria[]` with correct any/all semantics against the subject (vendor, description, amount,
   direction). First matching rule wins by explicit priority — if `BankingRule` has no priority
   field, evaluate in `createdAt` order and record that as a limitation rather than adding a
   field to the model. Return `basis: "explicit_rule"` and stop. **No LLM call.**
2. **Vendor history.** No rule matched: look at how the last N posted records for this
   counterparty were coded. Strong, stable history returns `basis: "history"` with confidence
   derived from consistency (e.g. 9 of the last 10 to the same account) and — importantly —
   whether those entries survived without correction.
3. **Model ranking.** Neither of the above: build candidates from account semantics and
   description similarity, call the LLM through the shared helper, return top-1 plus up to three
   alternatives, `basis: "semantic"`.
4. **Deterministic validation, which can veto any of the above.** The account must be active,
   postable, tenant-scoped, and of a type consistent with the transaction direction. Never
   propose a control account (receivable/payable control), suspense, or equity. Run the proposal
   past `lib/accounting/smart-rules.ts`; if it objects, the engine wins.
5. **Dimension.** Assign `Project` where determinable; otherwise report unavailable (A.7).
6. **Decision gate**, then act or escalate.
7. **Learn.** On `user.corrected_ai_output`, record proposal-vs-final. When a (vendor, account)
   pair reaches the stability threshold, **propose a `BankingRule`** — as a proposal a human
   approves, using the existing `AiActionProposal` + `create_banking_rule` path already present
   in `lib/accounting/aiActions.ts`. This closes the loop the codebase was already half-built
   for, and it is a governed configuration change, not a silent mutation.

**Autonomy.** `EXECUTE` only for `set_draft_account` on a **draft** record, with high confidence
and stable history. `RECOMMEND` otherwise. Never auto-codes to control, suspense or equity
accounts at any confidence.

**Expected output.** Per line, inside the standard envelope:
`{account_id, account_code, account_name, project_id|null, confidence, confidence_components{},
alternatives[{account_id, confidence}], basis: "explicit_rule"|"history"|"semantic",
validation: {passed, smart_rules_verdict}, reason_chain[]}`.

**Tests that must pass.**
- A matching `BankingRule` wins over anything the model would say, **and no LLM call is made**
  (assert the mock was not called — this is the test that proves the deterministic path is real).
- `criteria[]` any/all semantics evaluated correctly, including a rule that must *not* match.
- A control account is never auto-selected, at confidence 1.0.
- An inactive or non-postable account is never proposed.
- A user correction changes the next proposal for the same vendor.
- After N consistent corrections, a `BankingRule` **proposal** is created — and no rule is
  created directly.
- **False positive:** an ambiguous new vendor with no history returns `RECOMMEND` with
  alternatives, and sets nothing.
- Idempotency: same event twice → one run, one account set.

---

## AI-01 — Document ingestion & accounting extraction

**Business meaning.** A document arrives; today a human opens it, types the vendor, date, amount
and tax in, checks it isn't a duplicate, and attaches the file. This does all of that and
attaches the original as evidence.

**What you found.** `lib/docIntel/` is real, working and shipped: deterministic text extraction
(`pdf-parse` / `mammoth` / UTF-8) then LLM structuring, GPT-4o vision for images, exact and
near-exact duplicate detection, draft-only `createDraftBill()`. Limitations recorded:
`vendor_bill` only, manual-upload trigger only, always requires a human confirm click, no
reasoning trace.

**You are extending this module. You are not building a second one.** Part 9 item 1 names this
exact failure mode, and `CAPABILITY_MAP.md` flags `lib/docIntel/` as underlying three planned
workflows. Concretely: `extractor.ts`, `textExtract.ts` and `extractionSchemas.ts` keep doing what
they do; AI-01 is the runtime workflow that *drives* them, adds context and history, adds the
autonomy gate, adds the decision trace, and calls `billCreate.ts` through the tool layer.

**What AI-01 adds on top of docIntel.**

| Gap in docIntel today | What AI-01 adds |
|---|---|
| Manual upload only | Runs on `document.received`; the upload route emits, the workflow reacts |
| Always requires a confirm click | Autonomy gate decides confirm-required vs auto-draft (still DRAFT-capped per A.5) |
| No counterparty history | Context service supplies prior treatment of this vendor |
| Account chosen by hand | Delegates to AI-02 |
| Tax code by hand | Selects a `TaxRate` record; escalates on disagreement (A.6) |
| Exact/near-exact duplicates only | Adds file-hash and PO-reference checks (below) |
| No reasoning trace | Full `AiDecisionTrace` per Hard Rule 7 |
| No evidence link | `link_evidence` ties the `ExtractedDocument` to the created `Invoice` |

**Algorithm.**
1. Normalise to the canonical document record. `ExtractedDocument` does not store bytes by design
   — so hash the file **at upload time** in the extract route and store the hash on
   `ExtractedDocument` (additive field). Without this, hash-based duplicate detection is
   impossible later.
2. Extraction: reuse `extractor.ts` unchanged.
3. Counterparty resolution against `models/admin/Vendor.ts`. **Never create a vendor
   autonomously** — propose it. AI-19 owns master data (Chunk 8); until then, an unmatched
   counterparty is an escalation carrying the proposed vendor record, not a creation.
   Note: `billCreate.ts` currently resolves-or-creates a `Customer` partner record. **Do not
   change that existing behaviour** (additive-only), but do not extend the pattern to vendors,
   and record the inconsistency in `OPEN_QUESTIONS.md` for AI-19.
4. **Duplicate check before anything expensive.** Extend `duplicateCheck.ts` additively with:
   same file hash; same PO reference across two bills. Keep the existing vendor+number and
   vendor+amount±1 checks working exactly as they do — existing callers must not change
   behaviour. Any hit → stop, raise a duplicate finding, create no draft.
5. Arithmetic validation: lines sum to subtotal, subtotal + tax = total, currency consistent.
   Note `Invoice.currencyId` defaults to the string `"INR"` with no rate table (`GLOSSARY.md`) —
   a non-INR document is an **escalation** in this batch, not a conversion. Do not invent an FX
   rate source.
6. Accounting treatment: account via AI-02; tax via `TaxRate` selection per A.6.
7. `draft_bill` through the tool layer → `Invoice` with `moveType: "in_invoice"`, `state: DRAFT`.
8. `link_evidence`.
9. Emit `bill.created`.

**Autonomy.** `DRAFT`. Auto-draft without a confirm click requires: known vendor, stable history,
arithmetic valid, unambiguous tax rate, INR, below materiality, no duplicate signal, both kill
switches on. Anything else → `RECOMMEND` plus an attention item, which is what the existing
confirm screen already shows.

**Escalate when.** Low extraction confidence on any money field; unknown vendor; duplicate
suspicion; tax rate ambiguous or disagreeing with the stated amount; non-INR; amount ≥
materiality; totals don't reconcile; a `DOC_INTEL_TYPE` other than `vendor_bill`.

**Expected output.** Standard envelope; one `proposal` finding per document with the extracted
field set, per-field confidence, the draft `Invoice` ref, the evidence link, and the duplicate
verdict.

**Tests that must pass.**
- Clean known-vendor bill → draft `Invoice` created with `state: DRAFT`, evidence linked, account
  from AI-02, `TaxRate` selected.
- Same bill twice → second run creates nothing and raises a duplicate finding (**and** the
  existing `duplicateCheck.ts` behaviour is unchanged for its existing callers — assert this).
- Lines don't sum to total → escalated, **no draft created**.
- Non-INR document → escalated, no conversion attempted.
- Unreadable scan → escalated with a manual-entry task, never a guessed amount.
- Unknown vendor → escalated with a proposed vendor; **no `Vendor` record created**.
- Tenant AI disabled → `no_action`, reason chain names the tenant switch, no heuristic fallback.
- Replay of the same `document.received` → exactly one `Invoice`.
- The existing manual `POST /api/document-intelligence/extract` → confirm flow still works
  end-to-end, byte-identically, with the workflow disabled.

---

## AI-03 — Bank reconciliation

**Business meaning.** Matching bank lines to ledger records — invoices, bills, payments, journals
— and handling fees, transfers and timing differences, continuously, surfacing only what it
cannot resolve.

**What you found.** `BankStatement`, `BankReconciliation` (matched / unmatched / ignored) and
`BankAccount` are real. The reconcile route already calls `assertTransactionNotLocked` — real
period-lock enforcement is already there and must be reused, not reimplemented. Matching today is
manual and exact only. `lib/accounting/matching.ts` exists but is PO↔invoice matching, a
different scope — **do not overload it**; build the bank matcher separately and say so in the
plan file.

**Scope limit for this batch (A.1).** Ledger candidates come from Finance `Invoice`, posted
`JournalEntry` and Finance-side payment state (`lib/accounting/payments.ts`). `models/sales/
Payment.ts` is out of scope; a line only explicable by a Sales payment is classified
`unknown_ar_side` and escalated, with a count reported for AI-05.

**Algorithm.**
1. Normalise bank lines: date, signed amount, currency, counterparty string, reference.
2. **Pass 1 — deterministic exact match.** Amount + date window + reference. This is the only
   pass allowed to auto-reconcile in this batch.
3. **Pass 2 — fuzzy candidates.** Partial payments, one line ↔ many invoices, many lines ↔ one
   invoice, name variants, reference noise. Produces ranked candidates with confidence.
   **`RECOMMEND` only this batch**, regardless of confidence (A.5).
4. **Pass 3 — classify the remainder** into: timing difference, bank fee or charge, interest, FX
   difference, internal transfer between own `BankAccount`s, unrecorded transaction,
   `unknown_ar_side`, or unknown.
5. **No auto-posting of fee or interest journals in this batch.** The generic brief allows it;
   A.5 overrides. Classify the fee, draft the journal via `draft_journal`, escalate for approval.
6. Everything unresolved → attention item with candidates and a one-click confirm action.
7. **Maintain the reconciliation position** — bank balance vs GL balance vs unmatched population
   — and store it. AI-22 (Chunk 4) will consume this; getting the numbers right now saves rework.
8. Run on `bank.transaction.imported` **and** on the hourly sweep. Both paths, tested.

**Autonomy.** `EXECUTE` for Pass 1 only, and only after `check_period_lock` passes (wrap
`assertTransactionNotLocked` — do not duplicate the logic). Everything else `RECOMMEND`.

**Escalate when.** Multiple plausible candidates; amount ≥ materiality; unmatched item older than
the ageing threshold; bank vs GL difference outside tolerance; feed stale; `unknown_ar_side`.

**Expected output.** Envelope with `metrics{scanned, exact_matched, proposed, unmatched,
unknown_ar_side}`, a finding per proposed match with candidates and confidence, a finding per
exception with its classification and age, plus the reconciliation position
`{bank_balance, gl_balance, difference, unmatched_count, oldest_unmatched_days}`.

**Tests that must pass.**
- One-to-one exact → auto-reconciled.
- One-to-many and many-to-one → proposed, never auto-applied this batch.
- Partial payment → proposed with the residual stated.
- Duplicate bank line → detected, not double-matched.
- Internal transfer with both legs present → classified as a transfer, not as two payments.
- Stale feed → exception raised.
- **False positive:** right amount, wrong tenant or wrong bank account → must **not** match.
- A locked period → `reconcile_transaction` refuses, via the real `TransactionLock`.
- Re-running the sweep never double-reconciles.
- Bank balance − GL balance = sum of unmatched, exactly, on a fixture set.

---

## AI-04 — Expense intelligence

**Business meaning.** Employee expenses: read the receipt, check it against policy, code it, and
either draft it or raise a policy exception.

**What you found.** `models/finance/Expense.ts` exists with CRUD routes and a `/finance/expenses`
UI. Nothing AI-specific. No corporate-card feed model exists. `docIntel` is `vendor_bill`-only.

**Two real gaps you must handle honestly.**

1. **No card feed exists.** The generic brief's card↔receipt matching has nothing to match
   against. **Do not build a card feed model in this batch.** Implement receipt extraction and
   policy checking; record the card-feed gap in `OPEN_QUESTIONS.md` with what it would need.
2. **No expense policy model exists.** `AccountingSettings` has Finance-specific thresholds, not
   an expense policy. Build a minimal, additive `models/ai/AiExpensePolicy.ts` — per-tenant
   category limits, receipt-required threshold, prohibited categories — seeded empty, and treat
   an absent policy as "no policy configured, no violations detectable" rather than inventing
   limits. **Never invent a spending limit.** An AI that flags a legitimate expense against a
   made-up threshold destroys user trust faster than any other failure in this batch.

**Algorithm.**
1. Extend `DOC_INTEL_TYPE` with a `receipt` type and a receipt extraction schema in
   `extractionSchemas.ts` — additive, alongside `vendor_bill`, which keeps working untouched.
   Extract merchant, date, amount, currency, tax, payment method, line detail.
2. Map to employee (`models/hr/Employee.ts`), expense category, `Project`, and GL account via
   AI-02.
3. Tax: select a `TaxRate`; do not compute recoverability rules that don't exist (A.6).
4. Policy check against `AiExpensePolicy` if configured: over limit, missing receipt above
   threshold, prohibited category, duplicate claim (same employee + merchant + date + amount, and
   the cross-employee shared-meal case).
5. Draft the `Expense` record; violations become attention items naming the specific rule.

**Autonomy.** `DRAFT`. Policy violations always escalate with the violated rule named.

**Expected output.** Per claim: extracted fields, category, account, `TaxRate` ref, policy verdict
`{pass|warn|fail, rules_triggered[], policy_configured: bool}`, amount, draft `Expense` ref.

**Tests that must pass.**
- Receipt image → fields extracted, `Expense` drafted, account from AI-02.
- Over-limit claim with a configured policy → `fail`, with the rule named.
- **False positive:** the same claim with **no policy configured** → `pass` with
  `policy_configured: false`, and no violation invented. This is the most important test here.
- Duplicate claim by the same employee → detected.
- Non-INR receipt → escalated, no conversion.
- Existing `vendor_bill` extraction still works identically after the schema is extended.

---

# PART E — CHUNK 2 STOP GATE

**Scope: Task 0, then AI-02, AI-01, AI-03, AI-04. Nothing else.**

```
[ ] Task 0 complete: persistent idempotency, real check_permission, event call sites, LLM helper
[ ] Each workflow satisfies the full Part 8 Definition of Done
[ ] Every workflow runs from an event, not only from a click (test proves the event path)
[ ] A throwing workflow cannot break the business route that emitted its event (test)
[ ] Nothing in this batch exceeds DRAFT on the ledger; Pass-1 bank matching is the only EXECUTE
[ ] BankingRule engine works with zero LLM calls (test asserts the mock was never called)
[ ] lib/docIntel/ extended, not duplicated; its existing manual flow byte-identical
[ ] duplicateCheck.ts existing callers unchanged (test)
[ ] No Vendor, TaxRate, BankingRule or FX rate created autonomously anywhere
[ ] Sales module untouched; unknown_ar_side counted and reported
[ ] False-positive test present for each workflow
[ ] Idempotency test present for each workflow
[ ] Golden dataset fixtures added (documents, bank lines, receipts)
[ ] Full suite green, zero new failures; tsc + eslint clean
[ ] UI regression run against the Chunk 1 baseline; zero diffs on existing routes
[ ] API surface diffed
[ ] CAPABILITY_MAP.md rows AI-01..AI-04 updated to reflect what was actually built
[ ] IMPLEMENTATION_LOG.md entries for all four plus Task 0
[ ] OPEN_QUESTIONS.md updated (card-feed gap, dimensions gap, the vendor-vs-customer creation
    inconsistency in billCreate.ts, FX rate absence, any Phase 0 fact you had to correct)
```

**Report back with:** per workflow — what you extended versus created, tools registered, autonomy
actually shipped and the intended future level, test results, kill-switch flag names, the
`unknown_ar_side` count from your AI-03 fixtures, and any Phase 0 finding this chunk's work
proved wrong.

Then request **Chunk 3 — Batch B (AI-07 to AI-10, schedules)**.

One thing worth flagging now so it doesn't surprise you later: `CAPABILITY_MAP.md` records that
`JournalTemplate` is a static line template with no `frequency` / `nextRunDate`, and that no FX
rate table exists. Batch B is accruals, prepaids, revenue recognition and fixed assets — all of
which need recurring scheduled posting. Expect Chunk 3 to start by building a real recurring-
schedule mechanism. Nothing to do about it now; just don't design Task 0 in a way that makes it
harder.
