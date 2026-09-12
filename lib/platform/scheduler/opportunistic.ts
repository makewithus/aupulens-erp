import { runDueJobs } from "./runner";

/**
 * Phase 10 Part 0.3 item 3 — "on requests to the platform surface" means
 * exactly that: this is called only from
 * lib/platform/auth/adminSession.ts::getAdminActorFromRequest(), which
 * every `/api/platform/**` route calls — never from any tenant-facing
 * request path. Tenant traffic (`/api/finance/**`, `/api/sales/**`, every
 * customer-facing route) never touches this file at all.
 *
 * Deliberately fire-and-forget: the caller never awaits this, so a slow or
 * failing scheduler check can never add latency to — or fail — the admin
 * request that happened to trigger it. The in-process rate limit below
 * means most platform requests don't even reach the database call; only
 * one check per interval, across the whole server process, does.
 */
const CHECK_INTERVAL_MS = 5 * 60 * 1000;
let lastCheckAt = 0;
let checkInFlight = false;

export function maybeTriggerOpportunisticRun(): void {
  const now = Date.now();
  if (checkInFlight || now - lastCheckAt < CHECK_INTERVAL_MS) return;
  lastCheckAt = now;
  checkInFlight = true;

  runDueJobs("opportunistic")
    .catch((err) => {
      console.error("[scheduler] opportunistic run-due check failed", err);
    })
    .finally(() => {
      checkInFlight = false;
    });
}
