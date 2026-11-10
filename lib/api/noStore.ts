/**
 * Tenant- or user-specific API responses must never be reused from a browser or
 * shared cache: browser caches are keyed by URL, not by session, so a cached body
 * would survive logout and account switching.
 */
export const NO_STORE_HEADERS = { "Cache-Control": "private, no-store" } as const;
