// apps/api/src/config/revenuecat.config.ts
// Lógica pura de configuração do RevenueCat (sem efeitos colaterais na importação).
// Fica separada de env.ts porque env.ts valida process.env e encerra o processo ao ser
// importado, o que inviabiliza testá-lo de forma isolada.

/**
 * Consolida os valores brutos de app_id (cada um pode ser uma lista separada por vírgula,
 * ex.: REVENUECAT_APP_IDS e o legado REVENUECAT_APP_ID) numa lista sem espaços, sem vazios
 * e sem duplicatas, preservando a ordem da primeira ocorrência.
 */
export function parseRevenueCatAppIds(
  ...rawValues: ReadonlyArray<string | undefined>
): readonly string[] {
  return [
    ...new Set(
      rawValues
        .flatMap(value => (value ?? '').split(','))
        .map(value => value.trim())
        .filter(value => value.length > 0)
    ),
  ];
}

/**
 * Um evento do webhook é aceito se não trouxer app_id (comportamento herdado) ou se o
 * app_id dele estiver na lista configurada. Nunca lança: app_id desconhecido só retorna false.
 */
export function isRevenueCatAppIdAccepted(
  eventAppId: string | null | undefined,
  allowedAppIds: readonly string[]
): boolean {
  if (!eventAppId) {
    return true;
  }

  return allowedAppIds.includes(eventAppId);
}

/** Pagamentos só ficam habilitados com API key, webhook secret e ao menos 1 app_id. */
export function isPaymentsConfigured(
  apiKey: string | undefined,
  webhookSecret: string | undefined,
  appIds: readonly string[]
): boolean {
  return Boolean(apiKey && webhookSecret && appIds.length > 0);
}

/**
 * Formato aceito para REVENUECAT_WEBHOOK_PATH_SECRET (trecho aleatorio da URL do webhook):
 * minimo 32 caracteres, somente [A-Za-z0-9_-] (hex ou base64url). O conjunto restrito
 * garante que o valor nunca contenha caracteres com significado em rotas ("/", ":", "*", "(").
 * Gerar com: openssl rand -hex 32
 */
export const REVENUECAT_WEBHOOK_PATH_SECRET_PATTERN = /^[A-Za-z0-9_-]{32,}$/;

/**
 * Caminho do webhook relativo ao mount `/webhooks` (URL publica final:
 * /webhooks/revenuecat/<pathSecret>). Lanca se o segredo tiver formato invalido, para nunca
 * montar uma rota previsivel ou malformada.
 */
export function buildRevenueCatWebhookPath(pathSecret: string): string {
  if (!REVENUECAT_WEBHOOK_PATH_SECRET_PATTERN.test(pathSecret)) {
    throw new Error(
      'REVENUECAT_WEBHOOK_PATH_SECRET invalido: use no minimo 32 caracteres [A-Za-z0-9_-].'
    );
  }

  return `/revenuecat/${pathSecret}`;
}
