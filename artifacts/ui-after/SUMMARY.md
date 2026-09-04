# UI Baseline Scan Summary

> Generated 2026-09-02T05:30:23.246Z
> Base URL: http://localhost:3000
> Output dir: artifacts/ui-after

- Total routes in artifacts/routes-remaining.txt: 173
- Scanned: 155
- Skipped (dynamic route, no fixture id): 12
- Scanner-level errors (navigation threw / timed out): 6
- Clean (2xx/3xx status, zero console/page errors): 154
- Not clean (non-2xx/3xx status OR console/page errors): 7

## Routes that did NOT come back clean

| Route | HTTP Status | Console Errors | Page Errors | Scanner Error |
|---|---|---|---|---|
| /finance/returns | 0 | - | - | - |
| /finance/accounting/journal-entries | - | - | - | page.goto: Timeout 20000ms exceeded. Call log:   - navigating to "http://localhost:3000/finance/accounting/journal-entries", waiting until "domcontentloaded"  |
| /finance/accounting/journals/currency-adjustments | - | - | - | page.goto: Timeout 20000ms exceeded. Call log:   - navigating to "http://localhost:3000/finance/accounting/journals/currency-adjustments", waiting until "domcontentloaded"  |
| /finance/accounting/period-closing | - | - | - | page.goto: Timeout 20000ms exceeded. Call log:   - navigating to "http://localhost:3000/finance/accounting/period-closing", waiting until "domcontentloaded"  |
| /hr/ai-assistant | - | - | - | page.goto: Timeout 20000ms exceeded. Call log:   - navigating to "http://localhost:3000/hr/ai-assistant", waiting until "domcontentloaded"  |
| /manufacturing/documentation | - | - | - | page.goto: Timeout 20000ms exceeded. Call log:   - navigating to "http://localhost:3000/manufacturing/documentation", waiting until "domcontentloaded"  |
| /sales/payments | - | - | - | page.goto: Timeout 20000ms exceeded. Call log:   - navigating to "http://localhost:3000/sales/payments", waiting until "domcontentloaded"  |

## Skipped routes (dynamic segments — no fixture id)

- /finance/accounting/banking/rules/[id]/edit
- /finance/accounting/budgets/[id]/edit
- /projects/[id]
- /sales/customers/[id]
- /sales/invoices/[id]
- /sales/invoices/[id]/edit
- /sales/invoices/print/[id]
- /sales/payments/[id]
- /sales/quotes/[id]
- /sales/sales-orders/[id]
- /sales/subscriptions/[id]
- /sales/subscriptions/settings/dunning/[id]
