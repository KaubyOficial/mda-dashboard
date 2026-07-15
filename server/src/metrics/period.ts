import type { Range } from '../domain/metrics.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function toUtc(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}
function fromUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}
export function addDays(iso: string, days: number): string {
  const d = toUtc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUtc(d);
}
/** Nº de dias inclusivo entre from e to (from==to → 1). */
export function daysInclusive(range: Range): number {
  const a = toUtc(range.from).getTime();
  const b = toUtc(range.to).getTime();
  return Math.round((b - a) / 86_400_000) + 1;
}

export function isInRange(date: string, range: Range): boolean {
  return date >= range.from && date <= range.to;
}

export class RangeError extends Error {}

/** Valida e normaliza um range (from ≤ to, formato ISO). Lança RangeError se inválido. */
export function validateRange(from: unknown, to: unknown): Range {
  if (typeof from !== 'string' || !ISO.test(from)) throw new RangeError(`'from' inválido: ${from}`);
  if (typeof to !== 'string' || !ISO.test(to)) throw new RangeError(`'to' inválido: ${to}`);
  if (from > to) throw new RangeError(`'from' (${from}) posterior a 'to' (${to})`);
  return { from, to };
}

function lastDayOfMonth(year: number, monthZeroBased: number): number {
  return new Date(Date.UTC(year, monthZeroBased + 1, 0)).getUTCDate();
}

/**
 * Período anterior (§4):
 *  - preset 'mes-atual' (ou range month-to-date detectado): dia 1..N do mês vs dia 1..N do mês anterior
 *    (mesmo nº de dias corridos, clampado ao último dia do mês anterior).
 *  - genérico: janela de mesma duração imediatamente anterior.
 */
export function previousRange(range: Range, preset?: string): Range {
  const startsOnFirst = range.from.slice(8, 10) === '01';
  const monthToDate = preset === 'mes-atual' || (preset === undefined && startsOnFirst && sameMonth(range));
  if (monthToDate) {
    const y = Number(range.from.slice(0, 4));
    const m = Number(range.from.slice(5, 7)) - 1; // zero-based
    const n = Number(range.to.slice(8, 10)); // dias corridos = dia final (começa no dia 1)
    const prevY = m === 0 ? y - 1 : y;
    const prevM = m === 0 ? 11 : m - 1;
    const lastPrev = lastDayOfMonth(prevY, prevM);
    const endDay = Math.min(n, lastPrev);
    const mm = String(prevM + 1).padStart(2, '0');
    return {
      from: `${prevY}-${mm}-01`,
      to: `${prevY}-${mm}-${String(endDay).padStart(2, '0')}`,
    };
  }
  const dur = daysInclusive(range);
  const prevTo = addDays(range.from, -1);
  const prevFrom = addDays(prevTo, -(dur - 1));
  return { from: prevFrom, to: prevTo };
}

function sameMonth(range: Range): boolean {
  return range.from.slice(0, 7) === range.to.slice(0, 7);
}

/** Lista de datas ISO cobrindo o range (inclusive). */
export function eachDay(range: Range): string[] {
  const out: string[] = [];
  let d = range.from;
  while (d <= range.to) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}
