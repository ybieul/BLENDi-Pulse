// apps/api/src/utils/revenueCatWebhookRoute.ts
// Router do webhook do RevenueCat com caminho nao previsivel.
//
// A rota deixa de ser fixa (/webhooks/revenuecat) e passa a incluir um trecho aleatorio
// vindo de REVENUECAT_WEBHOOK_PATH_SECRET. E uma camada extra contra scanners: a protecao
// real continua sendo a validacao do header Authorization (revenueCatWebhookAuth.ts).
//
// Nao importa env.ts, para poder ser testado de forma isolada.

import { Router, type IRouter, type RequestHandler } from 'express';

import { buildRevenueCatWebhookPath } from '../config/revenuecat.config';

/**
 * Cria o router (montado em `/webhooks`) com POST /revenuecat/<pathSecret>.
 * O casamento e exato: sem wildcard/prefixo, sem tolerar barra final e diferenciando
 * maiusculas de minusculas. Qualquer outro caminho (inclusive o antigo, fixo) cai no 404 global.
 */
export function createRevenueCatWebhookRouter(
  pathSecret: string,
  handler: RequestHandler
): IRouter {
  const router: IRouter = Router({ strict: true, caseSensitive: true });

  router.post(buildRevenueCatWebhookPath(pathSecret), handler);

  return router;
}
