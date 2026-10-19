"use client";
import { useAiUsageSummary } from "@/lib/hooks/useAiUsageSummary";
import { emptyUsage, type UsageMetric } from "@/lib/ai/usagePolicy";
import { formatResetCountdown, usageLabel } from "@/lib/ai/usageDisplay";

function UsageMeter({ percentage }: { percentage: number }) {
  return <span aria-hidden="true" className="inline-flex h-1 w-8 overflow-hidden rounded-full bg-foreground/10">
    <span className="h-full rounded-full bg-current transition-[width] motion-reduce:transition-none" style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }} />
  </span>;
}

export function UsageItem({ label, metric, now }: { label: string; metric?: UsageMetric; now: number; progress?: boolean }) {
  const countdown = metric && formatResetCountdown(metric.resetsAt, now);
  const configured = metric && metric.status !== "unconfigured" && metric.status !== "unavailable";
  const detail = metric?.used !== null && metric?.used !== undefined
    ? `${metric.used} successful workspace requests${metric.limit === null ? ", unlimited" : ` of ${metric.limit}`}${metric.resetsAt ? `; resets ${metric.resetsAt} (UTC)` : ""}`
    : metric?.status === "unconfigured" ? `Your workspace administrator has not set a ${label.toLowerCase()} request limit. Monthly credits still apply.`
    : `${label} usage ${usageLabel(metric).toLowerCase()}`;
  const display = metric?.status === "unconfigured" ? "No limit set" : usageLabel(metric);
  return (
    <span className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5" title={detail}>
      {configured && metric.percentage !== null && <UsageMeter percentage={metric.percentage} />}
      <span>{label}: {display}</span>
      {configured && metric.used !== null && <span className="opacity-70">({metric.used}{metric.limit !== null ? `/${metric.limit}` : " requests"})</span>}
      {metric?.status === "exhausted" && metric.limit !== 0 && <span className="text-destructive">(limit reached)</span>}
      {countdown && configured && <span className="opacity-75">· resets in {countdown}</span>}
      <span className="sr-only">{detail}</span>
    </span>
  );
}

function creditPercent(used: number, limit: number) {
  if (limit <= 0 || used <= 0) return "0% used";
  const percent = (used / limit) * 100;
  if (percent < 0.01) return "<0.01% used";
  return `${Number(percent.toFixed(2))}% used`;
}

export function AiUsageIndicator() {
  const { data, unavailable, now } = useAiUsageSummary();
  const unknown = unavailable ? emptyUsage("unavailable") : undefined;
  return (
    <div aria-label="Workspace AI usage" aria-busy={!data && !unavailable}
      className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border/40 pt-2 pb-1 text-[10px] leading-4 text-muted-foreground sm:text-[11px]">
      <UsageItem label="Session" metric={data?.session ?? unknown} now={now} />
      <span aria-hidden="true" className="opacity-30">|</span>
      <UsageItem label="Weekly" metric={data?.weekly ?? unknown} now={now} />
      <span aria-hidden="true" className="opacity-30">|</span>
      {data?.credits ? (() => {
        const credits = data.credits;
        const low = credits.limit > 0 && credits.remaining / credits.limit <= 0.2;
        const countdown = formatResetCountdown(credits.resetsAt, now);
        const number = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 4 });
        return <span role={credits.remaining <= 0 ? "alert" : low ? "status" : undefined}
          title={`${number(credits.used)} credits used · ${number(credits.reserved)} pending · ${number(credits.remaining)} remaining of ${number(credits.limit)}. Resets ${credits.resetsAt} (UTC).`}
          className={`inline-flex min-w-0 max-w-full flex-wrap items-center gap-x-1.5 gap-y-0.5 ${credits.remaining <= 0 ? "text-destructive" : low ? "text-amber-500" : ""}`}>
          <UsageMeter percentage={credits.limit > 0 ? credits.used / credits.limit * 100 : 0} />
          <span>Credits: {creditPercent(credits.used, credits.limit)}{credits.remaining <= 0 ? " · limit reached" : low ? " · low" : ""}</span>
          <span className="opacity-70">({number(credits.used)}/{number(credits.limit)})</span>
          {credits.reserved > 0 && <span className="opacity-75">· {number(credits.reserved)} pending</span>}
          {countdown && <span className="opacity-75">· resets in {countdown}</span>}
        </span>;
      })() : <UsageItem label="Monthly" metric={data?.monthly ?? unknown} now={now} />}
    </div>
  );
}
