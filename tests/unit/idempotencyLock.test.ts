import { acquireIdempotencyLock, clearIdempotencyLocks } from '../../src/utils/idempotencyLock';

describe('idempotencyLock', () => {
  afterEach(() => {
    clearIdempotencyLocks();
  });

  it('allows a single caller to acquire and release a lock', async () => {
    const release = await acquireIdempotencyLock('key1');
    expect(typeof release).toBe('function');
    release();
  });

  it('serializes concurrent requests for the same key', async () => {
    const executionOrder: number[] = [];

    const task1 = async () => {
      const release = await acquireIdempotencyLock('key1');
      executionOrder.push(1);
      await new Promise<void>((r) => setTimeout(r, 50));
      executionOrder.push(2);
      release();
    };

    const task2 = async () => {
      const release = await acquireIdempotencyLock('key1');
      executionOrder.push(3);
      release();
    };

    await Promise.all([task1(), task2()]);

    expect(executionOrder).toEqual([1, 2, 3]);
  });

  it('allows parallel execution for different keys', async () => {
    const executionOrder: string[] = [];

    const task1 = async () => {
      const release = await acquireIdempotencyLock('keyA');
      executionOrder.push('A-start');
      await new Promise<void>((r) => setTimeout(r, 10));
      executionOrder.push('A-end');
      release();
    };

    const task2 = async () => {
      const release = await acquireIdempotencyLock('keyB');
      executionOrder.push('B-start');
      await new Promise<void>((r) => setTimeout(r, 10));
      executionOrder.push('B-end');
      release();
    };

    await Promise.all([task1(), task2()]);

    expect(executionOrder).toContain('A-start');
    expect(executionOrder).toContain('B-start');
    expect(executionOrder.indexOf('A-start')).toBeLessThan(executionOrder.indexOf('A-end'));
    expect(executionOrder.indexOf('B-start')).toBeLessThan(executionOrder.indexOf('B-end'));
  });
});
