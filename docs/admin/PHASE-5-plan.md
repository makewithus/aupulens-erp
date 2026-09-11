# PHASE-5-plan.md — Logging, audit, retention

## What Phase 1 already built (reused, not rebuilt)
`PlatformAuditLog` (structured, immutable, event taxonomy in `lib/constants/statuses.ts`),
`lib/platform/audit/emit.ts`. `models/admin/ActivityLog.ts` (pre-existing, free-text "what
happened" log, left untouched — source doc §19's distinction from audit is already respected).
This phase's real scope is narrower than Part 2.6 initially reads: retention policy + job, and
org-type log profiles.

## New model
`models/platform/RetentionPolicy.ts`: `{organizationType?, country?, eventCategory?, eventType?,
retentionDays, appliesToAll: boolean}`. A policy with `appliesToAll: true` and no other filters is
the platform default (30/90/365/1095/2555-day options per source doc §27's 30d/90d/1y/3y/7y/custom
list). More specific policies (matching org type + event category) override the default for
matching rows — resolved by `lib/platform/audit/retention.ts::resolveRetentionDays()`.

## Org-type log profiles (source doc §20)
Extends `models/platform/OrganizationType.ts` (Phase 2) additively:
`defaultConfig.logProfile: { eventCategories: PlatformEventCategory[] }` — which categories an
org type's audit view surfaces by default (SME sees AUTH/ORGANISATION/SUBSCRIPTION; Accountant/CA
Firm and Multi-Company Group also see AI category by default, reflecting heavier automation use;
all four types can still see every category via an explicit "show all" toggle — this is a default
filter, never a hard restriction on what's actually logged, since Hard Rule 5 requires every
privileged action to be audited regardless of org type).

## `lib/platform/audit/retention.ts`
- `resolveRetentionDays(tenantId, eventCategory, eventType)`: policy resolution, most-specific
  match wins, falls back to the platform default (30d if literally nothing configured — matches
  the source doc's own list's shortest option, a safe/conservative default, never "never delete"
  and never "delete immediately").
- `runRetentionSweep()`: for every distinct `{tenantId, eventCategory, eventType}` combination with
  audit rows older than its resolved retention window, deletes them via
  `PlatformAuditLog.deleteMany({...}).setOptions({allowRetentionDelete: true})` (the one sanctioned
  use of that flag, built in Phase 1) — and **writes a `RETENTION_DELETION_EXECUTED` audit event
  first, recording the count and the window**, so deletion by retention is itself audited (source
  doc §27's explicit requirement) — proven by a test that the audit event exists even though the
  rows it describes are already gone.

## `app/api/cron/platform/retention-sweep/route.ts`
Same `CRON_SECRET` pattern as Phase 4's cron route. Added to `vercel.json`.

## Platform UI
`/platform/audit-logs`: a global, cross-tenant audit log viewer (search/filter by category, type,
severity, actor, tenant, date range) — through the gateway, itself audited on every query. A
`/platform/settings/retention` page to configure `RetentionPolicy` rows.

## Tests
`retention.test.ts` (most-specific-match resolution, sweep deletes only rows past their window,
deletion is itself audited — the append-only guard's `allowRetentionDelete` escape hatch is
exercised for real here, not just proven as a schema-level capability like Phase 1 did),
`sourceGrep` extension: `allowRetentionDelete: true` may only appear in
`lib/platform/audit/retention.ts`.

## Exit gate
Audit records are provably append-only (Phase 1, still true); retention runs on a real seeded
policy and deletes only what's past its window; that deletion is itself an audited event.
