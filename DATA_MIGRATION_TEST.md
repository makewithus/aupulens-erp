# Aupulens Data Migration Center
# Complete Manual QA & Test Execution Guide

## 1. Document Purpose
This document provides complete, human-friendly, click-by-click manual testing instructions for validating the Aupulens Data Migration Center. It is intended for manual QA engineers, product managers, and the CTO to verify that the implementation adheres to the architectural requirements. 

## 2. Scope & CTO Requirements Covered
The tests herein cover:
- End-to-End Migration Workflows (Upload → Analyze → Map → Validate → Preview → Approve → Migrate → Verify)
- Multiple File Formats (CSV, XLS, XLSX, XML, JSON, ZIP)
- Source ERP Ecosystems (Tally, Zoho)
- AI Data Analysis & Mapping (including ambiguous mapping resolution)
- Relationship Integrity (e.g., Customer → Invoice → Items → Product)
- Duplicate Detection & Resolution
- Pre-Migration Inline Editing & Validation
- Approval Gates
- True Background/Durable Migration Execution
- Real-time Progress Tracking
- Post-Migration Verification & Downloadable Reporting
- Tenant Isolation & Security Boundaries

## 3. Tester & Environment Prerequisites
- **Tester:** Must have a valid Aupulens admin/super-user account with permissions to access the Migration Center.
- **Environment:** Staging/Test environment with a clean tenant workspace.
- **Browser:** Latest version of Chrome, Firefox, or Edge.

## 4. Test Data Preparation
Download or generate the provided controlled test datasets before beginning. Do not rely exclusively on thousands of random records.

| File | Purpose | Size | Key Values & Relationships |
|---|---|---|---|
| `customers.csv` | Valid Customers | 5 records | ABC Traders, XYZ Corp |
| `products.csv` | Valid Products | 5 records | PROD-001, PROD-002 |
| `sales_invoices.csv` | Valid Invoices | 3 records | INV-1001 (Customer: ABC Traders) |
| `invoice_items.csv` | Invoice Line Items | 6 records | INV-1001 -> PROD-001 (Qty: 2, Rate: 500) |
| `tally_export.zip` | Tally Source | 1 ZIP | Contains masters + transactions |
| `duplicates.csv` | Duplicate check | 2 records | 2 Customers with exact same GSTIN |
| `invalid_data.csv` | Validation check | 3 records | Missing Customer Name, Invalid Date Format |
| `ambiguous.csv` | AI Mapping check | 1 record | Contains column "Cust Type" to trigger ambiguous AI mapping |
| `broken_rel.csv` | Broken Rel check | 1 record | Invoice referencing nonexistent customer "DEF Inc" |

---

## 5. Test Execution Rules & Evidence
- **PASS:** The actual result matches the expected result perfectly.
- **FAIL:** The system deviates from the expected result (record the exact observation).
- **GAP / NOT SUPPORTED:** The feature is not present in the current UI, or explicitly noted as a future roadmap item by the CTO.
- **Evidence:** Testers **MUST** capture screenshots for each step labeled `SCREENSHOT-XX` where instructed.

---

## 6. End-to-End Scenarios

------------------------------------------------------------
TEST CASE: DM-E2E-001
TITLE: Complete End-to-End Migration Flow
CTO REQUIREMENT: Migration Center / Main User Journey
PRIORITY: P0
------------------------------------------------------------
PRECONDITION:
- User is logged into Aupulens.
- A clean set of structured CSVs is ready (customers, products, invoices, items).

STEPS:
1. Log in to Aupulens.
2. Navigate to Admin > Migration Center (`/migration`).
3. Under "Start New Migration", select "Other" (or "CSV") from the Source System dropdown.
4. Click the file upload input and select your valid dataset files.
5. Click **"Upload & Start Analysis"**. [Capture SCREENSHOT-01: Uploaded files]
6. Wait for the page to navigate to the Migration Batch view (`/migration/[id]`).
7. Observe the **"Field Mapping"** screen. Verify AI has suggested mappings.
8. Click **"Save & Validate"**.
9. Wait for the background validation to complete (Loading screen showing "validating records...").
10. The page transitions to **"Ready for Migration"** preview.
11. Browse the actual Aupulens-style preview section to ensure records look correct. [Capture SCREENSHOT-02: Actual invoice preview]
12. Click **"START MIGRATION"**. [Capture SCREENSHOT-03: Confirmation screen]
13. Observe the "running records..." background progress. [Capture SCREENSHOT-04: Migration progress]
14. Wait for it to finish and show **"Migration Verified & Completed"**.
15. Inspect the counts in the success boxes.
16. Click **"Download CSV Report"**. [Capture SCREENSHOT-05: Downloaded report]
17. Navigate to the core Aupulens application (e.g. Sales > Invoices) and open the migrated invoice.
18. Verify the line items, customer link, and products are correct.

EXPECTED RESULT:
- Migration Center opens and processes files seamlessly.
- AI mapping suggests correct fields.
- Migration runs in the background.
- Production records are created ONLY after clicking "START MIGRATION".
- Downloadable report matches UI counts.
- Actual Aupulens UI shows intact relationships.

PASS CONDITION: All expected results are observed.
FAIL CONDITION: Page crashes, records migrate without approval, or relationships are broken.

TEST RESULT:
[ ] PASS  [ ] FAIL  [ ] BLOCKED

---

## 7. File Format Testing

------------------------------------------------------------
TEST CASE: DM-FMT-001 to DM-FMT-007
TITLE: Supported File Formats & ZIP Security
CTO REQUIREMENT: Multiple structured file formats
PRIORITY: P1
------------------------------------------------------------
PRECONDITION: User is on the Migration Center screen.

STEPS:
1. Attempt to upload a `.xls` file. Click "Upload & Start Analysis". Observe analysis results.
2. Repeat for `.xlsx`, `.xml`, `.json`.
3. Attempt to upload a `.zip` containing a mix of valid CSVs.
4. Attempt to upload a `.zip` containing malicious or unsupported files (e.g. `.exe` or `.sh`).
5. Attempt to upload a corrupted `.csv` file.

EXPECTED RESULT:
- Standard formats (CSV, XLS, XLSX, XML, JSON, ZIP) are accepted and parsed into recognizable modules.
- ZIP files containing unsupported files ignore the invalid files or reject the batch safely.
- Corrupted files display a clear error message.
- Server does not crash or expose path traversal vulnerabilities.

PASS CONDITION: System gracefully handles all formats according to expectations.

TEST RESULT:
[ ] PASS  [ ] FAIL  [ ] BLOCKED

---

## 8. Source ERP Testing

------------------------------------------------------------
TEST CASE: DM-ERP-001
TITLE: Tally Migration Support
CTO REQUIREMENT: Tally support
PRIORITY: P1
------------------------------------------------------------
STEPS:
1. Select "Tally" from the Source System dropdown.
2. Upload a known `tally_export.zip`.
3. Click "Upload & Start Analysis".
4. Review the detected modules (Masters, Transactions).

EXPECTED RESULT:
- System recognizes Tally structures.
- Ledgers, Customers, Vendors, and Invoices are detected.

TEST RESULT:
[ ] PASS  [ ] FAIL  [ ] BLOCKED

------------------------------------------------------------
TEST CASE: DM-ERP-002
TITLE: Zoho Migration Support
CTO REQUIREMENT: Zoho support
PRIORITY: P1
------------------------------------------------------------
STEPS:
1. Select "Zoho" from the Source System dropdown.
2. Upload Zoho formatted CSV exports.
3. Review mapping.

EXPECTED RESULT:
- Zoho headers are natively understood and auto-mapped accurately.

TEST RESULT:
[ ] PASS  [ ] FAIL  [ ] BLOCKED

---

## 9. AI Mapping & Ambiguity Testing

------------------------------------------------------------
TEST CASE: DM-MAP-001
TITLE: Ambiguous AI Mapping Resolution
CTO REQUIREMENT: AI-assisted mapping & Confidence/review workflow
PRIORITY: P0
------------------------------------------------------------
PRECONDITION: Prepare `ambiguous.csv` with a column "Cust Type".

STEPS:
1. Upload `ambiguous.csv`.
2. Wait for Field Mapping screen.
3. Locate the mapping for "Cust Type".
4. Confirm whether the UI shows confidence flags or suggests multiple options (e.g., Customer Category vs Custom Field).
5. Select the correct mapping manually.
6. Click "Save & Validate". [Capture SCREENSHOT-06: Ambiguous mapping]

EXPECTED RESULT:
- System does NOT blindly map ambiguous fields.
- User is forced or prompted to review unclear column names.
- Manual correction successfully saves.

TEST RESULT:
[ ] PASS  [ ] FAIL  [ ] BLOCKED

---

## 10. Relationship Testing

------------------------------------------------------------
TEST CASE: DM-REL-001
TITLE: Invoice Line Items & Multi-level Relationships
CTO REQUIREMENT: Relationship preservation & Multiple invoice items
PRIORITY: P0
------------------------------------------------------------
PRECONDITION: Upload `customers.csv`, `products.csv`, `sales_invoices.csv`, and `invoice_items.csv`.

STEPS:
1. Complete mapping and validation.
2. Approve and run the migration to completion.
3. Navigate out of Migration Center to **Sales > Invoices**.
4. Open invoice `INV-1001`.
5. Verify:
   - Invoice is linked to "ABC Traders".
   - Invoice has multiple line items corresponding to the CSV.
   - Each line item links to the correct Product (e.g. `PROD-001`).
   - Quantities and Rates match.
   - Invoice Total is correct.

EXPECTED RESULT:
- The exact relationship chain (Customer -> Invoice -> Items -> Product) is preserved perfectly.
- No dummy products or generic "Imported Value" rows exist.

FAIL CONDITION:
- Only one line item appears.
- Links are broken or text-based instead of database references.

TEST RESULT:
[ ] PASS  [ ] FAIL  [ ] BLOCKED

------------------------------------------------------------
TEST CASE: DM-REL-002
TITLE: Broken Relationships Rejection
CTO REQUIREMENT: Relationship validation
PRIORITY: P1
------------------------------------------------------------
PRECONDITION: Upload `broken_rel.csv` containing an invoice for a customer that does NOT exist in the files or DB.

STEPS:
1. Run analysis and mapping.
2. Wait for Validation.
3. Observe the Preview screen.

EXPECTED RESULT:
- The system flags the invoice as "Invalid" or "Requires Attention".
- The system DOES NOT silently create an orphaned invoice. [Capture SCREENSHOT-07: Validation results]

TEST RESULT:
[ ] PASS  [ ] FAIL  [ ] BLOCKED

---

## 11. Migration Preview & Pre-Migration Editing

------------------------------------------------------------
TEST CASE: DM-PREV-001
TITLE: Actual Aupulens UI Preview & Inline Editing
CTO REQUIREMENT: Actual Aupulens-style module preview & Pre-migration editing
PRIORITY: P0
------------------------------------------------------------
PRECONDITION: A batch is in the "Preview" state containing at least one invalid record.

STEPS:
1. On the Preview screen, locate the "Invalid Records" section.
2. Find a record with a missing required field (e.g. GSTIN).
3. Click to edit/resolve the field inline.
4. Save the correction.
5. Verify the batch returns to "Validating" to re-check the data, or the record immediately moves to Valid.
6. Scroll down to the Aupulens Preview section.
7. Browse the preview components to see how the records will look inside Aupulens. [Capture SCREENSHOT-08: Actual invoice preview]

EXPECTED RESULT:
- Preview uses actual Aupulens UI cards/tables, not raw JSON.
- Inline edits save successfully and break the validation deadlock, allowing the batch to proceed.

TEST RESULT:
[ ] PASS  [ ] FAIL  [ ] BLOCKED

---

## 12. Duplicate Resolution

------------------------------------------------------------
TEST CASE: DM-DUP-001
TITLE: Duplicate Detection and Resolution
CTO REQUIREMENT: Duplicate resolution
PRIORITY: P0
------------------------------------------------------------
PRECONDITION: Upload `duplicates.csv` (contains a customer that already exists in the database with the exact same GSTIN).

STEPS:
1. Progress the batch to the Preview stage.
2. Check the summary box for "Duplicates". It should be > 0.
3. Open the "Review Duplicates" section.
4. Select a resolution action (e.g., "Skip", "Update Target", or "Create New").
5. Save the resolution. [Capture SCREENSHOT-09: Duplicate resolution]
6. Verify the "START MIGRATION" button state.

EXPECTED RESULT:
- Duplicates are accurately caught.
- Migration CANNOT be approved if mandatory duplicates are left unresolved.
- Chosen action correctly applies during migration.

TEST RESULT:
[ ] PASS  [ ] FAIL  [ ] BLOCKED

---

## 13. Approval Gate & Background Execution

------------------------------------------------------------
TEST CASE: DM-EXEC-001
TITLE: Explicit Approval & Durable Background Worker
CTO REQUIREMENT: Explicit approval before migration & Background migration
PRIORITY: P0
------------------------------------------------------------
PRECONDITION: A fully valid batch is sitting in Preview.

STEPS:
1. Navigate to other Aupulens pages. Verify no target records exist yet.
2. Return to Migration Center. Click **"START MIGRATION"**.
3. Immediately refresh the browser.
4. Close the browser tab entirely.
5. Wait 1 minute.
6. Reopen the browser and navigate back to the Migration Center.
7. Click on the active migration batch.

EXPECTED RESULT:
- **Approval Gate:** No data is written before clicking Start Migration.
- **Background Execution:** The migration continues perfectly despite the browser refresh or closure.
- **Progress Tracking:** The UI shows accurate progress percentages upon returning. [Capture SCREENSHOT-10: Migration progress]

TEST RESULT:
[ ] PASS  [ ] FAIL  [ ] BLOCKED

---

## 14. Post-Migration Verification & Security

------------------------------------------------------------
TEST CASE: DM-POST-001
TITLE: Post-Migration Counts, Reports & Tenant Isolation
CTO REQUIREMENT: Source vs target counts, Downloadable report, Tenant isolation
PRIORITY: P0
------------------------------------------------------------
STEPS:
1. Upon migration completion, view the "Migration Verified & Completed" summary.
2. Compare the "Successfully Migrated" count with your source CSV length.
3. Click **"Download CSV Report"**.
4. Open the CSV and verify it contains record-level success/failure details. [Capture SCREENSHOT-11: Downloaded report]
5. **Security Check (IDOR):** Copy the URL of your migration batch (`/migration/[id]`).
6. Log out, and log back in as a completely different Tenant.
7. Paste the URL.

EXPECTED RESULT:
- The UI explicitly shows Source vs Target counts.
- Downloaded report contains accurate mapping logs.
- **Security:** Accessing another tenant's migration batch returns an Access Denied / 404 error. Cross-tenant data leakage is impossible.

TEST RESULT:
[ ] PASS  [ ] FAIL  [ ] BLOCKED

---

## 15. Vendor Payment Gap Check

------------------------------------------------------------
TEST CASE: DM-REL-VENDOR-PAYMENT
TITLE: Vendor -> Purchase -> Payment Relationship
CTO REQUIREMENT: Vendor payment relationship
PRIORITY: P1
------------------------------------------------------------
PRECONDITION: Upload vendors, purchase invoices, and outbound payments.

STEPS:
1. Run through migration.
2. Go to Purchases and verify the Payment applies to the Purchase Invoice.

EXPECTED RESULT:
- System links payment to purchase invoice.
*(Note: If Outbound Payments are not yet supported in Aupulens ERP, mark this explicitly as a GAP below).*

TEST RESULT:
[ ] PASS  [ ] FAIL  [ ] BLOCKED  [ ] GAP / NOT SUPPORTED
*Tester Notes:* _________________________________________________

---

## 16. Final CTO Compliance Matrix

| CTO Requirement | Test IDs | Expected | Actual | Status | Evidence | Defect |
|---|---|---|---|---|---|---|
| Main migration journey | DM-E2E-001 | Full flow works end-to-end | | | | |
| CSV, XLS, XLSX, XML, JSON, ZIP | DM-FMT-001-007 | Supported files parse correctly | | | | |
| Tally & Zoho Support | DM-ERP-001-002 | Parsers detect specific ERP structures | | | | |
| AI mapping & Ambiguous mapping | DM-MAP-001 | AI maps fields, prompts on ambiguity | | | | |
| Relationship preservation | DM-REL-001 | Customers linked to Invoices & Products | | | | |
| Multiple invoice items | DM-REL-001 | Line items migrate accurately, no dummies | | | | |
| Broken relationships | DM-REL-002 | Invalid references fail validation safely | | | | |
| Actual Aupulens module preview | DM-PREV-001 | Uses UI components, not JSON dumps | | | | |
| Pre-migration editing | DM-PREV-001 | Inline edit resolves invalid statuses | | | | |
| Duplicate resolution | DM-DUP-001 | Unresolved dupes block migration start | | | | |
| Approval gate | DM-EXEC-001 | No production DB writes until Approved | | | | |
| Background migration & Retry | DM-EXEC-001 | Survives browser close and server restarts | | | | |
| Post-migration verification & Report | DM-POST-001 | UI shows counts, report downloads safely | | | | |
| Tenant isolation | DM-POST-001 | strict IDOR checks on all routes | | | | |
| Vendor payment relationship | DM-REL-VENDOR-PAYMENT | Complete chain maps successfully | | | | |
| Future Extensibility (SAP, Odoo, etc) | Architecture Check | Platform supports adding new EntityHandlers | | | | |

---

## 17. Final QA Sign-Off

**Overall Test Cases:**
- Passed: ____
- Failed: ____
- Blocked: ____
- Gaps / Not Supported: ____

**Defect Summary:**
- Critical Defects: ____
- High Defects: ____
- Medium/Low: ____

**Production Recommendation:**
[ ] READY FOR QA SIGN-OFF
[ ] READY WITH KNOWN GAPS
[ ] NOT READY

**Sign-off Details:**
- **Tester Name:** _____________________
- **Date:** __________________________
- **Environment:** ___________________
- **Build/Commit:** __________________
- **Notes:** _________________________
