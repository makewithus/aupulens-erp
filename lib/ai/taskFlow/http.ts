/**
 * Data access goes through the REAL sales routes with the caller's own cookie, so every
 * permission, module gate, entitlement and subscription check the UI is subject to applies
 * here too — this layer has no back door (Part 6.3).
 */
import type { CustomerLite } from "./parse";
import type { Lookups } from "./engine";

export class FlowAccessError extends Error {}

export interface InternalCtx { origin: string; cookie: string; fetchFn?: typeof fetch }

async function call(ctx: InternalCtx, path: string, init?: RequestInit): Promise<{ status: number; json: any }> {
  const f = ctx.fetchFn ?? fetch;
  const res = await f(`${ctx.origin}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", cookie: ctx.cookie, ...(init?.headers as Record<string, string> | undefined) },
    cache: "no-store",
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

const toLite = (c: any): CustomerLite => ({
  id: String(c._id),
  name: c.header?.displayName || c.header?.name || c.header?.companyName || "(unnamed)",
  aliases: [c.header?.name, c.header?.displayName, c.header?.companyName].filter(Boolean),
});

export function createLookups(ctx: InternalCtx): Lookups {
  return {
    async customerCount() {
      const r = await call(ctx, "/api/sales/customers?page=1&limit=1");
      if (r.status === 401 || r.status === 403) throw new FlowAccessError(r.json?.error || "forbidden");
      if (r.status >= 400) throw new Error(`customers lookup failed (${r.status})`);
      return Number(r.json?.total ?? 0);
    },
    async findCustomers(q: string) {
      const words = [...new Set(q.split(/\s+/).filter((w) => w.length >= 3))].slice(0, 3);
      const terms = words.length ? words : [q];
      const results = await Promise.all(terms.map((t) => call(ctx, `/api/sales/customers?search=${encodeURIComponent(t)}&page=1&limit=10`)));
      const byId = new Map<string, CustomerLite>();
      for (const r of results) for (const c of r.json?.items ?? []) byId.set(String(c._id), toLite(c));
      return [...byId.values()];
    },
    async lastCustomer() {
      const r = await call(ctx, "/api/sales/invoices?page=1&limit=1");
      const c = r.json?.data?.[0]?.customerId;
      return c && c._id ? toLite(c) : null;
    },
  };
}

/** Create through the existing route. Returns the new record id, or a plain-language failure. */
export async function createViaRoute(ctx: InternalCtx, path: string, body: Record<string, unknown>): Promise<{ ok: true; id: string } | { ok: false; message: string }> {
  const r = await call(ctx, path, { method: "POST", body: JSON.stringify(body) });
  if (r.status === 401 || r.status === 403) return { ok: false, message: "you don't have permission to create this" };
  if (r.status >= 200 && r.status < 300 && r.json?.data?._id) return { ok: true, id: String(r.json.data._id) };
  return { ok: false, message: String(r.json?.message || r.json?.error || `the server returned ${r.status}`) };
}
