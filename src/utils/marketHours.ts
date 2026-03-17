import { config } from '../config';

/**
 * Returns the next market open time (Mon–Fri 09:30 UTC).
 * If called on a weekday before 09:30 UTC, returns today at 09:30 UTC.
 * If called on a weekday at or after 09:30 UTC, returns next weekday at 09:30 UTC.
 * If called on Saturday or Sunday, returns next Monday at 09:30 UTC.
 */
export function getNextMarketOpen(now: Date = new Date()): Date {
  const result = new Date(now);
  result.setUTCHours(config.marketOpenHourUTC, config.marketOpenMinuteUTC, 0, 0);

  const day = now.getUTCDay();
  const isWeekend = day === 0 || day === 6;

  const marketOpenToday = new Date(now);
  marketOpenToday.setUTCHours(config.marketOpenHourUTC, config.marketOpenMinuteUTC, 0, 0);

  if (isWeekend) {
    const daysUntilMonday = day === 0 ? 1 : 2;
    result.setUTCDate(result.getUTCDate() + daysUntilMonday);
  } else if (now >= marketOpenToday) {
    result.setUTCDate(result.getUTCDate() + 1);
    const newDay = result.getUTCDay();
    if (newDay === 6) {
      result.setUTCDate(result.getUTCDate() + 2);
    } else if (newDay === 0) {
      result.setUTCDate(result.getUTCDate() + 1);
    }
  }

  return result;
}
