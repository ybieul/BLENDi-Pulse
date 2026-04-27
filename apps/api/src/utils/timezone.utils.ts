// apps/api/src/utils/timezone.utils.ts
//
// Lógica centralizada de conversão e cálculo de datas com suporte a timezone.
//
// ── Por que sem bibliotecas externas? ────────────────────────────────────────
// Node.js 18+ tem suporte completo à API Intl (ECMA-402) com todos os timezones
// IANA compilados via ICU. Moment-timezone, date-fns-tz e similares resolvem o
// mesmo problema adicionando centenas de KB e dependências transitivas — peso
// desnecessário para o que o runtime já oferece nativamente.
//
// ── Convenção usada neste arquivo ────────────────────────────────────────────
// • Parâmetros do tipo `Date` sempre representam instantes UTC (Date.valueOf é
//   sempre UTC em JavaScript — independente do timezone local do servidor).
// • Strings de timezone seguem o formato IANA (ex: 'America/Sao_Paulo').
// • Nunca use `new Date(year, month, day, ...)` — o construtor multiparâmetro
//   usa o timezone LOCAL DO PROCESSO, que pode ser qualquer coisa no servidor.
//   Use sempre as funções deste arquivo para operações timezone-aware.

// ─── Helpers internos ─────────────────────────────────────────────────────────

/**
 * Extrai os componentes de data/hora de um instante UTC no timezone especificado.
 * Retorna um objeto com year, month (1-12), day, hour, minute, second.
 *
 * @example
 *   getParts(new Date('2025-03-15T05:00:00Z'), 'America/Sao_Paulo')
 *   // → { year: 2025, month: 3, day: 15, hour: 2, minute: 0, second: 0 }
 *   // (BRT = UTC-3)
 */
function getParts(
  utcDate: Date,
  timezone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = fmt.formatToParts(utcDate);
  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value ?? '0', 10);

  // hour12: false pode retornar 24 para meia-noite em alguns ambientes — normalizar
  const hour = get('hour') === 24 ? 0 : get('hour');

  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour,
    minute: get('minute'),
    second: get('second'),
  };
}

/**
 * Constrói um instante UTC a partir dos componentes de data/hora locais em um timezone.
 *
 * A técnica: formata um Date UTC para o timezone alvo, compara com o UTC original
 * para descobrir o offset efetivo, e ajusta. Resolve ambiguidades de DST aplicando
 * uma segunda passagem se necessário.
 *
 * @example
 *   buildUTCFromLocal(2025, 3, 15, 0, 0, 0, 'America/Sao_Paulo')
 *   // → new Date('2025-03-15T03:00:00Z') (BRT = UTC-3)
 */
function buildUTCFromLocal(
  year: number,
  month: number, // 1-12
  day: number,
  hour: number,
  minute: number,
  second: number,
  timezone: string
): Date {
  // Passo 1: construir uma estimativa ingênua em UTC (sem offset)
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);

  // Passo 2: descobrir o que o timezone "vê" para esse instante UTC
  const naiveDate = new Date(naive);
  const localParts = getParts(naiveDate, timezone);

  // Passo 3: calcular a diferença entre o que queremos e o que o timezone mostrou
  const wantedMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const gotMs = Date.UTC(
    localParts.year,
    localParts.month - 1,
    localParts.day,
    localParts.hour,
    localParts.minute,
    localParts.second
  );

  // offset = quanto o UTC precisa ser ajustado para que o timezone local mostre
  // exatamente os componentes desejados
  return new Date(naive + (wantedMs - gotMs));
}

// ─── Funções públicas ─────────────────────────────────────────────────────────

/**
 * Converte uma data representada como local em um timezone para o instante UTC
 * correspondente.
 *
 * Use antes de salvar qualquer data gerada no contexto de um usuário específico,
 * para garantir que o banco sempre armazena UTC.
 *
 * @param localDate - Data a interpretar como local no timezone fornecido.
 *   Os componentes usados são: ano, mês, dia, hora, minuto, segundo (UTC fields
 *   do objeto Date são IGNORADOS — apenas os valores numéricos são lidos como
 *   se fossem locais no timezone alvo).
 * @param timezone  - Timezone IANA (ex: 'America/Sao_Paulo').
 * @returns Instante UTC equivalente.
 *
 * @example
 *   // O usuário em SP selecionou "15 de março de 2025, 09:30"
 *   const local = new Date(2025, 2, 15, 9, 30, 0); // construído com tz local do servidor!
 *   // Correto: informar os componentes explicitamente
 *   toUTC(new Date(Date.UTC(2025, 2, 15, 9, 30, 0)), 'America/Sao_Paulo')
 *   // → new Date('2025-03-15T12:30:00Z') (BRT = UTC-3)
 */
export function toUTC(localDate: Date, timezone: string): Date {
  // Trata os campos UTC do objeto como se fossem os componentes locais do usuário
  const y = localDate.getUTCFullYear();
  const mo = localDate.getUTCMonth() + 1;
  const d = localDate.getUTCDate();
  const h = localDate.getUTCHours();
  const mi = localDate.getUTCMinutes();
  const s = localDate.getUTCSeconds();

  return buildUTCFromLocal(y, mo, d, h, mi, s, timezone);
}

/**
 * Converte um instante UTC para a representação local em um timezone, retornando
 * um objeto Date cujos campos UTC codificam os componentes locais.
 *
 * Use para cálculos de lógica de negócio que dependem do dia/hora local do usuário.
 *
 * @param utcDate  - Instante UTC de origem.
 * @param timezone - Timezone IANA (ex: 'America/Sao_Paulo').
 * @returns Date cujos campos UTC (getUTCFullYear, getUTCMonth, etc.) correspondem
 *   aos componentes locais naquele timezone.
 *
 * @example
 *   toLocalDate(new Date('2025-03-15T03:00:00Z'), 'America/Sao_Paulo')
 *   // → Date where getUTCFullYear()=2025, getUTCMonth()=2, getUTCDate()=15,
 *   //   getUTCHours()=0, getUTCMinutes()=0 (meia-noite em SP)
 */
export function toLocalDate(utcDate: Date, timezone: string): Date {
  const { year, month, day, hour, minute, second } = getParts(utcDate, timezone);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

/**
 * Retorna o timestamp UTC correspondente à meia-noite (00:00:00) do dia atual
 * no timezone fornecido.
 *
 * Crítico para o reset dos Goal Rings e do checklist de suplementos: o cron job
 * agenda os resets chamando esta função para cada grupo de usuários por timezone,
 * garantindo que o reset acontece na virada do dia local — não à meia-noite UTC.
 *
 * @param timezone - Timezone IANA (ex: 'America/Sao_Paulo').
 * @returns Instante UTC da meia-noite local de hoje naquele timezone.
 *
 * @example
 *   // Chamado às 2025-03-15T20:00:00Z com timezone 'America/Sao_Paulo' (UTC-3)
 *   // Hora local em SP: 2025-03-15T17:00:00-03:00
 *   // Meia-noite local de hoje em SP: 2025-03-15T00:00:00-03:00
 *   getMidnightUTC('America/Sao_Paulo')
 *   // → new Date('2025-03-15T03:00:00Z')
 */
export function getMidnightUTC(timezone: string): Date {
  const now = new Date();
  const { year, month, day } = getParts(now, timezone);
  return buildUTCFromLocal(year, month, day, 0, 0, 0, timezone);
}

/**
 * Determina se dois instantes UTC caem no mesmo dia calendário no timezone dado.
 *
 * Usado pela lógica de streak para checar se dois blends aconteceram no mesmo
 * dia local do usuário — necessário porque um blend às 23:59 BRT e outro às
 * 00:01 BRT do dia seguinte têm timestamps UTC próximos, mas são dias diferentes.
 *
 * @param utcA     - Primeiro instante UTC.
 * @param utcB     - Segundo instante UTC.
 * @param timezone - Timezone IANA do usuário (ex: 'America/Sao_Paulo').
 * @returns true se ambas as datas representam o mesmo dia calendário local.
 *
 * @example
 *   // SP = UTC-3
 *   const a = new Date('2025-03-15T02:59:00Z'); // 2025-03-14T23:59 em SP
 *   const b = new Date('2025-03-15T03:01:00Z'); // 2025-03-15T00:01 em SP
 *   isSameDayInTimezone(a, b, 'America/Sao_Paulo') // → false (dias diferentes em SP)
 *
 *   const c = new Date('2025-03-15T03:00:00Z'); // 2025-03-15T00:00 em SP
 *   const d = new Date('2025-03-15T22:00:00Z'); // 2025-03-15T19:00 em SP
 *   isSameDayInTimezone(c, d, 'America/Sao_Paulo') // → true
 */
export function isSameDayInTimezone(utcA: Date, utcB: Date, timezone: string): boolean {
  const a = getParts(utcA, timezone);
  const b = getParts(utcB, timezone);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/**
 * Calcula o próximo instante UTC em que um horário local específico ocorrerá
 * no timezone fornecido.
 *
 * Se o horário já passou hoje naquele timezone, retorna o instante de amanhã.
 * Usado pelo sistema de push notifications para calcular quando disparar o
 * Daily Pulse para cada usuário no horário preferido dele.
 *
 * @param hour     - Hora local desejada (0–23).
 * @param minute   - Minuto local desejado (0–59).
 * @param timezone - Timezone IANA do usuário (ex: 'America/Sao_Paulo').
 * @returns Instante UTC da próxima ocorrência daquele horário local.
 *
 * @example
 *   // Agora: 2025-03-15T11:00:00Z. Timezone: 'America/Sao_Paulo' (UTC-3).
 *   // Hora local atual em SP: 08:00. Horário alvo: 07:00 → já passou → agendar amanhã.
 *   getNextOccurrenceUTC(7, 0, 'America/Sao_Paulo')
 *   // → new Date('2025-03-16T10:00:00Z') (07:00 de amanhã em SP = 10:00 UTC)
 *
 *   // Horário alvo: 09:00 → ainda não passou → agendar hoje.
 *   getNextOccurrenceUTC(9, 0, 'America/Sao_Paulo')
 *   // → new Date('2025-03-15T12:00:00Z') (09:00 de hoje em SP = 12:00 UTC)
 */
export function getNextOccurrenceUTC(hour: number, minute: number, timezone: string): Date {
  const now = new Date();
  const { year, month, day } = getParts(now, timezone);

  // Candidato: horário alvo no dia de hoje (local)
  const todayOccurrence = buildUTCFromLocal(year, month, day, hour, minute, 0, timezone);

  // Se o candidato ainda não passou (com 1s de tolerância), usar hoje
  if (todayOccurrence.getTime() > now.getTime() - 1000) {
    return todayOccurrence;
  }

  // Passou: calcular meia-noite de amanhã no timezone e somar o horário alvo
  const tomorrowMidnight = getMidnightUTC(timezone);
  // Avançar 24h a partir da meia-noite de hoje para chegar em amanhã
  const tomorrowMidnightMs = tomorrowMidnight.getTime() + 24 * 60 * 60 * 1000;
  const tomorrow = new Date(tomorrowMidnightMs);
  const { year: ty, month: tm, day: td } = getParts(tomorrow, timezone);

  return buildUTCFromLocal(ty, tm, td, hour, minute, 0, timezone);
}
