# Aupulens ERP — Dashboard & Analytics Optimization Plan

**Generated:** 2026-10-25  
**Branch:** `dashboard-analytics-optimization`  
**Author:** Principal Full-Stack Architect & Performance Lead  

---

## 1. Architectural Strategy

Our plan systematically addresses each layer of the data stack to achieve:
1. **0ms perceived latency** via Stale-While-Revalidate (SWR) with client-side session caching.
2. **Absolute data integrity** anchored to authoritative MongoDB ledger documents.
3. **Zero layout shift and zero metric jumping** by removing all hardcoded dummy fallback states and replacing cold loads with exact-dimension skeleton states.
4. **Strict tenant isolation** by eliminating cross-tenant `$or` queries.

```
[ User Request ]
       |
       v
[ cachedFetch ] ──(Cache Hit?)──► YES: Return cached data immediately (0ms)
       |                                      │
       NO (or background SWR)                 │
       v                                      v
[ Server Route ]                        [ Render UI ]
       |
       v
[ serverCache (20s TTL) ] ──(Hit?)──► YES: Return cached JSON (<1ms)
       |
       NO (Cold DB Query)
       v
[ Authoritative MongoDB Aggregate ] ──► Compute, Set Cache, Return (<200ms)
```

---

## 2. Module-by-Module Plan of Work

### Phase 4: Shared Architectural Hardening
1. Ensure `lib/api/cachedFetch.ts` handles:
   - Client-side in-memory Map + browser `sessionStorage`.
   - In-flight promise deduplication to prevent duplicate network calls.
   - Immediate cache invalidation on any POST/PUT/PATCH/DELETE.
   - Dispatching `aup:revalidated` CustomEvents for reactive UI updates without full page reloads.
2. Ensure `lib/api/serverCache.ts` handles:
   - Scoped TTL storage by tenant and query parameters.
   - `invalidateServerCache(tenantId, prefix)` utility for mutations.
3. Clean up tenant boundaries in backend endpoints:
   - Remove `$or: [{ tenantId }, { tenantId: "default-tenant" }]` from:
     - `app/api/manufacturing/summary/route.ts`
     - `app/api/manufacturing/analytics/route.ts`
     - `app/api/hr/summary/route.ts`
     - `app/api/hr/analytics/route.ts`

### Phase 5: Cold State & Skeleton Harmonization
1. Audit every client dashboard/analytics page:
   - Replace any initial fake state (e.g., 86.4% OEE, 45.98Cr pipeline, 1.84Cr cash, 1.48Cr valuation) with clean initial states (`null` on cold load or initialized directly from client cache synchronously).
   - Display full-fidelity skeleton loaders on cold mount if no cache is available.
   - Display real database metrics as soon as data arrives, with zero jump and zero chart shrinking.
   - On background SWR revalidations, maintain displayed data stably without unmounting.

### Phases 6-14: Module-by-Module Execution
- **Sales:** Reconcile Sales KPIs with `SaleOrder` (excluding drafts/cancelled) and `SalesInvoice` issued invoices.
- **Inventory:** Ensure stock valuation and warehouse capacities derive strictly from active `Product`, `Warehouse`, and `StockMove` records.
- **Finance:** Anchor all metrics to posted journal items (`JournalItem` with `state: "posted"`), ensuring Revenue is ₹22,78,941, Expenses ₹13,500, Net Income ₹22,65,441, and Liquid Cash ₹33,246.
- **HR:** Query real `Employee`, `Attendance`, `Leave`, and `Payroll` records scoped to the tenant.
- **CRM:** Query real `Lead`, `Account`, `Contact`, `Opportunity`, and `Quote` collections.
- **Manufacturing:** Query real `ManufacturingOrder`, `BillOfMaterial`, and `Shipment` collections.
- **Purchases:** Verify `PurchaseOrder`, `Bill`, and `Vendor` metrics.
- **Projects:** Query real `Project` and `Task` records.
- **Admin & Platform:** Authoritative `User`, `AiCreditLedger`, and `OrganizationEntitlement` queries.

### Phase 15: Cross-Module Mutation Testing
- Test invoice posting updating both Sales and Finance metrics.
- Test purchase receipt updating Inventory and Accounts Payable.
- Test payroll processing updating HR and Finance.

### Phase 16: Verification, Static Analysis & Documentation
- Run `npx tsc -p tsconfig.json --noEmit`.
- Run full Vitest regression suite.
- Produce `DASHBOARD_MODULE_VERIFICATION.md` and `DASHBOARD_OPTIMIZATION_VERIFICATION.md`.
