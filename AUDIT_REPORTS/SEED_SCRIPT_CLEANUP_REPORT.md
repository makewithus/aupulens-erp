# Seed and Script Cleanup Report

**Result: 0 scripts removed.** All 69 tracked files in `scripts/` were inspected.

## Why nothing was removed
- A script with no references is not evidence of obsolescence: migrations, backfills, repair tools, importers and demo seeders are invoked manually by name (`npx tsx scripts/...`). 49 of 69 have no reference for that reason.
- None has an unresolved local import (checked programmatically); every one was modified within the last ~3 weeks (2026-10-27 to 2026-11-10).
- The demo seeders are documented, idempotent and non-overlapping in purpose (`seed-demo` system-wide default tenant; `seed-all-modules` ~24 models; `seed-admin-demo` admin portal only; `seed-enterprise-enrichment` projects/calendar/HR reviews/logs; `seed-invoices` one invoice per template). Proving one superseded would need an owner decision.
- `qa-browser-seed.ts` refuses to run unless `MONGODB_URI` is a local database whose name contains `browser_qa`.
- Production initialization (`seed-platform-*`, `bootstrap-default-tenant`, `import-hsn-sac-reference`) and migrations/recovery scripts are explicitly protected.
- No script was executed against any database in this pass.

## Per-script classification
| Script | Category | Other references | Last changed | Disposition |
|---|---|---|---|---|
| `scripts/audit/orphans.mjs` | Audit/analysis tooling | none (run manually by name) | 2026-11-10 | **Preserved** |
| `scripts/audit/query-inventory.mjs` | Audit/analysis tooling | scripts/audit/render-inventory-report.py | 2026-11-10 | **Preserved** |
| `scripts/audit/remove-unused-imports.mjs` | Audit/analysis tooling | none (run manually by name) | 2026-11-10 | **Preserved** |
| `scripts/audit/render-inventory-report.py` | Audit/analysis tooling | none (run manually by name) | 2026-11-10 | **Preserved** |
| `scripts/audit/unused-exports.mjs` | Audit/analysis tooling | none (run manually by name) | 2026-11-10 | **Preserved** |
| `scripts/bootstrap-default-tenant.ts` | Repair / recovery / one-off operations utility | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/check-active-tenants.ts` | Verification / diagnostic check | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/check-ai-budget.ts` | Verification / diagnostic check | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/check-model-health.ts` | Verification / diagnostic check | lib/ai/modelHealth.ts, package.json | 2026-10-27 | **Preserved** |
| `scripts/coa-repair-dry-run.ts` | Repair / recovery / one-off operations utility | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/dedupe-crm-leads.mjs` | Repair / recovery / one-off operations utility | none (run manually by name) | 2026-10-31 | **Preserved** |
| `scripts/fix-balance-sheet-data.ts` | Repair / recovery / one-off operations utility | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/hsn-gst-browser-acceptance.js` | Verification / diagnostic check | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/import-hsn-sac-reference.ts` | Reference-data importer | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/migrate-backfill-account-issystemseeded.ts` | Database migration / backfill | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/migrate-backfill-bankreconciliation-tenantid.ts` | Database migration / backfill | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/migrate-backfill-invoice-gl-postings.ts` | Database migration / backfill | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/migrate-backfill-invoice-line-totals.ts` | Database migration / backfill | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/migrate-backfill-marked-fully-paid-payments.ts` | Database migration / backfill | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/migrate-bill-split-brain.ts` | Database migration / backfill | scripts/seed-demo.ts | 2026-10-27 | **Preserved** |
| `scripts/migrate-clear-stale-ai-model.ts` | Database migration / backfill | lib/ai/tenantAi.ts, scripts/check-model-health.ts | 2026-10-27 | **Preserved** |
| `scripts/migrate-drop-stale-unique-indexes.ts` | Database migration / backfill | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/migrate-fix-account-legacy-code-index.ts` | Database migration / backfill | scripts/migrate-link-bankaccounts-to-gl.ts, scripts/seed-invoices.ts | 2026-10-27 | **Preserved** |
| `scripts/migrate-grandfather-tenant-tiers.ts` | Database migration / backfill | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/migrate-invoice-unique-index.ts` | Database migration / backfill | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/migrate-link-bankaccounts-to-gl.ts` | Database migration / backfill | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/migrate-post-historical-payment-journals.ts` | Database migration / backfill | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/migrate-product-status-enum.ts` | Database migration / backfill | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/migrate-seed-orgunits.ts` | Database migration / backfill | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/migrate-vendors-to-suppliers.mjs` | Database migration / backfill | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/migrations/ensure-hr-query-indexes.ts` | Database migration / backfill | package.json | 2026-10-27 | **Preserved** |
| `scripts/migrations/reconcile-concurrent-migration.cjs` | Database migration / backfill | tests/migration/e2eWorker.test.ts | 2026-10-27 | **Preserved** |
| `scripts/migrations/verify-tenant-unique-indexes.ts` | Database migration / backfill | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/qa-browser-seed.ts` | QA fixture / mock | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/qa-mock-sarvam.ts` | QA fixture / mock | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/repair-invoice-discount-mode.ts` | Repair / recovery / one-off operations utility | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/report-negative-journal-lines.ts` | Repair / recovery / one-off operations utility | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/reset-platform-demo.ts` | Repair / recovery / one-off operations utility | scripts/seed-platform-demo.ts | 2026-10-27 | **Preserved** |
| `scripts/restore-seeded-workspace.cjs` | Repair / recovery / one-off operations utility | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/sarvam-live-check.ts` | Verification / diagnostic check | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/sarvam-live-classify.ts` | Verification / diagnostic check | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/sarvam-live-phrases.ts` | Verification / diagnostic check | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/sarvam-live-verify.ts` | Verification / diagnostic check | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/seed-admin-demo.ts` | Demo / sample-data seeder | none (run manually by name) | 2026-10-30 | **Preserved** |
| `scripts/seed-all-modules.ts` | Demo / sample-data seeder | none (run manually by name) | 2026-10-30 | **Preserved** |
| `scripts/seed-complete-enterprise.ts` | Demo / sample-data seeder | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/seed-demo.ts` | Demo / sample-data seeder | package.json | 2026-10-27 | **Preserved** |
| `scripts/seed-enterprise-enrichment.ts` | Demo / sample-data seeder | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/seed-inventory-analytics.ts` | Demo / sample-data seeder | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/seed-invoices.ts` | Demo / sample-data seeder | package.json, scripts/migrate-link-bankaccounts-to-gl.ts | 2026-10-27 | **Preserved** |
| `scripts/seed-platform-admin.ts` | Platform reference-data / initialization seed | .env.example, app/platform/(app)/admin-users/page.tsx … | 2026-10-27 | **Preserved** |
| `scripts/seed-platform-ai-cost-rates.ts` | Platform reference-data / initialization seed | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/seed-platform-alert-config.ts` | Platform reference-data / initialization seed | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/seed-platform-demo.ts` | Platform reference-data / initialization seed | lib/platform/entitlements/planCatalog.ts, scripts/qa-browser-seed.ts … | 2026-10-27 | **Preserved** |
| `scripts/seed-platform-org-types.ts` | Platform reference-data / initialization seed | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/seed-platform-plans.ts` | Platform reference-data / initialization seed | lib/platform/entitlements/planCatalog.ts | 2026-10-27 | **Preserved** |
| `scripts/seed-platform-retention-policy.ts` | Platform reference-data / initialization seed | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/seed-platform-roles.ts` | Platform reference-data / initialization seed | lib/constants/statuses.ts, lib/platform/auth/roleMatrix.ts … | 2026-10-27 | **Preserved** |
| `scripts/seed-platform-sarvam-cost-rates.ts` | Platform reference-data / initialization seed | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/seed-user-credentials.ts` | Demo / sample-data seeder | none (run manually by name) | 2026-10-29 | **Preserved** |
| `scripts/ui-regression-scan.ts` | Verification / diagnostic check | tsconfig.json | 2026-10-27 | **Preserved** |
| `scripts/verify-admin-isolation.ts` | Verification / diagnostic check | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/verify-ai-usage-browser.mjs` | Verification / diagnostic check | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/verify-api-routes.ts` | Verification / diagnostic check | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/verify-customer-draft-browser.mjs` | Verification / diagnostic check | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/verify-dashboard-kpis.ts` | Verification / diagnostic check | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/verify-employee-role-browser.mjs` | Verification / diagnostic check | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/verify-pl-followup-browser.mjs` | Verification / diagnostic check | none (run manually by name) | 2026-10-27 | **Preserved** |
| `scripts/verify-policy-loop.ts` | Verification / diagnostic check | tsconfig.json | 2026-10-27 | **Preserved** |
