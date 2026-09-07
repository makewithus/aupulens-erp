# PLANTED_FINDINGS.md — internal only, not for the test team

Chunk 10a, Addendum A / `docs/ai/BRIEF-10-PRE-QA.md` Part B.1: **what was deliberately planted in
the AI demo tenant, and where** — so the workflows' detection can be verified rather than assumed.
`docs/ai/AI_Workflow_Test.md` (the test team's document, once written) says what to look FOR; this
file says what is definitely THERE. If a planted finding isn't found, that is a bug, and this is
the cheapest way to ever find those bugs — see `scripts/verify-planted-findings.ts` for the
automated check this file's own claims were verified against (last clean run: 8/8, reproducible
across a reset-and-reseed cycle).

**Do not hand this file to QA.** A tester who already knows the answer isn't testing anything.

## Tenant

`ai-demo-tenant` (`Organization.subdomain`), created by `scripts/seed-demo-tenant.ts`. 13 periods
(12 months of history + the current partial month), generated **relative to whenever the script
runs** — re-seeding next month shifts every date forward with it, so this tenant never goes stale.
Reset with `npx tsx scripts/reset-demo-tenant.ts --reseed` (deletes every document scoped to this
tenant across all 39 `models/ai/*` models plus every source business model the seed creates, then
re-seeds from scratch).

## The 8 planted findings

### #1 — Real duplicate bill
The landlord's (Skyline Business Park LLP) monthly rent bill for the month 2 periods before
current (₹45,000, dated the 1st) is entered **twice** — identical vendor, amount, and date, the
classic double-keying mistake.
**Caught by:** AI-27 (duplicate detection) → `AiAttentionItem`, `"Likely duplicate bill (certain):
matched on amount, date"`.

### #2 — Real duplicate payment (overpayment)
A one-off "Emergency generator servicing" bill from the utility vendor (Metro Power & Utilities
Board), ₹12,500, dated 3 periods before current, is paid **twice** — the real payment plus a
second, mistaken payment journal a few days later, both correctly linked to the same bill via
`JournalLine.sourceId`. Total paid: ₹25,000 against a ₹12,500 bill.
**Caught by:** AI-27 → `AiAttentionItem`, `"Bill paid twice: BILL-ai-demo-tenant-00XX"`, `"2 posted
payments totalling ₹25000 against a ₹12500 bill — ₹12500 overpaid"`. Detected directly via
`findDuplicatePaymentPostings()` (`lib/aiRuntime/duplicates/detect.ts`) — certain by construction,
not scored.

### #3 — Genuine anomaly (amount outlier)
The SaaS vendor (CloudStack SaaS Solutions) bills a tight, naturally-varying ~₹8,500/month (±~150)
for 11 of the 12 historical months, then one bill 2 periods before current spikes to **₹92,000**
("Annual plan true-up (unexplained)") — many standard deviations from this vendor's own history on
this account. This is the one entry in the whole seed deliberately **not** backdated to its own
business date — its `createdAt` is genuinely recent (seed run time), which is what
`amount_outlier`'s rolling 24h evaluation window needs to see it as "just happened" against the
older baseline.
**Caught by:** AI-15 (anomaly detection) → `AiAnomaly`, `detectorId: "amount_outlier"`. (This entry
also legitimately trips `backdated_posting` — its business date genuinely differs from its posting
date, which is real and expected, not a second bug.)

### #4 — Real cut-off error
Freight goods were genuinely received (`StockMove.effectiveDate`) from Bharat Freight Logistics 2
periods before current, on a `PurchaseOrder` correctly linking that receipt to the vendor bill —
but the bill itself wasn't recorded until day 25 of the **current** period (inside AI-28's ±10-day
period-boundary evaluation window, deliberately, since bills outside that window are never even
evaluated).
**Caught by:** AI-28 (cut-off intelligence) → `evaluateCutoff()` returns `isTimingDifference: true`,
`governingDateType: "stock_move_receipt"`, surfaced in the workflow's own `exceptions` list.

### #5 — Real unreconciled bank difference
The bank statement for the month 3 periods before current reports a closing balance **₹4,300**
different from what the GL's own postings for that month imply — a real, deliberate timing/data-
entry gap, not a rounding artefact.
**Caught by:** AI-03/AI-22 (bank reconciliation / continuous reconciliation) → `AiAttentionItem`,
`"Bank vs GL: unreconciled"`.

### #6 — Real stale accrual
A GRNI accrual-reversal `AiSchedule` (₹15,000) fell due 2 periods before current and was never
processed — still `pending`, past its own `dueDate`.
**Caught by:** AI-13/AI-24 (day-zero close / close evidence) → close-readiness evidence gap,
`"Evidence needed: ..."`, surfaced through `computeCloseReadiness()`'s accruals domain.

### #7 — Real related-party pair (shared GSTIN)
Two **distinct** `Customer` records — "Sunrise Consulting Associates" (purchase role, an unpaid
₹22,000 consulting bill) and "Sunrise Family Trust Holdings" (sales role, an unpaid ₹19,500
advisory invoice) — share the exact same GSTIN (`27AABCS6666F1Z6`), a government-issued tax
registration number that cannot legitimately belong to two unrelated entities. Both sides are left
**unpaid** deliberately: `detectRelatedParties()` only builds its candidate pools from open
(unpaid) invoices on each side — a paid invoice is invisible to it entirely.
**Caught by:** AI-20 (related-party detection) → `relatedParties[]` with `classification: "certain"`,
`matchedOn: ["tax_registration_number", ...]`.

**Honest note:** this tenant's parties mostly share Pune/Maharashtra addresses (a seed-data
convenience, not a plant), which also produces several unrelated `"probable"` (address-only) AI-20
matches beyond this one intended `"certain"` pair. That's real, harmless noise from the dataset's
own construction — not a 9th planted finding, and not something to file as a bug if a tester
notices it. The verification check (`scripts/verify-planted-findings.ts`) specifically requires
`classification: "certain"` to avoid being fooled by it.

### #8 — Real policy inconsistency (capitalisation)
Two similar large equipment purchases from the hardware vendor (Apex Hardware Traders), both above
the tenant's configured ₹50,000 capitalisation threshold (`AiMaterialityPolicy`, `appliesTo:
"capitalisation"`): a ₹68,000 "Warehouse racking system" (3 periods before current) correctly
posted to the Fixed Assets account, and a ₹71,000 "Warehouse conveyor unit" (4 periods before
current) wrongly posted straight to an expense account instead — the same class of purchase,
treated inconsistently.
**Caught by:** AI-26 (accounting policy) → `findCapitalizationInconsistencies()`
(`lib/aiRuntime/policyIntelligence/consistency.ts`), surfaced in the workflow's own
`inconsistencies[]`.

## What this dataset is NOT trying to prove

- **12 months, not 18** — a deliberate scope choice for tractability within this pass, stated
  plainly rather than silently padded. Twelve months is enough real history for every workflow's
  own "is this vendor/account's history mature enough to trust" cold-start check to clear (AI-15's
  `count >= 5`, AI-23's cold-start rule, etc.) — the brief's underlying reason for wanting real
  history, not an arbitrary number.
- **Payroll and stock movement are present but light** (3 employees / 2 payroll runs; 1 product /
  26 stock movements) — enough for AI-11's inventory/COGS path and AI-30's general health picture
  to have real data, not empty-state everywhere, but not a planted finding target of their own; no
  workflow in the 30 keys its core detection off payroll specifically.
- **This is not the test team's document.** `docs/ai/AI_Workflow_Test.md` (Part C, not yet
  written) will reference this tenant and these planted findings' *existence* without revealing
  which records they are — a tester confirming "the system found something real here" is the test;
  this file is the answer key.
