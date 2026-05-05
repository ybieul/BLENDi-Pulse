// apps/mobile/src/config/cache.config.ts
// Fonte única de verdade para TTLs e limites de cache do app mobile.
// Qualquer ajuste aqui impacta diretamente frescor dos dados, uso offline e
// quantidade de chamadas que o app faz para a API.

export const CACHE_CONFIG = {
  /**
   * 7 dias. Aumentar reduz chamadas à API, mas pode entregar receitas desatualizadas
   * se o prompt do sistema do Pulse AI for melhorado no backend.
   */
  PULSE_AI_RESPONSES_TTL: 7 * 24 * 60 * 60 * 1000,

  /**
   * 30 dias. Favoritos raramente mudam fora de ações explícitas do usuário,
   * então um TTL longo melhora a experiência offline sem custo relevante.
   */
  FAVORITES_TTL: 30 * 24 * 60 * 60 * 1000,

  /**
   * 7 dias. Aumentar preserva mais histórico local e reduz refetches,
   * enquanto reduzir o TTL força sincronizações mais frequentes.
   */
  BLEND_HISTORY_TTL: 7 * 24 * 60 * 60 * 1000,

  /**
   * 1 hora. Dados do dia atual devem ser frescos, mas podem ser servidos do cache
   * por períodos curtos para evitar recargas excessivas durante o uso contínuo.
   */
  HYDRATION_TODAY_TTL: 60 * 60 * 1000,

  /**
   * 24 horas. A pilha de suplementos tende a mudar pouco ao longo do dia,
   * então esse TTL reduz tráfego sem atrasar ajustes por muito tempo.
   */
  SUPPLEMENT_STACK_TTL: 24 * 60 * 60 * 1000,

  /**
   * 15 minutos. O perfil é lido com frequência, mas alterações de nome, foto
   * ou preferências devem aparecer com relativa agilidade no app.
   */
  USER_PROFILE_TTL: 15 * 60 * 1000,

  /**
   * Limite de receitas persistidas localmente para modo offline.
   * Aumentar melhora cobertura offline, mas consome mais armazenamento no dispositivo.
   */
  MAX_CACHED_RECIPES: 20,
} as const;

export type CacheConfig = typeof CACHE_CONFIG;

export const QUERY_KEYS = {
  user: ['user'],
  blendLogsToday: ['blendLogsToday'],
  favorites: ['favorites'],
  hydrationToday: ['hydrationToday'],
  supplementStack: ['supplementStack'],
  pulseAiHistory: ['pulseAiHistory'],
} as const;

export type QueryKeys = typeof QUERY_KEYS;