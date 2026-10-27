"use client";

/**
 * Drop-in replacement for `fetch` that makes dashboard and detail pages feel instant.
 *
 * Multi-tier caching architecture:
 *  1. In-memory Map cache (0ms instant response within tab session);
 *  2. Browser sessionStorage cache (0ms instant response across page reloads/navigations);
 *  3. Stale-While-Revalidate (SWR): returns cached copy immediately, revalidates in the background;
 *  4. In-flight request de-duplication: concurrent identical requests collapse into a single network call;
 *  5. Automatic mutation invalidation: POST/PUT/PATCH/DELETE invalidate corresponding collection keys.
 */

type Entry = { res: Response; json?: any; ts: number };
const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Response>>();
const DEFAULT_TTL = 30_000; // 30s fresh window before background revalidate
const SESSION_CACHE_PREFIX = "aup_cache:";

let hasHydrated = false;

// hasHydrated is marked true explicitly in client effects (e.g. TenantInitializer)
// to guarantee SSR and initial client hydration trees match 100%.

export function markHydrated() {
  hasHydrated = true;
}

export function isAppHydrated() {
  return hasHydrated;
}

export function getInstantCachedData<T = any>(
  url: string,
  _options?: { allowPreHydration?: boolean }
): T | null {
  if (typeof window === "undefined") return null;
  // Storage is client-only and may disagree with the server-rendered markup.
  // Keep it out of the first render; callers can opt in only when they render
  // the cached value in a hydration-safe boundary.
  if (!hasHydrated) return null;

  const baseUrl = url.split("?")[0];
  const mem = cache.get(url) || cache.get(baseUrl);
  if (mem?.json) return mem.json as T;

  const sess = getSessionCached(url) || getSessionCached(baseUrl);
  if (sess?.body) {
    try {
      const parsed = JSON.parse(sess.body);
      const entry = {
        res: new Response(sess.body, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
        json: parsed,
        ts: sess.ts,
      };
      cache.set(url, entry);
      if (url !== baseUrl) cache.set(baseUrl, entry);
      return parsed as T;
    } catch {
      return null;
    }
  }
  return null;
}

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

function getSessionCached(url: string): { body: string; ts: number } | null {
  if (typeof window === "undefined" || !window.sessionStorage) return null;
  try {
    const raw = window.sessionStorage.getItem(SESSION_CACHE_PREFIX + url);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function setSessionCached(url: string, body: string): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    window.sessionStorage.setItem(
      SESSION_CACHE_PREFIX + url,
      JSON.stringify({ body, ts: Date.now() })
    );
  } catch {
    // QuotaExceeded or disabled
  }
}

function clearSessionPrefix(prefix: string): void {
  if (typeof window === "undefined" || !window.sessionStorage) return;
  try {
    for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
      const k = window.sessionStorage.key(i);
      if (k && k.startsWith(SESSION_CACHE_PREFIX)) {
        const u = k.slice(SESSION_CACHE_PREFIX.length);
        if (resourcePrefix(u) === prefix) {
          window.sessionStorage.removeItem(k);
        }
      }
    }
  } catch {}
}

function invalidatePrefix(prefix: string) {
  for (const key of cache.keys()) {
    if (resourcePrefix(key) === prefix) cache.delete(key);
  }
  clearSessionPrefix(prefix);
}

/** Manually clear cached GETs matching a URL's resource (or everything). */
export function invalidateCache(url?: string) {
  if (!url) {
    cache.clear();
    if (typeof window !== "undefined" && window.sessionStorage) {
      try {
        for (let i = window.sessionStorage.length - 1; i >= 0; i--) {
          const k = window.sessionStorage.key(i);
          if (k && k.startsWith(SESSION_CACHE_PREFIX)) {
            window.sessionStorage.removeItem(k);
          }
        }
      } catch {}
    }
    return;
  }
  invalidatePrefix(resourcePrefix(url));
}

async function networkLoad(url: string, init?: RequestInit): Promise<Response> {
  let p = inflight.get(url);
  if (!p) {
    p = fetch(url, init).then(async (res) => {
      if (res.ok) {
        try {
          const cloneForCache = res.clone();
          const text = await cloneForCache.text();
          let parsedJson: any = null;
          try { parsedJson = JSON.parse(text); } catch {}
          cache.set(url, {
            res: new Response(text, {
              status: res.status,
              statusText: res.statusText,
              headers: new Headers(res.headers),
            }),
            json: parsedJson,
            ts: Date.now(),
          });
          setSessionCached(url, text);
          if (typeof window !== "undefined") {
            window.dispatchEvent(new CustomEvent("aup:revalidated", { detail: { url } }));
          }
        } catch {
          cache.set(url, { res: res.clone(), ts: Date.now() });
        }
      }
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

  const isForced = Boolean(opts?.force || init?.cache === "no-store" || init?.cache === "reload");

  if (opts?.noCache) return fetch(input as any, init);

  const ttl = opts?.ttl ?? DEFAULT_TTL;

  // 1. Check in-memory map
  let cached = cache.get(url);

  // 2. Check browser sessionStorage for instant render across page reloads
  if (!cached) {
    const baseUrl = url.split("?")[0];
    const stored = getSessionCached(url) || getSessionCached(baseUrl);
    if (stored) {
      let parsedJson: any = null;
      try { parsedJson = JSON.parse(stored.body); } catch {}
      cached = {
        res: new Response(stored.body, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
        json: parsedJson,
        ts: stored.ts,
      };
      cache.set(url, cached);
      if (url !== baseUrl) cache.set(baseUrl, cached);
    }
  }

  // 3. If cached copy exists and not forced, return it immediately (0ms wait)
  if (!isForced && cached) {
    // If older than TTL, revalidate in the background
    if (Date.now() - cached.ts > ttl) {
      void networkLoad(url, init).catch(() => {});
    }
    return cached.res.clone();
  }

  // 4. First-time or forced fetch
  const fresh = await networkLoad(url, init);
  return fresh.clone();
}

export default cachedFetch;
