import type { DataSource } from './DataSource.js';
import type { DataSnapshot } from '../domain/entities.js';
import type { UtmMap } from '../normalize/utm.js';
import type { VendaExclusion } from '../normalize/leadRows.js';
import {
  mergeAdsIntoDiaria,
  parseAgendamentoRows,
  parseLeadRows,
  parseMidiaAnuncioRows,
  parseMidiaDiariaRows,
  parseMidiaPublicoRows,
  parseVendaRows,
} from '../normalize/leadRows.js';
import { parseCsv } from '../util/csv.js';
import { GoogleServiceAccountAuth } from './googleAuth.js';
import { SheetsApiClient } from './sheetsApi.js';

/**
 * Fonte da planilha "Mestres do Algoritmo | OCDM".
 *  - 'sheet-csv': export CSV por gid; SÓ funciona em planilha "qualquer pessoa com o link".
 *    Usado na CÓPIA de dev — a planilha REAL tem PII de lead e não é (nem deve ser) pública.
 *  - 'sheet-api': Sheets API v4 read-only + service account (PRODUÇÃO, Story 7.3).
 *
 * Usa 6 abas do funil OCDM/APLICAÇÃO: LEADS, AGENDAMENTOS & CALL, VENDAS,
 * ACOMPANHAMENTO DIÁRIO, MÉTRICAS ADS, TOP PÚBLICOS (RESPOSTAS é redundante — LEADS já traz MQL).
 * As abas C2 (CONTEÚDO | C2 | GERAL, ADS | C2) são de OUTRO funil e NÃO entram na V1.
 */
export interface SheetSourceOptions {
  mode: 'sheet-csv' | 'sheet-api';
  sheetId: string;
  /** gids das abas — usados só no modo sheet-csv. */
  gids: Record<string, string>;
  /** nomes das abas — usados no modo sheet-api (gid não é estável entre cópia e real). */
  tabs?: Record<string, string>;
  serviceAccountJsonPath?: string;
  utmMap: UtmMap;
  /** Linhas de VENDAS que não existem no Cakto (reconciliação) — ver config/vendas-exclusions.json. */
  vendaExclusions?: VendaExclusion[];
}

/** Chave interna → rótulo humano/nome de aba padrão (conforme docs/data-dictionary.md). */
const TAB_LABELS: Record<string, string> = {
  leads: 'LEADS',
  agendamentos: 'AGENDAMENTOS & CALL',
  vendas: 'VENDAS',
  midiaDiaria: 'ACOMPANHAMENTO DIÁRIO',
  midiaAnuncio: 'MÉTRICAS ADS',
  midiaPublico: 'TOP PÚBLICOS',
};

/** Ordem canônica de leitura — mantida igual à do modo csv. */
const TAB_ORDER = [
  'leads',
  'agendamentos',
  'vendas',
  'midiaDiaria',
  'midiaAnuncio',
  'midiaPublico',
] as const;

/**
 * Compara nome de aba tolerando diferenças cosméticas (acento, caixa, espaço duplo,
 * espaço em volta). A planilha real é editada por humanos: "MÉTRICAS ADS " com espaço
 * no fim não pode derrubar o sync.
 */
function normalizeTabName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

export class SheetSource implements DataSource {
  readonly name: string;
  constructor(private readonly opts: SheetSourceOptions) {
    this.name = `sheet (${opts.mode})`;
  }

  private tabName(key: string): string {
    return this.opts.tabs?.[key] || TAB_LABELS[key] || key;
  }

  private csvExportUrl(gid: string): string {
    return `https://docs.google.com/spreadsheets/d/${this.opts.sheetId}/export?format=csv&gid=${gid}`;
  }

  private async fetchTabCsv(gid: string, label: string): Promise<string[][] | null> {
    if (!gid) return null;
    const res = await fetch(this.csvExportUrl(gid), { redirect: 'follow' });
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Aba ${label} (gid=${gid}): HTTP ${res.status}. O modo sheet-csv exige a planilha em "qualquer pessoa com o link". Para a planilha REAL (com PII), use DATA_SOURCE=sheet-api.`,
      );
    }
    if (!res.ok) throw new Error(`Falha ao exportar aba ${label} (gid=${gid}): HTTP ${res.status}`);
    return parseCsv(await res.text());
  }

  /** sheet-csv: uma requisição por aba, em paralelo. */
  private async fetchAllCsv(): Promise<Map<string, string[][] | null>> {
    const out = new Map<string, string[][] | null>();
    const results = await Promise.all(
      TAB_ORDER.map((key) => this.fetchTabCsv(this.opts.gids[key] ?? '', this.tabName(key))),
    );
    TAB_ORDER.forEach((key, i) => out.set(key, results[i] ?? null));
    return out;
  }

  /** sheet-api: resolve abas por nome contra os metadados reais, depois um batchGet. */
  private async fetchAllApi(warnings: string[]): Promise<Map<string, string[][] | null>> {
    if (!this.opts.serviceAccountJsonPath) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_JSON vazio — DATA_SOURCE=sheet-api exige a chave da service account.',
      );
    }
    const auth = GoogleServiceAccountAuth.fromFile(this.opts.serviceAccountJsonPath);
    const client = new SheetsApiClient(auth, this.opts.sheetId);

    const meta = await client.listTabs();
    const byNormalized = new Map(meta.map((t) => [normalizeTabName(t.title), t.title]));

    const resolved = new Map<string, string>(); // key -> título REAL na planilha
    const missing: string[] = [];
    for (const key of TAB_ORDER) {
      const wanted = this.tabName(key);
      const actual = byNormalized.get(normalizeTabName(wanted));
      if (actual) resolved.set(key, actual);
      else missing.push(wanted);
    }

    if (missing.length > 0) {
      throw new Error(
        `Abas não encontradas na planilha ${this.opts.sheetId}: ${missing.join(', ')}. ` +
          `Abas existentes: ${meta.map((t) => t.title).join(' | ')}. ` +
          `Ajuste os SHEET_TAB_* no .env se a planilha real usa outros nomes.`,
      );
    }

    const titles = TAB_ORDER.map((k) => resolved.get(k) as string);
    const values = await client.batchGetTabs(titles);

    const out = new Map<string, string[][] | null>();
    for (const key of TAB_ORDER) {
      const title = resolved.get(key) as string;
      const rows = values.get(title) ?? [];
      if (rows.length === 0) warnings.push(`Aba "${title}" veio vazia da API.`);
      out.set(key, rows);
    }
    return out;
  }

  async fetchAll(): Promise<DataSnapshot> {
    const warnings: string[] = [];
    if (!this.opts.sheetId) throw new Error('SHEET_ID vazio — configure o ID da planilha no .env.');

    const tabs =
      this.opts.mode === 'sheet-api' ? await this.fetchAllApi(warnings) : await this.fetchAllCsv();

    const leadsRows = tabs.get('leads') ?? null;
    const agRows = tabs.get('agendamentos') ?? null;
    const vRows = tabs.get('vendas') ?? null;
    const mdRows = tabs.get('midiaDiaria') ?? null;
    const maRows = tabs.get('midiaAnuncio') ?? null;
    const mpRows = tabs.get('midiaPublico') ?? null;

    const leads = leadsRows ? parseLeadRows(leadsRows, this.opts.utmMap, warnings) : [];
    if (!leadsRows) warnings.push('LEADS: gid não configurado.');
    const agendamentos = agRows ? parseAgendamentoRows(agRows, warnings) : [];
    if (!agRows) warnings.push('AGENDAMENTOS: gid não configurado — funil comercial parcial.');
    const vendas = vRows ? parseVendaRows(vRows, warnings, this.opts.vendaExclusions ?? []) : [];
    if (!vRows) warnings.push('VENDAS: gid não configurado — faturamento = 0.');
    const midiaDiaria = mdRows ? parseMidiaDiariaRows(mdRows) : [];
    if (!mdRows) warnings.push('ACOMPANHAMENTO DIÁRIO: gid não configurado — investimento = 0.');
    const midiaAnuncio = maRows ? parseMidiaAnuncioRows(maRows) : [];
    const midiaPublico = mpRows ? parseMidiaPublicoRows(mpRows) : [];

    mergeAdsIntoDiaria(midiaDiaria, midiaAnuncio);

    return { leads, agendamentos, vendas, midiaDiaria, midiaPublico, midiaAnuncio, warnings };
  }
}
