/**
 * Why this exists (two failure modes, both found by tests):
 *  1. The first write to a collection that does not exist yet, made INSIDE a multi-document transaction while
 * another operation creates the collection/indexes, fails with "Unable to write to collection ... due to
 * catalog changes". The outbox is now written inside business transactions, so its collection and indexes
 * must already exist before any transaction starts. Memoised per process; failures are logged and retried
 * on the next call (an already-existing collection makes this a cheap no-op).
 *  2. mongoose is configured with `transactionAsyncLocalStorage`, so EVERY operation issued inside a
 *     transaction callback — including the createCollection / createIndexes that a freshly compiled model
 *     runs automatically — joins that transaction. `safeEmitEvent` calls `connectDB()` which lazily registers
 *     the whole model registry; if that first happens inside the transaction, the index builds run in the
 *     transaction and conflict with its own writes ("Unable to acquire ticket ... lock conflict ...
 *     accounttypes"). Registering the models BEFORE the transaction starts avoids it.
 */
let ready: Promise<void> | null = null;

export function ensureOutboxReady(): Promise<void> {
  if (!ready) {
    ready = (async () => {
      // Needs a live connection (a transaction cannot run without one anyway); never opens one itself.
      const mongoose = (await import("mongoose")).default;
      if (mongoose.connection.readyState !== 1) throw new Error("not connected");
      await (await import("@/lib/db")).default(); // registers the model registry outside any transaction
      const AiEvent = (await import("@/models/ai/AiEvent")).default;
      await AiEvent.init();
    })().catch((err) => {
      ready = null; // retried on the next transaction
      if (!(err instanceof Error && err.message === "not connected")) {
        console.error("[ai-outbox] could not prepare models/outbox collection", err instanceof Error ? err.message : err);
      }
    });
  }
  return ready;
}

export function __resetOutboxReadyForTests() {
  ready = null;
}
