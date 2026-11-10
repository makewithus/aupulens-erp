import connectDB from "@/lib/db";
import AiEvent from "@/models/ai/AiEvent";
import PlatformAlert from "@/models/platform/PlatformAlert";
import { AI_EVENT_STATUS, PLATFORM_ALERT_TYPE, PLATFORM_SEVERITY } from "@/lib/constants/statuses";
import { emitPlatformAlert } from "@/lib/platform/alerts/emit";
import { resolveAlertsForKey } from "@/lib/platform/alerts/conditions";
import { getOutboxInsertFailures } from "@/lib/aiRuntime/runtime/safeEmit";

export interface OutboxMetrics {
  pending: number;
  failedAwaitingRetry: number;
  processing: number;
  expiredLeases: number;
  deadLetter: number;
  /** Age (ms) of the oldest event that is, or will become, eligible for processing. */
  oldestPendingAgeMs: number;
  retriedEvents: number;
  processedLastHour: number;
  avgProcessingMsLastHour: number | null;
  maxProcessingMsLastHour: number | null;
  /** Process-local count since boot (a DB outage cannot persist its own failure record). */
  insertFailures: { total: number; critical: number };
}

export function outboxThresholds() {
  return {
    backlog: Number(process.env.AI_OUTBOX_BACKLOG_THRESHOLD) || 500,
    maxPendingAgeMs: Number(process.env.AI_OUTBOX_MAX_PENDING_AGE_MS) || 30 * 60_000,
  };
}

export async function computeOutboxMetrics(now = new Date()): Promise<OutboxMetrics> {
  await connectDB();
  const hourAgo = new Date(now.getTime() - 3_600_000);
  const [counts, oldest, expired, retried, perf] = await Promise.all([
    AiEvent.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    AiEvent.findOne({ status: { $in: [AI_EVENT_STATUS.PENDING, AI_EVENT_STATUS.FAILED] } }).sort({ createdAt: 1 }).select("createdAt").lean<{ createdAt: Date }>(),
    AiEvent.countDocuments({ status: AI_EVENT_STATUS.PROCESSING, leaseUntil: { $lte: now } }),
    AiEvent.countDocuments({ attempts: { $gt: 1 } }),
    AiEvent.aggregate([
      { $match: { status: AI_EVENT_STATUS.PROCESSED, processedAt: { $gte: hourAgo } } },
      { $group: { _id: null, n: { $sum: 1 }, avg: { $avg: "$lastDurationMs" }, max: { $max: "$lastDurationMs" } } },
    ]),
  ]);
  const by = Object.fromEntries(counts.map((c: any) => [c._id, c.n as number]));
  return {
    pending: by[AI_EVENT_STATUS.PENDING] ?? 0,
    failedAwaitingRetry: by[AI_EVENT_STATUS.FAILED] ?? 0,
    processing: by[AI_EVENT_STATUS.PROCESSING] ?? 0,
    expiredLeases: expired,
    deadLetter: by[AI_EVENT_STATUS.DEAD_LETTER] ?? 0,
    oldestPendingAgeMs: oldest ? now.getTime() - oldest.createdAt.getTime() : 0,
    retriedEvents: retried,
    processedLastHour: perf[0]?.n ?? 0,
    avgProcessingMsLastHour: perf[0]?.avg ?? null,
    maxProcessingMsLastHour: perf[0]?.max ?? null,
    insertFailures: getOutboxInsertFailures(),
  };
}

async function raiseOrResolve(alertType: string, dedupeKey: string, active: boolean, message: string, metadata: Record<string, unknown>) {
  if (!active) return resolveAlertsForKey(alertType, dedupeKey);
  const exists = await PlatformAlert.findOne({ alertType, resolvedAt: { $exists: false }, "metadata.dedupeKey": dedupeKey }).lean();
  if (exists) return;
  await emitPlatformAlert({ alertType: alertType as any, severity: PLATFORM_SEVERITY.WARNING, message, metadata: { dedupeKey, ...metadata } });
}

/** Raises (deduped) / auto-resolves backlog + stale-event alerts. Never throws. */
export async function checkOutboxHealth(now = new Date()): Promise<OutboxMetrics | null> {
  try {
    const m = await computeOutboxMetrics(now);
    const t = outboxThresholds();
    const backlog = m.pending + m.failedAwaitingRetry;
    await raiseOrResolve(
      PLATFORM_ALERT_TYPE.AI_OUTBOX_BACKLOG, "ai-outbox-backlog", backlog > t.backlog,
      `AI event outbox backlog is ${backlog} events (threshold ${t.backlog}); workers are not keeping up.`, { backlog, threshold: t.backlog },
    );
    await raiseOrResolve(
      PLATFORM_ALERT_TYPE.AI_OUTBOX_STALE, "ai-outbox-stale",
      m.oldestPendingAgeMs > t.maxPendingAgeMs || m.expiredLeases > 0 || m.deadLetter > 0,
      `AI event outbox needs attention: oldest pending ${Math.round(m.oldestPendingAgeMs / 60000)} min, ${m.expiredLeases} expired leases, ${m.deadLetter} dead-lettered.`,
      { oldestPendingAgeMs: m.oldestPendingAgeMs, expiredLeases: m.expiredLeases, deadLetter: m.deadLetter },
    );
    return m;
  } catch (err) {
    console.error("[ai-outbox] health check failed", err instanceof Error ? err.message : err);
    return null;
  }
}
