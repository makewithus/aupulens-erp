"use client";
import { useAiUsageSummary } from "@/lib/hooks/useAiUsageSummary";
import { emptyUsage, type UsageMetric } from "@/lib/ai/usagePolicy";
import { formatResetCountdown, usageLabel } from "@/lib/ai/usageDisplay";

export function UsageItem({ label, metric, now }: { label: string; metric?: UsageMetric; now: number; progress?: boolean }) {
  const countdown = metric && formatResetCountdown(metric.resetsAt, now);
  const detail = metric?.used !== null && metric?.used !== undefined
    ? `${metric.used} successful workspace requests${metric.limit === null ? ", unlimited" : ` of ${metric.limit}`}${metric.resetsAt ? `; resets ${metric.resetsAt} (UTC)` : ""}`
    : `${label} usage ${usageLabel(metric).toLowerCase()}`;
  const unavailable = !metric || metric.status === "unconfigured" || metric.status === "unavailable";
  return (
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap" title={unavailable ? `${label} quota is not configured for this workspace.` : detail}>
      <span>{label}: {unavailable ? "—" : usageLabel(metric)}</span>
      {metric?.status === "exhausted" && metric.limit !== 0 && <span className="text-destructive">(limit reached)</span>}
      {countdown && !unavailable && <span className="opacity-75">· resets in {countdown}</span>}
      <span className="sr-only">{detail}</span>
    </span>
  );
}

function creditPercent(used: number, limit: number) {
  if (limit <= 0) return "0% used";
  const percent = (used / limit) * 100;
  if (percent < 1) return "<1% used";
  // Floor so a displayed whole-number percentage never overstates actual use.
  return `${Math.floor(percent)}% used`;
}

export function AiUsageIndicator() {
  const { data, unavailable, now } = useAiUsageSummary();
  const unknown = unavailable ? emptyUsage("unavailable") : undefined;
  return (
    <div aria-label="Workspace AI usage" aria-busy={!data && !unavailable}
      className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 py-1 text-[10px] leading-4 text-muted-foreground sm:text-[11px]">
      <UsageItem label="Session" metric={data?.session ?? unknown} now={now} />
      <span aria-hidden="true" className="opacity-40">|</span>
      <UsageItem label="Weekly" metric={data?.weekly ?? unknown} now={now} />
      <span aria-hidden="true" className="opacity-40">|</span>
      {data?.credits && (() => {
        const low = data.credits.limit > 0 && data.credits.remaining / data.credits.limit <= 0.2;
        return <span role={data.credits.remaining <= 0 ? "alert" : low ? "status" : undefined}
          title={`Usage-based credits reflect model token cost and configured backend processing. Monthly allowance resets ${data.credits.resetsAt} UTC.`}
          className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap ${low ? "text-amber-500" : ""}`}>
          Credits: {creditPercent(data.credits.used, data.credits.limit)}{data.credits.remaining <= 0 ? " · limit reached" : low ? " · low" : ""}
        </span>;
      })()}
    </div>
  );
}
