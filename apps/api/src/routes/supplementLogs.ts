import { Router, type IRouter } from 'express';
import { getSupplementHistory } from '../controllers/supplementLog.controller';
import { authenticate } from '../middlewares/authenticate';

export const supplementLogsRouter: IRouter = Router();

/**
 * GET /supplement-logs/history  🔒 autenticado
 * Retorna o histórico diário de adesão do stack de suplementos no período.
 */
supplementLogsRouter.get('/history', authenticate, getSupplementHistory);