import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

/**
 * Leitor mínimo de .xlsx — SEM dependência externa.
 *
 * Um .xlsx é um ZIP com XMLs dentro. O projeto já assina JWT na mão (googleAuth.ts) e já tem
 * parser CSV próprio (util/csv.ts) em vez de arrastar libs; seguimos o mesmo padrão: `node:zlib`
 * abre o ZIP e um parser de tags resolve o XML. O escopo é deliberadamente estreito — ler o
 * export de vendas da Cakto —, não implementar a especificação OOXML.
 *
 * O que ele NÃO faz (e por que não precisa): fórmulas (o export não tem), estilos/formatos
 * (data vem como número de série e quem chama converte pela COLUNA, que é conhecida pelo
 * cabeçalho — parsear styles.xml só pra descobrir "isto é data" seria complexidade sem uso).
 */

/** Célula: string, número, ou null (vazia). Preserva o tipo — número não vira string com vírgula. */
export type XlsxCell = string | number | null;

const SIG_EOCD = 0x06054b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_LOCAL = 0x04034b50;

/** Descompacta as entradas do ZIP (só STORE e DEFLATE — é o que Excel/Cakto geram). */
function unzip(buf: Buffer): Map<string, Buffer> {
  const out = new Map<string, Buffer>();
  // O EOCD fica no fim; varre de trás pra frente (o comentário final tem no máximo 64KB).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0)
    throw new Error('Arquivo .xlsx inválido: fim do diretório central (EOCD) não encontrado.');

  const total = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);

  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(p) !== SIG_CENTRAL) break;
    const method = buf.readUInt16LE(p + 10);
    const compressedSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);

    if (buf.readUInt32LE(localOffset) === SIG_LOCAL) {
      // Os tamanhos confiáveis são os do diretório central; o local header pode vir zerado
      // (streaming/data descriptor), mas os offsets de nome/extra dele são os que valem.
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(start, start + compressedSize);
      out.set(name, method === 0 ? Buffer.from(raw) : inflateRawSync(raw));
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const ENTITIES: Record<string, string> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&apos;': "'",
};

function unescapeXml(s: string): string {
  return s
    .replace(/&(amp|lt|gt|quot|apos);/g, (m) => ENTITIES[m]!)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)));
}

/** sharedStrings.xml: cada <si> é uma string (rich text vem quebrado em vários <t>, que concatenam). */
function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const out: string[] = [];
  for (const si of xml.match(/<si\b[\s\S]*?<\/si>/g) ?? []) {
    let s = '';
    for (const t of si.match(/<t\b[^>]*>[\s\S]*?<\/t>/g) ?? []) {
      s += unescapeXml(t.replace(/^<t\b[^>]*>/, '').replace(/<\/t>$/, ''));
    }
    out.push(s);
  }
  return out;
}

/** "BC12" → 54 (índice 0-based da coluna). Ignora a parte numérica da referência. */
function colIndexFromRef(ref: string): number {
  let n = 0;
  for (const ch of ref) {
    const c = ch.charCodeAt(0);
    if (c < 65 || c > 90) break;
    n = n * 26 + (c - 64);
  }
  return n - 1;
}

function cellValue(cell: string, shared: string[]): XlsxCell {
  const type = /\bt="([^"]+)"/.exec(cell)?.[1] ?? 'n';
  if (type === 'inlineStr') {
    let s = '';
    for (const t of cell.match(/<t\b[^>]*>[\s\S]*?<\/t>/g) ?? []) {
      s += unescapeXml(t.replace(/^<t\b[^>]*>/, '').replace(/<\/t>$/, ''));
    }
    return s;
  }
  const raw = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(cell)?.[1];
  if (raw === undefined) return null;
  const v = unescapeXml(raw);
  if (type === 's') return shared[Number(v)] ?? '';
  if (type === 'str') return v;
  if (type === 'b') return v === '1' ? 'TRUE' : 'FALSE';
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

/**
 * Converte o XML de uma worksheet em matriz.
 *
 * ⚠️ As regex casam a TAG DE ABERTURA com `[^>]*` e tratam o self-closing como alternativa
 * separada. Um `[\s\S]*?(?:\/>|<\/row>)` parece equivalente e NÃO é: célula vazia vem como
 * `<c r="F2"/>`, e o `/>` dela encerraria a linha ali — o export real da Cakto perdia tudo a
 * partir da 6ª coluna, silenciosamente (o cabeçalho, que não tem célula vazia, vinha inteiro).
 */
export function parseWorksheetXml(xml: string, shared: string[]): XlsxCell[][] {
  const rows: XlsxCell[][] = [];
  for (const rowXml of xml.match(/<row\b[^>]*\/>|<row\b[^>]*>[\s\S]*?<\/row>/g) ?? []) {
    const rowNum = Number(/\br="(\d+)"/.exec(rowXml)?.[1] ?? rows.length + 1);
    const cells: XlsxCell[] = [];
    for (const cellXml of rowXml.match(/<c\b[^>]*\/>|<c\b[^>]*>[\s\S]*?<\/c>/g) ?? []) {
      const ref = /\br="([A-Z]+\d+)"/.exec(cellXml)?.[1];
      const idx = ref ? colIndexFromRef(ref) : cells.length;
      while (cells.length < idx) cells.push(null);
      cells[idx] = cellValue(cellXml, shared);
    }
    while (rows.length < rowNum - 1) rows.push([]);
    rows[rowNum - 1] = cells;
  }
  return rows;
}

/**
 * Lê a primeira planilha do .xlsx como matriz de linhas. Linhas/colunas vazias no meio são
 * preenchidas com null (as referências `r="C7"` são respeitadas — não dá pra assumir que as
 * células vêm todas, o Excel omite as vazias).
 */
export function readXlsxSheet(path: string): XlsxCell[][] {
  const files = unzip(readFileSync(path));
  const dec = (name: string): string | undefined => files.get(name)?.toString('utf8');

  const shared = parseSharedStrings(dec('xl/sharedStrings.xml'));
  const sheetName =
    [...files.keys()].find((k) => k === 'xl/worksheets/sheet1.xml') ??
    [...files.keys()].find((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k));
  if (!sheetName) {
    throw new Error(
      `"${path}" não parece um .xlsx válido: nenhuma planilha em xl/worksheets/. Conteúdo: ${[...files.keys()].slice(0, 10).join(', ')}`,
    );
  }
  return parseWorksheetXml(dec(sheetName)!, shared);
}

/** Epoch do Excel (1899-12-30 por causa do bug do ano 1900 herdado do Lotus). */
const EXCEL_EPOCH_MS = Date.UTC(1899, 11, 30);

/**
 * Serial de data do Excel → 'yyyy-mm-dd'. Trunca a hora de propósito: comparar venda com linha
 * da planilha é comparação de DIA (a planilha só guarda dd/MM/yyyy).
 */
export function excelSerialToISODate(serial: number): string {
  const ms = EXCEL_EPOCH_MS + Math.floor(serial) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}
