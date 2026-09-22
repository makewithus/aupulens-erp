import type { OrgModuleInfo } from "@/lib/middleware/moduleGate";

/**
 * Stale-while-revalidate + request-coalescing cache for the tenant tier/module
 * data middleware needs on (almost) every request but can only fetch via a
 * network round trip (Mongoose can't run in the Edge runtime middleware.ts
 * loads under — see app/api/internal/org-tier/route.ts).
 *
 * Without this, that round trip ran on nearly every navigation with only a
 * short per-isolate TTL and no de-duplication: a page firing several
 * parallel API calls on a cold cache fired that many *separate* fetches to
 * the same endpoint at once (a cache stampede), and every Edge
 * isolate/region keeps its own independent cache — the concrete root cause
 * of "everything is slow at first, then gets fast" reported across the
 * whole system, not just login.
 *
 * - Fresh (< freshMs old): served with zero network calls.
 * - Stale but usable (< staleMs old): served immediately, with a refresh
 *   kicked off in the background — the request that observes stale data
 *   never waits on the network.
 * - Concurrent requests for the same tenant with nothing usable cached share
 *   exactly one in-flight fetch instead of each firing their own.
 * - A failed fetch is never cached, so the next request retries — this
 *   preserves the existing "org lookup failed → fail open" behaviour in
 *   lib/middleware/moduleGate.ts rather than poisoning the cache.
 *
 * `fetcher` is injected so this is testable with a plain vi.fn(), no
 * network/DB — same pattern as moduleGate.ts's OrgDataFetcher.
 */
export type OrgTierFetcher = (tenantId: string, origin: string) => Promise<OrgModuleInfo | null>;

const DEFAULT_FRESH_MS = 5 * 60_000;
const DEFAULT_STALE_MS = 30 * 60_000;

export function createOrgTierCache(
  fetcher: OrgTierFetcher,
  opts?: { freshMs?: number; staleMs?: number },
) {
  const freshMs = opts?.freshMs ?? DEFAULT_FRESH_MS;
  const staleMs = opts?.staleMs ?? DEFAULT_STALE_MS;
  const cache = new Map<string, { data: OrgModuleInfo; expiresAt: number }>();
  const inflight = new Map<string, Promise<OrgModuleInfo | null>>();

  function refresh(tenantId: string, origin: string): Promise<OrgModuleInfo | null> {
    const existing = inflight.get(tenantId);
    if (existing) return existing;
    const promise = fetcher(tenantId, origin)
      .then((data) => {
        if (data) cache.set(tenantId, { data, expiresAt: Date.now() + freshMs });
        return data;
      })
      .catch(() => null)
      .finally(() => inflight.delete(tenantId));
    inflight.set(tenantId, promise);
    return promise;
  }

  return {
    async get(tenantId: string, origin: string): Promise<OrgModuleInfo | null> {
      const now = Date.now();
      const cached = cache.get(tenantId);

      if (cached && cached.expiresAt > now) return cached.data;

      if (cached && cached.expiresAt + staleMs > now) {
        void refresh(tenantId, origin);
        return cached.data;
      }

      return refresh(tenantId, origin);
    },
    /** Test-only: current in-flight-fetch count, to assert de-duplication. */
    _inflightCount(): number {
      return inflight.size;
    },
    /** Test-only: force-clears cached + in-flight state between cases. */
    _reset(): void {
      cache.clear();
      inflight.clear();
    },
  };
}
