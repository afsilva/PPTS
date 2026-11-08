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
  const target = Date.UTC(year, month - 1, day, 0, 0, 0);
  let guess = target;

  // Intl exposes local civil fields but not the offset. Iteratively adjust the
  // candidate until its fields equal local midnight. Month boundaries are
  // selected because supported IANA zones do not transition at that instant.
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const represented = parts(new Date(guess), timeZone);
    const representedAsUtc = Date.UTC(
      represented.year,
      represented.month - 1,
      represented.day,
      represented.hour,
      represented.minute,
      represented.second,
    );
    const next = guess + target - representedAsUtc;
    if (next === guess) break;
    guess = next;
  }

  const actual = parts(new Date(guess), timeZone);
  if (
    actual.year !== year ||
    actual.month !== month ||
    actual.day !== day ||
    actual.hour !== 0 ||
    actual.minute !== 0 ||
    actual.second !== 0
  )
    throw new Error("Unable to resolve local month boundary.");
  return new Date(guess);
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
