# Aupulens ERP — Dashboard Data Consistency & Root Cause Audit

**Generated:** 2026-10-25  
**Branch:** `dashboard-analytics-optimization`  
**Scope:** Root-cause investigation into dashboard loading flicker, changing KPI values, chart shrinking, and cross-module inconsistencies.

---

## 1. Executive Summary of Root Causes

Our comprehensive trace from Database → Domain Services → API Routes → Client State → Chart Components identified five distinct architectural defects responsible for the reported issues:

```
+-------------------------------------------------------------------------------+
| DEFECT 1: Initial State Dummy Data Anti-Pattern                               |
| Pages initialized with static numbers (e.g., 86.4% OEE, 45.98Cr Pipeline)      |
| -> UI displays fake data on mount -> API arrives 50ms later -> Chart shrinks!  |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| DEFECT 2: Tenant Scoping & Fallback Leakage                                   |
| API queries used: { $or: [{ tenantId }, { tenantId: "default-tenant" }] }     |
| -> Demo records leaked into real tenant metrics -> Inconsistent card metrics   |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| DEFECT 3: Unposted / Draft Records Leaking into Revenue                       |
| Aggregations failed to filter by posted status (DOCUMENT_STATUS.POSTED)       |
| -> Draft quotes/invoices inflated recognized revenue and financial statements |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| DEFECT 4: Duplicate Fetching & Missing Background SWR Synchronization         |
| Multiple widgets individually calling separate raw fetch() on same page       |
| -> Redundant network roundtrips, race conditions, and out-of-order responses  |
+-------------------------------------------------------------------------------+
                                      |
                                      v
+-------------------------------------------------------------------------------+
| DEFECT 5: Canvas / Recharts Initial Dimension Flashing                         |
| Charts rendered before container dimensions stabilized in DOM                 |
| -> SVG/Canvas rendered at default 300px then snapped to 100% width             |
+-------------------------------------------------------------------------------+
```

---

## 2. Deep Dive by Root Cause

### 2.1 Defect 1: Initial State Dummy Data Anti-Pattern
- **Location:**
  - `app/manufacturing/analytics/page.tsx` (`INITIAL_MFG_ANALYTICS`: 86.4% OEE, 48 units output)
  - `app/crm/analytics/page.tsx` (`INITIAL_CRM_ANALYTICS`: ₹45.98Cr pipeline, 1972 active deals)
  - `app/sales/dashboard/page.tsx` (`openPipelineValue: 459801358`, fake channel distribution)
  - `app/sales/analytics/page.tsx` (`DEFAULT_SALES_SUMMARY`: 68 orders, 42 quotations)
  - `app/inventory/dashboard/page.tsx` (`totalValuation: 14820000`, fake category values)
  - `app/inventory/analytics/page.tsx` (`DEFAULT_WAREHOUSES`, `DEFAULT_STOCK_ITEMS`, `DEFAULT_BATCHES`)
  - `app/finance/summary/page.tsx` (`cashFlow: 18450000` vs real ₹33,246 liquid cash)
- **Mechanism of Failure:**
  When a user lands on the page, React initializes state with the hardcoded dummy object. The browser renders the chart at full size with high values. Within 50-200ms, the API response arrives. If the user's actual database has 0 or 2 records, the state updates to the real data, causing the chart to abruptly **shrink or jump to different values**.
- **Remediation:**
  Remove all fake runtime data from initial state.
  Implement **Authoritative Cache-First Hydration**:
  - Check browser cache (`sessionStorage` + memory) for previously cached authoritative data for the current tenant.
  - If present, render the real last-known authoritative data immediately with 0ms delay.
  - If cold load (no cache), set state to `null` and render an identical-dimension layout skeleton (no dummy numbers).
  - When the authoritative API arrives, hydrate cleanly without layout shift or shrinking.

### 2.2 Defect 2: Tenant Scoping & Fallback Leakage
- **Location:**
  - `app/api/manufacturing/summary/route.ts` (lines 34-36)
  - `app/api/manufacturing/analytics/route.ts` (lines 42, 46, 47, 49, 52, 222, 251)
  - `app/api/hr/summary/route.ts` (line 36)
  - `app/api/hr/analytics/route.ts` (line 36)
- **Mechanism of Failure:**
  Queries used `{ $or: [{ tenantId }, { tenantId: "default-tenant" }, { tenantId: null }] }`.
  When a tenant with no manufacturing or HR records viewed their dashboard, the query returned data from `default-tenant`, displaying someone else's demo records. When they refreshed or switched modules, conflicting calculations occurred.
- **Remediation:**
  Strictly isolate every query to `{ tenantId }`. Enforce `requireTenantId(session)` across all analytical and reporting endpoints.

### 2.3 Defect 3: Draft & Unposted Document Inconsistency
- **Location:**
  - `app/api/finance/summary/route.ts`
  - `app/api/finance/reports/p-l/route.ts`
  - `app/api/sales/summary/route.ts`
- **Mechanism of Failure:**
  In some aggregations, invoices with `status: "draft"` were counted towards total revenue, while in general ledger reports only `state: "posted"` journal entries were counted. This caused the Finance Summary card to show one revenue figure while the Profit & Loss statement showed another!
- **Remediation:**
  Enforce the single source of truth:
  - Finance Revenue is authoritatively anchored to posted general ledger entries (`JournalItem` where account type is Income/Revenue and `state === "posted"`).
  - Sales Revenue uses `issuedInvoiceFilter()` (`status: { $in: ["approved", "posted", "sent", "paid"] }`).
  - Drafts are strictly quarantined to "Draft Pipeline" and never included in recognized revenue or net income.

### 2.4 Defect 4: Duplicate API Requests & Fetch Loops
- **Location:**
  - Dashboard pages that triggered 5-7 separate raw `fetch()` calls in `useEffect` with unstable dependencies.
  - Absence of request deduplication leading to simultaneous identical queries during React strict mode double-invocations.
- **Remediation:**
  - Standardized all client fetching onto `cachedFetch.ts` with in-flight Promise deduplication.
  - Synchronized server routes with 20s TTL caching (`serverCache.ts`) so duplicate requests within 20s resolve in <1ms without hitting MongoDB aggregations.

### 2.5 Defect 5: Layout Shift in Responsive Charts
- **Location:**
  - `components/charts/TradingLineChart.tsx`
  - `components/charts/DailyBrickBarChart.tsx`
  - `components/inventory/CanvasCharts.tsx`
- **Mechanism of Failure:**
  `ResponsiveContainer` requires its parent container to have an explicit non-zero height and width. When rendering while layout was calculating, the chart initially rendered at min-width (e.g. 100px or 300px) and then snapped to 100% width on the next render frame.
- **Remediation:**
  Enforce explicit CSS min-height (`min-h-[280px]` or `min-h-[320px]`) and fixed aspect-ratio containers on all chart wrapper cards.
