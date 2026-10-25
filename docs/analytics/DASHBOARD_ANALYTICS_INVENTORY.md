# Aupulens ERP — Complete Dashboard & Analytics Route Inventory

**Generated:** 2026-10-25  
**Branch:** `dashboard-analytics-optimization`  
**Base Commit:** Current HEAD on `main`  
**Scope:** Complete inventory of all enabled module dashboard, analytics, KPI, chart, and reporting routes.

---

## 1. Inventory Summary by Module

| Module | UI Dashboard Routes | UI Analytics Routes | Reporting / Special Routes | Backend API Routes |
| :--- | :--- | :--- | :--- | :--- |
| **Sales** | `/sales/dashboard` | `/sales/analytics` | `/sales/pipeline`, `/sales/summary`, `/sales/visualization` | `/api/sales/summary`, `/api/sales/analytics`, `/api/sales/pipeline`, `/api/sales/orders`, `/api/sales/invoices` |
| **Inventory & Warehouse** | `/inventory/dashboard` | `/inventory/analytics` | `/inventory/alerts`, `/inventory/warehouse`, `/inventory/stock-moves`, `/inventory/summary` | `/api/inventory/summary`, `/api/inventory/analytics`, `/api/inventory/alerts`, `/api/inventory/warehouse`, `/api/inventory/stock-moves`, `/api/inventory/orders` |
| **Finance & Accounting** | `/finance/summary`, `/finance/dashboard` | `/finance/analytics` | `/finance/receivables`, `/finance/payables`, `/finance/accounting/profit-loss`, `/finance/accounting/balance-sheet`, `/finance/accounting/trial-balance`, `/finance/accounting/aged-partner`, `/finance/gst` | `/api/finance/summary`, `/api/finance/analytics`, `/api/finance/reports/p-l`, `/api/finance/reports/balance-sheet`, `/api/finance/reports/trial-balance`, `/api/finance/reports/aged`, `/api/finance/reports/gst`, `/api/finance/invoices`, `/api/finance/bills` |
| **HR & Payroll** | `/hr/dashboard` | `/hr/analytics` | `/hr/attendance`, `/hr/leave`, `/hr/payroll`, `/hr/performance`, `/hr/reports` | `/api/hr/summary`, `/api/hr/analytics`, `/api/hr/employees`, `/api/hr/attendance`, `/api/hr/leave`, `/api/hr/payroll` |
| **CRM** | `/crm/dashboard` | `/crm/analytics` | `/crm/pipeline`, `/crm/ai/dashboard`, `/crm/campaigns/dashboard`, `/crm/reports` | `/api/crm/pipeline/analytics`, `/api/crm/health`, `/api/crm/churn`, `/api/crm/renewals`, `/api/crm/expansion`, `/api/crm/ai/dashboard`, `/api/crm/reports/roi`, `/api/crm/reports/campaigns` |
| **Manufacturing** | `/manufacturing/dashboard` | `/manufacturing/analytics` | `/manufacturing/shipments`, `/manufacturing/reports` | `/api/manufacturing/summary`, `/api/manufacturing/analytics`, `/api/manufacturing/bom`, `/api/manufacturing/items`, `/api/manufacturing/shipments` |
| **Purchases & Suppliers** | `/finance/purchase-orders` | `/finance/bills` | `/admin/vendors` | `/api/finance/purchase-orders`, `/api/finance/bills`, `/api/admin/vendors` |
| **Projects & Tasks** | `/projects/dashboard` | `/projects` | `/admin/tasks` | `/api/projects`, `/api/projects/[id]`, `/api/admin/tasks` |
| **Admin & Platform** | `/admin/dashboard`, `/platform/(app)` | `/admin/analytics`, `/platform/(app)/api-monitoring` | `/admin/billing`, `/admin/ai-studio`, `/admin/business-twin` | `/api/admin/dashboard`, `/api/admin/ai-usage`, `/api/admin/business-health`, `/api/platform/dashboard/summary`, `/api/platform/api-monitoring` |

---

## 2. Detailed Route Inventory

### 2.1 Sales Module
- **Route:** `/sales/dashboard` (`app/sales/dashboard/page.tsx`)
  - **KPIs:** Net Revenue, Revenue Growth MoM, Open Pipeline Value, Open Quotes Count, Average Order Value, AOV Change %, Q2C Conversion Rate %, Active Subscriptions ARR.
  - **Visualizations:** Channel Distribution (Pie), Revenue Pipeline (Line), Monthly Revenue vs Target (Bar).
  - **Data Source:** `/api/sales/summary`, `/api/sales/analytics`, `/api/sales/pipeline`.
- **Route:** `/sales/analytics` (`app/sales/analytics/page.tsx`)
  - **KPIs:** Total Orders, Total Quotations, Total Revenue, Deliveries Pending.
  - **Visualizations:** Monthly Orders vs Revenue (Composed), Top Products by Volume (Bar), Daily Order Activity (Brick Bar).
  - **Data Source:** `/api/sales/summary`, `/api/sales/analytics`.
- **Route:** `/sales/pipeline` (`app/sales/pipeline/page.tsx`)
  - **KPIs:** Total Pipeline Value, Active Stage Deal Counts, Stage Conversion %.
  - **Visualizations:** Kanban Pipeline Boards with stage aggregations.
  - **Data Source:** `/api/sales/pipeline`.

### 2.2 Inventory & Warehousing Module
- **Route:** `/inventory/dashboard` (`app/inventory/dashboard/page.tsx`)
  - **KPIs:** Total Inventory Valuation, Valuation MoM Change %, Active SKUs, In-Stock Rate %, Warehouse Capacity %, Low Stock Items, Out of Stock Items, Stock Turnover Ratio, Inbound Today, Outbound Today.
  - **Visualizations:** Valuation by Category (Canvas Pie), Daily Stock Movement (Brick Bar), Warehouse Capacity Utilization (Bar).
  - **Data Source:** `/api/inventory/summary`, `/api/inventory/analytics`, `/api/inventory/warehouse`.
- **Route:** `/inventory/analytics` (`app/inventory/analytics/page.tsx`)
  - **KPIs:** Warehouse Counts, Total Stocked Items, Active Batches, Open Inbound/Outbound Orders.
  - **Visualizations:** Stock Category Breakdown (Pie), Monthly Inbound vs Outbound (Composed), Warehouse Utilization (Bar).
  - **Data Source:** `/api/inventory/warehouse`, `/api/inventory/stock`, `/api/inventory/batch`, `/api/inventory/orders`, `/api/inventory/stock-moves`.
- **Route:** `/inventory/alerts` (`app/inventory/alerts/page.tsx`)
  - **KPIs:** Low stock count, Out of stock count, Reorder points triggered.
  - **Data Source:** `/api/inventory/alerts`.

### 2.3 Finance & Accounting Module
- **Route:** `/finance/summary` (`app/finance/summary/page.tsx` - Primary Overview Dashboard)
  - **KPIs:** All-time & Month-to-date Revenue, Operating Expenses, Net Income, Liquid Cash Flow, Accounts Receivable (Total & Overdue), Accounts Payable (Total & Overdue), Working Capital, Current Ratio, Quick Ratio, Profit Margin %, Operating Margin %, Cash Runway (months), EBITDA, Collection Period.
  - **Visualizations:** Expense Breakdown (Canvas Pie), Monthly Performance (Revenue vs Expenses Composed), Daily Cash Flow (Trading Line Chart), Receivables Aging Buckets (0-30, 31-60, 61-90, 90+ days).
  - **Data Source:** `/api/finance/summary` (authoritatively computed from MongoDB posted ledger).
- **Route:** `/finance/analytics` (`app/finance/analytics/page.tsx`)
  - **KPIs:** Monthly Cash Inflow, Cash Outflow, Operating Burn Rate, Cash Velocity.
  - **Visualizations:** Revenue vs Expense Trends, Cash Flow Projection.
  - **Data Source:** `/api/finance/analytics`.
- **Route:** `/finance/accounting/profit-loss` (`app/finance/accounting/profit-loss/page.tsx`)
  - **Financial Statement:** Authoritative Income Statement (Operating Revenue, Cost of Goods Sold, Gross Profit, Operating Expenses, Operating Income, Net Income).
  - **Data Source:** `/api/finance/reports/p-l`.
- **Route:** `/finance/accounting/balance-sheet` (`app/finance/accounting/balance-sheet/page.tsx`)
  - **Financial Statement:** Authoritative Balance Sheet (Current Assets, Non-Current Assets, Current Liabilities, Long-Term Liabilities, Equity, Retained Earnings).
  - **Data Source:** `/api/finance/reports/balance-sheet`.
- **Route:** `/finance/accounting/trial-balance` (`app/finance/accounting/trial-balance/page.tsx`)
  - **Financial Statement:** Trial Balance (Account Code, Account Name, Debit Balance, Credit Balance, Net Balance Verification).
  - **Data Source:** `/api/finance/reports/trial-balance`.
- **Route:** `/finance/receivables` (`app/finance/receivables/page.tsx`)
  - **Operational Aging:** Open Customer Invoices, Aging Buckets, Overdue Amount, Customer Credit Balances.
  - **Data Source:** `/api/finance/reports/aged?type=receivable`.
- **Route:** `/finance/payables` (`app/finance/payables/page.tsx`)
  - **Operational Aging:** Unpaid Vendor Bills, Aging Buckets, Overdue Amount, Payment Schedules.
  - **Data Source:** `/api/finance/reports/aged?type=payable`.

### 2.4 HR & Payroll Module
- **Route:** `/hr/dashboard` (`app/hr/dashboard/page.tsx`)
  - **KPIs:** Total Headcount, Active Employees, On Leave Today, Today's Attendance %, Monthly Net Payroll, Department Count.
  - **Visualizations:** Department Headcount Distribution (Pie), Weekly Attendance Rate (Bar).
  - **Data Source:** `/api/hr/summary`.
- **Route:** `/hr/analytics` (`app/hr/analytics/page.tsx`)
  - **KPIs:** Headcount Growth MoM, Attrition Rate %, Average Tenure, Leave Utilization %.
  - **Visualizations:** Monthly Headcount Trends (Line), Department Cost Allocation (Bar), Leave Type Breakdown (Pie).
  - **Data Source:** `/api/hr/analytics`.

### 2.5 CRM Module
- **Route:** `/crm/dashboard` (`app/crm/dashboard/page.tsx`)
  - **KPIs:** Total Leads, Active Accounts, Open Opportunities, Total Pipeline Value, Overall Win Rate %, Projected ARR.
  - **Visualizations:** Opportunity Funnel (Stages), Monthly Pipeline Velocity (Bar), Stage Win/Loss Distribution.
  - **Data Source:** `/api/crm/pipeline/analytics`, `/api/crm/health`.
- **Route:** `/crm/analytics` (`app/crm/analytics/page.tsx`)
  - **KPIs:** Pipeline Value, Active Deals, Won Deals, Lost Deals, Win Rate %, Average Sales Cycle (Days), Average Deal Size, Projected ARR, Total Accounts, Total Leads.
  - **Visualizations:** Lead Qualification Funnel (Bar), Monthly Deal Velocity (Composed), Win/Loss Ratio.
  - **Data Source:** `/api/crm/analytics`, `/api/crm/pipeline/analytics`.
- **Route:** `/crm/ai/dashboard` (`app/crm/ai/dashboard/page.tsx`)
  - **KPIs:** High Churn Risk Accounts, Upcoming Contract Renewals, Expansion ARR Pipeline, Account Health Distribution.
  - **Visualizations:** Churn Risk Scatter/Bar, Upcoming Renewals Timeline, Account Health Distribution Pie.
  - **Data Source:** `/api/crm/churn`, `/api/crm/renewals`, `/api/crm/expansion`, `/api/crm/health`.

### 2.6 Manufacturing Module
- **Route:** `/manufacturing/dashboard` (`app/manufacturing/dashboard/page.tsx`)
  - **KPIs:** Total Production Output, In-Production Units, Active BOMs, Total Shipments in Transit, Overall OEE %.
  - **Visualizations:** Daily Production Output (Bar), Work Order Status Distribution (Pie).
  - **Data Source:** `/api/manufacturing/summary`.
- **Route:** `/manufacturing/analytics` (`app/manufacturing/analytics/page.tsx`)
  - **KPIs:** Overall OEE %, Availability %, Performance %, Quality Rate %, Total Production Output, In-Production Units, On-Time Dispatch Rate %, QC First-Pass Yield %.
  - **Visualizations:** Daily Output vs Target (Composed), Defect / Scrap Volume (Bar), Logistics Shipment Breakdown (Pie).
  - **Data Source:** `/api/manufacturing/analytics`.

### 2.7 Purchases & Suppliers (Procurement)
- **Route:** `/finance/purchase-orders` (`app/finance/purchase-orders/page.tsx`)
  - **KPIs:** Total Purchase Orders, Pending Receipt, Billed Amount, Total Spend.
  - **Data Source:** `/api/finance/purchase-orders`.
- **Route:** `/finance/bills` (`app/finance/bills/page.tsx`)
  - **KPIs:** Total Bills, Unpaid Bills, Overdue Vendor Liabilities.
  - **Data Source:** `/api/finance/bills`.
- **Route:** `/admin/vendors` (`app/admin/vendors/page.tsx`)
  - **KPIs:** Active Suppliers, Average On-Time Delivery Rate, Total Vendor Spend.
  - **Data Source:** `/api/admin/vendors`.

### 2.8 Projects & Tasks
- **Route:** `/projects/dashboard` (`app/projects/dashboard/page.tsx`)
  - **KPIs:** Total Projects, Active Tasks, Completed Tasks, Resource Allocation %, Budget Variance.
  - **Visualizations:** Project Phase Distribution (Pie), Weekly Task Velocity (Bar).
  - **Data Source:** `/api/projects`.

### 2.9 Admin, Organization & AI Usage
- **Route:** `/admin/dashboard` (`app/admin/dashboard/page.tsx`)
  - **KPIs:** Total Organization Users, Active Sessions, AI Credits Used, Storage Used, System Health Status.
  - **Visualizations:** 30-day User Activity (Line), AI Credit Utilization (Bar), Module Usage Breakdown (Pie).
  - **Data Source:** `/api/admin/dashboard`, `/api/admin/ai-usage`.
- **Route:** `/admin/analytics` (`app/admin/analytics/page.tsx`)
  - **KPIs:** User Engagement, Audit Activity Frequency, Session Duration.
  - **Visualizations:** Activity Timeline, Security Event Distribution.
  - **Data Source:** `/api/admin/dashboard`, `/api/users/analytics`.
- **Route:** `/platform/(app)` (`app/platform/(app)/page.tsx`)
  - **KPIs:** Total Organizations, Total Platform ARR/MRR, Active Subscriptions, Platform System Load.
  - **Data Source:** `/api/platform/dashboard/summary`.
