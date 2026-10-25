function validTimeZone(requestedTimeZone: string | undefined) {
  const timeZone = requestedTimeZone || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(0);
    return timeZone;
  } catch {
    return "UTC";
  }
}

export function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function dateInTimeZone(date: Date, requestedTimeZone: string) {
  const timeZone = validTimeZone(requestedTimeZone);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function getZonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function zonedMidnightToUtc(year: number, month: number, day: number, requestedTimeZone: string) {
  const timeZone = validTimeZone(requestedTimeZone);
  const targetAsUtc = Date.UTC(year, month - 1, day);
  let guess = targetAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const local = getZonedParts(new Date(guess), timeZone);
    const representedAsUtc = Date.UTC(local.year, local.month - 1, local.day, local.hour, local.minute, local.second);
    const delta = targetAsUtc - representedAsUtc;
    guess += delta;
    if (delta === 0) break;
  }
  return new Date(guess);
}

/** Returns the first instant (00:00:00.000) of the calendar date encoded in `date` in `timeZone` as a UTC Date. */
export function toDateStartInTimeZone(date: Date, timeZone: string) {
  return zonedMidnightToUtc(
    date.getUTCFullYear(),
    date.getUTCMonth() + 1,
    date.getUTCDate(),
    timeZone,
  );
}

/** Returns the last instant of the calendar date encoded in `date` at UTC. */
export function toDateEndInTimeZone(date: Date, timeZone: string) {
  const nextDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 1));
  const startOfNextDay = zonedMidnightToUtc(
    nextDay.getUTCFullYear(),
    nextDay.getUTCMonth() + 1,
    nextDay.getUTCDate(),
    timeZone,
  );
  return new Date(startOfNextDay.getTime() - 1);
}
