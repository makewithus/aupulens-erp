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
      for (const a of aliasNorms) {
        if (col.norm === a) score = Math.max(score, 100);
        else if (col.norm.includes(a) && a.length >= 3) score = Math.max(score, 70);
        else if (a.includes(col.norm) && col.norm.length >= 3) score = Math.max(score, 60);
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
