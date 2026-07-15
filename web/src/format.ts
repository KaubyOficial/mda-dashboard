const brl = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 0,
});
const brlCents = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  maximumFractionDigits: 2,
});
const num = new Intl.NumberFormat('pt-BR');

export function fmtCurrency(v: number, cents = false): string {
  return (cents ? brlCents : brl).format(v);
}
export function fmtNumber(v: number): string {
  return num.format(Math.round(v));
}
export function fmtPercent(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return `${v.toFixed(digits)}%`;
}
/** taxa 0..1 → "45,0%" */
export function fmtRate(v: number | null, digits = 1): string {
  if (v === null || !Number.isFinite(v)) return '—';
  return `${(v * 100).toFixed(digits).replace('.', ',')}%`;
}
export function fmtRatio(v: number): string {
  return `${v.toFixed(2).replace('.', ',')}×`;
}
export function fmtValue(value: number, format: string): string {
  switch (format) {
    case 'currency':
      return fmtCurrency(value);
    case 'percent':
      return `${value.toFixed(1).replace('.', ',')}%`;
    case 'ratio':
      return fmtRatio(value);
    default:
      return fmtNumber(value);
  }
}
export function fmtDayShort(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}
export function fmtDateTime(iso: string | null): string {
  if (!iso) return 'nunca';
  const d = new Date(iso);
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}
