import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { config } from './config';
import { requestIdMiddleware } from './middleware/requestId.middleware';
import { responseTimeMiddleware } from './middleware/responseTime.middleware';
import { rateLimitMiddleware } from './middleware/rateLimit.middleware';
import { timeoutMiddleware } from './middleware/timeout.middleware';
import { errorHandlerMiddleware } from './middleware/errorHandler.middleware';
import { orderRoutes } from './routes/v1/order.routes';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(express.json({ limit: '1mb' }));

app.use(requestIdMiddleware);
app.use(responseTimeMiddleware);
app.use(rateLimitMiddleware);
app.use(timeoutMiddleware);

app.use(`/api/${config.apiVersion}`, orderRoutes);

app.use(errorHandlerMiddleware);

export { app };
