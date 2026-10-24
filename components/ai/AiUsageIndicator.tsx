"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { refreshAiUsage, useAiUsageSummary } from "@/lib/hooks/useAiUsageSummary";
import { emptyUsage, type UsageMetric } from "@/lib/ai/usagePolicy";
import { formatResetCountdown, usageLabel } from "@/lib/ai/usageDisplay";
import { PLAN_KEY_LABELS, type PlanKeyType } from "@/lib/constants/statuses";

type CreditWindow = {
  used: number;
  reserved: number;
  limit: number;
  remaining: number;
  startsAt: string;
  resetsAt: string;
  unit: "credits";
};

function percent(used: number, reserved: number, limit: number) {
  return limit > 0 ? Math.min(100, Math.max(0, (used + reserved) / limit * 100)) : 0;
}

function percentLabel(value: number) {
  if (value > 0 && value < 1) return "<1%";
  return `${Math.round(value)}%`;
}

function number(value: number) {
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function ProgressBar({ value, className = "", barColor }: { value: number; className?: string; barColor?: string }) {
  const fill = Math.min(100, Math.max(0, value));
  return <div aria-hidden="true" className={`h-2 w-full overflow-hidden rounded-full bg-foreground/10 ${className}`}>
    <div className={`h-full rounded-full transition-all duration-300 ${barColor || "bg-current"}`} style={{ width: `${fill}%` }} />
  </div>;
}

function LegacyWindowCard({ label, metric, now }: { label: string; metric: UsageMetric; now: number }) {
  if (["unavailable", "unconfigured"].includes(metric.status)) return <section className="rounded-lg border p-3" aria-label={`${label} request usage`}>
    <p className="text-xs text-muted-foreground">{label}</p><p>{metric.status === "unavailable" ? "Temporarily unavailable" : "No request limit configured"}</p>
  </section>;
  const countdown = formatResetCountdown(metric.resetsAt, now);
  const title = metric.limit === null ? "No request limit is configured" : `${metric.used ?? 0} of ${metric.limit} successful requests used`;
  return <section className="rounded-lg border border-border/70 bg-background/70 p-3" aria-label={`${label} request usage`}>
    <p className="text-xs text-muted-foreground">{label} limit</p>
    <p className="mt-1 text-xl font-semibold text-foreground">{metric.limit === null ? "Unlimited" : `${metric.limit} requests`}</p>
    <p className="mt-0.5 text-xs text-muted-foreground">{title}</p>
    {metric.percentage !== null && <ProgressBar value={metric.percentage} className="mt-3" barColor="bg-purple-600 dark:bg-purple-500" />}
    {countdown && <p className="mt-2 text-xs text-muted-foreground">Resets in {countdown}</p>}
  </section>;
}

export function CreditWindowCard({ label, cadence, metric, now }: { label: string; cadence: string; metric: CreditWindow; now: number }) {
  const consumed = metric.used + metric.reserved;
  const fill = percent(metric.used, metric.reserved, metric.limit);
  const countdown = formatResetCountdown(metric.resetsAt, now);
  const low = metric.remaining > 0 && metric.limit > 0 && metric.remaining / metric.limit <= 0.2;
  const exhausted = metric.remaining <= 0;
  const statusClass = exhausted ? "text-destructive" : low ? "text-amber-600 dark:text-amber-400" : "text-foreground";
  const barColor = exhausted ? "bg-destructive" : low ? "bg-amber-500" : "bg-purple-600 dark:bg-purple-500";

  return <section className="rounded-lg border border-border/70 bg-background/70 p-3" aria-label={`${label} AI credit usage`}>
    <div className="flex items-start justify-between gap-3">
      <div>
        <p className="text-xs text-muted-foreground">{label} limit</p>
        <p className="mt-1 text-xl font-semibold text-foreground">{number(metric.limit)} units</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Every {cadence}</p>
      </div>
      <p className={`text-sm font-medium ${statusClass}`}>{percentLabel(fill)} used</p>
    </div>
    <ProgressBar value={fill} barColor={barColor} className="mt-3" />
    <div className="mt-2 flex flex-wrap justify-between gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <span>{number(metric.used)} used{metric.reserved > 0 ? ` + ${number(metric.reserved)} pending` : ""}</span>
      <span>{number(Math.max(0, metric.remaining))} remaining</span>
    </div>
    {countdown && <p className="mt-2 text-xs text-muted-foreground">Resets in {countdown}</p>}
    <span className="sr-only">{number(consumed)} of {number(metric.limit)} units committed or reserved.</span>
  </section>;
}

function CompactCreditWindow({ shortLabel, metric, now }: { shortLabel: string; metric: CreditWindow; now: number }) {
  const fill = percent(metric.used, metric.reserved, metric.limit);
  const countdown = formatResetCountdown(metric.resetsAt, now);
  const exhausted = metric.remaining <= 0;
  const low = !exhausted && metric.limit > 0 && metric.remaining / metric.limit <= 0.2;
  const barColor = exhausted ? "bg-destructive" : low ? "bg-amber-500" : "bg-purple-500";

  return <span className={`inline-flex items-center gap-1.5 whitespace-nowrap ${exhausted ? "text-destructive" : low ? "text-amber-600 dark:text-amber-400" : ""}`}>
    <span>{shortLabel} {percentLabel(fill)}</span>
    <span aria-hidden="true" className="inline-block h-1.5 w-10 sm:w-12 overflow-hidden rounded-full bg-foreground/15 align-middle">
      <span
        className={`block h-full rounded-full transition-all duration-300 ${barColor}`}
        style={{ width: `${Math.min(100, Math.max(0, fill))}%` }}
      />
    </span>
    {countdown && <span className="opacity-75">· {countdown}</span>}
    {exhausted && <span>· limit reached</span>}
    {low && <span>· low</span>}
  </span>;
}

function LegacyCompactWindow({ label, metric, now }: { label: string; metric: UsageMetric; now: number }) {
  const countdown = formatResetCountdown(metric.resetsAt, now);
  return <span className="inline-flex items-center gap-1 whitespace-nowrap">
    <span>{label} {usageLabel(metric)}</span>
    {countdown && <span className="opacity-75">· {countdown}</span>}
  </span>;
}

/** Render only when the server explicitly identifies a free ERP answer. */
export function ErpUsageNotice({ creditsUsed }: { creditsUsed?: number }) {
  return creditsUsed === 0 ? <p className="mt-2 text-xs text-muted-foreground">0 credits used · ERP lookup</p> : null;
}

export function AiUsageIndicator() {
  const { data, unavailable, now } = useAiUsageSummary();
  const [open, setOpen] = useState(false);
  const unknown = unavailable ? emptyUsage("unavailable") : emptyUsage("unconfigured");
  const sessionCredits = data?.credits?.windows?.session;
  const weeklyCredits = data?.credits?.windows?.weekly;
  const planLabel = data?.credits?.planKey && data.credits.planKey in PLAN_KEY_LABELS
    ? PLAN_KEY_LABELS[data.credits.planKey as PlanKeyType]
    : null;
  const summaryTitle = sessionCredits && weeklyCredits
    ? `${planLabel ? `${planLabel} plan. ` : ""}Session: ${number(sessionCredits.used)} used, ${number(sessionCredits.reserved)} pending of ${number(sessionCredits.limit)} units. Weekly: ${number(weeklyCredits.used)} used, ${number(weeklyCredits.reserved)} pending of ${number(weeklyCredits.limit)} units.`
    : "AI usage details";

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" aria-label="Show AI session and weekly usage details" aria-expanded={open}
        title={`${summaryTitle} Click to see plan limits and remaining usage.`}
        className="inline-flex max-w-full items-center gap-1.5 rounded px-1.5 py-1 text-[10px] leading-4 text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:text-[11px]"
        aria-busy={!data && !unavailable}>
        {sessionCredits
          ? <CompactCreditWindow shortLabel="5h" metric={sessionCredits} now={now} />
          : <LegacyCompactWindow label="Session" metric={data?.session ?? unknown} now={now} />}
        <span aria-hidden="true" className="opacity-40">|</span>
        {weeklyCredits
          ? <CompactCreditWindow shortLabel="Week" metric={weeklyCredits} now={now} />
          : <LegacyCompactWindow label="Week" metric={data?.weekly ?? unknown} now={now} />}
        <ChevronDown aria-hidden="true" className="h-3 w-3 shrink-0 opacity-60" />
      </button>
    </PopoverTrigger>
    <PopoverContent side="top" align="end" className="w-[min(92vw,24rem)] rounded-xl p-4 shadow-xl" aria-label="AI usage details">
      <div className="mb-3">
        <div className="flex items-center justify-between">
          <p className="font-semibold text-foreground">AI usage</p>
          {planLabel && (
            <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
              {planLabel} plan
            </span>
          )}
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          ERP data lookups use 0 credits. Your balance changes when AI provider usage is charged. Credit limits follow your assigned plan. Longer context, file analysis, and complex operations use more model tokens than a short question.
        </p>
      </div>
      {sessionCredits && weeklyCredits ? <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <CreditWindowCard label="Session" cadence="5 hours" metric={sessionCredits} now={now} />
        <CreditWindowCard label="Weekly" cadence="7 days" metric={weeklyCredits} now={now} />
      </div> : <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <LegacyWindowCard label="Session" metric={data?.session ?? unknown} now={now} />
        <LegacyWindowCard label="Weekly" metric={data?.weekly ?? unknown} now={now} />
      </div>}
      <div className="mt-3 rounded-md bg-muted/40 p-2 text-[10px] text-muted-foreground">
        <p className="font-medium text-foreground/80">Plan limits reference:</p>
        <p className="mt-0.5">• Free / Trial: 20 units / 5h session · 100 units / 7d week</p>
        <p>• Pro: 100 units / 5h session · 500 units / 7d week</p>
        <p>• Business: 250 units / 5h session · 1,500 units / 7d week</p>
      </div>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">Pending estimates count while a task runs and are reconciled with actual provider usage when it completes. Failed AI provider requests release the reservation.</p>
      {unavailable && <p role="status" className="mt-2 text-xs text-amber-600">Usage data is temporarily unavailable. <button type="button" onClick={refreshAiUsage} className="underline">Retry</button></p>}
    </PopoverContent>
  </Popover>;
}
