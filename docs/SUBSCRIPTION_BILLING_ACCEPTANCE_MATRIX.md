# Aupulens Subscription & Billing Acceptance Report

**Run date:** 2026-10-28  
**Overall status: RED — NOT ACCEPTED**  
**Evidence level:** Current source inspection, 43 billing tests (including a database-backed route/lifecycle suite), 34 additional focused tests, targeted ESLint, full-project typecheck, and a successful production build. No browser or live Razorpay test-mode evidence was obtained.

This report replaces prior assertions that described mocked or historical checks as end-to-end acceptance. The supplied feature brief was provided in the user attachment; no separate requirements document was found in the repository. The repository contains prior audit notes under `docs/subscription-billing/`; those are treated as historical claims, not current-run evidence.

## Safety and environment

- Git worktree was clean on branch `main` at the first audit start; source changes are described below.
- The active `.env` points to a hosted MongoDB Atlas database named `aupulens-erp`. Its URI and credentials are intentionally omitted here. This is not a disposable test database.
- Razorpay key ID, key secret, and webhook secret are absent from the local `.env` (presence checked without printing values).
- The database-backed billing suite uses a unique per-run database, verifies loopback and replica-set identity before fixture writes, and performs fixture-scoped cleanup. It passed against a disposable one-node local replica set under `/tmp`; the hosted Atlas database was not used.
- No browser automation configuration/provider test credentials were verified. No real payments or provider calls were attempted.
- The attached brief specifies a three-day grace period; post-grace access, retry schedule, and maximum attempts are unresolved business decisions.

## Evidence labels

- **GREEN — FOCUSED TESTS ONLY**: limited current-run test evidence for the specified behavior; not end-to-end acceptance.
- **RED — FAILED**: source inspection found missing, unsafe, or contradictory behavior.
- **RED — BLOCKED**: required execution depends on unavailable safe environment, provider, or business decision.
- **NOT RUN**: no current-run verification evidence.

## Requirement checklist

The detailed test cases and commands are in [the test matrix](AUPULENS_SUBSCRIPTION_BILLING_TEST_MATRIX.md). `Code evidence` refers to current source inspection only unless a test is explicitly named.

### Customer portal — `SUB-PORTAL-*`

| ID | Required behavior | Current implementation evidence | Status |
|---|---|---|---|
| SUB-PORTAL-01 | Show persisted current plan | `/api/billing/subscription`; `app/admin/billing/page.tsx`; `SaaSSubscription` | NOT RUN (route/UI persistence) |
| SUB-PORTAL-02 | Show persisted subscription state across active, trial, pending, past-due, cancelled, expired, suspended | subscription model includes these states; no current state-by-state UI run | NOT RUN |
| SUB-PORTAL-03 | Show authoritative amount and currency | subscription route and persisted `currentPrice`/`currency` | NOT RUN |
| SUB-PORTAL-04 | Show monthly/yearly cycle and paid-through/renewal dates | subscription model and customer billing page | NOT RUN |
| SUB-PORTAL-05 | Show plan features and usage limits from configured entitlements | plan catalog/entitlement resolver; no UI/backend persisted check | NOT RUN |
| SUB-PORTAL-06 | Show supported upgrade/change/cancel/manage actions | billing page and corresponding routes exist | NOT RUN |
| SUB-PORTAL-07 | Loading, missing-data, empty, and error states do not fabricate defaults | no browser/network-state verification | NOT RUN |
| SUB-PORTAL-08 | Billing history presents status, date, amount, currency, reference, subscription, document, refund | history route and page exist | NOT RUN |
| SUB-PORTAL-09 | Filters, pagination, detail view, and document access are correct | current behavior not exercised | NOT RUN |
| SUB-PORTAL-10 | Responsive mobile/desktop portal works | no browser viewport run | NOT RUN |

### Plans and changes — `SUB-PLANS-*`

| ID | Required behavior | Current implementation evidence | Status |
|---|---|---|---|
| SUB-PLANS-01 | Cards/comparison derive prices, features, limits from authoritative catalog | `/api/billing/plans`, plan catalog; unit math tests only | GREEN — FOCUSED TESTS ONLY (pricing calculations only) |
| SUB-PLANS-02 | Monthly and annual prices/cycles are accurate and identify current plan | not verified against customer UI or persisted config | NOT RUN |
| SUB-PLANS-03 | Unavailable plans/actions and loading/error/empty states are handled | not exercised | NOT RUN |
| SUB-PLANS-04 | Upgrade eligibility is checked on server | initiate/preview routes and manager exist; no current negative route test | NOT RUN |
| SUB-PLANS-05 | Preview discloses amount, tax, cycle, effective date, renewal, proration | preview endpoint exists; UI display not verified | NOT RUN |
| SUB-PLANS-06 | Proration is server calculated using approved policy | `lib/billing/proration.ts`; 15-test suite passes but does not establish full business-policy approval | GREEN — FOCUSED TESTS ONLY |
| SUB-PLANS-07 | Failed/unverified payment does not grant upgraded entitlements | verified code path is present; DB-backed integration test not run | NOT RUN |
| SUB-PLANS-08 | Successful server-verified payment applies upgrade and entitlements | manager and verifier exist; no provider/persisted end-to-end proof | NOT RUN |
| SUB-PLANS-09 | Downgrade is scheduled for next billing date, with limits/effective date disclosed | route, scheduler, UI exist; lifecycle test not run | NOT RUN |
| SUB-PLANS-10 | Changes preserve customer data and usage history | no migration/lifecycle evidence | NOT RUN |
| SUB-PLANS-11 | Duplicate/concurrent conflicting changes are prevented | no concurrent DB test run | NOT RUN |

### Checkout, payment, renewal — `SUB-PAY-*`

| ID | Required behavior | Current implementation evidence | Status |
|---|---|---|---|
| SUB-PAY-01 | Server validates plan, tenant, amount, and currency | order/upgrade service and API exist; no current API security execution | NOT RUN |
| SUB-PAY-02 | Pending/failed/cancelled checkout does not activate paid plan | no current provider lifecycle run | NOT RUN |
| SUB-PAY-03 | Order/payment references persist under correct tenant | schema/service exist; DB run blocked | RED — BLOCKED |
| SUB-PAY-04 | Valid Razorpay payment signature/state verified server side | HMAC implementation exists; only local signature unit evidence | GREEN — FOCUSED TESTS ONLY |
| SUB-PAY-05 | Invalid signature, amount/currency mismatch, wrong tenant/reference rejected | manager verifies payment/order relation; provider state check compares captured state, amount and currency; signed webhook validates tenant/order/amount/currency | GREEN — FOCUSED TESTS ONLY for missing-config checks; negative provider/API cases NOT RUN |
| SUB-PAY-06 | Forged frontend success and replayed confirmation rejected/idempotent | provider state is fetched before activation; already successful payments reapply upgrade reconciliation and invoice lookup is sequentially idempotent; no current DB/API execution | NOT RUN |
| SUB-PAY-07 | Duplicate and out-of-order webhooks reconcile idempotently | atomic event claim/lease and provider capture verification added; DB-backed concurrency tests not run | NOT RUN |
| SUB-PAY-08 | Provider timeout/retry and DB failure preserve verified event safely | no current fault-injection execution | NOT RUN |
| SUB-PAY-09 | Test-mode checkout reaches Razorpay using test credentials | no key ID/secret; no attempt made | RED — BLOCKED |
| SUB-PAY-10 | Automatic renewals require customer-authorized AutoPay mandate | model has flags but no customer mandate creation/authorization route or UI found | RED — FAILED |
| SUB-PAY-11 | Provider authorization state is persisted and reconciled | no mandate flow found | RED — FAILED |
| SUB-PAY-12 | Authorized renewal uses supported Razorpay recurring lifecycle | no customer mandate/charge API exists; fake success renewal path removed; paid due renewals enter grace without fake payment/invoice | RED — FAILED (safe fail-closed behavior implemented) |
| SUB-PAY-13 | Renewal success/failure updates dates/states and notifications/retries | scheduler exists; no current end-to-end lifecycle test | NOT RUN |
| SUB-PAY-14 | Three-day grace is applied and recovery restores state | source contains grace flow; no current persisted test | NOT RUN |
| SUB-PAY-15 | Retry timing/max attempts and after-grace access policy follow approved configuration | brief leaves decisions unresolved; current scheduler suspends after grace | RED — BLOCKED |
| SUB-PAY-16 | Cancellation prevents future recurring charges | cancellation/sweep code exists; recurring provider linkage unverified | NOT RUN |
| SUB-PAY-17 | Renewal history is visible to customer and Global Admin | UI/API routes exist; no dataset/UI verification | NOT RUN |

### Invoices, receipts, GST, refunds — `SUB-DOC-*`

| ID | Required behavior | Current implementation evidence | Status |
|---|---|---|---|
| SUB-DOC-01 | Billing history reconciles payments and linked subscription/documents | no DB-backed reconciliation run | RED — BLOCKED |
| SUB-DOC-02 | Invoice numbers remain unique/stable under retry and concurrency | invoice generator/model exist; no concurrent DB test run | NOT RUN |
| SUB-DOC-03 | Invoice includes seller/customer, date, description, period, taxable amount, taxes, total, currency, reference/address/GSTIN | generator/PDF code exists; rendered documents not inspected this run | NOT RUN |
| SUB-DOC-04 | GST calculation follows configured tax treatment, rounding and zero-tax cases | pure proration/GST tests pass; legal treatment/accountant approval absent | GREEN — FOCUSED TESTS ONLY (math only); compliance RED — BLOCKED |
| SUB-DOC-05 | PDF invoice/receipt generates and customer can download securely | generator and route exist; no current PDF/UI/download run | NOT RUN |
| SUB-DOC-06 | Invalid/foreign/missing document references are denied safely | no current authorization execution | NOT RUN |
| SUB-DOC-07 | Unverified/failed payment never receives paid receipt | no persisted lifecycle test | NOT RUN |
| SUB-DOC-08 | Refund status reconciles to verified provider state; duplicates prevented | provider call required; atomic local reservation and refund webhook reconciliation added. Missing-credential guard tested; provider/database paths not run. | GREEN — FOCUSED TESTS ONLY (configuration guard); provider E2E NOT RUN |
| SUB-DOC-09 | Refunds create traceable adjustment/credit note without overwriting invoices | Original invoice is no longer rewritten. No credit-note model/document lifecycle was found or implemented. | RED — FAILED |
| SUB-DOC-10 | Refund authorization follows approved policy | no approved policy found; route permits Global Admin action | RED — BLOCKED |
| SUB-DOC-11 | Payment/invoice/receipt/refund/credit-note records reconcile | no persisted reconciliation test | RED — BLOCKED |
| SUB-DOC-12 | Customer payment/failure/cancellation/renewal notifications are delivered | notification delivery provider not verified; previous report describes stubbed email | RED — BLOCKED |

### Global Admin — `SUB-ADMIN-*`

| ID | Required behavior | Current implementation evidence | Status |
|---|---|---|---|
| SUB-ADMIN-01 | Identify tenants upgraded in selected month | overview/upgrades routes and admin page exist; no current data run | NOT RUN |
| SUB-ADMIN-02 | Upgrade record shows tenant, old/new plans, timestamp, cycle, status, effective date, amount/currency, payment, invoice, proration | API mapping exists by source inspection; values not reconciled | NOT RUN |
| SUB-ADMIN-03 | Filters cover date, plan, upgrade/payment status, cycle, tenant | page/route exist; not exercised | NOT RUN |
| SUB-ADMIN-04 | Tenant timeline links to payments and invoices | not verified in UI | NOT RUN |
| SUB-ADMIN-05 | New subscriptions, renewals, downgrades, cancellations, reactivations distinguish from upgrades | aggregation/category semantics not independently tested | NOT RUN |
| SUB-ADMIN-06 | Successful upgrades separated from pending/failed attempts | not verified against records | NOT RUN |
| SUB-ADMIN-07 | Admin operations enforce Global Admin authorization | `verifyGlobalAdmin` calls inspected in platform billing routes; negative role tests not run | GREEN — FOCUSED TESTS ONLY (source only is insufficient for acceptance); E2E NOT RUN |

### Analytics — `SUB-KPI-*`

| ID | Required behavior | Current implementation evidence | Status |
|---|---|---|---|
| SUB-KPI-01 | New paid subscriptions and upgrade counts/conversion denominator correct | current synthetic fixture reconciliation not run | NOT RUN |
| SUB-KPI-02 | Plan counts and movement correct | not run | NOT RUN |
| SUB-KPI-03 | Gross collections, refunds, net collections definitions consistent | overview/export code exists; independent reconciliation not run | NOT RUN |
| SUB-KPI-04 | MRR/ARR exclude one-time payments and use consistent annual normalization | formula visible in overview route; synthetic record validation not run | NOT RUN |
| SUB-KPI-05 | Renewal success/failure counts and values correct | not run | NOT RUN |
| SUB-KPI-06 | Past-due, cancellations, subscriber churn, revenue churn correct | formulas not independently reconciled | NOT RUN |
| SUB-KPI-07 | Trend charts and plan distribution match API/persisted records | no UI/API fixture comparison | NOT RUN |
| SUB-KPI-08 | Month/timezone boundaries, pending/failure/refund cases correct | not run | NOT RUN |
| SUB-KPI-09 | Export uses same filters and metric definitions as dashboard | export route exists; no output comparison | NOT RUN |

### Entitlements — `SUB-ENT-*`

| ID | Required behavior | Current implementation evidence | Status |
|---|---|---|---|
| SUB-ENT-01 | Paid entitlements change only after verified payment | service structure inspected; persisted integration test not run | NOT RUN |
| SUB-ENT-02 | Scheduled downgrade retains current tier until effective date | scheduler code inspected; no DB lifecycle test | NOT RUN |
| SUB-ENT-03 | Cancellation retains paid access until paid-through date | manager stores paid-through effective date; entitlement enforcement interaction not demonstrated | NOT RUN |
| SUB-ENT-04 | Expiry/suspension enforce approved access policy server side | scheduler and entitlement middleware exist; policy unresolved | RED — BLOCKED |
| SUB-ENT-05 | Plan change preserves tenant records and usage | no persisted history/usage comparison | NOT RUN |

### Security, tenant scope, webhook — `SUB-SEC-*`

| ID | Required behavior | Current implementation evidence | Status |
|---|---|---|---|
| SUB-SEC-01 | Authenticated tenant is derived from trusted session for all customer routes | source and existing auth tests; no current route-matrix execution | NOT RUN |
| SUB-SEC-02 | Tenant A cannot read/change Tenant B subscription, history, payment, invoice or PDF | DB-backed isolation tests not run | RED — BLOCKED |
| SUB-SEC-03 | Forged tenant in body/header/query/path rejected | no complete mutation/read attack matrix run | NOT RUN |
| SUB-SEC-04 | Cancel/refund/global analytics/export require authorized roles | source guards exist; negative endpoint execution not run | NOT RUN |
| SUB-SEC-05 | Webhook signature and event identity are verified; invalid events rejected | HMAC unit tests only; no HTTP event test this run | GREEN — FOCUSED TESTS ONLY |
| SUB-SEC-06 | Cross-tenant payment-reference substitution rejected | no current route test | NOT RUN |
| SUB-SEC-07 | Secrets/payment data not exposed to client or audit logs | no bundle/log scan in this run | NOT RUN |
| SUB-SEC-08 | Cache/AI responses cannot leak billing data across tenants | no targeted test | NOT RUN |

### Audit and exports — `SUB-AUDIT-*`

| ID | Required behavior | Current implementation evidence | Status |
|---|---|---|---|
| SUB-AUDIT-01 | Plan/price/admin/payment/refund/document/cancel/reactivate/entitlement changes are audited | subscription event model/helpers exist; completeness not tested | NOT RUN |
| SUB-AUDIT-02 | Audit records include actor, tenant, time, action, references without secrets | no current record inspection | NOT RUN |
| SUB-AUDIT-03 | Clients cannot forge or erase audit events; tenant reads are scoped | no current security test | NOT RUN |
| SUB-AUDIT-04 | CSV export authorization, filtering, spreadsheet safety, reconciliation | export route exists; no current output/authorization test | NOT RUN |

### End-to-end workflows — `SUB-E2E-*`

| ID | Workflow | Status |
|---|---|---|
| SUB-E2E-01 | New paid subscription through UI, verified provider payment, persistence, entitlements, invoice, history, admin, reload | RED — BLOCKED (provider keys absent; no safe DB/browser test environment) |
| SUB-E2E-02 | Upgrade preview, failed and verified payment, entitlement, invoice, audit, replay | RED — BLOCKED |
| SUB-E2E-03 | Scheduled downgrade and effective-date/limits/data preservation | RED — BLOCKED |
| SUB-E2E-04 | Authorized automatic renewal, failure, retry, grace, recovery, duplicate webhook | RED — FAILED (mandate flow absent); execution also blocked |
| SUB-E2E-05 | Cancellation, paid-through access, stopped renewals, reactivation | RED — BLOCKED |
| SUB-E2E-06 | Pending/failure/cancellation/timeout/signature/amount/delayed webhook cases | RED — BLOCKED |
| SUB-E2E-07 | Invoice/refund/credit note and accounting reconciliation | RED — BLOCKED |
| SUB-E2E-08 | Admin reporting and exports reconciled to known dataset | RED — BLOCKED |
| SUB-E2E-09 | Two-tenant and multi-role isolation across customer/admin/provider flows | RED — BLOCKED |

## Route inventory

Customer billing endpoints found:

| Method | Route | Purpose (source inspection) |
|---|---|---|
| GET | `/api/billing/plans` | plan catalog |
| GET | `/api/billing/subscription` | current subscription overview |
| GET | `/api/billing/history` | customer payment/history |
| GET | `/api/billing/invoices` | invoice list |
| GET | `/api/billing/invoices/[id]` | invoice detail |
| GET | `/api/billing/invoices/[id]/pdf` | invoice PDF |
| POST | `/api/billing/upgrade/preview` | upgrade quote |
| POST | `/api/billing/upgrade/initiate` | create order/payment attempt |
| POST | `/api/billing/upgrade/verify` | verify checkout signature and apply change |
| POST | `/api/billing/downgrade/schedule` | schedule downgrade |
| DELETE | `/api/billing/downgrade/schedule` | cancel scheduled downgrade |
| POST | `/api/billing/subscription/cancel` | cancel subscription |
| POST | `/api/billing/subscription/reactivate` | reactivate subscription |
| POST | `/api/billing/webhooks/razorpay` | provider webhook |

Global Admin and scheduler endpoints found:

| Method | Route | Purpose (source inspection) |
|---|---|---|
| GET | `/api/platform/billing/overview` | billing KPIs |
| GET | `/api/platform/billing/upgrades` | upgrade tracking |
| GET | `/api/platform/billing/subscriptions` | tenant subscription listing |
| GET | `/api/platform/billing/export` | billing CSV export |
| POST | `/api/platform/billing/refund` | admin refund action |
| GET | `/api/cron/billing/sweep` | scheduled billing lifecycle sweep |

No customer AutoPay authorization, mandate creation, or revocation route was found. Route inventory is filesystem/source discovery, not proof that each method is reachable or authorized correctly.

## Changes made during this audit

- Test-only order creation and fallback HMAC secrets are now restricted to `NODE_ENV=test`; production runtimes without provider credentials fail closed.
- Client-side upgrade verification fetches the provider payment and checks captured status, order, amount and currency. Captured-payment webhooks use provider-authenticated event data instead of a generated test signature.
- Webhook events have a processing lease and duplicate claim guard. Unsupported subscription-charge webhooks no longer extend paid-through dates without accounting records.
- The renewal sweep no longer creates fake successful payments, provider IDs, or invoices. Paid renewals without the supported provider lifecycle are blocked and enter the specified three-day grace period with an audit event; free-plan period rollover remains local.
- Refunds now require provider configuration and captured payment, validate amount, reserve the operation before provider call, persist provider refund state, and do not overwrite issued invoices. A timeout leaves the reservation pending for reconciliation to prevent a blind duplicate.
- Database-backed route coverage exposed and fixed an implicit empty refund subdocument on every payment, which caused the duplicate-refund guard to reject first-time refunds. The route now has a passing integration regression test with the provider response stubbed at the external API boundary; this is not live Razorpay acceptance.
- Invoice generation checks for an existing payment invoice before creating another on a sequential retry.
- Upgrade initiation and preview now reject invalid billing cycles and unknown plan keys before using prices.
- Regression tests cover the missing-credential refund guard and production fail-closed payment/signature behavior. Database-backed local lifecycle coverage is limited to the executed billing suite; no real provider acceptance was obtained.

## Current quality-gate results

| Exact command | Exit/result | Limits |
|---|---|---|
| `QA_DISPOSABLE_MONGO_PORT=27019 npx vitest run tests/billing/` | Exit 0; 3 files and 43 tests passed | Disposable local one-node replica set; unique per-run fixture database. No live provider calls. |
| `npx vitest run tests/billing/saasSubscriptionBilling.test.ts tests/billing/organizationSubscriptionStatus.test.ts tests/integrations/webhookVerify.test.ts` | Exit 0; 3 files and 34 tests passed | Focused, database-independent tests. |
| `npx eslint app/admin/billing/page.tsx 'app/platform/(app)/billing/page.tsx' app/api/billing app/api/platform/billing lib/billing models/billing/BillingWebhookEvent.ts models/billing/BillingPayment.ts tests/billing lib/constants/statuses.ts` | Exit 0; clean | Targeted lint only. |
| `npx tsc --noEmit` | Exit 0 | Full-project typecheck, rerun after production build to avoid generated `.next/types` race. |
| `npm run build` | Exit 0; 581/581 static pages generated | Production build passed; does not establish browser/provider E2E acceptance. |
| Browser E2E, Razorpay test mode, full `npm test` | NOT RUN / BLOCKED | Missing provider keys and browser fixtures. No real payment was initiated. |

## Role and tenant authorization matrix

| Actor | Customer subscription/history/invoices | Own plan changes/cancel/reactivate | Global billing/admin/refund/export | Provider webhook |
|---|---|---|---|---|
| Unauthenticated | Must deny; NOT RUN | Must deny; NOT RUN | Must deny; NOT RUN | Must require valid provider signature; focused crypto only |
| Tenant user/admin | Own tenant only; NOT RUN | Role-specific controls NOT RUN | Must deny; source guards inspected only | Not applicable |
| Global Admin | Admin views expected; NOT RUN | No tenant impersonation behavior verified | Source guard found; runtime tests NOT RUN | Not applicable |
| Razorpay | Not applicable | Not applicable | Not applicable | Signed provider events only; no live test performed |

## Outstanding decisions and blockers

1. Configure Razorpay test credentials and webhook secret in a dedicated test environment; do not use live credentials.
2. Define and implement customer AutoPay mandate authorization/reconciliation before automatic charges are enabled.
3. Approve retry cadence/attempt cap and post-three-day grace access policy. Current code transitions past-due to suspended, but the attached brief leaves access behavior unresolved.
4. Confirm tax treatment and invoice fields with the company's accountant; code-level arithmetic does not establish tax compliance.
5. Define refund authorization policy and whether credit notes are mandatory for full/partial refunds.
6. Establish disposable local MongoDB replica-set database and an automated test URI guard before lifecycle tests.
7. Establish browser automation/test account fixtures and verify customer/admin UI, browser console, network failures, and persisted state.

No mandatory requirement qualifies for **GREEN — E2E VERIFIED**. The overall result remains **RED — NOT ACCEPTED**.
