/**
 * Validation engine — integrity checks before anything is written.
 *
 * Given a job's rows + mapping, produces per-row issues (errors block the row,
 * warnings don't) plus in-file duplicate detection. Cross-collection duplicate
 * detection against existing tenant records is done in importer.ts (it needs DB
 * access); this file is pure and unit-testable.
 */

import {
  getEntitySchema,
  type EntitySchema,
  type FieldValidator,
} from "@/lib/migration/entitySchemas";

export interface ValidationIssue {
  rowIndex: number;
  field?: string;
  severity: "error" | "warning";
  message: string;
}

export interface ValidationResult {
  errorCount: number;
  warningCount: number;
  duplicateCount: number;
  issues: ValidationIssue[];
}

// Indian GSTIN: 2-digit state code + 10-char PAN + entity digit + 'Z' + checksum.
const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Valid Indian GST state codes are 01–38 (plus 97 for "Other Territory").
const VALID_STATE_CODES = new Set(
  Array.from({ length: 38 }, (_, i) => String(i + 1).padStart(2, "0")).concat(["97"]),
);

/** Pull the canonical value for a target field out of a raw source row. */
export function mapValue(
  row: Record<string, unknown>,
  mapping: Record<string, string>,
  fieldKey: string,
): string {
  const col = mapping[fieldKey];
  if (!col) return "";
  const v = row[col];
  if (v === null || v === undefined) return "";
  return String(v).trim();
}

/** Build the full canonical record { fieldKey: value } for a row. */
export function toCanonicalRecord(
  schema: EntitySchema,
  row: Record<string, unknown>,
  mapping: Record<string, string>,
): Record<string, string> {
  const rec: Record<string, string> = {};
  for (const f of schema.fields) {
    rec[f.key] = mapValue(row, mapping, f.key);
  }
  return rec;
}

function checkFormat(validator: FieldValidator, value: string): string | null {
  switch (validator) {
    case "nonEmpty":
      return value.trim() ? null : "must not be empty";
    case "email":
      return EMAIL_RE.test(value) ? null : "is not a valid email address";
    case "phone":
      return /\d/.test(value) ? null : "does not contain any digits";
    case "number":
      return Number.isNaN(Number(value.replace(/,/g, ""))) ? "is not a number" : null;
    case "gstin": {
      const up = value.toUpperCase();
      if (!GSTIN_RE.test(up)) return "is not a valid GSTIN (format check failed)";
      if (!VALID_STATE_CODES.has(up.slice(0, 2))) return "has an invalid GST state code";
      return null;
    }
    default:
      return null;
  }
}

/** Composite dedupe signature for a row (lowercased, joined non-empty keys). */
export function dedupeSignature(
  schema: EntitySchema,
  record: Record<string, string>,
): string | null {
  const parts = schema.dedupeKeys
    .map((k) => record[k]?.trim().toLowerCase())
    .filter((v): v is string => !!v);
  return parts.length ? parts.join("|") : null;
}

export function validateRows(
  entity: string,
  rows: Record<string, unknown>[],
  mapping: Record<string, string>,
): ValidationResult {
  const schema = getEntitySchema(entity);
  const issues: ValidationIssue[] = [];
  if (!schema) {
    return { errorCount: 1, warningCount: 0, duplicateCount: 0, issues: [{ rowIndex: -1, severity: "error", message: `Unknown entity type "${entity}"` }] };
  }

  // Required-field mapping check (structural, not per-row): a required field with
  // no mapped column at all is a single hard error.
  for (const f of schema.fields) {
    if (f.required && !mapping[f.key]) {
      issues.push({ rowIndex: -1, field: f.key, severity: "error", message: `Required field "${f.label}" is not mapped to any column.` });
    }
  }

  const seen = new Map<string, number>();
  let duplicateCount = 0;

  rows.forEach((row, rowIndex) => {
    const rec = toCanonicalRecord(schema, row, mapping);

    for (const f of schema.fields) {
      const value = rec[f.key];
      if (f.required && !value) {
        issues.push({ rowIndex, field: f.key, severity: "error", message: `${f.label} is required but empty.` });
        continue;
      }
      if (value && f.validate) {
        const err = checkFormat(f.validate, value);
        if (err) {
          // Bad GSTIN/email etc. is a warning, not a blocker — the record is
          // still importable; the field just won't pass downstream compliance.
          issues.push({ rowIndex, field: f.key, severity: "warning", message: `${f.label} ${err}.` });
        }
      }
    }

    const sig = dedupeSignature(schema, rec);
    if (sig) {
      if (seen.has(sig)) {
        duplicateCount += 1;
        issues.push({ rowIndex, severity: "warning", message: `Duplicate of row ${seen.get(sig)! + 1} within the file (same ${schema.dedupeKeys.join("/")}).` });
      } else {
        seen.set(sig, rowIndex);
      }
    }
  });

  return {
    errorCount: issues.filter((i) => i.severity === "error").length,
    warningCount: issues.filter((i) => i.severity === "warning").length,
    duplicateCount,
    issues,
  };
}
