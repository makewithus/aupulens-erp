/**
 * A dependency-light wrapper for emitting AI runtime events from real business logic
 * (docs/ai/BRIEF-02-BATCH-A.md B.2). This file has NO top-level imports of anything that
 * touches `lib/db.ts` — that module throws at MODULE LOAD time if `MONGODB_URI` is unset,
 * which would otherwise break any existing test that imports a business-logic file (e.g.
 * `lib/accounting/posting.ts`) without needing a real DB connection.
 *
 * `safeEmitEvent()` dynamically imports the actual runtime only when called, and wraps that
 * entire attempt in try/catch — so a business route/service can call this unconditionally,
 * with an absolute guarantee it will never throw, even if the AI runtime's environment isn't
 * configured at all (missing env var, DB unreachable, etc.). This is a stronger guarantee
 * than `eventBus.ts`'s own internal dispatch try/catch alone provides, because it also covers
 * failures in *loading* the runtime, not just failures *within* it.
 */
export async function safeEmitEvent(
  tenantId: string,
  eventKey: string,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    const { bootstrapAiRuntime } = await import("@/lib/aiRuntime/bootstrap");
    const { emitEvent } = await import("@/lib/aiRuntime/runtime/eventBus");
    bootstrapAiRuntime();
    await emitEvent(tenantId, eventKey, payload);
  } catch {
    // Swallowed by design — see file header. The AI runtime's own sweep/DLQ (Chunk 1)
    // covers real recovery for genuinely dropped events in production; this path only
    // protects the caller from a broken/unconfigured runtime.
  }
}
