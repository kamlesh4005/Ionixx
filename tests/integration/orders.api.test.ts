import request from 'supertest';
import { app } from '../../src/app';
import { orderRepository } from '../../src/repositories/order.repository';
import { clearIdempotencyLocks } from '../../src/utils/idempotencyLock';
import { clearRateLimitBuckets } from '../../src/middleware/rateLimit.middleware';
import { metrics } from '../../src/utils/metrics';
import crypto from 'crypto';

const uuidv4 = () => crypto.randomUUID();

describe('Orders API Integration Tests', () => {
  beforeEach(() => {
    orderRepository.clear();
    clearIdempotencyLocks();
    clearRateLimitBuckets();
    metrics.reset();
  });

  describe('POST /api/v1/orders/split', () => {
    const validPayload = () => ({
      idempotencyKey: uuidv4(),
      portfolio: [
        { symbol: 'AAPL', weight: 60, price: 150 },
        { symbol: 'TSLA', weight: 40 },
      ],
      amount: 100,
      orderType: 'BUY' as const,
    });

    it('returns 201 with split order on happy path', async () => {
      const payload = validPayload();
      const res = await request(app).post('/api/v1/orders/split').send(payload).expect(201);

      expect(res.body.orderId).toBeDefined();
      expect(res.body.idempotencyKey).toBe(payload.idempotencyKey);
      expect(res.body.orderType).toBe('BUY');
      expect(res.body.totalAmount).toBe(100);
      expect(res.body.executionTime).toBeDefined();
      expect(res.body.orders).toHaveLength(2);
      expect(res.body.meta.sharePrecision).toBe(3);
      expect(typeof res.body.meta.responseTimeMs).toBe('number');

      const aapl = res.body.orders.find((o: { symbol: string }) => o.symbol === 'AAPL');
      expect(aapl.amount).toBe(60);
      expect(aapl.price).toBe(150);
      expect(aapl.quantity).toBe(0.4);

      const tsla = res.body.orders.find((o: { symbol: string }) => o.symbol === 'TSLA');
      expect(tsla.amount).toBe(40);
      expect(tsla.price).toBe(100);
      expect(tsla.quantity).toBe(0.4);
    });

    it('returns 200 with X-Idempotent-Replayed header for duplicate key', async () => {
      const payload = validPayload();

      const res1 = await request(app).post('/api/v1/orders/split').send(payload).expect(201);

      const res2 = await request(app).post('/api/v1/orders/split').send(payload).expect(200);

      expect(res2.headers['x-idempotent-replayed']).toBe('true');
      expect(res2.body.orderId).toBe(res1.body.orderId);
    });

    it('returns 400 with structured validation errors for invalid input', async () => {
      const res = await request(app)
        .post('/api/v1/orders/split')
        .send({
          idempotencyKey: 'not-a-uuid',
          portfolio: [],
          amount: -10,
          orderType: 'INVALID',
        })
        .expect(400);

      expect(res.body.error).toBeDefined();
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(res.body.error.details).toBeDefined();
      expect(res.body.error.details.length).toBeGreaterThan(0);
    });

    it('returns 400 when weights do not sum to 100', async () => {
      const res = await request(app)
        .post('/api/v1/orders/split')
        .send({
          idempotencyKey: uuidv4(),
          portfolio: [
            { symbol: 'AAPL', weight: 50 },
            { symbol: 'TSLA', weight: 30 },
          ],
          amount: 100,
          orderType: 'BUY',
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for duplicate symbols', async () => {
      const res = await request(app)
        .post('/api/v1/orders/split')
        .send({
          idempotencyKey: uuidv4(),
          portfolio: [
            { symbol: 'AAPL', weight: 50 },
            { symbol: 'AAPL', weight: 50 },
          ],
          amount: 100,
          orderType: 'BUY',
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('returns 400 for price = 0', async () => {
      const res = await request(app)
        .post('/api/v1/orders/split')
        .send({
          idempotencyKey: uuidv4(),
          portfolio: [{ symbol: 'AAPL', weight: 100, price: 0 }],
          amount: 100,
          orderType: 'BUY',
        })
        .expect(400);

      expect(res.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('supports SELL order type', async () => {
      const payload = { ...validPayload(), orderType: 'SELL' };
      const res = await request(app).post('/api/v1/orders/split').send(payload).expect(201);
      expect(res.body.orderType).toBe('SELL');
    });
  });

  describe('GET /api/v1/orders', () => {
    it('returns paginated empty list initially', async () => {
      const res = await request(app).get('/api/v1/orders').expect(200);

      expect(res.body.data).toEqual([]);
      expect(res.body.total).toBe(0);
      expect(res.body.page).toBe(1);
    });

    it('returns orders after creation', async () => {
      await request(app)
        .post('/api/v1/orders/split')
        .send({
          idempotencyKey: uuidv4(),
          portfolio: [{ symbol: 'AAPL', weight: 100, price: 150 }],
          amount: 100,
          orderType: 'BUY',
        })
        .expect(201);

      const res = await request(app).get('/api/v1/orders').expect(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.total).toBe(1);
    });

    it('supports pagination', async () => {
      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/api/v1/orders/split')
          .send({
            idempotencyKey: uuidv4(),
            portfolio: [{ symbol: 'AAPL', weight: 100, price: 150 }],
            amount: 100,
            orderType: 'BUY',
          });
      }

      const res = await request(app).get('/api/v1/orders?page=1&limit=2').expect(200);
      expect(res.body.data.length).toBe(2);
      expect(res.body.total).toBe(5);
      expect(res.body.totalPages).toBe(3);
    });

    it('filters by orderType', async () => {
      await request(app)
        .post('/api/v1/orders/split')
        .send({
          idempotencyKey: uuidv4(),
          portfolio: [{ symbol: 'AAPL', weight: 100, price: 150 }],
          amount: 100,
          orderType: 'BUY',
        });

      await request(app)
        .post('/api/v1/orders/split')
        .send({
          idempotencyKey: uuidv4(),
          portfolio: [{ symbol: 'AAPL', weight: 100, price: 150 }],
          amount: 100,
          orderType: 'SELL',
        });

      const res = await request(app).get('/api/v1/orders?orderType=SELL').expect(200);
      expect(res.body.data.length).toBe(1);
      expect(res.body.data[0].orderType).toBe('SELL');
    });

    it('filters by symbol', async () => {
      await request(app)
        .post('/api/v1/orders/split')
        .send({
          idempotencyKey: uuidv4(),
          portfolio: [{ symbol: 'AAPL', weight: 100, price: 150 }],
          amount: 100,
          orderType: 'BUY',
        });

      await request(app)
        .post('/api/v1/orders/split')
        .send({
          idempotencyKey: uuidv4(),
          portfolio: [{ symbol: 'GOOG', weight: 100, price: 200 }],
          amount: 100,
          orderType: 'BUY',
        });

      const res = await request(app).get('/api/v1/orders?symbol=GOOG').expect(200);
      expect(res.body.data.length).toBe(1);
    });
  });

  describe('GET /api/v1/health', () => {
    it('returns health status with component info', async () => {
      const res = await request(app).get('/api/v1/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
      expect(typeof res.body.uptime).toBe('number');
      expect(res.body.components.memoryStore.status).toBe('ok');
    });
  });

  describe('GET /api/v1/metrics', () => {
    it('returns zeroed metrics initially', async () => {
      const res = await request(app).get('/api/v1/metrics').expect(200);
      expect(res.body.totalOrdersCreated).toBe(0);
      expect(res.body.totalErrors).toBe(0);
      expect(res.body.idempotentReplays).toBe(0);
      expect(res.body.rateLimitBreaches).toBe(0);
    });

    it('increments totalOrdersCreated after order creation', async () => {
      await request(app)
        .post('/api/v1/orders/split')
        .send({
          idempotencyKey: uuidv4(),
          portfolio: [{ symbol: 'AAPL', weight: 100, price: 150 }],
          amount: 100,
          orderType: 'BUY',
        })
        .expect(201);

      const res = await request(app).get('/api/v1/metrics').expect(200);
      expect(res.body.totalOrdersCreated).toBe(1);
    });

    it('increments idempotentReplays on duplicate key', async () => {
      const key = uuidv4();
      await request(app)
        .post('/api/v1/orders/split')
        .send({
          idempotencyKey: key,
          portfolio: [{ symbol: 'AAPL', weight: 100, price: 150 }],
          amount: 100,
          orderType: 'BUY',
        })
        .expect(201);

      await request(app)
        .post('/api/v1/orders/split')
        .send({
          idempotencyKey: key,
          portfolio: [{ symbol: 'AAPL', weight: 100, price: 150 }],
          amount: 100,
          orderType: 'BUY',
        })
        .expect(200);

      const res = await request(app).get('/api/v1/metrics').expect(200);
      expect(res.body.idempotentReplays).toBe(1);
    });
  });

  describe('Rate Limiting', () => {
    it('returns 429 when rate limit exceeded', async () => {
      const promises = [];
      for (let i = 0; i < 105; i++) {
        promises.push(request(app).get('/api/v1/health'));
      }

      const results = await Promise.all(promises);
      const rateLimited = results.filter((r) => r.status === 429);
      expect(rateLimited.length).toBeGreaterThan(0);

      const limitedRes = rateLimited[0];
      expect(limitedRes.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('includes rate limit headers in responses', async () => {
      const res = await request(app).get('/api/v1/health').expect(200);
      expect(res.headers['x-ratelimit-limit']).toBeDefined();
      expect(res.headers['x-ratelimit-remaining']).toBeDefined();
      expect(res.headers['x-ratelimit-reset']).toBeDefined();
    });
  });

  describe('Security Headers', () => {
    it('includes security headers from helmet', async () => {
      const res = await request(app).get('/api/v1/health').expect(200);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBeDefined();
    });
  });
});
