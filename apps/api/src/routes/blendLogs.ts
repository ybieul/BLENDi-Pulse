import { Router, type IRouter } from 'express';
import { getTodayLogs } from '../controllers/blendLog.controller';
import { authenticate } from '../middlewares/authenticate';

export const blendLogsRouter: IRouter = Router();

/**
 * GET /blend-logs/today  🔒 autenticado
 * Retorna os blends do dia atual no timezone do usuário com agregados de macros.
 */
blendLogsRouter.get('/today', authenticate, getTodayLogs);