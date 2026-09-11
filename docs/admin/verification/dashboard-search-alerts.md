# Verification — Global search, alerts, API monitoring (Phase 6)

## A real regression caught mid-phase
Adding `checkAiUsageThresholdCrossing()` as a new export from `lib/platform/ai/limitBehavior.ts`
and calling it from `lib/ai/tenantAi.ts`'s success path broke the same two pre-existing test files
Phase 4 had already fixed once (`tests/saas/aiLimits.test.ts` — 42 tests,
`tests/ai/aiSafetyGuards.test.ts` — 6 tests) — their `vi.mock("@/lib/platform/ai/limitBehavior",
...)` factories only returned `resolveAtLimitDecision`, so the new export resolved to `undefined`
and every successful-call test threw. Fixed by adding a no-op mock for the new export to both
files; all 48 original assertions pass unmodified. A second confirmation that changing a mocked
module's export surface is exactly the kind of change `npx vitest run` catches immediately, and
exactly why it's run after every internal change, not just at the end of a phase.

## Happy path proven
- `globalSearch.test.ts` (8 tests): finds a real organisation by name, a real tenant user by
  email, a real audit event by `entityId`, a real AI usage record by `requestId`; an empty query
  returns `[]` (never the whole database); a query matching nothing returns a real, honest empty
  result; **every search is audited, including a zero-result one** — proven by asserting the audit
  row's `entityId` equals the literal query string and its metadata carries the caller's stated
  reason.
- `alerts.test.ts` (10 tests): `emitPlatformAlert` writes a real row with `deliveryChannels:
  ["in_app"]` and never throws on a DB failure; `checkAiUsageThresholdCrossing` fires exactly once
  per threshold boundary actually crossed (49→50 fires once for 50%; 51→52 fires nothing; a single
  call jumping 40→95 fires three times, once each for 50/75/90 — proven, not assumed) and is a
  no-op at `cap = 0` (no division-by-zero crash).
- **A structural, not just behavioral, guarantee**: a source-grep test asserts no file anywhere in
  `app/`, `lib/`, or `models/` ever sets `emailSent`/`webhookSent` to `true` — because no
  platform-level email/webhook sending infrastructure exists yet, and the honest claim ("delivery
  was requested, not confirmed sent") must hold structurally, not just happen to be true today.
- **Manual, over real HTTP**: created a real organisation, searched for it by name (found:
  organization + its owner user + its `created` subscription event, in one response), suspended it
  through the real status-transition API, and confirmed a real `PlatformAlert` row appeared in
  `/api/platform/alerts` with the exact suspension reason — proving the alert path fires end-to-end
  from a real admin action, not just in an isolated unit test. API monitoring returned the honest
  "no external API surface exists yet" empty state against real (zero) counts.

## Verdict
Pass. Includes a second real regression catch (same failure mode as Phase 4, different export)
and a source-grep-verified honesty guarantee for alert delivery claims.
