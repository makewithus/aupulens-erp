export function unresolvedDuplicateFilter(extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    status: "duplicate",
    duplicateAction: { $nin: ["skip", "update", "create"] },
  };
}

export function migrationErrorsContainDuplicate(errors: unknown): boolean {
  const messages = Array.isArray(errors)
    ? errors.map((error: any) => String(error?.message || error || ""))
    : [String(errors || "")];

  return messages.some((message) =>
    /duplicate record|duplicate key|E11000|already exists|found while writing data/i.test(message),
  );
}
