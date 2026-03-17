import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

export function responseTimeMiddleware(req: Request, res: Response, next: NextFunction): void {
  req.startTime = process.hrtime.bigint();

  res.on('finish', () => {
    const elapsed = Number(process.hrtime.bigint() - req.startTime) / 1e6;
    logger.info(`${req.method} ${req.originalUrl} → ${res.statusCode} in ${Math.round(elapsed)}ms`, {
      requestId: req.requestId,
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      responseTimeMs: Math.round(elapsed),
    });
  });

  next();
}
