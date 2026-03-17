import { Request, Response, NextFunction } from 'express';
import { config } from '../config';

export function timeoutMiddleware(_req: Request, res: Response, next: NextFunction): void {
  const timeout = config.requestTimeoutMs;

  const timer = setTimeout(() => {
    if (!res.headersSent) {
      res.status(503).json({
        error: {
          code: 'REQUEST_TIMEOUT',
          message: `Request exceeded timeout of ${timeout}ms`,
        },
      });
    }
  }, timeout);

  res.on('finish', () => {
    clearTimeout(timer);
  });

  res.on('close', () => {
    clearTimeout(timer);
  });

  next();
}
