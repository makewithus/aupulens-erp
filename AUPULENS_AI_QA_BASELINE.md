# AI QA baseline — 23 October 2026

Status: IN PROGRESS. Local checkout on `main`; QA URL/workspace not supplied. Historical expected records/counts are unverified and will not be hardcoded.

Before implementation, read the three existing memory/release reports and `.agents/AGENTS.md`. Existing changes preserved in seven tracked files: admin/sales assistant pages, sales invoice page, Logo, DashboardHeader, ToastRoot, friendlyError. Untracked logo-white.png and scratch/ preserved. Initial diff: 81 insertions, 19 deletions. No staging, commit, push or deployment authorized.

Architecture: module chat pages first call createFlow/taskFlow, then memoryFlow/ai-memory-query, then navigation, then module assistant. Sales assistant uses latest 20 orders; admin fetchers use latest 10/20 records. Record lookup endpoint uses provider extraction and tenant queries but has no aggregate/sort/pagination contract. Task registry contains invoice only; quote prefill opens the form. Usage endpoint reads workspace request windows and credit ledger; UI coalesces reads and invalidates via events.

Fresh baseline command: `npm test -- tests/ai/memoryFlow.test.ts tests/ai/salesAiRouteGating.test.ts tests/ai/usageSummaryRoute.test.ts tests/ai/conversationContext.test.ts --reporter=dot`. Exit 0; 4 files, 24 tests passed. Log `/tmp/aupulens-qa-baseline.log`. Existing preference mocks emit fail-closed warnings. Historical full-suite failures are recorded in the prior audit, not a fresh result for this checkout.

Disposable MongoDB: sandbox launch failed; approved localhost-only server started on 127.0.0.1:27183 with dbpath `/tmp/aupulens-qa-mongo`. No existing listener or application .env database contacted. Tests with hardcoded 27017 require an opt-in guarded connection adapter before execution. Browser tooling/authenticated test instance remains to be established.
