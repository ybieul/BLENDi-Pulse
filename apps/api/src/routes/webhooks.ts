import { Router, type IRouter } from 'express';

import { handleRevenueCatWebhook } from '../controllers/revenueCatWebhook.controller';

export const webhooksRouter: IRouter = Router();

/**
 * POST /webhooks/revenuecat
 * Recebe eventos assinados do RevenueCat e sincroniza o estado da assinatura local.
 */
webhooksRouter.post('/revenuecat', handleRevenueCatWebhook);