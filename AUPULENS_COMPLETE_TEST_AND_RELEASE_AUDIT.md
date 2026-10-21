# Aupulens ERP complete test and release audit

**Status: INCOMPLETE — DATABASE-BACKED FAILURES NEED SAFE REPRODUCTION.** A later full-suite output supplied by the user completed with 10 failures, 2,781 passes, and 7 skips. The module-gating test passes independently. The quote endpoint regression has been fixed, and the two posting test suites now use unique disposable database names to prevent concurrent runs from sharing/drop-cleaning their fixtures. Those Mongo-backed fixes could not be rerun here because localhost Mongo is unavailable and the available listener is unknown. Production build and browser behavior remain unverified for the latest changes. This is not release approval.

## Scope and safeguards

This audit continues the AI conversation-memory work documented in [AUPULENS_AI_MEMORY_IMPLEMENTATION_REPORT.md](./AUPULENS_AI_MEMORY_IMPLEMENTATION_REPORT.md) and [AUPULENS_AI_MEMORY_TEST_TRIAGE_REPORT.md](./AUPULENS_AI_MEMORY_TEST_TRIAGE_REPORT.md). Existing feature-branch changes were preserved. No production database, deployment, customer data, migration, or credential was touched. No secret values were copied into this report.

The repository is on branch `main` with the memory implementation and its earlier triage fixes already uncommitted. The initial audit diff covered 37 tracked files (682 insertions, 399 deletions) plus the two memory reports and new context/model/test files. `git diff --check` passed at the end of this audit. The complete implementation diff remains reviewable in the working tree; no reset or checkout was used.

Vitest uses `vitest.config.ts` with Node, a 20-second test timeout and 60-second hook timeout. There is no global Mongo fixture. Many suites connect directly to localhost test databases, often using `MONGODB_URI`, and several call `dropDatabase()` during teardown. The two conversation-memory integration suites hardcode `127.0.0.1` test database names. The shell had no inherited `MONGODB_URI`; the full run explicitly overrode it with a localhost-only test URI:

```text
MONGODB_URI='mongodb://127.0.0.1:27017/aupulens_test_codex_full_audit' npm test -- --reporter=verbose --maxWorkers=1
```

Prior read-only connectivity checks returned `MongoServerSelectionError: connect EPERM 127.0.0.1:27017`. A disposable Mongo server could not be started under the sandbox; an attempted `mongod` reported address-in-use after the socket restriction was bypassed, and that unknown listener was not contacted. Per-suite test DB overrides also point to localhost. Thus no Atlas or production database URI was used and no database cleanup reached a server.

## Full-suite runs and reproduced failures

The earlier audit's own one-worker run stopped without a final summary during `tests/accounting/coa.test.ts`; this remains an incomplete run, not a failure count. The user then supplied a separate completed full-suite result:

```text
Test Files  3 failed | 266 passed (269)
Tests       10 failed | 2781 passed | 7 skipped (2798)
Duration    465.87s
```

The pasted output lists all ten failures. Eight are in two accounting posting integration files and two root causes are represented: seven customer-payment cases (one journal lookup returned null and six later cases could not find seeded bank account `1120`) and one sales-invoice GST case (journal lookup returned null). One quote conversion test received 201 on its second POST instead of its expected 409. The pasted output contains no Mongo server error for these failures; the first two are data/setup symptoms, not evidence that the database server itself logged an error.

The named `tests/saas/moduleGate.test.ts` item is not among the failures in that summary. I reran it after the report was supplied:

```text
npx vitest run tests/saas/moduleGate.test.ts --reporter=verbose
Test Files  1 passed (1)
Tests       114 passed (114)
```

It is an in-memory unit suite with no database access, and no code change was needed there.

The quote-conversion route now returns HTTP 409 when a quote already has `convertedInvoiceId` or an invoiced status. The lower-level conversion service remains idempotent for internal retries. The existing regression assertion for a second explicit POST remains unchanged. I added a database-free route test for this branch; it passes. The two posting test files now connect to unique per-invocation database names. This addresses potential interference from concurrent runs, though the precise cause of the missing account/journal symptoms is not established. Because the local Mongo service could not be reached safely, neither posting suite could be rerun here; those two failures remain unconfirmed after the test-isolation change.

The verbose run from this audit was redirected to `/tmp/aupulens-complete-audit-vitest.log`. It began, executed tests, and then stopped progressing at the final captured tests:

```text
↓ tests/accounting/coa.test.ts > Chart of Accounts Models > enforces tenant isolation and compound uniqueness on AccountType
↓ tests/accounting/coa.test.ts > Chart of Accounts Models > enforces tenant isolation and compound uniqueness on Account
```

At that point the log contained 72 passing and 1,128 skipped test-result lines, no `FAIL`, assertion error, or Vitest summary. These are partial progress counts only, not a suite result. The runner process had disappeared and the log timestamp stopped changing; I interrupted the still-open stale session. Therefore this run cannot establish a full-suite result.

The earlier JSON run recorded in the memory triage report is separate: 2,796 assertions, 1,493 passed, 48 failed, 1,255 skipped, and 267 files with failed suite status. Its 48 failed assertions were traced to six stale unit-test fixtures missing mocks for the new credit boundary/context functions and were repaired. The report records that targeted reruns passed. Do not combine those historical figures with this incomplete verbose run.

### Failure and blocker inventory

No new assertion failure was visible in the captured portion of the current full-suite log. The complete failure inventory available from the prior run is in the memory triage report:

| Area | Test files / cases | Finding | Classification and impact |
|---|---|---|---|
| Unit fixture drift | `aiSafetyGuards`, `manufacturingAiRouteGating`, `usageSummaryRoute`, `windowUsageLifecycle`, `saas/aiLimits`, `language/tenantAiIntegration` | Prior errors were Mongoose ledger buffering timeouts or unexpected route 500s because tests did not mock the newer credit boundary or context APIs. Fixtures were updated without weakening assertions; the triage report records 140 focused assertions passing. | Confirmed test-fixture mismatch, fixed. These are not persistence integration coverage. |
| Conversation persistence | `tests/ai/conversationContext.integration.test.ts` | `MongooseServerSelectionError: connect EPERM 127.0.0.1:27017` in `beforeAll` at `mongoose.connect`; test bodies were skipped. | Environment blocked. Active transcript restore, retry persistence, cross-user/tenant/module access, older-chat retrieval and summary concurrency cannot be release-verified here. |
| Credit ledger integration | `tests/ai/usageIndicator.integration.test.ts` | Same localhost Mongo connection error in `beforeAll` at `mongoose.connect`. | Environment blocked. Concurrent idempotency, accounting and refund behavior need an isolated working Mongo test service. |
| Regional command automation | `tests/ai/language/regionalCommandAutomation.test.ts` | Earlier run reported 403/no provider call; source inspection showed the isolated fixture omitted `AiCostRate` for `azure-test-deployment`. A test rate seed was added. | Confirmed fixture omission; fix is present, persistence path still requires Mongo integration rerun. |
| Admin session duplicate key | `tests/platform/adminSessions.test.ts` | Earlier report described `E11000` for unique `AdminRole.role=global_super_admin`; setup recreates roles while cleanup leaves them. Current sandbox rerun could not reach `beforeAll` due localhost Mongo failure, so duplicate-key cause is plausible but unconfirmed. | Undetermined isolation issue; must be reproduced with disposable Mongo before release. |
| AI runtime and skipped-only suites | `tests/ai/aiRuntime/*`, `tests/migration/e2eWorker.test.ts`, and the skipped-only paths listed in the memory triage report | Prior JSON reporter serialized suite status as failed but included zero failed assertions and blank error payloads. | Undetermined. Capture normal reporter output in the intended CI environment; do not call these unrelated or passing based on empty JSON fields. |
| Full suite in user-provided output | 269 files / 2,798 tests | 3 files failed, 10 tests failed, 266 files passed, 2,781 tests passed, 7 skipped. Eight failures were database-backed posting tests; one was repeat quote conversion returning 201 rather than 409. | Quote endpoint fixed. Posting failures likely involve test DB fixture isolation; unique DB names added but require safe Mongo rerun to confirm. |
| Full suite in this audit | all discovered tests | Runner ceased progress at `tests/accounting/coa.test.ts`; no final summary or process remained. | Incomplete. No root cause established for the runner stopping. |

The regional-command provider test’s setup and the Mongo integration suite should be rerun in a controlled disposable database after the current localhost Mongo restriction is removed. Do not rerun destructive teardown suites against Atlas or a shared developer database.

## Memory-specific review

The implementation uses the authenticated tenant/user/module plus server conversation ID to load authoritative stored history; it ignores client-authored transcript snapshots. It appends the incoming user message once, bounds long transcripts while retaining recent and selected older context, and retrieves cross-chat summaries/excerpts by keyword within authorized scopes. Completed exchanges carry request IDs; sequential retries can return the saved response. Summary updates use message-count compare-and-set. Preference lookup failures now fail closed for cross-chat recall. The CRM scope enum gap was fixed and covered by a schema test.

The memory API scopes reads/writes by tenant and owner/workspace permission. Explicit memory facts can be inspected, corrected, deleted, or disabled in the UI. Disabling memory suppresses cross-chat facts while leaving active-chat history available. Existing test coverage includes unit tests for long-thread selection, authoritative-history helpers, preference-failure behavior, and schema scope validation.

The current integration tests intended to verify stable IDs/reload, owner and tenant isolation, saved retry behavior, retrieval beyond recent chats, and durable stream completion could not reach Mongo. Concurrent duplicate-turn persistence and summary freshness remain integration-unverified. Streaming interruption does not save a durable pending/failed assistant turn; tool calls and attachments are not persisted as structured provider-neutral transcript entries. Cross-chat lookup is bounded keyword matching, not semantic search. Memory deletion removes the explicit saved fact but does not erase the source chat transcript/summary. These are documented feature limitations, not newly confirmed test regressions; include them in manual QA expectations.

## Verification results

| Command/check | Result |
|---|---|
| `MONGODB_URI='mongodb://127.0.0.1:27017/aupulens_test_codex_full_audit' npm test -- --reporter=verbose --maxWorkers=1` | Incomplete; log ended during `tests/accounting/coa.test.ts`, no final summary. Partial log: 72 pass lines, 1,128 skip lines, no visible test failure. |
| User-provided full-suite output | Failed: 3 files, 10 tests; 266 files and 2,781 tests passed; 7 skipped. Output excerpt is retained in the supplied attachment, not the repository. |
| `npx vitest run tests/saas/moduleGate.test.ts --reporter=verbose` | Passed; 1 file, 114 tests. |
| `npx vitest run tests/sales/quoteConversionAlreadyInvoiced.test.ts tests/saas/moduleGate.test.ts --reporter=dot` | Passed; 2 files, 115 tests. |
| `npx eslint app/api/sales/quotes/[id]/convert-to-invoice/route.ts tests/accounting/customerPaymentPosting.test.ts tests/accounting/salesInvoicePosting.test.ts tests/sales/quotes.route.test.ts` | Passed; no diagnostics. |
| `npm run build` after the latest patch | Compiled successfully and entered Next.js lint/type validation, but the runner process disappeared before a final status; treat as incomplete. |
| `npm run build` | Passed; Next.js 15.5.18 compiled, completed lint/type validation, generated 549 static pages, and finalized traces. |
| `npm run lint` | Started, produced no diagnostics, but its process disappeared without an exit status while the exec session remained open. Session was stopped as stale. Treat as unverified; a prior changed-file ESLint run passed per memory triage report. |
| `timeout 90s npx eslint` on the 37 changed/new TypeScript implementation and test files | Passed; exit 0, no diagnostics. |
| `npx tsc --noEmit` (first attempt, concurrent with build) | Failed with TS6053 for missing `.next/types/...` files while `next build` was regenerating `.next`; this is a generated-file race. |
| `npx tsc --noEmit` (after build) | Started with no diagnostics, but process disappeared without an exit status and the session remained open; stopped as stale. Treat standalone typecheck as unverified. The production build’s own type validation passed. |
| Focused memory/context/AI tests | Earlier triage recorded 140 passed, 5 skipped; the integration file failed before test bodies due localhost `EPERM`. A separate mock-based fixture batch recorded 81/81 passing. This audit did not get a fresh full focused rerun. |
| Mongo integration suites | Blocked before test bodies by localhost Mongo `EPERM`; no database reached. |
| `git diff --check` | Passed. |
| Browser/manual QA | Not run. No Playwright/Cypress configuration was found in the repository scan. |

## Release recommendation

**INCOMPLETE — DATABASE-BACKED FAILURES NEED SAFE REPRODUCTION.** The module-gating tests are green and the explicit second quote conversion now returns the expected 409 in a database-free route test. Rerun `customerPaymentPosting.test.ts`, `salesInvoicePosting.test.ts`, and `quotes.route.test.ts` against a disposable local Mongo instance before concluding the accounting issue is resolved. Then rerun the full suite to completion and execute the memory/usage integration tests against that same isolated service. Do not use Atlas or production data. Browser QA and the `adminSessions` duplicate-key investigation also remain outstanding.
