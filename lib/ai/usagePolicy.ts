/** Optional workspace call quotas. No defaults: enabling these requires an explicit policy. */
export interface AiWindowPolicy {
  startsAt: string;
  session?: { minutes: number; limit: number | null };
  weekly?: { limit: number | null };
}
/** Missing limits are invalid; unlimited must be explicitly represented by null. */
export function isValidAiWindowPolicy(value: unknown): value is AiWindowPolicy {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const policy = value as Record<string, unknown>;
  if (typeof policy.startsAt !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(policy.startsAt) || !Number.isFinite(Date.parse(policy.startsAt))) return false;
  for (const kind of ["session", "weekly"] as const) {
    const raw = policy[kind];
    if (raw === undefined) continue;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
    const config = raw as Record<string, unknown>;
    if (config.limit !== null && (typeof config.limit !== "number" || !Number.isSafeInteger(config.limit) || config.limit < 0)) return false;
    if (kind === "session" && (typeof config.minutes !== "number" || !Number.isSafeInteger(config.minutes) || config.minutes < 1 || config.minutes > 525600)) return false;
  }
  return true;
}
export type UsageStatus = "available" | "exhausted" | "unlimited" | "unconfigured" | "unavailable";
export interface UsageMetric {
  used: number | null;
  limit: number | null;
  percentage: number | null;
  windowStartedAt: string | null;
  resetsAt: string | null;
  unit: "requests";
  status: UsageStatus;
}
export interface AiUsageSummary {
  session: UsageMetric;
  weekly: UsageMetric;
  monthly: UsageMetric;
  scope: "workspace";
  serverTime: string;
  credits?: { used: number; reserved: number; limit: number; remaining: number; resetsAt: string };
}
export interface UsageWindow { period: string; start: Date; end: Date; limit: number | null }
export function emptyUsage(status: UsageStatus): UsageMetric {
  return { used: null, limit: null, percentage: null, windowStartedAt: null, resetsAt: null, unit: "requests", status };
}
export function usageMetric(used: number, limit: number | null, start: Date, end: Date): UsageMetric {
  if (!Number.isFinite(used) || used < 0 || (limit !== null && (!Number.isFinite(limit) || limit < 0))) return emptyUsage("unavailable");
  return {
    used, limit, percentage: limit === null || limit === 0 ? null : Math.round(used / limit * 100),
    windowStartedAt: start.toISOString(), resetsAt: end.toISOString(), unit: "requests",
    status: limit === null ? "unlimited" : used >= limit ? "exhausted" : "available",
  };
}
/** Sessions are fixed windows anchored to startsAt. Weeks end Monday 00:00 UTC.
 * First weekly window starts at policy activation, so no pre-activation usage is implied.
 * Keys include activation and duration: changing a policy generation never reuses old counters.
 */
export function quotaWindow(policy: AiWindowPolicy | undefined, kind: "session" | "weekly", now: Date): UsageWindow | UsageStatus {
  if (!Number.isFinite(now.getTime())) return "unavailable";
  if (policy && !isValidAiWindowPolicy(policy)) return "unavailable";
  const config = policy?.[kind];
  if (!config) return "unconfigured";
  if (typeof policy?.startsAt !== "string" || !/T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(policy.startsAt)) return "unavailable";
  const anchor = new Date(policy.startsAt).getTime();
  if (!Number.isFinite(anchor) || (config.limit !== null && (!Number.isSafeInteger(config.limit) || config.limit < 0))) return "unavailable";
  if (anchor > now.getTime()) return "unconfigured";
  let start: number;
  let end: number;
  let duration = "week";
  if (kind === "session") {
    const minutes = policy!.session!.minutes;
    if (!Number.isSafeInteger(minutes) || minutes <= 0 || minutes > 525600) return "unavailable";
    const ms = minutes * 60000;
    duration = String(minutes);
    start = anchor + Math.floor((now.getTime() - anchor) / ms) * ms;
    end = start + ms;
  } else {
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    monday.setUTCDate(monday.getUTCDate() - (monday.getUTCDay() + 6) % 7);
    start = Math.max(anchor, monday.getTime());
    end = monday.getTime() + 7 * 86400000;
  }
  if (!Number.isFinite(new Date(start).getTime()) || !Number.isFinite(new Date(end).getTime())) return "unavailable";
  return { period: `${kind}:${anchor}:${duration}:${start}`, start: new Date(start), end: new Date(end), limit: config.limit };
}
