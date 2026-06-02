# Models and APIs Documentation

This document outlines the recently developed database models and backend API routes.

## 1. Database Models

### Product Model

- **Path**: `models\Product.ts`
- **Schema**:
  - `header`: basic info (name, sale/purchase flags).
  - `tab_general_information`: type, invoice policy, pricing.
  - `tab_sales`: upsell/cross-sell and tags.
  - `tab_prices`: Array of `pricelist_item_ids` containing `pricelist_id` (ObjectId ref), price, date, and currency.
  - `tab_accounting`: income and expense account references (linked to `Account` model via `ObjectId`).
  - `status`: draft or published.
  - `tenantId`: Multi-tenant support.

### Customer Model

- **Path**: `models\Customer.ts`
- **Schema**:
  - `header`: name, is_company, parent_id.
  - `contact_details`: email, phone, mobile, website, profile image.
  - `address_tab`: type (Invoice/Delivery/etc), street, city, zip.
  - `sales_purchase_tab`: salesperson, payment terms, pricelist.
  - `accounting_tab`: Receivable and Payable account references.
  - `tenantId`: Multi-tenant support.
- **Recent Changes**:
  - Removed duplicate `tenantId` index to fix mongoose warning
  - Fixed ObjectId validation for optional fields

### Account Model

- **Path**: `models\Account.ts`
- **Schema**:
  - `code`, `name`, `account_type`.
  - `internal_group`: Auto-mapped (Asset, Liability, etc).
  - `tenantId`: Multi-tenant support.

### SaleOrder Model

- **Path**: `models\SaleOrder.ts`
- **Schema**:
  - `header`: Order name, Partner (Customer), Dates, and flexible IDs for Pricelist/Payment Terms.
  - `orderLines`: Detailed lines with Product references, quantities, units, and tax links.
  - `otherInfo`: Salesperson, Logistics (Shipping Policy), and Tracking (Campaign/Source).
  - `chatter`: Array of messages/logs with author, body, and timestamp.
  - `status`: draft, sent, sale, done, cancel.
  - `invoiceIds`: Array of references to generated Invoices.
  - `tenantId`: Multi-tenant support with flexible string fallbacks.

### Pricelist Model

- **Path**: `models\Pricelist.ts`
- **Schema**:
  - `name`, `currencyId`, `active`.
  - `items`: An array of rules that can apply to products, categories, or globally.
  - `tenantId`: Multi-tenant support.

### Stock Model

- **Path**: `models\Stock.ts`
- **Schema**:
  - `product`: ObjectId reference to Product
  - `quantity`: Number (positive for IN, used in calculation)
  - `type`: "in" | "out" | "adjustment"
  - `reference`: String (e.g., "WH/IN/00001", "WH/OUT/00002 (Reserved)")
  - `isReserved`: Boolean (for virtual stock reservations)
  - `warehouse`: Optional string
  - `tenantId`: Multi-tenant support
- **Purpose**: Tracks all stock movements and reservations

### StockTransfer Model

- **Path**: `models\StockTransfer.ts`
- **Schema**:
  - `header`: name, partnerId (Customer ref), operationType (incoming/outgoing/internal), scheduledDate
  - `operations_tab`: Array of { productId, demand, done }
  - `additional_info`: shippingPolicy, responsibleId (User ref), projectId
  - `status`: draft, assigned, waiting, done, cancel
  - `chatter`: Array of messages with authorId (User ref)
  - `tenantId`: Multi-tenant support
- **Recent Changes**:
  - Fixed populate to use `header.name` for customers
  - Added proper chatter authorId handling

### ManufacturingOrder Model

- **Path**: `models\ManufacturingOrder.ts`
- **Schema**:
  - `header`: name, productId (Product to produce), quantity, bomId, scheduledDate, responsibleId
  - `components_tab`: Array of { productId, toConsume, consumed }
  - `miscellaneous`: operationTypeId, source, projectId (String, not ObjectId), notes
  - `status`: draft, confirmed, progress, done, cancel
  - `chatter`: Array of messages
  - `tenantId`: Multi-tenant support
- **Recent Changes**:
  - Changed `projectId` from ObjectId to String for flexibility
  - Added model cache clearing to ensure schema changes take effect

### BillOfMaterial Model

- **Path**: `models\BillOfMaterial.ts`
- **Schema**:
  - `header`: productId (Product ref), bomType (mrp/kit), quantity, reference
  - `components_tab`: Array of { productId (Product ref), quantity }
  - `miscellaneous`: flexibleConsumption, manufLeadTime, prepTime, batchSize
  - `chatter`: Array of messages
  - `active`: Boolean (archived/active status)
  - `tenantId`: Multi-tenant support
- **Purpose**: Defines the recipe for manufacturing products or kits.

### User Model

- **Path**: `models\User.ts`
- **Schema**:
  - `name`, `email`, `role`, `tenantId`.
  - `profileImage`.
  - `active` status.

### JournalEntry Model

- **Path**: `models\JournalEntry.ts`
- **Schema**:
  - `header`: name (Unique), date, ref, journalType (sale/purchase/cash/bank/general).
  - `lineIds`: Array of `JournalLineSchema` (accountId, partnerId, label, debit, credit, taxId, reconciled).
  - `totals`: `MonetarySummarySchema`.
  - `status`: draft, posted, cancel.
  - `chatter`: Array of messages.
  - `tenantId`: Multi-tenant support.
- **Purpose**: The core ledger for all financial movements.

### BankStatement Model

- **Path**: `models\BankStatement.ts`
- **Schema**:
  - `header`: name, journalId (Ref: Account), date, balance_start, balance_end_real.
  - `lineIds`: Array of { date, payment_ref, partnerId, amount, isReconciled }.
  - `status`: open, confirmed.
  - `tenantId`: Multi-tenant support.
- **Purpose**: Workspace for Bank Reconciliation.

### Asset Model

- **Path**: `models\Asset.ts`
- **Schema**:
  - `name`, `purchaseDate`, `originalValue`, `salvageValue`, `method` (linear/degressive), `durationYears`.
  - `accounts`: { assetAccountId, depreciationAccountId }.
  - `status`: draft, running, closed.
  - `chatter`: Array of messages.
  - `tenantId`: Multi-tenant support.
- **Purpose**: Fixed Assets management and depreciation tracking.

## 2. API Routes

### Product APIs

- **Directory**: `app/api/sales/products/`
- **Functionalities**: Full CRUD for products.

### Customer APIs

- **Directory**: `app/api/sales/customers/`
- **Functionalities**: Full CRUD for partners and companies.
- **Response Format**: `{ items: [...] }` (not `{ customers: [...] }`)

### Sale Order APIs

- **Directory**: `app/api/sales/sale-orders/`
- **Base Route**:
  - `GET`: List orders for tenant with status filtering.
  - `POST`: Create new order.
- **Dynamic Route**:
  - `GET`, `PATCH`, `DELETE` for individual orders.

### Pricelist APIs

- **Directory**: `app/api/sales/pricelists/`
- **Functionalities**: Full CRUD for pricelists and their nested rules.

### Accounting APIs

- **Directory**: `app/api/accounting/accounts/`
- **Functionalities**: List and create chart of accounts.

### Invoice APIs

- **Directory**: `app/api/accounting/invoices/`
- **Base Route**:
  - `GET`: List all invoices (tenant filtered).
  - `POST`: Create new custom invoice.
- **Order Integration**: `app/api/accounting/invoices/from-order/`
  - `POST`: Generates a Draft Invoice from a Sale Order.

### Users API

- **Directory**: `app/api/users/`
- **Functionalities**:
  - `GET`: List users for tenant
  - `POST`: Create new user (admin only)
- **Recent Changes**:
  - Added `inventory` role to allowed roles for GET endpoint
  - Response format: `{ users: [...] }`

### Stock Transfer APIs

- **Directory**: `app/api/inventory/operations/transfers/`
- **Base Route**:
  - `GET`: List transfers with type filtering (`?type=incoming` or `?type=outgoing`)
  - `POST`: Create new transfer (auto-generates name like WH/IN/00001)
- **Dynamic Route** (`[id]/route.ts`):
  - `GET`: Get single transfer with populated partnerId and productIds
  - `PATCH`: Update transfer with status transition logic
  - `DELETE`: Delete transfer
- **Status Transition Logic**:
  - **Draft → Assigned**: Creates virtual stock reservations (for outgoing only)
  - **Assigned/Waiting → Done**: Removes reservations, creates actual stock movements
  - **Chatter Processing**:
    - Handles populated authorId objects from GET requests (updates existing messages)
    - Sets authorId from session for new messages
  - **Recent Changes**:
  - Fixed populate to use `header.name` and `contact_details.email` for customers
  - Added reservation logic for "Mark as Todo"
  - Proper chatter authorId extraction from populated objects and session fallback
  - **Populated Authors**:
    - GET and PATCH requests now populate `chatter.authorId` with `name` and `image`
    - Ensures UI displays user names immediately instead of "System"

### Manufacturing Order APIs

- **Directory**: `app/api/inventory/operations/manufacturing/`
- **Base Route**:
  - `GET`: List manufacturing orders for tenant
  - `POST`: Create new order (auto-generates name like WH/MO/00001)
- **Dynamic Route**:
  - `GET`, `PATCH`, `DELETE` for individual orders
- **Status Workflow**: Draft → Confirmed → Progress → Done

### Bill of Materials APIs

- **Directory**: `app/api/manufacturing/bom/`
- **Base Route**:
  - `GET`: List BOMs for tenant
  - `POST`: Create new BOM
- **Dynamic Route**:
  - `GET`, `PATCH`, `DELETE` for individual BOMs
- **Features**:
  - **Sequential Reference**: Frontend logic (not API) calculates next reference, but API validates uniqueness if needed.
  - **Component Validation**: Ensures products exist.

### Finance Reports & Ledger APIs

- **Profit & Loss**: `GET /api/finance/reports/profit-loss`
  - Aggregates Income/Expense journal lines.
- **Balance Sheet**: `GET /api/finance/reports/balance-sheet`
  - Snapshot of Asset/Liability/Equity.
- **General Ledger**: `GET /api/finance/ledger`
  - Flattened view of all posted journal lines.
- **Journal Entries**: `POST /api/finance/journal-entries`
  - Create manual adjustments and list entries.
- **Aged Partner**: `GET /api/finance/reports/aged-partner?type=receivable|payable`
  - Maturity breakdown based on invoice due dates.
- **Bank Reconciliation**:
  - `POST /api/finance/bank/import`: Data ingestion.
  - `PATCH /api/finance/bank/reconcile`: Matching statement lines to journal entries.
- **Assets**:
  - `POST /api/finance/assets`: Register company assets.
  - `POST /api/finance/assets/compute`: Generate depreciation journal entries.

### Stock Levels API

- **Path**: `app/api/inventory/stock/levels/route.ts`
- **Method**: GET
- **Query Params**: `productIds` (comma-separated list)
- **Functionality**:
  - Calculates net stock for multiple products
  - Formula: Total IN - Total OUT (excluding reserved stock)
  - Returns: `{ levels: { productId: number } }`
- **Use Cases**:
  - Manufacturing: Check component availability
  - Deliveries: Verify stock before shipping
  - Real-time stock validation

## 3. Key Backend Logic

### Stock Movement Tracking

**Mark as Todo (Assigned Status)**:

- For outgoing transfers only
- Creates Stock entries with `isReserved: true`
- Reference format: `"WH/OUT/00001 (Reserved)"`
- Prevents over-selling by reserving stock

**Validate (Done Status)**:

- Deletes any existing reservations
- Creates actual Stock movements:
  - `type: "in"` for incoming transfers
  - `type: "out"` for outgoing transfers
  - `isReserved: false`
- Uses `done` quantity if available, otherwise `demand`

### Chatter Message Handling

**Frontend**:

- Sends messages with `authorId: null`
- Now sends `currentUser` details for immediate UI update (optimistic update)
- Prevents BSON casting errors

**Backend (PATCH endpoints)**:

- Checks if `authorId` is a populated object
- Extracts `_id` if object, otherwise uses value
- Sets `session.user.id` if null/undefined
- Returns clean message structure
  - Populates `authorId` with `name` and `image` in response

### Multi-Tenant Support

All models and APIs filter by `tenantId`:

- Automatically set from `session.user.tenantId`
- Fallback to `"default-tenant"` if not set
- Ensures data isolation between organizations

## 4. Recent Fixes & Enhancements

### Customer Model

- Removed duplicate `tenantId` index
- Fixed empty ObjectId field validation

### Stock Transfer

- Fixed customer populate paths
- Added virtual stock reservation system
- Proper chatter authorId handling

### Manufacturing Order

- Changed `projectId` to String type
- Added model cache clearing
- Stock availability checking
  - Added `components` stock level verification
  - Enhanced Chatter with Author Population

### Users API

- Added `inventory` role access
- Consistent with sales/finance permissions

### Finance Summary API

- **Path**: `app\api\finance\summary\route.ts`
- **Method**: GET
- **Authentication**: Requires admin or finance role
- **Features**:
  - **Revenue & Receivables Calculation**:
    - Queries Invoice model with `moveType: "out_invoice"` (Customer Invoices)
    - Calculates current and previous month revenue from posted invoices
    - Computes total receivables from `amountResidual` of posted invoices
    - Identifies overdue receivables based on `dueDate`
  - **Expenses & Payables Calculation**:
    - Queries Invoice model with `moveType: "in_invoice"` (Vendor Bills)
    - Calculates current and previous month expenses from posted bills
    - Computes total payables from `amountResidual` of posted bills
    - Identifies overdue payables based on `dueDate`
  - **Cash Flow Analysis**:
    - Queries Transaction model for current and previous month
    - Separates credit (cash in) and debit (cash out) transactions
    - Uses `baseAmount` field for multi-currency support
    - Calculates net cash flow (inflow - outflow)
  - **Financial Matrices**:
    - **Working Capital**: `receivables.total - payables.total`
    - **Current Ratio**: `receivables.total / payables.total`
    - **Quick Ratio**: Same as current ratio (simplified)
    - **Profit Margin**: `(netIncome / revenue) * 100`
    - **Average Collection Period**: `receivables / (revenue / 30)`
    - **Payables Turnover**: `expenses / payables`
  - **Recent Transactions** (Last 5 of each):
    - **Bills**: Fetches from Invoice model, populates partner name
    - **Invoices**: Fetches customer invoices, populates partner name
    - **Expenses**: Fetches from Expense model, populates employee name
    - **Returns**: Fetches from StockTransfer model with return filters
  - **Optimizations**:
    - Uses `.lean()` for read-only queries (faster performance)
    - Defensive number casting with `Number()` fallbacks
    - Null-safe date comparisons
    - Tenant-isolated queries for multi-tenant support
- **Response Structure**:
  ```json
  {
    "summary": {
      "revenue": { "current": 0, "previous": 0, "change": 0 },
      "expenses": { "current": 0, "previous": 0, "change": 0 },
      "netIncome": { "current": 0, "previous": 0, "change": 0 },
      "cashFlow": { "current": 0, "previous": 0, "change": 0 },
      "accountsReceivable": { "total": 0, "overdue": 0 },
      "accountsPayable": { "total": 0, "overdue": 0 },
      "matrices": {
        "workingCapital": 0,
        "currentRatio": 0,
        "quickRatio": 0,
        "profitMargin": 0,
        "avgCollectionPeriod": 0,
        "payablesTurnover": 0
      },
      "recentTransactions": {
        "bills": [],
        "invoices": [],
        "expenses": [],
        "returns": []
      }
    }
  }
  ```
