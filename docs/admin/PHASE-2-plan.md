# PHASE-2-plan.md — Organisation management

## Existing code this phase calls (from `CAPABILITY_MAP.md`)
- `models/admin/Organization.ts` — extended additively (new fields only; `subdomain`, `tier`,
  `maxUsers`, `aiCallsPerMonth`, `subscriptionStatus`, `settings{}` all untouched and still read by
  every existing tenant-facing code path).
- `lib/platform/tenancy/crossTenant.ts` — every read in this phase goes through it.
- `lib/accounting/coa-seeder.ts` / `coa-feature-seeder.ts` / `lib/billing/appendSubscriptionEvent.ts`
  — reused by the new admin-initiated creation flow (`SYSTEM_INVENTORY_DELTA.md` §2's flow B is the
  most complete existing precedent).
- `models/admin/SubscriptionEvent.ts` — reused for organisation-status-change history rather than a
  parallel model (append-only, already the right shape).
- `lib/platform/audit/emit.ts` — every mutation and every detail-tab read is audited.
- `lib/constants/statuses.ts` shape — new `ORGANIZATION_STATUS`/`ORGANIZATION_TYPE` enums with a
  transitions table, following the exact `VOUCHER_STATUS_TRANSITIONS`/`isValidVoucherTransition`
  pattern already in the file.

## Decisions carried from `OPEN_QUESTIONS.md`
- **#2 (status vs. `isActive`/`subscriptionStatus`)**: new `Organization.status` field, additive.
  `SUSPENDED` transition also sets `isActive = false` (reuses the one real, working enforcement
  point in `auth.ts`'s `authorize()`, which already rejects login when `!org.isActive`) — proven
  with a test that a suspended organisation's users cannot log in.

## New files
**Enums** (`lib/constants/statuses.ts`): `ORGANIZATION_STATUS` (`INVITED, ONBOARDING, TRIAL,
ACTIVE, SUSPENDED, PAYMENT_HOLD, CANCELLED, ARCHIVED`) + `_TRANSITIONS` + `isValidOrganizationStatusTransition()`;
`ORGANIZATION_TYPE` (`SME, ENTERPRISE, STARTUP, ACCOUNTANT_CA_FIRM, MULTI_COMPANY_GROUP,
NON_PROFIT, EDUCATIONAL, CUSTOM`).

**Model changes** (additive fields only, no existing field touched):
- `models/admin/Organization.ts`: `+ status?: OrganizationStatus` (default `ACTIVE` for existing
  rows via a migration script — new rows get an explicit value from the create flow),
  `+ organizationType?: OrganizationType`, `+ region?: string`, `+ statusHistory` is NOT stored on
  Organization itself — history lives in `SubscriptionEvent` (extended, see below) to avoid an
  unbounded embedded array on a document read on every request.
- `models/admin/SubscriptionEvent.ts`: extend `SubscriptionEventType` enum (additive) with
  `status_changed`, carrying `meta: { fromStatus, toStatus, reason, actorId }`.

**New model**: `models/platform/OrganizationType.ts` — configurable type→default-configuration
record (source doc §4: "implement as a configurable record, not a hard-coded enum with behaviour
scattered through the app"). Seeded with the 8 types above via `scripts/seed-platform-org-types.ts`.

**`lib/platform/organizations/`**:
- `list.ts` — server-side paginated/filtered/sorted query, through the gateway, returning
  projections (never a raw `Organization` document): id, name, type, country, region,
  subscriptionTier, status, activeUserCount, currentPeriodAiUsage, usagePercent, createdAt,
  lastMeaningfulActivityAt. "Last meaningful activity" is derived (max of last login, last
  transaction timestamp available today, last AI call from `AiUsage`) and documented inline as a
  named, testable function (`computeLastMeaningfulActivity`) — never invented per-row.
- `create.ts` — the fourth, admin-actor-aware organisation creation path: validates input, creates
  `Organization` (with `status: ONBOARDING`, explicit `organizationType`), applies the
  `OrganizationType`'s default configuration, seeds Chart of Accounts (reusing the existing
  seeders), creates the first admin `User`, records a `SubscriptionEvent` (`created`), audits.
- `statusTransition.ts` — `changeOrganizationStatus(actor, tenantId, toStatus, reason)`: validates
  the transition via `isValidOrganizationStatusTransition`, applies the `SUSPENDED → isActive:false`
  side effect decided above, records a `SubscriptionEvent` (`status_changed`), audits
  (`ORGANIZATION_STATUS_CHANGED`).
- `detail.ts` — one function per §7 tab that has real data today (Overview, Users, Subscription,
  Modules from `settings.enabledModules`, Activity from `ActivityLog` read-only, Audit Logs from
  `PlatformAuditLog` filtered by tenantId, Security = login/suspension history). AI Usage and
  Billing tabs render the same honest empty state as the Phase 1 dashboard until Phase 4/6 exist —
  not built as placeholders, built as real empty-state responses.

**UI**: `app/platform/(app)/organizations/page.tsx` (server-paginated table, all §3 columns),
`app/platform/(app)/organizations/new/page.tsx` (create form),
`app/platform/(app)/organizations/[id]/page.tsx` (detail tabs).

**API**: `app/api/platform/organizations/route.ts` (GET list, POST create),
`app/api/platform/organizations/[id]/route.ts` (GET detail),
`app/api/platform/organizations/[id]/status/route.ts` (POST transition).

**Sidebar**: add an "Organisations" section to `config/sidebar/platform.ts`.

## Tests
`organizationStatus.test.ts` (every valid/invalid transition, `SUSPENDED` genuinely blocks login —
an integration test against `auth.ts`'s `authorize()` logic path), `organizationList.test.ts`
(pagination doesn't load all rows into memory — assert query uses `.limit()`/`.skip()`, not an
in-memory filter), `organizationCreate.test.ts` (COA seeded, admin user created, event recorded,
audited), `lastMeaningfulActivity.test.ts` (each of the three signals independently, and the "none
available yet" case), a no-static-data grep test extended to cover the new organisations pages.

## Exit gate
Real organisations from the database render in a paginated list; creating one produces a valid,
usable tenant (login works); every status transition is logged and `SUSPENDED` demonstrably blocks
login; no static data anywhere in the new pages.
