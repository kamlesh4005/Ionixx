import { createSplitOrder, getOrders } from '../../src/services/order.service';
import { orderRepository } from '../../src/repositories/order.repository';
import { clearIdempotencyLocks } from '../../src/utils/idempotencyLock';
import { SplitOrderInput } from '../../src/validators/order.validator';
import { validateSplitOrder } from '../../src/validators/order.validator';
import { AppError } from '../../src/errors/AppError';
import crypto from 'crypto';

const uuidv4 = () => crypto.randomUUID();

describe('Order Service', () => {
  beforeEach(() => {
    orderRepository.clear();
    clearIdempotencyLocks();
  });

  function makeInput(overrides?: Partial<SplitOrderInput>): SplitOrderInput {
    return {
      idempotencyKey: uuidv4(),
      portfolio: [
        { symbol: 'AAPL', weight: 60, price: 150 },
        { symbol: 'TSLA', weight: 40 },
      ],
      amount: 100,
      orderType: 'BUY',
      ...overrides,
    };
  }

  describe('createSplitOrder', () => {
    it('splits portfolio correctly by weight and calculates quantities', async () => {
      const input = makeInput();
      const startTime = process.hrtime.bigint();
      const { response, isReplay } = await createSplitOrder(input, startTime);

      expect(isReplay).toBe(false);
      expect(response.orderId).toBeDefined();
      expect(response.orderType).toBe('BUY');
      expect(response.totalAmount).toBe(100);
      expect(response.orders).toHaveLength(2);

      const aapl = response.orders.find((o) => o.symbol === 'AAPL')!;
      expect(aapl.amount).toBe(60);
      expect(aapl.price).toBe(150);
      expect(aapl.quantity).toBe(0.4);

      const tsla = response.orders.find((o) => o.symbol === 'TSLA')!;
      expect(tsla.amount).toBe(40);
      expect(tsla.price).toBe(100); // default price
      expect(tsla.quantity).toBe(0.4);
    });

    it('supports SELL order type', async () => {
      const input = makeInput({ orderType: 'SELL' });
      const startTime = process.hrtime.bigint();
      const { response } = await createSplitOrder(input, startTime);
      expect(response.orderType).toBe('SELL');
    });

    it('uses share precision of 3 decimal places', async () => {
      const input = makeInput({
        portfolio: [
          { symbol: 'AAPL', weight: 33.33 },
          { symbol: 'TSLA', weight: 33.33 },
          { symbol: 'GOOG', weight: 33.34 },
        ],
        amount: 1000,
      });
      const startTime = process.hrtime.bigint();
      const { response } = await createSplitOrder(input, startTime);

      for (const order of response.orders) {
        const decimalPlaces = (order.quantity.toString().split('.')[1] || '').length;
        expect(decimalPlaces).toBeLessThanOrEqual(3);
      }
    });

    it('returns idempotent response for duplicate key', async () => {
      const input = makeInput();
      const startTime1 = process.hrtime.bigint();
      const { response: first, isReplay: replay1 } = await createSplitOrder(input, startTime1);

      const startTime2 = process.hrtime.bigint();
      const { response: second, isReplay: replay2 } = await createSplitOrder(input, startTime2);

      expect(replay1).toBe(false);
      expect(replay2).toBe(true);
      expect(first.orderId).toBe(second.orderId);
      expect(first.orders).toEqual(second.orders);
    });

    it('does not create two orders for concurrent requests with same idempotency key', async () => {
      const idempotencyKey = uuidv4();
      const input = makeInput({ idempotencyKey });
      const startTime = process.hrtime.bigint();

      const results = await Promise.all([
        createSplitOrder(input, startTime),
        createSplitOrder(input, startTime),
      ]);

      const orderIds = new Set(results.map((r) => r.response.orderId));
      expect(orderIds.size).toBe(1);

      const replays = results.filter((r) => r.isReplay);
      expect(replays.length).toBe(1);
    });

    it('includes meta with responseTimeMs and sharePrecision', async () => {
      const input = makeInput();
      const startTime = process.hrtime.bigint();
      const { response } = await createSplitOrder(input, startTime);

      expect(response.meta).toBeDefined();
      expect(typeof response.meta.responseTimeMs).toBe('number');
      expect(response.meta.sharePrecision).toBe(3);
    });

    it('sets executionTime to a valid market time in ET', async () => {
      const input = makeInput();
      const startTime = process.hrtime.bigint();
      const { response } = await createSplitOrder(input, startTime);

      const execDate = new Date(response.executionTime);
      expect(isNaN(execDate.getTime())).toBe(false);

      // Inspect the execution time in America/New_York
      const fmt = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const parts = fmt.formatToParts(execDate);
      const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';

      // Always a trading day
      expect(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']).toContain(get('weekday'));

      const etHour = parseInt(get('hour'));
      const etMin = parseInt(get('minute'));
      const isAtOpen = etHour === 9 && etMin === 30;
      const isNow = Math.abs(execDate.getTime() - Date.now()) < 5000;
      // Either scheduled at today's open (09:30 ET) or executed immediately (market open)
      expect(isAtOpen || isNow).toBe(true);
    });

    it('amount equals quantity × price for financial accuracy', async () => {
      // weight=100, price=300, amount=1000:
      //   allocatedAmount = 1000, quantity = 1000/300 = 3.333 (3dp)
      //   actual cost = 3.333 × 300 = 999.90  (not 1000.00)
      const input = makeInput({
        portfolio: [{ symbol: 'AAPL', weight: 100, price: 300 }],
        amount: 1000,
      });
      const { response } = await createSplitOrder(input, process.hrtime.bigint());

      const order = response.orders[0];
      expect(order.quantity).toBe(3.333);
      // amount must reflect what is actually paid, not the pre-rounding allocation
      expect(order.amount).toBe(parseFloat((order.quantity * order.price).toFixed(2)));
      expect(order.amount).toBe(999.9); // 3.333 × 300 = 999.90
    });

    it('uses custom price when provided', async () => {
      const input = makeInput({
        portfolio: [
          { symbol: 'AAPL', weight: 100, price: 200 },
        ],
        amount: 1000,
      });
      const startTime = process.hrtime.bigint();
      const { response } = await createSplitOrder(input, startTime);

      expect(response.orders[0].price).toBe(200);
      expect(response.orders[0].quantity).toBe(5);
    });
  });

  describe('getOrders', () => {
    it('returns paginated results', async () => {
      for (let i = 0; i < 15; i++) {
        const input = makeInput();
        await createSplitOrder(input, process.hrtime.bigint());
      }

      const page1 = getOrders({ page: 1, limit: 10 });
      expect(page1.data.length).toBe(10);
      expect(page1.total).toBe(15);
      expect(page1.totalPages).toBe(2);

      const page2 = getOrders({ page: 2, limit: 10 });
      expect(page2.data.length).toBe(5);
    });

    it('filters by orderType', async () => {
      await createSplitOrder(makeInput({ orderType: 'BUY' }), process.hrtime.bigint());
      await createSplitOrder(makeInput({ orderType: 'SELL' }), process.hrtime.bigint());

      const buys = getOrders({ page: 1, limit: 10, orderType: 'BUY' });
      expect(buys.data.length).toBe(1);
      expect(buys.data[0].orderType).toBe('BUY');
    });

    it('filters by symbol', async () => {
      await createSplitOrder(
        makeInput({
          portfolio: [{ symbol: 'AAPL', weight: 100, price: 150 }],
        }),
        process.hrtime.bigint(),
      );
      await createSplitOrder(
        makeInput({
          portfolio: [{ symbol: 'GOOG', weight: 100, price: 200 }],
        }),
        process.hrtime.bigint(),
      );

      const result = getOrders({ page: 1, limit: 10, symbol: 'AAPL' });
      expect(result.data.length).toBe(1);
    });
  });
});

describe('Order Validation', () => {
  it('rejects empty portfolio', () => {
    expect(() =>
      validateSplitOrder({
        idempotencyKey: uuidv4(),
        portfolio: [],
        amount: 100,
        orderType: 'BUY',
      }),
    ).toThrow(AppError);
  });

  it('rejects weights not summing to 100', () => {
    expect(() =>
      validateSplitOrder({
        idempotencyKey: uuidv4(),
        portfolio: [
          { symbol: 'AAPL', weight: 50 },
          { symbol: 'TSLA', weight: 30 },
        ],
        amount: 100,
        orderType: 'BUY',
      }),
    ).toThrow(AppError);
  });

  it('allows weights summing to 100 within float tolerance', () => {
    expect(() =>
      validateSplitOrder({
        idempotencyKey: uuidv4(),
        portfolio: [
          { symbol: 'AAPL', weight: 33.33 },
          { symbol: 'TSLA', weight: 33.33 },
          { symbol: 'GOOG', weight: 33.34 },
        ],
        amount: 100,
        orderType: 'BUY',
      }),
    ).not.toThrow();
  });

  it('rejects negative amount', () => {
    expect(() =>
      validateSplitOrder({
        idempotencyKey: uuidv4(),
        portfolio: [{ symbol: 'AAPL', weight: 100 }],
        amount: -10,
        orderType: 'BUY',
      }),
    ).toThrow(AppError);
  });

  it('rejects zero amount', () => {
    expect(() =>
      validateSplitOrder({
        idempotencyKey: uuidv4(),
        portfolio: [{ symbol: 'AAPL', weight: 100 }],
        amount: 0,
        orderType: 'BUY',
      }),
    ).toThrow(AppError);
  });

  it('rejects invalid orderType', () => {
    expect(() =>
      validateSplitOrder({
        idempotencyKey: uuidv4(),
        portfolio: [{ symbol: 'AAPL', weight: 100 }],
        amount: 100,
        orderType: 'HOLD',
      }),
    ).toThrow(AppError);
  });

  it('rejects duplicate symbols', () => {
    expect(() =>
      validateSplitOrder({
        idempotencyKey: uuidv4(),
        portfolio: [
          { symbol: 'AAPL', weight: 50 },
          { symbol: 'AAPL', weight: 50 },
        ],
        amount: 100,
        orderType: 'BUY',
      }),
    ).toThrow(AppError);
  });

  it('rejects price = 0', () => {
    expect(() =>
      validateSplitOrder({
        idempotencyKey: uuidv4(),
        portfolio: [{ symbol: 'AAPL', weight: 100, price: 0 }],
        amount: 100,
        orderType: 'BUY',
      }),
    ).toThrow(AppError);
  });

  it('rejects negative price', () => {
    expect(() =>
      validateSplitOrder({
        idempotencyKey: uuidv4(),
        portfolio: [{ symbol: 'AAPL', weight: 100, price: -50 }],
        amount: 100,
        orderType: 'BUY',
      }),
    ).toThrow(AppError);
  });

  it('rejects weight = 0', () => {
    expect(() =>
      validateSplitOrder({
        idempotencyKey: uuidv4(),
        portfolio: [
          { symbol: 'AAPL', weight: 0 },
          { symbol: 'TSLA', weight: 100 },
        ],
        amount: 100,
        orderType: 'BUY',
      }),
    ).toThrow(AppError);
  });

  it('rejects missing idempotencyKey', () => {
    expect(() =>
      validateSplitOrder({
        portfolio: [{ symbol: 'AAPL', weight: 100 }],
        amount: 100,
        orderType: 'BUY',
      }),
    ).toThrow(AppError);
  });

  it('rejects invalid UUID format for idempotencyKey', () => {
    expect(() =>
      validateSplitOrder({
        idempotencyKey: 'not-a-uuid',
        portfolio: [{ symbol: 'AAPL', weight: 100 }],
        amount: 100,
        orderType: 'BUY',
      }),
    ).toThrow(AppError);
  });

  it('returns structured error details listing all failed fields', () => {
    try {
      validateSplitOrder({
        idempotencyKey: 'not-uuid',
        portfolio: [],
        amount: -1,
        orderType: 'INVALID',
      });
      fail('Should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      const appError = error as AppError;
      expect(appError.statusCode).toBe(400);
      expect(appError.code).toBe('VALIDATION_ERROR');
      expect(appError.details).toBeDefined();
      expect(appError.details!.length).toBeGreaterThan(1);
    }
  });
});
