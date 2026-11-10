# G2 — Query Optimization (Final)

**Status: INCOMPLETE. Not resolved in this pass, and deliberately not forced.**

## Why it was not completed
The 244 unbounded `find` and 71 unbounded `aggregate` calls in `app/api` are unchanged (re-measured on `main` with `scripts/audit/query-inventory.mjs`: 244 / 71). Resolving them means changing API contracts: 126 list endpoints with no paging parameters feed tables, dashboards and KPI widgets that compute totals from the full array. Adding a `.limit()` or a default page size without migrating each consumer silently truncates data, which the brief forbids and which would be a financial-correctness risk for the 37 in-memory-calculation endpoints. Migrating 126 endpoints plus their frontends and writing contract, export-completeness and parity tests for each is not something that can be done safely in one pass without per-consumer review, so no query behaviour was changed in this pass.

## Classification (static, 315 unbounded calls in `app/api`; before = after)
| Class | Count | Disposition |
|---|---|---|
| UI list, no paging params | 126 (crm 37, sales 28, finance 25, manufacturing 10, inventory 5, accounting 4, hr 4, admin 3, other) | **Pagination candidates.** Each needs: keyset helper (`lib/api/pagination.ts`, exists, opt-in), consumer migration, contract test. Not done |
| Aggregation pipeline (`$group`/report) | 71 | Mostly bounded by `$group`; review `$match` shape per pipeline. Not done |
| Financial / in-memory calculation | 37 | **Do not paginate.** Convert to server-side aggregation only with a parity test against the old arithmetic (as done for billing overview). Not done |
| GET already reading paging params / secondary lookup | 37 | Mostly fine; verify per endpoint. Not done |
| Background job / batch | 20 | Cursor/stream candidates (not offset paging). Not done |
| Complete export | 7 | **Must stay complete.** No limit to be added |
| Write-handler lookups | 4 | Bounded by the request |
| Shared helpers | 13 | Depend on callers |

Tenant-scoping signal (static, not a proof): the only unscoped `find` calls are the intentional platform-admin / cron cross-tenant reads documented earlier.

## What exists from earlier work (unchanged)
Opt-in keyset helper + `GET /api/projects`; billing overview → 3 aggregations with a parity test; `connectBaseDB`. See `RESOURCE_OPTIMIZATION_QUERY_INVENTORY_FINAL.md` for the full per-query table (315 rows, file:line, model, handler, class, tenant signal).

## Recommended order (needs the owner's go-ahead per contract change)
1. Endpoints whose only consumer is a paged table (confirm via grep of the consumer), 2. dashboards → server-side aggregates with parity tests, 3. only then flip defaults. Tests required per endpoint: contract (old shape preserved when no params), pagination (stable order, no gaps/duplicates under concurrent insert), export completeness, tenant isolation.

**Release impact:** performance/cost blocker, not a correctness or security blocker. Existing behaviour is unchanged and fully tested.
