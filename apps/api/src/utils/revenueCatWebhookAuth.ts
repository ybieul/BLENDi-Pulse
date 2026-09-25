// apps/api/src/utils/revenueCatWebhookAuth.ts
// Autenticação do webhook do RevenueCat por header estático.
//
// O webhook do painel está com "Enable HMAC webhook signing" DESLIGADO e usa o campo
// "Authorization header value": o RevenueCat envia exatamente esse valor no header
// `Authorization` de cada requisição. Portanto a validação é comparar o header recebido
// com REVENUECAT_WEBHOOK_SECRET, sem nenhuma assinatura/HMAC.
//
// FORMATO ESPERADO: REVENUECAT_WEBHOOK_SECRET deve ser IDÊNTICO, caractere a caractere,
// ao valor configurado no painel. Se no painel o valor for `Bearer abc123`, o secret
// também deve ser `Bearer abc123` (com o prefixo); se for só `abc123`, o secret é `abc123`.
// O código não adiciona nem remove o prefixo "Bearer ".
//
// Este módulo não importa env.ts (que valida process.env e encerra o processo ao ser
// importado), para poder ser testado de forma isolada.

import { createHash, timingSafeEqual } from 'node:crypto';

import type { Request, Response } from 'express';

import { sendErrorResponse } from './error.utils';

export const WEBHOOK_AUTHORIZATION_HEADER = 'authorization';

const BEARER_PREFIX_PATTERN = /^Bearer /i;

// Hash SHA-256 dos dois lados: gera buffers de tamanho fixo (exigência do timingSafeEqual)
// e evita vazar o tamanho do segredo por diferença de tempo.
function sha256(value: string): Buffer {
  return createHash('sha256').update(value, 'utf8').digest();
}

/**
 * Compara o header Authorization recebido com o segredo em tempo constante.
 * Retorna false para header ausente/vazio ou segredo vazio.
 */
export function isWebhookAuthorizationValid(
  receivedHeader: string | undefined,
  secret: string
): boolean {
  if (!receivedHeader || !secret) {
    return false;
  }

  return timingSafeEqual(sha256(receivedHeader), sha256(secret));
}

/**
 * Autoriza a requisição do webhook. Retorna true se o header confere. Caso contrário
 * responde 401 (mensagem genérica, sem indicar o motivo) e retorna false.
 *
 * O motivo real só vai para o log do servidor, sem nenhum valor de header ou segredo;
 * apenas se cada lado tem o prefixo "Bearer ", para diagnosticar o erro de configuração
 * mais provável (prefixo divergente entre o painel e o .env).
 */
export function authorizeRevenueCatWebhook(req: Request, res: Response, secret: string): boolean {
  const receivedHeader = req.header(WEBHOOK_AUTHORIZATION_HEADER);

  if (isWebhookAuthorizationValid(receivedHeader, secret)) {
    return true;
  }

  const reason = receivedHeader
    ? `header Authorization nao confere com REVENUECAT_WEBHOOK_SECRET (recebido com prefixo "Bearer ": ${String(
        BEARER_PREFIX_PATTERN.test(receivedHeader)
      )}; secret com prefixo "Bearer ": ${String(BEARER_PREFIX_PATTERN.test(secret))})`
    : 'header Authorization ausente';

  console.warn(`[revenuecat-webhook] Requisicao rejeitada com 401: ${reason}.`);

  sendErrorResponse(res, {
    statusCode: 401,
    code: 'webhooks/unauthorized',
    message: 'Unauthorized.',
  });

  return false;
}
