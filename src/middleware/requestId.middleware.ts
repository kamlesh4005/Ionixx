import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';
import { requestContext } from '../utils/requestContext';

declare global {
  namespace Express {
    interface Request {
      requestId: string;
      startTime: bigint;
    }
  }
}

export function requestIdMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.requestId = crypto.randomUUID();
  requestContext.run({ requestId: req.requestId }, () => {
    next();
  });
}
