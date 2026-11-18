import { Router, type IRouter } from 'express';

import {
  chat,
  confirmAlcoholAge,
  getUsage,
  invalidateCache,
  unlockPreview,
} from '../controllers/pulseAi.controller';
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

/**
 * DELETE /pulse-ai/cache  🔒 autenticado
 * Invalida todas as entradas de cache do Pulse AI do usuário autenticado.
 */
pulseAiRouter.delete('/cache', authenticate, invalidateCache);

/**
 * GET /pulse-ai/previews/:id  🔒 autenticado
 * Desbloqueia uma prévia bloqueada (CP-1.1.4a): devolve a receita completa só
 * para o dono que já é Pro (lido do banco) e grava o turno completo na conversa.
 * Rate limit: o authenticatedLimiter global de index.ts (nenhuma rota do Pulse
 * AI tem limitador próprio).
 */
pulseAiRouter.get('/previews/:id', authenticate, unlockPreview);

/**
 * POST /pulse-ai/age-confirmation  🔒 autenticado
 * CP-B5: grava uma vez a resposta "Tenho 21 anos ou mais" (body { isAdult })
 * de quem não tem data de nascimento real. Nunca sobrescreve. Não gasta uso.
 */
pulseAiRouter.post('/age-confirmation', authenticate, confirmAlcoholAge);
