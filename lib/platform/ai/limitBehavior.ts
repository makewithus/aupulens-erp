import connectDB from "@/lib/db";
import AiLimit from "@/models/platform/AiLimit";
import { AI_AT_LIMIT_BEHAVIOR, AiAtLimitBehavior, PLATFORM_EVENT_CATEGORY, PLATFORM_EVENT_TYPE, PLATFORM_SEVERITY } from "@/lib/constants/statuses";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";

export type AtLimitDecision =
  | { action: "block" }
  | { action: "allow"; behavior: AiAtLimitBehavior; delayMs?: number };

const THROTTLE_DELAY_MS = 2000;

/**
 * Source doc §15's four at-limit behaviours. Called from lib/ai/tenantAi.ts
 * ONLY when the tenant's monthly count has already reached its cap — i.e.
 * this never runs for a normal, under-cap call.
 *
 * **BLOCK is the default and requires no AiLimit row at all** — an
 * unconfigured tenant gets `{action: "block"}`, byte-identical to every
 * tenant's behaviour before this phase existed (Hard Rule: "keeping BLOCK
 * as the default so nothing changes for existing tenants until an admin
 * changes it").
 */
export async function resolveAtLimitDecision(tenantId: string): Promise<AtLimitDecision> {
  await connectDB();
  const limit = await AiLimit.findOne({ tenantId }).lean();
  const behavior = limit?.atLimitBehavior ?? AI_AT_LIMIT_BEHAVIOR.BLOCK;

  if (behavior === AI_AT_LIMIT_BEHAVIOR.BLOCK) {
    return { action: "block" };
  }

  // Every non-BLOCK behaviour allows the call through — the differences are
  // in side effects only (delay, or what gets logged/tracked), never in
  // whether the request itself proceeds.
  if (behavior === AI_AT_LIMIT_BEHAVIOR.ALLOW_WITH_OVERAGE || behavior === AI_AT_LIMIT_BEHAVIOR.ALLOW_AND_LOG) {
    await emitPlatformAuditEvent({
      actor: { id: "system", role: "system" },
      tenantId,
      eventCategory: PLATFORM_EVENT_CATEGORY.AI,
      eventType: PLATFORM_EVENT_TYPE.AI_USAGE_THRESHOLD_CROSSED,
      severity: PLATFORM_SEVERITY.WARNING,
      metadata: { behavior, note: "monthly AI cap reached; call allowed per configured at-limit behavior" },
    });
  }

  return {
    action: "allow",
    behavior,
    delayMs: behavior === AI_AT_LIMIT_BEHAVIOR.THROTTLE ? THROTTLE_DELAY_MS : undefined,
  };
}
