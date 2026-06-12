// @blendi/shared — ponto de entrada
// Tipos de domínio, design tokens, schemas de validação e utilitários
// compartilhados entre apps/mobile e apps/api.

export type * from './types';
export * from './tokens';

// Schemas Zod + tipos inferidos (backend e mobile)
export * from './schemas/auth';
export * from './schemas/blendLog';
export * from './schemas/favorite';
export * from './schemas/pantryScanner';
export * from './schemas/pulseAi';
export * from './schemas/supplementStack';
export * from './schemas/user';
export type { HistoryQuery, SupplementItem, UpdateSupplementStackInput } from './schemas/supplementStack';
export type {
  CalculateMacrosInput,
  CalculateMacrosResponse,
  DailyPulseTimeInput,
  NotificationPreferencesInput,
  UpdateUserInput,
} from './schemas/user';
