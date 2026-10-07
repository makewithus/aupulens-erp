export function unresolvedDuplicateFilter(extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    status: "duplicate",
    duplicateAction: { $nin: ["skip", "update", "create"] },
  };
}
