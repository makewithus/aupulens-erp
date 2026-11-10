# Resource Optimization — Query Reconciliation

## Verdict: **INCOMPLETE — the pagination/aggregation phase was not implemented.**

| | Base `f38af917` | HEAD `e20680af` |
|---|---|---|
| `Model.find(...)` calls in `app/api/**` (my scan) | 355 | 355 |
| …without `.limit()` | **266** | **266** |
| …without `.limit()` and without `.lean()` | 50 | 45 |
| Queries given pagination | — | **0** |
| Queries converted to aggregation | — | **0** |
| Queries given `.lean()` | — | 5 unbounded (+3 already `.limit(10)` in `finance/ai`) |

Changed query sites (all `.lean()` only; no result-size change, no tenant/auth change):
`finance/accounting/account-types:31`, `accountants:30`, `accounts/export:26`, `accounts/import:32`, `accounts/import/execute:48`, `finance/ai:50,91,100`. `hr/departments` and `banking-rules` only got a cache header (their queries were untouched).

## Method and why 266 ≠ 298
The baseline's 298 / 164 / 76 / 15 / 43 split is stated in prose only; **no per-query inventory file exists** in the repo or `AUDIT_REPORTS/`, so a line-by-line comparison against it is impossible. I regenerated an inventory by scanning for `CapitalisedModel.find(` followed by no `.limit(` in the same statement (regex, ~900 chars). That yields 266 (different counting rules — e.g. it ignores `.find` on non-capitalised or aliased models and multi-line `limit` outside the window). The classes below are **path-based heuristics**, not a manual review, and must not be read as a re-derivation of 164/76/15/43:

| Heuristic class | Count | Meaning |
|---|---|---|
| A/B-list | 162 | ordinary list/lookup route; pagination candidate (A vs B undecided) |
| C-export | 11 | path contains `export`; **complete dataset intentional** — matches baseline's "11 export routes" |
| C?-financial/reconciliation | 10 | ledger/journal/tax/period/payroll paths; probably must stay complete, needs per-query review |
| D?-aggregation | 66 | overview/summary/report/analytics paths or `.reduce(` in a GET; aggregation candidate |
| E-background/batch | 17 | cron/scheduler/worker/migration; needs cursor/streaming, not offset pages |

Per-query columns requested by the task and what could/could not be established:
- **File:line, model, changed?, hydration:** established for all 266 (table below).
- **Tenant scoping:** only a *signal* (does the statement text contain `tenantId`/tenant/scope). 101 of 266 statements show no such token in the matched window. This is **not** evidence of a leak (scoping is often applied in a previous `query` object or via `applyDemoScope`); each needs a manual check. No code in this branch changed scoping.
- **Query purpose, existing pagination, maximum result size, memory/CPU:** not derivable by regex. Max size is bounded only by tenant collection size (unbounded in the code). Estimates would be fabrication; none are given.
- **Intentional full dataset:** only for the 11 exports (and the 10 financial-class candidates pending review). Do **not** add `.limit()` to those; financial exports and reconciliation must stay complete.

## Required follow-up (not started)
1. Persist a reviewed inventory (this table + manual purpose/size/scope columns).
2. Paginate class A (cursor-based, with a total-count strategy and UI changes — these are API contract changes, so every client page needs updating).
3. Replace class D candidates with `$group`/`$facet` pipelines, verifying numerics against the old output.
4. Stream or cursor-batch class E.
5. Leave class C untouched.

## Table (266 unbounded `find()` call sites at HEAD)
| # | File:line | Model | Heuristic class | Changed? | Hydration | Tenant scope signal |
|---|---|---|---|---|---|---|
| 1 | `app/api/projects/route.ts:32` | Project | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 2 | `app/api/platform/billing/upgrades/route.ts:52` | BillingPayment | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 3 | `app/api/platform/billing/export/route.ts:50` | BillingPayment | C-export (complete dataset intentional) | no | lean | NO tenant token in stmt (verify) |
| 4 | `app/api/platform/billing/subscriptions/route.ts:34` | SaaSSubscription | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 5 | `app/api/platform/billing/overview/route.ts:44` | SaaSSubscription | D?-aggregation candidate | no | lean | NO tenant token in stmt (verify) |
| 6 | `app/api/platform/billing/overview/route.ts:61` | BillingPayment | D?-aggregation candidate | no | lean | NO tenant token in stmt (verify) |
| 7 | `app/api/platform/billing/overview/route.ts:94` | SubscriptionEvent | D?-aggregation candidate | no | lean | NO tenant token in stmt (verify) |
| 8 | `app/api/platform/billing/overview/route.ts:100` | BillingPayment | D?-aggregation candidate | no | lean | NO tenant token in stmt (verify) |
| 9 | `app/api/platform/billing/overview/route.ts:108` | BillingPayment | D?-aggregation candidate | no | lean | NO tenant token in stmt (verify) |
| 10 | `app/api/platform/billing/overview/route.ts:142` | BillingPayment | D?-aggregation candidate | no | lean | NO tenant token in stmt (verify) |
| 11 | `app/api/platform/retention-policies/route.ts:20` | RetentionPolicy | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 12 | `app/api/platform/plans/route.ts:20` | Plan | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 13 | `app/api/hr/analytics/route.ts:123` | Department | D?-aggregation candidate | no | lean | token present |
| 14 | `app/api/hr/performance/route.ts:18` | PerformanceReview | A/B-list (pagination candidate) | no | lean | token present |
| 15 | `app/api/hr/chat-history/route.ts:33` | ChatHistory | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 16 | `app/api/hr/departments/route.ts:51` | Department | A/B-list (pagination candidate) | no | lean | token present |
| 17 | `app/api/hr/departments/[id]/route.ts:122` | Employee | A/B-list (pagination candidate) | no | lean | token present |
| 18 | `app/api/hr/departments/[id]/route.ts:167` | Employee | A/B-list (pagination candidate) | no | lean | token present |
| 19 | `app/api/hr/employees/route.ts:72` | Department | A/B-list (pagination candidate) | no | lean | token present |
| 20 | `app/api/hr/employees/route.ts:163` | Employee | A/B-list (pagination candidate) | no | lean | token present |
| 21 | `app/api/hr/summary/route.ts:135` | Department | D?-aggregation candidate | no | lean | token present |
| 22 | `app/api/hr/reports/export/route.ts:65` | Department | C-export (complete dataset intentional) | no | lean | token present |
| 23 | `app/api/hr/reports/export/route.ts:119` | Payroll | C-export (complete dataset intentional) | no | lean | token present |
| 24 | `app/api/hr/reports/export/route.ts:139` | Employee | C-export (complete dataset intentional) | no | lean | token present |
| 25 | `app/api/hr/reports/export/route.ts:154` | Employee | C-export (complete dataset intentional) | no | lean | token present |
| 26 | `app/api/hr/attendance/route.ts:90` | Employee | A/B-list (pagination candidate) | no | hydrated doc | token present |
| 27 | `app/api/hr/attendance/route.ts:97` | Attendance | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 28 | `app/api/hr/leave/route.ts:59` | Employee | A/B-list (pagination candidate) | no | hydrated doc | token present |
| 29 | `app/api/hr/payroll/route.ts:40` | Payroll | C?-financial/reconciliation (complete dataset likely required; needs per-query review) | no | lean | NO tenant token in stmt (verify) |
| 30 | `app/api/hr/payroll/route.ts:108` | Employee | C?-financial/reconciliation (complete dataset likely required; needs per-query review) | no | lean | NO tenant token in stmt (verify) |
| 31 | `app/api/hr/payroll/[id]/route.ts:142` | Employee | C?-financial/reconciliation (complete dataset likely required; needs per-query review) | no | lean | NO tenant token in stmt (verify) |
| 32 | `app/api/hr/payroll/[id]/route.ts:152` | Attendance | C?-financial/reconciliation (complete dataset likely required; needs per-query review) | no | lean | token present |
| 33 | `app/api/finance/expenses/route.ts:39` | Expense | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 34 | `app/api/finance/chat-history/route.ts:38` | ChatHistory | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 35 | `app/api/finance/journal-items/route.ts:42` | JournalEntry | C?-financial/reconciliation (complete dataset likely required; needs per-query review) | no | lean | NO tenant token in stmt (verify) |
| 36 | `app/api/finance/purchase-orders/route.ts:42` | Customer | D?-aggregation candidate | no | lean | token present |
| 37 | `app/api/finance/purchase-orders/route.ts:65` | PurchaseOrder | D?-aggregation candidate | no | hydrated doc | NO tenant token in stmt (verify) |
| 38 | `app/api/finance/purchase-orders/[id]/receive/route.ts:129` | Product | A/B-list (pagination candidate) | no | lean | token present |
| 39 | `app/api/finance/purchase-orders/[id]/receive/route.ts:238` | Invoice | A/B-list (pagination candidate) | no | hydrated doc | token present |
| 40 | `app/api/finance/accounting/account-types/route.ts:31` | AccountType | A/B-list (pagination candidate) | YES (.lean only) | lean | token present |
| 41 | `app/api/finance/accounting/bank-feed-providers/route.ts:15` | BankFeedProvider | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 42 | `app/api/finance/accounting/transaction-locks/route.ts:15` | TransactionLock | A/B-list (pagination candidate) | no | lean | token present |
| 43 | `app/api/finance/accounting/accountants/route.ts:30` | Accountant | A/B-list (pagination candidate) | YES (.lean only) | lean | NO tenant token in stmt (verify) |
| 44 | `app/api/finance/accounting/tax-rates/route.ts:26` | TaxRate | C?-financial/reconciliation (complete dataset likely required; needs per-query review) | no | lean | NO tenant token in stmt (verify) |
| 45 | `app/api/finance/accounting/budgets/route.ts:14` | Budget | A/B-list (pagination candidate) | no | lean | token present |
| 46 | `app/api/finance/accounting/accounts/route.ts:35` | Account | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 47 | `app/api/finance/accounting/accounts/export/route.ts:26` | Account | C-export (complete dataset intentional) | YES (.lean only) | lean | NO tenant token in stmt (verify) |
| 48 | `app/api/finance/accounting/accounts/import/route.ts:32` | AccountType | A/B-list (pagination candidate) | YES (.lean only) | lean | token present |
| 49 | `app/api/finance/accounting/accounts/import/execute/route.ts:48` | AccountType | A/B-list (pagination candidate) | YES (.lean only) | lean | token present |
| 50 | `app/api/finance/accounting/journal-templates/route.ts:14` | JournalTemplate | C?-financial/reconciliation (complete dataset likely required; needs per-query review) | no | lean | token present |
| 51 | `app/api/finance/accounting/currency-adjustments/route.ts:68` | CurrencyAdjustment | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 52 | `app/api/finance/accounting/currency-adjustments/route.ts:105` | BankAccount | A/B-list (pagination candidate) | no | lean | token present |
| 53 | `app/api/finance/accounting/custom-fields/route.ts:20` | CustomField | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 54 | `app/api/finance/accounting/bank-accounts/route.ts:18` | BankAccount | A/B-list (pagination candidate) | no | lean | token present |
| 55 | `app/api/finance/accounting/banking-rules/route.ts:21` | BankingRule | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 56 | `app/api/finance/visualization/route.ts:107` | Invoice | D?-aggregation candidate | no | lean | token present |
| 57 | `app/api/finance/visualization/route.ts:108` | Invoice | D?-aggregation candidate | no | lean | token present |
| 58 | `app/api/finance/visualization/route.ts:147` | Invoice | D?-aggregation candidate | no | lean | token present |
| 59 | `app/api/finance/visualization/route.ts:165` | Invoice | D?-aggregation candidate | no | lean | token present |
| 60 | `app/api/finance/visualization/route.ts:183` | Invoice | D?-aggregation candidate | no | lean | token present |
| 61 | `app/api/finance/visualization/route.ts:214` | Invoice | D?-aggregation candidate | no | lean | token present |
| 62 | `app/api/finance/visualization/route.ts:246` | Asset | D?-aggregation candidate | no | lean | token present |
| 63 | `app/api/finance/visualization/route.ts:262` | Asset | D?-aggregation candidate | no | lean | token present |
| 64 | `app/api/finance/visualization/route.ts:291` | BankReconciliation | D?-aggregation candidate | no | lean | token present |
| 65 | `app/api/finance/bank/statements/route.ts:29` | BankStatement | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 66 | `app/api/finance/reports/gst/route.ts:30` | SalesInvoice | C?-financial/reconciliation (complete dataset likely required; needs per-query review) | no | lean | token present |
| 67 | `app/api/finance/period-closing/route.ts:21` | PeriodClosing | C?-financial/reconciliation (complete dataset likely required; needs per-query review) | no | lean | token present |
| 68 | `app/api/finance/reconciliation/route.ts:47` | BankReconciliation | C?-financial/reconciliation (complete dataset likely required; needs per-query review) | no | lean | token present |
| 69 | `app/api/finance/ai-operations/performance/route.ts:40` | AiMetricSnapshot | A/B-list (pagination candidate) | no | lean | token present |
| 70 | `app/api/finance/ai-operations/performance/route.ts:45` | AiMetricSnapshot | A/B-list (pagination candidate) | no | lean | token present |
| 71 | `app/api/finance/ai-operations/performance/route.ts:53` | AiWorkflowPolicy | A/B-list (pagination candidate) | no | lean | token present |
| 72 | `app/api/finance/ai-operations/policy/route.ts:37` | AiWorkflowPolicy | A/B-list (pagination candidate) | no | lean | token present |
| 73 | `app/api/finance/ai-operations/policy/route.ts:53` | AiWorkflowPolicy | A/B-list (pagination candidate) | no | lean | token present |
| 74 | `app/api/finance/assets/route.ts:39` | Asset | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 75 | `app/api/finance/bills/route.ts:308` | Product | A/B-list (pagination candidate) | no | lean | token present |
| 76 | `app/api/finance/bills/[id]/route.ts:275` | Product | A/B-list (pagination candidate) | no | lean | token present |
| 77 | `app/api/manufacturing/analytics/route.ts:48` | ManufacturingOrder | D?-aggregation candidate | no | lean | token present |
| 78 | `app/api/manufacturing/analytics/route.ts:61` | ManufacturingOrder | D?-aggregation candidate | no | lean | token present |
| 79 | `app/api/manufacturing/analytics/route.ts:69` | Shipment | D?-aggregation candidate | no | lean | token present |
| 80 | `app/api/manufacturing/chat-history/route.ts:35` | ChatHistory | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 81 | `app/api/manufacturing/air-freight/route.ts:39` | AirFreight | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 82 | `app/api/manufacturing/customs-clearance/route.ts:54` | CustomsClearance | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 83 | `app/api/manufacturing/item-bom/route.ts:29` | ItemBOM | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 84 | `app/api/manufacturing/freight-providers/route.ts:21` | FreightProvider | A/B-list (pagination candidate) | no | lean | token present |
| 85 | `app/api/manufacturing/coupons/route.ts:25` | Coupon | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 86 | `app/api/manufacturing/shipments/route.ts:29` | Shipment | A/B-list (pagination candidate) | no | lean | token present |
| 87 | `app/api/manufacturing/shipments/route.ts:75` | Shipment | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 88 | `app/api/manufacturing/bom/route.ts:21` | BillOfMaterial | A/B-list (pagination candidate) | no | lean | token present |
| 89 | `app/api/manufacturing/documents/route.ts:22` | DocumentModel | A/B-list (pagination candidate) | no | lean | token present |
| 90 | `app/api/manufacturing/hs-codes/route.ts:21` | HSCode | A/B-list (pagination candidate) | no | lean | token present |
| 91 | `app/api/manufacturing/items/route.ts:39` | Item | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 92 | `app/api/ai/command/route.ts:215` | CrmOpportunity | A/B-list (pagination candidate) | no | lean | token present |
| 93 | `app/api/accounting/accounts/route.ts:65` | AccountType | A/B-list (pagination candidate) | no | lean | token present |
| 94 | `app/api/accounting/accounts/route.ts:77` | AccountType | A/B-list (pagination candidate) | no | hydrated doc | token present |
| 95 | `app/api/accounting/accounts/route.ts:96` | Account | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 96 | `app/api/accounting/accounts/route.ts:106` | Account | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 97 | `app/api/accounting/invoices/route.ts:28` | Invoice | A/B-list (pagination candidate) | no | lean | token present |
| 98 | `app/api/billing/history/route.ts:47` | SubscriptionEvent | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 99 | `app/api/billing/plans/route.ts:18` | Plan | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 100 | `app/api/studio/workflows/route.ts:13` | Workflow | A/B-list (pagination candidate) | no | lean | token present |
| 101 | `app/api/admin/fix-accounting/route.ts:33` | Invoice | D?-aggregation candidate | no | lean | token present |
| 102 | `app/api/admin/fix-accounting/route.ts:149` | Expense | D?-aggregation candidate | no | lean | token present |
| 103 | `app/api/admin/chat-history/route.ts:33` | ChatHistory | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 104 | `app/api/admin/reports/generate/route.ts:74` | SaleOrder | D?-aggregation candidate | no | lean | token present |
| 105 | `app/api/admin/reports/generate/route.ts:75` | Customer | D?-aggregation candidate | no | lean | token present |
| 106 | `app/api/admin/reports/generate/route.ts:135` | Invoice | D?-aggregation candidate | no | lean | token present |
| 107 | `app/api/admin/reports/generate/route.ts:136` | Invoice | D?-aggregation candidate | no | lean | token present |
| 108 | `app/api/admin/reports/generate/route.ts:199` | Product | D?-aggregation candidate | no | lean | token present |
| 109 | `app/api/admin/reports/generate/route.ts:200` | StockTransfer | D?-aggregation candidate | no | lean | token present |
| 110 | `app/api/admin/reports/generate/route.ts:270` | ManufacturingOrder | D?-aggregation candidate | no | lean | token present |
| 111 | `app/api/admin/reports/generate/route.ts:335` | Customer | D?-aggregation candidate | no | lean | token present |
| 112 | `app/api/admin/reports/generate/route.ts:391` | Product | D?-aggregation candidate | no | lean | token present |
| 113 | `app/api/admin/reports/generate/route.ts:446` | Account | D?-aggregation candidate | no | lean | token present |
| 114 | `app/api/admin/reports/generate/route.ts:447` | Invoice | D?-aggregation candidate | no | lean | token present |
| 115 | `app/api/admin/reports/generate/route.ts:499` | Product | D?-aggregation candidate | no | lean | token present |
| 116 | `app/api/admin/reports/generate/route.ts:500` | StockTransfer | D?-aggregation candidate | no | lean | token present |
| 117 | `app/api/admin/reports/generate/route.ts:553` | Warehouse | D?-aggregation candidate | no | lean | token present |
| 118 | `app/api/admin/reports/generate/route.ts:554` | StockTransfer | D?-aggregation candidate | no | lean | token present |
| 119 | `app/api/admin/reports/generate/route.ts:610` | Invoice | D?-aggregation candidate | no | lean | token present |
| 120 | `app/api/admin/tasks/route.ts:41` | Task | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 121 | `app/api/admin/vendors/route.ts:26` | Vendor | A/B-list (pagination candidate) | no | lean | token present |
| 122 | `app/api/admin/vendors/evaluate/route.ts:33` | Vendor | A/B-list (pagination candidate) | no | hydrated doc | token present |
| 123 | `app/api/master-admin/tenants/route.ts:28` | Organization | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 124 | `app/api/inventory/chat-history/route.ts:35` | ChatHistory | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 125 | `app/api/inventory/operations/manufacturing/route.ts:76` | ManufacturingOrder | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 126 | `app/api/inventory/operations/transfers/route.ts:37` | Customer | A/B-list (pagination candidate) | no | lean | token present |
| 127 | `app/api/inventory/operations/transfers/route.ts:62` | StockTransfer | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 128 | `app/api/inventory/operations/returns/route.ts:37` | Customer | A/B-list (pagination candidate) | no | lean | token present |
| 129 | `app/api/inventory/operations/returns/route.ts:73` | StockTransfer | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 130 | `app/api/inventory/stock/route.ts:42` | InventoryItem | A/B-list (pagination candidate) | no | lean | token present |
| 131 | `app/api/inventory/stock/levels/route.ts:41` | Stock | A/B-list (pagination candidate) | no | lean | token present |
| 132 | `app/api/inventory/alerts/route.ts:38` | Product | D?-aggregation candidate | no | lean | token present |
| 133 | `app/api/inventory/alerts/route.ts:52` | InventoryItem | D?-aggregation candidate | no | lean | token present |
| 134 | `app/api/inventory/stock-moves/route.ts:70` | StockMove | D?-aggregation candidate | no | lean | NO tenant token in stmt (verify) |
| 135 | `app/api/inventory/warehouse/route.ts:42` | Warehouse | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 136 | `app/api/inventory/summary/route.ts:38` | Product | D?-aggregation candidate | no | lean | token present |
| 137 | `app/api/inventory/batch/route.ts:58` | Batch | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 138 | `app/api/sales/online-payment-gateways/route.ts:44` | PaymentGateway | A/B-list (pagination candidate) | no | lean | token present |
| 139 | `app/api/sales/customer-views/route.ts:36` | SalesView | A/B-list (pagination candidate) | no | lean | token present |
| 140 | `app/api/sales/delivery-methods/route.ts:16` | DeliveryMethod | A/B-list (pagination candidate) | no | lean | token present |
| 141 | `app/api/sales/chat-history/route.ts:35` | ChatHistory | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 142 | `app/api/sales/products/route.ts:124` | Product | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 143 | `app/api/sales/products/route.ts:149` | InventoryItem | A/B-list (pagination candidate) | no | lean | token present |
| 144 | `app/api/sales/customers/route.ts:114` | Customer | D?-aggregation candidate | no | hydrated doc | NO tenant token in stmt (verify) |
| 145 | `app/api/sales/customers/export/route.ts:75` | AVAILABLE_CUSTOMER_COLUMNS | C-export (complete dataset intentional) | no | hydrated doc | NO tenant token in stmt (verify) |
| 146 | `app/api/sales/customers/reporting-tags/route.ts:16` | ReportingTag | D?-aggregation candidate | no | lean | token present |
| 147 | `app/api/sales/customers/custom-field-definitions/route.ts:20` | CustomField | A/B-list (pagination candidate) | no | lean | token present |
| 148 | `app/api/sales/visualization/route.ts:52` | SaleOrder | A/B-list (pagination candidate) | no | lean | token present |
| 149 | `app/api/sales/visualization/route.ts:56` | SalesQuotation | A/B-list (pagination candidate) | no | lean | token present |
| 150 | `app/api/sales/visualization/route.ts:59` | SaleOrder | A/B-list (pagination candidate) | no | lean | token present |
| 151 | `app/api/sales/visualization/route.ts:157` | SaleOrder | A/B-list (pagination candidate) | no | lean | token present |
| 152 | `app/api/sales/document-notes/route.ts:23` | DocumentNote | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 153 | `app/api/sales/subscriptions/export/route.ts:74` | AVAILABLE_SUBSCRIPTION_COLUMNS | C-export (complete dataset intentional) | no | hydrated doc | NO tenant token in stmt (verify) |
| 154 | `app/api/sales/summary/route.ts:93` | SaleOrder | D?-aggregation candidate | no | lean | token present |
| 155 | `app/api/sales/subscription-views/route.ts:38` | SalesView | A/B-list (pagination candidate) | no | lean | token present |
| 156 | `app/api/sales/payment-views/route.ts:38` | SalesView | A/B-list (pagination candidate) | no | lean | token present |
| 157 | `app/api/sales/e-invoices/route.ts:80` | EInvoice | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 158 | `app/api/sales/dunning-rules/route.ts:50` | DunningRule | A/B-list (pagination candidate) | no | lean | token present |
| 159 | `app/api/sales/coupons/route.ts:20` | Coupon | A/B-list (pagination candidate) | no | lean | token present |
| 160 | `app/api/sales/delivery-challans/route.ts:21` | DeliveryChallan | A/B-list (pagination candidate) | no | lean | token present |
| 161 | `app/api/sales/quote-views/route.ts:35` | SalesView | A/B-list (pagination candidate) | no | lean | token present |
| 162 | `app/api/sales/payments/export/route.ts:87` | AVAILABLE_PAYMENT_COLUMNS | C-export (complete dataset intentional) | no | hydrated doc | NO tenant token in stmt (verify) |
| 163 | `app/api/sales/payments/custom-fields/route.ts:19` | CustomField | A/B-list (pagination candidate) | no | lean | token present |
| 164 | `app/api/sales/payment-modes/route.ts:24` | PaymentMode | A/B-list (pagination candidate) | no | lean | token present |
| 165 | `app/api/sales/sales-orders/export/route.ts:65` | AVAILABLE_SALE_ORDER_COLUMNS | C-export (complete dataset intentional) | no | hydrated doc | NO tenant token in stmt (verify) |
| 166 | `app/api/sales/ai-memory-query/route.ts:413` | Model | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 167 | `app/api/sales/ai-memory-query/route.ts:507` | Model | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 168 | `app/api/sales/ai-memory-query/route.ts:647` | Model | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 169 | `app/api/sales/ai-memory-query/route.ts:722` | Model | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 170 | `app/api/sales/document-prefixes/route.ts:26` | DocumentPrefix | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 171 | `app/api/sales/sale-orders/route.ts:97` | Customer | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 172 | `app/api/sales/sale-orders/route.ts:107` | SaleOrder | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 173 | `app/api/sales/sales-order-views/route.ts:38` | SalesView | A/B-list (pagination candidate) | no | lean | token present |
| 174 | `app/api/sales/subscription-webhooks/route.ts:17` | SubscriptionWebhook | A/B-list (pagination candidate) | no | lean | token present |
| 175 | `app/api/sales/custom-fields/route.ts:20` | CustomField | A/B-list (pagination candidate) | no | lean | token present |
| 176 | `app/api/sales/bank-accounts/route.ts:19` | BankAccount | A/B-list (pagination candidate) | no | lean | token present |
| 177 | `app/api/sales/reminders/route.ts:102` | Reminder | A/B-list (pagination candidate) | no | lean | token present |
| 178 | `app/api/sales/subscription-notifications/route.ts:33` | SubscriptionNotificationSetting | A/B-list (pagination candidate) | no | lean | token present |
| 179 | `app/api/sales/pricelists/route.ts:20` | Pricelist | A/B-list (pagination candidate) | no | lean | token present |
| 180 | `app/api/sales/quotes/route.ts:44` | Customer | A/B-list (pagination candidate) | no | lean | token present |
| 181 | `app/api/migration/batches/route.ts:189` | MigrationUploadChunk | E-background/batch (needs cursor/streaming, not offset page) | no | lean | token present |
| 182 | `app/api/migration/batches/route.ts:234` | MigrationBatch | E-background/batch (needs cursor/streaming, not offset page) | no | lean | token present |
| 183 | `app/api/migration/batches/[id]/route.ts:28` | MigrationJob | E-background/batch (needs cursor/streaming, not offset page) | no | lean | token present |
| 184 | `app/api/migration/batches/[id]/recover-failed/route.ts:21` | MigrationRecord | E-background/batch (needs cursor/streaming, not offset page) | no | hydrated doc | token present |
| 185 | `app/api/migration/batches/[id]/preview/route.ts:51` | MigrationJob | E-background/batch (needs cursor/streaming, not offset page) | no | lean | token present |
| 186 | `app/api/migration/batches/[id]/ai-fix/route.ts:44` | MigrationRecord | E-background/batch (needs cursor/streaming, not offset page) | no | lean | token present |
| 187 | `app/api/migration/batches/[id]/mapping/route.ts:21` | MigrationJob | E-background/batch (needs cursor/streaming, not offset page) | no | lean | token present |
| 188 | `app/api/migration/batches/[id]/report/route.ts:24` | MigrationJob | D?-aggregation candidate | no | lean | token present |
| 189 | `app/api/migration/batches/[id]/report/route.ts:25` | MigrationRecord | D?-aggregation candidate | no | lean | token present |
| 190 | `app/api/migration/batches/[id]/report/download/route.ts:20` | MigrationRecord | D?-aggregation candidate | no | lean | token present |
| 191 | `app/api/migration/batches/[id]/resolve/route.ts:56` | MigrationRecord | E-background/batch (needs cursor/streaming, not offset page) | no | lean | NO tenant token in stmt (verify) |
| 192 | `app/api/migration/jobs/route.ts:20` | MigrationJob | E-background/batch (needs cursor/streaming, not offset page) | no | lean | token present |
| 193 | `app/api/auth/my-workspaces/route.ts:35` | User | A/B-list (pagination candidate) | no | lean | token present |
| 194 | `app/api/auth/my-workspaces/route.ts:40` | Organization | A/B-list (pagination candidate) | no | lean | token present |
| 195 | `app/api/org/units/route.ts:22` | OrgUnit | A/B-list (pagination candidate) | no | lean | token present |
| 196 | `app/api/org/units/[id]/consolidated/route.ts:33` | OrgUnit | A/B-list (pagination candidate) | no | hydrated doc | token present |
| 197 | `app/api/org/units/[id]/consolidated/route.ts:37` | OrgUnit | A/B-list (pagination candidate) | no | hydrated doc | token present |
| 198 | `app/api/crm/analytics/route.ts:103` | Lead | D?-aggregation candidate | no | lean | token present |
| 199 | `app/api/crm/analytics/route.ts:103` | Lead | D?-aggregation candidate | no | lean | token present |
| 200 | `app/api/crm/analytics/route.ts:109` | Opportunity | D?-aggregation candidate | no | lean | token present |
| 201 | `app/api/crm/analytics/route.ts:116` | Opportunity | D?-aggregation candidate | no | lean | token present |
| 202 | `app/api/crm/analytics/route.ts:127` | Opportunity | D?-aggregation candidate | no | lean | token present |
| 203 | `app/api/crm/analytics/route.ts:128` | Opportunity | D?-aggregation candidate | no | lean | token present |
| 204 | `app/api/crm/analytics/route.ts:191` | Opportunity | D?-aggregation candidate | no | lean | token present |
| 205 | `app/api/crm/analytics/route.ts:353` | User | D?-aggregation candidate | no | lean | NO tenant token in stmt (verify) |
| 206 | `app/api/crm/automations/route.ts:19` | CrmAutomationRule | A/B-list (pagination candidate) | no | lean | token present |
| 207 | `app/api/crm/ai/dashboard/route.ts:63` | CrmLead | D?-aggregation candidate | no | lean | token present |
| 208 | `app/api/crm/ai/insights/route.ts:20` | CrmAIInsight | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 209 | `app/api/crm/communications/route.ts:28` | CrmCommunication | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 210 | `app/api/crm/chat-history/route.ts:33` | ChatHistory | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 211 | `app/api/crm/onboarding/route.ts:11` | CrmOnboardingPlan | A/B-list (pagination candidate) | no | lean | token present |
| 212 | `app/api/crm/contracts/route.ts:51` | CrmContract | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 213 | `app/api/crm/cases/route.ts:55` | CrmCase | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 214 | `app/api/crm/cases/[id]/timeline/route.ts:23` | CrmActivity | A/B-list (pagination candidate) | no | lean | token present |
| 215 | `app/api/crm/conversation-summaries/route.ts:26` | CrmConversationSummary | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 216 | `app/api/crm/reports/roi/route.ts:64` | CrmCampaign | D?-aggregation candidate | no | hydrated doc | token present |
| 217 | `app/api/crm/reports/campaigns/route.ts:31` | CrmCampaign | D?-aggregation candidate | no | lean | token present |
| 218 | `app/api/crm/accounts/route.ts:25` | CrmAccount | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 219 | `app/api/crm/accounts/[id]/route.ts:76` | CrmFieldVisit | A/B-list (pagination candidate) | no | lean | token present |
| 220 | `app/api/crm/accounts/[id]/route.ts:77` | CrmHandoff | A/B-list (pagination candidate) | no | lean | token present |
| 221 | `app/api/crm/accounts/[id]/route.ts:82` | CrmLead | A/B-list (pagination candidate) | no | lean | token present |
| 222 | `app/api/crm/accounts/[id]/route.ts:83` | CrmOpportunity | A/B-list (pagination candidate) | no | lean | token present |
| 223 | `app/api/crm/accounts/[id]/route.ts:84` | CrmQuote | A/B-list (pagination candidate) | no | lean | token present |
| 224 | `app/api/crm/accounts/[id]/route.ts:85` | CrmContract | A/B-list (pagination candidate) | no | lean | token present |
| 225 | `app/api/crm/accounts/[id]/contracts/route.ts:24` | CrmContract | A/B-list (pagination candidate) | no | lean | token present |
| 226 | `app/api/crm/accounts/[id]/cases/route.ts:24` | CrmCase | A/B-list (pagination candidate) | no | lean | token present |
| 227 | `app/api/crm/accounts/[id]/activities/route.ts:24` | CrmActivity | A/B-list (pagination candidate) | no | lean | token present |
| 228 | `app/api/crm/accounts/[id]/opportunities/route.ts:24` | CrmOpportunity | A/B-list (pagination candidate) | no | lean | token present |
| 229 | `app/api/crm/accounts/[id]/contacts/route.ts:24` | CrmContact | A/B-list (pagination candidate) | no | lean | token present |
| 230 | `app/api/crm/accounts/[id]/tasks/route.ts:24` | CrmTask | A/B-list (pagination candidate) | no | lean | token present |
| 231 | `app/api/crm/accounts/[id]/quotes/route.ts:24` | CrmQuote | A/B-list (pagination candidate) | no | lean | token present |
| 232 | `app/api/crm/health/route.ts:48` | CrmAccount | D?-aggregation candidate | no | lean | token present |
| 233 | `app/api/crm/templates/route.ts:18` | CrmMessageTemplate | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 234 | `app/api/crm/field-visits/route.ts:20` | CrmFieldVisit | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 235 | `app/api/crm/approval-policies/route.ts:22` | CrmApprovalPolicy | A/B-list (pagination candidate) | no | lean | token present |
| 236 | `app/api/crm/import/route.ts:263` | Model | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 237 | `app/api/crm/opportunities/export/route.ts:42` | CrmOpportunity | C-export (complete dataset intentional) | no | hydrated doc | NO tenant token in stmt (verify) |
| 238 | `app/api/crm/approvals/route.ts:13` | CrmApprovalRequest | A/B-list (pagination candidate) | no | lean | token present |
| 239 | `app/api/crm/handoffs/route.ts:40` | CrmHandoff | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 240 | `app/api/crm/contacts/route.ts:42` | CrmContact | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 241 | `app/api/crm/contacts/route.ts:63` | CrmContact | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 242 | `app/api/crm/contacts/[id]/route.ts:31` | CrmActivity | A/B-list (pagination candidate) | no | lean | token present |
| 243 | `app/api/crm/contacts/[id]/route.ts:34` | CrmOpportunity | A/B-list (pagination candidate) | no | lean | token present |
| 244 | `app/api/crm/dashboard/summary/route.ts:29` | CrmOpportunity | D?-aggregation candidate | no | lean | NO tenant token in stmt (verify) |
| 245 | `app/api/crm/dashboard/summary/route.ts:32` | CrmCase | D?-aggregation candidate | no | lean | NO tenant token in stmt (verify) |
| 246 | `app/api/crm/campaigns/route.ts:52` | CrmCampaign | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 247 | `app/api/crm/tasks/route.ts:30` | CrmTask | A/B-list (pagination candidate) | no | hydrated doc | token present |
| 248 | `app/api/crm/leads/route.ts:51` | CrmLead | A/B-list (pagination candidate) | no | hydrated doc | token present |
| 249 | `app/api/crm/leads/[id]/activities/route.ts:25` | CrmActivity | A/B-list (pagination candidate) | no | lean | token present |
| 250 | `app/api/crm/views/route.ts:26` | CrmSavedView | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 251 | `app/api/crm/documents/route.ts:31` | CrmDocument | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 252 | `app/api/crm/integrations/route.ts:18` | CrmIntegrationLink | A/B-list (pagination candidate) | no | lean | NO tenant token in stmt (verify) |
| 253 | `app/api/crm/quotes/route.ts:55` | CrmQuote | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 254 | `app/api/crm/quotes/[id]/route.ts:37` | CrmApprovalRequest | A/B-list (pagination candidate) | no | lean | token present |
| 255 | `app/api/cron/business-health/route.ts:20` | Organization | D?-aggregation candidate | no | lean | NO tenant token in stmt (verify) |
| 256 | `app/api/cron/ai/runtime-sweep/route.ts:32` | Organization | E-background/batch (needs cursor/streaming, not offset page) | no | lean | NO tenant token in stmt (verify) |
| 257 | `app/api/cron/ai/runtime-sweep/route.ts:56` | AiSchedule | E-background/batch (needs cursor/streaming, not offset page) | no | lean | token present |
| 258 | `app/api/cron/ai/metrics-snapshot/route.ts:27` | Organization | D?-aggregation candidate | no | lean | NO tenant token in stmt (verify) |
| 259 | `app/api/cron/sales/reminders-evaluation/route.ts:21` | Organization | E-background/batch (needs cursor/streaming, not offset page) | no | lean | NO tenant token in stmt (verify) |
| 260 | `app/api/cron/sales/subscriptions-billing/route.ts:24` | Organization | E-background/batch (needs cursor/streaming, not offset page) | no | lean | NO tenant token in stmt (verify) |
| 261 | `app/api/cron/crm/automations/route.ts:39` | CrmLead | E-background/batch (needs cursor/streaming, not offset page) | no | lean | NO tenant token in stmt (verify) |
| 262 | `app/api/cron/crm/automations/route.ts:52` | CrmOpportunity | E-background/batch (needs cursor/streaming, not offset page) | no | lean | NO tenant token in stmt (verify) |
| 263 | `app/api/cron/crm/contract-check/route.ts:32` | CrmContract | E-background/batch (needs cursor/streaming, not offset page) | no | hydrated doc | NO tenant token in stmt (verify) |
| 264 | `app/api/cron/crm/sla-check/route.ts:30` | CrmCase | E-background/batch (needs cursor/streaming, not offset page) | no | hydrated doc | NO tenant token in stmt (verify) |
| 265 | `app/api/users/route.ts:81` | User | A/B-list (pagination candidate) | no | hydrated doc | NO tenant token in stmt (verify) |
| 266 | `app/api/integrations/connections/route.ts:23` | Integration | A/B-list (pagination candidate) | no | hydrated doc | token present |