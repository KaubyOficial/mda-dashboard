import type { EnrichedLead } from './match.js';

/**
 * Atribuição de qualificação (MQL/Morno) a anúncio e público (§S8/S9).
 *
 * Porquê: a qualificação SÓ existe na aba LEADS. A aba MÉTRICAS ADS tem coluna MQL,
 * mas ela está quase toda vazia no dado real (68 MQL contra 356 na LEADS), e a aba
 * TOP PÚBLICOS não tem coluna de MQL nenhuma. Então cruzamos pela UTM do lead:
 *   - anúncio: utm_content 'video-ad02'  ─código─►  'AD02 [OCDM] [VID] CAPTAÇÃO - …'
 *   - público: utm_medium 'ig-visitou-7d'  ─slug─►  '00 - IG Visitou 7D'
 * Não é achismo: é casamento determinístico por código/slug, e o que não casa é contado
 * e reportado em warning em vez de ser distribuído no chute.
 */

export interface QualifCount {
  leads: number;
  mornos: number;
  mqls: number;
}

export interface AttributionResult {
  byKey: Map<string, QualifCount>;
  /** leads no período que não casaram com nenhuma linha da aba de mídia */
  unmatched: number;
}

/** Código do anúncio: 'video-ad02' → '02' · 'AD02 [OCDM] …' → '02'. Null quando não há. */
export function adCode(s: string): string | null {
  const m = /ad[ _-]?(\d+)/i.exec(s ?? '');
  return m ? m[1]!.padStart(2, '0') : null;
}

/** Slug de público: '00 - IG Visitou 7D' e 'ig-visitou-7d' → 'ig-visitou-7d'. */
export function publicoSlug(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // acentos
    .replace(/^\d+\s*-\s*/, '') // prefixo '00 - '
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function tally(map: Map<string, QualifCount>, key: string, l: EnrichedLead): void {
  const cur = map.get(key) ?? { leads: 0, mornos: 0, mqls: 0 };
  cur.leads++;
  if (l.qualificacao === 'MQL') cur.mqls++;
  else if (l.qualificacao === 'Morno') cur.mornos++;
  map.set(key, cur);
}

/** Qualificação por anúncio, casando utm_content do lead com o nome do anúncio pelo código. */
export function qualifByAnuncio(leads: EnrichedLead[], anuncios: string[]): AttributionResult {
  const byCode = new Map<string, string>();
  for (const a of anuncios) {
    const c = adCode(a);
    if (c && !byCode.has(c)) byCode.set(c, a);
  }
  const byKey = new Map<string, QualifCount>();
  let unmatched = 0;
  for (const l of leads) {
    const c = adCode(l.utm.content);
    const anuncio = c ? byCode.get(c) : undefined;
    if (anuncio) tally(byKey, anuncio, l);
    else unmatched++;
  }
  return { byKey, unmatched };
}

/** Qualificação por público, casando utm_medium do lead com o nome do público pelo slug. */
export function qualifByPublico(leads: EnrichedLead[], publicos: string[]): AttributionResult {
  const bySlug = new Map<string, string>();
  for (const p of publicos) {
    const s = publicoSlug(p);
    if (s && !bySlug.has(s)) bySlug.set(s, p);
  }
  const byKey = new Map<string, QualifCount>();
  let unmatched = 0;
  for (const l of leads) {
    const publico = bySlug.get(publicoSlug(l.utm.medium));
    if (publico) tally(byKey, publico, l);
    else unmatched++;
  }
  return { byKey, unmatched };
}
