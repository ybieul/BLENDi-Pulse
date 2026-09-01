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
   * 7 dias. Listas de compras precisam sobreviver a reinícios do app para uso
   * offline completo, mas não devem ficar persistidas por tempo indeterminado.
   */
  SHOPPING_LISTS_TTL: 7 * 24 * 60 * 60 * 1000,

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
   * 60 segundos. Missões diárias precisam refletir progresso recente sem causar
   * refetches desnecessários ao alternar entre abas ou voltar à Home.
   */
  DAILY_MISSIONS_TTL: 60 * 1000,

  /**
   * Limite de receitas persistidas localmente para modo offline.
   * Aumentar melhora cobertura offline, mas consome mais armazenamento no dispositivo.
   */
  MAX_CACHED_RECIPES: 20,
} as const;

export type CacheConfig = typeof CACHE_CONFIG;

export const PANTRY_SCAN_LIMIT_FREE = 3;

export const QUERY_KEYS = {
  user: ['user'],
  userProfile: ['userProfile'],
  dailyMissions: ['dailyMissions'],
  blendHistory: ['blendHistory'],
  blendLogsToday: ['blendLogsToday'],
  favorites: ['favorites'],
  hydrationHistory: ['hydrationHistory'],
  hydrationToday: ['hydrationToday'],
  shoppingLists: ['shoppingLists'],
  shoppingListDetail: ['shoppingListDetail'],
  shoppingListsArchived: ['shoppingListsArchived'],
  supplementHistory: ['supplementHistory'],
  supplementStack: ['supplementStack'],
  pulseAiHistory: ['pulseAiHistory'],
  pantryScans: ['pantryScans'],
  conversations: ['conversations'],
  weeklyReportLatest: ['weeklyReportLatest'],
  weeklyReport: ['weeklyReport'],
  weeklyReportDates: ['weeklyReportDates'],
} as const;

// `pantryScans` e `conversations` ficam fora da persistência em MMKV: quota
// sensível e histórico de conversas devem sempre refletir o servidor, nunca
// ser reidratados de um snapshot em disco potencialmente desatualizado.
// `weeklyReportLatest`/`weeklyReport`/`weeklyReportDates` também ficam de fora
// por decisão explícita: o servidor é a única fonte de verdade do relatório
// semanal, o cache em memória do React Query já é suficiente.
export const PERSISTABLE_QUERY_KEYS = [
  'user',
  'userProfile',
  'dailyMissions',
  'blendLogsToday',
  'blendHistory',
  'favorites',
  'hydrationToday',
  'hydrationHistory',
  'shoppingLists',
  'shoppingListDetail',
  'supplementStack',
  'supplementHistory',
  'pulseAiHistory',
] as const satisfies ReadonlyArray<keyof typeof QUERY_KEYS>;

export const PERSISTED_QUERY_MAX_AGES: Partial<Record<keyof typeof QUERY_KEYS, number>> = {
  shoppingLists: CACHE_CONFIG.SHOPPING_LISTS_TTL,
  shoppingListDetail: CACHE_CONFIG.SHOPPING_LISTS_TTL,
};

export const HOME_INTERACTION_DELAY = 100;
export const GOAL_RING_ANIMATION_DURATION = 1200;

export type QueryKeys = typeof QUERY_KEYS;