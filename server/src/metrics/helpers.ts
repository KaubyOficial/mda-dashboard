import type { Delta } from '../domain/metrics.js';

/** Divisão segura: retorna null quando o denominador é 0 (edge case §3.9). */
export function safeDiv(num: number, den: number): number | null {
  if (!den || den === 0) return null;
  return num / den;
}

/** Delta vs período anterior com semântica de direção (§S1). */
export function makeDelta(
  current: number,
  previous: number,
  goodDirection: 'up' | 'down',
): Delta {
  const abs = current - previous;
  const pct = previous === 0 ? null : (abs / previous) * 100;
  let improved: boolean | null = null;
  if (abs !== 0) improved = goodDirection === 'up' ? abs > 0 : abs < 0;
  else improved = null;
  return { current, previous, abs, pct, goodDirection, improved };
}

export function sum(arr: number[]): number {
  let t = 0;
  for (const x of arr) t += x;
  return t;
}
