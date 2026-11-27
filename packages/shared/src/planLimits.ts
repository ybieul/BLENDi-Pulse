// CP-C2a — Limites do plano e quantidades fixas do produto: FONTE ÚNICA.
//
// API, app e textos do tutorial leem daqui. Mudar um valor aqui muda a
// política comercial (controllers do Pulse AI e do Pantry Scanner fazem o
// controle atômico com estes números) e o que o app mostra. O teste
// planLimits.test.ts quebra se alguém voltar a escrever um destes números
// numa cópia local.

/** Plano grátis: mensagens do Pulse AI por dia. */
export const FREE_PULSE_AI_MESSAGES_PER_DAY = 3;

/** Plano grátis: prévias bloqueadas do Pulse AI por dia, depois das mensagens. */
export const FREE_PULSE_AI_PREVIEWS_PER_DAY = 1;

/** Plano grátis: scans do Pantry Scanner por ciclo mensal. */
export const FREE_PANTRY_SCANS_PER_MONTH = 3;

/** Plano grátis: prévias bloqueadas do Pantry Scanner por ciclo, depois dos scans. */
export const FREE_PANTRY_PREVIEWS_PER_CYCLE = 1;

/** Missões diárias sorteadas por dia (todos os planos). */
export const DAILY_MISSIONS_PER_DAY = 3;

/** Copo de água da ação rápida (Home e Track) e padrão do POST /hydration-logs. */
export const QUICK_WATER_GLASS_ML = 250;

export const PLAN_LIMITS = {
  freePulseAiMessagesPerDay: FREE_PULSE_AI_MESSAGES_PER_DAY,
  freePulseAiPreviewsPerDay: FREE_PULSE_AI_PREVIEWS_PER_DAY,
  freePantryScansPerMonth: FREE_PANTRY_SCANS_PER_MONTH,
  freePantryPreviewsPerCycle: FREE_PANTRY_PREVIEWS_PER_CYCLE,
  dailyMissionsPerDay: DAILY_MISSIONS_PER_DAY,
  quickWaterGlassMl: QUICK_WATER_GLASS_ML,
} as const;
