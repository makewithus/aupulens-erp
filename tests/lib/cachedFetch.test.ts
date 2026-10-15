import { afterEach, describe, expect, it, vi } from "vitest";
import { cachedFetch, invalidateCache } from "@/lib/api/cachedFetch";

describe("cachedFetch", () => {
  afterEach(() => {
    invalidateCache();
    vi.unstubAllGlobals();
  });

  it("can bypass a stale tab cache after external migration writes", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 0 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ count: 215 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const first = await cachedFetch("/api/sales/invoices?page=1");
    expect(await first.json()).toEqual({ count: 0 });

    const fresh = await cachedFetch("/api/sales/invoices?page=1", undefined, { noCache: true });
    expect(await fresh.json()).toEqual({ count: 215 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
