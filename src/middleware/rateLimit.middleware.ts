import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { logger } from '../utils/logger';
import { metrics } from '../utils/metrics';

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, TokenBucket>();

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): void {
  const ip = getClientIp(req);
  const now = Date.now();
  const { windowMs, maxRequests } = config.rateLimit;

  let bucket = buckets.get(ip);

  if (!bucket) {
    bucket = { tokens: maxRequests, lastRefill: now };
    buckets.set(ip, bucket);
  }

  const elapsed = now - bucket.lastRefill;
  const refillRate = maxRequests / windowMs;
  bucket.tokens = Math.min(maxRequests, bucket.tokens + elapsed * refillRate);
  bucket.lastRefill = now;

  const resetTime = Math.ceil(now / 1000) + Math.ceil(windowMs / 1000);

  res.setHeader('X-RateLimit-Limit', maxRequests.toString());
  res.setHeader('X-RateLimit-Remaining', Math.max(0, Math.floor(bucket.tokens) - 1).toString());
  res.setHeader('X-RateLimit-Reset', resetTime.toString());

  if (bucket.tokens < 1) {
    metrics.increment('rateLimitBreaches');
    logger.warn('Rate limit exceeded', { requestId: req.requestId, ip });
    res.status(429).json({
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: `Too many requests. Limit: ${maxRequests} per ${windowMs / 1000}s.`,
      },
    });
    return;
  }

  bucket.tokens -= 1;
  next();
}

export function clearRateLimitBuckets(): void {
  buckets.clear();
}
