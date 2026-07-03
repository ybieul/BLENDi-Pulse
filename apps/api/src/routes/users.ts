import { Router, type IRouter } from 'express';
import {
  calculateMacros,
  deleteProfilePhoto,
  getMe,
  getMyProfilePhoto,
  markCleaned,
  uploadProfilePhoto,
  updateDailyPulseTime,
  updateMe,
  updateNotificationPreferences,
  updatePushToken,
} from '../controllers/user.controller';
import { authenticate } from '../middlewares/authenticate';

export const usersRouter: IRouter = Router();

/**
 * GET /users/me  🔒 autenticado
 * Retorna o perfil completo do usuário autenticado.
 */
usersRouter.get('/me', authenticate, getMe);

/**
 * GET /users/me/photo  🔒 autenticado
 * Retorna apenas a foto de perfil pesada do usuário autenticado.
 */
usersRouter.get('/me/photo', authenticate, getMyProfilePhoto);

/**
 * PATCH /users/me  🔒 autenticado
 * Atualiza parcialmente o perfil e as metas do usuário autenticado.
 */
usersRouter.patch('/me', authenticate, updateMe);

/**
 * POST /users/profile-photo  🔒 autenticado
 * Cria ou atualiza a foto de perfil do usuário autenticado.
 */
usersRouter.post('/profile-photo', authenticate, uploadProfilePhoto);

/**
 * DELETE /users/profile-photo  🔒 autenticado
 * Remove a foto de perfil do usuário autenticado.
 */
usersRouter.delete('/profile-photo', authenticate, deleteProfilePhoto);

/**
 * PATCH /users/push-token  🔒 autenticado
 * Atualiza o token push atual do dispositivo do usuário autenticado.
 */
usersRouter.patch('/push-token', authenticate, updatePushToken);

/**
 * PATCH /users/notification-preferences  🔒 autenticado
 * Atualiza parcialmente as preferências de notificação do usuário autenticado.
 */
usersRouter.patch('/notification-preferences', authenticate, updateNotificationPreferences);

/**
 * PATCH /users/daily-pulse-time  🔒 autenticado
 * Atualiza o horário local preferido para o Daily Pulse.
 */
usersRouter.patch('/daily-pulse-time', authenticate, updateDailyPulseTime);

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