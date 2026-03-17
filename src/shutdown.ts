import http from 'http';
import { config } from './config';
import { logger } from './utils/logger';

export function setupGracefulShutdown(server: http.Server): void {
  function gracefulShutdown(signal: string): void {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    server.close(() => {
      logger.info('Server shut down gracefully');
      process.exit(0);
    });

    setTimeout(() => {
      logger.warn('Graceful shutdown timed out, forcing exit');
      process.exit(1);
    }, config.gracefulShutdownTimeoutMs);
  }

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  process.on('unhandledRejection', (reason: unknown) => {
    logger.error('Unhandled Rejection', {
      error: reason instanceof Error ? reason.message : String(reason),
      stack: reason instanceof Error ? reason.stack : undefined,
    });
    gracefulShutdown('unhandledRejection');
  });

  process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception', {
      error: error.message,
      stack: error.stack,
    });
    gracefulShutdown('uncaughtException');
  });
}
