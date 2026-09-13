/**
 * Hard Rule 12 (source doc §33): "All timestamps should be stored
 * consistently, preferably UTC, with organisation timezone applied at
 * presentation." Storage side was already correct everywhere (every
 * timestamp field in this codebase is a Mongoose `Date`, stored as UTC by
 * construction). The presentation side was not: every timestamp display in
 * the admin control plane used `.toLocaleString()`/`.toLocaleDateString()`
 * with no timezone argument, which renders in the *viewing admin's browser*
 * timezone — not the organisation's — and never names which zone it used
 * (docs/admin/verification/HARD_RULES.md rule 12).
 *
 * This is the one shared formatter every admin surface must use instead.
 * Client-safe (Intl is available in both the browser and Node, no
 * server/client split needed).
 */

const PLATFORM_WIDE_TIMEZONE = "UTC";

function isValidTimeZone(tz: string | undefined | null): tz is string {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface FormatOrgDateOptions {
  /** Omit the time-of-day portion — for columns that only ever need a date (e.g. "Created"). */
  dateOnly?: boolean;
}

/**
 * Formats `date` in `timezone` (an IANA zone, e.g. "Asia/Kolkata") with the
 * zone abbreviation named in the output (e.g. "12 Sep 2026, 6:04 PM IST").
 * An invalid/missing timezone falls back to UTC rather than silently using
 * the browser's local zone — the one thing this function must never do,
 * since that's the exact bug it exists to fix. Falling back to UTC (not
 * throwing) matches `Organization.settings.timezone`'s own schema default.
 */
export function formatInOrgTimezone(date: Date | string, timezone: string | undefined | null, opts: FormatOrgDateOptions = {}): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  const tz = isValidTimeZone(timezone) ? timezone : PLATFORM_WIDE_TIMEZONE;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "short",
    day: "2-digit",
    ...(opts.dateOnly ? {} : { hour: "numeric", minute: "2-digit" }),
    timeZoneName: "short",
  });
  return formatter.format(d);
}

/**
 * For genuinely cross-tenant/platform-wide surfaces (the dashboard, the
 * global audit log, access-requests spanning many organisations) where
 * there is no single "the organisation" whose timezone would apply —
 * explicitly UTC, explicitly labeled, never the viewing admin's silent
 * local browser zone.
 */
export function formatPlatformTimestamp(date: Date | string, opts: FormatOrgDateOptions = {}): string {
  return formatInOrgTimezone(date, PLATFORM_WIDE_TIMEZONE, opts);
}
