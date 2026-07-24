/** Normalização de chaves de cruzamento (§5.2). e-mail = primária; telefone = fallback; nome = terciária (VENDAS só tem nome). */

export function normalizeEmail(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw).trim().toLowerCase();
}

/**
 * Telefone → só dígitos, removendo prefixo país 55, pra casar variantes com/sem 55 (§5.2).
 * Também canoniza o NONO DÍGITO do celular: a mesma pessoa aparece '11 99999-0001' numa aba e
 * '11 9999-0001' na outra (achado real 2026-07-24: 13 de 15 agendamentos "órfãos" do trimestre
 * eram só isso). Celular 11 dígitos com 9 após o DDD → guarda DDD + últimos 8 (o 9 sai), que é
 * a mesma chave do formato de 10 dígitos. Fixo/valor curto fica como veio.
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  let d = String(raw).replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length > 11) d = d.slice(-11);
  if (d.length === 11 && d[2] === '9') d = d.slice(0, 2) + d.slice(3);
  return d;
}

/** Nome normalizado: minúsculas, sem acento, espaços colapsados. Chave terciária (aba VENDAS só tem nome). */
export function normalizeName(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

/** id estável de lead: emailKey|date (fallback phoneKey/nameKey quando sem e-mail). */
export function makeLeadId(emailKey: string, phoneKey: string, date: string, nameKey = ''): string {
  const base = emailKey || phoneKey || nameKey || 'anon';
  return `${base}|${date}`;
}
