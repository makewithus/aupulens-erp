# PHASE-1-plan.md — Control-plane foundation

> Note on source material: this implementation is driven by `BRIEF-GLOBAL-ADMIN.md`, which itself
> quotes substantial direct content from "the source doc" (role names, audit schema fields, status
> lists, plan names) inline. The source doc's own §30 permission-matrix table (which of the 7
> roles gets which capability, cell by cell) is referenced but never quoted verbatim in the brief
> I was given. Per Part 1.2, this plan makes an explicit, principled inference for that matrix
> from the roles' own stated names/purposes (§25) and Part 2.2's stated exceptions
> (destructive-action gating), records it as `OPEN_QUESTIONS.md` #6, and implements strictly as
> data (`AdminRole.capabilities[]`) so the real matrix can be corrected in one place with zero
> code changes once/if the literal source table is provided.

## Existing code this phase calls (from `CAPABILITY_MAP.md`)
- `lib/crypto.ts` (`encrypt`/`decrypt`, AES-256-GCM) — encrypts TOTP secrets at rest.
- `bcryptjs` — admin password hashing (same library tenant `User` passwords already use).
- `jose` (already resolvable via `next-auth`'s own dependency; added as an explicit direct
  dependency in `package.json` since this phase imports it directly) — signs/verifies the admin
  session JWT, kept structurally separate from `auth.ts`'s NextAuth instance.
- `qrcode` (already a direct dependency) — renders the MFA-enrollment QR as a data URL.
- `models/crm/CrmAuditLog.ts`'s Mongoose middleware pattern — copied for `PlatformAuditLog`'s
  append-only guard.
- `lib/org/rbac.ts` / `lib/crm/rbac.ts` shape — copied for `lib/platform/auth/adminRbac.ts`.
- `config/sidebar/*.ts` shape — copied for `config/sidebar/platform.ts`.
- `tests/accounting/_helpers/routeTestUtils.ts` pattern — copied for a new
  `tests/platform/_helpers/`.
- `middleware.ts` — one new additive branch inside the existing function, gating `/platform` and
  `/api/platform` using the new admin session check; no existing branch is touched.

## New files

**Enums** (`lib/constants/statuses.ts`, additive exports at the end of the file):
`ADMIN_ROLE_VALUES`/`_LABELS`, `ADMIN_USER_STATUS_VALUES`, `ADMIN_CAPABILITY_VALUES`,
`PLATFORM_EVENT_CATEGORY_VALUES`, `PLATFORM_EVENT_TYPE_VALUES`, `PLATFORM_SEVERITY_VALUES`/
`_LABELS`/`_COLORS`.

**Models** (`models/platform/`):
- `AdminUser.ts` — `{name, email (unique), passwordHash, role, status, mfaEnabled,
  mfaSecretEncrypted?, mfaBackupCodeHashes[], failedLoginCount, lockedUntil?, lastLoginAt?}`. No
  `tenantId` field exists on this model at all.
- `AdminRole.ts` — `{role (unique), capabilities[], description}`. Seeded by
  `scripts/seed-platform-admin.ts`'s companion `scripts/seed-platform-roles.ts`.
- `AdminSession.ts` — `{adminUserId, jti (unique), ip, userAgent, createdAt, lastActivityAt,
  expiresAt, revokedAt?}`. The signed JWT is stateless-verifiable but every session is also
  tracked here so it can be listed/revoked and so a revoked-but-not-yet-expired JWT is rejected.
- `PlatformAuditLog.ts` — exact §31 field list, append-only (throws on update/delete paths).

**`lib/platform/auth/`**:
- `totp.ts` — RFC 6238 TOTP, implemented directly on Node `crypto.createHmac` (no new runtime
  dependency for the algorithm itself — well-defined, ~40 lines, avoids an unmaintained/abandoned
  npm package for something this security-sensitive and small).
- `adminSession.ts` — `createAdminSession`, `verifyAdminSessionFromRequest`, `revokeAdminSession`,
  cookie name `aupulens_admin_session`, secret `ADMIN_SESSION_SECRET` (new, separate env var).
- `adminRbac.ts` — `hasCapability(actor, capability)`, `requireCapability(actor, capability)`,
  reads `AdminRole` (cached 60s in-process, matching the existing `getOrgModuleData` cache pattern
  in `middleware.ts`).
- `types.ts` — `AdminActor` type.

**`lib/platform/tenancy/crossTenant.ts`** — the one sanctioned cross-tenant read path. Exposes a
generic `withCrossTenantRead<T>(actor, capability, reason, fn)` wrapper (capability-checks, runs
`fn`, audits, returns) plus one real Phase-1 consumer: `countOrganizations(actor, reason)`, used
by the dashboard shell so it shows a real, non-static number from day one.

**`lib/platform/audit/emit.ts`** — `emitPlatformAuditEvent(...)`, never throws to the caller.

**UI** (`app/platform/`): `layout.tsx` (server-checked admin session, sidebar+topbar shell),
`login/page.tsx`, `login/mfa/page.tsx`, `page.tsx` (dashboard: org count via gateway, admin-user
count, audit-events-today count — all real, all through gateway/audit models, empty-state text for
anything not yet built).

**API** (`app/api/platform/`): `auth/login/route.ts`, `auth/mfa/verify/route.ts`,
`auth/mfa/setup/route.ts`, `auth/logout/route.ts`, `me/route.ts`, `dashboard/summary/route.ts`.

**`config/sidebar/platform.ts`** — Dashboard only this phase (matches the brief's own "empty
shell" exit gate); more sections added as later phases ship their UI.

**`scripts/seed-platform-roles.ts`** — idempotent upsert of the 7 `AdminRole` capability rows.
**`scripts/seed-platform-admin.ts`** — idempotent creation of exactly one bootstrap
`GLOBAL_SUPER_ADMIN` `AdminUser` from `PLATFORM_BOOTSTRAP_ADMIN_EMAIL`/`_PASSWORD` env vars,
`mfaEnabled: false` (forced through first-login MFA enrollment before any session is usable).

**`middleware.ts`** — one additive block, guarding `/platform` and `/api/platform`, calling
`verifyAdminSessionFromRequest` independently of the tenant `auth()` wrapper already in effect;
does not read or modify `req.auth` (the tenant session) at all.

## Tests
`tests/platform/totp.test.ts`, `adminRbac.test.ts` (one case per role × a representative
capability set, allow and deny), `adminSession.test.ts` (issue/verify/revoke, expired-token
rejection, tenant-session-cannot-be-read-as-admin-session hostile case), `crossTenant.test.ts`
(capability gate, audit-record-written-including-on-success, denies without capability, records
nothing on denial vs records deny attempt — decided: denials ARE audited too, severity WARNING),
`platformAuditLog.test.ts` (immutability guard throws on update/delete), `sourceGrep.test.ts`
(asserts `crossTenant.ts` is never imported from `app/api/<module>/**` outside
`app/api/platform/**`, and never from any file outside `app/platform/**`/`lib/platform/**`/
`app/api/platform/**`), `auth.route.test.ts` (login → MFA-required → wrong code rejected+audited →
right code → session cookie set → `/api/platform/me` works → logout revokes it →
old-cookie-now-rejected).

## Open question raised this phase
Recorded as `OPEN_QUESTIONS.md` #6: the §30 permission matrix's exact cell contents were inferred,
not quoted from source. Flagged for confirmation; implemented as pure data so a correction is a
one-file change.
