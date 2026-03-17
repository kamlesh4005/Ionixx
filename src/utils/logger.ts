import winston from 'winston';
import { getRequestId } from './requestContext';

const { combine, timestamp, printf, colorize } = winston.format;

const injectRequestId = winston.format((info) => {
  const reqId = info.requestId ?? getRequestId();
  if (reqId) {
    info.requestId = reqId;
  }
  return info;
});

const logFormat = printf(({ level, message, timestamp: ts, requestId, ...meta }) => {
  const reqId = requestId ? ` [${requestId as string}]` : '';
  const metaStr = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `[${ts as string}] [${level.toUpperCase()}]${reqId} ${message as string}${metaStr}`;
});

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: combine(
    injectRequestId(),
    timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
    logFormat,
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        injectRequestId(),
        colorize({ level: true }),
        timestamp({ format: 'YYYY-MM-DDTHH:mm:ss.SSSZ' }),
        logFormat,
      ),
      silent: process.env.NODE_ENV === 'test',
    }),
  ],
});
