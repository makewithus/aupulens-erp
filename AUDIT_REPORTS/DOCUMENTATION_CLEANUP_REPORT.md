# Documentation Cleanup Report

Tracked Markdown on `main` (`316b5927`): **9 files**. The previous commit had already removed `AUDIT_REPORTS/` (29 reports) and all root-level reports.

| File | Decision | Evidence |
|---|---|---|
| `README.md` | Keep | Root readme, referenced by project tooling |
| `app/fonts/README.md` | Keep | Font provenance/licence note for bundled fonts |
| `hsn/README.md` | Keep | Documents provenance of the HSN/SAC datasets; referenced by `.gitignore` and code comments |
| `docs/SUBSCRIPTION_BILLING_SETUP.md` | Keep | Required Razorpay configuration guide (names only) |
| `docs/AUPULENS_SUBSCRIPTION_BILLING_ACCEPTANCE_REPORT.md` | Keep | Records unresolved status "RED - NOT ACCEPTED" |
| `docs/AUPULENS_SUBSCRIPTION_BILLING_TEST_MATRIX.md` | Keep | Same unresolved finding; links to the acceptance report |
| `docs/SUBSCRIPTION_BILLING_E2E_REPORT.md` | Keep | States browser/live-checkout E2E NOT RUN (open item) |
| `docs/SUBSCRIPTION_BILLING_IMPLEMENTATION_REPORT.md` | Keep (1 link fixed) | Status "IN PROGRESS"; link re-pointed to the surviving acceptance report |
| `docs/SUBSCRIPTION_BILLING_ACCEPTANCE_MATRIX.md` | **Deleted** | Byte-identical to the acceptance report (`cmp`); no unique content |

`CLAUDE.md`, `AGENTS.md`, `ARCHITECTURE.md` do not exist as tracked files (an untracked `.agents/AGENTS.md` exists and was not touched), so there were no architecture duplicates to compare.

Restored from history: six `AUDIT_REPORTS/*` files holding unresolved security, outbox, scheduler, query-optimization and release-gate findings (see manifest).

Not touched: 40 Git-ignored reports under `docs/` and root (`docs/AUPULENS_API_*`, `AUPULENS_SYS_01_39_*`, `RETEST_*`, etc.). They are local, untracked files; deleting them would not change the branch and they may be the only copy.
