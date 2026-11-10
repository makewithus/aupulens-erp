# Final Cleanup Verification

Branch `chore/repository-cleanup`, base `main` @ `316b5927` (also `origin/main`). Verified on the cleaned tree before commit.

| Check | Command | Result |
|---|---|---|
| Dependency consistency | `npm ls`, `npm ci --dry-run` | `npm ci --dry-run` succeeds (lockfile in sync, `package*.json` unchanged). `npm ls` exits 1 with **pre-existing** findings only: extraneous optional WASM packages (`@emnapi/*`, `@img/sharp-wasm32`, `@napi-rs/wasm-runtime`, `@tybys/wasm-util`), `nodemailer@10.4.0` vs next-auth optional peer, optional `electron-builder-squirrel-windows` missing |
| TypeScript | `npx tsc --noEmit` | exit 0, 0 errors |
| Lint | `npm run lint` | exit 0 |
| Tests | `npx vitest run --maxWorkers=4` on a fresh disposable MongoDB replica set | **386 files passed, 1 skipped; 4,456 tests passed, 12 skipped, 0 failed** (exit 0). The 12 skipped are the same pre-existing skips (migration sample files absent on this machine) |
| Production build | `npm run build` with `NEXT_DIST_DIR=.next-audit` | exit 0, 591/591 static pages. A separate output directory was used so the existing `.next` (3.5 GB) was not overwritten; the temporary directory was removed afterwards |

## Test runs that did not pass, and why (full disclosure)
Three earlier full runs on the same cleaned tree failed intermittently before the green run:
1. 8 workers, fresh DB: 3 tests failed in `tests/resourceOptimization/aiOutbox.test.ts` (one 60 s timeout, two assertions). The file passes in isolation (25/25).
2. 8 workers: 8 files failed with `Hook timed out in 60000ms`; a different set of files each time.
3. 3 workers: 3 files failed with the same hook timeout.
Cause: the disposable test MongoDB accumulated **171 leftover test databases (1.1 GB)** across runs (the suite does not drop every database it creates; 135 remained after the green run) on a machine already using ~12 of 15 GB RAM, so setup hooks slowed past 60 s. Restarting a fresh disposable database produced the green run. No assertion, timeout or test was changed. **Practical note:** use a fresh disposable MongoDB per full run. Not proven: that these tests are also free of load sensitivity in CI.

## Runtime verification (production build, disposable DB, synthetic data: 2 orgs, 3 users)
| Workflow | Result |
|---|---|
| Login | admin A, employee A, admin B all 302; session carries email, tenant, role |
| Logout | `signout` then protected API returns 401 |
| Admin vs employee permissions | For sales, CRM, HR, inventory, finance (2), projects, manufacturing, admin org-settings: admin 200, employee 403, anonymous 401 |
| Tenant isolation | Org A created a customer (201); Org A sees 1, Org B sees 0 |
| AI outbox | Creating a customer wrote a `master_data.changed` event; `runtime-sweep` processed 5, 0 failed, 0 dead-lettered, `reconcileError: null` |
| Scheduler | `run-due` 401 without secret, 200 with; `health` healthy; 13 job runs recorded |
| Suspension / reactivation | Suspended org gets 402 after 47 s, reactivated returns 200 after 30 s. Within the designed 60 s entitlement bound (`ENTITLEMENT_MAX_AGE_MS`); the code is unchanged vs `main` |
| Dashboard, CRM, accounting, GST, invoices, payroll, inventory, billing, projects, data migration | Endpoint reachability above plus the automated suite (4,456 tests across these areas). **Not exercised in a browser** in this pass |

## Not verified
- Browser UI flows and organization switching in a UI (no browser run in this pass).
- Billing at runtime: the synthetic database has no plan catalogue, so `/api/billing/subscription` was not exercised (covered by `tests/billing`).
- Electron packaging (`electron-builder`) was not run.
- Data-migration upload with real sample files (10 related tests skip because sample files are absent).
