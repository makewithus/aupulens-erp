import connectDB from "@/lib/db";
import AiOperationsRepairLog, { type OpsRepairType } from "@/models/ai/AiOperationsRepairLog";

/**
 * AI-30's retry-cap/backoff/escalation gate (docs/ai/BRIEF-08a-BATCH-G.md A.5: "retry cap per
 * issue with exponential backoff... a repair that fails twice escalates and is never retried").
 * Every repair tool consults this BEFORE attempting anything — the cap and backoff are enforced
 * here, once, not re-implemented per repair type.
 */

export const MAX_REPAIR_ATTEMPTS = 2;
const BASE_BACKOFF_MS = 60_000; // 1 minute

export interface RepairGateDecision {
  allowed: boolean;
  reason: string;
  nextAttempt: number;
}

/** Reads this issue's own repair history and decides whether another attempt is allowed right
 *  now. A `failed` outcome twice permanently escalates (never retried again, per A.5) — a `success`
 *  or `escalated` outcome also means "nothing more to do" (already resolved or already handed to a
 *  human). Backoff between attempt 1 and attempt 2 is exponential from the last failure's time. */
export async function checkRepairGate(tenantId: string, issueKey: string): Promise<RepairGateDecision> {
  await connectDB();
  const history = await AiOperationsRepairLog.find({ tenantId, issueKey }).sort({ createdAt: -1 }).lean();

  if (history.length === 0) return { allowed: true, reason: "no prior attempt", nextAttempt: 1 };

  const latest = history[0];
  if (latest.outcome === "success") return { allowed: false, reason: "already repaired successfully", nextAttempt: latest.attempt };
  if (latest.outcome === "escalated") return { allowed: false, reason: "already escalated — never retried", nextAttempt: latest.attempt };

  const failedCount = history.filter((h) => h.outcome === "failed").length;
  if (failedCount >= MAX_REPAIR_ATTEMPTS) return { allowed: false, reason: `failed ${failedCount} times — must escalate, not retry`, nextAttempt: latest.attempt + 1 };

  const backoffMs = BASE_BACKOFF_MS * 2 ** (failedCount - 1);
  const readyAt = new Date(latest.createdAt).getTime() + backoffMs;
  if (Date.now() < readyAt) return { allowed: false, reason: `backing off until ${new Date(readyAt).toISOString()}`, nextAttempt: latest.attempt + 1 };

  return { allowed: true, reason: `retry ${failedCount + 1} of ${MAX_REPAIR_ATTEMPTS}`, nextAttempt: latest.attempt + 1 };
}

export async function recordRepairAttempt(params: {
  tenantId: string;
  issueKey: string;
  repairType: OpsRepairType;
  attempt: number;
  beforeState: Record<string, unknown>;
  afterState: Record<string, unknown> | null;
  outcome: "success" | "failed" | "escalated";
  error?: string;
}): Promise<void> {
  await connectDB();
  await AiOperationsRepairLog.create(params);
}
