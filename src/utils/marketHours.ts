/**
 * NYSE/Nasdaq market hours: Monday–Friday 09:30–16:00 America/New_York.
 * All scheduling is derived from the ET (Eastern Time) clock, which automatically
 * handles EST (UTC-5) in winter and EDT (UTC-4) in summer (DST).
 */

const NY_TZ = 'America/New_York';
const MARKET_OPEN_HOUR = 9;
const MARKET_OPEN_MINUTE = 30;
const MARKET_CLOSE_HOUR = 16;
const MARKET_CLOSE_MINUTE = 0;

interface NYDateParts {
  year: number;
  month: number; // 1–12
  day: number;
  hour: number;
  minute: number;
  weekday: number; // 0 = Sun … 6 = Sat
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

/** Decompose a UTC instant into its America/New_York calendar + clock components. */
function getNYDateParts(date: Date): NYDateParts {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: NY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = fmt.formatToParts(date);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';

  const hourVal = parseInt(get('hour'));

  return {
    year: parseInt(get('year')),
    month: parseInt(get('month')),
    day: parseInt(get('day')),
    hour: hourVal === 24 ? 0 : hourVal, // midnight edge-case in some locales
    minute: parseInt(get('minute')),
    weekday: WEEKDAY_MAP[get('weekday')] ?? 0,
  };
}

/**
 * Build a UTC Date that represents the given calendar date and clock time
 * in America/New_York. Correctly handles DST (one-shot correction).
 */
function buildNYDateTime(year: number, month: number, day: number, hour: number, minute: number): Date {
  // Use EST (UTC-5) as the initial approximation, then correct for DST.
  const approx = new Date(Date.UTC(year, month - 1, day, hour + 5, minute));

  const actual = getNYDateParts(approx);
  const hourDiff = hour - actual.hour;
  const minDiff = minute - actual.minute;

  if (hourDiff !== 0 || minDiff !== 0) {
    return new Date(approx.getTime() + hourDiff * 3600_000 + minDiff * 60_000);
  }

  return approx;
}

/**
 * Returns true when US equity markets are currently open:
 * Monday–Friday 09:30 ≤ ET < 16:00.
 */
export function isMarketOpen(now: Date = new Date()): boolean {
  const { weekday, hour, minute } = getNYDateParts(now);
  if (weekday === 0 || weekday === 6) return false;

  const timeInMins = hour * 60 + minute;
  return (
    timeInMins >= MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE &&
    timeInMins < MARKET_CLOSE_HOUR * 60 + MARKET_CLOSE_MINUTE
  );
}

/**
 * Returns the scheduled execution time for an order:
 * - Market is open (Mon–Fri 09:30–16:00 ET) → execute now (returns `now`)
 * - Weekday before 09:30 ET              → today's open (09:30 ET today)
 * - Weekday after 16:00 ET or weekend    → next weekday's open (09:30 ET)
 */
export function getNextMarketOpen(now: Date = new Date()): Date {
  const { weekday, hour, minute, year, month, day } = getNYDateParts(now);

  const isWeekend = weekday === 0 || weekday === 6;
  const timeInMins = hour * 60 + minute;
  const openMins = MARKET_OPEN_HOUR * 60 + MARKET_OPEN_MINUTE;   // 570
  const closeMins = MARKET_CLOSE_HOUR * 60 + MARKET_CLOSE_MINUTE; // 960

  if (!isWeekend) {
    if (timeInMins < openMins) {
      // Weekday before open → today at 09:30 ET
      return buildNYDateTime(year, month, day, MARKET_OPEN_HOUR, MARKET_OPEN_MINUTE);
    }
    if (timeInMins < closeMins) {
      // Market is open → execute immediately
      return new Date(now);
    }
  }

  // After close or weekend → find next weekday and return its 09:30 ET
  const candidate = new Date(now);
  for (let i = 1; i <= 7; i++) {
    candidate.setUTCDate(candidate.getUTCDate() + 1);
    const next = getNYDateParts(candidate);
    if (next.weekday !== 0 && next.weekday !== 6) {
      return buildNYDateTime(next.year, next.month, next.day, MARKET_OPEN_HOUR, MARKET_OPEN_MINUTE);
    }
  }

  return candidate; // unreachable in practice
}
