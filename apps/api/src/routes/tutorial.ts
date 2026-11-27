import { Router, type IRouter } from 'express';
import {
  getTutorial,
  getTutorialProgress,
  resetTutorialProgress,
  updateTutorialProgress,
} from '../controllers/tutorial.controller';
import { authenticate } from '../middlewares/authenticate';

// CP-C2 — Rate limit: o authenticatedLimiter global (120/min por usuário,
// index.ts) já cobre estas rotas, como as demais rotas autenticadas.
export const tutorialRouter: IRouter = Router();

/**
 * GET /tutorial  🔒 autenticado
 * Roteiro do tutorial guiado, validado pelo schema do shared. ETag + cache
 * curto; If-None-Match igual → 304.
 */
tutorialRouter.get('/', authenticate, getTutorial);

/**
 * GET /tutorial/progress  🔒 autenticado
 * Progresso da conta (lista vazia quando nunca começou).
 */
tutorialRouter.get('/progress', authenticate, getTutorialProgress);

/**
 * PATCH /tutorial/progress  🔒 autenticado
 * Junta ids vistos (ignora desconhecidos), lastStepId, status e versão.
 */
tutorialRouter.patch('/progress', authenticate, updateTutorialProgress);

/**
 * POST /tutorial/progress/reset  🔒 autenticado
 * Apaga o progresso ("Ver tutorial de novo").
 */
tutorialRouter.post('/progress/reset', authenticate, resetTutorialProgress);
