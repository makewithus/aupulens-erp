"use client";
import { useAiUsageSummary } from "@/lib/hooks/useAiUsageSummary";
import { emptyUsage, type UsageMetric } from "@/lib/ai/usagePolicy";
import { formatResetCountdown, usageLabel } from "@/lib/ai/usageDisplay";

export function UsageItem({ label, metric, now, progress = false }: { label: string; metric?: UsageMetric; now: number; progress?: boolean }) {
  const countdown = metric && formatResetCountdown(metric.resetsAt, now);
  const detail = metric?.used !== null && metric?.used !== undefined
    ? `${metric.used} successful workspace requests${metric.limit === null ? ", unlimited" : ` of ${metric.limit}`}${metric.resetsAt ? `; resets ${metric.resetsAt} (UTC)` : ""}`
    : `${label} usage ${usageLabel(metric).toLowerCase()}`;
  return (
    <span className="inline-flex min-w-0 flex-wrap items-center gap-x-1 gap-y-0.5" title={detail}>
      <span>{label}: {usageLabel(metric)}</span>
      {progress && metric?.percentage !== null && metric?.percentage !== undefined && metric.limit !== 0 && (
        <span role="progressbar" aria-label={`${label} workspace usage`} aria-valuemin={0} aria-valuemax={100}
          aria-valuenow={Math.min(100, Math.max(0, metric.percentage))} aria-valuetext={`${metric.percentage}%; ${detail}`}
          className="inline-flex h-1 w-7 overflow-hidden rounded-full bg-muted-foreground/20">
          <span className="h-full bg-muted-foreground/60" style={{ width: `${Math.min(100, Math.max(0, metric.percentage))}%` }} />
        </span>
      )}
      {metric?.status === "exhausted" && metric.limit !== 0 && <span>(limit reached)</span>}
      {countdown && <span>· {countdown === "Resetting…" ? countdown : `resets in ${countdown}`}</span>}
      <span className="sr-only">{detail}</span>
    </span>
  );
}

export function AiUsageIndicator() {
  const { data, unavailable, now } = useAiUsageSummary();
  const unknown = unavailable ? emptyUsage("unavailable") : undefined;
  return (
    <div aria-label="Workspace AI usage" aria-busy={!data && !unavailable}
      className="flex min-h-8 min-w-0 flex-wrap items-center gap-x-3 gap-y-1 py-1 text-[10px] leading-4 text-muted-foreground sm:text-[11px]">
      <UsageItem label="Session" metric={data?.session ?? unknown} now={now} progress />
      <UsageItem label="Weekly" metric={data?.weekly ?? unknown} now={now} />
      {data && (data.session.status === "unconfigured" || data.weekly.status === "unconfigured") && (
        <UsageItem label="Monthly" metric={data.monthly} now={now} progress />
      )}
    </div>
  );
}
