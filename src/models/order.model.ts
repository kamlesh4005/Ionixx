export type OrderType = 'BUY' | 'SELL';

export interface PortfolioItem {
  symbol: string;
  weight: number;
  price?: number;
}

export interface SplitOrderItem {
  symbol: string;
  amount: number;
  price: number;
  quantity: number;
}

export interface OrderRecord {
  orderId: string;
  idempotencyKey: string;
  orderType: OrderType;
  totalAmount: number;
  executionTime: string;
  orders: SplitOrderItem[];
  createdAt: string;
}

export interface OrderResponse {
  orderId: string;
  idempotencyKey: string;
  orderType: OrderType;
  totalAmount: number;
  executionTime: string;
  orders: SplitOrderItem[];
  meta: {
    responseTimeMs: number;
    sharePrecision: number;
  };
}

export interface PaginatedOrders {
  data: OrderRecord[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface OrderFilterParams {
  page: number;
  limit: number;
  orderType?: OrderType;
  symbol?: string;
  from?: string;
  to?: string;
}

export interface AppErrorDetails {
  field?: string;
  message: string;
}

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: AppErrorDetails[];
  };
}
