export function hasCrmAccess(role?: string) {
  return ["admin", "sales", "master-admin"].includes(role || "");
}

export function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function normalizeOptionalEmail(value: unknown) {
  return normalizeOptionalString(value)?.toLowerCase();
}

export function normalizeNotes(input: unknown, authorId: string) {
  if (!Array.isArray(input)) return [];

  return input
    .map((note) => {
      if (typeof note === "string") {
        const body = note.trim();
        return body ? { body, authorId } : null;
      }

      const body = normalizeOptionalString(note?.body);
      if (!body) return null;

      return {
        body,
        authorId: note.authorId || authorId,
        createdAt: note.createdAt ? new Date(note.createdAt) : new Date(),
      };
    })
    .filter(Boolean);
}

export function normalizeFollowUps(input: unknown) {
  if (!Array.isArray(input)) return [];

  return input
    .map((followUp) => {
      const body = normalizeOptionalString(followUp?.body);
      const dueDate = followUp?.dueDate ? new Date(followUp.dueDate) : null;
      if (!body || !dueDate || Number.isNaN(dueDate.getTime())) return null;

      return {
        body,
        dueDate,
        completed: Boolean(followUp.completed),
        completedAt: followUp.completedAt
          ? new Date(followUp.completedAt)
          : undefined,
        completedBy: followUp.completedBy,
      };
    })
    .filter(Boolean);
}
