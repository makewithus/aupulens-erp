> **24 October follow-up:** The two remaining red items have been fixed and tested locally. Database-only answers remain free by explicit user decision and now display “0 credits used.” See [the current fix and verification report](AUPULENS_AI_RED_MARK_FIXES_2026-10-24.md) for current statuses and evidence. The earlier results below are historical and do not certify a deployed environment.

# AI assistant verification — 24 October 2026

This audit supersedes the acceptance claims in the older reports for this verification session. Green means verified in the current local source against synthetic fixtures; it does not certify the deployed application or the historical 22 October database. Red means incomplete, failed, or not independently verified. No deployment or production-data mutation was performed.

## Original seven reported failures

| # | Bug | Local status | Evidence / limitation |
|---|---|---|---|
| 1 | Quote creation | 🟢 Verified locally | Draft total ₹14,998; nothing saved until confirmation; confirmation replay and concurrency tests pass. |
| 2 | Fractional quantity, excessive discount, zero quantity | 🔴 Incomplete | Validation explanations and server rules pass. However, `make quantity 2.5` does not edit the existing proposal: the reply explicitly says “No draft values were changed.” Confirmation still uses the old line. |
| 3 | Unknown invoice returns generic error | 🟢 Verified locally | INV-9999 returns a specific accessible-records not-found response. Database failures use a separate error category. |
| 4 | Biggest invoice returns newest records | 🟢 Verified locally | Query sorts eligible issued invoices by amount; synthetic fixture returns INV-0080 / ₹9,79,995. Larger draft and other-tenant records are excluded. |
| 5 | Overdue count unavailable | 🟢 Verified locally | Synthetic fixture returns 12 using due date and positive outstanding balance. |
| 6 | Plan answer / invented menus | 🟢 Verified locally | Reads assigned account entitlements; unauthorized billing access is denied. No invented navigation in this query path. |
| 7 | Credit meter unavailable | 🟢 Verified locally | Browser and API show session 20 remaining / weekly 100 remaining, with no unavailable state. Real Mongo accounting tests pass. Live workspace/provider configuration remains unverified. |

## Exact follow-up checklist

| # | Exact prompt / action | Local result |
|---|---|---|
| 1 | How many customers do we have? | 🟢 280 in the matching synthetic fixture; other fixture sizes are counted dynamically. |
| 2 | How many quotes do we have? | 🟢 19 before confirmed creation; increments after saving. |
| 3 | Show unpaid invoices for Rajesh Kumar | 🟢 INV-0075, INV-0076, INV-0050; ₹59,192 outstanding. |
| 4 | what's the total? immediately after #3 | 🟢 ₹59,192; stored owner/conversation context used. |
| 5 | What's the status of SO-000019? | 🟢 Confirmed, INV-0086, not_shipped, ₹23,026. |
| 6 | How many invoices are paid? | 🟢 7 in fixture. |
| 7 | Show quotes for Himalaya Fitness Studio | 🟢 Includes QUO-000035, QUO-000031, QUO-000030. |
| 8 | What was our revenue in the last 30 days? | 🟢 Date-bounded issued gross invoice value, excluding drafts/cancellations. Historical approximate ₹11.4 lakh is unverified; integration fixture is ₹10,40,987. |
| 9 | hw many invocies r overdue | 🟢 Same 12 overdue in fixture. |
| 10 | rajesh kumr pending paymnt | 🟢 ₹59,192. |
| 11 | Rajesh ka kitna payment pending hai? | 🟢 ₹59,192. |
| 12 | Show me customer Tata Motors | 🟢 Accessible-records not-found response; no invented customer. |
| 13 | What is the status of INV-9999? | 🟢 Specific invoice not-found response. |
| 14 | qoute for 2 ergonomic chiar to himalaya | 🟢 ₹14,998 draft with confirmation required. |
| 15 | delete all draft invoices | 🟢 Refused; invoice fixtures preserved. |
| 16 | How many customers do we have? while watching credits | 🔴 Exact checklist expectation differs: query intentionally costs zero provider credits, so balance does not decrease. Meter/accounting tests pass; a deduction must not be invented. |
| 17 | Any prompt that returns an error | 🟢 Simulated provider failures/cancellations release reservations with no completed-answer charge. Actual external provider behavior is unverified. |
| 18 | Click Send 3 times fast | 🟢 Three real Send button clicks produce one persisted user turn; automated idempotent billing and confirmation tests also pass. |

## Verification evidence

- Focused AI checks: **124/124 tests, 16/16 files, exit 0** (`/tmp/aupulens-verification-focused-20261024.log`). Includes actual disposable MongoDB query/accounting tests; auth/provider dependencies are mocked where indicated in each suite.
- Regression reruns: **63/63 tests, 6/6 files, exit 0** (`/tmp/aupulens-verification-regressions-20261024.log`). Covers sales remediation, pipeline deals, invoice line totals, plan management, regional task flow and regional command automation.
- TypeScript: **exit 0** (`/tmp/aupulens-verification-types-20261024.log`).
- ESLint on 106 changed/new source files: **exit 0** (`/tmp/aupulens-verification-lint-20261024.log`).
- Initial full-suite attempt: **interrupted, exit 130** after timeouts/connection cleanup failures and a performance assertion failure. Not a successful full-suite result. Single-worker rerun **completed: 287 files passed, 1 file skipped; 2,949 tests passed, 9 skipped; exit 0**, in 592.40 seconds (`/tmp/aupulens-verification-full-sequential-20261024.log`). Skips were existing conditional tests: optional dashboard Mongo integration and migration checks requiring absent input files; skipped checks are not certified as passed.
- Production build: **final standalone unrestricted build PASS, exit 0; 553/553 pages generated**, with `MONGODB_URI` restricted to disposable local `aupulens_test_build_verify_20261024` (`scratch/verification-20261024/build-alone.log`). Earlier attempts failed during page-data collection for `/admin/users` and `/admin/billing` (exit 1 each), and an overlapping unrestricted retry was interrupted (exit 130). These failures remain recorded; the specific contribution of sandbox restrictions versus concurrent resource load has not been isolated. There were no concurrent test or browser runs during the successful final build.
- Browser execution: **completed, exit 0**, using actual CDP text input and Send button clicks against a separate local development instance with provider keys disabled and only synthetic data. All 28 harness observations matched; one deliberately reproduces the unfixed quantity edit, so this is not a claim that all functional acceptance criteria passed. Three rapid clicks persisted one user turn; draft preparation saved nothing; confirmation replay created one quote; actual meter balances were 20 session / 100 weekly. Zero `Runtime.exceptionThrown` events were captured in the completed run. Console/network cleanliness beyond this instrumentation is not certified.
- Browser evidence: `scratch/verification-20261024/browser-results.json`, `browser-final.png`, and `browser.mjs`; exact observed answers in `/tmp/aupulens-verification-browser-hydrated-20261024.log`. Browser revenue fixture is ₹10,40,687 because it lacks three special-case invoices included in the integration fixture; neither figure verifies the historical live total.
- Earlier browser attempts are retained as failures/interrupted runs: navigation timeout (exit 1), a query 503 during heavy concurrent verification (MongoDB logged `MaxTimeMSExpired`), and an input attempt before hydration. The completed run waited for usage data and used real text/button input. This is no proof of reliability under arbitrary load.
- `git diff --check`: **exit 0**.
- The temporary development server and browser were stopped; the temporary session file was removed and the automatic tsconfig include change was restored.

## Remaining acceptance gaps

1. **Developer action:** implementing an actual conversational quote edit is still required if “make quantity 2.5” is intended to update the draft. Existing validation guidance alone does not perform this action.
2. **Product/QA action:** the exact credit-decrement expectation must account for free deterministic ERP queries. Paid provider usage is tested separately with simulated provider responses and real accounting records.
3. The completed full-project test run has zero failures, with nine existing skips; the final standalone production build, TypeScript check, changed-source lint and whitespace check all pass. Skipped tests, deployment and actual external-provider operations are not covered by these passes.
4. **QA/deployment owner action:** the target QA URL, deployed version and authorized QA workspace access have not been supplied. All historical record values, deployed behavior and actual external-provider operations remain unverified.

This is a verification audit. Existing application changes were preserved; no application fix is claimed as work performed in this session.

Final local checklist tally: **23 green, 2 red across the original seven failures and 18 follow-up checks** (the two groups intentionally retain overlapping scenarios). Red items are draft editing and the literal credit-decrement expectation for a free deterministic query. Deployed/historical-data acceptance remains unverified independently of that local tally.

Persistent logs, screenshots and exit codes for this audit are in `scratch/verification-20261024/`. All application source changes present before this audit were preserved. The disposable database process was stopped after verification.
