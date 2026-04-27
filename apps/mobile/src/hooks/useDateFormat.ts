// apps/mobile/src/hooks/useDateFormat.ts
//
// Hook central de formatação de datas do BLENDi Pulse.
//
// ── Regra de ouro ─────────────────────────────────────────────────────────────
// Nenhum componente ou tela formata datas diretamente.
// Toda exibição de data ou horário passa por este hook.
//
// ── Por que Intl e não date-fns/moment? ───────────────────────────────────────
// Intl.DateTimeFormat é nativo do runtime (Hermes 0.12+ / JSC), conhece as
// regras locais de todos os idiomas (separadores, ordem de campos, AM/PM vs 24h,
// nomes de meses por extenso) sem nenhum bundle extra. date-fns-tz adiciona ~40KB
// minificado para resolver exatamente o que o runtime já fornece.
//
// ── Timezone de exibição ──────────────────────────────────────────────────────
// O hook lê o timezone diretamente do dispositivo via Intl (não do store Zustand),
// garantindo que a exibição reflita o fuso atual mesmo que o backend ainda não
// tenha sido sincronizado. A sincronização com o servidor é responsabilidade de
// timezone.service.ts.

import { useMemo } from 'react';
import { useAppTranslation } from './useAppTranslation';
import type { SupportedLocale } from '../locales/i18n';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Mapeia o locale interno do app (SupportedLocale) para a BCP 47 tag completa
 * esperada pelo Intl.
 *
 *   'en'    → 'en-US'  (garante formatação americana: Apr 22, 2026 / 11:00 PM)
 *   'pt-BR' → 'pt-BR'  (já é uma tag BCP 47 válida)
 */
function toIntlLocale(locale: SupportedLocale): string {
  return locale === 'en' ? 'en-US' : 'pt-BR';
}

/**
 * Normaliza qualquer valor de data para um objeto Date.
 * Aceita Date, timestamp numérico ou string ISO 8601.
 */
function toDate(value: Date | number | string): Date {
  return value instanceof Date ? value : new Date(value);
}

/**
 * Extrai os componentes de data (ano, mês, dia) de um instante no timezone dado.
 * Retorna um objeto comparável para verificar se dois instantes são o mesmo dia.
 */
function getLocalDateKey(date: Date, timezone: string): string {
  // Formatar como 'YYYY/MM/DD' no timezone alvo para comparação direta de string
  return new Intl.DateTimeFormat('en-CA', {
    // en-CA usa YYYY-MM-DD — formato conveniente para comparação lexicográfica
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface UseDateFormatReturn {
  /**
   * Formata uma data no idioma e timezone do dispositivo.
   * Converte automaticamente de UTC para o fuso local — o dia exibido pode
   * diferir do dia UTC.
   *
   * @example
   *   // UTC: 2026-04-23T03:00:00Z, timezone: America/Sao_Paulo (UTC-3)
   *   formatDate(new Date('2026-04-23T03:00:00Z'))
   *   // en-US → "April 22, 2026"
   *   // pt-BR → "22 de abril de 2026"
   */
  formatDate: (date: Date | number | string) => string;

  /**
   * Formata apenas o horário no idioma e timezone do dispositivo.
   * Em inglês usa 12h com AM/PM; em português usa 24h — convenção local de cada idioma.
   *
   * @example
   *   // UTC: 2026-04-23T02:00:00Z, timezone: America/Sao_Paulo (UTC-3)
   *   formatTime(new Date('2026-04-23T02:00:00Z'))
   *   // en-US → "11:00 PM"
   *   // pt-BR → "23:00"
   */
  formatTime: (date: Date | number | string) => string;

  /**
   * Formata uma data como referência relativa ao dia atual no timezone do dispositivo.
   *
   * - Hoje    → "Today"    / "Hoje"
   * - Ontem   → "Yesterday"/ "Ontem"
   * - Outros  → "3 days ago" / "há 3 dias"
   *
   * A comparação usa o dia calendário local (timezone-aware) — um blend feito
   * às 23:59 no timezone do usuário é "hoje", mesmo que em UTC já seja amanhã.
   *
   * @example
   *   // Hoje no timezone do usuário:
   *   formatRelative(new Date()) // → "Today" / "Hoje"
   */
  formatRelative: (date: Date | number | string) => string;

  /**
   * Retorna true se duas datas caem no mesmo dia calendário no timezone atual
   * do dispositivo.
   *
   * Usado pela lógica de streak no frontend para feedback visual imediato,
   * antes da confirmação do backend.
   *
   * @example
   *   // timezone: America/Sao_Paulo (UTC-3)
   *   isSameLocalDay(
   *     new Date('2026-04-23T02:59:00Z'), // 22 abr 23:59 em SP
   *     new Date('2026-04-23T03:01:00Z')  // 23 abr 00:01 em SP
   *   ) // → false
   */
  isSameLocalDay: (a: Date | number | string, b: Date | number | string) => boolean;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

/**
 * Hook central de formatação de datas do BLENDi Pulse.
 *
 * Lê automaticamente:
 *   • Idioma atual via useAppTranslation (en → en-US, pt-BR → pt-BR)
 *   • Timezone do dispositivo via Intl.DateTimeFormat().resolvedOptions().timeZone
 *
 * Todas as funções retornadas são estáveis entre renders (useMemo) — seguras
 * para usar como dependências de useEffect ou memo de componentes.
 *
 * @example
 *   const { formatDate, formatTime, formatRelative, isSameLocalDay } = useDateFormat();
 *   <Text>{formatDate(entry.createdAt)}</Text>
 *   <Text>{formatTime(entry.createdAt)}</Text>
 *   <Text>{formatRelative(entry.createdAt)}</Text>
 */
export function useDateFormat(): UseDateFormatReturn {
  const { locale } = useAppTranslation();

  // Timezone do dispositivo: lido no momento do render para capturar mudanças
  // de fuso sem precisar de subscribe em nenhum store externo.
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const intlLocale = toIntlLocale(locale);

  return useMemo(() => {
    // ── formatDate ──────────────────────────────────────────────────────────
    const dateFormatter = new Intl.DateTimeFormat(intlLocale, {
      timeZone: timezone,
      dateStyle: 'long',
      // 'long' → "April 22, 2026" (en-US) | "22 de abril de 2026" (pt-BR)
    });

    // ── formatTime ──────────────────────────────────────────────────────────
    // timeStyle: 'short' segue automaticamente a convenção do locale:
    //   en-US → 12h com AM/PM ("11:00 PM")
    //   pt-BR → 24h ("23:00")
    const timeFormatter = new Intl.DateTimeFormat(intlLocale, {
      timeZone: timezone,
      timeStyle: 'short',
    });

    // ── formatRelative ──────────────────────────────────────────────────────
    const relativeFormatter = new Intl.RelativeTimeFormat(intlLocale, {
      numeric: 'always', // "3 days ago" / "há 3 dias" (não "yesterday" via Intl)
      style: 'long',
    });

    // ── Funções ─────────────────────────────────────────────────────────────

    function formatDate(value: Date | number | string): string {
      return dateFormatter.format(toDate(value));
    }

    function formatTime(value: Date | number | string): string {
      return timeFormatter.format(toDate(value));
    }

    function formatRelative(value: Date | number | string): string {
      const date = toDate(value);
      const now = new Date();

      const dateKey = getLocalDateKey(date, timezone);
      const todayKey = getLocalDateKey(now, timezone);

      // Calcular a chave de ontem no timezone do dispositivo
      const yesterdayUtc = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const yesterdayKey = getLocalDateKey(yesterdayUtc, timezone);

      if (dateKey === todayKey) {
        return locale === 'en' ? 'Today' : 'Hoje';
      }

      if (dateKey === yesterdayKey) {
        return locale === 'en' ? 'Yesterday' : 'Ontem';
      }

      // Para datas mais antigas: calcular diferença em dias calendário locais.
      // Compara meia-noite local de cada dia para evitar artefatos de hora.
      const dateMidnight = new Date(dateKey + 'T00:00:00');
      const todayMidnight = new Date(todayKey + 'T00:00:00');
      const diffMs = todayMidnight.getTime() - dateMidnight.getTime();
      const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

      // RelativeTimeFormat com valor negativo = passado ("3 days ago" / "há 3 dias")
      return relativeFormatter.format(-diffDays, 'day');
    }

    function isSameLocalDay(
      a: Date | number | string,
      b: Date | number | string
    ): boolean {
      return getLocalDateKey(toDate(a), timezone) === getLocalDateKey(toDate(b), timezone);
    }

    return { formatDate, formatTime, formatRelative, isSameLocalDay };
  }, [intlLocale, timezone, locale]);
}
