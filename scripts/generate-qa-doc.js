const fs = require('fs');

const frontMatter = `# Aupulens AI Workflows — QA Test Plan

## 1. What this system is

Aupulens ERP has an "AI operating layer" running continuously in the background. It watches business events (like uploading a bill or importing a bank statement) and hourly sweeps, running 30 autonomous workflows to do accounting work. These workflows ingest documents, code transactions, reconcile bank statements, maintain schedules, compute close readiness, detect anomalies, assemble audit evidence, and route exceptions to humans. 

The AI does not replace humans for releasing payments, changing vendor bank details, submitting statutory filings, changing rules, or closing periods. It makes proposals and drafts for a human to confirm, or automatically acts within strict safety limits.

## 2. Environment setup

Use the dedicated demo tenant for testing:
1. Log in to the Aupulens ERP system.
2. Ensure you are using the tenant: \`ai-demo-tenant\`.
3. To reset the demo tenant to its initial state, run \`npm run reset:ai-demo\` in your terminal. This will clear all workflow outputs and re-seed the required ~700 documents and 8 planted findings.
4. Navigate to \`/finance/ai-operations\` and open the **Policy** tab.
5. **Turn ON every kill switch** (enable every workflow) and set each to its intended maximum autonomy level.

## 3. How to read a result

- **Attention Queue**: Found on the Attention tab. This is where the AI routes exceptions, findings, and tasks for a human. 
- **Finding**: A specific issue or anomaly detected by a workflow.
- **"Escalated" vs "No action"**: An escalated finding requires human intervention in the Attention queue. "No action" means the workflow observed the state but deemed it healthy or immaterial, doing nothing.
- **Close tab states**: \`ready\`, \`blocked\`, \`not_applicable\`, \`not_checked\`.

## 4. How to file a bug

When filing a bug, you **MUST** include:
1. **The Run ID**: Capture the run ID of the workflow execution (visible in the UI). A bug report without a run ID costs an hour to reproduce.
2. The Tenant ID (always \`ai-demo-tenant\` for this test phase).
3. The exact input (e.g., "Uploaded acme-01.pdf").
4. Expected result vs. Actual result.
5. A screenshot of the UI.

## 5. Known limits — read before filing anything

These are known structural limits by design or data unavailability. **Do not file these as bugs:**
- **Group Consolidation / Intercompany**: Group consolidation requires an entity model that does not exist. (By design: AI-20 stops at detection).
- **Payment Processor Settlement**: No payment processor settlement data source exists.
- **Permission Conflicts**: No role-permission matrix exists in the codebase; checking SoD conflicts is not implemented.
- **Access Change Authorization**: Activity logs are free text with no structured action-type field.
- **Vendor Bank Detail Changes**: Vendors/Customers carry no bank-detail field at all, so detecting bank changes is impossible for AP vendors.
- **Expiring Documents**: No tax-certificate/insurance/license expiry date field exists on Vendors/Customers.
- **Credit Note Applied to Rebill**: Invoices lack an applied-against/reversal-link field.
- **Statutory Submission**: Nothing in this system files anything with a tax authority or regulator, by design.

## 6. Glossary

- **Organization / Tenant**: The legal entity or company.
- **Account**: The GL account in the chart of accounts.
- **JournalEntry**: A journal entry; lines are embedded. If \`voucherStatus\` is "posted", it is a ledger entry.
- **Invoice**: Used for both sales invoices (\`out_invoice\`) and purchase bills (\`in_invoice\`). There is no separate "Bill" model.
- **Payment**: The payment or receipt.
- **BankStatement**: A bank transaction or bank feed line.
- **Expense**: An expense claim.
- **Asset**: A fixed asset.
- **Employee**: An HR employee.
- **Close Blocker**: An issue blocking the period close, classified by severity.

---
`;

const workflows = [
  // INGESTION
  { id: "AI-01", name: "Document ingestion", desc: "Extracts text from uploaded vendor bills and expenses, creating draft records.", impact: "Saves manual entry; broken means manual typing.", pre: "Kill switch ON.", scenario: "Upload a vendor bill", action: "Upload `docs/ai/test-pack/bills/acme-01.pdf` via Document Intelligence", where: "Document Intelligence", exp: "A draft bill appears for Acme Traders, ₹47,200, coded to Professional Fees, PDF attached, no duplicate warning", limits: "Hand-written receipts have low accuracy.", notDo: "Automatically POST the bill." },
  { id: "AI-19", name: "Master data intelligence", desc: "Detects duplicates, gaps, and bank detail anomalies in Employee records.", impact: "Prevents payments to fraudulent profiles.", pre: "Kill switch ON.", scenario: "Modify employee bank details", action: "Change bank account for an Employee", where: "Employees", exp: "A hold is placed on the employee record pending review", limits: "Vendor Bank Detail Changes not supported. Expiring Documents not supported.", notDo: "Delete or merge records automatically." },
  { id: "AI-20", name: "Related-party detection", desc: "Detects related-party pairs by matching shared GSTINs.", impact: "Identifies un-eliminated transactions.", pre: "Kill switch ON. Planted shared GSTIN pair exists.", scenario: "Find planted related party", action: "Check Attention tab after a sweep", where: "Attention tab", exp: "An exception shows a related-party pair matching the planted shared GSTIN", limits: "Group consolidation is not implemented.", notDo: "Automatically consolidate statements." },

  // CLASSIFICATION
  { id: "AI-02", name: "Ledger classification", desc: "Assigns GL accounts to draft transactions automatically.", impact: "Ensures proper coding of expenses.", pre: "Draft invoice with missing account. Policy set to EXECUTE.", scenario: "Uncoded draft bill", action: "Upload uncoded bill", where: "Invoices", exp: "Draft is automatically updated with correct expense account", limits: "Rare vendors may need review.", notDo: "Change an account a human explicitly set." },
  { id: "AI-04", name: "Expense policy checks", desc: "Validates expense claims against company policy limits.", impact: "Catches out-of-policy spending.", pre: "Kill switch ON.", scenario: "Submit out-of-policy expense", action: "Submit an expense claim exceeding policy threshold", where: "Expenses", exp: "Expense is flagged for manager review with policy violation cited", limits: "Requires configured AI policy limits.", notDo: "Approve a violating expense." },
  { id: "AI-27", name: "Duplicate & duplicate-payment intelligence", desc: "Detects duplicate bills and duplicate payments across the tenant.", impact: "Prevents paying the same bill twice.", pre: "Kill switch ON. Planted duplicate bill & overpayment exist.", scenario: "Find duplicate bill", action: "Upload `docs/ai/test-pack/bills/acme-duplicate.pdf`", where: "Document Intelligence", exp: "A duplicate finding appears; no second draft is created", limits: "Credit Note Applied to Rebill not supported.", notDo: "Delete the duplicate completely (must log finding)." },

  // RECONCILIATION
  { id: "AI-03", name: "Bank reconciliation matching", desc: "Matches bank statement lines to ERP payments.", impact: "Saves manual bank rec time.", pre: "Kill switch ON. Planted unreconciled bank difference exists.", scenario: "Match exact bank line", action: "Import `docs/ai/test-pack/statements/bank-january.csv`", where: "Bank Statements", exp: "Exact matches reconcile automatically; exceptions appear with candidates.", limits: "Cannot match 1-to-many payments without candidates.", notDo: "Match an ambiguous line autonomously." },
  { id: "AI-05", name: "Receivables collection worklist", desc: "Drafts communication for overdue receivables.", impact: "Speeds up AR collections.", pre: "Kill switch ON.", scenario: "Draft reminder for overdue invoice", action: "Trigger AR sweep", where: "Attention tab", exp: "Draft communication created for overdue customer.", limits: "Does not send emails automatically.", notDo: "Automatically send the reminder email." },
  { id: "AI-06", name: "Payables ops", desc: "Proposes payment runs and matches POs.", impact: "Optimizes cash flow for payments.", pre: "Kill switch ON.", scenario: "Propose payment run", action: "Run AP sweep", where: "Attention tab", exp: "A payment run proposal is drafted for due bills.", limits: "Does not release payments.", notDo: "Release actual payments to the bank." },

  // SCHEDULES
  { id: "AI-07", name: "Accrual intelligence", desc: "Detects stale accruals and posts reversals.", impact: "Prevents overstated liabilities.", pre: "Kill switch ON. Planted stale accrual exists.", scenario: "Find stale accrual", action: "Check Attention tab after sweep", where: "Attention tab", exp: "Finding appears for the planted stale accrual reversal.", limits: "Only evaluates month-end.", notDo: "Reverse an accrual before its timeframe." },
  { id: "AI-08", name: "Prepaid schedules", desc: "Drafts and posts prepaid amortisation journals.", impact: "Automates prepaid expense recognition.", pre: "Kill switch ON.", scenario: "Post prepaid schedule period", action: "Wait for period end sweep", where: "Schedules", exp: "A journal is posted for the due prepaid period.", limits: "Requires manual schedule setup initially.", notDo: "Double post the same period." },
  { id: "AI-09", name: "Revenue recognition", desc: "Recognizes revenue for deferred schedules.", impact: "Ensures GAAP/IFRS compliance.", pre: "Kill switch ON.", scenario: "Recognize monthly revenue", action: "Check revenue schedules after sweep", where: "Schedules", exp: "Draft journal linked to revenue schedule for the period.", limits: "SaleOrder revenue logic is minimal.", notDo: "Post without correct revenue recognition dates." },
  { id: "AI-10", name: "Fixed assets / depreciation", desc: "Posts depreciation entries for fixed assets.", impact: "Keeps asset books accurate.", pre: "Kill switch ON.", scenario: "Post depreciation", action: "Check asset after month end", where: "Assets", exp: "Depreciation journal posted for the active asset.", limits: "Only supports straight-line currently.", notDo: "Depreciate below salvage value." },

  // CLOSE
  { id: "AI-11", name: "Inventory / COGS intelligence", desc: "Evaluates COGS anomalies.", impact: "Catches gross margin errors.", pre: "Kill switch ON.", scenario: "Evaluate COGS", action: "Check inventory findings", where: "Attention tab", exp: "COGS findings recorded if out of bounds.", limits: "Requires proper stock moves.", notDo: "Adjust inventory quantities." },
  { id: "AI-26", name: "Accounting policy intelligence", desc: "Checks for policy inconsistencies (e.g. capitalisation thresholds).", impact: "Maintains consistency.", pre: "Kill switch ON. Planted capitalisation inconsistency exists.", scenario: "Find planted inconsistency", action: "Check Attention tab after sweep", where: "Attention tab", exp: "Exception shows policy inconsistency for capitalisation.", limits: "Classification inconsistencies are deferred.", notDo: "Change a company policy." },
  { id: "AI-28", name: "Cutoff intelligence", desc: "Detects late-recorded transactions crossing period boundaries.", impact: "Ensures transactions fall in the right period.", pre: "Kill switch ON. Planted cut-off error exists.", scenario: "Find planted cut-off error", action: "Check Attention tab after sweep", where: "Attention tab", exp: "Finding appears for late-recorded freight bill.", limits: "Requires PO + StockMove link.", notDo: "Move the transaction automatically." },

  // ANALYSIS
  { id: "AI-12", name: "Tax intelligence", desc: "Builds GST workpapers.", impact: "Prepares tax reporting.", pre: "Kill switch ON.", scenario: "Build tax projection", action: "View tax reports", where: "Reports", exp: "Tax projection rebuilt matching source transactions.", limits: "Statutory Submission not supported.", notDo: "File tax returns." },
  { id: "AI-14", name: "Flux/variance analysis", desc: "Explains period-over-period variances.", impact: "Provides management insights.", pre: "Kill switch ON.", scenario: "Analyze MoM variance", action: "View flux analysis", where: "Attention tab", exp: "Variance explanation generated for major account moves.", limits: "Only analyzes material accounts.", notDo: "Modify ledger balances." },
  { id: "AI-15", name: "Anomaly detection", desc: "Detects anomalies like amount outliers.", impact: "Catches fraud and errors.", pre: "Kill switch ON. Planted SaaS vendor spike exists.", scenario: "Find planted anomaly", action: "Check Attention tab after sweep", where: "Attention tab", exp: "Finding appears for amount outlier (SaaS spike).", limits: "Needs historical variance baseline.", notDo: "Reverse the anomaly." },
  { id: "AI-16", name: "Cash intelligence", desc: "Generates cash flow forecasts.", impact: "Predicts cash runways.", pre: "Kill switch ON.", scenario: "Generate forecast", action: "View cash forecast", where: "Reports", exp: "Cash forecast updated with AP/AR aging.", limits: "Forecast accuracy depends on due dates.", notDo: "Move actual cash." },
  { id: "AI-21", name: "Statement intelligence", desc: "Annotates statements with insights.", impact: "Contextualizes reports.", pre: "Kill switch ON.", scenario: "Annotate P&L", action: "View P&L statement", where: "Statements", exp: "Statement lines carry materiality and staleness annotations.", limits: "Cannot invent missing dimensions.", notDo: "Change actual financial figures." },
  { id: "AI-22", name: "Continuous reconciliation", desc: "Monitors domains for reconciliation gaps.", impact: "Prevents period-end surprises.", pre: "Kill switch ON. Planted bank difference exists.", scenario: "Find bank difference", action: "Check Attention tab", where: "Attention tab", exp: "Finding appears for unreconciled bank difference.", limits: "Processor Settlement not supported.", notDo: "Force-reconcile with a plug entry." },
  { id: "AI-23", name: "Journal review", desc: "Scores manual journals for risk.", impact: "Prevents unauthorized entries.", pre: "Kill switch ON.", scenario: "Score risky journal", action: "Post a manual round-number journal", where: "Journals", exp: "Journal flagged with high risk score.", limits: "Requires manual journal creation.", notDo: "Delete the journal." },
  { id: "AI-25", name: "Working-capital intelligence", desc: "Calculates DSO/DPO/DIO.", impact: "Tracks working capital health.", pre: "Kill switch ON.", scenario: "Calculate DSO", action: "View performance tab", where: "Reports", exp: "Working capital metrics accurately reflect current invoices.", limits: "Inventory definition is simplified.", notDo: "Change payment terms." },
  { id: "AI-29", name: "Control monitoring", desc: "Monitors internal controls.", impact: "Maintains compliance.", pre: "Kill switch ON.", scenario: "Monitor failed control", action: "Check control dashboard", where: "Attention tab", exp: "Control result recorded with remediation task.", limits: "Permission Conflicts not supported.", notDo: "Change a user's permissions." },

  // AUDIT
  { id: "AI-13", name: "Close readiness", desc: "Evaluates readiness for period close.", impact: "Ensures all tasks are done before lock.", pre: "Kill switch ON.", scenario: "Check close readiness", action: "Open Close tab", where: "Close tab", exp: "Readiness computed; blockers ranked with owners and amounts.", limits: "Does not support intercompany close.", notDo: "Close or lock the period." },
  { id: "AI-17", name: "Compliance readiness", desc: "Checks compliance obligations.", impact: "Avoids penalties.", pre: "Kill switch ON.", scenario: "Check compliance gap", action: "View compliance dashboard", where: "Attention tab", exp: "Attention item created for missing compliance registration.", limits: "Statutory Submission not supported.", notDo: "Submit the registration." },
  { id: "AI-18", name: "Audit evidence packs", desc: "Assembles evidence for audit.", impact: "Saves audit prep time.", pre: "Kill switch ON.", scenario: "Assemble evidence", action: "Request evidence pack", where: "Reports", exp: "Evidence pack recorded with trace to source documents.", limits: "Only supports digital documents.", notDo: "Delete evidence." },
  { id: "AI-24", name: "Close evidence verification", desc: "Verifies close assertions.", impact: "Ensures close completeness.", pre: "Kill switch ON.", scenario: "Verify assertion", action: "Check Close tab", where: "Close tab", exp: "Close assertion recorded with verification result.", limits: "Dependent on manual tasks.", notDo: "Falsify a verification." },
  { id: "AI-30", name: "ERP operations intelligence", desc: "Monitors system health and repairs data.", impact: "Keeps ERP data clean.", pre: "Kill switch ON.", scenario: "Repair stuck schedule", action: "Trigger health sweep", where: "Attention tab", exp: "Stuck schedule repaired or escalated.", limits: "Relink Orphan and Retry Integration Connection not supported.", notDo: "Delete core business data." }
];

workflows.forEach((wf) => {
  const md = `
## ${wf.id} — ${wf.name}

### What it does
${wf.desc}

### Why it matters
${wf.impact}

### Before you start
${wf.pre}

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1 | P1 | ${wf.scenario} | ${wf.action} | ${wf.where} | ${wf.exp} | UI | |

### It must NOT do these
- ${wf.notDo}

### Known limits — do not file these as bugs
- ${wf.limits}

### If it fails
Capture the run ID, tenant ID, and a screenshot. Include the exact input provided.
`;
  fs.appendFileSync('docs/ai/AI_Workflow_Test.md', md);
});

console.log('Successfully generated AI_Workflow_Test.md');
