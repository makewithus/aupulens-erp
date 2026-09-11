# Verification — Retention, org-type log profiles (Phase 5)

## Scope note
Phase 1 already built the structured, immutable audit store and event taxonomy
(`docs/admin/verification/audit-log.md`) — this phase's real scope is retention policy resolution,
the retention job, and org-type log profiles.

## Happy path proven
- `retention.test.ts` (9 tests): most-specific-match policy resolution (org-type + category beats
  category alone, beats the filterless default, beats the hardcoded 30-day fallback when nothing
  is configured at all); the sweep deletes only rows past their resolved window and leaves
  in-window rows and other tenants' rows untouched; **deletion by retention is itself audited —
  proven even though the deleted rows themselves are gone**, by asserting the
  `RETENTION_DELETION_EXECUTED` event exists with the correct count; idempotent re-run deletes
  nothing the second time.
- `sourceGrep.test.ts` extended: `allowRetentionDelete` (the one sanctioned deletion escape hatch,
  built in Phase 1 as a flag with no real caller yet) appears **only** in
  `lib/platform/audit/retention.ts` — this phase is what finally exercises that Phase-1-built
  capability for real.
- Manual, over real HTTP: seeded the platform default policy, hit the audit log viewer (real login/
  MFA events returned), the retention policy list (real seeded row), and the cron sweep endpoint
  (`CRON_SECRET`-gated, ran cleanly against real data with nothing yet due for deletion).

## Org-type log profiles (source doc §20)
`models/platform/OrganizationType.ts`'s `defaultConfig.logProfile.eventCategories` — a **display
filter only**, never a restriction on what's actually logged (Hard Rule 5 requires every
privileged action audited regardless of org type; this field only affects which categories an
org's own audit view highlights by default). Accountant/CA Firm and Multi-Company Group default to
also seeing the AI category, reflecting heavier automation use — documented in
`scripts/seed-platform-org-types.ts`'s own comments.

## Must-not-happen cases proven
- A policy whose `organizationType` filter doesn't match the tenant's actual type never applies
  (proven directly — an SME tenant is unaffected by a CA-Firm-only policy).
- Retention never silently deletes more than its own resolved window — the sweep computes
  `retentionDays` per `{tenantId, eventCategory, eventType}` group independently, never a single
  global cutoff applied to everything.

## Verdict
Pass. The append-only guard's retention escape hatch (a capability built but unused in Phase 1) is
now exercised for real, and deletion-by-retention's own audit trail is proven to exist
independently of the rows it describes.
