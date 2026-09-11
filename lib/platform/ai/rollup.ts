import connectDB from "@/lib/db";
import AiUsageRecord from "@/models/platform/AiUsageRecord";
import AiUsageDaily from "@/models/platform/AiUsageDaily";
import AiUsageMonthly from "@/models/platform/AiUsageMonthly";
import AiWorkflowRun from "@/models/ai/AiWorkflowRun";
import { AI_USAGE_FEATURE_BUCKET, AI_USAGE_REQUEST_STATUS } from "@/lib/constants/statuses";

function dayPeriod(date: Date): string {
  return date.toISOString().slice(0, 10); // "YYYY-MM-DD" UTC
}
function monthPeriod(date: Date): string {
  return dayPeriod(date).slice(0, 7).replace("-", ""); // "YYYYMM" — matches lib/ai/usage.ts::getAiPeriod()
}

/**
 * Aggregates AiUsageRecord (per-request, from lib/ai/tenantAi.ts) into
 * AiUsageDaily/AiUsageMonthly for the given UTC day — idempotent (upserts
 * the day's totals from scratch each run, safe to re-run for the same day
 * without doubling counts). Dashboards read the rollups, never
 * AiUsageRecord directly at request time (the brief's own load-time
 * warning). Also folds in AiWorkflowRun as request-count-only contributions
 * to the "ai_automation" bucket — see docs/admin/AI_FEATURE_MAP.md for why
 * that bucket's token/cost figures stay honestly at 0.
 */
export async function rollupAiUsageForDay(date: Date = new Date()): Promise<{ dailyRows: number; monthlyRows: number }> {
  await connectDB();
  const dStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dEnd = new Date(dStart.getTime() + 24 * 60 * 60 * 1000);
  const period = dayPeriod(dStart);
  const monthPer = monthPeriod(dStart);

  const grouped = await AiUsageRecord.aggregate([
    { $match: { createdAt: { $gte: dStart, $lt: dEnd } } },
    {
      $group: {
        _id: { tenantId: "$tenantId", feature: "$feature" },
        requestCount: { $sum: 1 },
        inputTokens: { $sum: "$inputTokens" },
        outputTokens: { $sum: "$outputTokens" },
        estimatedCostUsd: { $sum: "$estimatedCostUsd" },
        errorCount: {
          $sum: { $cond: [{ $eq: ["$status", AI_USAGE_REQUEST_STATUS.ERROR] }, 1, 0] },
        },
      },
    },
  ]);

  // Fold in AiWorkflowRun as request-count-only contributions to ai_automation.
  const workflowRuns = await AiWorkflowRun.aggregate([
    { $match: { createdAt: { $gte: dStart, $lt: dEnd } } },
    { $group: { _id: "$tenantId", requestCount: { $sum: 1 } } },
  ]);

  const rows = [
    ...grouped.map((g) => ({
      tenantId: g._id.tenantId as string,
      feature: g._id.feature as string,
      requestCount: g.requestCount as number,
      inputTokens: g.inputTokens as number,
      outputTokens: g.outputTokens as number,
      estimatedCostUsd: g.estimatedCostUsd as number,
      errorCount: g.errorCount as number,
    })),
    ...workflowRuns.map((w) => ({
      tenantId: w._id as string,
      feature: AI_USAGE_FEATURE_BUCKET.AI_AUTOMATION as string,
      requestCount: w.requestCount as number,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCostUsd: 0,
      errorCount: 0,
    })),
  ];

  for (const row of rows) {
    await AiUsageDaily.findOneAndUpdate(
      { tenantId: row.tenantId, period, feature: row.feature },
      { $set: row },
      { upsert: true },
    );
  }

  // Recompute the month's totals from ALL of that month's daily rows (not
  // just today's) so a re-run, or a run for a past day, always leaves the
  // monthly rollup internally consistent.
  const monthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const monthDailyRows = await AiUsageDaily.aggregate([
    { $match: { period: { $gte: dayPeriod(monthStart), $lt: dayPeriod(dEnd) } } },
    {
      $group: {
        _id: { tenantId: "$tenantId", feature: "$feature" },
        requestCount: { $sum: "$requestCount" },
        inputTokens: { $sum: "$inputTokens" },
        outputTokens: { $sum: "$outputTokens" },
        estimatedCostUsd: { $sum: "$estimatedCostUsd" },
        errorCount: { $sum: "$errorCount" },
      },
    },
  ]);

  for (const row of monthDailyRows) {
    await AiUsageMonthly.findOneAndUpdate(
      { tenantId: row._id.tenantId, period: monthPer, feature: row._id.feature },
      {
        $set: {
          requestCount: row.requestCount,
          inputTokens: row.inputTokens,
          outputTokens: row.outputTokens,
          estimatedCostUsd: row.estimatedCostUsd,
          errorCount: row.errorCount,
        },
      },
      { upsert: true },
    );
  }

  return { dailyRows: rows.length, monthlyRows: monthDailyRows.length };
}
