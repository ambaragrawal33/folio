import type { Instrument } from '@folio/shared';
export const calendarVersion = '2026-10-04.1';
const nseHolidays = new Set([
  '2026-01-15',
  '2026-01-26',
  '2026-03-03',
  '2026-03-26',
  '2026-03-31',
  '2026-04-03',
  '2026-04-14',
  '2026-05-01',
  '2026-05-28',
  '2026-06-26',
  '2026-09-14',
  '2026-10-02',
  '2026-10-20',
  '2026-11-10',
  '2026-11-24',
  '2026-12-25',
]);
const usHolidays = new Set([
  '2026-01-01',
  '2026-01-19',
  '2026-02-16',
  '2026-04-03',
  '2026-05-25',
  '2026-06-19',
  '2026-07-03',
  '2026-09-07',
  '2026-11-26',
  '2026-12-25',
]);
export const calendarSources = {
  NSE: [
    'https://nsearchives.nseindia.com/content/circulars/CMTR71775.pdf',
    'https://nsearchives.nseindia.com/content/circulars/CMTR72260.pdf',
  ],
  US: ['https://www.nyse.com/trade/hours-calendars'],
  BSE: [],
};
export const exchangeZones = {
  NSE: 'Asia/Kolkata',
  BSE: 'Asia/Kolkata',
  US: 'America/New_York',
  CRYPTO: 'UTC',
} as const;
export function exchangeDate(instant: Date, exchange: Instrument['exchange']): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: exchangeZones[exchange],
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(instant);
}
function dayType(
  exchange: Instrument['exchange'],
  date: string,
): 'session' | 'holiday' | 'unknown' {
  if (
    exchange === 'BSE' ||
    !date.startsWith('2026-') ||
    (exchange === 'NSE' && date === '2026-11-08')
  )
    return 'unknown';
  const day = new Date(date + 'T12:00:00.000Z').getUTCDay();
  return day === 0 || day === 6 || (exchange === 'NSE' ? nseHolidays : usHolidays).has(date)
    ? 'holiday'
    : 'session';
}
const closeTime = (exchange: Instrument['exchange'], date: string) =>
  exchange === 'US' ? (['2026-11-27', '2026-12-24'].includes(date) ? '13:00' : '16:00') : '15:30';
export function marketSession(
  exchange: Instrument['exchange'],
  instant: Date,
): 'open' | 'closed' | 'unknown' {
  if (exchange === 'CRYPTO') return 'open';
  const date = exchangeDate(instant, exchange);
  const type = dayType(exchange, date);
  if (type === 'unknown') return 'unknown';
  if (type === 'holiday') return 'closed';
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: exchangeZones[exchange],
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(instant);
  const open = exchange === 'US' ? '09:30' : '09:15';
  const close = closeTime(exchange, date);
  return clock >= open && clock < close ? 'open' : 'closed';
}
export function quoteFreshness(instrument: Instrument, asOf: Date, now: Date): 'fresh' | 'stale' {
  if (asOf > now) return 'stale';
  if (instrument.exchange === 'CRYPTO')
    return now.getTime() - asOf.getTime() <= 10 * 60 * 1000 ? 'fresh' : 'stale';
  const state = marketSession(instrument.exchange, now);
  if (state === 'unknown') return 'stale';
  if (state === 'open') return now.getTime() - asOf.getTime() <= 20 * 60 * 1000 ? 'fresh' : 'stale';
  // A closed-session quote must cover the last expected completed core session.
  let candidate = new Date(now);
  const today = exchangeDate(now, instrument.exchange);
  const clock = new Intl.DateTimeFormat('en-GB', {
    timeZone: exchangeZones[instrument.exchange],
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(now);
  for (let i = 0; i < 8; i++) {
    const day = exchangeDate(candidate, instrument.exchange);
    const expected = dayType(instrument.exchange, day);
    if (expected === 'unknown') return 'stale';
    if (expected === 'session' && (day < today || clock >= closeTime(instrument.exchange, day)))
      return exchangeDate(asOf, instrument.exchange) >= day ? 'fresh' : 'stale';
    candidate = new Date(candidate.getTime() - 86400000);
  }
  return 'stale';
}
