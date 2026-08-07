/**
 * Sanitize ERP data before putting it in an AI prompt.
 *
 * The module AI assistants fetch live records and hand them to the model as
 * context. Dumping raw records means (a) internal identifiers — Mongo ObjectIds,
 * partnerId/customerId/userId — leak into user-facing answers (the reported
 * "partnerId: 6a4a9081…" garbage), and (b) the context is huge, slow, and
 * dilutes the actual signal. This strips id-like fields, drops obvious
 * ObjectId-looking values, and caps array sizes so the model sees clean,
 * aggregate-level facts — not a database dump.
 */

// Keys that are internal identifiers or noise — never useful in an answer.
const DROP_KEYS = new Set([
  "_id", "id", "__v", "tenantId", "partnerId", "customerId", "userId", "createdBy",
  "ownerId", "owner_id", "created_by", "updatedBy", "salespersonId", "vendorId",
  "accountId", "journalId", "sourceId", "linked_record_id", "employeeId", "password",
]);

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;

function isIdLikeKey(key: string): boolean {
  if (DROP_KEYS.has(key)) return true;
  // Any key ending in Id / _id (e.g. receivableAccountId, opportunity_id).
  return /(^|[a-z0-9])(Id|_id)$/.test(key);
}

/**
 * @param value  the data to clean
 * @param opts.maxArray  max items kept per array (default 8)
 * @param opts.depth     internal recursion guard
 */
export function sanitizeForAi(
  value: unknown,
  opts: { maxArray?: number } = {},
  depth = 0,
): unknown {
  const maxArray = opts.maxArray ?? 8;
  if (depth > 6) return undefined; // hard depth cap
  if (value == null) return value;

  if (typeof value === "string") {
    // Drop bare ObjectId strings anywhere they appear as values.
    return OBJECT_ID_RE.test(value) ? undefined : value;
  }
  if (typeof value === "number" || typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    const cleaned = value
      .slice(0, maxArray)
      .map((v) => sanitizeForAi(v, opts, depth + 1))
      .filter((v) => v !== undefined);
    return cleaned;
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isIdLikeKey(k)) continue;
      const cleaned = sanitizeForAi(v, opts, depth + 1);
      if (cleaned !== undefined && !(Array.isArray(cleaned) && cleaned.length === 0)) {
        out[k] = cleaned;
      }
    }
    return out;
  }

  return undefined;
}

/** Convenience: sanitized, compact JSON string ready to embed in a prompt. */
export function safeContextJson(data: unknown, opts?: { maxArray?: number }): string {
  return JSON.stringify(sanitizeForAi(data, opts));
}
