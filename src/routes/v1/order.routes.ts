import { Router } from 'express';
import { splitOrder, listOrders, healthCheck, getMetrics } from '../../controllers/order.controller';

const router = Router();

router.post('/orders/split', splitOrder);
router.get('/orders', listOrders);
router.get('/health', healthCheck);
router.get('/metrics', getMetrics);

export { router as orderRoutes };
