import type { FilterQuery, Model } from "mongoose";

/**
 * Opt-in, backward-compatible keyset (cursor) pagination for list endpoints.
 *
 * Why keyset, not skip/limit: the page boundary is "after this (sortValue, _id)", so rows inserted or
 * deleted while a user is paging cannot cause skipped or duplicated records, and the query stays an
 * indexed range scan however deep the user goes. `_id` is always the tie-breaker, so identical sort
 * values (e.g. bulk-imported rows with the same createdAt) still have a total order.
 *
 * Compatibility contract: an endpoint adopting this keeps returning its complete legacy response
 * unless the caller sends `limit` and/or `cursor`. Switching the default is a separate, deliberate step
 * taken only after every consumer has been migrated.
 */
export const DEFAULT_PAGE_SIZE = 25;
export const MAX_PAGE_SIZE = 100;

export type PageRequest =
  | { requested: false }
  | { requested: true; limit: number; cursor: DecodedCursor | null }
  | { requested: true; error: string };

export interface DecodedCursor { k: "d" | "n" | "s"; v: string | number; id: string }
export interface PageInfo { limit: number; hasNext: boolean; nextCursor: string | null }

export function parsePageRequest(sp: URLSearchParams, opts?: { defaultLimit?: number; maxLimit?: number }): PageRequest {
  const rawLimit = sp.get("limit");
  const rawCursor = sp.get("cursor");
  if (rawLimit === null && rawCursor === null) return { requested: false };
  const max = opts?.maxLimit ?? MAX_PAGE_SIZE;
  let limit = opts?.defaultLimit ?? DEFAULT_PAGE_SIZE;
  if (rawLimit !== null) {
    if (!/^\d+$/.test(rawLimit)) return { requested: true, error: "limit must be a positive integer" };
    limit = Number(rawLimit);
    if (limit < 1 || limit > max) return { requested: true, error: `limit must be between 1 and ${max}` };
  }
  let cursor: DecodedCursor | null = null;
  if (rawCursor) {
    try {
      const c = JSON.parse(Buffer.from(rawCursor, "base64url").toString("utf8"));
      if (!c || !["d", "n", "s"].includes(c.k) || !/^[a-f0-9]{24}$/i.test(String(c.id)) || (typeof c.v !== "string" && typeof c.v !== "number")) throw new Error("shape");
      if (c.k === "d" && Number.isNaN(new Date(c.v).getTime())) throw new Error("date");
      cursor = c;
    } catch {
      return { requested: true, error: "invalid cursor" };
    }
  }
  return { requested: true, limit, cursor };
}

function encode(field: unknown, id: unknown): string {
  const k = field instanceof Date ? "d" : typeof field === "number" ? "n" : "s";
  const v = field instanceof Date ? field.toISOString() : (field as string | number);
  return Buffer.from(JSON.stringify({ k, v, id: String(id) })).toString("base64url");
}

/** Returns the page after `cursor` for `sortField` in `direction`, plus info for the next request. */
export async function paginateKeyset<T = any>(
  model: Model<any>,
  baseFilter: FilterQuery<any>,
  req: { limit: number; cursor: DecodedCursor | null },
  sort: { field: string; direction: 1 | -1 },
  configure?: (q: any) => any,
): Promise<{ items: T[]; page: PageInfo }> {
  const op = sort.direction === -1 ? "$lt" : "$gt";
  let filter: FilterQuery<any> = baseFilter;
  if (req.cursor) {
    const value = req.cursor.k === "d" ? new Date(req.cursor.v as string) : req.cursor.v;
    const keyset = { $or: [{ [sort.field]: { [op]: value } }, { [sort.field]: value, _id: { [op]: req.cursor.id } }] };
    filter = { $and: [baseFilter, keyset] };
  }
  let q = model.find(filter).sort({ [sort.field]: sort.direction, _id: sort.direction }).limit(req.limit + 1);
  if (configure) q = configure(q);
  const rows = (await q.lean()) as any[];
  const hasNext = rows.length > req.limit;
  const items = hasNext ? rows.slice(0, req.limit) : rows;
  const last = items[items.length - 1];
  return { items: items as T[], page: { limit: req.limit, hasNext, nextCursor: hasNext && last ? encode(last[sort.field], last._id) : null } };
}
