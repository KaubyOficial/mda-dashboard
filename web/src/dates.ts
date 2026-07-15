import type { Range } from './types';

/** "hoje" no fuso America/Sao_Paulo como ISO YYYY-MM-DD. */
export function todaySP(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(new Date());
}

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export interface Preset {
  id: string;
  label: string;
  range: (today: string) => Range;
}

export const PRESETS: Preset[] = [
  {
    id: 'mes-atual',
    label: 'Mês atual',
    range: (t) => ({ from: `${t.slice(0, 7)}-01`, to: t }),
  },
  { id: '3-meses', label: '3 meses', range: (t) => ({ from: addDays(t, -89), to: t }) },
  { id: '6-meses', label: '6 meses', range: (t) => ({ from: addDays(t, -179), to: t }) },
  {
    id: 'este-ano',
    label: 'Este ano',
    range: (t) => ({ from: `${t.slice(0, 4)}-01-01`, to: t }),
  },
  { id: '12-meses', label: '12 meses', range: (t) => ({ from: addDays(t, -364), to: t }) },
];

export function presetById(id: string): Preset | undefined {
  return PRESETS.find((p) => p.id === id);
}
