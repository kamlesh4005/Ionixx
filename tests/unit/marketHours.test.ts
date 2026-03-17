import { getNextMarketOpen } from '../../src/utils/marketHours';

describe('getNextMarketOpen', () => {
  it('returns today 09:30 UTC when called on a weekday before market open', () => {
    // Wednesday 2025-03-19 at 07:00 UTC
    const wednesday7am = new Date('2025-03-19T07:00:00Z');
    const result = getNextMarketOpen(wednesday7am);
    expect(result.toISOString()).toBe('2025-03-19T09:30:00.000Z');
  });

  it('returns next weekday 09:30 UTC when called on a weekday at market open', () => {
    // Wednesday 2025-03-19 at 09:30 UTC (exactly at open)
    const wednesdayAtOpen = new Date('2025-03-19T09:30:00Z');
    const result = getNextMarketOpen(wednesdayAtOpen);
    expect(result.toISOString()).toBe('2025-03-20T09:30:00.000Z');
  });

  it('returns next weekday 09:30 UTC when called on a weekday after market open', () => {
    // Wednesday 2025-03-19 at 14:00 UTC
    const wednesdayAfternoon = new Date('2025-03-19T14:00:00Z');
    const result = getNextMarketOpen(wednesdayAfternoon);
    expect(result.toISOString()).toBe('2025-03-20T09:30:00.000Z');
  });

  it('returns Monday 09:30 UTC when called on Saturday', () => {
    const saturday = new Date('2025-03-22T12:00:00Z');
    const result = getNextMarketOpen(saturday);
    expect(result.toISOString()).toBe('2025-03-24T09:30:00.000Z');
  });

  it('returns Monday 09:30 UTC when called on Sunday', () => {
    const sunday = new Date('2025-03-23T12:00:00Z');
    const result = getNextMarketOpen(sunday);
    expect(result.toISOString()).toBe('2025-03-24T09:30:00.000Z');
  });

  it('returns Monday when called on Friday after market open', () => {
    // Friday 2025-03-21 at 15:00 UTC
    const fridayAfternoon = new Date('2025-03-21T15:00:00Z');
    const result = getNextMarketOpen(fridayAfternoon);
    expect(result.toISOString()).toBe('2025-03-24T09:30:00.000Z');
  });

  it('returns today when called on Monday before market open', () => {
    const mondayEarly = new Date('2025-03-17T05:00:00Z');
    const result = getNextMarketOpen(mondayEarly);
    expect(result.toISOString()).toBe('2025-03-17T09:30:00.000Z');
  });

  it('returns Tuesday when called on Monday after market open', () => {
    const mondayAfternoon = new Date('2025-03-17T12:00:00Z');
    const result = getNextMarketOpen(mondayAfternoon);
    expect(result.toISOString()).toBe('2025-03-18T09:30:00.000Z');
  });
});
