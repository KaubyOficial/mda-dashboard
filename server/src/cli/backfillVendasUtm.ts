import { loadConfig } from '../config.js';
import { GoogleServiceAccountAuth } from '../datasource/googleAuth.js';
import { SheetsApiClient, columnLetter } from '../datasource/sheetsApi.js';
import { headerIndex, normHeader } from '../util/csv.js';
import { normalizeEmail } from '../util/keys.js';
import {
  nomeCompativel,
  parseExportDate,
  parseExportNumber,
  readExportFile,
  type ExportCell,
} from '../cli/exportCakto.js';
import { parseDateISO } from '../util/parse.js';

/**
 * Backfill retroativo das colunas `Utm Source` / `Utm Medium` / `SCK` da aba VENDAS, a partir
 * do export oficial da Cakto (.csv ou .xlsx — o export traz Utm_source/Utm_medium/sck por
 * transação; o webhook só passou a gravar isso em 2026-08-07).
 *
 * MESMAS regras de segurança do backfill do telefone (a planilha é do cliente):
 *  - dry-run por padrão; só escreve com `--apply`;
 *  - escreve SÓ nas 3 colunas de UTM, célula a célula; NUNCA sobrescreve célula preenchida
 *    (divergência vira relatório); rodar 2× não muda nada;
 *  - casamento: e-mail primeiro; linha sem e-mail (histórico 2025) tenta valor exato
 *    (Comissão OU Valor Base) + data ±3 dias + tokens do nome, exigindo candidato ÚNICO;
 *  - transação sem UTM no export não gera escrita (não existe o que preencher).
 *
 * Uso:
 *   npm run backfill:utm --workspace server -- --export "<export.csv|.xlsx>"           (dry-run)
 *   npm run backfill:utm --workspace server -- --export "<export.csv|.xlsx>" --apply   (escreve)
 */

const SHEETS_RW_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const STATUS_VENDA = 'VENDA REALIZADA';
const DATE_WINDOW_DAYS = 3;

interface Transacao {
  email: string;
  nome: string;
  dataISO: string | null;
  comissao: number | null;
  valorBase: number | null;
  utmSource: string;
  utmMedium: string;
  sck: string;
}

function cellStr(v: ExportCell | undefined): string {
  return String(v ?? '').trim();
}

function readTransacoes(path: string): Transacao[] {
  const rows = readExportFile(path);
  if (rows.length < 2) throw new Error(`Export "${path}" está vazio ou só tem cabeçalho.`);
  const H = headerIndex(rows[0]!.map((c) => cellStr(c)));
  const idx = (name: string): number | undefined => H.get(normHeader(name));
  const need = (name: string): number => {
    const i = idx(name);
    if (i === undefined) {
      throw new Error(
        `Export "${path}" não tem a coluna "${name}". Colunas: ${rows[0]!.map((c) => cellStr(c)).join(' · ')}`,
      );
    }
    return i;
  };
  const iStatus = need('Status da Venda');
  const iEmail = need('Email do Cliente');
  const iNome = need('Nome do Cliente');
  const iData = idx('Data de Pagamento') ?? need('Data da Venda');
  const iComissao = need('Comissão');
  const iBase = idx('Valor Base do Produto');
  const iUtmSource = need('Utm_source');
  const iUtmMedium = need('Utm_medium');
  const iSck = need('sck');

  const out: Transacao[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    if (cellStr(row[iStatus]).toLowerCase() !== 'paid') continue;
    out.push({
      email: normalizeEmail(cellStr(row[iEmail])),
      nome: cellStr(row[iNome]),
      dataISO: parseExportDate(row[iData] ?? ''),
      comissao: parseExportNumber(row[iComissao] ?? ''),
      valorBase: iBase === undefined ? null : parseExportNumber(row[iBase] ?? ''),
      utmSource: cellStr(row[iUtmSource]),
      utmMedium: cellStr(row[iUtmMedium]),
      sck: cellStr(row[iSck]),
    });
  }
  return out;
}

function temUtm(t: Transacao): boolean {
  return Boolean(t.utmSource || t.utmMedium || t.sck);
}

function utmKey(t: Transacao): string {
  return `${t.utmSource}|${t.utmMedium}|${t.sck}`;
}

function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

function valorBate(alvo: number, t: Transacao): boolean {
  const eq = (x: number | null): boolean => x !== null && Math.abs(x - alvo) < 0.005;
  return eq(t.comissao) || eq(t.valorBase);
}

interface Escrita {
  a1: string;
  valor: string;
  quem: string;
}

async function writeCells(
  auth: GoogleServiceAccountAuth,
  spreadsheetId: string,
  tab: string,
  escritas: Escrita[],
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
      data: escritas.map((e) => ({
        range: `'${tab.replace(/'/g, "''")}'!${e.a1}`,
        majorDimension: 'ROWS',
        values: [[e.valor]],
      })),
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    if (res.status === 403) {
      throw new Error(
        `403 ao ESCREVER: a service account ${auth.clientEmail} precisa ser Editor na planilha ` +
          `(promover, rodar, voltar para Leitor). (HTTP 403: ${txt.slice(0, 300)})`,
      );
    }
    throw new Error(`Sheets API HTTP ${res.status} ao escrever: ${txt.slice(0, 300)}`);
  }
}

function parseArgs(argv: string[]): { exportPath: string; apply: boolean } {
  const i = argv.indexOf('--export');
  const exportPath = i >= 0 ? argv[i + 1] : undefined;
  if (!exportPath) {
    throw new Error(
      'Falta --export <caminho do export da Cakto (.csv ou .xlsx)>. Ex.: npm run backfill:utm --workspace server -- --export "C:\\...\\orders_report.xlsx"',
    );
  }
  return { exportPath, apply: argv.includes('--apply') };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const cfg = loadConfig();
  if (!cfg.sheetId) throw new Error('SHEET_ID não configurado no .env.');

  const transacoes = readTransacoes(args.exportPath);
  const comUtm = transacoes.filter(temUtm).length;
  console.log(`Export Cakto: ${args.exportPath}`);
  console.log(`  transações pagas: ${transacoes.length} · com alguma UTM: ${comUtm}`);

  const porEmail = new Map<string, Transacao[]>();
  for (const t of transacoes) {
    if (!t.email) continue;
    const arr = porEmail.get(t.email);
    if (arr) arr.push(t);
    else porEmail.set(t.email, [t]);
  }

  const tab = cfg.sheetTabs.vendas!;
  const reader = new SheetsApiClient(
    GoogleServiceAccountAuth.fromFile(cfg.googleServiceAccountJson),
    cfg.sheetId,
  );
  const rows = (await reader.batchGetTabs([tab])).get(tab) ?? [];
  if (rows.length < 2) throw new Error(`Aba "${tab}" vazia.`);
  const header = rows[0]!;
  const H = headerIndex(header);
  const col = (name: string): number | undefined => H.get(normHeader(name));
  const iData = col('Data');
  const iStatus = col('Status');
  const iNome = col('Nome');
  const iEmail = col('E-mail') ?? col('Email');
  const iValor = col('Valor');
  const alvos: { name: string; idx: number | undefined; pick: (t: Transacao) => string }[] = [
    { name: 'Utm Source', idx: col('Utm Source'), pick: (t) => t.utmSource },
    { name: 'Utm Medium', idx: col('Utm Medium'), pick: (t) => t.utmMedium },
    { name: 'SCK', idx: col('SCK'), pick: (t) => t.sck },
  ];
  const faltando = alvos.filter((a) => a.idx === undefined).map((a) => a.name);
  if (faltando.length > 0) {
    throw new Error(
      `A aba "${tab}" não tem a(s) coluna(s) ${faltando.join(', ')}. Crie primeiro com: npm run comercial:init --workspace server -- --vendas-cols`,
    );
  }
  console.log(`\nAba "${tab}": ${rows.length - 1} linhas · colunas de UTM = ${alvos.map((a) => columnLetter(a.idx!)).join('/')}`);

  const escritas: Escrita[] = [];
  const divergentes: string[] = [];
  const conflitos: string[] = [];
  const ambiguas: string[] = [];
  let jaPreenchidas = 0;
  let semMatch = 0;
  let matchSemUtm = 0;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const linha = r + 1;
    if (iStatus !== undefined && (row[iStatus] ?? '').trim().toUpperCase() !== STATUS_VENDA) continue;
    const quem = `linha ${linha} (${(row[iData ?? -1] ?? '').trim()} ${(row[iNome ?? -1] ?? '').trim()})`.trim();

    // já completa? (as 3 células preenchidas → nada a fazer, sem nem procurar match)
    const atuais = alvos.map((a) => (row[a.idx!] ?? '').trim());
    if (atuais.every(Boolean)) {
      jaPreenchidas++;
      continue;
    }

    // 1) casa por e-mail
    const email = normalizeEmail(row[iEmail ?? -1] ?? '');
    const dataISO = parseDateISO((row[iData ?? -1] ?? '').trim());
    let match: Transacao | null = null;
    const cands = email ? (porEmail.get(email) ?? []) : [];
    if (cands.length > 0) {
      const utms = new Set(cands.map(utmKey));
      if (utms.size === 1) {
        match = cands[0]!;
      } else {
        // mesmo comprador com UTMs diferentes (recompra por outro link): desempata pela data
        const perto = dataISO
          ? cands.filter((t) => t.dataISO && daysApart(t.dataISO, dataISO) <= DATE_WINDOW_DAYS)
          : [];
        if (new Set(perto.map(utmKey)).size === 1 && perto.length > 0) match = perto[0]!;
        else {
          conflitos.push(`${quem}: e-mail com ${utms.size} UTMs diferentes no export — conferir à mão`);
          continue;
        }
      }
    } else if (!email) {
      // 2) sem e-mail (histórico 2025): valor exato + data ±3d + nome compatível, candidato ÚNICO
      const valor = parseExportNumber((row[iValor ?? -1] ?? '').trim());
      const nome = (row[iNome ?? -1] ?? '').trim();
      if (valor === null || !dataISO || !nome) {
        semMatch++;
        continue;
      }
      const c2 = transacoes.filter(
        (t) =>
          valorBate(valor, t) &&
          t.dataISO !== null &&
          daysApart(t.dataISO, dataISO) <= DATE_WINDOW_DAYS &&
          nomeCompativel(nome, t.nome),
      );
      if (c2.length === 1) match = c2[0]!;
      else if (c2.length > 1 && new Set(c2.map(utmKey)).size === 1) match = c2[0]!;
      else if (c2.length > 1) {
        ambiguas.push(`${quem}: ${c2.length} candidatos com UTMs diferentes — não escrevo`);
        continue;
      }
    }

    if (!match) {
      semMatch++;
      continue;
    }
    if (!temUtm(match)) {
      matchSemUtm++;
      continue;
    }

    for (let a = 0; a < alvos.length; a++) {
      const alvo = alvos[a]!;
      const valorNovo = alvo.pick(match);
      const atual = atuais[a]!;
      if (!valorNovo) continue; // não escreve vazio
      if (atual) {
        if (atual !== valorNovo) divergentes.push(`${quem} · ${alvo.name}: planilha "${atual}" × export "${valorNovo}"`);
        continue; // nunca sobrescreve
      }
      escritas.push({ a1: `${columnLetter(alvo.idx!)}${linha}`, valor: valorNovo, quem });
    }
  }

  console.log('\n── PLANO ──');
  console.log(`  células a preencher: ${escritas.length}`);
  for (const e of escritas) console.log(`     ${e.a1}  ${e.valor}   ← ${e.quem}`);
  console.log(`  linhas já completas: ${jaPreenchidas} · match sem UTM no export: ${matchSemUtm} · sem match: ${semMatch}`);
  if (divergentes.length) {
    console.log(`  ⚠️ DIVERGENTES (NÃO escrevo): ${divergentes.length}`);
    for (const d of divergentes) console.log(`     ${d}`);
  }
  for (const c of conflitos) console.log(`  ⚠️ CONFLITO: ${c}`);
  for (const a of ambiguas) console.log(`  ⚠️ AMBÍGUA: ${a}`);

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
  console.log(`\n✔ ${escritas.length} célula(s) escritas na aba "${tab}".`);
  console.log('  Próximo passo: rodar o sync do dashboard (POST /api/sync) e conferir a seção Comercial.');
}

main().catch((e: unknown) => {
  console.error(`\n✖ ${(e as Error).message}`);
  process.exit(1);
});
