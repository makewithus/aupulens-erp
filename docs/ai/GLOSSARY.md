# GLOSSARY.md — Brief term → this repo's term

> Every later `docs/ai/AI-XX-plan.md` must use the right-hand column, not the left. Built from
> `SYSTEM_INVENTORY.md`; updated as later chunks reveal more terms.

| Brief says | This repo calls it |
|---|---|
| Legal entity / company | `Organization` (`models/admin/Organization.ts`); `subdomain` field doubles as `tenantId` everywhere |
| Chart of accounts / GL account | `Account` (`models/finance/Account.ts`) |
| Journal entry | `JournalEntry` (`models/finance/JournalEntry.ts`) — lines are embedded (`lineIds[]`), not a child collection |
| General ledger / posting table | No separate table — a `JournalEntry` with `voucherStatus: "posted"` *is* the ledger entry |
| Fiscal period / period lock | Two separate models: `TransactionLock` (`models/finance/TransactionLock.ts`, real enforced date-range lock) and `PeriodClosing` (`models/finance/PeriodClosing.ts`, close checklist state machine) — not cross-wired today |
| Sales invoice (Finance-module sense) | `Invoice` (`models/finance/Invoice.ts`), `moveType: "out_invoice"` |
| Purchase bill | `Invoice` (`models/finance/Invoice.ts`), `moveType: "in_invoice"` — **there is no separate `Bill` model** |
| Sales invoice (Sales-module sense, newer) | `SalesInvoice` (`models/sales/SalesInvoice.ts`) — a **different, parallel** invoice concept from the Finance one; do not conflate |
| Credit note | `Invoice`/`SalesInvoice` with `moveType: "out_refund"` / `"in_refund"` |
| Purchase order | `PurchaseOrder` (`models/finance/PurchaseOrder.ts`) — note `partnerId` intentionally refs `"Customer"`, not a bug (Odoo `res.partner` pattern, `CLAUDE.md` #4) |
| Goods receipt / GRN | No dedicated model — represented by `StockMove` (`models/inventory/StockMove.ts`) lifecycle reaching `move_executed`/`accounting_created` |
| Payment / receipt | `Payment` (`models/sales/Payment.ts`, newer, source of truth for Sales Payments tab, `allocations[]`) kept in sync with `SalesInvoice.payments[]` (older, still read for status derivation) via `lib/sales/paymentAllocation.ts`. Finance-side (`Invoice.ts`) payment state is separate: `lib/accounting/payments.ts` + `Invoice.paymentState`, not wired to `Payment.ts`. |
| Payment run / batch payment | Does not exist as a concept anywhere in this codebase |
| Bank account | `BankAccount` (`models/finance/BankAccount.ts`) |
| Bank transaction / bank feed line | `BankStatement` (`models/finance/BankStatement.ts`) |
| Bank reconciliation record | `BankReconciliation` (`models/finance/BankReconciliation.ts`) |
| Bank-rule / classification rule | `BankingRule` (`models/finance/BankingRule.ts`) — schema exists, **no engine applies it yet** (only consumer is the AI-proposal `create_banking_rule` action) |
| Expense claim | `Expense` (`models/finance/Expense.ts`) |
| Fixed asset | `Asset` (`models/finance/Asset.ts`) |
| Tax code / tax rate | `TaxRate` (`models/finance/TaxRate.ts`) — rate data only |
| Tax engine | Does not exist as a single entry point — tax math is inline in `lib/sales/invoiceMath.ts` (Sales) and equivalent inline Finance-invoice logic |
| Tax return / filing | Does not exist — no model, no route |
| Employee | `Employee` (`models/hr/Employee.ts`) |
| Payroll run | `Payroll` (`models/hr/Payroll.ts`) |
| Currency / FX rate table | **Now built** (Chunk 4, narrowly): `FxRate` (`models/finance/FxRate.ts`) — manual/import entry only, AI never writes it. Deliberately not a remeasurement engine: `PurchaseOrder`/`SaleOrder`/`SalesInvoice` carry no currency field at all (Chunk 3 finding), so only `Invoice.currencyId`/`BankAccount.currency` can ever be non-INR, and the only consumer is AI-13's close-blocker check (missing rate for a non-INR balance). `CurrencyAdjustment` (`models/finance/CurrencyAdjustment.ts`) remains a separate, pre-existing revaluation *journal*, not a rate source |
| Attachment / document / file store | Cloudinary (browser-direct upload via `lib/upload.ts`) — no S3, no local disk. Metadata-only records: `models/manufacturing/Document.ts`, `models/crm/CrmDocument.ts`, `models/ai/ExtractedDocument.ts` (never stores original bytes, by design) |
| Permission check | No single helper — `lib/org/rbac.ts` (org roles) and `lib/crm/rbac.ts` (CRM fine-grained), used separately |
| Task / to-do | `Task` (`models/admin/Task.ts`, admin-scoped) and a **separate** `Task` (`models/crm/Task.ts`, CRM-scoped, Mongoose name `CrmTask`) |
| Approval request | `ApprovalRequest` (`models/crm/ApprovalRequest.ts` for CRM; `models/legacy/ApprovalRequest.ts` for general/non-CRM — despite the `legacy/` folder name, this may still be the real general one; unverified in this chunk, flagged in `OPEN_QUESTIONS.md`) |
| Audit log / activity trail | `ActivityLog` (`models/admin/ActivityLog.ts`, global) and `CrmAuditLog` (`models/crm/CrmAuditLog.ts`, CRM-scoped) — neither captures reasoning/confidence/tool-call detail |
| Dimensions (cost centre / class) | Does not exist on journal lines. Only `Project` (`models/shared/Project.ts`) and HR's `Department` (org-structure, not a GL dimension) |
| Intercompany / consolidation | Does not exist anywhere |
| AI kill switch (workspace-level, pre-existing) | `Organization.settings.ai.disabled`, read by `lib/ai/tenantAi.ts::resolveTenantAiSettings()` — **this is a precedent, not the new per-workflow kill switch the brief requires**, which must be more granular (per AI-XX workflow, not just "AI on/off for the tenant") |
| LLM client | `lib/ai/claude.ts` — **name is legacy; it now calls Azure OpenAI (GPT-4o)**, migrated 2026-08-06, kept for call-site stability. Use `lib/ai/tenantAi.ts::callClaudeForTenant()` for anything user-facing (kill switch + quota + tenant model pref built in) |
| AI proposal / draft-then-confirm pattern | `AiActionProposal` (`models/ai/AiActionProposal.ts`, Finance) and `AiCommandProposal` (`models/ai/AiCommandProposal.ts`, cross-module) — real propose→confirm/reject→execute with TTL expiry, executed via `lib/accounting/aiActions.ts`'s fixed 7-action switch. Genuine precedent for the tool layer's preview→confirm→execute→audit shape; too narrow to be the tool registry itself. |
| Document ingestion / extraction | `lib/docIntel/` (`extractor.ts`, `textExtract.ts`, `billCreate.ts`, `duplicateCheck.ts`) + `ExtractedDocument` (`models/ai/ExtractedDocument.ts`) — vendor-bill-only today, manual-upload-triggered, draft-only output. Strong PARTIAL foundation for a future ingestion workflow. |
| Internal domain-event bus / outbox | Does not exist. `lib/studio/dispatch.ts::dispatchEvent()` is structurally similar but practically dead code (called from one manual test route only) — do not build on it. |
| Automation / workflow engine (pre-existing, unrelated concept) | **Aupulens Studio** (`lib/studio/`, `models/studio/Workflow.ts` + `WorkflowRun.ts`) — a flat condition→action automation builder (5 action types: log/set_context/notify/webhook/ai_summarize), no reasoning/validation/verification/escalation/learning stages, no retries/DLQ/idempotency. **Not** the shape needed for the AI runtime's 10-stage pipeline — do not extend it for that; it may still be worth reusing its `notify`/`webhook` action runners as reference patterns later. |
| Close blocker | **Now built** (Chunk 4): `IAiCloseBlocker` sub-documents on `models/ai/AiCloseState.ts`, classified by the pure `lib/aiRuntime/closeReadiness/classify.ts::classifyBlockerSeverity()` into `hard_blocker`/`material_exception`/`minor_exception`/`stale`/`unclassified` |
| Continuous reconciliation / reconciliation definition | **Now built** (Chunk 4): `lib/aiRuntime/reconciliation/` — one generic engine (`engine.ts`), a pure "reconciled is structurally unreachable with an unexplained item" classifier (`classify.ts`), and 12 registered `ReconciliationDefinition`s (`definitions.ts`, 9 real + 3 `not_implemented`: tax, intercompany, processor_settlement). AI-03's bank matcher and AI-10's asset tie-out are wrapped, never reimplemented — see `lib/aiRuntime/workflows/ai-03-bank-reconciliation/position.ts` |
| Close readiness / "Day Zero Close" | **Now built** (Chunk 4): `models/ai/AiCloseState.ts` (persisted per `{tenantId, period}`), computed by `lib/aiRuntime/closeReadiness/compute.ts`. 15 domains, each `ready\|blocked\|at_risk\|not_applicable\|not_checked` — the last two kept structurally distinct from `ready` everywhere. Reads `PeriodClosing` for contradiction detection only, never writes it (Hard Rule 4) |
| Close evidence / machine-verifiable assertion | **Now built** (Chunk 4): `models/ai/AiCloseAssertion.ts`, evaluated by `lib/aiRuntime/evidence/assertions.ts` against the same live data `AiCloseState` reads — not a parallel re-derivation |
| Materiality threshold (AI-generic sense) | Does not exist — closest analogues are `AccountingSettings.journals.approvalThresholdAmount` and `.tds.thresholdAmount` (both Finance-module-specific, not AI-aware). **Now built**: `AiMaterialityPolicy` (`models/ai/AiMaterialityPolicy.ts`, Chunk 3) — per-tenant, per-action-class `{absoluteAmount, percentOfBalance}`, seeded empty; absent = every workflow that needs it drops to RECOMMEND, never an invented number (`AiExpensePolicy`'s `policy_configured: false` precedent, reused) |
| Recurring schedule / amortisation engine | `AiSchedule` (`models/ai/AiSchedule.ts`, Chunk 3) — the one mechanism every "must happen every period, exactly once" workflow (AI-07/08/09/10) builds on. Deliberately not bolted onto `JournalTemplate` (a static line template with no `frequency`/`nextRunDate` — extending it would violate Hard Rule 1). Periods sum exactly to `totalAmount`; a `periodKey` posts exactly once via a real compound-unique-index compare-and-swap, not application logic |
| Tax ledger / tax transaction | **Now built** (Chunk 6): `models/ai/AiTaxTransaction.ts` — a **rebuildable projection**, never a source of truth. Written only by `lib/aiRuntime/tax/rebuildTaxProjection.ts`, which only re-shapes tax amounts `Invoice`/`SalesInvoice`/`Expense` already computed — never computes a tax figure itself. `taxRateRef`/`taxType` are always `null` (same vestigial-field class as `Invoice.invoiceLines[].taxIds` — no source document reliably links to a `TaxRate`) |
| Compliance profile / obligation / registration | **Now built** (Chunk 6): `models/ai/AiComplianceProfile.ts` — one shared, human-entered, **AI structurally read-only** model (no write tool exists for it anywhere). Empty profile → `not_configured` everywhere, never an assumed GST-monthly default, same precedent as `AiExpensePolicy`/`AiMaterialityPolicy` |
| Three-way (tax) reconciliation | AI-12's core check: ledger (GL tax control account, via AI-22's `tax` reconciliation definition) vs transactions (`AiTaxTransaction` sum) vs return (workpaper net-payable). Transactions and return tie exactly **by construction** (both derived from the same rows) — the meaningful comparison is always ledger-vs-either-of-the-other-two |
| Statement annotation / drill-down chain | **Now built** (Chunk 6): `lib/aiRuntime/statements/annotateStatement.ts` — an annotation layer over `lib/accounting/reports.ts::buildPostedJournalReport()`, never a second figure. `drillIntoAccount()` is a thin wrapper over AI-14's own `getAccountTransactionDetail()` (line→journal→transaction→source document), the one shared service AI-18 (Chunk 7, built) does consume — its `traceEvidence.ts` extends it downward to documents/approvals, never a second drill engine |
| Related party vs. consolidation | **Two different things AI-20 covers.** Consolidation (combining group companies' statements, eliminating intercompany transactions) is permanently `not_implemented` — `Organization.subdomain` **is** `tenantId`, so two group companies are structurally two tenants; see `docs/ai/AI-20-ARCHITECTURE-NOTE.md`. Related-party **detection** (Chunk 6, built) is different and buildable within one tenant: `lib/aiRuntime/relatedParty/detectRelatedParties.ts` matches a `Customer` record used in a sales role against a different `Customer` record used in a purchase role (see the `models/admin/Vendor.ts` landmine below) — proposes nothing, a human confirms |
| Dunning / AR collections reminder | **Two unrelated things share the word "dunning."** `models/sales/DunningRule.ts` + `lib/sales/dunningEngine.ts` is subscription payment-**failure retry** logic only (a failed card/UPI autocharge gets retried N times before `DUNNING_FINAL_SUBSCRIPTION_ACTION` fires) — narrow, subscription-specific, **not general AR collections**. General AR collections is `models/sales/Reminder.ts` + `lib/sales/reminderEngine.ts` (evaluates real `SalesInvoice` due dates, sends on a schedule) — AI-05 (Chunk 5) extends this one, never `DunningRule`. AI-05 adds two new `models/ai/**` pieces alongside it: `AiDispute.ts` (a disputed invoice's `reminderEngine.ts` sequence stops — checked directly in `evaluateInvoiceReminders()`) and `AiCommunicationDraft.ts` (drafted, never-sent chase content — sending stays `NEVER_AUTONOMOUS` this batch, no `send_reminder` tool exists) |

---

## Vestigial fields

Fields that exist on a model's schema, are readable, but are **never written by any real create
or update path in this codebase** — confirmed by grep across every route/lib file that could
plausibly write them, not assumed from the schema alone. A workflow must never write to one of
these, and must treat any non-empty value it happens to find as untrustworthy provenance (nothing
guarantees it was ever kept in sync with reality).

| Field | Evidence | Found by |
|---|---|---|
| `Invoice.invoiceLines[].taxIds` | Always `[]` on every real create path (`lib/docIntel/billCreate.ts`, `app/api/finance/invoices/route.ts`, every AI-01/02/08/09/10 test fixture). Tax rate selection must stay proposal *metadata* in a workflow's envelope, never a field a workflow writes to the record. | AI-01 (Chunk 2), propagated per Batch B/C's Part 0 carry-forward |
| `SaleOrder.revenueRecognition.amount` | Never assigned anywhere in the codebase — `app/api/sales/sale-orders/[id]/route.ts` (the one place this sub-object is touched at all) only ever sets `recognizedAt`/`recognizedBy`. | AI-09 (Chunk 3), A.2 investigation |
| `SaleOrder.revenueRecognition.method` | Same as `.amount` — never assigned. AI-09 reads it (a human-stated value here is honoured as real intent, per A.2), but nothing in this codebase has ever written one; every real order reaches AI-09 with this field absent. | AI-09 (Chunk 3), A.2 investigation |

**Not vestigial — human-set, not engine-derived**: `SaleOrder.revenueRecognition.recognizedAt` and
`.recognizedBy` **are** written, in exactly one place — `app/api/sales/sale-orders/[id]/route.ts`,
on a human-triggered `q2cStatus` transition. There is no recognition *engine* behind them (AI-09's
own investigation, Chunk 3 A.2) — but the field itself is real, current data, not a dead column.
Draw the line here: "nobody has ever written this" (vestigial, above) versus "a human writes this,
just not a machine" (real, just not machine-derived) are different findings and must not be
conflated.

## Model export quirks

| Model | Symptom | Workaround |
|---|---|---|
| `SalesInvoice` (`models/sales/SalesInvoice.ts`) | Exported as `export const SalesInvoice = mongoose.models.SalesInvoice \|\| mongoose.model<ISalesInvoice>(...)`. TypeScript infers the union of `mongoose.models.SalesInvoice`'s generic `Model<any>` and the properly-typed `Model<ISalesInvoice>`; `.find()`'s own overloads can't resolve across that union, producing a real `tsc` error (`TS2349: This expression is not callable`). Silent until something actually calls `.find()` on it — the first code anywhere to do so was AI-09 and `lib/aiRuntime/tools/scheduleReadTools.ts` (Chunk 3); nothing before that had exercised the path. | Cast at the call site: `(SalesInvoice as unknown as mongoose.Model<Record<string, unknown>>).find(...)`. Do **not** edit the model file (Hard Rule 1) without explicit sign-off — flagged in `OPEN_QUESTIONS.md` #18 as worth a one-time repo-wide fix if other Sales models share the pattern. AI-05 (Chunk 5) hit this the same way. AI-21 (Chunk 6) was expected to as well but doesn't — it works entirely off `buildPostedJournalReport()` and AI-14's own trace, never touching `models/sales/**` at all. |

## Landmines

Things that *look* real (a value in an enum, a check in existing code) but aren't, or don't do
what a reasonable reader would assume — recorded here specifically so nobody rediscovers them by
copying the wrong reference.

| Landmine | Reality | Do this instead |
|---|---|---|
| `models/admin/Vendor.ts` looks like the counterpart to `Customer` for AP purposes | It isn't. `PurchaseOrder.partnerId` and vendor-bill `Invoice.partnerId` (`moveType: "in_invoice"`) both ref `Customer` (Odoo-style unified partner model — `CLAUDE.md` Known Issue #4, "Do NOT change this ref to Vendor"). `models/admin/Vendor.ts` is an unrelated, minimal procurement-vendor-**rating** list (`category`/`performanceMetrics`/`aiAnalysis` only) — no GSTIN, no PAN, no address, never referenced by any Finance AP model. Found while scoping AI-20's related-party detection (Chunk 6), which needed the real vendor-role identity fields and had to use `Customer` instead. | Any AP-adjacent workflow needing a vendor's tax registration/address/bank identity must read `Customer` (filtered to records used as `Invoice.partnerId` with `moveType: "in_invoice"` or `PurchaseOrder.partnerId`), never `models/admin/Vendor.ts`. |
| `lib/accounting/smart-rules.ts`'s `categorize()` checks `accountType === "asset_bank"` | `"asset_bank"` **has never existed** in `Account.account_type`'s real enum (`models/finance/Account.ts`) — confirmed by grep across the whole schema. The real cash/bank type is `"asset_cash"`. The check is harmless dead code today (it just never matches), but copying it as a reference for "what account types exist" will silently miss every real bank account. | Use `"asset_cash"` when checking for a cash/bank account type. Queued for AI-26 (Chunk 8, accounting policy intelligence) to actually clean up in `smart-rules.ts` itself — **do not edit `smart-rules.ts`** without that sign-off (Hard Rule 1 + Chunk 4's A.2-equivalent boundary on this file). |
| `JournalEntry.totals.amountTotal` in a hand-built test fixture | Not derived from `lineIds` by the schema — it's whatever the fixture sets. Summing `Math.max(l.debit, l.credit)` across a balanced 2-line entry double-counts (both legs sum to the entry's true amount individually, e.g. debit 1000 + credit 1000 → 2000, not 1000). Caught in AI-23/29's own test fixtures when it made every posted journal look like a suspicious "round-number ₹2000" transaction and skewed an approval-threshold test 2×. | Set `totals.amountTotal` to the sum of **one side only** (e.g. `lines.reduce((s,l)=>s+l.debit,0)`), matching how a real balanced entry's "amount" is actually one number, not both legs added together. |

**Open question this batch surfaced, not yet answered**: *which accounts constitute "inventory" for
reporting purposes, given no dedicated `asset_inventory` account type exists anywhere in the Chart
of Accounts?* AI-22's `inventory` reconciliation definition (Chunk 4) already worked around this
with the `asset_current` bucket, documented as a scope simplification. AI-25 (Chunk 5) needs the
same mapping for inventory-days and cannot answer it any more precisely than AI-22 did — until a
real answer exists, AI-25 reports inventory days as `not_computable` with this reason rather than
guessing a bucket. Full write-up in `OPEN_QUESTIONS.md`.
