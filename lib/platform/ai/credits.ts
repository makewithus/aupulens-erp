import { randomUUID } from "crypto";
import connectDB from "@/lib/db";
import AiCostRate from "@/models/platform/AiCostRate";
import AiCreditLedger from "@/models/platform/AiCreditLedger";
import AiCreditBalance from "@/models/platform/AiCreditBalance";
import { resolveEntitlements } from "@/lib/platform/entitlements/resolve";

export function aiCreditUsdValue(): number {
  const configured = Number(process.env.AI_CREDIT_USD_VALUE);
  return Number.isFinite(configured) && configured > 0 ? configured : 0.01;
}
export function aiBackendCreditCost(): number {
  const configured = Number(process.env.AI_BACKEND_CREDITS_PER_REQUEST);
  return Number.isFinite(configured) && configured >= 0 ? configured : 0;
}
const creditRound = (value: number) => Math.ceil(Math.max(0, value) * 10_000) / 10_000;

export async function estimateAiCredits(modelName: string, inputTokens: number, outputTokens: number) {
  await connectDB();
  const rate = await AiCostRate.findOne({ modelName }).lean();
  if (!rate) throw new Error(`AI cost rate is not configured for model ${modelName}`);
  const costUsd = (inputTokens / 1_000_000) * rate.inputCostPerMillionTokens + (outputTokens / 1_000_000) * rate.outputCostPerMillionTokens;
  return { costUsd, credits: creditRound(costUsd / aiCreditUsdValue()) };
}

export async function reserveAiCredits(input: {
  tenantId: string; period: string; modelName: string; feature: string; requestId?: string;
  estimatedInputTokens: number; estimatedOutputTokens: number;
}): Promise<{ allowed: true; requestId: string; estimatedCredits: number } | { allowed: false; reason: "exhausted" | "duplicate" | "rate_missing" }> {
  await connectDB();
  // Release orphaned reservations left by a process restart. A live model
  // request cannot normally outlast this lease; settlement is conditional so
  // this cleanup cannot refund a request that completed concurrently.
  const expired = await AiCreditLedger.find({ tenantId: input.tenantId, period: input.period, status: "reserved", createdAt: { $lt: new Date(Date.now() - 30 * 60_000) } }, { _id: 1, estimatedCredits: 1 }).lean();
  for (const item of expired) {
    const released = await AiCreditLedger.updateOne({ _id: item._id, status: "reserved" }, { $set: { status: "refunded" } });
    if (released.modifiedCount) await AiCreditBalance.updateOne({ tenantId: input.tenantId, period: input.period }, { $inc: { reserved: -item.estimatedCredits } });
  }
  const requestId = input.requestId || randomUUID();
  const [estimate, entitlements] = await Promise.all([
    estimateAiCredits(input.modelName, input.estimatedInputTokens, input.estimatedOutputTokens).catch(() => null),
    resolveEntitlements(input.tenantId),
  ]);
  if (!estimate) return { allowed: false, reason: "rate_missing" };
  const estimatedCredits = creditRound(estimate.credits + aiBackendCreditCost());
  const limit = Math.max(0, entitlements.limits.aiCreditsPerMonth);

  try {
    await AiCreditLedger.create({
      tenantId: input.tenantId, period: input.period, requestId, modelName: input.modelName, feature: input.feature,
      estimatedCredits, credits: 0, estimatedCostUsd: estimate.costUsd, costUsd: 0,
      inputTokens: input.estimatedInputTokens, outputTokens: input.estimatedOutputTokens, status: "reserved",
    });
  } catch (error: any) {
    if (error?.code === 11000) return { allowed: false, reason: "duplicate" };
    throw error;
  }

  await AiCreditBalance.updateOne(
    { tenantId: input.tenantId, period: input.period },
    { $setOnInsert: { limit, used: 0, reserved: 0 } },
    { upsert: true },
  );
  // Re-read a potentially changed plan limit each request. The atomic predicate
  // reserves headroom before calling the provider, including concurrent calls.
  const balance = await AiCreditBalance.findOneAndUpdate(
    { tenantId: input.tenantId, period: input.period, $expr: { $lte: [{ $add: ["$used", "$reserved", estimatedCredits] }, limit] } },
    { $set: { limit }, $inc: { reserved: estimatedCredits } },
    { new: true },
  );
  if (!balance) {
    await AiCreditLedger.deleteOne({ tenantId: input.tenantId, requestId, status: "reserved" });
    return { allowed: false, reason: "exhausted" };
  }
  return { allowed: true, requestId, estimatedCredits };
}

export async function settleAiCredits(input: {
  tenantId: string; period: string; requestId: string; modelName: string; feature: string;
  inputTokens: number; outputTokens: number; success: boolean;
}): Promise<void> {
  await connectDB();
  const ledger = await AiCreditLedger.findOne({ tenantId: input.tenantId, requestId: input.requestId, status: "reserved" }).lean();
  if (!ledger) return;
  if (!input.success) {
    const changed = await AiCreditLedger.updateOne({ _id: ledger._id, status: "reserved" }, { $set: { status: "refunded", credits: 0, costUsd: 0, inputTokens: 0, outputTokens: 0 } });
    if (changed.modifiedCount) await AiCreditBalance.updateOne({ tenantId: input.tenantId, period: input.period }, { $inc: { reserved: -ledger.estimatedCredits } });
    return;
  }
  const actual = await estimateAiCredits(input.modelName, input.inputTokens, input.outputTokens);
  const charge = creditRound(actual.credits + aiBackendCreditCost());
  const changed = await AiCreditLedger.updateOne(
    { _id: ledger._id, status: "reserved" },
    { $set: { status: "charged", credits: charge, costUsd: actual.costUsd, inputTokens: input.inputTokens, outputTokens: input.outputTokens, modelName: input.modelName, feature: input.feature } },
  );
  if (changed.modifiedCount) await AiCreditBalance.updateOne(
    { tenantId: input.tenantId, period: input.period },
    { $inc: { reserved: -ledger.estimatedCredits, used: charge } },
  );
}

export async function getAiCreditBalance(tenantId: string, period: string) {
  await connectDB();
  const entitlements = await resolveEntitlements(tenantId);
  const limit = Math.max(0, entitlements.limits.aiCreditsPerMonth);
  const existing = await AiCreditBalance.findOne({ tenantId, period }).lean();
  return { used: existing?.used ?? 0, reserved: existing?.reserved ?? 0, limit, remaining: Math.max(0, limit - (existing?.used ?? 0) - (existing?.reserved ?? 0)) };
}
