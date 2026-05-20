import { Router, type IRouter } from 'express';
import {
  checkSupplement,
  deleteFromStack,
  getStack,
  uncheckSupplement,
  updateStack,
} from '../controllers/supplementStack.controller';
import { authenticate } from '../middlewares/authenticate';

export const supplementStackRouter: IRouter = Router();

/**
 * GET /supplement-stack  🔒 autenticado
 * Retorna o stack ativo do usuário com o status de check do dia atual.
 */
supplementStackRouter.get('/', authenticate, getStack);

/**
 * PUT /supplement-stack  🔒 autenticado
 * Substitui integralmente o stack de suplementos preservando IDs existentes.
 */
supplementStackRouter.put('/', authenticate, updateStack);

/**
 * POST /supplement-stack/:id/check  🔒 autenticado
 * Incrementa em 1 o consumo do suplemento no dia local atual do usuário.
 */
supplementStackRouter.post('/:id/check', authenticate, checkSupplement);

/**
 * DELETE /supplement-stack/:id/check  🔒 autenticado
 * Decrementa em 1 o consumo do suplemento no dia local atual do usuário.
 */
supplementStackRouter.delete('/:id/check', authenticate, uncheckSupplement);

/**
 * DELETE /supplement-stack/:id  🔒 autenticado
 * Remove um suplemento do stack e apaga seus logs órfãos.
 */
supplementStackRouter.delete('/:id', authenticate, deleteFromStack);