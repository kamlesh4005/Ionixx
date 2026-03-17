export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  apiVersion: 'v1',
  corsOrigin: process.env.CORS_ORIGIN || false as string | false,

  defaultStockPrice: 100,
  sharePrecision: 3,

  marketOpenHourUTC: 9,
  marketOpenMinuteUTC: 30,

  requestTimeoutMs: 5000,

  rateLimit: {
    windowMs: 60 * 1000,
    maxRequests: 100,
  },

  retry: {
    maxRetries: 3,
    baseDelayMs: 100,
    factor: 2,
  },

  gracefulShutdownTimeoutMs: 10_000,
} as const;

export type Config = typeof config;
