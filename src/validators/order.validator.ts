import { z } from 'zod';
import { AppError } from '../errors/AppError';
import { AppErrorDetails } from '../models/order.model';

const UUID_V4_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const portfolioItemSchema = z.object({
  symbol: z.string().min(1, 'Symbol must be a non-empty string'),
  weight: z.number().positive('Weight must be a positive number'),
  price: z.number().positive('Price must be greater than 0').optional(),
});

export const splitOrderSchema = z
  .object({
    idempotencyKey: z
      .string()
      .regex(UUID_V4_REGEX, 'idempotencyKey must be a valid UUID v4'),
    portfolio: z
      .array(portfolioItemSchema)
      .min(1, 'Portfolio must contain at least one item'),
    amount: z.number().positive('Amount must be a positive number'),
    orderType: z.enum(['BUY', 'SELL'], {
      errorMap: () => ({ message: 'orderType must be "BUY" or "SELL"' }),
    }),
  })
  .superRefine((data, ctx) => {
    const symbols = data.portfolio.map((p) => p.symbol.toUpperCase());
    const seen = new Set<string>();
    for (const sym of symbols) {
      if (seen.has(sym)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Duplicate symbol: ${sym}`,
          path: ['portfolio'],
        });
      }
      seen.add(sym);
    }

    const totalWeight = data.portfolio.reduce((sum, p) => sum + p.weight, 0);
    if (Math.abs(totalWeight - 100) > 0.01) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Portfolio weights must sum to 100 (got ${totalWeight})`,
        path: ['portfolio'],
      });
    }
  });

export type SplitOrderInput = z.infer<typeof splitOrderSchema>;

export function validateSplitOrder(body: unknown): SplitOrderInput {
  const result = splitOrderSchema.safeParse(body);

  if (!result.success) {
    const details: AppErrorDetails[] = result.error.issues.map((issue) => ({
      field: issue.path.join('.'),
      message: issue.message,
    }));

    throw new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', details);
  }

  return result.data;
}

export const orderQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((val) => {
      const n = parseInt(val || '1', 10);
      return isNaN(n) || n < 1 ? 1 : n;
    }),
  limit: z
    .string()
    .optional()
    .transform((val) => {
      const n = parseInt(val || '10', 10);
      return isNaN(n) || n < 1 ? 10 : Math.min(n, 100);
    })
    .pipe(z.number().int().min(1).max(100)),
  orderType: z.enum(['BUY', 'SELL']).optional(),
  symbol: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export type OrderQueryInput = z.infer<typeof orderQuerySchema>;
