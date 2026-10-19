/** Atlas rejects every write when a cluster reaches its configured storage cap. */
export const MONGO_STORAGE_LIMIT_MESSAGE =
  "AI is temporarily unavailable because MongoDB Atlas has reached its storage limit. Ask your Atlas administrator to free database space or increase cluster storage, then retry.";

export function isMongoStorageLimitError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; codeName?: unknown; message?: unknown; errorResponse?: { code?: unknown; errmsg?: unknown } };
  const code = candidate.code ?? candidate.errorResponse?.code;
  const message = [candidate.message, candidate.errorResponse?.errmsg]
    .filter((part): part is string => typeof part === "string")
    .join(" ")
    .toLowerCase();

  return Number(code) === 8000 ||
    (message.includes("space quota") && message.includes("writes are blocked"));
}
