import http from 'http';
import { app } from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { setupGracefulShutdown } from './shutdown';

const server = http.createServer(app);

setupGracefulShutdown(server);

server.listen(config.port, () => {
  logger.info(`Order Splitter API running on port ${config.port}`, {
    port: config.port,
    apiVersion: config.apiVersion,
    environment: process.env.NODE_ENV || 'development',
  });
});

export { server };
