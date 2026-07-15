/** Normalização de chaves de cruzamento (§5.2). e-mail = primária; telefone = fallback; nome = terciária (VENDAS só tem nome). */

export function normalizeEmail(raw: string | null | undefined): string {
  if (!raw) return '';
  return String(raw).trim().toLowerCase();
}

/**
 * Telefone → só dígitos, removendo prefixo país 55, pra casar variantes com/sem 55 (§5.2).
 * Guarda os últimos 11 dígitos (DDD + número).
 */
export function normalizePhone(raw: string | null | undefined): string {
  if (!raw) return '';
  let d = String(raw).replace(/\D/g, '');
  if (!d) return '';
  if (d.startsWith('55') && d.length >= 12) d = d.slice(2);
  if (d.length > 11) d = d.slice(-11);
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
