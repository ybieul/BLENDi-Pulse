import { Router, type IRouter } from 'express';
import { createBlendLog, getTodayLogs } from '../controllers/blendLog.controller';
import { authenticate } from '../middlewares/authenticate';

export const blendLogsRouter: IRouter = Router();

/**
 * POST /blend-logs  🔒 autenticado
 * Cria um novo blend log e atualiza métricas derivadas do usuário.
 */
blendLogsRouter.post('/', authenticate, createBlendLog);

/**
 * GET /blend-logs/today  🔒 autenticado
 * Retorna os blends do dia atual no timezone do usuário com agregados de macros.
 */
blendLogsRouter.get('/today', authenticate, getTodayLogs);