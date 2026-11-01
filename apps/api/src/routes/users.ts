import { Router, type IRouter } from 'express';
import {
  calculateMacros,
  deleteAccount,
  deleteProfilePhoto,
  getMe,
  getMyProfilePhoto,
  getWeightHistory,
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
 * GET /users/me/weight-history  🔒 autenticado
 * Retorna o histórico de peso do usuário, ordenado por recordedAt
 * ascendente. Sem paginação — volume esperado é baixo (uma entrada por
 * mudança real de peso, não por request).
 */
usersRouter.get('/me/weight-history', authenticate, getWeightHistory);

/**
 * PATCH /users/me  🔒 autenticado
 * Atualiza parcialmente o perfil e as metas do usuário autenticado.
 */
usersRouter.patch('/me', authenticate, updateMe);

/**
 * DELETE /users/me  🔒 autenticado
 * Exclusão permanente e atômica da conta do usuário autenticado e de
 * todos os documentos relacionados (BlendLog, Conversation, Favorite,
 * HydrationLog, NotificationLog, ShoppingList, SupplementLog, UserPhoto,
 * WeeklyReport, XPLog, DailyMission, cache de IA e o próprio User).
 */
usersRouter.delete('/me', authenticate, deleteAccount);

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