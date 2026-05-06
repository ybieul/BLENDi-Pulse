import { Router, type IRouter } from 'express';
import { calculateMacros, updateMe } from '../controllers/user.controller';
import { authenticate } from '../middlewares/authenticate';

export const usersRouter: IRouter = Router();

/**
 * PATCH /users/me  🔒 autenticado
 * Atualiza parcialmente o perfil e as metas do usuário autenticado.
 */
usersRouter.patch('/me', authenticate, updateMe);

/**
 * POST /users/calculate-macros  🔒 autenticado
 * Calcula IMC, TDEE e metas diárias para o onboarding.
 */
usersRouter.post('/calculate-macros', authenticate, calculateMacros);