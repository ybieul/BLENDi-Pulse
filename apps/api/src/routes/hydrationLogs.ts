import { Router, type IRouter } from 'express';
import { authenticate } from '../middlewares/authenticate';
import { getTodayHydration, logWater } from '../controllers/hydration.controller';

export const hydrationLogsRouter: IRouter = Router();

/**
 * POST /hydration-logs  🔒 autenticado
 * Registra um consumo de água e devolve o total do dia atual.
 */
hydrationLogsRouter.post('/', authenticate, logWater);

/**
 * GET /hydration-logs/today  🔒 autenticado
 * Retorna o total de água do dia atual no timezone do usuário e sua meta diária.
 */
hydrationLogsRouter.get('/today', authenticate, getTodayHydration);