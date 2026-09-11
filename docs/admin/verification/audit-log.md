# Verification — Structured, immutable audit log (Phase 1; retention is Phase 5)

## How it's triggered
Every admin-facing auth event and every cross-tenant gateway call writes a `PlatformAuditLog`
document via `lib/platform/audit/emit.ts::emitPlatformAuditEvent()` — the only writer.

## Happy path proven
`tests/platform/authFlow.route.test.ts` and `crossTenant.test.ts` both assert real audit rows
appear for real actions (login success/failure, MFA enrollment/failure, logout, cross-tenant reads
and denials) with the correct `eventCategory`/`eventType`/`severity`/`metadata`.

## Must-fail cases proven (append-only, Hard Rule 6)
`tests/platform/platformAuditLog.test.ts` proves, directly against the model (not just the
emitter), that every mutation path throws `.../append-only.../`:
`updateOne`, `findOneAndUpdate`, `updateMany`, `deleteOne`, `findOneAndDelete`, a plain
`deleteMany`, and — the one gap a naive implementation would have missed — **re-saving an
already-persisted document via `.save()`**, which does not go through Mongoose's query-level
middleware at all and needed its own `pre("save")` document-level guard (`isNew === false` →
throw). Also proven: `deleteMany` succeeds ONLY when explicitly opted in via
`.setOptions({ allowRetentionDelete: true })` — the one sanctioned deletion path reserved for
Phase 5's retention job, which itself must write a `RETENTION_DELETION_EXECUTED` audit event before
using that flag (not yet implemented — Phase 5).

## Source-grep enforcement
`tests/platform/sourceGrep.test.ts` asserts (a) no application file outside the model itself and
the emitter calls a mutating method on `PlatformAuditLog` directly, and (b) the model file still
declares all seven guard hooks (`save`, `updateOne`, `findOneAndUpdate`, `updateMany`, `deleteOne`,
`findOneAndDelete`, `deleteMany`) — so a future edit can't silently drop one without failing a test.

## Event taxonomy
`eventCategory` and `eventType` are both Mongoose-enum-constrained against
`lib/constants/statuses.ts`'s `PLATFORM_EVENT_CATEGORY`/`PLATFORM_EVENT_TYPE` — proven by a
rejected-creation test using an invalid category string. No free-text event type is possible,
unlike the pre-existing `models/admin/ActivityLog.ts` (left untouched, still free text, still
serving its own "what happened" purpose per source doc §19's distinction).

## Retention
Not built this phase (Phase 5 per the brief's own build order). The `deleteMany` guard's
`allowRetentionDelete` escape hatch exists now so the model doesn't need a breaking change later.

## Verdict
Pass. Append-only is enforced at every mutation surface Mongoose exposes, including the one
(`.save()` on an existing document) that a surface-level copy of the `CrmAuditLog` pattern would
have missed.
