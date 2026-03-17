import { Request, Response, NextFunction } from 'express';
import { createSplitOrder, getOrders } from '../services/order.service';
import { validateSplitOrder, orderQuerySchema } from '../validators/order.validator';
import { OrderFilterParams } from '../models/order.model';
import { metrics } from '../utils/metrics';

export async function splitOrder(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const input = validateSplitOrder(req.body);
    const { response, isReplay } = await createSplitOrder(input, req.startTime);

    if (isReplay) {
      res.setHeader('X-Idempotent-Replayed', 'true');
      res.status(200).json(response);
      return;
    }

    res.status(201).json(response);
  } catch (error) {
    next(error);
  }
}

export function listOrders(req: Request, res: Response, next: NextFunction): void {
  try {
    const parsed = orderQuerySchema.parse(req.query);

    const params: OrderFilterParams = {
      page: parsed.page,
      limit: parsed.limit,
      orderType: parsed.orderType,
      symbol: parsed.symbol,
      from: parsed.from,
      to: parsed.to,
    };

    const result = getOrders(params);
    res.status(200).json(result);
  } catch (error) {
    next(error);
  }
}

export function healthCheck(_req: Request, res: Response): void {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    components: {
      memoryStore: { status: 'ok' },
    },
  });
}

export function getMetrics(_req: Request, res: Response): void {
  res.status(200).json(metrics.getAll());
}
