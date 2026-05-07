// apps/mobile/src/services/hydration.service.ts
// Serviço de hidratação — registra consumo de água no backend.
//
// Mantido separado do auth.service.ts para seguir o mesmo padrão de um
// arquivo por domínio adotado no resto da camada de serviços.

import { api } from '../config/api';

// ─── Tipos de resposta ────────────────────────────────────────────────────────

export interface HydrationLogEntry {
  id: string;
  userId: string;
  amountMl: number;
  createdAt: string;
}

export interface LogWaterResponse {
  success: true;
  data: HydrationLogEntry;
}

export interface HydrationTodayResponse {
  success: true;
  data: {
    totalMl: number;
    logs: HydrationLogEntry[];
  };
}

// ─── Funções do serviço ───────────────────────────────────────────────────────

/**
 * Registra um consumo de água no backend.
 *
 * @param amountMl - Volume em mililitros (padrão: 250 ml por copo)
 */
export async function logWater(amountMl: number = 250): Promise<LogWaterResponse> {
  const response = await api.post<LogWaterResponse>('/hydration-logs', { amountMl });
  return response.data;
}

/**
 * Busca o total de água consumida hoje.
 * Usado como queryFn da query QUERY_KEYS.hydrationToday.
 */
export async function getHydrationToday(): Promise<HydrationTodayResponse> {
  const response = await api.get<HydrationTodayResponse>('/hydration-logs/today');
  return response.data;
}
