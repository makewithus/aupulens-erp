# Verification — Admin identity, MFA, sessions (Phase 1)

## How it's triggered
`/platform/login` (password) → `/platform/login/mfa` (TOTP, enrolling on first login) →
`app/platform/(app)/**` (session-gated). API surface: `app/api/platform/auth/**`,
`app/api/platform/me`.

## Happy path proven
- Automated (`tests/platform/authFlow.route.test.ts`): password → MFA setup → QR/secret issued →
  wrong code rejected → correct code confirms enrollment, issues session cookie, returns one-time
  backup codes → `/me` succeeds → logout revokes → same cookie now rejected. Returning
  already-enrolled admin logs in with a plain TOTP code, no setup step, no fresh backup codes.
- Manual, over real HTTP against both `next dev` and a production build (`npm run build:local` +
  `npm run start:local`) on a local MongoDB: identical flow driven with `curl`, including reading
  the real `Set-Cookie` header and replaying it. Confirmed working end-to-end both times.

## Must-fail cases proven
- Wrong password → 401, audited (`LOGIN_FAILED`).
- 5 consecutive wrong passwords → account locked 15 minutes (423), audited.
- Wrong TOTP code → 401, audited (`MFA_CHALLENGE_FAILED`, severity `SECURITY`).
- Suspended `AdminUser.status` → session resolution returns null even with a structurally valid,
  unexpired JWT (`tests/platform/adminSession.test.ts`).
- **Hostile case — forged/tenant token**: a JWT signed with a different secret never verifies
  against `ADMIN_SESSION_SECRET` (`verifyAdminSessionTokenEdge` returns null). This is also true
  by construction of the tenant NextAuth session (different secret, different cookie name,
  different claim shape) — a tenant session cookie carries no `aupulens_admin_session` cookie at
  all, so it is never even considered.
- **Hostile case — revoked session, unexpired JWT**: revoking an `AdminSession` row makes the
  still-cryptographically-valid JWT rejected on the next check. Proven both as a direct function
  test and over real HTTP (login → logout → replay the same cookie → 401).
- A tenant session cannot reach `/platform` or `/api/platform/**`: `middleware.ts`'s new block
  never reads the tenant `user`/`req.auth` object for these paths at all — verified by code
  inspection (Part 2.2's requirement) and by the fact `/api/platform/**` was added to the
  middleware's `isPublicApi` exemption specifically so the pre-existing "central tenant session
  check for API routes" doesn't 401 a legitimate admin request that correctly carries no tenant
  session.

## A real finding during manual verification, and how it was resolved
Driving the flow with `curl` surfaced a case where, after logout, a GET to `/platform` with the
now-revoked cookie returned HTTP 200 instead of a redirect, and — in one observation against
`next dev` — the response body contained the admin's name and role. Direct function-level testing
and a server-side debug log both confirmed the authorization decision itself was always correct
(`getAdminActorFromCookieValue` correctly returned `null`, and `redirect("/platform/login")` was
actually called every time). This is Next.js App Router's documented behavior for a `redirect()`
thrown from an async Server Component after streaming has already begun: the HTTP status can no
longer be changed (headers already sent as 200), so Next falls back to a client-side redirect (an
injected `$RX(...)` script, immediate on page load in any real browser, plus a 1-second
`<meta http-equiv="refresh">` belt-and-braces fallback) rather than a clean HTTP 307. **This was
reproduced against a real production build as well** (`npm run build:local` + `npm run
start:local`, `NEXT_DIST_DIR=.next-build`) — it is a genuine framework behavior, not a `next dev`
artifact, and not something fixable by changing this route's own redirect logic (an HTTP status
line cannot be un-sent once flushed).

Given that, the response is hardened so the *behavior* is safe even though the *status code* is
unusual: `components/platform/PlatformShell.tsx` no longer receives the admin's identity as a
server-rendered prop from the layout. It fetches its own identity client-side via
`GET /api/platform/me` (a JSON API route — no streaming/redirect ambiguity, a real 401 is always a
real 401) and shows a loading skeleton until that resolves, redirecting itself on failure. The
layout's own `redirect()` check remains the primary gate; the client fetch is an independent,
redundant second check that has no real identity data to leak even inside the framework's
documented soft-redirect fallback. Re-verified against the production build after this fix: the
post-logout response is still HTTP 200, but the body now contains only a generic loading spinner,
the `NEXT_REDIRECT` digest, and no admin name, role, email, or business data of any kind — captured
and inspected in full (`docs/admin/verification/` session notes). `app/platform/(app)/layout.tsx`
also explicitly opts out of any caching (`dynamic = "force-dynamic"`, `fetchCache =
"force-no-store"`, `revalidate = 0`) even though `cookies()`/`headers()` usage should already imply
this, since "should already" was not good enough for a security boundary here.

**Residual, accepted risk**: a non-JS HTTP client (a scraper, an automated tool, `curl`) hitting
`/platform` with a revoked-but-unexpired cookie sees HTTP 200 with an empty shell rather than a
clean 401/307. No protected data is exposed either way, and every real data-fetching surface
(`/api/platform/**`) returns a correct hard status code regardless of this page-shell quirk. Worth
knowing if a future automated security scanner flags "`/platform` returns 200 for an unauthenticated
request" — the fix for that specific complaint, if ever required, is architectural (avoid async
work in a route-group layout above the redirect, so `redirect()` fires before any streaming begins),
not a one-line change, and is not worth doing pre-emptively for a cosmetic status-code concern with
no actual data exposure.

## Performance
Login → MFA verify → session round trip: ~1-2s locally (dominated by bcrypt cost factor 10-12 and
MongoDB round trips, not by anything control-plane-specific). Not a load-bearing path (an admin
logs in once per session, not per request).

## Verdict
Pass, with one hardening applied beyond the original design (client-side identity fetch instead of
a server-passed prop) as a direct result of manual verification. Recorded here rather than silently
fixed and forgotten, per the brief's own reporting standard.
