import { Router, type IRouter } from 'express';

import {
  getAllReportDates,
  getLatestReport,
  getReportByWeek,
} from '../controllers/weeklyReport.controller';
import { authenticate } from '../middlewares/authenticate';

export const weeklyReportsRouter: IRouter = Router();

/**
 * GET /weekly-reports/latest  🔒 autenticado
 * Retorna o relatório mais recente do usuário, ou hasReport:false com a
 * próxima data prevista de geração.
 */
weeklyReportsRouter.get('/latest', authenticate, getLatestReport);

/**
 * GET /weekly-reports/dates  🔒 autenticado
 * Retorna apenas as datas (weekStartDate) de todos os relatórios do usuário,
 * em ordem cronológica — usado pelo seletor de semana do mobile.
 */
weeklyReportsRouter.get('/dates', authenticate, getAllReportDates);

/**
 * GET /weekly-reports?weekStart=YYYY-MM-DD  🔒 autenticado
 * Retorna o relatório de uma semana específica, ou 404 se não existir.
 */
weeklyReportsRouter.get('/', authenticate, getReportByWeek);
