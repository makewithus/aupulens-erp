export const GENERIC_MIGRATION_ERROR =
  "Migration could not be completed safely. Please review the highlighted records and try again.";

export function productionMigrationError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  if (!raw) return GENERIC_MIGRATION_ERROR;

  if (
    /No matching document found/i.test(raw) ||
    /VersionError/i.test(raw) ||
    /modifiedPaths/i.test(raw) ||
    /__v/i.test(raw)
  ) {
    return "Migration was interrupted by a concurrent update. Please retry from the migration preview.";
  }

  if (/E11000|duplicate key/i.test(raw)) {
    return "A duplicate record was found while writing data. Resolve the duplicate row and retry.";
  }

  if (/Cast to ObjectId failed|validation failed/i.test(raw)) {
    return "Some records contain values the target module cannot accept. Review the invalid rows and retry.";
  }

  return raw.length > 220 ? GENERIC_MIGRATION_ERROR : raw;
}
