/**
 * Unit tests for lib/middleware/orgTierCache.ts — the stale-while-revalidate
 * + request-coalescing cache that keeps middleware's per-request tier/module
 * lookup off the hot path. Pure unit tests: injected fetcher, no network/DB,
 * fake timers to control freshness without real waits.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createOrgTierCache } from "@/lib/middleware/orgTierCache";
import type { OrgModuleInfo } from "@/lib/middleware/moduleGate";

const ORIGIN = "https://tenant.example.com";
const DATA: OrgModuleInfo = { tier: "growth", enabledModules: ["sales"], subscriptionStatus: "active" };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("createOrgTierCache", () => {
  it("the first request for a tenant waits on the fetcher", async () => {
    const fetcher = vi.fn().mockResolvedValue(DATA);
    const cache = createOrgTierCache(fetcher);
    const data = await cache.get("t1", ORIGIN);
    expect(data).toEqual(DATA);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith("t1", ORIGIN);
  });

  it("a fresh cache hit never calls the fetcher again", async () => {
    const fetcher = vi.fn().mockResolvedValue(DATA);
    const cache = createOrgTierCache(fetcher);
    await cache.get("t1", ORIGIN);
    await cache.get("t1", ORIGIN);
    await cache.get("t1", ORIGIN);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("concurrent requests on a cold cache share exactly ONE in-flight fetch (no stampede)", async () => {
    let resolveFetch: (v: OrgModuleInfo) => void;
    const fetcher = vi.fn(() => new Promise<OrgModuleInfo>((res) => (resolveFetch = res)));
    const cache = createOrgTierCache(fetcher);

    const calls = [cache.get("t1", ORIGIN), cache.get("t1", ORIGIN), cache.get("t1", ORIGIN), cache.get("t1", ORIGIN), cache.get("t1", ORIGIN)];
    expect(cache._inflightCount()).toBe(1);
    resolveFetch!(DATA);
    const results = await Promise.all(calls);

    expect(fetcher).toHaveBeenCalledTimes(1); // not 5
    for (const r of results) expect(r).toEqual(DATA);
  });

  it("different tenants never share or block on each other's fetch", async () => {
    const fetcher = vi.fn().mockImplementation((tenantId: string) => Promise.resolve({ ...DATA, tier: tenantId }));
    const cache = createOrgTierCache(fetcher);
    const [a, b] = await Promise.all([cache.get("t1", ORIGIN), cache.get("t2", ORIGIN)]);
    expect(a.tier).toBe("t1");
    expect(b.tier).toBe("t2");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("stale-but-usable data is returned instantly and triggers exactly one background refresh", async () => {
    const fetcher = vi.fn().mockResolvedValue(DATA);
    const cache = createOrgTierCache(fetcher, { freshMs: 1000, staleMs: 5000 });

    await cache.get("t1", ORIGIN); // populates cache, freshUntil = now+1000
    expect(fetcher).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(2000); // now stale (past freshMs) but within staleMs window
    const data = await cache.get("t1", ORIGIN); // must resolve immediately, not wait on the refresh
    expect(data).toEqual(DATA);
    expect(fetcher).toHaveBeenCalledTimes(2); // one background refresh kicked off

    // A second call while that refresh is still in flight doesn't start a third.
    await cache.get("t1", ORIGIN);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("past the stale window, the request waits again (nothing usable left)", async () => {
    const fetcher = vi.fn().mockResolvedValue(DATA);
    const cache = createOrgTierCache(fetcher, { freshMs: 1000, staleMs: 2000 });

    await cache.get("t1", ORIGIN);
    vi.advanceTimersByTime(5000); // past freshMs + staleMs entirely
    await cache.get("t1", ORIGIN);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("a failed fetch is never cached, so the next call retries instead of being poisoned", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(DATA);
    const cache = createOrgTierCache(fetcher);

    const first = await cache.get("t1", ORIGIN);
    expect(first).toBeNull();
    const second = await cache.get("t1", ORIGIN);
    expect(second).toEqual(DATA);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("a fetcher that throws behaves like a failed fetch, not an unhandled rejection", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce(DATA);
    const cache = createOrgTierCache(fetcher);
    await expect(cache.get("t1", ORIGIN)).resolves.toBeNull();
    await expect(cache.get("t1", ORIGIN)).resolves.toEqual(DATA);
  });
});
