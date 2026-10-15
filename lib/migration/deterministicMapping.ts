/**
 * Pure, dependency-light deterministic column→field matcher.
 *
 * Kept separate from fieldMapping.ts (which imports the tenant AI layer, and
 * transitively the DB) so this can be imported by tests and, if ever needed,
 * client components without dragging in server-only Mongoose/DB code.
 */

import type { EntitySchema } from "@/lib/migration/entitySchemas";

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/**
 * For each target field, pick the source column whose normalized name best
 * matches the field's aliases (exact-normalized > alias-contained-in-column >
 * column-contained-in-alias). A source column is never assigned to two fields.
 */
export function deterministicMapping(
  schema: EntitySchema,
  columns: string[],
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const used = new Set<string>();
  const normCols = columns.map((c) => ({ raw: c, norm: normalize(c) }));

  for (const field of schema.fields) {
    const aliasNorms = [
      normalize(field.key),
      field.label ? normalize(field.label) : "",
      ...field.aliases.map(normalize),
    ].filter(Boolean);
    let bestCol: string | null = null;
    let bestScore = 0;
    for (const col of normCols) {
      if (used.has(col.raw)) continue;
      let score = 0;
      for (const [aliasIndex, a] of aliasNorms.entries()) {
        const priority = Math.max(0, 99 - aliasIndex);
        if (col.norm === a) score = Math.max(score, 1000 + priority);
        // Short aliases (notably "pan") collide with unrelated headers such
        // as "company_name". Require exact matches for short abbreviations.
        else if (col.norm.includes(a) && a.length >= 4) score = Math.max(score, 700 + priority);
      }
      if (score > bestScore) {
        bestScore = score;
        bestCol = col.raw;
      }
    }
    if (bestCol && bestScore >= 60) {
      mapping[field.key] = bestCol;
      used.add(bestCol);
    }
  }
  return mapping;
}

/** Accept only AI suggestions that exactly match a declared field alias. */
export function mergeSafeAiMapping(
  schema: EntitySchema,
  columns: string[],
  base: Record<string, string>,
  suggestion: Record<string, unknown>,
): Record<string, string> {
  const validColumns = new Map(columns.map((column) => [normalize(column), column]));
  const merged = { ...base };
  const usedColumns = new Set(Object.values(base));
  for (const field of schema.fields) {
    if (merged[field.key]) continue;
    const candidate = suggestion[field.key];
    if (typeof candidate !== "string") continue;
    const actualColumn = validColumns.get(normalize(candidate));
    if (!actualColumn || usedColumns.has(actualColumn)) continue;
    const acceptedAliases = [field.key, field.label, ...field.aliases]
      .map(normalize)
      .filter(Boolean);
    if (acceptedAliases.includes(normalize(actualColumn))) {
      merged[field.key] = actualColumn;
      usedColumns.add(actualColumn);
    }
  }
  return merged;
}
