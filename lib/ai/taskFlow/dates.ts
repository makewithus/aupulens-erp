/**
 * Deterministic date resolution for the task flow. Never silently guesses: anything read
 * loosely (weekday-relative, d/m vs m/d, missing year) is flagged so the summary can say
 * "I read this as …" with the absolute date, weekday included.
 */
export interface ResolvedDate {
  iso: string; // YYYY-MM-DD
  label: string; // "Friday, 26 Sep 2026"
  /** Why the reading might not be what the user meant — shown next to the date. */
  caveat?: string;
  past?: boolean;
}

const DAY = 86_400_000;
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

const toUtc = (iso: string) => { const [y, m, d] = iso.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fromUtc = (t: number) => new Date(t).toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, "0");

export function todayIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(now); // YYYY-MM-DD
}

export function labelFor(iso: string): string {
  const t = toUtc(iso);
  const d = new Date(t);
  return `${WEEKDAYS[d.getUTCDay()][0].toUpperCase()}${WEEKDAYS[d.getUTCDay()].slice(1)}, ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)[0].toUpperCase()}${MONTHS[d.getUTCMonth()].slice(1, 3)} ${d.getUTCFullYear()}`;
}

const valid = (y: number, m: number, d: number) => {
  const t = Date.UTC(y, m - 1, d);
  const x = new Date(t);
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
};

function make(iso: string, today: string, caveat?: string): ResolvedDate | null {
  const t = toUtc(iso);
  const t0 = toUtc(today);
  const y = new Date(t).getUTCFullYear();
  const y0 = new Date(t0).getUTCFullYear();
  if (y < y0 - 1 || y > y0 + 5) return null; // "2062" style typos are refused, not accepted
  return { iso, label: labelFor(iso), caveat, past: t < t0 };
}

const monthIdx = (s: string) => MONTHS.findIndex((m) => m.startsWith(s.toLowerCase().slice(0, 3)) && (s.length >= 3));
const MON_RX = "jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?";

/**
 * @param cue  true when the surrounding text/question makes a bare "30 days" mean "due in 30 days"
 */
export function resolveDate(text: string, today: string, cue = false): ResolvedDate | null {
  const s = text.toLowerCase().replace(/\s+/g, " ").trim();
  const t0 = toUtc(today);
  const add = (n: number, caveat?: string) => make(fromUtc(t0 + n * DAY), today, caveat);
  let m: RegExpMatchArray | null;

  if (/\bday after tomorrow\b/.test(s)) return add(2);
  if (/\btomorrow\b/.test(s)) return add(1);
  if (/\btoday\b/.test(s)) return add(0);
  if (/\byesterday\b/.test(s)) return add(-1);

  if ((m = s.match(/\b(?:in|within|after|net)\s+(\d{1,3})\s*(?:-\s*)?(day|days|week|weeks|month|months)?\b/)) || (cue && (m = s.match(/\b(\d{1,3})\s*(?:-\s*)?(day|days|week|weeks|month|months)\b/)))) {
    const n = Number(m[1]);
    const unit = m[2] ?? "days"; // "net 30"
    if (n === 0 || n > 365) return null;
    if (unit.startsWith("week")) return add(n * 7);
    if (unit.startsWith("month")) {
      const d = new Date(t0);
      const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
      const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
      return make(fromUtc(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d.getUTCDate(), last))), today);
    }
    return add(n);
  }

  if (/\b(?:end of (?:this |the )?month|month[- ]end)\b/.test(s)) {
    const d = new Date(t0);
    return make(fromUtc(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)), today);
  }

  if ((m = s.match(new RegExp(`\\b(next|this|coming)?\\s*(${WEEKDAYS.join("|")}|mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)\\b`)))) {
    const key = m[2].slice(0, 3);
    const idx = WEEKDAYS.findIndex((w) => w.startsWith(key));
    const cur = new Date(t0).getUTCDay();
    let delta = (idx - cur + 7) % 7;
    if (delta === 0) delta = 7;
    const caveat = m[1] === "next" && delta <= 6
      ? `"next ${WEEKDAYS[idx]}" can mean the coming one or the one after — I used the coming one`
      : undefined;
    return add(delta, caveat);
  }

  // ISO
  if ((m = s.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return valid(y, mo, d) ? make(`${y}-${pad(mo)}-${pad(d)}`, today) : null;
  }
  // dd/mm/yyyy | dd-mm-yy | dd.mm.yyyy  (India: day first)
  if ((m = s.match(/\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})\b/))) {
    const a = Number(m[1]), b = Number(m[2]);
    let y = Number(m[3]);
    if (m[3].length === 2) y += 2000;
    let day = a, mon = b, caveat: string | undefined;
    if (b > 12 && a <= 12) { day = b; mon = a; caveat = "read as month/day because the second number is above 12"; }
    else if (a <= 12 && b <= 12 && a !== b) caveat = "read as day/month";
    return valid(y, mon, day) ? make(`${y}-${pad(mon)}-${pad(day)}`, today, caveat) : null;
  }
  // 30 Sep 2026 | 30th September | Sep 30, 2026 | September 30
  const dm = s.match(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:of\\s+)?(${MON_RX})\\b(?:,?\\s*(\\d{4}|\\d{2}))?`));
  const md = s.match(new RegExp(`\\b(${MON_RX})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s*(\\d{4}))?`));
  const mm = dm ? { day: Number(dm[1]), mon: monthIdx(dm[2]) + 1, yr: dm[3] } : md ? { day: Number(md[2]), mon: monthIdx(md[1]) + 1, yr: md[3] } : null;
  if (mm) {
    const cy = new Date(t0).getUTCFullYear();
    let y = mm.yr ? Number(mm.yr) + (mm.yr.length === 2 ? 2000 : 0) : cy;
    let caveat: string | undefined;
    if (!mm.yr) {
      if (valid(y, mm.mon, mm.day) && Date.UTC(y, mm.mon - 1, mm.day) < t0) { y += 1; caveat = "no year given and that date has passed this year — I used next year"; }
      else caveat = undefined;
    }
    return valid(y, mm.mon, mm.day) ? make(`${y}-${pad(mm.mon)}-${pad(mm.day)}`, today, caveat) : null;
  }
  return null;
}

/** True when the text contains something date-shaped (used to route a comma-part to the due-date slot). */
export function looksLikeDate(text: string): boolean {
  return /\b(today|tomorrow|yesterday|day after tomorrow|next|this|coming|month[- ]end|end of (?:this |the )?month|net \d|(?:in|within) \d+|\d+\s*(?:days?|weeks?|months?)|\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(text)
    || new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s*(?:of\\s+)?(?:${MON_RX})\\b|\\b(?:${MON_RX})\\s+\\d{1,2}\\b`, "i").test(text);
}
