# Sample Test 01 — Northstar Migration Data Mapping

## Purpose

Verify that the Northstar Excel migration imports only master records into their intended sections, preserves product price/category/opening quantity, uses each customer's `customer_name`, and displays the supplier on vendor bills.

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
| **Total migration-ready rows** | **860** |

Other workbook tabs are source/reference data and should not become product, customer, or vendor records. The workbook may report 4,737 source rows because that count includes those non-importable tabs.

## UI test steps

1. Sign in to a **test organization** and open **Data Migration**.
2. Under **Start New Migration**, choose **Excel** as the source system and upload `Northstar_Cloud_5Y_Migration_Test.xlsx`.
3. Wait for analysis to finish. Confirm the migration-ready datasets show the seven sheets above and 860 migration-ready rows.
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

   `company_name` should not map to Customer Name or PAN when `customer_name` is present. Journal, depreciation, bank-charge, and payment-against-bill rows must not appear as Products.

5. Click **Save & Validate**. Resolve any invalid or duplicate rows shown in the preview; migration is intentionally blocked until the preview is clean.
6. Click **START MIGRATION** and wait for the report to finish.
7. In the report, check the entity verification rows and failed-record count. A clean test import should have no unexpected mapping failures. Investigate every reported failure before considering the migration complete.
8. Open **Sales → Products** and **Inventory → Stock Tracking**. Both should show the seven product master records, not journal descriptions.
9. Open the product details and verify names, SKUs, list prices, and category text. Category is retained in the product description as `Category: <value>` because the Product model currently has no text category field.
10. Check opening stock in **Inventory → Stock Tracking**. The two hardware items have source quantities of 35 and 12; service items have zero opening stock. The imported nonzero quantities should be represented by stock ledger entries.
11. Open **Sales → Customers**. Confirm there are 12 customer records and that their names come from `customer_name` (for example, Aster Retail and BluePeak). `Northstar Cloud Systems Private Limited` is the workbook's repeated company name and must not replace the individual customer names.
12. Open **Vendor Bills**. Confirm bills display the supplier name resolved from the vendor master; they should not show **No Vendor**.

   This workbook reuses 20 bill numbers for different suppliers. Those are distinct bills, not duplicate rows; the stored migration key is vendor-scoped while the bill list displays the original `bill_id`.

## Automated verification

From the ERP project directory, run the workbook/mapping regression tests:

```bash
npx vitest run tests/migration/pipeline.test.ts
```

Run all migration tests, including database-backed importer tests, with local MongoDB available:

```bash
npx vitest run tests/migration
```

The integration checks verify that opening quantities create ledger rows whose totals match the stock calculation, rollback removes products and their stock rows, bill-number collisions across suppliers remain distinct, bills populate the supplier name, and each receipt's source invoice is preserved as a payment allocation. The Northstar worker test imports the workbook fixture in an isolated local MongoDB database.

Run the type check and lint on the changed migration files:

```bash
npx tsc --noEmit
npx eslint lib/migration/deterministicMapping.ts lib/migration/entitySchemas.ts lib/migration/fieldMapping.ts lib/migration/importer.ts lib/migration/package.ts tests/migration/pipeline.test.ts tests/migration/e2eWorker.test.ts
```

## Retesting a previously imported batch

These fixes affect new imports and revalidated mappings; they do not rewrite records already created by an older batch. Test in a clean organization, or roll back that batch's imported jobs before importing again. Do not re-import into a workspace that still contains the previous test records, because duplicate detection may skip those rows or leave old incorrect records visible.
