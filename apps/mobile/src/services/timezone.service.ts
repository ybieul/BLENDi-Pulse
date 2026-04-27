// apps/mobile/src/services/timezone.service.ts
//
// Responsabilidades:
//   1. Obter o timezone IANA atual do dispositivo (via Intl nativo).
//   2. Sincronizar o timezone com o backend quando o app volta ao foreground,
//      garantindo que o servidor reflita o fuso correto após o usuário viajar.
//
// ── Por que Intl e não expo-localization? ─────────────────────────────────────
// `Intl.DateTimeFormat().resolvedOptions().timeZone` é uma API ECMAScript
// padrão disponível em qualquer runtime moderno (Hermes 0.12+, JSC, V8).
// Não requer permissão do sistema operacional e retorna o timezone IANA
// configurado pelo usuário no SO (ex: 'America/Sao_Paulo'). expo-localization
// faz exatamente isso internamente, mas adiciona uma dependência desnecessária.
//
// ── Quando chamar syncTimezoneIfNeeded? ───────────────────────────────────────
// Chamar quando o app volta ao foreground (AppState 'active'), via listener
// registrado em App.tsx. Isso cobre o caso principal: usuário viaja entre
// países, o SO muda o timezone automáticamente — na próxima vez que abrir o
// app, a sincronização acontece sem precisar de logout/login.

import { api } from '../config/api';
import { useAuthStore } from '../store/auth.store';

// ─── Funções públicas ─────────────────────────────────────────────────────────

/**
 * Retorna o timezone IANA atual do dispositivo.
 *
 * Usa a API Intl nativa do JavaScript — disponível em Hermes (Expo SDK 48+),
 * JSC e V8 sem nenhuma permissão do SO.
 *
 * @returns String IANA (ex: 'America/Sao_Paulo', 'Europe/London', 'UTC').
 *
 * @example
 *   getDeviceTimezone() // → 'America/Sao_Paulo'
 */
export function getDeviceTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/**
 * Compara o timezone do dispositivo com o timezone salvo no perfil do usuário
 * no store Zustand. Se forem diferentes, chama PATCH /auth/timezone para
 * sincronizar o servidor e atualiza o store localmente.
 *
 * Seguro para chamar com usuário não autenticado — retorna imediatamente sem
 * fazer nenhuma requisição se não houver sessão ativa.
 *
 * O interceptor do Axios em auth.store.ts cuida de anexar o Bearer token e de
 * retry automático em caso de 401 — nenhuma lógica de token é necessária aqui.
 *
 * @example
 *   // Em App.tsx, listener de foreground:
 *   AppState.addEventListener('change', (state) => {
 *     if (state === 'active') void syncTimezoneIfNeeded();
 *   });
 */
export async function syncTimezoneIfNeeded(): Promise<void> {
  const { user, isAuthenticated } = useAuthStore.getState();

  // Nenhuma sessão ativa — não há o que sincronizar
  if (!isAuthenticated || user === null) return;

  const deviceTimezone = getDeviceTimezone();

  // Timezones iguais — nada a fazer
  if (user.timezone === deviceTimezone) return;

  // Sincroniza com o backend
  await api.patch('/auth/timezone', { timezone: deviceTimezone });

  // Atualiza o store localmente para evitar nova requisição no próximo ciclo.
  // Chamada via getState() para preservar a resolução de tipo do Zustand.
  useAuthStore.getState().updateTimezone(deviceTimezone);
}
