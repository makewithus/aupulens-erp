# Verification — SUPPORT_ADMIN detail-access gate, over real HTTP (Phase 11 Part 1.9, §26)

## Why this was re-verified
`assertOrganizationDetailAccess()` (Phase 9 Part 0.2) was unit-tested only
(`tests/platform/organizationDetailAccess.test.ts`, 7 tests calling the function directly). The
brief asked for the same thing proven end-to-end: a live dev server, a real seeded `SUPPORT_ADMIN`
account, the actual login + MFA flow, and real `fetch()` requests — not a mocked `AdminActor`.

## Setup
Started a local dev server (`npx next dev`) against this project's own MongoDB Atlas cluster (the
same one `.env` already points every other local run at) and drove the full flow with a one-off
script: seed a `SUPPORT_ADMIN` `AdminUser` + a real `Organization`, log in over HTTP, complete the
mandatory first-login MFA enrollment (computing the real TOTP code from the secret the server
returned, using `lib/platform/auth/totp.ts::generateTotpCode()` — the same function the server
itself uses to verify), then issue the three real `GET` requests the brief names, mutating
`AdminAccessRequest` directly between them only to change the *grant's own state* (approved/active
vs. expired) — never mocking or bypassing the request under test itself. Cleaned up all seeded data
at the end; confirmed a zero count for the seeded email/subdomain afterward.

## A real environment gap found and fixed before this could even run
The first login attempt 500'd:

```
Error: Please define ADMIN_SESSION_SECRET (>= 32 chars) — must be different from AUTH_SECRET.
    at getAdminSessionSecret (lib/platform/auth/adminSessionEdge.ts:19:11)
```

Local `.env` had `NEXTAUTH_SECRET`/`AUTH_SECRET` but had never had `ADMIN_SESSION_SECRET` at all —
meaning **the entire platform admin login flow could not have worked in local dev before this**,
for any prior manual verification in this project's history that claimed to run "over real HTTP"
locally. Generated a new 32-byte secret and added it to `.env` (gitignored, local-only config, no
relation to any external system — safe to add). This is worth flagging explicitly for the Part 7
handover: anyone running the browser-based test pass locally needs this variable set, or every
`/platform/login` attempt fails at the same point.

## Results — all three named cases, exactly as expected

| Case | Request | Result |
|---|---|---|
| No grant | `GET /api/platform/organizations/http-verify-org?tab=overview` | `403`, `AdminAccessGrantRequiredError`'s exact message, naming the role and tenant |
| Grant approved, active (`expiresAt` 1h in the future) | same request | `200`, real organisation data (`name: "HTTP Verify Org"`) |
| Grant expired (`expiresAt` set 1 minute in the past) | same request | `403` again, same message — blocked once more, not cached as still-active |

## Verdict
Pass. The gate behaves identically under real HTTP to what the unit tests already proved,
confirming the unit tests were not missing something only a live request path would expose (route
wiring, cookie handling, middleware order). The `ADMIN_SESSION_SECRET` gap is the one finding worth
carrying forward — fixed locally, but worth confirming it's set wherever else this flow needs to
run (any other local/staging environment used for the Part 7 browser pass).
