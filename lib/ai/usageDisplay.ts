import type { UsageMetric } from "./usagePolicy";
export function formatResetCountdown(resetsAt: string | null, now: number): string | null {
  if (!resetsAt || !Number.isFinite(Date.parse(resetsAt))) return null;
  const minutes = Math.max(0, Math.ceil((Date.parse(resetsAt) - now) / 60000));
  if (minutes === 0) return "Resetting…";
  if (minutes >= 1440) return `${Math.floor(minutes / 1440)}d ${Math.floor(minutes % 1440 / 60)}h`;
  if (minutes >= 60) return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
  return `${minutes}m`;
}
export function usageLabel(metric?: UsageMetric): string {
  if (!metric) return "Loading…";
  if (metric.status === "unlimited") return "Unlimited";
  if (metric.status === "unconfigured") return "Not configured";
  if (metric.limit === 0 && metric.status === "exhausted") return "No allowance";
  if (metric.status === "unavailable" || metric.percentage === null) return "Unavailable";
  if (metric.used !== null && metric.limit !== null && metric.limit > 0 && metric.used > 0 && metric.percentage === 0) return "<1%";
  return `${metric.percentage}%`;
}
