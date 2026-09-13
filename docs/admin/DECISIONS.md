# DECISIONS.md — Global Admin Control Plane

Product/architecture decisions made during this project that aren't fully captured by a single
code comment or test — recorded here so a future engineer sees the reasoning, not just the result.

## 1. §21/§31 — one audit collection with a Security view, not a second collection (Phase 11 Part 1.4)

**Decision**: `PlatformAuditLog` stays the single audit store. The "Security log"/"system log"
concept named in §21 and §31 is a **dedicated page, not a dedicated model** — a first-class
`/platform/security` view filtered to `PLATFORM_EVENT_CATEGORY.SECURITY` (or `PLATFORM_SEVERITY.SECURITY`),
built on the exact same `PlatformAuditLog.find()` + immutability guarantees the Audit Logs tab
already uses.

**Why**: §31 names `system_logs` and `security_logs` as distinct collection concepts, which reads
like an instruction to build two more Mongoose models. But `PlatformAuditLog` already carries a
structured `eventCategory` (`PLATFORM_EVENT_CATEGORY`, including `SECURITY`) and `severity`
(`PLATFORM_SEVERITY`, including `SECURITY`) on every row — the data a "security log" would show is
already being written to one place. Splitting it into a second collection would mean:

- Every code path that currently calls `emitPlatformAuditEvent()` once would need to decide, per
  call site, whether this event ALSO needs a second write to a `PlatformSecurityLog` — a
  classification decision that's easy to get wrong or forget, and Hard Rule 7 (audit logs
  append-only) would then need to be independently re-proven on a second model rather than reusing
  the one `pre()`-hook guard already tested (`tests/platform/sourceGrep.test.ts`).
- A security-relevant event that's ALSO an ordinary audit event (e.g. a permission denial recorded
  during an otherwise-normal cross-tenant read) would either appear in two places or require a rule
  for which collection "wins" — neither is honest bookkeeping.

**What this satisfies**: §21's requirement (a SECURITY event category exists and is used — it
already did, per `COVERAGE_MATRIX.md` row 21) plus the operator-facing need §31 is really pointing
at — "can I see security events as their own thing" — which a filtered view answers exactly as well
as a separate collection, without splitting the append-only guarantee across two places.

**What this does NOT do**: it does not create a `PlatformSystemLog` model for
non-security-severity system events (job failures, etc.) — those are covered by the existing
Scheduled Jobs panel and the dashboard's own System Errors KPI (Part 1.5), which read their own
real sources (`SchedulerJobRun`) rather than needing a third audit-adjacent collection.

**Rows updated**: `COVERAGE_MATRIX.md` §21 and §31 both now point at this decision instead of
saying "undecided."
