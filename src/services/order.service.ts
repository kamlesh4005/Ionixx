import crypto from 'crypto';
import { config } from '../config';
import { orderRepository } from '../repositories/order.repository';
import { getNextMarketOpen } from '../utils/marketHours';
import { retryWithBackoff } from '../utils/retryWithBackoff';
import { acquireIdempotencyLock } from '../utils/idempotencyLock';
import { sanitizePortfolio } from '../utils/sanitize';
import { logger } from '../utils/logger';
import { metrics } from '../utils/metrics';
import {
  PortfolioItem,
  SplitOrderItem,
  OrderRecord,
  OrderResponse,
  OrderType,
  OrderFilterParams,
  PaginatedOrders,
} from '../models/order.model';
import { SplitOrderInput } from '../validators/order.validator';

function simulatePriceFetch(_symbol: string, providedPrice?: number): Promise<number> {
  if (providedPrice !== undefined) {
    return Promise.resolve(providedPrice);
  }
  return Promise.resolve(config.defaultStockPrice);
}

function splitPortfolio(
  portfolio: PortfolioItem[],
  totalAmount: number,
  prices: Map<string, number>,
): SplitOrderItem[] {
  return portfolio.map((item) => {
    const allocatedAmount = (item.weight / 100) * totalAmount;
    const price = prices.get(item.symbol.toUpperCase()) ?? config.defaultStockPrice;
    const quantity = parseFloat((allocatedAmount / price).toFixed(config.sharePrecision));
    const amount = parseFloat((quantity * price).toFixed(2));

    return {
      symbol: item.symbol.toUpperCase(),
      amount,
      price,
      quantity,
    };
  });
}

export async function createSplitOrder(
  input: SplitOrderInput,
  startTime: bigint,
): Promise<{ response: OrderResponse; isReplay: boolean }> {
  const release = await acquireIdempotencyLock(input.idempotencyKey);

  try {
    const cachedResponse = orderRepository.getCachedResponse(input.idempotencyKey);
    if (cachedResponse) {
      const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;
      logger.info('Idempotency replay', {
        idempotencyKey: input.idempotencyKey,
        orderId: cachedResponse.orderId,
      });
      metrics.increment('idempotentReplays');
      return {
        response: { ...cachedResponse, meta: { ...cachedResponse.meta, responseTimeMs: Math.round(elapsed) } },
        isReplay: true,
      };
    }

    const sanitizedPortfolio = sanitizePortfolio(input.portfolio);

    const prices = new Map<string, number>();
    for (const item of sanitizedPortfolio) {
      const price = await retryWithBackoff(
        () => simulatePriceFetch(item.symbol, item.price),
        config.retry.maxRetries,
        config.retry.baseDelayMs,
        config.retry.factor,
      );
      prices.set(item.symbol.toUpperCase(), price);
    }

    const orders = splitPortfolio(sanitizedPortfolio, input.amount, prices);
    const executionTime = getNextMarketOpen();
    const orderId = crypto.randomUUID();
    const now = new Date().toISOString();

    const elapsed = Number(process.hrtime.bigint() - startTime) / 1e6;

    const orderRecord: OrderRecord = {
      orderId,
      idempotencyKey: input.idempotencyKey,
      orderType: input.orderType as OrderType,
      totalAmount: input.amount,
      executionTime: executionTime.toISOString(),
      orders,
      createdAt: now,
    };

    const response: OrderResponse = {
      orderId,
      idempotencyKey: input.idempotencyKey,
      orderType: input.orderType as OrderType,
      totalAmount: input.amount,
      executionTime: executionTime.toISOString(),
      orders,
      meta: {
        responseTimeMs: Math.round(elapsed),
        sharePrecision: config.sharePrecision,
      },
    };

    orderRepository.save(orderRecord, response);
    metrics.increment('totalOrdersCreated');

    logger.info('Order created', {
      orderId,
      idempotencyKey: input.idempotencyKey,
      orderType: input.orderType,
      totalAmount: input.amount,
      executionTime: executionTime.toISOString(),
    });

    return { response, isReplay: false };
  } finally {
    release();
  }
}

export function getOrders(params: OrderFilterParams): PaginatedOrders {
  return orderRepository.findAll(params);
}
