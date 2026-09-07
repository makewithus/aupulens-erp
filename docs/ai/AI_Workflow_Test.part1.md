## AI-01 — Document ingestion

### What it does
Extracts text from uploaded PDFs/images (vendor bills, expenses) and creates a draft record in the ERP. It identifies the vendor, amount, taxes, and codes the transaction.

### Why it matters
Saves manual data entry; if broken, all accounts payable ingestion requires human typing.

### Before you start
- Policy settings: AI-01 kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 1.1 | P1 | Upload a vendor bill | Upload `docs/ai/test-pack/bills/acme-01.pdf` via Document Intelligence -> Upload | Document Intelligence / Invoices | A draft bill appears for Acme Traders, ₹47,200, coded to Professional Fees, PDF attached, no duplicate warning | UI (Invoices list) | |
| 1.2 | P1 | Upload the same bill again | Upload `docs/ai/test-pack/bills/acme-01.pdf` again | Document Intelligence | A duplicate finding appears; **no second draft is created.** | UI (Attention tab) | |

### It must NOT do these
- Create a duplicate draft if the exact same file is uploaded twice.
- Automatically POST the bill (it must stay DRAFT).

### Known limits — do not file these as bugs
- Hand-written receipts may have poor extraction accuracy.

### If it fails
Capture the run ID from the Attention item or the Run trace, the uploaded filename, and a screenshot.

## AI-02 — Ledger classification

### What it does
Automatically assigns GL accounts to draft transactions based on the vendor, description, and historical patterns.

### Why it matters
Ensures expenses are coded to the correct buckets without manual routing.

### Before you start
- Need a draft invoice with no account selected.
- Policy settings: AI-02 kill switch ON, set to EXECUTE.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 2.1 | P1 | Uncoded draft bill | Upload a bill for a known vendor with a missing account | Invoices | The draft is automatically updated with the correct expense account | UI (Invoice details) | |

### It must NOT do these
- Change an account that a human has already explicitly set.

### Known limits — do not file these as bugs
- Rare or new vendors may result in a low-confidence classification requiring human review.

### If it fails
Capture the run ID and the draft invoice ID.

## AI-19 — Master data intelligence

### What it does
Detects duplicates, gaps, and bank detail anomalies in Vendor, Customer, and Employee records, placing holds if risk is high.

### Why it matters
Prevents payments to fraudulent or duplicate vendor profiles.

### Before you start
- Policy settings: AI-19 kill switch ON.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 19.1 | P1 | Modify employee bank details | Change the bank account number for an Employee | Employees | A hold is placed on the employee record pending review | UI (Attention tab) | |

### It must NOT do these
- Delete or merge records automatically.

### Known limits — do not file these as bugs
- **Vendor Bank Detail Changes**: Vendors/Customers carry no bank-detail field, so this workflow only monitors Employee bank changes.
- **Expiring Documents**: No tax-certificate expiry field exists on Vendors/Customers.

### If it fails
Capture the run ID and the profile ID.

## AI-20 — Related-party detection

### What it does
Detects related-party pairs by matching Customers acting as both buyers and suppliers (e.g., matching GSTINs).

### Why it matters
Identifies un-eliminated transactions or undisclosed related-party dealings.

### Before you start
- Policy settings: AI-20 kill switch ON.
- The `ai-demo-tenant` contains a planted shared GSTIN pair.

### Test cases

| # | Priority | Scenario | What you do (exact) | Where | Expected result (exact) | How to check | Pass/Fail |
|---|---|---|---|---|---|---|---|
| 20.1 | P1 | Find planted related party | Open Attention tab after a sweep | Attention | An exception shows a related-party pair matching the planted shared GSTIN | UI (Attention tab) | |

### It must NOT do these
- Automatically consolidate statements (consolidation is permanently not implemented).

### Known limits — do not file these as bugs
- Group consolidation is permanently not implemented by design.

### If it fails
Capture the run ID.
