# Aupulens AI Workflows — QA Test Plan

## 1. What this system is

Aupulens ERP has an "AI operating layer" running continuously in the background. It watches business events (like uploading a bill or importing a bank statement) and hourly sweeps, running 30 autonomous workflows to do accounting work. These workflows ingest documents, code transactions, reconcile bank statements, maintain schedules, compute close readiness, detect anomalies, assemble audit evidence, and route exceptions to humans. 

The AI does not replace humans for releasing payments, changing vendor bank details, submitting statutory filings, changing rules, or closing periods. It makes proposals and drafts for a human to confirm, or automatically acts within strict safety limits.

## 2. Environment setup

Use the dedicated demo tenant for testing:
1. Log in to the Aupulens ERP system.
2. Ensure you are using the tenant: `ai-demo-tenant`.
3. To reset the demo tenant to its initial state, run `npm run reset:ai-demo` in your terminal. This will clear all workflow outputs and re-seed the required ~700 documents and 8 planted findings.
4. Navigate to `/finance/ai-operations` and open the **Policy** tab.
5. **Turn ON every kill switch** (enable every workflow) and set each to its intended maximum autonomy level (e.g., RECOMMEND, DRAFT, CONTROLLED_AUTONOMOUS, EXECUTE).

## 3. How to read a result

- **Attention Queue**: Found on the Attention tab. This is where the AI routes exceptions, findings, and tasks for a human. 
- **Finding**: A specific issue or anomaly detected by a workflow (e.g., a duplicate bill or a cutoff error).
- **"Escalated" vs "No action"**: An escalated finding requires human intervention in the Attention queue. "No action" means the workflow observed the state but deemed it healthy or immaterial, doing nothing.
- **Close tab states**: 
  - `ready`: The domain is fully reconciled and ready for period close.
  - `blocked`: A hard blocker prevents closing.
  - `not_applicable`: The domain does not apply to this tenant/period.
  - `not_checked`: The AI has not yet evaluated this domain.

## 4. How to file a bug

When filing a bug, you **MUST** include:
1. **The Run ID**: Capture the run ID of the workflow execution (visible in the UI on the finding, run trace, or Attention item). A bug report without a run ID costs an hour to reproduce.
2. The Tenant ID (always `ai-demo-tenant` for this test phase).
3. The exact input (e.g., "Uploaded acme-01.pdf").
4. Expected result vs. Actual result.
5. A screenshot of the UI showing the issue.

## 5. Known limits — read before filing anything

These are known structural limits by design or data unavailability. **Do not file these as bugs:**
- **Group Consolidation / Intercompany**: Group consolidation requires an entity model that does not exist. (By design: AI-20 stops at detection).
- **Payment Processor Settlement**: No payment processor settlement data source exists.
- **Permission Conflicts**: No role-permission matrix exists in the codebase; checking SoD conflicts is not implemented.
- **Access Change Authorization**: Activity logs are free text with no structured action-type field to reliably detect role changes.
- **Vendor Bank Detail Changes**: Vendors/Customers carry no bank-detail field at all, so detecting bank changes is impossible for AP vendors.
- **Expiring Documents**: No tax-certificate/insurance/license expiry date field exists on Vendors/Customers.
- **Credit Note Applied to Rebill**: Invoices lack an applied-against/reversal-link field.
- **Statutory Submission**: Nothing in this system files anything with a tax authority or regulator, by design.

## 6. Glossary

- **Organization / Tenant**: The legal entity or company.
- **Account**: The GL account in the chart of accounts.
- **JournalEntry**: A journal entry; lines are embedded. If `voucherStatus` is "posted", it is a ledger entry.
- **Invoice**: Used for both sales invoices (`out_invoice`) and purchase bills (`in_invoice`). There is no separate "Bill" model.
- **Payment**: The payment or receipt.
- **BankStatement**: A bank transaction or bank feed line.
- **Expense**: An expense claim.
- **Asset**: A fixed asset.
- **Employee**: An HR employee.
- **Close Blocker**: An issue blocking the period close, classified by severity.

---

## AI-01 — Document ingestion

### What it does
Extracts text from uploaded vendor bills and expenses, creating draft records.

### Why it matters
Saves manual entry; broken means manual typing.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Upload a vendor bill | Upload `docs/ai/test-pack/bills/acme-01.pdf` via Document Intelligence | Document Intelligence | A draft bill appears for Acme Traders, ₹47,200, coded to Professional Fees, PDF attached, no duplicate warning | UI | |

### It must NOT do these
- Automatically POST the bill.

### Known limits — do not file these as bugs
- Hand-written receipts have low accuracy.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-19 — Master data intelligence

### What it does
Detects duplicates, gaps, and bank detail anomalies in Employee records.

### Why it matters
Prevents payments to fraudulent profiles.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Modify employee bank details | Change bank account for an Employee | Employees | A hold is placed on the employee record pending review | UI | |

### It must NOT do these
- Delete or merge records automatically.

### Known limits — do not file these as bugs
- Vendor Bank Detail Changes not supported. Expiring Documents not supported.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-20 — Related-party detection

### What it does
Detects related-party pairs by matching shared GSTINs.

### Why it matters
Identifies un-eliminated transactions.

### Before you start
Kill switch ON. Planted shared GSTIN pair exists.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Find planted related party | Check Attention tab after a sweep | Attention tab | An exception shows a related-party pair matching the planted shared GSTIN | UI | |

### It must NOT do these
- Automatically consolidate statements.

### Known limits — do not file these as bugs
- Group consolidation is not implemented.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-02 — Ledger classification

### What it does
Assigns GL accounts to draft transactions automatically.

### Why it matters
Ensures proper coding of expenses.

### Before you start
Draft invoice with missing account. Policy set to EXECUTE.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Uncoded draft bill | Upload uncoded bill | Invoices | Draft is automatically updated with correct expense account | UI | |

### It must NOT do these
- Change an account a human explicitly set.

### Known limits — do not file these as bugs
- Rare vendors may need review.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-04 — Expense policy checks

### What it does
Validates expense claims against company policy limits.

### Why it matters
Catches out-of-policy spending.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Submit out-of-policy expense | Submit an expense claim exceeding policy threshold | Expenses | Expense is flagged for manager review with policy violation cited | UI | |

### It must NOT do these
- Approve a violating expense.

### Known limits — do not file these as bugs
- Requires configured AI policy limits.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-27 — Duplicate & duplicate-payment intelligence

### What it does
Detects duplicate bills and duplicate payments across the tenant.

### Why it matters
Prevents paying the same bill twice.

### Before you start
Kill switch ON. Planted duplicate bill & overpayment exist.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Find duplicate bill | Upload `docs/ai/test-pack/bills/acme-duplicate.pdf` | Document Intelligence | A duplicate finding appears; no second draft is created | UI | |

### It must NOT do these
- Delete the duplicate completely (must log finding).

### Known limits — do not file these as bugs
- Credit Note Applied to Rebill not supported.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-03 — Bank reconciliation matching

### What it does
Matches bank statement lines to ERP payments.

### Why it matters
Saves manual bank rec time.

### Before you start
Kill switch ON. Planted unreconciled bank difference exists.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Match exact bank line | Import `docs/ai/test-pack/statements/bank-january.csv` | Bank Statements | Exact matches reconcile automatically; exceptions appear with candidates. | UI | |

### It must NOT do these
- Match an ambiguous line autonomously.

### Known limits — do not file these as bugs
- Cannot match 1-to-many payments without candidates.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-05 — Receivables collection worklist

### What it does
Drafts communication for overdue receivables.

### Why it matters
Speeds up AR collections.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Draft reminder for overdue invoice | Trigger AR sweep | Attention tab | Draft communication created for overdue customer. | UI | |

### It must NOT do these
- Automatically send the reminder email.

### Known limits — do not file these as bugs
- Does not send emails automatically.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-06 — Payables ops

### What it does
Proposes payment runs and matches POs.

### Why it matters
Optimizes cash flow for payments.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Propose payment run | Run AP sweep | Attention tab | A payment run proposal is drafted for due bills. | UI | |

### It must NOT do these
- Release actual payments to the bank.

### Known limits — do not file these as bugs
- Does not release payments.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-07 — Accrual intelligence

### What it does
Detects stale accruals and posts reversals.

### Why it matters
Prevents overstated liabilities.

### Before you start
Kill switch ON. Planted stale accrual exists.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Find stale accrual | Check Attention tab after sweep | Attention tab | Finding appears for the planted stale accrual reversal. | UI | |

### It must NOT do these
- Reverse an accrual before its timeframe.

### Known limits — do not file these as bugs
- Only evaluates month-end.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-08 — Prepaid schedules

### What it does
Drafts and posts prepaid amortisation journals.

### Why it matters
Automates prepaid expense recognition.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Post prepaid schedule period | Wait for period end sweep | Schedules | A journal is posted for the due prepaid period. | UI | |

### It must NOT do these
- Double post the same period.

### Known limits — do not file these as bugs
- Requires manual schedule setup initially.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-09 — Revenue recognition

### What it does
Recognizes revenue for deferred schedules.

### Why it matters
Ensures GAAP/IFRS compliance.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Recognize monthly revenue | Check revenue schedules after sweep | Schedules | Draft journal linked to revenue schedule for the period. | UI | |

### It must NOT do these
- Post without correct revenue recognition dates.

### Known limits — do not file these as bugs
- SaleOrder revenue logic is minimal.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-10 — Fixed assets / depreciation

### What it does
Posts depreciation entries for fixed assets.

### Why it matters
Keeps asset books accurate.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Post depreciation | Check asset after month end | Assets | Depreciation journal posted for the active asset. | UI | |

### It must NOT do these
- Depreciate below salvage value.

### Known limits — do not file these as bugs
- Only supports straight-line currently.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-11 — Inventory / COGS intelligence

### What it does
Evaluates COGS anomalies.

### Why it matters
Catches gross margin errors.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Evaluate COGS | Check inventory findings | Attention tab | COGS findings recorded if out of bounds. | UI | |

### It must NOT do these
- Adjust inventory quantities.

### Known limits — do not file these as bugs
- Requires proper stock moves.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-26 — Accounting policy intelligence

### What it does
Checks for policy inconsistencies (e.g. capitalisation thresholds).

### Why it matters
Maintains consistency.

### Before you start
Kill switch ON. Planted capitalisation inconsistency exists.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Find planted inconsistency | Check Attention tab after sweep | Attention tab | Exception shows policy inconsistency for capitalisation. | UI | |

### It must NOT do these
- Change a company policy.

### Known limits — do not file these as bugs
- Classification inconsistencies are deferred.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-28 — Cutoff intelligence

### What it does
Detects late-recorded transactions crossing period boundaries.

### Why it matters
Ensures transactions fall in the right period.

### Before you start
Kill switch ON. Planted cut-off error exists.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Find planted cut-off error | Check Attention tab after sweep | Attention tab | Finding appears for late-recorded freight bill. | UI | |

### It must NOT do these
- Move the transaction automatically.

### Known limits — do not file these as bugs
- Requires PO + StockMove link.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-12 — Tax intelligence

### What it does
Builds GST workpapers.

### Why it matters
Prepares tax reporting.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Build tax projection | View tax reports | Reports | Tax projection rebuilt matching source transactions. | UI | |

### It must NOT do these
- File tax returns.

### Known limits — do not file these as bugs
- Statutory Submission not supported.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-14 — Flux/variance analysis

### What it does
Explains period-over-period variances.

### Why it matters
Provides management insights.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Analyze MoM variance | View flux analysis | Attention tab | Variance explanation generated for major account moves. | UI | |

### It must NOT do these
- Modify ledger balances.

### Known limits — do not file these as bugs
- Only analyzes material accounts.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-15 — Anomaly detection

### What it does
Detects anomalies like amount outliers.

### Why it matters
Catches fraud and errors.

### Before you start
Kill switch ON. Planted SaaS vendor spike exists.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Find planted anomaly | Check Attention tab after sweep | Attention tab | Finding appears for amount outlier (SaaS spike). | UI | |

### It must NOT do these
- Reverse the anomaly.

### Known limits — do not file these as bugs
- Needs historical variance baseline.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-16 — Cash intelligence

### What it does
Generates cash flow forecasts.

### Why it matters
Predicts cash runways.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Generate forecast | View cash forecast | Reports | Cash forecast updated with AP/AR aging. | UI | |

### It must NOT do these
- Move actual cash.

### Known limits — do not file these as bugs
- Forecast accuracy depends on due dates.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-21 — Statement intelligence

### What it does
Annotates statements with insights.

### Why it matters
Contextualizes reports.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Annotate P&L | View P&L statement | Statements | Statement lines carry materiality and staleness annotations. | UI | |

### It must NOT do these
- Change actual financial figures.

### Known limits — do not file these as bugs
- Cannot invent missing dimensions.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-22 — Continuous reconciliation

### What it does
Monitors domains for reconciliation gaps.

### Why it matters
Prevents period-end surprises.

### Before you start
Kill switch ON. Planted bank difference exists.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Find bank difference | Check Attention tab | Attention tab | Finding appears for unreconciled bank difference. | UI | |

### It must NOT do these
- Force-reconcile with a plug entry.

### Known limits — do not file these as bugs
- Processor Settlement not supported.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-23 — Journal review

### What it does
Scores manual journals for risk.

### Why it matters
Prevents unauthorized entries.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Score risky journal | Post a manual round-number journal | Journals | Journal flagged with high risk score. | UI | |

### It must NOT do these
- Delete the journal.

### Known limits — do not file these as bugs
- Requires manual journal creation.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-25 — Working-capital intelligence

### What it does
Calculates DSO/DPO/DIO.

### Why it matters
Tracks working capital health.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Calculate DSO | View performance tab | Reports | Working capital metrics accurately reflect current invoices. | UI | |

### It must NOT do these
- Change payment terms.

### Known limits — do not file these as bugs
- Inventory definition is simplified.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-29 — Control monitoring

### What it does
Monitors internal controls.

### Why it matters
Maintains compliance.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Monitor failed control | Check control dashboard | Attention tab | Control result recorded with remediation task. | UI | |

### It must NOT do these
- Change a user's permissions.

### Known limits — do not file these as bugs
- Permission Conflicts not supported.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-13 — Close readiness

### What it does
Evaluates readiness for period close.

### Why it matters
Ensures all tasks are done before lock.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Check close readiness | Open Close tab | Close tab | Readiness computed; blockers ranked with owners and amounts. | UI | |

### It must NOT do these
- Close or lock the period.

### Known limits — do not file these as bugs
- Does not support intercompany close.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-17 — Compliance readiness

### What it does
Checks compliance obligations.

### Why it matters
Avoids penalties.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Check compliance gap | View compliance dashboard | Attention tab | Attention item created for missing compliance registration. | UI | |

### It must NOT do these
- Submit the registration.

### Known limits — do not file these as bugs
- Statutory Submission not supported.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-18 — Audit evidence packs

### What it does
Assembles evidence for audit.

### Why it matters
Saves audit prep time.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Assemble evidence | Request evidence pack | Reports | Evidence pack recorded with trace to source documents. | UI | |

### It must NOT do these
- Delete evidence.

### Known limits — do not file these as bugs
- Only supports digital documents.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-24 — Close evidence verification

### What it does
Verifies close assertions.

### Why it matters
Ensures close completeness.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Verify assertion | Check Close tab | Close tab | Close assertion recorded with verification result. | UI | |

### It must NOT do these
- Falsify a verification.

### Known limits — do not file these as bugs
- Dependent on manual tasks.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## AI-30 — ERP operations intelligence

### What it does
Monitors system health and repairs data.

### Why it matters
Keeps ERP data clean.

### Before you start
Kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | Repair stuck schedule | Trigger health sweep | Attention tab | Stuck schedule repaired or escalated. | UI | |

### It must NOT do these
- Delete core business data.

### Known limits — do not file these as bugs
- Relink Orphan and Retry Integration Connection not supported.

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.

## P2 and P3 Test Cases (Edge Cases and Bounds)

This section covers the non-happy-path scenarios, data boundary testing, and secondary features for the workflows.

### Ingestion & Master Data
- **AI-01 P2**: Upload a bill with heavy noise (e.g. handwritten scribbles over amounts). Expectation: Low confidence flag or rejection.
- **AI-01 P3**: Upload an image format (JPEG/PNG) instead of PDF. Expectation: Extracted successfully.
- **AI-19 P2**: Modify a Customer name slightly. Expectation: Flagged as potential duplicate profile if similarity threshold crossed.
- **AI-20 P2**: Upload two companies with identical physical addresses but different GSTINs. Expectation: Flagged as 'probable' related party.

### Classification & Reconciliation
- **AI-02 P2**: Upload a bill with line items belonging to two different GL accounts (split coding). Expectation: AI handles split coding if historically trained.
- **AI-04 P2**: Submit an expense exactly AT the policy threshold. Expectation: Approved.
- **AI-27 P2**: Upload the same bill but with a slightly different date (e.g. 12/01 vs 01/12). Expectation: Still flagged as probable duplicate.
- **AI-03 P2**: Import a bank statement with a combined payment for multiple ERP bills (1-to-many match). Expectation: AI suggests candidates for human review.

### Schedules & Close
- **AI-07 P2**: Create an accrual that matches a GRNI exactly but has a small currency rounding difference. Expectation: Reversal proposed with variance.
- **AI-08 P2**: Change the amortization schedule mid-flight. Expectation: Schedule catches up or adjusts linearly based on policy.
- **AI-28 P2**: Document dated at 11:59 PM on the last day of the period. Expectation: Stays in current period, no cut-off error.
- **AI-11 P2**: Negative inventory check. Expectation: COGS anomaly generated.

### Analysis & Audit
- **AI-15 P2**: A transaction is 2x the normal amount, but below materiality threshold. Expectation: No anomaly generated (suppressed by materiality).
- **AI-21 P3**: Statement contains 10,000 lines. Expectation: AI gracefully chunks annotations without timing out.
- **AI-23 P2**: Post a journal with 99.999 precision. Expectation: Standard scoring, no round-number flag.
- **AI-18 P2**: Request evidence pack for a transaction lacking any attached PDFs. Expectation: Evidence pack notes missing support.
- **AI-30 P2**: Trigger a repair on a healthy schedule. Expectation: No action taken.
