import connectDB from "@/lib/db";
import AiLimit, { IAiLimit } from "@/models/platform/AiLimit";
import AiOverageConfig, { IAiOverageConfig } from "@/models/platform/AiOverageConfig";
import {
  ADMIN_CAPABILITY,
  PLATFORM_EVENT_CATEGORY,
  PLATFORM_EVENT_TYPE,
  PLATFORM_SEVERITY,
  AiAtLimitBehavior,
} from "@/lib/constants/statuses";
import { AdminActor } from "@/lib/platform/auth/types";
import { requireCapability } from "@/lib/platform/auth/adminRbac";
import { emitPlatformAuditEvent } from "@/lib/platform/audit/emit";

export class ManageAiLimitError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ManageAiLimitError";
  }
}

export interface AiLimitInput {
  monthlyCreditsUsd?: number | null;
  dailyCreditsUsd?: number | null;
  maxRequestsPerMonth?: number | null;
  maxTokensPerMonth?: number | null;
  maxCostUsdPerMonth?: number | null;
  atLimitBehavior?: AiAtLimitBehavior;
}

/**
 * Source doc §15. Gated on MANAGE_AI_LIMITS, which per the corrected §30
 * matrix (docs/admin/BRIEF-PHASE-9-COVERAGE.md Part 0.1) is AI_ADMIN and
 * GLOBAL_SUPER_ADMIN only — NOT GLOBAL_ADMIN, despite GLOBAL_ADMIN holding
 * nearly every other operational capability. An absent AiLimit row is
 * exactly today's pre-Phase-4 behaviour (models/platform/AiLimit.ts's own
 * contract) — this function never creates a row with all-null limits as a
 * side effect of, say, only changing atLimitBehavior; a field explicitly
 * passed as `null` clears that specific override back to "use the tier cap."
 */
export async function setAiLimit(
  actor: AdminActor,
  tenantId: string,
  input: AiLimitInput,
  reason: string,
): Promise<void> {
  await requireCapability(actor, ADMIN_CAPABILITY.MANAGE_AI_LIMITS);
  if (!reason || !reason.trim()) {
    throw new ManageAiLimitError("A reason is required to change an AI limit.", 400);
  }

  await connectDB();
  const before = await AiLimit.findOne({ tenantId }).lean();

  const update: Partial<IAiLimit> = {};
  const unset: Record<string, string> = {};
  for (const field of [
    "monthlyCreditsUsd",
    "dailyCreditsUsd",
    "maxRequestsPerMonth",
    "maxTokensPerMonth",
    "maxCostUsdPerMonth",
  ] as const) {
    const value = input[field];
    if (value === null) unset[field] = "";
    else if (value !== undefined) update[field] = value;
  }
  if (input.atLimitBehavior !== undefined) update.atLimitBehavior = input.atLimitBehavior;

  const after = await AiLimit.findOneAndUpdate(
    { tenantId },
    { $set: update, ...(Object.keys(unset).length ? { $unset: unset } : {}) },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  await emitPlatformAuditEvent({
    actor,
    tenantId,
    eventCategory: PLATFORM_EVENT_CATEGORY.AI,
    eventType: PLATFORM_EVENT_TYPE.AI_LIMIT_CHANGED,
    severity: PLATFORM_SEVERITY.INFO,
    entityType: "Organization",
    entityId: tenantId,
    oldValue: before,
    newValue: after,
    ipAddress: actor.ip,
    userAgent: actor.userAgent,
    metadata: { reason },
  });
}

export interface AiOverageInput {
  enabled?: boolean;
  ratePerCreditUsd?: number;
  softLimitUsd?: number;
  hardLimitUsd?: number;
  alertThresholds?: number[];
}

/** Source doc §16, same capability and audit shape as setAiLimit. */
export async function setAiOverageConfig(
  actor: AdminActor,
  tenantId: string,
  input: AiOverageInput,
  reason: string,
): Promise<void> {
  await requireCapability(actor, ADMIN_CAPABILITY.MANAGE_AI_LIMITS);
  if (!reason || !reason.trim()) {
    throw new ManageAiLimitError("A reason is required to change AI overage configuration.", 400);
  }

  await connectDB();
  const before = await AiOverageConfig.findOne({ tenantId }).lean();

  const update: Partial<IAiOverageConfig> = {};
  if (input.enabled !== undefined) update.enabled = input.enabled;
  if (input.ratePerCreditUsd !== undefined) update.ratePerCreditUsd = input.ratePerCreditUsd;
  if (input.softLimitUsd !== undefined) update.softLimitUsd = input.softLimitUsd;
  if (input.hardLimitUsd !== undefined) update.hardLimitUsd = input.hardLimitUsd;
  if (input.alertThresholds !== undefined) update.alertThresholds = input.alertThresholds;

  const after = await AiOverageConfig.findOneAndUpdate(
    { tenantId },
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean();

  await emitPlatformAuditEvent({
    actor,
    tenantId,
    eventCategory: PLATFORM_EVENT_CATEGORY.AI,
    eventType: PLATFORM_EVENT_TYPE.AI_LIMIT_CHANGED,
    severity: PLATFORM_SEVERITY.INFO,
    entityType: "Organization",
    entityId: tenantId,
    oldValue: before,
    newValue: after,
    ipAddress: actor.ip,
    userAgent: actor.userAgent,
    metadata: { reason, config: "overage" },
  });
}
