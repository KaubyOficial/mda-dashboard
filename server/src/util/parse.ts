/** Parsing defensivo — datas BR, R$ com vírgula, variantes com barra de escape (lição do reclassificador §2.2). */

/** Remove barras de escape que o Google Sheets injeta em texto exportado ("R$3.000\/mês"). */
export function unescapeCell(raw: string): string {
  return raw.replace(/\\/g, '').trim();
}

/**
 * Converte data BR/ISO para ISO 'YYYY-MM-DD'. Aceita:
 *  - 'DD/MM/YYYY' e 'DD/MM/YYYY HH:mm:ss'
 *  - 'YYYY-MM-DD' e ISO com hora
 * Retorna null se não parseável (linha vai pra quarentena).
 */
export function parseDateISO(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // ISO já
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  // BR DD/MM/YYYY (com ou sem hora)
  const br = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/.exec(s);
  if (br) {
    const d = br[1]!.padStart(2, '0');
    const m = br[2]!.padStart(2, '0');
    let y = br[3]!;
    if (y.length === 2) y = `20${y}`;
    const mm = Number(m);
    const dd = Number(d);
    if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;
    return `${y}-${m}-${d}`;
  }
  return null;
}

/**
 * Converte valor monetário BR para número. Aceita:
 *  'R$ 4.297,00' → 4297 · 'R$ 1000,00' → 1000 · '4.297' → 4297 · '10.000,50' → 10000.5 ·
 *  '2.000 a 3.000' → 2000 (primeiro número) · 'Acima de R$ 10.000' → 10000 · '' → null.
 * Pega o PRIMEIRO token numérico e normaliza os separadores (ponto=milhar, vírgula=decimal no BR).
 */
export function parseMoneyBRL(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = unescapeCell(String(raw));
  if (!s) return null;
  const m = /\d[\d.]*(?:,\d+)?/.exec(s); // dígitos com pontos (milhar) + vírgula decimal opcional
  if (!m) return null;
  const token = m[0]!;
  const lastComma = token.lastIndexOf(',');
  const lastDot = token.lastIndexOf('.');
  let normalized: string;
  if (lastComma !== -1) {
    // vírgula presente = separador decimal; pontos são milhar
    normalized = token.replace(/\./g, '').replace(',', '.');
  } else if (lastDot !== -1) {
    const decimals = token.length - lastDot - 1;
    const dots = (token.match(/\./g) ?? []).length;
    // '3862.0' (1 dígito após, formato float exportado) = decimal; '2.000'/'10.000' = milhar
    normalized = dots > 1 || decimals === 3 ? token.replace(/\./g, '') : token;
  } else {
    normalized = token;
  }
  const val = Number(normalized);
  return Number.isFinite(val) ? val : null;
}

/** Inteiro tolerante (aceita '1.234', '1,234', ''); null se vazio/inválido. */
export function parseInt0(raw: string | null | undefined): number {
  const v = parseMoneyBRL(raw);
  return v == null ? 0 : Math.round(v);
}

/** Faixa de renda BR → limite inferior em R$ (regra da qualificação). null se sem número. */
export function rendaLowerBoundBRL(raw: string | null | undefined): number | null {
  if (raw == null) return null;
  const s = unescapeCell(String(raw)).toLowerCase();
  if (!s) return null;
  if (s.includes('desempregado')) return 0;
  if (s.includes('menos de')) return 0; // "Ganhando menos de R$3.000" → SEM dinheiro (decisão Kauê)
  if (s.includes('acima de') || s.includes('mais de')) {
    const v = parseMoneyBRL(s);
    return v == null ? null : v; // "Acima de R$10.000" → 10000 (≥2k)
  }
  // "R$ 2.000 a R$ 3.000" / "Ganhando entre R$3.000–R$9.000" → pega o PRIMEIRO número (limite inferior)
  return parseMoneyBRL(s);
}
