/**
 * In-memory lock map to prevent race conditions on concurrent requests
 * sharing the same idempotency key. The first request creates a promise
 * that subsequent requests await before returning the cached result.
 */
const lockMap = new Map<string, Promise<void>>();

export async function acquireIdempotencyLock(key: string): Promise<() => void> {
  while (lockMap.has(key)) {
    await lockMap.get(key);
  }

  let releaseFn!: () => void;
  const lockPromise = new Promise<void>((resolve) => {
    releaseFn = resolve;
  });

  lockMap.set(key, lockPromise);

  return () => {
    lockMap.delete(key);
    releaseFn();
  };
}

export function clearIdempotencyLocks(): void {
  lockMap.clear();
}
