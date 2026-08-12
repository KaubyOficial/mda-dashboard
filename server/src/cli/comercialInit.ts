import { loadConfig } from '../config.js';
import { GoogleServiceAccountAuth } from '../datasource/googleAuth.js';
import { SheetsApiClient, columnLetter } from '../datasource/sheetsApi.js';
import { headerIndex, normHeader } from '../util/csv.js';

/**
 * Setup one-off da seção Comercial na planilha (2026-08-07). Duas coisas, ambas idempotentes:
 *
 *  1. Cria a aba `LEADS COMERCIAL` (Data · Vendedor · Nome · E-mail · Telefone) — o lugar onde
 *     a lista de contatos de cada vendedor é colada (do CSV que ele exporta).
 *  2. `--vendas-cols`: acrescenta ao FIM do header da aba VENDAS as colunas `Utm Source` ·
 *     `Utm Medium` · `SCK` (só as que faltarem), onde o n8n grava a UTM do checkout e o
 *     backfill grava o histórico. NÃO mexe em nenhuma coluna existente.
 *
 * Igual ao backfill do telefone, a escrita mora AQUI e não no cliente do dashboard (que é
 * read-only por contrato). Exige a service account como EDITOR na planilha — promover, rodar,
 * voltar para Leitor.
 *
 * Uso:
 *   npm run comercial:init --workspace server                    (só a aba LEADS COMERCIAL)
 *   npm run comercial:init --workspace server -- --vendas-cols   (aba + colunas na VENDAS)
 */

const SHEETS_RW_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const LEADS_COMERCIAL_HEADERS = ['Data', 'Vendedor', 'Nome', 'E-mail', 'Telefone'];
const VENDAS_UTM_HEADERS = ['Utm Source', 'Utm Medium', 'SCK'];

function normalizeTabName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

async function writeValues(
  auth: GoogleServiceAccountAuth,
  spreadsheetId: string,
  data: { range: string; values: string[][] }[],
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await auth.getAccessToken()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: data.map((d) => ({ ...d, majorDimension: 'ROWS' })),
    }),
  });
  if (!res.ok) throw await writeError(res, auth);
}

async function batchUpdateSpreadsheet(
  auth: GoogleServiceAccountAuth,
  spreadsheetId: string,
  requests: unknown[],
): Promise<void> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await auth.getAccessToken()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });
  if (!res.ok) throw await writeError(res, auth);
}

async function addSheetTab(
  auth: GoogleServiceAccountAuth,
  spreadsheetId: string,
  title: string,
): Promise<void> {
  await batchUpdateSpreadsheet(auth, spreadsheetId, [{ addSheet: { properties: { title } } }]);
}

/** O grid da aba pode ter EXATAMENTE o nº de colunas usadas (VENDAS = 9) — expandir antes de escrever. */
async function ensureColumns(
  auth: GoogleServiceAccountAuth,
  spreadsheetId: string,
  sheetId: number,
  columnCount: number,
  needed: number,
): Promise<void> {
  if (needed <= columnCount) return;
  await batchUpdateSpreadsheet(auth, spreadsheetId, [
    { appendDimension: { sheetId, dimension: 'COLUMNS', length: needed - columnCount } },
  ]);
}

async function writeError(res: Response, auth: GoogleServiceAccountAuth): Promise<Error> {
  const txt = await res.text();
  if (res.status === 403) {
    return new Error(
      `403 ao ESCREVER: a service account ${auth.clientEmail} não tem permissão de Editor na planilha ` +
        `(ela é Leitor por padrão, de propósito). Compartilhe como Editor, rode de novo e volte para Leitor. ` +
        `(HTTP 403: ${txt.slice(0, 300)})`,
    );
  }
  return new Error(`Sheets API HTTP ${res.status} ao escrever: ${txt.slice(0, 300)}`);
}

function quoteTab(tab: string): string {
  return `'${tab.replace(/'/g, "''")}'`;
}

async function main(): Promise<void> {
  const vendasCols = process.argv.includes('--vendas-cols');
  const cfg = loadConfig();
  if (!cfg.sheetId) throw new Error('SHEET_ID não configurado no .env.');

  const reader = new SheetsApiClient(
    GoogleServiceAccountAuth.fromFile(cfg.googleServiceAccountJson),
    cfg.sheetId,
  );
  const writer = GoogleServiceAccountAuth.fromFile(cfg.googleServiceAccountJson, SHEETS_RW_SCOPE);
  const tabs = await reader.listTabs();

  // 1 — aba LEADS COMERCIAL
  const wanted = cfg.sheetTabs.leadsComercial!;
  const existing = tabs.find((t) => normalizeTabName(t.title) === normalizeTabName(wanted));
  if (existing) {
    console.log(`Aba "${existing.title}" já existe — nada a criar.`);
    const rows = (await reader.batchGetTabs([existing.title])).get(existing.title) ?? [];
    const header = rows[0] ?? [];
    const H = headerIndex(header);
    const faltam = LEADS_COMERCIAL_HEADERS.filter((h) => H.get(normHeader(h)) === undefined);
    if (faltam.length > 0) {
      console.log(`  ⚠️ header incompleto — faltam: ${faltam.join(', ')} (header atual: ${header.join(' · ') || '(vazio)'})`);
      if (header.length === 0) {
        await writeValues(writer, cfg.sheetId, [
          { range: `${quoteTab(existing.title)}!A1`, values: [LEADS_COMERCIAL_HEADERS] },
        ]);
        console.log(`  ✔ header escrito: ${LEADS_COMERCIAL_HEADERS.join(' · ')}`);
      } else {
        console.log('  Header já tem conteúdo próprio — não mexo. Ajuste à mão se quiser os nomes padrão.');
      }
    }
  } else {
    await addSheetTab(writer, cfg.sheetId, wanted);
    await writeValues(writer, cfg.sheetId, [
      { range: `${quoteTab(wanted)}!A1`, values: [LEADS_COMERCIAL_HEADERS] },
    ]);
    console.log(`✔ Aba "${wanted}" criada com header: ${LEADS_COMERCIAL_HEADERS.join(' · ')}`);
    console.log('  Cole ali a lista de cada vendedor (Vendedor = slug do link: leo, gabriel…).');
  }

  // 2 — colunas de UTM na aba VENDAS
  if (!vendasCols) {
    console.log('\n(para criar as colunas Utm Source/Utm Medium/SCK na aba VENDAS, repita com --vendas-cols)');
    return;
  }
  const vendasTab = cfg.sheetTabs.vendas!;
  const vt = tabs.find((t) => normalizeTabName(t.title) === normalizeTabName(vendasTab));
  if (!vt) throw new Error(`Aba "${vendasTab}" não encontrada na planilha.`);
  const vRows = (await reader.batchGetTabs([vt.title])).get(vt.title) ?? [];
  const header = vRows[0] ?? [];
  const H = headerIndex(header);
  const faltantes = VENDAS_UTM_HEADERS.filter((h) => H.get(normHeader(h)) === undefined);
  if (faltantes.length === 0) {
    console.log(`\nAba "${vt.title}": colunas de UTM já existem — nada a fazer.`);
    return;
  }
  // acrescenta SÓ ao fim do header (nunca desloca coluna existente); expande o grid se preciso
  await ensureColumns(writer, cfg.sheetId, vt.sheetId, vt.columnCount, header.length + faltantes.length);
  let next = header.length;
  const writes = faltantes.map((h) => ({
    range: `${quoteTab(vt.title)}!${columnLetter(next++)}1`,
    values: [[h]],
  }));
  await writeValues(writer, cfg.sheetId, writes);
  console.log(
    `\n✔ Aba "${vt.title}": coluna(s) ${faltantes.join(' · ')} criada(s) a partir de ${columnLetter(header.length)}1.`,
  );
  console.log('  Próximos passos: backfill (npm run backfill:utm) e n8n gravando as 3 colunas (docs/n8n).');
}

main().catch((e: unknown) => {
  console.error(`\n✖ ${(e as Error).message}`);
  process.exit(1);
});
