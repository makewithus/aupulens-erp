# Aupulens AI memory test triage and release readiness

**Status: BLOCKED BY TEST ENVIRONMENT.** The isolated regression fixes and static checks pass. The server-backed transcript and credit-ledger integration tests cannot connect to the configured local test MongoDB from this environment, so owner/tenant isolation, retry behavior, summary concurrency, and ledger behavior have not been verified against MongoDB. Browser verification is also outstanding. Do not treat this as release approval.

## Scope and baseline

Read `AUPULENS_AI_MEMORY_IMPLEMENTATION_REPORT.md`, the repository test configuration, the memory/context implementation diff, the relevant test fixtures, and the Mongo test setup/teardown. The report provided for the earlier full run recorded 21 failed test files, 78 failed tests, and 93 skipped tests, but did not include the filenames, raw Vitest output, or a saved machine-readable report. Those exact 21 prior filenames and errors cannot be reconstructed from the report alone. A fresh baseline was captured at `/tmp/aupulens-vitest-triage.json` with:

```text
npm test -- --reporter=json --outputFile=/tmp/aupulens-vitest-triage.json
```

It exited 1 with 2,796 tests: 1,493 passed, 48 failed, and 1,255 skipped. Vitest reported 290 failed nested suites across 267 test files; many suite statuses had only skipped assertions and no serialized error message. This differs from the earlier aggregate, so the earlier and current results should not be compared as if they came from the same unchanged environment or test state.

The test config is Node/Vitest (`vitest.config.ts`), with 20-second test and 60-second hook timeouts. There is no global database fixture. Mongo suites connect directly to isolated `127.0.0.1:27017` database names, and several call `dropDatabase()` in teardown. They do not use the Atlas URI shown in the editor. Using the production URI for this triage would be unsafe and was not done.

Read-only connectivity checks failed with `MongoServerSelectionError: connect EPERM 127.0.0.1:27017 - Local (undefined:undefined)`. The selected integration suites below failed in `beforeAll` at `mongoose.connect`; no Mongo connection was established. One existing `adminSessions` teardown then tried `dropDatabase()` and itself failed with `MongooseError: Connection operation buffering timed out after 10000ms` before reaching a database. No database was modified. No production connection or destructive test operation was performed successfully.

## Failure inventory and disposition

The fresh full run had 48 assertion failures in six files. These were reproduced from the JSON report, traced to test-fixture drift introduced by the existing credit/context features, and corrected without changing their assertions or mocking the persistence integration tests. The exact error classes were:

| File | Failing test names / error | Cause and evidence | Disposition and release impact |
|---|---|---|---|
| `tests/ai/aiSafetyGuards.test.ts` | Three tests: “allows calls 1-3 … blocks the 4th”; “increments BOTH … counters”; “defaults the ceiling to 17000”. `aicreditledgers.find()` buffering timeout at Mongoose collection.js:187. | This unit suite already mocks provider, usage, and DB-facing quota behavior, but did not mock `reserveAiCredits`/`settleAiCredits`; the shared `tenantAi` wrapper therefore reached the real ledger. Not a memory regression. | Added an allow/no-op credit-boundary fixture. Re-run passed in the 140-test focused batch. |
| `tests/ai/manufacturingAiRouteGating.test.ts` | Four tests: ungated 200; disabled 403; monthly cap 403; continuation path 403. `AssertionError: expected 500 to be 200/403`, at test lines 74, 84, 98, 115. | The route now calls `getCompletedExchange` and `saveCompletedExchange`; the route unit mock exported only `loadConversationContext`, causing the route’s catch path to return 500. | Added the two missing context-I/O mocks. All gating assertions pass. |
| `tests/ai/usageSummaryRoute.test.ts` | Three tests: authenticated workspace response, sequential-user isolation, starter fallback. Vitest surfaced `Error: STACK_TRACE_ERROR` at test lines 19, 38, 51 because the route awaited unmocked `getAiCreditBalance`. | The endpoint now includes credit balance data; the fixture expected the old shape and mocked none of the new balance dependency. | Mocked the balance service and asserted its response/reset date. All tests pass. |
| `tests/ai/windowUsageLifecycle.test.ts` | Seven provider/window tests. Six surfaced `aicreditledgers.find()` buffering timeout; the provider-error and window-error tests consequently received the DB timeout instead of the expected error. | The suite is explicitly a mock-based lifecycle test and already mocks usage, provider, instrumentation, and window quota behavior. It omitted the newly used credit boundary. | Added the credit-boundary fixture. All tests pass. |
| `tests/saas/aiLimits.test.ts` | 21 tenant cap, provider, preference, rollover, and tenant-isolation tests. Most timed out on `aicreditledgers.find()`; provider failure cases reported the ledger timeout instead of `API error` / `Network timeout`. | The file documents that no real Mongo connection is made and mocks the existing usage/provider dependencies, but not the newer credit ledger service. | Added the credit-boundary fixture. All tests pass. |
| `tests/ai/language/tenantAiIntegration.test.ts` | Ten provider/language/stream tests. Ledger buffering timeout prevented provider and Sarvam assertions; the Azure failure test got the ledger timeout instead of `azure down`. | Provider and language clients are mocked; the suite did not mock the newly added credit reservation boundary. | Added the credit-boundary fixture. All tests pass. |

The initial full-run failed tests are enumerated in the source JSON above. Their names are grouped here to preserve the actionable test inventory without duplicating long repeated stack frames. The repeated Mongoose timeout stack was `node_modules/mongoose/lib/drivers/node-mongodb-native/collection.js:187:23`, followed by Node `listOnTimeout` / `processTimers`.

### MongoDB and AI integration failures

These failures were reproduced individually with:

```text
npx vitest run tests/ai/conversationContext.integration.test.ts tests/ai/usageIndicator.integration.test.ts tests/ai/language/regionalCommandAutomation.test.ts tests/platform/adminSessions.test.ts --reporter=verbose --maxWorkers=1
```

The four files failed before test bodies could run, with 34 tests skipped:

| File | Test names | Exact failure location | Classification / next step |
|---|---|---|---|
| `tests/ai/conversationContext.integration.test.ts` | “recalls the user's prior chat while excluding other users, tenants and archived chats”; “restores the complete active chat and ignores unverified client history”; “retrieves matching older chats beyond the recent-chat window”; “respects current role access when recalling chats from other modules”; “resumes a selected chat by its owner-scoped database id and saves completed streams durably”. | `MongooseServerSelectionError: connect EPERM 127.0.0.1:27017` at `tests/ai/conversationContext.integration.test.ts:15`, `mongoose.connect`. | Blocked by test environment. Run against a disposable, isolated Mongo instance in an approved test environment; do not point it at production. |
| `tests/ai/usageIndicator.integration.test.ts` | Provider/accounting/API; concurrent increments and tenant isolation; stream completion/refund; repeated idempotency key; quota-window rollover. | Same error at `tests/ai/usageIndicator.integration.test.ts:29`. | Blocked by test environment. This is the real credit-ledger integration coverage and cannot be replaced by the passing unit fixtures. |
| `tests/ai/language/regionalCommandAutomation.test.ts` | Ten regional-language invoice proposals; English path; repeated-command cache behavior. | Same error at `tests/ai/language/regionalCommandAutomation.test.ts:96`. | Blocked by test environment. Static inspection found its isolated DB did not seed `AiCostRate` for `azure-test-deployment`, although `tenantAi` now requires a rate before provider calls. Added a real rate seed in `beforeEach`; re-run against disposable Mongo is still required. |
| `tests/platform/adminSessions.test.ts` | Twelve admin-session list/revoke/permission/audit tests. | Same error at `tests/platform/adminSessions.test.ts:30`; teardown also hit a buffering timeout at line 48. | Environment-blocked in this run. The earlier report mentioned an `E11000` duplicate `AdminRole.role` (`global_super_admin`) from this suite. Its `beforeAll` unconditionally creates the same unique roles and its per-test cleanup leaves roles in place; stale/reused test DB state is a plausible isolation cause, but cannot be confirmed or safely repaired without a working disposable DB and a reproduction. |

The full-run JSON also marks a number of suites as failed while their recorded assertions are only skipped and their failure message is blank. Examples include the 35 `tests/ai/aiRuntime/*` files and `tests/migration/e2eWorker.test.ts`. Those are **undetermined**, not proven implementation regressions or proven environment failures. Capture normal Vitest reporter output for those suites in the intended CI/test environment before classifying them. No memory-specific code path was implicated by their JSON records.

### Regional-command tests

The earlier run reported 403 responses instead of 200 and no Azure classifier calls in `tests/ai/language/regionalCommandAutomation.test.ts`. The route’s AI call now checks for a configured model rate before calling the provider. The integration fixture created a fresh database and an organization/customer but no `AiCostRate`, while its model is `azure-test-deployment`; this is a confirmed fixture omission by source inspection. The fixture now seeds that model rate. It remains unverified because its `beforeAll` cannot connect to Mongo here. No assertion was weakened, and real proposal/confirmation persistence is still exercised when the integration can run.

### Usage and runtime tests

The six files in the table above account for all 48 assertion failures in the current full-run capture. The usage tests were mock-based and failed because credit persistence was not isolated; their test boundary is now complete. The real usage integration file (`usageIndicator.integration.test.ts`) is separately blocked at Mongo setup. `tests/ai/aiRuntime/*` suites in the JSON had no reported failing assertion or serialized error; they are not counted as confirmed failures and remain undetermined until run with normal output and working test services.

## Confirmed memory-specific findings

- The memory API allowed `crm` as a scope, but the `AiMemory` schema enum omitted it. A CRM memory write would fail validation. Added `crm` to the enum and a schema unit test.
- If the memory-preference lookup threw, context loading previously kept `memoryEnabled = true`, risking cross-chat recall despite a user opt-out during a transient DB error. It now fails closed by disabling cross-chat lookup for that request. A focused unit test verifies no prior-chat or saved-fact query occurs when that read fails.
- Same-chat context is loaded from the authenticated tenant/user/module and the server conversation ID; client history is ignored. Unit tests cover long-thread selection and authoritative-history helpers. Mongo integration tests for reload, owner isolation, older-chat retrieval, and persistent retry are blocked.
- Sequential duplicate request IDs are checked against the saved assistant turn, and the credit ledger has its own unique request ID. The integration test for repeat billing is blocked. Concurrent duplicate-turn persistence has not been verified against Mongo.
- Summary refresh uses a message-count compare-and-set, and failed summarization leaves raw chat history. Concurrent freshness behavior remains integration-unverified.
- The memory DELETE endpoint removes the explicit `AiMemory` document. It does not erase source chat messages or conversation summaries; a matching statement may still be recalled as transcript context. The UI/release QA must treat “delete saved fact” separately from “erase the conversation containing it.”
- Streaming routes save a completed exchange after stream success; interrupted streams do not create durable pending/failed turn records in this pipeline. Tool calls and attachments are not stored in a provider-neutral structured transcript. These are the implementation report’s documented limits.
- Cross-chat retrieval remains bounded keyword matching over summaries/excerpts, not semantic retrieval. No vector search, automatic fact extraction, or background summary queue was added.

## Fixes and verification in this triage

Test fixture updates: `tests/ai/aiSafetyGuards.test.ts`, `tests/ai/manufacturingAiRouteGating.test.ts`, `tests/ai/usageSummaryRoute.test.ts`, `tests/ai/windowUsageLifecycle.test.ts`, `tests/saas/aiLimits.test.ts`, and `tests/ai/language/tenantAiIntegration.test.ts`. The regional integration fixture now seeds its model price. Production safeguards: `models/ai/AiMemory.ts` now accepts CRM scope, and `lib/ai/conversationContext.ts` disables cross-chat recall when the preference lookup fails. Added `tests/ai/aiMemorySchema.test.ts` and `tests/ai/conversationMemoryPreference.test.ts`.

| Command | Result |
|---|---|
| `npx vitest run tests/ai/conversationContext.test.ts tests/ai/conversationContext.integration.test.ts tests/ai/aiMemory.test.ts tests/ai/aiMemorySchema.test.ts tests/ai/conversationMemoryPreference.test.ts tests/ai/financeAiRoute.test.ts tests/ai/adminAiRouteGating.test.ts tests/ai/manufacturingChatHistory.test.ts tests/ai/aiSafetyGuards.test.ts tests/ai/manufacturingAiRouteGating.test.ts tests/ai/usageSummaryRoute.test.ts tests/ai/windowUsageLifecycle.test.ts tests/saas/aiLimits.test.ts tests/ai/language/tenantAiIntegration.test.ts tests/ai/taskFlow/regional.test.ts --reporter=dot` | 14 files passed, 140 tests passed, 5 skipped; the one integration file failed in `beforeAll` with Mongo `EPERM`. |
| `npx vitest run tests/ai/manufacturingAiRouteGating.test.ts tests/ai/usageSummaryRoute.test.ts tests/ai/windowUsageLifecycle.test.ts tests/saas/aiLimits.test.ts tests/ai/language/tenantAiIntegration.test.ts --reporter=dot` | Passed before the final two memory-specific tests were added: 5 files, 75 tests. |
| `./node_modules/.bin/tsc --noEmit` | Passed. |
| `git diff --name-only -- '*.ts' '*.tsx' \| xargs npx eslint && npx eslint lib/ai/chatHistoryUtils.ts models/ai/AiMemoryPreference.ts tests/ai/aiMemorySchema.test.ts tests/ai/conversationMemoryPreference.test.ts` | Passed. |
| `npm run build` | Passed; compiled and generated all 549 static pages. |
| `git diff --check` | Passed. |
| `npm test -- --reporter=json --outputFile=/tmp/aupulens-vitest-triage.json` | Failed with the baseline inventory above; not rerun after fixture-only fixes. |
| Mongo integration rerun above | Blocked before test bodies by `connect EPERM`; no test database was reached. |
| Browser/manual workflow | Not performed in this session. |

Before release, run the Mongo integration suites against a disposable test database with explicit setup/cleanup approval, review the `adminSessions` duplicate-key isolation issue, capture standard reporter output for the skipped/blank-message suites, then perform browser checks for reload, same-chat follow-up, retry, delete, memory-off, cross-user/tenant isolation, and streaming interruption. No production deployment, customer data change, migration, or credential rotation was performed.


## Additional suite-status inventory with missing error payloads

The JSON reporter marked 126 additional files as failed, but each had zero failed assertions, only skipped tests, and an empty `message`. That is insufficient evidence to assign a cause or a stack location. These are listed verbatim so they are not silently dismissed; classify them as **undetermined** until rerun with a normal reporter in the intended test environment. The count in parentheses is the skipped assertion count recorded in JSON.

- `tests/adminDashboardPerformance.route.test.ts` (1 skipped; no failure payload)
- `tests/accounting/account-types.route.test.ts` (4 skipped; no failure payload)
- `tests/accounting/accountant.test.ts` (4 skipped; no failure payload)
- `tests/accounting/accountants.route.test.ts` (3 skipped; no failure payload)
- `tests/accounting/accounts.route.test.ts` (4 skipped; no failure payload)
- `tests/accounting/ai-actions.route.test.ts` (3 skipped; no failure payload)
- `tests/accounting/bank-account.test.ts` (5 skipped; no failure payload)
- `tests/accounting/bank-accounts.route.test.ts` (4 skipped; no failure payload)
- `tests/accounting/bank-feed-provider.test.ts` (4 skipped; no failure payload)
- `tests/accounting/bank-feed-providers.route.test.ts` (2 skipped; no failure payload)
- `tests/accounting/banking-rule.test.ts` (5 skipped; no failure payload)
- `tests/accounting/banking-rules.route.test.ts` (4 skipped; no failure payload)
- `tests/accounting/budget.test.ts` (4 skipped; no failure payload)
- `tests/accounting/budgets.route.test.ts` (4 skipped; no failure payload)
- `tests/accounting/coa.test.ts` (2 skipped; no failure payload)
- `tests/accounting/currency-adjustment.test.ts` (5 skipped; no failure payload)
- `tests/accounting/currency-adjustments.route.test.ts` (4 skipped; no failure payload)
- `tests/accounting/custom-field.test.ts` (4 skipped; no failure payload)
- `tests/accounting/custom-fields.route.test.ts` (4 skipped; no failure payload)
- `tests/accounting/customerPaymentPosting.test.ts` (10 skipped; no failure payload)
- `tests/accounting/journal-template.test.ts` (4 skipped; no failure payload)
- `tests/accounting/journal-templates.route.test.ts` (4 skipped; no failure payload)
- `tests/accounting/legacy-accounts.route.test.ts` (4 skipped; no failure payload)
- `tests/accounting/salesInvoicePosting.test.ts` (6 skipped; no failure payload)
- `tests/accounting/settings.route.test.ts` (4 skipped; no failure payload)
- `tests/accounting/settings.test.ts` (6 skipped; no failure payload)
- `tests/accounting/smart-rules.test.ts` (9 skipped; no failure payload)
- `tests/accounting/tax-rate.test.ts` (4 skipped; no failure payload)
- `tests/accounting/tax-rates.route.test.ts` (5 skipped; no failure payload)
- `tests/accounting/transaction-lock.test.ts` (3 skipped; no failure payload)
- `tests/accounting/transaction-locks.route.test.ts` (4 skipped; no failure payload)
- `tests/crm/crmAuditLogModel.test.ts` (8 skipped; no failure payload)
- `tests/crm/crmWorkflowRegression.test.ts` (11 skipped; no failure payload)
- `tests/export/allExports.test.ts` (8 skipped; no failure payload)
- `tests/golden/ai27.golden.test.ts` (1 skipped; no failure payload)
- `tests/hr/hrReportsExport.test.ts` (5 skipped; no failure payload)
- `tests/hr/payrollStages.test.ts` (2 skipped; no failure payload)
- `tests/inventory/orderNumbering.test.ts` (3 skipped; no failure payload)
- `tests/inventory/orders.route.test.ts` (6 skipped; no failure payload)
- `tests/migration/e2eWorker.test.ts` (41 skipped; no failure payload)
- `tests/platform/adminRbac.test.ts` (23 skipped; no failure payload)
- `tests/platform/adminSession.test.ts` (6 skipped; no failure payload)
- `tests/platform/adminSessions.test.ts` (12 skipped; no failure payload)
- `tests/platform/adminUsers.test.ts` (14 skipped; no failure payload)
- `tests/platform/aiInstrumentation.test.ts` (6 skipped; no failure payload)
- `tests/platform/aiUsageRollup.test.ts` (5 skipped; no failure payload)
- `tests/platform/assignPlan.test.ts` (6 skipped; no failure payload)
- `tests/platform/authFlow.route.test.ts` (4 skipped; no failure payload)
- `tests/platform/crossTenant.test.ts` (4 skipped; no failure payload)
- `tests/platform/dashboardKpis.test.ts` (20 skipped; no failure payload)
- `tests/platform/enforce.test.ts` (4 skipped; no failure payload)
- `tests/platform/globalSearch.test.ts` (10 skipped; no failure payload)
- `tests/platform/limitBehavior.test.ts` (7 skipped; no failure payload)
- `tests/platform/organizationCreate.test.ts` (13 skipped; no failure payload)
- `tests/platform/organizationList.test.ts` (11 skipped; no failure payload)
- `tests/platform/organizationStatus.test.ts` (10 skipped; no failure payload)
- `tests/platform/organizationTabs.test.ts` (25 skipped; no failure payload)
- `tests/platform/platformAuditLog.test.ts` (10 skipped; no failure payload)
- `tests/platform/resolveEntitlements.test.ts` (6 skipped; no failure payload)
- `tests/platform/securityConfig.test.ts` (12 skipped; no failure payload)
- `tests/platform/securityLog.test.ts` (6 skipped; no failure payload)
- `tests/qa/inventorySalesGst.test.ts` (11 skipped; no failure payload)
- `tests/sales/conversionIntegrityFailure.test.ts` (4 skipped; no failure payload)
- `tests/sales/customerViews.route.test.ts` (3 skipped; no failure payload)
- `tests/sales/documentNote.test.ts` (4 skipped; no failure payload)
- `tests/sales/documentPrefix.test.ts` (11 skipped; no failure payload)
- `tests/sales/einvoices.route.test.ts` (6 skipped; no failure payload)
- `tests/sales/invoiceLineTotal.route.test.ts` (7 skipped; no failure payload)
- `tests/sales/invoiceNumbering.test.ts` (7 skipped; no failure payload)
- `tests/sales/invoiceTemplates.test.ts` (3 skipped; no failure payload)
- `tests/sales/paymentAllocation.test.ts` (5 skipped; no failure payload)
- `tests/sales/paymentPostingAtomicity.route.test.ts` (3 skipped; no failure payload)
- `tests/sales/pipelineDeals.test.ts` (8 skipped; no failure payload)
- `tests/sales/product.test.ts` (4 skipped; no failure payload)
- `tests/sales/productPublish500.route.test.ts` (4 skipped; no failure payload)
- `tests/sales/q2cSync.test.ts` (4 skipped; no failure payload)
- `tests/sales/quotes.route.test.ts` (5 skipped; no failure payload)
- `tests/sales/salesInvoice.test.ts` (7 skipped; no failure payload)
- `tests/tenant/tenantUniqueIndex.test.ts` (7 skipped; no failure payload)
- `tests/ai/language/regionalCommandAutomation.test.ts` (12 skipped; no failure payload)
- `tests/ai/aiRuntime/ai01DocumentIngestion.test.ts` (9 skipped; no failure payload)
- `tests/ai/aiRuntime/ai02LedgerClassification.test.ts` (8 skipped; no failure payload)
- `tests/ai/aiRuntime/ai03BankReconciliation.test.ts` (9 skipped; no failure payload)
- `tests/ai/aiRuntime/ai04ExpenseIntelligence.test.ts` (6 skipped; no failure payload)
- `tests/ai/aiRuntime/ai05ReceivablesOperations.test.ts` (10 skipped; no failure payload)
- `tests/ai/aiRuntime/ai06PayablesOperations.test.ts` (11 skipped; no failure payload)
- `tests/ai/aiRuntime/ai07AccrualIntelligence.test.ts` (6 skipped; no failure payload)
- `tests/ai/aiRuntime/ai08PrepaidSchedule.test.ts` (8 skipped; no failure payload)
- `tests/ai/aiRuntime/ai09RevenueRecognition.test.ts` (8 skipped; no failure payload)
- `tests/ai/aiRuntime/ai10FixedAsset.test.ts` (8 skipped; no failure payload)
- `tests/ai/aiRuntime/ai11InventoryCogs.test.ts` (8 skipped; no failure payload)
- `tests/ai/aiRuntime/ai12TaxIntelligence.test.ts` (13 skipped; no failure payload)
- `tests/ai/aiRuntime/ai13DayZeroClose.test.ts` (8 skipped; no failure payload)
- `tests/ai/aiRuntime/ai13DayZeroCloseEdgeCases.test.ts` (6 skipped; no failure payload)
- `tests/ai/aiRuntime/ai14FluxAnalysis.test.ts` (6 skipped; no failure payload)
- `tests/ai/aiRuntime/ai15AnomalyDetection.test.ts` (10 skipped; no failure payload)
- `tests/ai/aiRuntime/ai16CashIntelligence.test.ts` (6 skipped; no failure payload)
- `tests/ai/aiRuntime/ai17ComplianceReadiness.test.ts` (11 skipped; no failure payload)
- `tests/ai/aiRuntime/ai18AuditEvidence.test.ts` (9 skipped; no failure payload)
- `tests/ai/aiRuntime/ai19MasterData.test.ts` (7 skipped; no failure payload)
- `tests/ai/aiRuntime/ai20RelatedPartyDetection.test.ts` (5 skipped; no failure payload)
- `tests/ai/aiRuntime/ai21StatementIntelligence.test.ts` (6 skipped; no failure payload)
- `tests/ai/aiRuntime/ai21StatementIntelligenceEdgeCases.test.ts` (5 skipped; no failure payload)
- `tests/ai/aiRuntime/ai22ContinuousReconciliation.test.ts` (8 skipped; no failure payload)
- `tests/ai/aiRuntime/ai23JournalReview.test.ts` (8 skipped; no failure payload)
- `tests/ai/aiRuntime/ai24CloseEvidence.test.ts` (5 skipped; no failure payload)
- `tests/ai/aiRuntime/ai24CloseEvidenceEdgeCases.test.ts` (6 skipped; no failure payload)
- `tests/ai/aiRuntime/ai25WorkingCapitalIntelligence.test.ts` (5 skipped; no failure payload)
- `tests/ai/aiRuntime/ai26AccountingPolicy.test.ts` (6 skipped; no failure payload)
- `tests/ai/aiRuntime/ai27DuplicateDetection.test.ts` (10 skipped; no failure payload)
- `tests/ai/aiRuntime/ai28CutoffIntelligence.test.ts` (5 skipped; no failure payload)
- `tests/ai/aiRuntime/ai28CutoffIntelligenceEdgeCases.test.ts` (9 skipped; no failure payload)
- `tests/ai/aiRuntime/ai29ControlMonitoring.test.ts` (13 skipped; no failure payload)
- `tests/ai/aiRuntime/ai29ControlMonitoringEdgeCases.test.ts` (7 skipped; no failure payload)
- `tests/ai/aiRuntime/ai30ErpOperations.test.ts` (7 skipped; no failure payload)
- `tests/ai/aiRuntime/aiMetrics.test.ts` (8 skipped; no failure payload)
- `tests/ai/aiRuntime/aiNl.test.ts` (10 skipped; no failure payload)
- `tests/ai/aiRuntime/aiPromotion.test.ts` (5 skipped; no failure payload)
- `tests/ai/aiRuntime/attentionEngine.test.ts` (5 skipped; no failure payload)
- `tests/ai/aiRuntime/eventBus.test.ts` (9 skipped; no failure payload)
- `tests/ai/aiRuntime/executor.test.ts` (7 skipped; no failure payload)
- `tests/ai/aiRuntime/learningStore.test.ts` (3 skipped; no failure payload)
- `tests/ai/aiRuntime/rbacRouter.test.ts` (11 skipped; no failure payload)
- `tests/ai/aiRuntime/safety.test.ts` (6 skipped; no failure payload)
- `tests/ai/aiRuntime/toolRegistry.test.ts` (11 skipped; no failure payload)
- `tests/ai/taskFlow/registryDrift.test.ts` (3 skipped; no failure payload)
