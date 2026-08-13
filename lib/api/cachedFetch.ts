"use client";

/**
 * Drop-in replacement for `fetch` that makes list/detail pages feel instant.
 *
 * GET requests:
 *  - served immediately from an in-memory cache when present, so navigating back
 *    to a page you've already visited renders its data with no network wait;
 *  - if the cached copy is older than the TTL it's still returned instantly, then
 *    refreshed in the background (stale-while-revalidate);
 *  - concurrent identical requests are de-duped into ONE network call — clicking
 *    fast/repeatedly can't spawn a storm of duplicate fetches.
 *
 * Mutations (POST/PUT/PATCH/DELETE): passed straight through, and on success the
 * cached GETs for that resource are invalidated so the next read is fresh — data
 * stays consistent after a create/edit/delete.
 *
 * The cache lives for the tab session (module-level Map) and is bounded by TTL.
 * Because it returns a real `Response`, callers keep using `res.ok` / `res.json()`
 * exactly as with `fetch` — a true drop-in.
 */

type Entry = { res: Response; ts: number };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Response>>();
const DEFAULT_TTL = 30_000; // 30s: fresh window before a background revalidate

function urlString(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return (input as Request).url;
}

/** `/api/sales/orders/123?x=1` → `/api/sales/orders` — the collection prefix. */
function resourcePrefix(url: string): string {
  try {
    const u = new URL(url, typeof location !== "undefined" ? location.origin : "http://localhost");
    return u.pathname.split("/").slice(0, 4).join("/");
  } catch {
    return url.split("?")[0];
  }
}

function invalidatePrefix(prefix: string) {
  for (const key of cache.keys()) {
    if (resourcePrefix(key) === prefix) cache.delete(key);
  }
}

/** Manually clear cached GETs matching a URL's resource (or everything). */
export function invalidateCache(url?: string) {
  if (!url) { cache.clear(); return; }
  invalidatePrefix(resourcePrefix(url));
}

async function networkLoad(url: string, init?: RequestInit): Promise<Response> {
  let p = inflight.get(url);
  if (!p) {
    p = fetch(url, init).then((res) => {
      if (res.ok) cache.set(url, { res: res.clone(), ts: Date.now() });
      return res;
    });
    inflight.set(url, p);
    void p.catch(() => {}).finally(() => inflight.delete(url));
  }
  return p;
}

export async function cachedFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
  opts?: { ttl?: number; force?: boolean; noCache?: boolean },
): Promise<Response> {
  const url = urlString(input);
  const method = (init?.method || "GET").toUpperCase();

  // Mutations: pass through, then invalidate the resource's cached reads.
  if (method !== "GET" && method !== "HEAD") {
    const res = await fetch(input as any, init);
    if (res.ok) invalidatePrefix(resourcePrefix(url));
    return res;
  }

  if (opts?.noCache) return fetch(input as any, init);

  const ttl = opts?.ttl ?? DEFAULT_TTL;
  const cached = cache.get(url);
  if (!opts?.force && cached) {
    // Stale → return the cached copy now, refresh in the background.
    if (Date.now() - cached.ts > ttl) void networkLoad(url, init).catch(() => {});
    return cached.res.clone();
  }
  const fresh = await networkLoad(url, init);
  return fresh.clone();
}

export default cachedFetch;
