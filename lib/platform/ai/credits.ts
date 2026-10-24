import { randomUUID } from "crypto";
import connectDB from "@/lib/db";
import AiCostRate from "@/models/platform/AiCostRate";
import AiCreditLedger from "@/models/platform/AiCreditLedger";
import AiCreditBalance from "@/models/platform/AiCreditBalance";
import { resolveEntitlements } from "@/lib/platform/entitlements/resolve";
import { getAiCreditWindows } from "./creditWindows";

export function aiCreditUsdValue(): number {
  const configured = Number(process.env.AI_CREDIT_USD_VALUE);
  return Number.isFinite(configured) && configured > 0 ? configured : 0.01;
}
export function aiBackendCreditCost(): number {
  const configured = Number(process.env.AI_BACKEND_CREDITS_PER_REQUEST);
  return Number.isFinite(configured) && configured >= 0 ? configured : 0;
}
export function aiToolCallCreditCost(): number {
  const configured = Number(process.env.AI_TOOL_CALL_CREDITS);
  return Number.isFinite(configured) && configured >= 0 ? configured : 0;
}
const creditRound = (value: number) => Math.ceil(Math.max(0, value) * 10_000) / 10_000;

export async function estimateAiCredits(
  modelNameOrOpts: string | { modelName: string; inputTokens?: number; outputTokens?: number; estimatedInputTokens?: number; estimatedOutputTokens?: number; estimatedToolCalls?: number; toolCalls?: number },
  maybeInputTokens?: number,
  maybeOutputTokens?: number
) {
  const modelName = typeof modelNameOrOpts === "string" ? modelNameOrOpts : modelNameOrOpts.modelName;
  const inputTokens = typeof modelNameOrOpts === "string" ? (maybeInputTokens ?? 0) : (modelNameOrOpts.inputTokens ?? modelNameOrOpts.estimatedInputTokens ?? 0);
  const outputTokens = typeof modelNameOrOpts === "string" ? (maybeOutputTokens ?? 0) : (modelNameOrOpts.outputTokens ?? modelNameOrOpts.estimatedOutputTokens ?? 0);
  const toolCalls = typeof modelNameOrOpts === "object" ? Math.max(0, Math.floor(modelNameOrOpts.toolCalls ?? modelNameOrOpts.estimatedToolCalls ?? 0)) : 0;

  await connectDB();
  let rate = await AiCostRate.findOne({ modelName }).lean();
  if (!rate) {
    const fallbackInput = Number(process.env.AI_DEFAULT_INPUT_COST_PER_MILLION) || (modelName.includes("mini") ? 0.15 : 2.5);
    const fallbackOutput = Number(process.env.AI_DEFAULT_OUTPUT_COST_PER_MILLION) || (modelName.includes("mini") ? 0.6 : 10.0);
    if (fallbackInput > 0 && fallbackOutput > 0 && (modelName.includes("gpt") || modelName === process.env.AZURE_OPENAI_CHAT_DEPLOYMENT)) {
      rate = { modelName, inputCostPerMillionTokens: fallbackInput, outputCostPerMillionTokens: fallbackOutput } as any;
    }
  }
  if (!rate) throw new Error(`AI cost rate is not configured for model ${modelName}`);
  const costUsd = (inputTokens / 1_000_000) * rate.inputCostPerMillionTokens + (outputTokens / 1_000_000) * rate.outputCostPerMillionTokens;
  const backendCredits = typeof modelNameOrOpts === "object" ? creditRound(aiBackendCreditCost() + toolCalls * aiToolCallCreditCost()) : 0;
  return { costUsd, credits: creditRound(costUsd / aiCreditUsdValue() + backendCredits) };
}

type CreditBucket = { period: string; limit: number };
type ReserveResult =
  | { allowed: true; requestId: string; estimatedCredits: number }
  | { allowed: false; reason: "exhausted" | "duplicate" | "rate_missing"; window?: "monthly" | "session" | "weekly" };

async function ensureBalance(bucket: CreditBucket, tenantId: string) {
  try {
    await AiCreditBalance.updateOne(
      { tenantId, period: bucket.period },
      { $setOnInsert: { limit: bucket.limit, used: 0, reserved: 0 } },
      { upsert: true },
    );
  } catch (error: any) {
    // Concurrent first requests can both attempt the same unique tenant/period
    // upsert. The winner creates it; the other can safely continue reading it.
    if (error?.code !== 11000) throw error;
  }
}

async function reserveBucket(tenantId: string, bucket: CreditBucket, credits: number): Promise<boolean> {
  await ensureBalance(bucket, tenantId);
  const balance = await AiCreditBalance.findOneAndUpdate(
    { tenantId, period: bucket.period, $expr: { $lte: [{ $add: ["$used", "$reserved", credits] }, bucket.limit] } },
    { $set: { limit: bucket.limit }, $inc: { reserved: credits } },
    { new: true },
  );
  return Boolean(balance);
}

async function adjustBuckets(tenantId: string, periods: string[], update: Record<string, number>) {
  for (const period of periods) {
    await AiCreditBalance.updateOne({ tenantId, period }, { $inc: update });
  }
}

export async function reserveAiCredits(input: {
  tenantId: string; userId?: string; period: string; modelName: string; feature: string; requestId?: string;
  estimatedInputTokens: number; estimatedOutputTokens: number; estimatedToolCalls?: number; admittedAt?: Date;
}): Promise<ReserveResult> {
  await connectDB();
  // Release abandoned reservations from any window. Completion/refund remains
  // conditional on status=reserved, so a concurrent settlement cannot double-release.
  const expired = await AiCreditLedger.find({ tenantId: input.tenantId, status: "reserved", createdAt: { $lt: new Date(Date.now() - 30 * 60_000) } }, { _id: 1, period: 1, bucketPeriods: 1, estimatedCredits: 1 }).lean();
  for (const item of expired) {
    const released = await AiCreditLedger.updateOne({ _id: item._id, status: "reserved" }, { $set: { status: "refunded", completedAt: new Date() } });
    if (released.modifiedCount) await adjustBuckets(input.tenantId, item.bucketPeriods?.length ? item.bucketPeriods : [item.period], { reserved: -item.estimatedCredits });
  }

  const requestId = input.requestId || randomUUID();
  const [estimate, entitlements] = await Promise.all([
    estimateAiCredits(input.modelName, input.estimatedInputTokens, input.estimatedOutputTokens).catch(() => null),
    resolveEntitlements(input.tenantId),
  ]);
  if (!estimate) return { allowed: false, reason: "rate_missing" };
  if (entitlements.source === "permissive_default") {
    // Entitlement configuration is unavailable; never silently allow unlimited usage.
    return { allowed: false, reason: "rate_missing" };
  }
  const toolCalls = Math.max(0, Math.floor(input.estimatedToolCalls ?? 0));
  const estimatedBackendCredits = creditRound(aiBackendCreditCost() + toolCalls * aiToolCallCreditCost());
  const estimatedCredits = creditRound(estimate.credits + estimatedBackendCredits);
  const monthBucket = { period: input.period, limit: Math.max(0, entitlements.limits.aiCreditsPerMonth) };
  const planWindows = getAiCreditWindows(input.admittedAt ?? new Date(), entitlements.limits);
  const buckets: CreditBucket[] = [monthBucket, ...planWindows.map(({ period, limit }) => ({ period, limit }))]
    .sort((a, b) => a.period.localeCompare(b.period));

  try {
    await AiCreditLedger.create({
      tenantId: input.tenantId, userId: input.userId, planKey: entitlements.planKey, period: input.period, bucketPeriods: buckets.map((bucket) => bucket.period), requestId,
      modelName: input.modelName, feature: input.feature, estimatedCredits, credits: 0,
      estimatedCostUsd: estimate.costUsd, costUsd: 0, inputTokens: input.estimatedInputTokens,
      outputTokens: input.estimatedOutputTokens, estimatedToolCalls: toolCalls, toolCalls: 0,
      estimatedBackendCredits, backendCredits: 0, isEstimated: false, status: "reserved",
    });
  } catch (error: any) {
    if (error?.code === 11000) return { allowed: false, reason: "duplicate" };
    throw error;
  }

  const reserved: string[] = [];
  try {
    for (const bucket of buckets) {
      if (!await reserveBucket(input.tenantId, bucket, estimatedCredits)) {
        if (reserved.length) await adjustBuckets(input.tenantId, reserved, { reserved: -estimatedCredits });
        await AiCreditLedger.deleteOne({ tenantId: input.tenantId, requestId, status: "reserved" });
        const window = bucket.period === input.period ? "monthly" : bucket.period.startsWith("credit-session:") ? "session" : "weekly";
        return { allowed: false, reason: "exhausted", window };
      }
      reserved.push(bucket.period);
    }
  } catch (error) {
    // A database error while applying a later bucket must not strand earlier
    // reservations. If cleanup itself is unavailable, lease cleanup handles it.
    if (reserved.length) {
      try { await adjustBuckets(input.tenantId, reserved, { reserved: -estimatedCredits }); } catch { /* best effort */ }
    }
    try { await AiCreditLedger.deleteOne({ tenantId: input.tenantId, requestId, status: "reserved" }); } catch { /* lease cleanup handles it */ }
    throw error;
  }
  return { allowed: true, requestId, estimatedCredits };
}

export async function settleAiCredits(input: {
  tenantId: string; period: string; requestId: string; modelName: string; feature: string;
  inputTokens: number; outputTokens: number; success: boolean; toolCalls?: number;
  isEstimated?: boolean;
}): Promise<void> {
  await connectDB();
  const ledger = await AiCreditLedger.findOne({ tenantId: input.tenantId, requestId: input.requestId, status: "reserved" }).lean();
  if (!ledger) return;
  const bucketPeriods = ledger.bucketPeriods?.length ? ledger.bucketPeriods : [ledger.period];
  const completedAt = new Date();
  if (!input.success) {
    const changed = await AiCreditLedger.updateOne(
      { _id: ledger._id, status: "reserved" },
      { $set: { status: "refunded", credits: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, toolCalls: 0, backendCredits: 0, completedAt } }
    );
    if (changed.modifiedCount) await adjustBuckets(input.tenantId, bucketPeriods, { reserved: -ledger.estimatedCredits });
    return;
  }
  const isEstimatedFallback = input.isEstimated ?? ((!input.inputTokens && !input.outputTokens) && input.success);
  const effectiveInputTokens = (isEstimatedFallback && !input.inputTokens) ? (ledger.inputTokens || 1) : (input.inputTokens || 0);
  const effectiveOutputTokens = (isEstimatedFallback && !input.outputTokens) ? (ledger.outputTokens || 1) : (input.outputTokens || 0);
  const actual = await estimateAiCredits(input.modelName, effectiveInputTokens, effectiveOutputTokens);
  const toolCalls = Math.max(0, Math.floor(input.toolCalls ?? 0));
  const backendCredits = creditRound(aiBackendCreditCost() + toolCalls * aiToolCallCreditCost());
  const charge = creditRound(actual.credits + backendCredits);
  const changed = await AiCreditLedger.updateOne(
    { _id: ledger._id, status: "reserved" },
    { $set: { status: "charged", credits: charge, costUsd: actual.costUsd, inputTokens: effectiveInputTokens, outputTokens: effectiveOutputTokens, modelName: input.modelName, feature: input.feature, toolCalls, backendCredits, isEstimated: isEstimatedFallback, completedAt } },
  );
  if (changed.modifiedCount) await adjustBuckets(input.tenantId, bucketPeriods, { reserved: -ledger.estimatedCredits, used: charge });
}

export async function getAiCreditBalance(tenantId: string, period: string, now = new Date()) {
  await connectDB();
  const entitlements = await resolveEntitlements(tenantId);
  if (entitlements.source === "permissive_default") throw new Error("AI credit plan configuration is unavailable");
  const monthlyLimit = Math.max(0, entitlements.limits.aiCreditsPerMonth);
  const windows = getAiCreditWindows(now, entitlements.limits);
  const [monthly, ...windowBalances] = await Promise.all([
    AiCreditBalance.findOne({ tenantId, period }).lean(),
    ...windows.map(({ period: windowPeriod }) => AiCreditBalance.findOne({ tenantId, period: windowPeriod }).lean()),
  ]);
  const summarize = (balance: any, limit: number) => {
    const used = balance?.used ?? 0;
    const reserved = balance?.reserved ?? 0;
    return { used, reserved, limit, remaining: Math.max(0, limit - used - reserved) };
  };
  const windowEntries = windows.map((window, index) => [window.kind, {
    ...summarize(windowBalances[index], window.limit),
    startsAt: window.start.toISOString(), resetsAt: window.end.toISOString(), unit: "credits" as const,
  }]);
  const earliestReset = windows.reduce((earliest, w) => {
    return w.end.getTime() < earliest.getTime() ? w.end : earliest;
  }, new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)));
  return {
    planKey: entitlements.planKey,
    ...summarize(monthly, monthlyLimit),
    resetsAt: earliestReset.toISOString(),
    windows: Object.fromEntries(windowEntries) as Record<string, { used: number; reserved: number; limit: number; remaining: number; startsAt: string; resetsAt: string; unit: "credits" }>,
  };
}
