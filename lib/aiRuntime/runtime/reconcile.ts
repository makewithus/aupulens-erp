import mongoose from "mongoose";
import AiEvent from "@/models/ai/AiEvent";
import { AI_EVENT_STATUS } from "@/lib/constants/statuses";
import { RECONCILED_SOURCES, creationDedupeKey } from "@/lib/aiRuntime/runtime/reconcileKeys";

const BATCH = 500;

/**
 * Recovers creation events lost between a committed business write and its outbox insert (see reconcileKeys.ts).
 * Per tenant and source it reads documents created inside the lookback window via a `_id` range (ObjectIds embed
 * their creation time, so no new index is needed) and upserts the deterministic event key with $setOnInsert:
 * existing events (pending, processed, dead-lettered) are untouched. Recovered events carry no `actingUserId`,
 * so workflows run them observe-only (their permission gate fails closed). Returns the number actually recovered.
 */
export async function reconcileMissingCreationEvents(
  tenantIds: string[],
  opts?: { lookbackMs?: number; now?: number },
): Promise<{ recovered: number; byEvent: Record<string, number> }> {
  const lookbackMs = opts?.lookbackMs ?? (Number(process.env.AI_RECONCILE_LOOKBACK_MS) || 3 * 3600_000);
  const cutoff = mongoose.Types.ObjectId.createFromTime(Math.floor(((opts?.now ?? Date.now()) - lookbackMs) / 1000));
  const byEvent: Record<string, number> = {};
  for (const tenantId of tenantIds) {
    for (const src of RECONCILED_SOURCES) {
      const Model = mongoose.models[src.model];
      if (!Model) continue;
      let ops: mongoose.AnyBulkWriteOperation<any>[] = [];
      const flush = async () => {
        if (!ops.length) return;
        const res = await AiEvent.bulkWrite(ops, { ordered: false });
        if (res.upsertedCount) byEvent[src.eventKey] = (byEvent[src.eventKey] ?? 0) + res.upsertedCount;
        ops = [];
      };
      const cursor = Model.find({ tenantId, _id: { $gte: cutoff }, ...(src.filter ?? {}) }, "_id tenantId moveType").lean().cursor();
      for await (const doc of cursor as AsyncIterable<{ _id: unknown; tenantId?: string; moveType?: string }>) {
        ops.push({
          updateOne: {
            filter: { tenantId, eventKey: src.eventKey, dedupeKey: creationDedupeKey(doc._id) },
            update: { $setOnInsert: { payload: src.payload(doc), status: AI_EVENT_STATUS.PENDING, attempts: 0 } },
            upsert: true,
          },
        });
        if (ops.length >= BATCH) await flush();
      }
      await flush();
    }
  }
  const recovered = Object.values(byEvent).reduce((a, b) => a + b, 0);
  if (recovered) {
    // A non-zero count means a producer's outbox insert failed (or predates deterministic keys): visible, never silent.
    console.error(JSON.stringify({ level: "warn", msg: "ai-outbox: reconciler recovered missing creation events", recovered, byEvent }));
  }
  return { recovered, byEvent };
}
