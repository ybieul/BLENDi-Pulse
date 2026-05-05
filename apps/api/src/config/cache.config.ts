// apps/api/src/config/cache.config.ts
// Fonte única de verdade para TTLs persistidos no backend.
// No MongoDB, índices TTL usam segundos, então os valores abaixo NÃO devem ser
// copiados do mobile sem conversão.

export const CACHE_CONFIG = {
  /**
   * 7 dias. Aumentar reduz recomputações e chamadas ao provedor de AI,
   * mas mantém respostas antigas vivas por mais tempo se o sistema evoluir.
   */
  PULSE_AI_RESPONSES_TTL: 7 * 24 * 60 * 60,

  /**
   * 30 dias. Favoritos têm baixa taxa de mudança e suportam TTL longo sem
   * comprometer consistência percebida pelo usuário.
   */
  FAVORITES_TTL: 30 * 24 * 60 * 60,

  /**
   * 7 dias. Mantém histórico recente acessível com baixo custo,
   * equilibrando retenção e limpeza automática da coleção de cache.
   */
  BLEND_HISTORY_TTL: 7 * 24 * 60 * 60,

  /**
   * 1 hora. Dados de hidratação do dia precisam envelhecer rápido para evitar
   * leituras incorretas por muito tempo, mas ainda podem aliviar carga de leitura.
   */
  HYDRATION_TODAY_TTL: 60 * 60,

  /**
   * 24 horas. A stack de suplementos costuma ser estável durante um dia,
   * então esse TTL reduz leituras repetidas sem atrasar ajustes críticos demais.
   */
  SUPPLEMENT_STACK_TTL: 24 * 60 * 60,

  /**
   * 15 minutos. Perfil precisa refletir edições rapidamente, mas um pequeno cache
   * ainda evita leituras redundantes em fluxos com múltiplas telas.
   */
  USER_PROFILE_TTL: 15 * 60,

  /**
   * Free tier: número máximo de scans do Pantry Scanner no mês.
   * Alterar esse valor muda diretamente a política comercial e o rate limiting atômico.
   */
  PANTRY_SCANNER_MONTHLY_LIMIT: 3,

  /**
   * Plano Pro: tratado como uso praticamente ilimitado pelo backend.
   * Se esse valor cair, o fluxo Pro deixa de se comportar como ilimitado.
   */
  PANTRY_SCANNER_PRO_LIMIT: 999,
} as const;

export type CacheConfig = typeof CACHE_CONFIG;