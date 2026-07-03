type HistoryPeriod = 7 | 30 | 90;

type DateParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function getParts(utcDate: Date, timezone: string): DateParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(utcDate);
  const get = (type: string) => parseInt(parts.find((part) => part.type === type)?.value ?? '0', 10);
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

function buildUTCFromLocal(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  second: number,
  timezone: string,
): Date {
  const naive = Date.UTC(year, month - 1, day, hour, minute, second);
  const naiveDate = new Date(naive);
  const localParts = getParts(naiveDate, timezone);
  const wantedMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const gotMs = Date.UTC(
    localParts.year,
    localParts.month - 1,
    localParts.day,
    localParts.hour,
    localParts.minute,
    localParts.second,
  );

  return new Date(naive + (wantedMs - gotMs));
}

function toLocalDate(utcDate: Date, timezone: string): Date {
  const { year, month, day, hour, minute, second } = getParts(utcDate, timezone);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second));
}

function getMidnightUTC(timezone: string): Date {
  const now = new Date();
  const { year, month, day } = getParts(now, timezone);
  return buildUTCFromLocal(year, month, day, 0, 0, 0, timezone);
}

export type { HistoryPeriod };

export function buildHistoryRange(period: HistoryPeriod, timezone: string): { from: string; to: string } {
  const startOfTodayUtc = getMidnightUTC(timezone);
  const startOfTodayLocal = toLocalDate(startOfTodayUtc, timezone);

  const fromDate = new Date(startOfTodayLocal);
  fromDate.setUTCDate(fromDate.getUTCDate() - (period - 1));
  fromDate.setUTCHours(0, 0, 0, 0);

  const toDate = new Date(startOfTodayLocal);
  toDate.setUTCHours(23, 59, 59, 999);

  return {
    from: fromDate.toISOString(),
    to: toDate.toISOString(),
  };
}