import { retryWithBackoff } from '../../src/utils/retryWithBackoff';

describe('retryWithBackoff', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns immediately on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await retryWithBackoff(fn, 3, 100);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('retries on failure and succeeds', async () => {
    const fn = jest
      .fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('ok');

    const promise = retryWithBackoff(fn, 3, 10, 2);

    // Advance through all timers
    for (let i = 0; i < 5; i++) {
      await Promise.resolve();
      jest.advanceTimersByTime(1000);
    }

    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting all retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fails'));

    const promise = retryWithBackoff(fn, 2, 10, 2);

    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      jest.advanceTimersByTime(1000);
    }

    await expect(promise).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('handles non-Error thrown values', async () => {
    const fn = jest.fn().mockRejectedValue('string error');

    const promise = retryWithBackoff(fn, 0, 10);

    await expect(promise).rejects.toThrow('string error');
  });
});
