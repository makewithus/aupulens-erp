import { getAiUsageCount, incrementAiUsage } from "@/lib/ai/usage";
import { emptyUsage, quotaWindow, usageMetric, type AiWindowPolicy, type UsageMetric } from "@/lib/ai/usagePolicy";

export async function getWindowUsage(tenantId: string, policy: AiWindowPolicy | undefined, now: Date): Promise<{ session: UsageMetric; weekly: UsageMetric }> {
  const read = async (kind: "session" | "weekly") => {
    const window = quotaWindow(policy, kind, now);
    if (typeof window === "string") return emptyUsage(window);
    return usageMetric(await getAiUsageCount(tenantId, window.period), window.limit, window.start, window.end);
  };
  const [session, weekly] = await Promise.all([read("session"), read("weekly")]);
  return { session, weekly };
}

/** Called once per successfully completed provider call, including streams.
 * Windows use request admission time, matching the existing monthly accounting policy.
 * Atomic $inc on the existing compound-unique tenant/period counter preserves concurrent calls.
 */
export async function incrementWindowUsage(tenantId: string, policy: AiWindowPolicy | undefined, admittedAt: Date, requestId?: string): Promise<void> {
  await Promise.all((["session", "weekly"] as const).map(async kind => {
    const window = quotaWindow(policy, kind, admittedAt);
    if (typeof window !== "string") {
      try {
        if (requestId) await incrementAiUsage(tenantId, window.period, requestId);
        else await incrementAiUsage(tenantId, window.period);
      } catch (error) {
        console.error("[ai-usage] window counter write failed", { tenantId, kind, period: window.period, error: error instanceof Error ? error.message : String(error) });
        throw error;
      }
    }
  }));
}
