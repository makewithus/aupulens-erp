# Part 5.2 checklist — the tests that matter most

> One line per item, pointing at the actual test(s)/evidence proving it, not re-asserting it.

- [x] **Every cell of the §30 permission matrix — both the allow and the deny**
  `tests/platform/permissionMatrix.test.ts` — 168 generated cases (7 roles × 24 capabilities),
  each asserting the correct allow or deny, driven from `lib/platform/auth/roleMatrix.ts` (the
  same single source of truth `scripts/seed-platform-roles.ts` writes to the database).

- [x] **A tenant session cannot reach any `/platform` route or `/api/platform` endpoint**
  Structural: `middleware.ts`'s `/platform`+`/api/platform` block never reads `req.auth`/`user`
  (the tenant session) at all — verified by code inspection (`docs/admin/verification/
  admin-identity.md`) and by manual HTTP tests in Phase 1 confirming an unauthenticated/tenant
  request is redirected/401'd. `tests/platform/adminSession.test.ts`'s hostile-case tests prove a
  token signed with a different secret (what a tenant session's JWT effectively is, from this
  system's perspective) never verifies.

- [x] **An admin session cannot be used as a tenant session**
  By construction — different cookie name (`aupulens_admin_session` vs. the tenant NextAuth
  cookie), different signing secret (`ADMIN_SESSION_SECRET` vs. `AUTH_SECRET`), different claim
  shape. `tests/platform/adminSession.test.ts`'s forged-token test proves cross-secret
  verification fails.

- [x] **Cross-tenant reads are impossible except through the gateway (source-grep)**
  `tests/platform/sourceGrep.test.ts` — `lib/platform/tenancy/crossTenant.ts` is never imported
  from a tenant-facing route or from anywhere outside the platform namespace.

- [x] **Every gateway call writes an audit record, including read-only**
  `tests/platform/crossTenant.test.ts` — proven for both allow (audits `CROSS_TENANT_READ`) and
  deny (audits `CROSS_TENANT_READ_DENIED`) paths.

- [x] **Audit records cannot be updated or deleted from the application layer**
  `tests/platform/platformAuditLog.test.ts` — all 7 mutation surfaces Mongoose exposes
  (`updateOne`, `findOneAndUpdate`, `updateMany`, `deleteOne`, `findOneAndDelete`, `deleteMany`,
  and the `.save()`-on-existing-document case a naive copy of the `CrmAuditLog` pattern would have
  missed) all throw. The one sanctioned exception (`allowRetentionDelete`) is itself restricted to
  `lib/platform/audit/retention.ts` by `tests/platform/sourceGrep.test.ts`.

- [x] **A plan downgrade deletes no tenant data (assert record counts before and after)**
  `tests/platform/assignPlan.test.ts` — real `User`/`Account` document counts asserted identical
  before and after a real downgrade.

- [x] **Entitlement enforcement blocks correctly and never locks out an entitled tenant**
  `tests/platform/enforce.test.ts` (block path with a real restrictive plan; fail-open when the
  resolver itself errors) + `tests/inventory/orders.route.test.ts`'s extended case (real 403,
  zero `InventoryOrder` documents created) + its 5 pre-existing tests passing unmodified (proving
  an unconfigured tenant's behaviour is unchanged).

- [x] **All four at-limit AI behaviours work; BLOCK remains the default**
  `tests/platform/limitBehavior.test.ts` — all 4 behaviours (`BLOCK`, `THROTTLE`,
  `ALLOW_WITH_OVERAGE`, `ALLOW_AND_LOG`) tested; `tests/saas/aiLimits.test.ts`'s 42 pre-existing
  tests (never configuring an `AiLimit` row) still pass, proving `BLOCK` is byte-identical to
  pre-Phase-4 behaviour by default.

- [x] **AI cost is computed server-side and cannot be influenced by a client value**
  `tests/platform/aiInstrumentation.test.ts` — cost computed only from a stored `AiCostRate`
  document; `recordAiUsage()`'s input type has no cost field a caller could inject; no API route
  in this codebase accepts a cost value from a request body.

- [x] **Suspension actually prevents what it claims to prevent**
  `tests/platform/organizationStatus.test.ts` (unit: `isActive` flips) **and** manually verified
  over real HTTP — a real tenant owner's login genuinely blocked after suspension, genuinely
  restored after reactivation (`docs/admin/verification/organizations.md`).

- [x] **Retention deletion is itself audited**
  `tests/platform/retention.test.ts` — a `RETENTION_DELETION_EXECUTED` audit event is asserted to
  exist even though the rows it describes are already gone.

- [x] **An impersonation session is time-boxed, banner-flagged, read-only by default, fully attributed**
  `tests/platform/accessRequest.test.ts` — time-boxed (real past `expiresAt` proof, not a sleep),
  read-only by default (`write` scope requires `IMPERSONATE_WRITE`, never grantable to
  `SUPPORT_ADMIN`/`READ_ONLY_ADMIN`), fully attributed (every transition audited with actor +
  tenant). Banner: real UI component + manually verified `active`/`inactive` transitions over real
  HTTP (`docs/admin/verification/organization-access.md`).

- [x] **No static data in any admin UI file (grep test)**
  `tests/platform/noStaticData.test.ts` — every `app/platform/**/page.tsx` that renders any
  dynamic-looking value is checked for a real `fetch("/api/platform/...")` call; a further check
  bans hardcoded sample-record arrays and hardcoded MRR/ARR figures.

- [~] **Every list is server-side paginated and does not degrade at 10k organisations**
  Server-side pagination proven (`tests/platform/organizationList.test.ts` — `.skip()/.limit()`
  at the query layer, not an in-memory filter, over 30 seeded rows). **Not empirically load-tested
  at 10k organisations** in this sandbox — recorded honestly as a gap, not silently assumed. The
  query shape (indexed `subdomain`/`status`/`organizationType` fields, bounded `.limit()`, no
  full-collection scan) is the same shape used everywhere else in this codebase for tenant-scoped
  lists, but a real 10k-row timing measurement was not performed.

- [x] **No MFA bypass exists on any admin auth path**
  Structural: `createAdminSession()` (the only function that issues a real session) has exactly
  one caller in the entire codebase — `app/api/platform/auth/mfa/verify/route.ts` — confirmed by
  direct grep. `tests/platform/authFlow.route.test.ts` proves a session is only issued after a
  correct MFA code, both on first enrollment and on a returning admin's login.
