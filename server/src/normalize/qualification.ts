import type { Qualificacao } from '../domain/entities.js';
import { rendaLowerBoundBRL, unescapeCell } from '../util/parse.js';

/**
 * Regra SIMPLIFICADA travada (memória mda-analise-qualificacao / reclassificar_simplificada_inplace.py):
 *  renda < R$2k            → Fora do perfil
 *  renda ≥ R$2k            → Morno
 *  renda ≥ R$2k E conhece  → MQL  (conhece = há +1 semana)
 *
 * Se a planilha JÁ traz a coluna MQL preenchida com um rótulo válido, ela VENCE (§2.3) —
 * mas normalizamos e, quando ausente/estranha, recalculamos pelas respostas.
 */

const KNOWN_PLUS_WEEK = new Set(['1 semana', '1 mes', '1 mês', '3 meses', '6 meses', '1 ano']);

export function normalizeConhece(raw: string | null | undefined): boolean {
  if (!raw) return false;
  const s = unescapeCell(String(raw)).toLowerCase();
  if (!s) return false;
  // "anúncio" / "3 dias" / branco = não aquecido
  if (s.includes('anunci') || s.includes('dia')) return false;
  return [...KNOWN_PLUS_WEEK].some((k) => s.includes(k));
}

export function classifyByAnswers(
  renda: string | null | undefined,
  conhece: string | null | undefined,
): { qualificacao: Qualificacao; rendaBRL: number | null; conhecePlusSemana: boolean } {
  const rendaBRL = rendaLowerBoundBRL(renda);
  const conhecePlusSemana = normalizeConhece(conhece);
  const hasMoney = rendaBRL != null && rendaBRL >= 2000;
  let qualificacao: Qualificacao;
  if (!hasMoney) qualificacao = 'Fora do perfil';
  else if (conhecePlusSemana) qualificacao = 'MQL';
  else qualificacao = 'Morno';
  return { qualificacao, rendaBRL, conhecePlusSemana };
}

const VALID_LABELS = new Set<Qualificacao>(['MQL', 'Morno', 'Fora do perfil']);

/** Normaliza o rótulo cru da coluna MQL. Retorna null se não for um rótulo válido. */
export function normalizeQualLabel(raw: string | null | undefined): Qualificacao | null {
  if (!raw) return null;
  const s = unescapeCell(String(raw));
  const upper = s.toUpperCase();
  if (upper === 'MQL') return 'MQL';
  if (upper === 'MORNO') return 'Morno';
  if (s.toLowerCase().includes('fora')) return 'Fora do perfil';
  return VALID_LABELS.has(s as Qualificacao) ? (s as Qualificacao) : null;
}
