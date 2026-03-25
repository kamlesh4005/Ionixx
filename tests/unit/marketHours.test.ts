/**
 * Market hours tests.
 *
 * All March 2025 dates fall under EDT (UTC-4, DST started Mar 9 2025).
 * NYSE open = 09:30 ET = 13:30 UTC in March.
 * NYSE close = 16:00 ET = 20:00 UTC in March.
 *
 * January 2025 dates fall under EST (UTC-5).
 * NYSE open = 09:30 ET = 14:30 UTC in January.
 */
import { getNextMarketOpen, isMarketOpen } from '../../src/utils/marketHours';

// ---------------------------------------------------------------------------
// isMarketOpen
// ---------------------------------------------------------------------------
describe('isMarketOpen', () => {
  it('returns false before market open on a weekday (ET)', () => {
    // Wednesday 2025-03-19 05:30 ET = 09:30 UTC (before 09:30 ET)
    expect(isMarketOpen(new Date('2025-03-19T09:29:00Z'))).toBe(false);
  });

  it('returns true exactly at 09:30 ET', () => {
    // 09:30 EDT = 13:30 UTC
    expect(isMarketOpen(new Date('2025-03-19T13:30:00Z'))).toBe(true);
  });

  it('returns true during market hours (10:00 ET = 14:00 UTC)', () => {
    expect(isMarketOpen(new Date('2025-03-19T14:00:00Z'))).toBe(true);
  });

  it('returns false exactly at 16:00 ET (market closed)', () => {
    // 16:00 EDT = 20:00 UTC
    expect(isMarketOpen(new Date('2025-03-19T20:00:00Z'))).toBe(false);
  });

  it('returns false after 16:00 ET', () => {
    expect(isMarketOpen(new Date('2025-03-19T21:00:00Z'))).toBe(false);
  });

  it('returns false on Saturday', () => {
    expect(isMarketOpen(new Date('2025-03-22T14:00:00Z'))).toBe(false);
  });

  it('returns false on Sunday', () => {
    expect(isMarketOpen(new Date('2025-03-23T14:00:00Z'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getNextMarketOpen — before-open weekday: returns today at 09:30 ET
// ---------------------------------------------------------------------------
describe('getNextMarketOpen — weekday before open', () => {
  it('returns today 09:30 ET when called on a weekday before 09:30 ET (early UTC)', () => {
    // Wednesday 2025-03-19 at 09:00 UTC = 05:00 EDT (before market open)
    const result = getNextMarketOpen(new Date('2025-03-19T09:00:00Z'));
    // Expected: 2025-03-19 09:30 EDT = 13:30 UTC
    expect(result.toISOString()).toBe('2025-03-19T13:30:00.000Z');
  });

  it('returns today 09:30 ET when called on a weekday at 09:29 ET', () => {
    // 09:29 EDT = 13:29 UTC
    const result = getNextMarketOpen(new Date('2025-03-19T13:29:00Z'));
    expect(result.toISOString()).toBe('2025-03-19T13:30:00.000Z');
  });

  it('returns today 09:30 ET in winter (EST, UTC-5)', () => {
    // Monday 2025-01-20 at 08:00 UTC = 03:00 EST (before market open)
    const result = getNextMarketOpen(new Date('2025-01-20T08:00:00Z'));
    // Expected: 2025-01-20 09:30 EST = 14:30 UTC
    expect(result.toISOString()).toBe('2025-01-20T14:30:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// getNextMarketOpen — during market hours: returns now (immediate execution)
// ---------------------------------------------------------------------------
describe('getNextMarketOpen — market open (execute immediately)', () => {
  it('returns the same instant when market is open', () => {
    // Wednesday 2025-03-19 at 14:00 UTC = 10:00 EDT (market open)
    const now = new Date('2025-03-19T14:00:00Z');
    const result = getNextMarketOpen(now);
    expect(result.toISOString()).toBe(now.toISOString());
  });

  it('returns the same instant at exactly 09:30 ET', () => {
    // 09:30 EDT = 13:30 UTC
    const now = new Date('2025-03-19T13:30:00Z');
    const result = getNextMarketOpen(now);
    expect(result.toISOString()).toBe(now.toISOString());
  });

  it('returns the same instant just before close (15:59 ET)', () => {
    // 15:59 EDT = 19:59 UTC
    const now = new Date('2025-03-19T19:59:00Z');
    const result = getNextMarketOpen(now);
    expect(result.toISOString()).toBe(now.toISOString());
  });
});

// ---------------------------------------------------------------------------
// getNextMarketOpen — after close / weekend: returns next weekday 09:30 ET
// ---------------------------------------------------------------------------
describe('getNextMarketOpen — after close or weekend', () => {
  it('returns next day 09:30 ET when called on a weekday after close', () => {
    // Wednesday 2025-03-19 at 21:00 UTC = 17:00 EDT (after close)
    const result = getNextMarketOpen(new Date('2025-03-19T21:00:00Z'));
    // Expected: Thursday 2025-03-20 09:30 EDT = 13:30 UTC
    expect(result.toISOString()).toBe('2025-03-20T13:30:00.000Z');
  });

  it('returns Monday 09:30 ET when called on Friday after close', () => {
    // Friday 2025-03-21 at 21:00 UTC = 17:00 EDT (after close)
    const result = getNextMarketOpen(new Date('2025-03-21T21:00:00Z'));
    // Expected: Monday 2025-03-24 09:30 EDT = 13:30 UTC
    expect(result.toISOString()).toBe('2025-03-24T13:30:00.000Z');
  });

  it('returns Monday 09:30 ET when called on Saturday', () => {
    const result = getNextMarketOpen(new Date('2025-03-22T12:00:00Z'));
    expect(result.toISOString()).toBe('2025-03-24T13:30:00.000Z');
  });

  it('returns Monday 09:30 ET when called on Sunday', () => {
    const result = getNextMarketOpen(new Date('2025-03-23T12:00:00Z'));
    expect(result.toISOString()).toBe('2025-03-24T13:30:00.000Z');
  });

  it('returns Tuesday 09:30 ET when called on Monday after close', () => {
    // Monday 2025-03-17 at 21:00 UTC = 17:00 EDT (after close)
    const result = getNextMarketOpen(new Date('2025-03-17T21:00:00Z'));
    // Expected: Tuesday 2025-03-18 09:30 EDT = 13:30 UTC
    expect(result.toISOString()).toBe('2025-03-18T13:30:00.000Z');
  });
});

// ---------------------------------------------------------------------------
// getNextMarketOpen — result is always on a weekday
// ---------------------------------------------------------------------------
describe('getNextMarketOpen — invariant: result is always a weekday', () => {
  const cases = [
    '2025-03-17T02:00:00Z', // Monday early
    '2025-03-19T07:00:00Z', // Wednesday before open UTC
    '2025-03-19T14:30:00Z', // Wednesday market open
    '2025-03-21T22:00:00Z', // Friday after close
    '2025-03-22T15:00:00Z', // Saturday
    '2025-03-23T10:00:00Z', // Sunday
  ];

  for (const ts of cases) {
    it(`result is a weekday for input ${ts}`, () => {
      const result = getNextMarketOpen(new Date(ts));
      const utcDay = result.getUTCDay();
      // A weekday in ET: result could be any UTC day 1–5 (Mon–Fri ET), but since
      // 09:30 ET is always 13:30–14:30 UTC we stay well within Mon–Fri UTC.
      expect([1, 2, 3, 4, 5]).toContain(utcDay);
    });
  }
});
