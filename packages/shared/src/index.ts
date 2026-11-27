// @blendi/shared — ponto de entrada
// Tipos de domínio, design tokens, schemas de validação e utilitários
// compartilhados entre apps/mobile e apps/api.

export type * from './types';
export * from './tokens';
export * from './blenderLimits';
export * from './aiRequestBudget';
export * from './recipeContent';

// Schemas Zod + tipos inferidos (backend e mobile)
export * from './schemas/allergies';
export * from './schemas/auth';
export * from './schemas/blendLog';
export * from './schemas/favorite';
export * from './schemas/shoppingList';
export * from './schemas/pantryScanner';
export * from './schemas/pulseAi';
export * from './schemas/supplementStack';
export * from './schemas/user';
export * from './schemas/weeklyReport';
export * from './schemas/tutorial';
export * from './tutorial/tutorial.content';
export * from './utils/level.utils';
export * from './utils/homeRecipeCompatibility';
export * from './utils/textMatching';
export * from './utils/personName';
export type { HistoryQuery, SupplementItem, UpdateSupplementStackInput } from './schemas/supplementStack';
export type {
  CalculateMacrosInput,
  CalculateMacrosResponse,
  DailyPulseTimeInput,
  NotificationPreferencesInput,
  UpdateUserInput,
} from './schemas/user';
