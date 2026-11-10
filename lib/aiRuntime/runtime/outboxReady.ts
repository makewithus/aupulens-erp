/**
 * The first write to a collection that does not exist yet, made INSIDE a multi-document transaction while
 * another operation creates the collection/indexes, fails with "Unable to write to collection ... due to
 * catalog changes". The outbox is now written inside business transactions, so its collection and indexes
 * must already exist before any transaction starts. Memoised per process; failures are logged and retried
 * on the next call (an already-existing collection makes this a cheap no-op).
 */
let ready: Promise<void> | null = null;

export function ensureOutboxReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      const AiEvent = (await import("@/models/ai/AiEvent")).default;
      await AiEvent.init();
    })().catch((err) => {
      ready = null;
      console.error("[ai-outbox] could not pre-create outbox collection", err instanceof Error ? err.message : err);
    });
  }
  return ready;
}

export function __resetOutboxReadyForTests() {
  ready = null;
}
