import { OrderRecord, OrderFilterParams, PaginatedOrders, OrderResponse } from '../models/order.model';

class OrderRepository {
  private ordersById = new Map<string, OrderRecord>();
  private ordersByIdempotencyKey = new Map<string, OrderRecord>();
  private idempotencyResponseCache = new Map<string, OrderResponse>();
  private ordersInInsertionOrder: OrderRecord[] = [];

  save(order: OrderRecord, response: OrderResponse): void {
    this.ordersById.set(order.orderId, order);
    this.ordersByIdempotencyKey.set(order.idempotencyKey, order);
    this.idempotencyResponseCache.set(order.idempotencyKey, response);
    this.ordersInInsertionOrder.push(order);
  }

  findById(orderId: string): OrderRecord | undefined {
    return this.ordersById.get(orderId);
  }

  findByIdempotencyKey(key: string): OrderRecord | undefined {
    return this.ordersByIdempotencyKey.get(key);
  }

  getCachedResponse(idempotencyKey: string): OrderResponse | undefined {
    return this.idempotencyResponseCache.get(idempotencyKey);
  }

  findAll(params: OrderFilterParams): PaginatedOrders {
    let filtered = this.ordersInInsertionOrder;

    if (params.orderType) {
      filtered = filtered.filter((o) => o.orderType === params.orderType);
    }

    if (params.symbol) {
      const sym = params.symbol.toUpperCase();
      filtered = filtered.filter((o) => o.orders.some((item) => item.symbol === sym));
    }

    if (params.from) {
      const fromDate = new Date(params.from).getTime();
      filtered = filtered.filter((o) => new Date(o.createdAt).getTime() >= fromDate);
    }

    if (params.to) {
      const toDate = new Date(params.to).getTime();
      filtered = filtered.filter((o) => new Date(o.createdAt).getTime() <= toDate);
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / params.limit) || 1;
    const start = (params.page - 1) * params.limit;
    const data = filtered.slice(start, start + params.limit);

    return {
      data,
      total,
      page: params.page,
      limit: params.limit,
      totalPages,
    };
  }

  clear(): void {
    this.ordersById.clear();
    this.ordersByIdempotencyKey.clear();
    this.idempotencyResponseCache.clear();
    this.ordersInInsertionOrder = [];
  }
}

export const orderRepository = new OrderRepository();
