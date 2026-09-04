# UI Baseline Scan Summary

> Generated 2026-09-03T07:02:38.473Z
> Base URL: http://localhost:3001
> Output dir: artifacts/ui-chunk6-final

- Total routes in artifacts/routes.txt: 239
- Scanned: 214
- Skipped (dynamic route, no fixture id): 21
- Scanner-level errors (navigation threw / timed out): 4
- Clean (2xx/3xx status, zero console/page errors): 212
- Not clean (non-2xx/3xx status OR console/page errors): 6

## Routes that did NOT come back clean

| Route | HTTP Status | Console Errors | Page Errors | Scanner Error |
|---|---|---|---|---|
| /crm/mobile | 200 | A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:  - A server/client bran | - | - |
| /finance/accounting | 0 | - | - | - |
| /finance/returns | - | - | - | page.goto: Timeout 20000ms exceeded. Call log:   - navigating to "http://localhost:3001/finance/returns", waiting until "domcontentloaded"  |
| /hr/attendance | - | - | - | page.goto: Timeout 20000ms exceeded. Call log:   - navigating to "http://localhost:3001/hr/attendance", waiting until "domcontentloaded"  |
| /hr/leave | - | - | - | page.goto: Timeout 20000ms exceeded. Call log:   - navigating to "http://localhost:3001/hr/leave", waiting until "domcontentloaded"  |
| /sales/invoices/new | - | - | - | page.goto: Timeout 20000ms exceeded. Call log:   - navigating to "http://localhost:3001/sales/invoices/new", waiting until "domcontentloaded"  |

## Skipped routes (dynamic segments — no fixture id)

- /auth/[[...portal]]
- /crm/accounts/[id]
- /crm/campaigns/[id]
- /crm/cases/[id]
- /crm/contacts/[id]
- /crm/contracts/[id]
- /crm/leads/[id]
- /crm/opportunities/[id]
- /crm/quotes/[id]
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
