/** Plan credit windows are fixed, UTC-aligned buckets so concurrent requests
 * reserve against the same atomic counters. Session periods are five hours;
 * weekly periods run Monday 00:00 UTC through the next Monday.
 */
export interface CreditWindow {
  kind: "session" | "weekly";
  period: string;
  start: Date;
  end: Date;
  limit: number;
}

const SESSION_MS = 5 * 60 * 60 * 1000;
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export function getAiCreditWindows(
  now: Date,
  limits: { aiCreditsPerSession?: number; aiCreditsPerWeek?: number },
): CreditWindow[] {
  const timestamp = now.getTime();
  if (!Number.isFinite(timestamp)) throw new Error("Invalid AI credit window date");
  const sessionStart = Math.floor(timestamp / SESSION_MS) * SESSION_MS;
  const utcDay = new Date(timestamp);
  const monday = Date.UTC(utcDay.getUTCFullYear(), utcDay.getUTCMonth(), utcDay.getUTCDate()) -
    ((utcDay.getUTCDay() + 6) % 7) * 24 * 60 * 60 * 1000;
  const sessionLimit = Math.max(0, limits.aiCreditsPerSession ?? 20);
  const weeklyLimit = Math.max(0, limits.aiCreditsPerWeek ?? 100);
  return [
    { kind: "session", period: `credit-session:${sessionStart}`, start: new Date(sessionStart), end: new Date(sessionStart + SESSION_MS), limit: sessionLimit },
    { kind: "weekly", period: `credit-week:${monday}`, start: new Date(monday), end: new Date(monday + WEEK_MS), limit: weeklyLimit },
  ];
}
