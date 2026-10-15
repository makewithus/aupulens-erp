# Aupulens AI session usage and reset indicator

Implemented on October 15, 2026. No deployment, production database mutation, or workspace quota activation was performed.

## Architecture audit

- Chat UI: `app/{admin,crm,finance,hr,inventory,manufacturing,sales}/ai-assistant/page.tsx`; shared persistent sidebar: `components/dashboard/AiSidebar.tsx`, backed by Zustand in `store/aiChatStore.ts`. These composers use React state, fetch, existing Tailwind theme tokens, attachment and microphone controls. There are **no model or mode selectors** in these existing composers; none were invented for this task. `AIAgentPanel.tsx` is a separate demo with simulated responses and was left unchanged.
- Requests: the corresponding `app/api/<module>/ai-assistant/route.ts` handlers call `resolveTenantAiSettings`, `callClaudeForTenant`, and/or `callClaudeForTenantStream` in `lib/ai/tenantAi.ts`. Several internal classification calls deliberately bypass customer quota accounting under the existing policy.
- Provider: `lib/ai/claude.ts` actually uses Azure OpenAI despite legacy Claude export names. It obtains provider input/output token counts, requests `stream_options.include_usage`, and returns streaming usage through the generator return value. Its SDK has one internal retry; accounting occurs after the overall provider call, not per retry or delta.
- Authoritative enforced usage: `lib/ai/usage.ts` uses `models/admin/AiUsage.ts`, atomic `$inc`/upsert, and the existing unique `{tenantId, period}` index. The unit is **successful provider calls**, not tokens, characters, credits, or chat messages. Monthly periods are UTC `YYYYMM`. `getTierLimits` in `lib/constants/tiers.ts` supplies the enforced monthly allowance. `getGlobalMonthlyCap` is a separate platform backstop.
- Existing telemetry and billing: `lib/platform/ai/instrumentation.ts::recordAiUsage` writes metadata-only `AiUsageRecord` records and calculates cost from `AiCostRate`. `lib/platform/ai/rollup.ts` rebuilds daily/monthly analytics idempotently. These rollups include different feature/error contributions and are not the authoritative successful-call quota counters. `lib/platform/ai/limitBehavior.ts::resolveAtLimitDecision` reads `AiLimit.atLimitBehavior` and preserves monthly block/allow/overage/throttle behavior.
- Organization and plan architecture: `Organization` supplies `tier`, active/subscription state, and AI preferences; `auth()` supplies the signed-in user and tenant. `OrganizationEntitlement`, `Plan`, and `lib/platform/entitlements/resolve.ts` govern newer entitlements, including their fallback/cache behavior. The current AI provider wrapper still enforces **tier** monthly caps rather than Plan credit/token fields or `AiLimit.maxRequestsPerMonth`; this feature deliberately displays the same enforced allowance rather than changing billing architecture.
- Access: existing middleware checks session/host tenant isolation and subscription/module access. The new route additionally checks authenticated identity, tenant existence/activity, and the shared subscription blocking helper. It accepts no caller-supplied tenant/user selector.
- Persistence: Mongoose/MongoDB; this path uses atomic independent counter writes, not multi-document transactions. The existing cron rollups remain unchanged. No full-history scan, new index, background job, or dependency was added.
- Session semantics: authentication timeout and chat-history conversations are not AI quota sessions. **No session or weekly quota/reset policy existed.** Existing organization timezone settings do not define AI quota boundaries; existing monthly AI quotas use UTC.
- Tests: Vitest 4 / Vite 8, Node environment, TypeScript, ESLint, React server rendering, and Mongo-backed tests. Browser scripts reference Playwright, but Playwright, a DOM testing environment, and a browser runner are not installed here. Vitest now explicitly transforms TSX with the installed Oxc automatic JSX runtime to support component markup tests.

## Implementation and policy

The audit led to reusing successful-call accounting, adding optional window configuration, exposing minimal authenticated counters, and integrating a reusable toolbar component. Monthly limits, global limits, provider requests, costs, and normal chat behavior remain under their existing architecture.

`Organization.settings.ai.usagePolicy` is an optional backend policy:

```ts
{
  startsAt: string; // explicit ISO timestamp with Z or a numeric timezone offset
  session?: { minutes: number; limit: number | null };
  weekly?: { limit: number | null };
}
```

There is no default duration, session quota, weekly quota, or automatic activation. An authorized operator must choose these values as a separate product/configuration decision. Set `startsAt` to the actual activation instant, **not a historical timestamp**: this feature does not backfill past calls into new counters. Do not enable a policy before all AI-serving instances have been upgraded. Existing preferences can remain entirely unchanged.

- Scope: the entire authenticated workspace; the UI and accessible text explicitly identify workspace usage. All successful calls that use the tenant wrapper share the allowance, across models and features. An internal bookkeeping call excluded by existing policy remains excluded.
- Unit: successful requests. A request can consume provider tokens even when its response is interrupted, but the existing product charges the request quota only on successful completion. No claim is made that a request percentage is a token/cost percentage.
- Session: fixed, contiguous windows anchored to `startsAt`, with explicitly configured duration in integer minutes (validated from 1 through 525600). This is not the chat conversation or login session.
- Weekly: Monday 00:00 UTC through the next Monday. The first partial week starts at policy activation. This UTC policy is explicitly selected for opt-in windows and does not use browser local midnight.
- Admission: windows are assigned at provider-wrapper admission, matching existing monthly accounting. A request completing after a boundary is charged to its original window. New requests use the next window.
- Storage: existing `AiUsage` documents, with namespaced session/weekly period keys including policy activation, window start, and session duration. Historical counters remain available. Changing a limit retains its counters; changing activation or duration creates a new policy generation and must be treated as a deliberate quota reset.
- Math: `round(used / limit * 100)` for a positive finite limit. Percentages above 100 remain visible after a reduced quota; only the visual bar clamps at 100. `null` limit means unlimited. Zero means no allowance, not unlimited, and has no percentage. Missing configuration has no usage percentage, window timestamps, or made-up reset.
- Enforcement: configured finite session/weekly limits block new calls in both streaming and non-streaming wrappers through the existing gated-result contract. These explicit new limits are hard gates; existing `AiLimit.atLimitBehavior` still applies to the legacy monthly cap. Invalid active window configuration logs an error and gates AI rather than silently granting a fabricated quota. No existing workspace is opted in.

## Accounting, concurrency and failures

`getWindowUsage` and `incrementWindowUsage` reuse `getAiUsageCount` and `incrementAiUsage`. Successful provider responses increment the configured windows once. Streaming increments happen after clean generator completion, never per chunk. Repeated `.next()` after completion cannot repeat accounting. SDK-internal retries yield a single final accounting operation. Errors, cancelled generators and partial streams do not increment request quotas; this preserves the existing policy.

Concurrent requests use the existing atomic MongoDB increments and compound unique index; integration tests exercise 12 simultaneous calls. The summary reads bounded current-window counters, not telemetry history. The privileged monthly analytics history is constrained to numeric monthly keys so new window counters cannot corrupt the existing chart or require scanning window history.

Provider token capture, cost computation and existing telemetry remain unchanged. If the provider omits token usage, the adapter's existing zero-token telemetry behavior remains; the new indicator uses successful-call counters and never estimates tokens from response length. There is no asynchronous provider usage reconciliation in this request-quota path.

Window write failures log tenant, window kind/key, and an error using the existing server logging convention, without prompts or responses, and propagate. Summary read failures return 503 without internal error details. Client failures replace displayed values with unavailable, rather than false zeros or apparently current stale data.

Important inherited limits: counter writes across monthly/global/session/weekly documents are not one transaction, and there is no durable accounting retry/outbox in the existing billing architecture. An infrastructure failure between writes can leave partial accounting and requires operator investigation/reconciliation from existing telemetry and logs. Concurrent admission uses the existing check-before-call policy: increments are safe, but in-flight calls may exceed a cap; strict reservation-based admission was not added. A separately replayed HTTP request is still a new provider request under the existing product policy; this feature does not introduce transport-wide idempotency keys or cache provider responses. It prevents duplicate accounting within one logical wrapper/generator execution and internal SDK retries. These properties must not be represented as transactional exactly-once billing.

## API and security

`GET /api/ai/usage` returns `{ success: true, data: AiUsageSummary }`, with `Cache-Control: private, no-store`. The existing `/api/admin/ai-usage` remains privileged analytics and retains its existing response contract. A separate minimal read endpoint is necessary because the composer is available to non-admin roles that must not receive admin analytics/history/model-health information.

Example only: the following values are **illustrative**, not production fixtures or defaults:

```json
{
  "success": true,
  "data": {
    "scope": "workspace",
    "serverTime": "2026-10-15T10:30:00.000Z",
    "session": {
      "used": 3,
      "limit": 20,
      "percentage": 15,
      "windowStartedAt": "2026-10-15T10:00:00.000Z",
      "resetsAt": "2026-10-15T11:00:00.000Z",
      "unit": "requests",
      "status": "available"
    },
    "weekly": {
      "used": 10,
      "limit": 100,
      "percentage": 10,
      "windowStartedAt": "2026-10-12T00:00:00.000Z",
      "resetsAt": "2026-10-19T00:00:00.000Z",
      "unit": "requests",
      "status": "available"
    },
    "monthly": {
      "used": 10,
      "limit": 1000,
      "percentage": 1,
      "windowStartedAt": "2026-10-01T00:00:00.000Z",
      "resetsAt": "2026-11-01T00:00:00.000Z",
      "unit": "requests",
      "status": "available"
    }
  }
}
```

Statuses: `available`, `exhausted`, `unlimited`, `unconfigured`, `unavailable`. Unconfigured/unavailable metrics use null measurements and timestamps. Unlimited metrics retain actual counts/windows with null limit/percentage. The response never includes history, provider configuration, credentials, cost rates or another tenant's identifiers.

Identity and tenant come only from `auth()`. GET has no user/tenant input. Missing authentication returns 401; missing/inactive organization returns 403; blocked subscription returns 402; failed summary reads return 503. An organization without a newer Plan assignment uses the same established tier fallback as existing AI enforcement, not an invented entitlement or percentage. Middleware continues to provide host/session isolation and normal subscription/module checks.

## Frontend

`AiUsageIndicator` is embedded in the shared sidebar bottom toolbar and beneath the existing composer controls on the seven assistant pages. It uses existing theme tokens, muted typography, thin progress bars, and wrapping flex layout. Controls remain intact; no modal, floating widget, card, selector or settings page was added. Unconfigured windows say “Not configured”; the actual monthly allowance appears as additional context whenever either new window is unconfigured.

`UsageItem` supplies readable labels, counts/limits and absolute UTC reset text to assistive technology; progress bars have labels, bounds and actual percentage text. Exhaustion is also textual, not color-only. Bars clamp visually while retaining over-quota text. Loading displays no percentage and reserves toolbar height. The layout wraps between metrics and inside each metric without forcing a horizontally scrolling composer.

`useAiUsageSummary` uses existing React/fetch conventions without a new cache dependency. Simultaneous reads share an in-flight request scoped to identity/tenant; invalidations arriving during a fetch cause one follow-up read. Results never persist in browser storage, and identity changes do not render the prior user's data. Reads have a 15-second abort timeout. An assistant's busy-to-idle lifecycle triggers summary invalidation after streaming, ordinary responses, failures and early-return helper flows; refreshes never increment accounting.

Time is referenced to server time plus monotonic elapsed browser time, avoiding client wall-clock skew. A 15-second tick updates the displayed countdown and detects expiration; repeated unsuccessful refreshes back off for a minute. Expired timestamps show “Resetting…” without negatives. Visibility/online events refresh authoritative values, hidden tabs pause timer reads, and cleanup removes intervals/listeners and prevents updates after unmount. A summary failure never blocks chat submission.

## Files

Created:

- `lib/ai/usagePolicy.ts`: shared types, policy/window/percentage calculations.
- `lib/ai/windowUsage.ts`: persisted current-window reads and atomic increments.
- `app/api/ai/usage/route.ts`: authenticated minimal summary.
- `lib/ai/usageDisplay.ts`: labels and countdown formatting.
- `lib/hooks/useAiUsageSummary.ts`: reads, clock, refresh and lifecycle behavior.
- `components/ai/AiUsageIndicator.tsx`: reusable compact indicator.
- `tests/ai/usagePolicy.test.ts`, `windowUsage.test.ts`, `windowUsageLifecycle.test.ts`, `usageSummaryRoute.test.ts`, `usageSummaryLifecycle.test.ts`, `usageIndicator.test.ts`, `usageIndicator.integration.test.ts`.
- This report.

Modified:

- `lib/ai/tenantAi.ts`: optional window checks and successful-completion increments.
- `models/admin/Organization.ts`: optional policy schema/type with no default activation.
- `models/admin/AiUsage.ts`: documents the additive period key convention.
- `app/api/admin/ai-usage/route.ts`: keeps monthly analytics restricted to monthly counters.
- `app/{admin,crm,finance,hr,inventory,manufacturing,sales}/ai-assistant/page.tsx` and `components/dashboard/AiSidebar.tsx`: indicator and completion refresh integration.
- `vitest.config.ts`: explicit automatic TSX transformation for component tests, no dependency addition.

## Automated verification

Commands run from this repository root; production provider requests were never made by these tests. Provider mocks occur only in test files.

Final regression command:

```bash
npx vitest run tests/saas tests/auth tests/ai/usagePolicy.test.ts tests/ai/windowUsage.test.ts tests/ai/usageSummaryRoute.test.ts tests/ai/usageIndicator.test.ts tests/ai/usageSummaryLifecycle.test.ts tests/ai/windowUsageLifecycle.test.ts tests/ai/adminAiRouteGating.test.ts tests/ai/aiSafetyGuards.test.ts tests/ai/salesAiRouteGating.test.ts tests/ai/inventoryAiRouteGating.test.ts tests/ai/manufacturingAiRouteGating.test.ts tests/ai/hrAiRouteGating.test.ts tests/ai/financeAiRoute.test.ts
```

Observed: **27 files, 413 tests passed.** Includes existing billing-history, tier, organization-schema, auth/session, tenant isolation and AI gating regressions. Earlier subsets also passed (53, 134 and 248 tests respectively).

MongoDB command:

```bash
npx vitest run tests/ai/usageIndicator.integration.test.ts
```

Observed: **4 integration tests passed**, including provider-to-counter-to-authenticated-summary flow, real token metadata, concurrent updates, isolation, stream/cancellation/failure behavior and window rollover with retained old counters. Run twice successfully. Each run connects only to a uniquely named local `aupulens_test_usage_indicator_<random>` database, deletes only test-created rows, and preserves databases/indexes. Initial sandbox socket access returned EPERM; approved local test access succeeded. No production database was selected or modified.

```bash
npx tsc --noEmit
npx eslint lib/ai/usagePolicy.ts lib/ai/usageDisplay.ts lib/ai/windowUsage.ts lib/ai/tenantAi.ts lib/hooks/useAiUsageSummary.ts components/ai/AiUsageIndicator.tsx models/admin/Organization.ts models/admin/AiUsage.ts app/api/ai/usage/route.ts app/api/admin/ai-usage/route.ts tests/ai/usagePolicy.test.ts tests/ai/windowUsage.test.ts tests/ai/usageSummaryRoute.test.ts tests/ai/usageIndicator.test.ts tests/ai/usageSummaryLifecycle.test.ts tests/ai/windowUsageLifecycle.test.ts tests/ai/usageIndicator.integration.test.ts vitest.config.ts app/admin/ai-assistant/page.tsx app/crm/ai-assistant/page.tsx app/finance/ai-assistant/page.tsx app/hr/ai-assistant/page.tsx app/inventory/ai-assistant/page.tsx app/manufacturing/ai-assistant/page.tsx app/sales/ai-assistant/page.tsx components/dashboard/AiSidebar.tsx
npm run build
git diff --check
```

Observed final checks:

- `npx tsc --noEmit`: passed, exit 0.
- ESLint command above across all changed TypeScript/TSX/config files: passed, exit 0, no diagnostics.
- `git diff --check`: passed.
- `npm run build`: passed, exit 0; successful compilation, lint/type validation, all 549 static pages generated, optimization and build traces completed. The final source was rebuilt after the last code changes.

During development, the first component test failed because Next's preserved JSX was not transformed by Vitest; the explicit Oxc setting fixed it. Initial test harness type-narrowing and hook-naming errors were fixed. Subsequent relevant tests and checks passed; these initial failures are not hidden.

Running-application smoke check:

```bash
npm run start -- --hostname 127.0.0.1 --port 3107
curl --silent --show-error --max-time 15 --include 'http://127.0.0.1:3107/api/ai/usage?tenantId=another-tenant'
```

Observed: the final production build started successfully on localhost; middleware returned **401 Unauthorized** with no usage data for the unauthenticated request, despite the tenant query parameter. This read-only check used no login credentials and made no AI/provider request. The temporary local server was stopped afterward. It is not an authenticated visual/UI verification.

No browser E2E pass is claimed: browser dependencies are unavailable, and no large testing dependency was installed. Frontend automated coverage consists of actual React SSR markup plus a Vitest effect/timer/event harness, not a full DOM-rendered React interaction test. Responsive behavior, live microphone/attachment interactions and visual fidelity require the manual checks below.

## Manual verification and required configuration

1. Start the existing test application with its normal test organization and provider configuration. Do not activate new quotas in a production workspace as part of verification.
2. Open an assistant page and the shared AI sidebar. With no policy, confirm Session/Weekly say “Not configured” and Monthly matches `/api/ai/usage` and the existing AI usage page. Inspect narrow (320px) and wider viewports; confirm attachment, microphone, input and send remain usable without horizontal overflow.
3. In a test organization's backend settings only, choose an explicit current activation timestamp, duration and request limits. Set `settings.ai.usagePolicy` according to the schema above using your approved configuration process. The feature does not add an unauthenticated policy update API, settings UI or production migration. A new session duration and limit are product choices, not inferred from the reference screenshot.
4. Submit an ordinary request, then a supported streaming/attachment request. After each completion compare session, weekly and monthly values against the summary. Verify progress/percentage and accessible count/limit/UTC reset text. Do not compare request percentages against provider token totals.
5. Test a low or zero configured session quota, exact exhaustion, a limit reduced below existing consumption, and `null` unlimited limits. Confirm backend gates new requests where configured; monthly/global gates and monthly overage behavior still apply independently.
6. Observe a short explicitly chosen **test** session boundary. Confirm countdown changes, then “Resetting…” and fresh authoritative values. Reloading, starting another chat or changing the computer clock must not create a new backend window. Weekly rollover is automated-tested using UTC timestamps; do not wait a real week.
7. Disconnect the network or block the summary endpoint; confirm unavailable rather than 0%, and continued composer operation. Restore connectivity/visibility and confirm refresh. An expired auth session should return 401 and display unavailable without exposing another workspace.
8. Cancel/interfere with a stream and verify only clean completions consume successful-call quota. Under the existing route behavior, a server stream may finish despite a browser disconnect; completed server work can therefore still count.
9. Sign into a different workspace/user and verify only its counters appear. Inspect a non-admin user: the minimal summary is available, while privileged analytics remain protected. Test inactive, deleted and expired-trial organizations.
10. Review server logs on injected counter failures. Do not treat a partially failed multi-counter write as proof of exactly-once accounting. Existing telemetry failure logging and provider accounting limitations described above remain relevant operational constraints.

No additional environment variables, indexes, external services or cron jobs are required. MongoDB and the existing provider configuration are sufficient. No window policy is necessary to show the real monthly allowance; an explicit backend policy is necessary to show real session/weekly quotas. Browser validation and operator-approved policy activation remain unperformed.

## Final gap verification and remediation — October 15, 2026

This section supersedes the earlier browser-verification note above. The implementation was traced end to end, four in-scope defects were corrected, and a real-browser run was completed against a disposable local test organization, an isolated MongoDB database, and a local mock provider. Nothing was deployed, no production database was selected, and no production policy or subscription quota was changed.

### CTO requirement status

| Requirement | Status | Evidence and remaining gap |
| --- | --- | --- |
| Trace usage from composer/sidebar through summary API, policy windows, counters, and provider wrappers | **PASS** | Verified the seven assistant pages, shared `AiSidebar`, `AiUsageIndicator`, `useAiUsageSummary`, `GET /api/ai/usage`, policy/window helpers, `tenantAi` sync/stream wrappers, tier/monthly quota path, and `AiUsage` persistence. A disposable authenticated browser run exercised the real summary and provider wrapper. |
| Compact bottom-toolbar indicator, including at 320px, without disrupting existing controls | **PASS** | Chrome screenshots and interactive checks at 320px and 1440px for the composer and shared sidebar. No horizontal overflow; input remained visible and usable. Message send, attachment select/remove, and microphone capture/transcription fixture worked. Screenshots: `/tmp/aupulens-gap-browser-final4/{mobile,desktop,sidebar-mobile,sidebar-desktop}.png`. |
| Place indicator beside existing model/mode selectors | **BLOCKED** | These composers have no model or mode selectors to align with. The indicator is in the existing compact bottom toolbar; inventing selector UI was outside scope and contrary to the instruction. Product/design must decide whether another reference placement is intended if selector-adjacent placement is mandatory. |
| Backend-owned session/weekly counts, limits, percentages, and reset timestamps; no fabricated unconfigured values | **PASS** | Summary values come from authenticated server-side policy and `AiUsage` counters. The browser began unconfigured and displayed “Not configured,” then used explicit test-only policy values; successful send changed both windows to 5%. Zero-limit enforcement, unlimited status, and policy removal were exercised. No production or durable test workspace policy was left enabled. |
| Safe validation for missing, invalid, zero, finite, and unlimited limits | **PASS** | Added regression coverage for missing/invalid policy limits and authenticated configuration. Missing limits are rejected; zero is exhausted, finite values are enforced, and only explicit `null` means unlimited. A Mongoose schema default that previously converted omission to unlimited was removed. |
| Respect documented session and weekly reset boundaries | **PASS** | Policy calculations and boundary/rollover cases are covered by `usagePolicy`/window tests; the browser verified a configured current session and weekly window. Session is fixed-window from explicit activation; weekly is Monday 00:00 UTC with an activation partial week. These are explicit opt-in semantics, not pre-existing organization settings. |
| Keep existing accounting, streaming, tenant isolation, subscription behavior; accurately report risks | **PASS** | Monthly/tier gates remain in place; namespaced windows are excluded from monthly analytics history. Tenant identity comes from authenticated server state. Existing direct classifier `callClaude` usage in the admin AI route is an intentional internal bookkeeping bypass under existing policy; customer-facing module routes use tenant wrappers. Regression and isolated integration results below passed. No exactly-once or transactional guarantee is claimed. |
| Product configuration for session/weekly quotas | **BLOCKED** | The repository had no prior session/weekly policy or chosen values. The product owner must choose (1) activation timestamp, (2) fixed session duration in minutes, (3) session successful-request limit, (4) weekly successful-request limit, and (5) confirm Monday 00:00 UTC weekly reset semantics. Until an operator sets these through the authenticated admin organization-settings flow, those two windows correctly remain “Not configured.” No values were inferred or activated for a real workspace. |

### Defects fixed

- Removed the Mongoose `null` default for policy limits and validate configured policies before use. Otherwise an omitted limit could silently become unlimited instead of being rejected.
- When a configured window was about to reset, the countdown hook could delay its authoritative refresh for up to a minute after the reset. A successful read now clears the retry backoff; a regression test covers the near-boundary case.
- Window-counter write failures were occurring before existing usage telemetry was recorded. The supplemental window increment now follows the existing `recordAiUsage` call in both regular and streaming flows, preserving provider usage telemetry if the additional window write fails.
- The admin assistant opened its chat-history drawer by default, which obscured the composer on a 320px viewport. It now opens closed. The shared sidebar composer action group also expands within its toolbar so adding the indicator does not wrap/cover the send action.

### Verification actually run

- `npx vitest run tests/saas tests/auth tests/ai/usagePolicy.test.ts tests/ai/usagePolicyConfiguration.test.ts tests/ai/windowUsage.test.ts tests/ai/usageSummaryRoute.test.ts tests/ai/usageIndicator.test.ts tests/ai/usageSummaryLifecycle.test.ts tests/ai/windowUsageLifecycle.test.ts tests/ai/adminAiRouteGating.test.ts tests/ai/aiSafetyGuards.test.ts tests/ai/salesAiRouteGating.test.ts tests/ai/inventoryAiRouteGating.test.ts tests/ai/manufacturingAiRouteGating.test.ts tests/ai/hrAiRouteGating.test.ts tests/ai/financeAiRoute.test.ts` — **28 files, 422 tests passed**.
- `npx vitest run tests/ai/usageIndicator.integration.test.ts` — **1 file, 4 tests passed** using a uniquely named local Mongo database; provider calls are mocked in the test.
- `npx tsc --noEmit` — **passed**, exit 0, run independently after the production build completed.
- `npx eslint` on changed TypeScript/TSX/config files, including `app/api/admin/org-settings/route.ts` and all added tests — **passed**, exit 0, no diagnostics.
- `npm run build` — **passed**, exit 0; production compilation and static generation completed.
- `git diff --check` — **passed**, exit 0.
- `node --check scripts/verify-ai-usage-browser.mjs` — **passed**, exit 0.
- `node scripts/verify-ai-usage-browser.mjs /tmp/aupulens-gap-browser-final4` — **passed**. It created a disposable organization and user in `aupulens_test_usage_browser_<random>`, logged in through the app, set explicit test values only using the authenticated admin settings route, called the application against a local mock provider, asserted backend counters and reset data, verified `0` gates before any provider call, verified explicit unlimited, then removed the policy and checked unconfigured/monthly values. The script deletes only rows matching its test tenant and closes the local services. The observed browser run recorded two mock provider requests for one user turn (the existing classifier plus the streamed response), while the successful customer request was counted once.

The browser run also verified the regular assistant composer at 1440px and 320px, plus the persistent sidebar at both widths. All four screenshots are retained under `/tmp/aupulens-gap-browser-final4/`; this was actual Chrome/CDP browser validation, so the earlier note that browser dependencies were unavailable does not apply to this final verification. Microphone speech recognition used Chrome's fake media device and a test-only transcription response; this validates control and route wiring, not audio transcription quality or the external speech provider.

### Accounting risks and final file list

Partial independent writes across monthly/global/session/weekly counters, in-flight overage from check-before-call admission, and separately replayed HTTP requests counted as new provider requests remain inherited limitations of the existing accounting design. Clean server-side stream completion counts once; canceled/failed/partial provider work follows the existing successful-request accounting rule. None of these properties is transactional or transport-wide exactly-once accounting. Window-counter failures are logged and propagated; a failure after provider success can still leave other counters written and the response unsuccessful. No billing redesign was made.

Changed/added files in this task:

- `AI_SESSION_USAGE_INDICATOR_IMPLEMENTATION_REPORT.md`
- `app/admin/ai-assistant/page.tsx`, `app/crm/ai-assistant/page.tsx`, `app/finance/ai-assistant/page.tsx`, `app/hr/ai-assistant/page.tsx`, `app/inventory/ai-assistant/page.tsx`, `app/manufacturing/ai-assistant/page.tsx`, `app/sales/ai-assistant/page.tsx`
- `app/api/ai/usage/route.ts`, `app/api/admin/ai-usage/route.ts`, `app/api/admin/org-settings/route.ts`
- `components/ai/AiUsageIndicator.tsx`, `components/dashboard/AiSidebar.tsx`
- `lib/ai/tenantAi.ts`, `lib/ai/usageDisplay.ts`, `lib/ai/usagePolicy.ts`, `lib/ai/windowUsage.ts`, `lib/hooks/useAiUsageSummary.ts`
- `models/admin/AiUsage.ts`, `models/admin/Organization.ts`, `vitest.config.ts`
- `scripts/verify-ai-usage-browser.mjs`
- `tests/ai/usageIndicator.integration.test.ts`, `tests/ai/usageIndicator.test.ts`, `tests/ai/usagePolicy.test.ts`, `tests/ai/usagePolicyConfiguration.test.ts`, `tests/ai/usageSummaryLifecycle.test.ts`, `tests/ai/usageSummaryRoute.test.ts`, `tests/ai/windowUsage.test.ts`, `tests/ai/windowUsageLifecycle.test.ts`

Session and weekly usage are operational in the isolated test organization when explicitly configured, and correctly unconfigured when the policy is removed. They are not active by default in actual workspaces. For that reason, the implementation has verified behavior but is **not fully operational for session/weekly quotas in a workspace until the product-owner choices above are approved and configured**.
