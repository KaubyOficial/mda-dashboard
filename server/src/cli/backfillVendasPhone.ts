import { readFileSync } from 'node:fs';
import { loadConfig } from '../config.js';
import { GoogleServiceAccountAuth } from '../datasource/googleAuth.js';
import { SheetsApiClient, columnLetter } from '../datasource/sheetsApi.js';
import { parseCsv, headerIndex, normHeader } from '../util/csv.js';
import { normalizeEmail, normalizePhone } from '../util/keys.js';

/**
 * Backfill retroativo da coluna `Phone` da aba VENDAS, a partir do export oficial da Cakto.
 *
 * POR QUE existe: o fluxo n8n só passou a gravar `data.customer.phone` em 2026-08-03, e sem
 * telefone a venda só casa com o lead por e-mail (o do CHECKOUT, que muitas vezes é outro) ou
 * por nome (a aba LEADS guarda muitas vezes só o primeiro nome). O export da Cakto traz
 * `Telefone do Cliente` em 100% das transações — é a única fonte que fecha o histórico.
 *
 * REGRAS DE SEGURANÇA (a planilha é do cliente, não nossa):
 *  - dry-run por padrão; só escreve com `--apply`;
 *  - escreve EXCLUSIVAMENTE na coluna `Phone` da aba VENDAS, célula a célula, nunca em bloco
 *    que possa deslocar linha;
 *  - nunca sobrescreve célula já preenchida: se o telefone da planilha divergir do export, a
 *    linha vira relatório para conferência humana, nunca escrita silenciosa;
 *  - e-mail é a chave (o mesmo comprador tem o mesmo telefone em todas as parcelas); e-mail com
 *    2 telefones diferentes no export vira CONFLITO e é pulado — nunca chuta;
 *  - linha sem e-mail na planilha é reportada, nunca adivinhada por nome.
 *
 * A escrita mora AQUI, e não no `SheetsApiClient`: o cliente do dashboard é read-only por
 * contrato (escopo `spreadsheets.readonly`) e continua assim. Esta ferramenta é a única coisa
 * do repo que pede escopo de escrita, e só quando invocada à mão.
 *
 * Uso:
 *   npm run backfill:phone --workspace server -- --csv "<export.csv>"            (dry-run)
 *   npm run backfill:phone --workspace server -- --csv "<export.csv>" --apply    (escreve)
 */

const SHEETS_RW_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const STATUS_VENDA = 'VENDA REALIZADA';
/** Nome da coluna na aba VENDAS (mesmos aliases que o parser do dashboard aceita). */
const PHONE_HEADERS = ['Phone', 'Telefone', 'CellPhone', 'Celular', 'Whatsapp'];
/** Colunas do export da Cakto usadas aqui. */
const CSV_EMAIL = 'Email do Cliente';
const CSV_PHONE = 'Telefone do Cliente';
const CSV_STATUS = 'Status da Venda';
const CSV_NAME = 'Nome do Cliente';
const CSV_PAID = 'paid';

interface Args {
  csvPath: string;
  apply: boolean;
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const csvPath = get('--csv');
  if (!csvPath) {
    throw new Error(
      'Falta --csv <caminho do export da Cakto>. Ex.: npm run backfill:phone --workspace server -- --csv "C:\\Users\\...\\CAKTO MENTORIA JULHO.csv"',
    );
  }
  return { csvPath, apply: argv.includes('--apply') };
}

interface CaktoCustomer {
  phoneRaw: string;
  nome: string;
  transacoes: number;
}

/** e-mail → telefone do export. E-mail com telefones divergentes é devolvido em `conflitos`. */
function readCaktoExport(path: string): {
  porEmail: Map<string, CaktoCustomer>;
  conflitos: string[];
  totalPagas: number;
  semTelefone: number;
} {
  const rows = parseCsv(readFileSync(path, 'utf8'));
  if (rows.length < 2) throw new Error(`Export "${path}" está vazio ou só tem cabeçalho.`);
  const H = headerIndex(rows[0]!);
  const need = (name: string): number => {
    const i = H.get(normHeader(name));
    if (i === undefined) {
      throw new Error(
        `Export "${path}" não tem a coluna "${name}". Colunas encontradas: ${rows[0]!.join(' · ')}`,
      );
    }
    return i;
  };
  const iEmail = need(CSV_EMAIL);
  const iPhone = need(CSV_PHONE);
  const iStatus = need(CSV_STATUS);
  const iName = need(CSV_NAME);

  const porEmail = new Map<string, CaktoCustomer>();
  const conflitos: string[] = [];
  let totalPagas = 0;
  let semTelefone = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    if ((row[iStatus] ?? '').trim().toLowerCase() !== CSV_PAID) continue;
    totalPagas++;
    const email = normalizeEmail(row[iEmail] ?? '');
    const phoneRaw = (row[iPhone] ?? '').trim();
    if (!email) continue;
    if (!phoneRaw) {
      semTelefone++;
      continue;
    }
    const atual = porEmail.get(email);
    if (!atual) {
      porEmail.set(email, { phoneRaw, nome: (row[iName] ?? '').trim(), transacoes: 1 });
      continue;
    }
    atual.transacoes++;
    if (normalizePhone(atual.phoneRaw) !== normalizePhone(phoneRaw)) {
      conflitos.push(`${email}: "${atual.phoneRaw}" × "${phoneRaw}"`);
      porEmail.delete(email); // 2 telefones para o mesmo comprador → não escrevemos nenhum
    }
  }
  return { porEmail, conflitos, totalPagas, semTelefone };
}

/** Índice da coluna Phone (0-based) na aba VENDAS, ou erro acionável listando o header real. */
function findPhoneColumn(header: string[]): number {
  const H = headerIndex(header);
  for (const name of PHONE_HEADERS) {
    const i = H.get(normHeader(name));
    if (i !== undefined) return i;
  }
  throw new Error(
    `A aba VENDAS não tem coluna de telefone (procurei por ${PHONE_HEADERS.join('/')}). ` +
      `Crie a coluna primeiro. Header atual: ${header.join(' · ')}`,
  );
}

interface Escrita {
  linha: number; // 1-based, como a planilha mostra
  a1: string;
  valor: string;
  quem: string;
}

/** Escreve as células planejadas. Só chamado com --apply. */
async function writeCells(
  auth: GoogleServiceAccountAuth,
  spreadsheetId: string,
  tab: string,
  escritas: Escrita[],
): Promise<void> {
  const url =
    `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;
  const body = {
    valueInputOption: 'RAW',
    data: escritas.map((e) => ({
      range: `'${tab.replace(/'/g, "''")}'!${e.a1}`,
      majorDimension: 'ROWS',
      values: [[e.valor]],
    })),
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await auth.getAccessToken()}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 403) {
      throw new Error(
        `403 ao ESCREVER: a service account ${auth.clientEmail} não tem permissão de Editor na planilha ` +
          `(ela é Leitor por padrão, de propósito). Compartilhe a planilha com esse e-mail como Editor, ` +
          `rode o backfill e volte para Leitor depois. (HTTP 403: ${txt.slice(0, 300)})`,
      );
    }
    throw new Error(`Sheets API HTTP ${res.status} ao escrever: ${txt.slice(0, 300)}`);
  }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig();
  if (!cfg.sheetId) throw new Error('SHEET_ID não configurado no .env.');

  const cakto = readCaktoExport(args.csvPath);
  console.log(`Export Cakto: ${args.csvPath}`);
  console.log(
    `  transações pagas: ${cakto.totalPagas} · compradores únicos com telefone: ${cakto.porEmail.size}` +
      (cakto.semTelefone ? ` · sem telefone: ${cakto.semTelefone}` : ''),
  );
  for (const c of cakto.conflitos) console.log(`  ⚠️ CONFLITO (pulado): ${c}`);

  // Leitura da aba: o cliente read-only do dashboard, sem escopo de escrita.
  const tab = cfg.sheetTabs.vendas!;
  const reader = new SheetsApiClient(
    GoogleServiceAccountAuth.fromFile(cfg.googleServiceAccountJson),
    cfg.sheetId,
  );
  const rows = (await reader.batchGetTabs([tab])).get(tab) ?? [];
  if (rows.length < 2) throw new Error(`Aba "${tab}" vazia.`);
  const header = rows[0]!;
  const iPhone = findPhoneColumn(header);
  const iEmail = headerIndex(header).get(normHeader('E-mail'));
  const iStatus = headerIndex(header).get(normHeader('Status'));
  const iName = headerIndex(header).get(normHeader('Nome'));
  const iData = headerIndex(header).get(normHeader('Data'));
  if (iEmail === undefined) throw new Error(`Aba "${tab}" sem coluna E-mail — impossível casar.`);
  const letra = columnLetter(iPhone);
  console.log(`\nAba "${tab}": ${rows.length - 1} linhas · coluna de telefone = ${letra} ("${header[iPhone]}")`);

  const escritas: Escrita[] = [];
  const jaPreenchidas: string[] = [];
  const divergentes: string[] = [];
  const semEmail: string[] = [];
  let foraDoExport = 0;
  let naoVenda = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const linha = r + 1; // 1-based na planilha (linha 1 = header)
    const status = (row[iStatus ?? -1] ?? '').trim().toUpperCase();
    if (iStatus !== undefined && status !== STATUS_VENDA) {
      naoVenda++;
      continue;
    }
    const quem = `${(row[iData ?? -1] ?? '').trim()} ${(row[iName ?? -1] ?? '').trim()}`.trim();
    const email = normalizeEmail(row[iEmail] ?? '');
    if (!email) {
      semEmail.push(`linha ${linha}: ${quem || '(sem nome)'}`);
      continue;
    }
    const cliente = cakto.porEmail.get(email);
    if (!cliente) {
      foraDoExport++;
      continue;
    }
    const atual = (row[iPhone] ?? '').trim();
    if (atual) {
      if (normalizePhone(atual) === normalizePhone(cliente.phoneRaw)) {
        jaPreenchidas.push(`linha ${linha}`);
      } else {
        divergentes.push(`linha ${linha} (${quem}): planilha "${atual}" × export "${cliente.phoneRaw}"`);
      }
      continue; // idempotente: nunca sobrescreve
    }
    escritas.push({ linha, a1: `${letra}${linha}`, valor: cliente.phoneRaw, quem });
  }

  console.log('\n── PLANO ──');
  console.log(`  a preencher: ${escritas.length}`);
  for (const e of escritas) console.log(`     ${e.a1}  ${e.valor}   ← ${e.quem}`);
  console.log(`  já preenchidas com o mesmo telefone (nada a fazer): ${jaPreenchidas.length}`);
  if (divergentes.length) {
    console.log(`  ⚠️ DIVERGENTES (NÃO escrevo — confira à mão): ${divergentes.length}`);
    for (const d of divergentes) console.log(`     ${d}`);
  }
  if (semEmail.length) {
    console.log(`  ⚠️ sem e-mail na planilha (não dá pra casar): ${semEmail.length}`);
    for (const s of semEmail) console.log(`     ${s}`);
  }
  console.log(`  fora deste export (outro período): ${foraDoExport} · linhas não-venda ignoradas: ${naoVenda}`);

  if (!args.apply) {
    console.log('\nDRY-RUN — nada foi escrito. Repita com --apply para gravar.');
    return;
  }
  if (escritas.length === 0) {
    console.log('\nNada a escrever.');
    return;
  }

  const writer = GoogleServiceAccountAuth.fromFile(cfg.googleServiceAccountJson, SHEETS_RW_SCOPE);
  await writeCells(writer, cfg.sheetId, tab, escritas);
  console.log(`\n✔ ${escritas.length} célula(s) escritas na coluna ${letra} da aba "${tab}".`);
  console.log('  Próximo passo: rodar o sync do dashboard (POST /api/sync) e conferir o funil.');
}

main().catch((e: unknown) => {
  console.error(`\n✖ ${(e as Error).message}`);
  process.exit(1);
});
