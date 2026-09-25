import { type IRouter } from 'express';

import { env } from '../config/env';
import { handleRevenueCatWebhook } from '../controllers/revenueCatWebhook.controller';
import { createRevenueCatWebhookRouter } from '../utils/revenueCatWebhookRoute';

/**
 * POST /webhooks/revenuecat/<REVENUECAT_WEBHOOK_PATH_SECRET>
 * Recebe eventos do RevenueCat (autenticados pelo header Authorization estatico) e
 * sincroniza o estado da assinatura local. O trecho final do caminho vem de env var
 * (nunca fixo no codigo); nao existe rota em /webhooks/revenuecat sem ele.
 */
export const webhooksRouter: IRouter = createRevenueCatWebhookRouter(
  env.REVENUECAT_WEBHOOK_PATH_SECRET,
  handleRevenueCatWebhook
);
