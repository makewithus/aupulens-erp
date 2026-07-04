# Chart of Accounts - Testing Protocol

This document outlines the step-by-step procedures to verify the newly implemented Chart of Accounts features in the Aupulens ERP.

## Prerequisites
1. Ensure the development server is running (`npm run dev`).
2. Log in as an authenticated user (Admin or Finance role) under any tenant.

---

## Feature 1: Account Types (Master Data)
**Objective**: Verify the management of Account Types.

1. Navigate to `/finance/accounting/chart-of-accounts/account-types`.
2. **Verify Seeding**: Upon loading the page, you should automatically see 27 predefined Account Types (e.g., "Accounts Payable", "Bank", "Cash").
3. **Verify UI Elements**: Check that the table displays `ACCOUNT TYPE`, `ACCOUNT SEGMENT`, `DESCRIPTION`, and a green `ACTIVE` pill.
4. **Create New Type**:
   - Click the **+ New** button.
   - Verify the "Account Segment" dropdown contains 5 grouped headers: Asset, Liability, Equity, Income, Expense.
   - Create a new Account Type (e.g., "Test Asset", under Asset -> Other Asset).
   - Verify the new Account Type appears in the list.
5. **Delete Type**:
   - Locate your newly created "Test Asset".
   - Click the `...` menu on the row and select **Delete**.
   - Ensure the system prevents deletion of system-default Account Types (they should not have a delete option or error upon clicking).

---

## Feature 2: Accounts (Main List)
**Objective**: Verify the Chart of Accounts list and data display.

1. Navigate to `/finance/accounting/chart-of-accounts`.
2. **Verify Top Navigation**: Check that tabs like "Chart of Accounts", "Journals", "Banking", etc., are present.
3. **Verify View Dropdown**: Ensure the header contains a view dropdown defaulting to "Active Accounts". Toggle it to "Inactive Accounts" and "All Accounts" to see if the filter updates.
4. **Verify Seeding**: Ensure the predefined list of 60+ accounts are visible (e.g., "Other Charges", "Construction Loans", "TDS Payable").
5. **Verify Locks**: System accounts should display a Lock icon instead of a checkbox in the first column.
6. **Search**: Use the search bar to search for an account (e.g., "Payroll Tax") and ensure it filters correctly.

---

## Feature 3: Find Accountants Directory
**Objective**: Verify the Accountant directory panel.

1. Stay on `/finance/accounting/chart-of-accounts`.
2. Click the **Find Accountants** button.
3. **Verify Slide-in Panel**: A right-side panel should slide in containing a list of seeded accountants (e.g., "Prashant Lumdhe", "CA Chitkala Kulkarni").
4. **Accountant Details**:
   - Click on "CA Chitkala Kulkarni".
   - Verify that the detailed view shows their Contact Info, Description, and Services Offered.
   - Click the **Back** button to return to the list.

---

## Feature 4: Create Account Modal
**Objective**: Verify the creation of a new Account.

1. Stay on `/finance/accounting/chart-of-accounts`.
2. Click the **+ New** button.
3. **Verify Form**:
   - Ensure "Account Type" is a searchable, grouped dropdown (grouped by Asset, Liability, etc.).
   - Fill in "Account Name" (e.g., "Test Bank Account").
   - Add an optional "Account Code" (e.g., "TEST-01").
   - Enter a Description.
   - Toggle the "Add to watchlist" checkbox.
4. **Submit**: Click **Save**.
5. **Verify**: Ensure the new account appears instantly in the table.

---

## Feature 5: Import / Export
**Objective**: Verify CSV data import and export.

### Export
1. Click the **...** menu -> **Export Current View**.
2. A CSV file named `chart_of_accounts_view.csv` (or similar) should download.
3. Open the file to verify it contains columns: `Account Name`, `Account Code`, `Account Type`, `Segment`, `Description`, `Status`.

### Import (3-Step Wizard)
1. Click the **...** menu -> **Import Chart of Accounts**.
2. **Step 1 (Upload)**:
   - Use the CSV file you just exported (modify a few account names to test inserts).
   - Select the file.
   - Choose "Skip Duplicates" or "Overwrite accounts". Click **Next**.
3. **Step 2 (Map Fields)**:
   - Ensure the dropdowns map correctly to `Account Name`, `Account Code`, `Account Type`, and `Description`. Click **Next**.
4. **Step 3 (Preview & Execute)**:
   - Verify the preview table shows the first 5 rows correctly.
   - Click **Import**.
5. **Success Screen**: You should see a success message showing the number of Imported, Skipped, and Overwritten rows, along with any errors (e.g., if you tried to overwrite a locked system account).

---

## Feature 6: Unit Tests (Backend)
**Objective**: Verify the automated test suite.

1. Open your terminal in the `Aupulens-ERP-main` directory.
2. Run the command: `npx vitest run tests/accounting/coa.test.ts`.
3. Verify that the two test suites pass, which strictly checks MongoDB's compound unique index enforcement (`{ tenantId, accountName }`, `{ tenantId, accountCode }`) and tenant isolation constraints.
