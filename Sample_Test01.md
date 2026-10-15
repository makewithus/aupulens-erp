# Sample Test 01 — Northstar Migration Data Mapping

## Purpose

Verify that the Northstar Excel migration preserves master data and invoice details, posts the supplied journal history into Finance, reconciles financial statements to the workbook, uses each customer's `customer_name`, and displays the supplier on vendor bills.

## Test data

Use `Northstar_Cloud_5Y_Migration_Test.xlsx` from a test workspace. The workbook contains these migration-ready sheets and row counts:

| Sheet | Expected rows |
| --- | ---: |
| Accounts | 25 |
| Customers | 12 |
| Vendors | 7 |
| Products | 7 |
| Invoices | 215 |
| Receipts | 213 |
| Vendor Bills | 381 |
| Journal Lines | 3,193 source lines → 1,299 grouped journal entries |
| **Total importable records** | **2,159** |

The 1,299 journal entries preserve all 3,193 lines and must balance before import. `Trial Balance`, `P&L Annual`, and `Balance Sheet` are reconciliation references; do not import these summaries because they would double-count the journal history. Other source/reference tabs must not become product, customer, or vendor records. The workbook reports 4,737 source rows because that count includes non-importable tabs.

## UI test steps

1. Sign in to a **test organization** and open **Data Migration**.
2. Under **Start New Migration**, choose **Excel** as the source system and upload `Northstar_Cloud_5Y_Migration_Test.xlsx`.
3. Wait for analysis to finish. Confirm the migration-ready datasets show the eight importable sheets above and 2,159 importable records. `Journal Lines` should be grouped into 1,299 entries while retaining all 3,193 source lines.
4. On **Field Mapping**, inspect these key mappings before clicking **Save & Validate**:

   | Entity | Target field | Expected source column |
   | --- | --- | --- |
   | Customer | Name | `customer_name` |
   | Product | Name | `product_name` |
   | Product | SKU | `sku` |
   | Product | Category | `product_category` |
   | Product | Sales Price | `list_price_inr` |
   | Product | Stock Quantity | `opening_stock_qty` |
   | Vendor | Name | `vendor_name` |
   | Vendor Bill | Bill Number | `bill_id` |
   | Vendor Bill | Vendor | `vendor_id` |
   | Journal Entry | Journal ID | `journal_id` |
   | Journal Entry | Journal Date | `journal_date` |
   | Journal Entry | Journal Lines | Generated `lines_json` |

   `company_name` should not map to Customer Name or PAN when `customer_name` is present. Journal rows must be imported as balanced journal entries, never as Products. Do not import precomputed statement tabs as additional journals.

5. Click **Save & Validate**. Resolve any invalid or duplicate rows shown in the preview; migration is intentionally blocked until the preview is clean.
   If an Account row is a duplicate and journal entries reference its account code, do not skip that Account unless an equivalent account already exists in the test organization. The start step rechecks journal dependencies after duplicate decisions before writing data. The worker also verifies that required accounts actually persisted after the Account job; if a target-side account write fails, it pauses before importing dependent journals and returns the Account/journal rows to validation review. Already imported independent rows remain intact and are checked for duplicates on retry.
6. Click **START MIGRATION** and wait for the report to finish.
   The start request repeats target-schema validation after duplicate decisions. Validation and import process dependency stages across the entire batch before selecting a chunk: all Accounts (including Merge / Update and Force Create decisions) finish before journals. Force Create preserves original source identifiers for dependent rows even when target codes receive a suffix.
7. In the report, check the entity verification rows and failed-record count. A clean test import should have no unexpected mapping failures. Investigate every reported failure before considering the migration complete.
8. Open **Sales → Products** and **Inventory → Stock Tracking**. Both should show the seven product master records, not journal descriptions.
9. Open the product details and verify names, SKUs, list prices, and category text. Category is retained in the product description as `Category: <value>` because the Product model currently has no text category field.
10. Check opening stock in **Inventory → Stock Tracking**. The two hardware items have source quantities of 35 and 12; service items have zero opening stock. The imported nonzero quantities should be represented by stock ledger entries.
11. Open **Sales → Customers**. Confirm there are 12 customer records and that their names come from `customer_name` (for example, Aster Retail and BluePeak). `Northstar Cloud Systems Private Limited` is the workbook's repeated company name and must not replace the individual customer names.
12. Open **Vendor Bills**. Confirm bills display the supplier name resolved from the vendor master; they should not show **No Vendor**.

   This workbook reuses 20 bill numbers for different suppliers. Those are distinct bills, not duplicate rows; the stored migration key is vendor-scoped while the bill list displays the original `bill_id`.

13. In **Finance → Accounting → Balance Sheet** and **Profit & Loss**, select March 31, 2026 and April 1, 2025–March 31, 2026 respectively. Verify that posted balances appear and reconcile account-by-account with the workbook. Retained earnings is derived from cumulative posted P&L because the workbook has no separate retained-earnings closing journal. A clean test organization should contain 215 sales invoices, 381 vendor bills, and 1,299 posted journal entries.

   The Balance Sheet report flags balances on the unusual side of their account group for review; it does not silently reclassify posted entries. In this workbook, Cash and Bank has a credit balance of ₹28,110,503.60, GST Payable has a debit balance of ₹4,571,280.00, and cumulative retained earnings are negative ₹24,275,500.00. These amounts reconcile to the source journal lines and Trial Balance, so they are source-data conditions rather than migration sign reversals. Before financial sign-off, investigate the bank overdraft/cash classification and GST input-credit treatment against original statements and tax records. The workbook's reference **Bank Transactions** tab also omits 20 of 378 paid vendor payments (₹3,540,000 total) even though every listed bank row is marked Matched; this tab is not imported, so it cannot substantiate a complete bank reconciliation. Resolve that source-file discrepancy with the data owner rather than inventing statement transactions during migration.

## Automated verification

From the ERP project directory, run the workbook/mapping regression tests:

```bash
npx vitest run tests/migration/pipeline.test.ts
```

Run all migration tests, including database-backed importer tests, with local MongoDB available. The Northstar end-to-end case validates invoice count/totals and compares Balance Sheet and P&L results against the workbook:

```bash
npx vitest run tests/migration
```

The integration checks verify that opening quantities create ledger rows whose totals match the stock calculation, rollback removes products and their stock rows, bill-number collisions across suppliers remain distinct, bills populate the supplier name, and each receipt's source invoice is preserved as a payment allocation. The Northstar worker test imports the workbook fixture in an isolated local MongoDB database.

Journal dependency regression cases also verify that skipped or absent account rows cannot pass the final pre-write gate, referenced skipped Accounts are returned to duplicate review, and AI Fix revalidates known importer reference failures instead of repeating a generic no-fix message.

The Northstar end-to-end case runs both in a clean workspace and with an existing Depreciation Expense account approved for Merge / Update. Both variants verify all 1,299 journals, invoice counts, and workbook Balance Sheet/P&L reconciliation. One-row chunk tests deliberately place journals before Accounts and check both Merge / Update and Force Create; another checks reversed sheet order during validation and rejection of changed, unbalanced target data before writes.

Run the type check and lint on the changed migration files:

```bash
npx tsc --noEmit
npx eslint lib/migration/deterministicMapping.ts lib/migration/entitySchemas.ts lib/migration/fieldMapping.ts lib/migration/importer.ts lib/migration/package.ts tests/migration/pipeline.test.ts tests/migration/e2eWorker.test.ts
```

## Retesting a previously imported batch

These fixes affect new imports and revalidated mappings; they do not rewrite records already created by an older batch. Test in a clean organization, or roll back that batch's imported jobs before importing again. Do not re-import into a workspace that still contains the previous test records, because duplicate detection may skip those rows or leave old incorrect records visible.
