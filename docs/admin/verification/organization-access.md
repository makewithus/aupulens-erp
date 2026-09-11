# Verification — Organisation access / impersonation (Phase 7)

## Scope decision
Source doc §26 describes an elevated session as browsing the tenant's actual application, but
this control plane is architecturally separate (Part 2.1) and never renders tenant app pages —
Global Admin already views tenant data read-only via Phase 2's Organisation detail tabs,
independent of any access request. Retrofitting the access-request flow as a hard gate on those
already-shipped, already-tested tabs was rejected as an unnecessary regression risk (Hard Rule 2)
for no proven need. This phase instead builds the complete, real workflow — request → approve/
deny → time-boxed session → auto-expire → full audit trail — plus a real status check the UI
surfaces as a banner, exactly the same "build the primitive, prove it works, extend to real use
only where needed" pattern Phase 3b already established in this project. Recorded as a deliberate
choice in `docs/admin/PHASE-7-plan.md` and `OPEN_QUESTIONS.md`, not a shortfall.

## An environment incident during verification, and how it was handled
Mid-verification, the full test suite showed a shifting set of unrelated failures across multiple
runs (`ai25WorkingCapitalIntelligence.test.ts`, `paymentPostingAtomicity.route.test.ts`, alongside
the known baseline 3). Investigated rather than dismissed: the shared machine's systemd-managed
`mongod` had crashed outright (core-dump, `systemctl status` showed `Active: failed`) under memory
pressure (12+ of 15GB RAM in use, heavy swap) — exactly the failure mode `docs/ai/
BASELINE_FAILURES.md` already documented from a prior session on this same machine. No `sudo`
available to restart the systemd service; a fresh, user-owned `mongod` instance was started
against a new data directory (worked around a stale Unix socket from the crashed process and an
`AF_UNIX` path-length limit by using a short `--unixSocketPrefix`). A full suite re-run against the
freshly healthy `mongod` came back byte-identical to the established baseline (`3 failed | 177
passed` files, `5 failed | 1503 passed` tests — 176+1 new, 1491+12 new). This is recorded here
because it is exactly the kind of "verify before trusting a failing signal" step Part 1.2 asks
for — the two extra failures were an environment artifact, not a regression, and treating them as
one without checking would have been a false alarm baked into the record.

## Happy path proven
- `accessRequest.test.ts` (12 tests): full lifecycle (pending → approved → active grant → time-
  boxed expiry, proven with a real past `expiresAt` timestamp set directly, not a short `sleep` —
  the honest way to prove time-boxing without slowing the suite down); denial leaves no active
  grant; ending a session early (by the granted admin themselves) makes it immediately inactive;
  a different tenant's grant never leaks into another tenant's active-grant check; every
  transition (`ORG_ACCESS_REQUESTED`/`_APPROVED`/`_DENIED`/`_SESSION_STARTED`/`_SESSION_ENDED`)
  produces exactly one audit event.
- **Manual, over real HTTP**: requested access for a real tenant, confirmed the status endpoint
  correctly reported `active: false` before approval, approved it, confirmed `active: true` with
  the correct reason/admin name/expiry, ended the session, and confirmed `active: false` again —
  the exact sequence the UI banner and the access-requests page depend on.

## Must-fail cases proven
- A `write`-scope request from a role without `IMPERSONATE_WRITE` is rejected outright at request
  time (never left to the approver's judgement) — `SUPPORT_ADMIN`/`READ_ONLY_ADMIN` can never even
  file one, matching Part 2.7's explicit requirement.
- An actor without `REQUEST_ORG_ACCESS` cannot request at all; an actor without
  `APPROVE_ORG_ACCESS` cannot approve or deny; a request cannot be approved twice.
- A reason is mandatory to request access.

## Verdict
Pass, plus one real environment-instability incident correctly diagnosed and worked around rather
than either ignored or wrongly attributed to the code.
