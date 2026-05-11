import { Router, type IRouter } from 'express';

import { chat, getUsage } from '../controllers/pulseAi.controller';
import { authenticate } from '../middlewares/authenticate';

export const pulseAiRouter: IRouter = Router();

/**
 * POST /pulse-ai/chat  🔒 autenticado
 * Gera uma receita estruturada do Pulse AI, aplicando rate limiting, cache e validação.
 */
pulseAiRouter.post('/chat', authenticate, chat);

/**
 * GET /pulse-ai/usage  🔒 autenticado
 * Retorna o uso diário atual do Pulse AI para o usuário autenticado.
 */
pulseAiRouter.get('/usage', authenticate, getUsage);