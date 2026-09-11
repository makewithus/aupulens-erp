# PHASE-6-plan.md — Dashboard, search, alerts, API monitoring

## What's already built (reused, not rebuilt)
Dashboard KPIs: organisation count, admin user count, audit events today, full AI usage summary
(Phase 4), honest MRR/ARR empty state (`OPEN_QUESTIONS.md` #4) — all live on `/platform` already.
This phase adds global search, alerting, and API monitoring, which is genuinely new.

## `lib/platform/search/globalSearch.ts`
Cross-tenant, therefore through the gateway, therefore audited (source doc §23). Searches, per a
single query string, across: `Organization` (name/subdomain), `User` (email, tenant-scoped —
returns tenant context so a result is actionable), `AdminUser` (name/email), `PlatformAuditLog`
(`entityId` exact match — the closest real analogue to "audit event ID"/"invoice ID"/"transaction
ID" search, since this codebase has no platform-level invoice/transaction ID concept — see
`SYSTEM_INVENTORY_DELTA.md` §3), `SubscriptionEvent` (by `tenantId`). Each result carries its own
type tag and a link target. AI Usage ID search maps to `AiUsageRecord.requestId` (its own real
identifier). API key search is real but will always return empty until Phase 6's own `ApiKey`
model has rows (built this phase, but no real external API exists yet to issue one to — see below).

## Alerts (`models/platform/PlatformAlert.ts`, `lib/platform/alerts/`)
`{tenantId?, alertType, severity, message, triggeredAt, resolvedAt?, deliveryChannels: ("in_app")[]}`.
Source doc §28's conditions this phase wires for real: AI usage threshold crossed (50/75/90/100%,
already detected in `lib/platform/ai/limitBehavior.ts` — extended to ALSO create a `PlatformAlert`
row, not just an audit event), organisation suspended. **In-app delivery is real** (the alert row
itself, surfaced in a `/platform` panel). **Email/webhook delivery is an honest gap, not a fake
send** — no email/webhook infrastructure exists in this codebase for platform-level (as opposed to
tenant-level, e.g. `lib/integrations/`) notifications; `deliveryChannels` records what was
*requested*, and an `emailSent`/`webhookSent` boolean stays `false` with no code path that ever
sets it `true`, rather than pretending a send happened. Recorded in `OPEN_QUESTIONS.md`.

## API monitoring (`models/platform/ApiKey.ts`, `models/platform/ApiUsage.ts`)
Confirmed (repeating Phase 0's own finding, re-verified): no external API/API-key concept exists
anywhere in this codebase — every `/api/**` route is browser-session-authenticated, not
key-authenticated. Building the models and a monitoring UI with an honest "No API keys have been
issued — this platform has no external API surface yet" empty state, per the brief's own explicit
instruction for exactly this situation, rather than fabricating traffic.

## UI
`/platform/search` (or a top-bar search box wired to the same endpoint), `/platform` gets an
"Alerts" panel, `/platform/api-monitoring` (honest empty state).

## Tests
`globalSearch.test.ts` (each result type, empty query, no-match case, audited-on-every-call),
`alerts.test.ts` (AI threshold crossing creates a real `PlatformAlert` row; `emailSent`/
`webhookSent` never flip to true anywhere in the codebase — a source-grep assertion, not just a
unit test, since "never fabricate a delivery" is exactly the kind of claim that needs a structural
check, not just one passing test).

## Exit gate
Search finds real records across every listed type (or a real, honest empty result); every listed
alert condition creates a real alert row; API monitoring shows honest empty states, not fabricated
traffic.
