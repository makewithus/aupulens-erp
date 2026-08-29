/**
 * Automated business-health summary generator (Phase 4).
 *
 * The audit found no scheduled digest / business-health job existed anywhere
 * — only ad-hoc forecasts embedded in the module chat routes. This builds a
 * real one: a periodic, per-tenant, AI-written summary over the tenant's own
 * live finance + sales data, persisted so it can be surfaced on the admin
 * dashboard. Run from the cron route app/api/cron/business-health/route.ts.
 *
 * Best-effort per tenant — a gated/failed AI call for one tenant is recorded
 * as skipped and never throws the whole cron run.
 */
import { resolveTenantAiSettings, callClaudeForTenant } from "@/lib/ai/tenantAi";
import { AI_MAX_TOKENS } from "@/lib/ai/featureLimits";
import { fetchAdminFinanceData, fetchAdminSalesData } from "@/lib/ai/adminDataFetcher";
import { calculateForecast } from "@/lib/crm/forecast";
import dbConnect from "@/lib/db";
import BusinessHealthSummary from "@/models/admin/BusinessHealthSummary";
import CrmOpportunity from "@/models/crm/Opportunity";

function todayPeriod(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface HealthSummaryOutcome {
  tenantId: string;
  status: "generated" | "skipped_gated" | "skipped_error" | "insufficient_data";
}

/**
 * A tenant with no invoices/sales/pipeline has nothing for the model to
 * summarize. Detecting that up front lets us write a deterministic
 * "not enough data yet" summary instead of spending an AI call on empty input
 * (which also risks the model inventing insights from nothing).
 *
 * NOTE: the fetchers return a summary OBJECT even for an empty tenant (all
 * zeros), so mere presence isn't enough — we check the actual activity numbers.
 */
function hasMeaningfulData(metrics: { finance: any; sales: any; totalPipeline: number }, openOppsCount: number): boolean {
  const f = metrics.finance;
  const s = metrics.sales;
  const financeActivity = !!f && ((f.totalRevenue ?? 0) > 0 || (f.totalTransactions ?? 0) > 0);
  const salesActivity = !!s && ((s.totalOrders ?? 0) > 0 || (s.totalRevenue ?? 0) > 0);
  return financeActivity || salesActivity || metrics.totalPipeline > 0 || openOppsCount > 0;
}

export async function generateBusinessHealthSummary(tenantId: string): Promise<HealthSummaryOutcome> {
  try {
    await dbConnect();

    const [finance, sales, openOpps] = await Promise.all([
      fetchAdminFinanceData(tenantId).catch(() => null),
      fetchAdminSalesData(tenantId).catch(() => null),
      CrmOpportunity.find({ tenantId, stage: { $nin: ["Closed Won", "Closed Lost"] } }).lean().catch(() => []),
    ]);

    const forecast = calculateForecast(openOpps as any[]);
    const metrics = {
      finance: (finance as any)?.summary ?? null,
      sales: (sales as any)?.summary ?? null,
      weightedPipeline: forecast.weightedPipeline,
      totalPipeline: forecast.totalPipeline,
    };

    // Low/no-data tenant: don't spend an AI call on empty input. Persist a
    // deterministic placeholder summary so the dashboard shows something honest.
    if (!hasMeaningfulData(metrics, (openOpps as any[]).length)) {
      const period = todayPeriod();
      await BusinessHealthSummary.findOneAndUpdate(
        { tenantId, period },
        {
          $set: {
            summary: "Not enough activity yet to generate a business-health summary. Add invoices, sales orders, or opportunities and this will populate automatically.",
            highlights: [],
            concerns: [],
            revenueForecast: undefined,
            metrics,
            generatedAt: new Date(),
          },
          $setOnInsert: { tenantId, period },
        },
        { upsert: true }
      );
      return { tenantId, status: "insufficient_data" };
    }

    const { tier, aiSettings } = await resolveTenantAiSettings(tenantId);
    const result = await callClaudeForTenant(
      tenantId,
      tier,
      aiSettings,
      `Write a concise daily business-health summary for a company's leadership based on this ERP data. ` +
        `Include a short revenue outlook based on the weighted vs total open pipeline. Respond with ONLY JSON:\n` +
        `{"summary":"<2-3 sentences>","highlights":["<positive point>"],"concerns":["<risk/issue>"],"revenueForecast":"<1 sentence outlook>"}\n\n` +
        `Data:\n${JSON.stringify(metrics)}`,
      {
        systemPrompt: "You are a precise business analyst. Use only the data provided; never invent figures. Reply with raw JSON only.",
        maxTokens: AI_MAX_TOKENS.summary,
      }
    );

    if (!("text" in result)) {
      return { tenantId, status: "skipped_gated" };
    }

    const jsonMatch = result.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { tenantId, status: "skipped_error" };
    const parsed = JSON.parse(jsonMatch[0]);

    const period = todayPeriod();
    await BusinessHealthSummary.findOneAndUpdate(
      { tenantId, period },
      {
        $set: {
          summary: typeof parsed.summary === "string" ? parsed.summary : "",
          highlights: Array.isArray(parsed.highlights) ? parsed.highlights.filter((x: unknown) => typeof x === "string") : [],
          concerns: Array.isArray(parsed.concerns) ? parsed.concerns.filter((x: unknown) => typeof x === "string") : [],
          revenueForecast: typeof parsed.revenueForecast === "string" ? parsed.revenueForecast : undefined,
          metrics,
          generatedAt: new Date(),
        },
        $setOnInsert: { tenantId, period },
      },
      { upsert: true }
    );

    return { tenantId, status: "generated" };
  } catch {
    return { tenantId, status: "skipped_error" };
  }
}
