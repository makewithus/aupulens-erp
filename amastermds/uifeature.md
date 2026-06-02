# UI Features Documentation

This document outlines the recently developed frontend components and pages for the ERP system.

## 1. Product Management Page

- **Path**: `app\sales\products\page.tsx`
- **Features**:
  - Full CRUD lifecycle (Create, Read, Update, Delete) for products.
  - **View Mode**: A dedicated read-only state for inspecting product details.
  - **Tabbed Interface**: Organized into "General", "Sales", "Prices", and "Accounting" tabs.
  - **Enhanced Popup**:
    - **Nested Modals**: Capabilities to create **Pricelists** and **Accounts** on-the-fly directly from the product popup.
    - **Smart Selectors**: Account and Pricelist selectors with integrated "Add New" buttons.
  - **Draft/Published Workflow**: Supports saving products as drafts or publishing them.

## 2. Quotations & Sale Orders Pages

- **Paths**:
  - `app\sales\quotations\page.tsx`
  - `app\sales\orders\page.tsx`
- **Features**:
  - **Nested Creation**: Create Products, Customers, Pricelists, and Warehouses directly while creating a quotation/order.
  - **Chatter System**:
    - Real-time chat/logging system for each order.
    - **View Mode Support**: Fully functional chat in read-only mode, enabling team collaboration without edit access.
    - **Auto-Refresh**: Optimistic UI updates with automatic background data refresh after sending messages.
  - **Invoice Integration**:
    - **Create Invoice**: One-click generation of Draft Invoices from Quotations/Orders.
    - **View/Print**: Built-in PDF preview and printing support.
    - **Status Tracking**: Logic to enable/disable invoice creation based on status (e.g., Draft/Sent vs Cancelled).
  - **Safety Features**:
    - **Delete with Confirmation**: ModularModal popup confirmation for deletion to prevent accidental data loss.

## 3. Inventory Operations Pages

### Receipts Page (Incoming Transfers)

- **Path**: `app\inventory\operations\receipts\page.tsx`
- **Features**:
  - **Resource Management**: Fetches and manages partners, products, and users
  - **Customer Selection**: SelectSearchAdd component with inline customer creation
  - **User Assignment**: Responsible field with searchable user dropdown
  - **Status Workflow**: Draft → Assigned (Todo) → Done (Validated)
  - **Return Functionality**: Create return transfers from completed receipts
  - **80vw Modal**: Wide popup for better data visibility
  - **Proper Mapping**: Handles nested customer data (header.name)

### Deliveries Page (Outgoing Transfers)

- **Path**: `app\inventory\operations\deliveries\page.tsx`
- **Features**:
  - **Stock Availability**: Real-time stock checking for outgoing products
  - **Visual Indicators**: Green "Available" / Red "Insufficient" badges
  - **Customer Selection**: Same enhanced selection as Receipts
  - **Virtual Stock Reservations**: "Check Availability" creates reserved stock entries
  - **Validation Logic**: Removes reservations and creates actual stock movements
  - **Return Functionality**: Create return receipts from completed deliveries

### Manufacturing Orders Page

- **Path**: `app\inventory\operations\manufacturing\page.tsx`
- **Features**:
  - **Component Management**: Add/remove components with quantities
  - **Stock Availability**: Real-time checking for all components
  - **User Assignment**: SelectSearchAdd for responsible user
  - **Pre-filled Fields**: Operation Type defaults to "Manufacturing"
  - **Status Workflow**: Draft → Confirmed → Done
  - **Component Tracking**: "To Consume" vs "Consumed" quantities
  - **Summary Panel**: Shows component availability at a glance

## 4. Stock Transfer Popup

- **Path**: `app\inventory\operations\popups\StockTransferPopup.tsx`
- **Features**:
  - **Unified Component**: Used by both Receipts and Deliveries
  - **SelectSearchAdd Integration**: For partners and users
  - **Customer Creation**: Inline creation via popup
  - **Stock Availability**: Shows for outgoing transfers only
    - **Chatter Integration**:
      - Fixed authorId handling (null → backend sets)
      - Optimistic updates using `currentUser`
      - Automatic list refresh via `onRefresh` callback
  - **Sales-Style Layout**: Two-column with summary panel
  - **80vh Height**: Scrollable content area

## 5. Manufacturing Order Popup

- **Path**: `app\inventory\operations\popups\ManufacturingOrderPopup.tsx`
- **Features**:
  - **Component Availability Section**: Shows stock for each component
  - **Visual Feedback**: Need vs Stock with availability badges
  - **Auto-refresh**: Stock levels update when components change
  - **User Selection**: SelectSearchAdd for responsible field
  - **Summary Panel**: Real-time stats and availability

## 6. Bill of Material Popup

- **Path**: `app\inventory\operations\popups\BillOfMaterialPopup.tsx`
- **Features**:
  - **Tabs System**: Organized components and miscellaneous settings.
  - **SelectSearchAdd Integration**:
    - For adding products (header).
    - **Inline Product Creation**: Create new products directly from the component selection dropdown.
  - **Smart Reference**:
    - **Sequential Generation**: Auto-fills `BOM/00X` for new records.
    - **Dynamic Update**: Replaces default reference with `BOM - [Product Name]` upon product selection.
  - **Chatter System**: Integrated real-time commenting.
  - **Responsive Design**: Consistent with other inventory popups (80vh height).

## 13. Manufacturing Products Page

- **Path**: `app\manufacturing\products\page.tsx`
- **Features**:
  - **Mirror of Sales Products**: Provides full product management capabilities within the Manufacturing module.
  - **Enhanced Table UI**:
    - **Product Icons**: Visual differentiation for products.
    - **Status Badges**: Clear Draft vs Published indicators.
    - **Hover Actions**: Clean interface with View (Eye), Edit (Edit3), and Delete (Trash2) buttons appearing on hover.
  - **Reuse of Components**: Utilizes the standard `ProductPopupContent` and `ModularModal` for consistency.

## 14. Bill of Materials Page

- **Path**: `app\manufacturing\bom\page.tsx`
- **Features**:
  - **Refined Table Layout**: Matches the "Product Catalog" design with consistent columns and styling.
  - **Action Icons**: Uses standard Eye, Edit3, and Trash2 icons for actions.
  - **Sequential Logic**: Calculates the next available reference number based on current count.
  - **Filter & Search**: Search by product name or reference.

## 7. ModularModal Component

- **Path**: `components\dashboard\ModularModal.tsx`
- **Features**:
  - Reusable wrapper for standard Shadcn UI Dialogs.
  - **Fixed Header & Footer**: Ensures action buttons and titles are always visible during scrolling.
  - **Premium Aesthetics**: Integrated "youtube-style" scrollbar and consistent padding.
  - Custom `contentClassName` support for flexible sizing.
  - **80vw Support**: Wide modals for complex forms

## 8. SelectSearchAdd Component

- **Path**: `components\dashboard\SelectSearchAdd.tsx`
- **Features**:
  - Searchable combobox for selecting items (customers, users, products, etc.)
  - **Inline Creation**: Includes an "Add New" button that triggers a creation dialog on-the-fly.
  - **Context-Aware**: Automatically switches to the newly created item after successful addition.
  - **Search by Code**: Supports searching by secondary field (email, code, etc.)

## 9. Notifications (Sonner)

- **Path**: `components\ui\sonner.tsx`
- **Path**: `components\providers\ToastRoot.tsx`
- **Features**:
  - Replaced default toast with high-performance `sonner` notifications.
  - Styled for success, error, and loading states.

## 10. Customer Management Page

- **Path**: `app\sales\customers\page.tsx`
- **Features**:
  - CRUD for Individuals and Companies.
  - **Company/Individual Toggle**: Dynamically adjusts available fields (e.g., Parent Company).
  - **Comprehensive Tabs**: "Address", "Sales & Purchase", and "Accounting" (linked to COA).
  - **View Mode**: Full inspection of customer records.

## 11. Invoices Page (Pro Forma & Custom)

- **Path**: `app\sales\proforma-invoices\page.tsx`
- **Features**:
  - **Unified Invoice Management**: Browse, Search, and Filter all invoices (Generated from Orders + Custom).
  - **Create Custom Invoice**: Ability to create standalone invoices (not linked to an order) with full Customer selection support.
  - **Live Preview**: Real-time invoice template visualization while editing.
  - **Print Support**: Dedicated print layout opening in a new tab.

## 12. Stock Levels API

- **Path**: `app\api\inventory\stock\levels\route.ts`
- **Features**:
  - **Batch Query**: Accepts multiple product IDs via query parameter
  - **Net Stock Calculation**: Sums IN movements, subtracts OUT movements
  - **Excludes Reservations**: Only counts actual stock, not virtual reservations
  - **Returns Object**: `{ levels: { productId: stockLevel } }`

## 15. Finance Summary Dashboard

- **Path**: `app\finance\summary\page.tsx`
- **API**: `app\api\finance\summary\route.ts`
- **Features**:
  - **Real-time Financial Overview**: Comprehensive dashboard displaying key financial metrics and health indicators.
  - **Main Metrics Grid** (4 cards):
    - **Total Revenue**: Current month revenue with percentage change from previous month.
    - **Total Expenses**: Current month expenses with trend indicators.
    - **Net Income**: Profit/loss calculation with visual change indicators.
    - **Cash Flow**: Transaction-based cash flow analysis.
  - **Financial Matrices** (6 key indicators):
    - **Working Capital**: Receivables - Payables calculation.
    - **Current Ratio**: Liquidity health index (Receivables/Payables).
    - **Quick Ratio**: Immediate liquidity measure.
    - **Profit Margin**: Net income as percentage of revenue.
    - **Average Collection Period**: Days to collect receivables.
    - **Payables Turnover**: Payment efficiency ratio.
  - **Recent Activity Section** (4 transaction types):
    - **Recent Vendor Bills**: Last 5 bills with partner, amount, and state.
    - **Recent Customer Invoices**: Last 5 invoices with customer details.
    - **Recent Employee Expenses**: Last 5 expenses with employee and approval status.
    - **Recent Returns**: Last 5 return documents with status.
  - **Interactive Features**:
    - Click any transaction card to navigate to the respective module page.
    - Color-coded status badges (posted/draft, approved/rejected, done/pending).
    - Hover effects for enhanced UX.
    - Empty state messages when no transactions exist.
  - **Data Integration**:
    - Pulls from unified Invoice model (moveType: 'out_invoice' for revenue, 'in_invoice' for expenses).
    - Integrates with Transaction model for cash flow analysis.
    - Fetches from Expense and StockTransfer models for recent activity.
    - Tenant-isolated data queries for multi-tenant support.
  - **Visual Design**:
    - Premium ERP aesthetic with high-density information display.
    - Dynamic progress bars for debt health visualization.
    - Responsive grid layouts (3 columns for matrices, 2 columns for transactions).
    - Consistent with `none-xl`, `none-3xl`, and `none-4xl` design system.

## Key Design Patterns

### Resource Fetching

- All operation pages fetch resources (partners, products, users) on mount
- Resources passed as props to popups
- Auto-refresh after creating new resources

### Stock Availability

- Manufacturing: Shows component availability
- Deliveries: Shows product availability (outgoing only)
- Receipts: No stock check needed (incoming)
- Visual badges: Green "Available" / Red "Insufficient"

### Chatter Integration

- Fixed authorId handling: Frontend sends `null`, backend sets from session
- Handles populated user objects when editing existing records
- Prevents BSON casting errors
  - **Optimistic UI**: Sends `currentUser` to popup for immediate name display
  - **Author Population**: Backend now populates author details for historical messages

### Modal Consistency

- All operation popups use 80vw width (`max-w-[1400px]`)
- Two-column layout: Form (left) + Summary (right)
- 80vh height with scrollable content
- Follows Sales module patterns
