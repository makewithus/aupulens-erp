# ERP Runtime Verification (Final)

Target: production build (`next build` exit 0, 591/591 pages, Next 15.5.29) served with `next start`, against a disposable local MongoDB replica set, two synthetic organizations (`org-a`, `org-b`, professional tier) and three synthetic users (admin A, employee A, admin B). No production data or services were contacted. **No browser was available in this session** (no browser tools), so everything below is HTTP/API-level; no UI rendering, click-through or screenshot was done.

| Area requested | Status | Evidence |
|---|---|---|
| Login | **PASS** | credential login for all three users (302, session carries email/tenantId/role); JWT carries plain `orgModuleData`, `entitlementVersion`, `entitlementCheckedAt` |
| Logout | **PASS** | `signout` 200; the same cookie jar then gets 401 on a protected API |
| Two-organization isolation | **PASS** | Org A created a customer; Org A sees 2 customers, Org B sees 0 |
| Organization switching (UI) | **NOT VERIFIED** | no browser; only API-level tenant separation tested |
| Role and permission enforcement | **PASS** | admin → 200, employee → 403 on account-types, HR employees, customers, org-settings |
| Org suspension / reactivation | **PASS** | DB-level suspend → API 402 after 22 s; reactivate → 200 after 30 s (bound 35 s) |
| AI event processing | **PASS** | live customer create wrote outbox row `created:<id>`; cron sweep (Bearer) processed events; a customer inserted behind the API (simulated lost event) was recovered (`reconciledEvents: 1`) and processed |
| Scheduler execution | **PASS** | `run-due` 401 without / 200 with secret; 13 job-run records created; `/health` → 200 healthy |
| Dashboard loading | **NOT VERIFIED** | pages not rendered (no browser); static generation of 591 pages succeeded at build |
| CRM workflows | **NOT VERIFIED at runtime** | automated suite only (`tests/crm`, incl. `crmWorkflowRegression`) |
| Accounting & journal entries | **NOT VERIFIED at runtime** | automated suite only (47 accounting files) |
| Invoice creation & calculations / GST | **NOT VERIFIED at runtime** | automated suite only (`tests/qa/inventorySalesGst`, sales, accounting) |
| Banking reconciliation | **NOT VERIFIED at runtime** | suite only |
| HR and payroll | **NOT VERIFIED at runtime** | suite only (payroll stages, remediation) |
| Inventory / sales / purchase workflows | **NOT VERIFIED at runtime** | suite only |
| Projects | **NOT VERIFIED at runtime** | suite only (`keysetPagination`, project routes) |
| Billing & subscriptions | **NOT VERIFIED at runtime** | suite only (`billingOverviewParity`, `tests/billing`) |
| Data migration upload & recovery | **NOT VERIFIED at runtime** | suite only; **10 of those tests are skipped** because sample files are absent on this machine |
| Cache headers | **PASS** | `private, no-store` on departments, banking-rules, account-types, accountants |

"Suite only" means the 4,432-test automated suite exercises the code against a real MongoDB, which is real evidence, but it is not a runtime check of the deployed build and does not cover UI behaviour.

## Defects found by runtime in earlier work (already fixed and committed before this pass)
Login `DataCloneError`; scheduler health endpoint blocked by middleware.
