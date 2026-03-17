type MetricKey =
  | 'totalOrdersCreated'
  | 'totalErrors'
  | 'idempotentReplays'
  | 'rateLimitBreaches';

class MetricsStore {
  private counters = new Map<MetricKey, number>();

  increment(key: MetricKey, amount: number = 1): void {
    this.counters.set(key, (this.counters.get(key) ?? 0) + amount);
  }

  get(key: MetricKey): number {
    return this.counters.get(key) ?? 0;
  }

  getAll(): Record<MetricKey, number> {
    return {
      totalOrdersCreated: this.get('totalOrdersCreated'),
      totalErrors: this.get('totalErrors'),
      idempotentReplays: this.get('idempotentReplays'),
      rateLimitBreaches: this.get('rateLimitBreaches'),
    };
  }

  reset(): void {
    this.counters.clear();
  }
}

export const metrics = new MetricsStore();
