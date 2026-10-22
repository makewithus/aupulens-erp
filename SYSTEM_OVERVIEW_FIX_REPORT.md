# System Overview financial accuracy fix

Implemented on 21 October 2026. These changes are local and have not been deployed.

The overview previously combined sales-invoice totals with purchase-bill totals. Expense records were queried separately but never included in profit. Posted journal costs, including operating expenses and cost of goods sold, were therefore omitted. Both the profit card and the financial-health chart interpreted missing costs as a 100% margin.

Revenue, expenses, net income and revenue trends now use the same posted-journal reporting functions as Finance P&L. This excludes tax accounts from revenue/costs, incorporates reversals, and avoids adding source bills/expenses/payments a second time. Figures explicitly use an all-time basis, with calendar-month comparisons shown separately. Unposted documents do not constitute recognized revenue or expenses.

When no expense activity is posted, or the ledger is unbalanced, net income and margin are unavailable across the overview. A zero posted-cost balance no longer produces a claim that all revenue is profit. This does not invent costs or post missing transactions.

Transactions count posted journals once, with paid payment records shown separately. Stock activity includes transfer, movement and stock-ledger records, excludes reservations, and is labelled accordingly; it is a record count, not a count of unique shipments. Existing direct-invoice order fallback and migration-related work were preserved.

Refresh reads current overview data rather than returning the tab's cached response. Failed requests display a retry message. The AI card identifies its insufficient-data message as a scheduled snapshot rather than claiming that current business activity is absent.

## Verification

- Seventeen focused regression tests passed across the overview, posted-journal report and admin AI data fetcher suites. Regression tests exercise real ledger-report calculations and rendered overview cards: revenue-only, expenses and COGS, tax exclusion, reversals, tenant/draft exclusion, monthly comparisons, losses, unbalanced/empty ledgers and access restrictions.
- Two integration tests passed against a dedicated MongoDB at 127.0.0.1:27129 with a unique disposable database. They verify account population, cost inclusion without document double-counting, tenant isolation, payment statuses and stock reservations. Only that database was removed afterward; the temporary server was stopped.
- Integration rerun: start a disposable local MongoDB on port 27129, then run `AUPULENS_OVERVIEW_MONGO_TEST=1 npx vitest run tests/admin/dashboardOverview.integration.test.ts --reporter=verbose`. The suite intentionally ignores environment database URIs.
- The adjacent admin AI fetcher isolation test needed a nonempty order fixture to exercise its conditional aggregate query; the tenant assertion remains unchanged.
- Targeted ESLint passed. Initial standalone TypeScript validation passed. The final bounded repeat after all changes timed out after 60 seconds without diagnostics (exit 124), so final full-project type validation remains unverified.
- No production/customer database was inspected or modified. No deployment or interactive browser verification was performed.
