const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string) {
  let value = formatterCache.get(timeZone);
  if (!value) {
    value = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    formatterCache.set(timeZone, value);
  }
  return value;
}

function parts(date: Date, timeZone: string) {
  return Object.fromEntries(
    formatter(timeZone)
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
}

function localToInstant(year: number, month: number, day: number, timeZone: string) {
  const target = Date.UTC(year, month - 1, day);
  const targetKey = year * 10_000 + month * 100 + day;
  // Search for the first instant whose local calendar date is the requested
  // date or later. This handles zones that repeat midnight or skip midnight
  // (and even a whole civil date) without relying on a fixed UTC offset.
  let lower = target - 3 * 86_400_000;
  let upper = target + 3 * 86_400_000;
  while (lower < upper) {
    const candidate = Math.floor((lower + upper) / 2);
    const represented = parts(new Date(candidate), timeZone);
    const representedKey = represented.year * 10_000 + represented.month * 100 + represented.day;
    if (representedKey < targetKey) lower = candidate + 1;
    else upper = candidate;
  }
  const actual = parts(new Date(lower), timeZone);
  const actualKey = actual.year * 10_000 + actual.month * 100 + actual.day;
  if (actualKey < targetKey) throw new Error("Unable to resolve local calendar boundary.");
  return new Date(lower);
}

function validateTimeZone(timeZone: string) {
  if (!timeZone || timeZone.length > 100) throw new Error("Invalid reporting time zone.");
  // Construction throws for unknown IANA identifiers. Using the resolved name
  // permits aliases supported by the deployed ICU data without maintaining a
  // stale application allowlist.
  new Intl.DateTimeFormat("en-US", { timeZone }).format();
}

export function zonedYearMonth(date: Date, timeZone: string) {
  validateTimeZone(timeZone);
  const value = parts(date, timeZone);
  return { year: value.year, month: value.month };
}

/**
 * Resolves the local calendar day and Monday-based week containing `date`.
 * Returned instants remain correct when the zone offset changes during a day.
 */
export function zonedDayWeekBounds(date: Date, timeZone: string) {
  validateTimeZone(timeZone);
  if (!Number.isFinite(date.getTime())) throw new Error("Invalid boundary date.");
  const local = parts(date, timeZone);
  const civilDay = new Date(Date.UTC(local.year, local.month - 1, local.day));
  const weekday = civilDay.getUTCDay();
  const monday = new Date(civilDay);
  monday.setUTCDate(monday.getUTCDate() - ((weekday + 6) % 7));
  const tomorrow = new Date(civilDay);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return {
    dayStart: localToInstant(local.year, local.month, local.day, timeZone),
    nextDayStart: localToInstant(
      tomorrow.getUTCFullYear(),
      tomorrow.getUTCMonth() + 1,
      tomorrow.getUTCDate(),
      timeZone,
    ),
    weekStart: localToInstant(
      monday.getUTCFullYear(),
      monday.getUTCMonth() + 1,
      monday.getUTCDate(),
      timeZone,
    ),
  };
}

export function zonedMonthBounds(year: number, month: number, timeZone: string) {
  if (
    !Number.isInteger(year) ||
    year < 2000 ||
    year > 2200 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  )
    throw new Error("Invalid reporting month.");
  validateTimeZone(timeZone);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  return {
    start: localToInstant(year, month, 1, timeZone),
    end: localToInstant(nextYear, nextMonth, 1, timeZone),
  };
}
