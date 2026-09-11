# PHASE-7-plan.md — Organisation access ("impersonation" as supported access)

## Scope decision, stated up front
Source doc §26 describes an elevated session as if the admin browses the tenant's actual
application — but this control plane is architecturally a physically separate system (Part 2.1)
that never renders tenant app pages; Global Admin already views tenant data read-only through
Phase 2's Organisation detail tabs, independent of any access-request flow. Retrofitting the
access-request flow as a hard *gate* on those already-shipped, already-tested tabs would be a
real regression risk for no proven need (every role that has read access today gets it via a
plain capability, and Hard Rule 2 forbids risking that). Following the exact precedent Phase 3b
already set in this same project (build the enforcement primitive, prove it works, wire it into
real use only where a concrete need exists, document the rest rather than force a retrofit): this
phase builds the **complete, real, tested** request → approve/deny → time-boxed session →
auto-expire → full-audit-trail workflow, plus a real "you are in an active access session" status
check the UI surfaces as a banner — without touching Phase 2's existing detail-tab access checks.
Recorded in `OPEN_QUESTIONS.md` as the explicit, considered choice it is.

## New model
`models/platform/AdminAccessRequest.ts`: `{adminUserId, tenantId, reason, requestedScope:
"read"|"write", status: "pending"|"approved"|"denied"|"expired"|"ended", approvedBy?, grantedAt?,
expiresAt?, endedAt?, deniedReason?}`. `requestedScope: "write"` requires `IMPERSONATE_WRITE`
(only `GLOBAL_SUPER_ADMIN`/`GLOBAL_ADMIN` per the current matrix) — `SUPPORT_ADMIN`/
`READ_ONLY_ADMIN` can only ever request/be granted `"read"` (Part 2.7: "not available to
SUPPORT_ADMIN or READ_ONLY_ADMIN"), enforced at request time, not just by convention.

## `lib/platform/access/`
- `request.ts`: `requestOrgAccess` (reason required, `write` scope gated by `IMPERSONATE_WRITE`),
  `approveOrgAccess` (requires `APPROVE_ORG_ACCESS`, sets a fixed 4-hour `expiresAt` — never
  open-ended, per Part 2.7), `denyOrgAccess`, `endOrgAccessSession` (an admin or an approver can
  end their own/a granted session early). Every transition is audited
  (`ORG_ACCESS_REQUESTED`/`_APPROVED`/`_DENIED`/`_SESSION_STARTED`/`_SESSION_ENDED`).
- `status.ts`: `getActiveAccessGrant(adminUserId, tenantId)` — approved, not expired, not ended;
  the one function a "you are in an elevated session" banner reads. Expiry is checked live at
  read time (`expiresAt < now` → not active), so correctness never depends on a cron having run;
  a cron (`app/api/cron/platform/access-session-expiry/`) additionally flips stale `approved` rows
  to `expired` for tidy reporting, but is not what enforces the boundary.

## UI
`/platform/access-requests`: request a new grant, and (for an approver) a pending-requests queue
with approve/deny. A banner component on the organisation detail page, backed by a real
`GET /api/platform/organizations/[id]/access-status` call — shown only when the current admin has
a real active grant for that tenant, naming the admin, the tenant, the reason, and time remaining.

## Tests
`accessRequest.test.ts`: full lifecycle (request → approve → active grant → auto-expire by time →
no longer active); denial leaves no active grant; `write` scope rejected for an actor without
`IMPERSONATE_WRITE` even if requested; ending a session early makes it immediately inactive; every
transition produces exactly one audit event with the right actor/tenant/session attribution.

## Exit gate
A full request lifecycle is provable end-to-end; a session is genuinely time-boxed (proven with a
past `expiresAt`, not just a short sleep); default scope is read, write requires a separate,
gated request; every action in the lifecycle is attributed and audited.
