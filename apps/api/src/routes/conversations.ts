import { Router, type IRouter } from 'express';

import { getConversationById, getConversations } from '../controllers/conversation.controller';
import { authenticate } from '../middlewares/authenticate';

export const conversationsRouter: IRouter = Router();

/**
 * GET /conversations  🔒 autenticado
 * Retorna as últimas 20 conversas do usuário autenticado, sem o array de mensagens.
 */
conversationsRouter.get('/', authenticate, getConversations);

/**
 * GET /conversations/:id  🔒 autenticado
 * Retorna uma conversa completa (com todas as mensagens) pertencente ao usuário autenticado.
 */
conversationsRouter.get('/:id', authenticate, getConversationById);
