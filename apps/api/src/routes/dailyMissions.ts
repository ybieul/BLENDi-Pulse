import { Router, type IRouter } from 'express';
import { getDailyMissions } from '../controllers/dailyMission.controller';
import { authenticate } from '../middlewares/authenticate';

export const dailyMissionsRouter: IRouter = Router();

/**
 * GET /daily-missions  🔒 autenticado
 * Retorna as missões diárias do usuário autenticado com XP disponível e progresso agregado.
 */
dailyMissionsRouter.get('/', authenticate, getDailyMissions);
