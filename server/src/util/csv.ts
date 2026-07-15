/**
 * Parser CSV robusto (RFC-4180-ish): aceita aspas, vírgulas e quebras de linha DENTRO de células
 * (a planilha OCDM tem respostas multi-linha entre aspas — §2.2). Sem dependência externa.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let field = '';
  let row: string[] = [];
  let inQuotes = false;
  // remove BOM
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c === '\r') {
      // ignora; \r\n tratado pelo \n
    } else {
      field += c;
    }
  }
  // última célula/linha (se o arquivo não termina em \n)
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Normaliza um header pra chave de lookup: sem acento, sem quebras, espaços colapsados, maiúsculo. */
export function normHeader(h: string): string {
  return h
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** Constrói um mapa header->índice tolerante (trim + colapsa espaços/quebras + sem acento). */
export function headerIndex(header: string[]): Map<string, number> {
  const m = new Map<string, number>();
  header.forEach((h, i) => {
    const key = normHeader(h);
    if (!m.has(key)) m.set(key, i);
  });
  return m;
}
