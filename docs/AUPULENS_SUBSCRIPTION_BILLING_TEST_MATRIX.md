# Aupulens Subscription & Billing Test Matrix

**Run date:** 2026-10-28  
**Overall:** RED — NOT ACCEPTED. See [acceptance report](AUPULENS_SUBSCRIPTION_BILLING_ACCEPTANCE_REPORT.md) for the requirement-by-requirement checklist.

## Current-run commands and results

| Exact command | Exit | Result | Scope and limitation |
|---|---:|---|---|
| `QA_DISPOSABLE_MONGO_PORT=27019 npx vitest run tests/billing/` | 0 | 3 files passed; 43 tests passed | Run against a disposable one-node MongoDB replica set under `/tmp`; suites used per-run DB names and fixture-scoped cleanup. No live Razorpay calls. |
| `QA_DISPOSABLE_MONGO_PORT=27019 npx vitest run tests/billing/saasBillingComprehensiveAudit.test.ts` | 0 | 1 file passed; 25 tests passed | Includes a database-backed refund route regression with the provider response stubbed at the external boundary; not live Razorpay or browser E2E. |
| `npx vitest run tests/billing/saasSubscriptionBilling.test.ts tests/billing/organizationSubscriptionStatus.test.ts tests/integrations/webhookVerify.test.ts` | 0 | 3 files passed; 34 tests passed | Database-independent calculations/schema/signature tests and production fail-closed regression cases. No Razorpay calls or persisted lifecycle acceptance. |
| `npx eslint app/admin/billing/page.tsx 'app/platform/(app)/billing/page.tsx' app/api/billing app/api/platform/billing lib/billing models/billing/BillingWebhookEvent.ts models/billing/BillingPayment.ts tests/billing lib/constants/statuses.ts` | 0 | Clean; no output | Targeted static lint only. Not a typecheck/build. |
| `npx tsc --noEmit` | 0 | Full-project TypeScript check passed after the production build completed. | Type safety only; does not prove runtime/payment correctness. |
| `npm run build` | 0 | Next.js 15.5.18 optimized production build completed; 581/581 static pages generated. | Build only; not E2E acceptance. |
| `rg -n 'AutoPay|autopay|Mandate|recurring:|razorpaySubscriptionId|createSubscription' app/api/billing app/admin/billing/page.tsx lib/billing models/billing` | 0 | AutoPay state/label found; no mandate endpoint or create-subscription flow found | Source discovery only. |

## Intentionally not run

| Command/suite | Reason | Status |
|---|---|---|
| Full `npm test` / `npx vitest run` | Not run; this audit targeted the billing suite and its dependency/security tests. | NOT RUN |
| Browser E2E, live Razorpay test mode, export/document reconciliation | No browser fixtures or Razorpay test credentials established. | RED — BLOCKED |

## Requirement-to-test coverage

Requirement IDs and statuses use the checklist in the acceptance report. Each row below defines an execution needed before acceptance; the tests in the first table are the only tests executed during this run.

| Requirement groups | Required verification | Current result |
|---|---|---|
| SUB-PORTAL-01..10 | Browser sign-in; customer subscription page across all persisted states; loading/error/empty states; price, cycle, dates, features, usage; history filters, pagination and PDF access; mobile and desktop; inspect console/network and reload persisted state | NOT RUN |
| SUB-PLANS-01..11 | Compare API/catalog and UI cards; monthly/annual prices; unavailable actions; preview amount/tax/date/proration; invalid plan/client amount tampering; fail/success verified payment; scheduled downgrade and effective-date limits; data/usage preservation; concurrent conflicting requests | Focused math only; integration not run |
| SUB-PAY-01..09 | Test-mode checkout; order/tenant/amount/currency binding; valid/invalid/pending/failed/cancelled events; mismatches; forged client success; confirmation replay; duplicate/out-of-order webhook; timeout/retry; DB fault; persisted payment/order references | Focused signature and database lifecycle/replay tests passed; provider checkout, timeout recovery, and real test-mode scenarios NOT RUN |
| SUB-PAY-10..17 | Attempt to create/revoke mandate; enforce authorization prerequisite; reconcile provider mandate; renewal success/failure/retries/notifications/3-day grace/recovery/cancel; duplicate renewal event; history for tenant/admin | Mandate flow absent; rest NOT RUN/BLOCKED |
| SUB-DOC-01..12 | Billing history vs persisted payments; invoice numbering concurrency; required invoice fields; configured GST tax cases and independent calculations; generated PDF/download/auth failures; receipt eligibility; refund provider reconciliation/idempotency; credit note; audit and accountant approval | Invoice/lifecycle and refund route persistence have focused DB coverage; provider reconciliation, credit note, accountant approval, and remaining document checks NOT RUN/BLOCKED |
| SUB-ADMIN-01..07 | Seed known upgrades and non-upgrade events; verify selected-month filters, tenant timelines, payment/invoice links, status separation, role denial | NOT RUN |
| SUB-KPI-01..09 | Seed a synthetic multi-tenant dataset; independently calculate KPI formulas, month/timezone boundaries, refunds/failures/pending/upgrades/renewals; compare persisted records, APIs, dashboard charts and CSV export | NOT RUN |
| SUB-ENT-01..05 | Read/write API calls under each state; verify resolver and guarded endpoints before/after verified upgrade, downgrade, cancellation, expiry and suspension | NOT RUN |
| SUB-SEC-01..08 | Two-tenant role matrix for body/header/query/path ID substitution; foreign payment/invoice refs; cancellation/refund/export/admin API; webhook signature; cross-tenant cache/AI read; secret/log/bundle scan | NOT RUN |
| SUB-AUDIT-01..04 | Inspect audit rows for actor/tenant/time/action/reference, non-forgeability, tenant reads, CSV filter parity and formula injection | NOT RUN |
| SUB-E2E-01..09 | Execute the nine workflows in the supplied brief against synthetic accounts, test provider, disposable DB and browser; check persisted state and outputs after each step | RED — BLOCKED (SUB-E2E-04 also implementation failure) |

## Test safety controls required before database runs

1. Billing integration tests require `QA_DISPOSABLE_MONGO_PORT` and check loopback host, unique test database, and replica-set status before fixture writes.
2. The hosted database configured in `.env` is not used by this test command. The lifecycle suite only deletes its synthetic fixture records in its unique database.
3. Keep Razorpay test keys separate from live keys. Verify key mode before enabling checkout tests. Never initiate live transactions.
4. Browser/API/provider acceptance still requires dedicated synthetic identities and Razorpay test-mode configuration.

## Acceptance evidence to capture per run

For each scenario, retain a synthetic tenant/record map, request/response status with secrets redacted, browser console/network errors, payment/order/webhook IDs, persisted subscription/payment/invoice/event states, entitlement results, generated PDF checks, export rows, independent KPI calculations and exact test output. No such current-run E2E evidence was produced here.
