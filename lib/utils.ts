import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Returns a 'YYYY-MM-DD' calendar date string for a given date in the local (or specified) timezone.
 * Unlike date.toISOString().slice(0, 10) which converts to UTC and shifts calendar dates by -1 day
 * in timezones ahead of UTC (such as IST UTC+05:30) for events created in the early morning,
 * this function preserves the user's or organization's calendar date.
 */
export function toLocalDateString(d?: string | Date | number | null, timeZone?: string): string {
  if (!d) return "";
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return d;
  }
  const date = d instanceof Date ? d : new Date(d);
  if (isNaN(date.getTime())) return "";

  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(date);
      const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
      return `${values.year}-${values.month}-${values.day}`;
    } catch {
      // Fallback to local system timezone
    }
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getTodayLocalDateString(timeZone?: string): string {
  return toLocalDateString(new Date(), timeZone);
}
