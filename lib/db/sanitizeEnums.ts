import type { Model } from "mongoose";

/**
 * Drop invalid / empty enum values from a create/update payload so Mongoose
 * applies the field's default (or omits an optional field) instead of throwing
 * a 500 "`X` is not a valid enum value for path `Y`".
 *
 * This is the server-side safety net for AI-prefilled forms: the model can put
 * a value a select doesn't offer (e.g. an invented opportunity stage, or an
 * empty string "" for an optional enum). Rather than trust the client to send
 * only valid enum values, we sanitise at the API boundary — no enum loophole
 * can reach the database.
 *
 * Behaviour per key present in `body`:
 *  - not an enum path            → left untouched
 *  - "" / null / not in the enum → deleted (schema default or omit takes over)
 *  - valid enum value            → left untouched
 *
 * Nested paths (dot notation) and array-of-subdoc enums are out of scope here —
 * this handles the top-level scalar enum fields that forms post.
 */
export function sanitizeEnumFields(model: Model<any>, body: Record<string, any>): void {
  if (!body || typeof body !== "object") return;
  // Defensive: a mocked model (in tests) may have no schema — nothing to sanitise.
  const paths: Record<string, any> = (model as any)?.schema?.paths || {};
  for (const key of Object.keys(body)) {
    const path = paths[key];
    if (!path) continue;
    const enumValues: any[] | undefined =
      (path as any).enumValues && (path as any).enumValues.length
        ? (path as any).enumValues
        : (path.options && Array.isArray(path.options.enum) ? path.options.enum : undefined);
    if (!enumValues || !enumValues.length) continue;
    const v = body[key];
    if (v === "" || v === null || (v !== undefined && !enumValues.includes(v))) {
      delete body[key];
    }
  }
}
