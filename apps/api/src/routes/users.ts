import { Router, type IRouter } from 'express';
import { calculateMacros, getMe, markCleaned, updateMe } from '../controllers/user.controller';
import { authenticate } from '../middlewares/authenticate';

export const usersRouter: IRouter = Router();

/**
 * GET /users/me  🔒 autenticado
 * Retorna o perfil completo do usuário autenticado.
 */
usersRouter.get('/me', authenticate, getMe);

/**
 * PATCH /users/me  🔒 autenticado
 * Atualiza parcialmente o perfil e as metas do usuário autenticado.
 */
usersRouter.patch('/me', authenticate, updateMe);

/**
 * PATCH /users/me/cleaned  🔒 autenticado
 * Marca o BLENDi como limpo no timestamp atual.
 */
usersRouter.patch('/me/cleaned', authenticate, markCleaned);

/**
 * POST /users/calculate-macros  🔒 autenticado
 * Calcula IMC, TDEE e metas diárias para o onboarding.
 */
usersRouter.post('/calculate-macros', authenticate, calculateMacros);