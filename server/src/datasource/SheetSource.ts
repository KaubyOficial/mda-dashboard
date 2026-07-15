import type { DataSource } from './DataSource.js';
import type { DataSnapshot } from '../domain/entities.js';
import type { UtmMap } from '../normalize/utm.js';
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

/**
 * Fonte de PRODUÇÃO/staging da planilha REAL "Mestres do Algoritmo _ OCDM" (11 abas).
 *  - 'sheet-csv': CÓPIA "qualquer pessoa com o link" → export CSV por gid (V1 dev, sem credencial).
 *  - 'sheet-api': Google Sheets API v4 read-only + service account (produção, Story 7.3).
 *
 * Usa 7 abas do funil OCDM/APLICAÇÃO: LEADS, AGENDAMENTOS & CALL, VENDAS,
 * ACOMPANHAMENTO DIÁRIO, MÉTRICAS ADS, TOP PÚBLICOS (RESPOSTAS é redundante — LEADS já traz MQL).
 * As abas C2 (CONTEÚDO | C2 | GERAL, ADS | C2) são de OUTRO funil e NÃO entram na V1.
 */
export interface SheetSourceOptions {
  mode: 'sheet-csv' | 'sheet-api';
  sheetId: string;
  gids: Record<string, string>;
  serviceAccountJsonPath?: string;
  utmMap: UtmMap;
}

export class SheetSource implements DataSource {
  readonly name: string;
  constructor(private readonly opts: SheetSourceOptions) {
    this.name = `sheet (${opts.mode})`;
  }

  private csvExportUrl(gid: string): string {
    return `https://docs.google.com/spreadsheets/d/${this.opts.sheetId}/export?format=csv&gid=${gid}`;
  }

  private async fetchTab(gid: string, label: string): Promise<string[][] | null> {
    if (!gid) return null;
    if (this.opts.mode === 'sheet-api') {
      // Story 7.3: substituir por spreadsheets.values.get (googleapis + service account).
      // A camada acima não muda — só a obtenção das linhas.
      throw new Error(
        'sheet-api ainda não implementado — depende da service account (Story 5.4/7.3). Use DATA_SOURCE=sheet-csv com a CÓPIA.',
      );
    }
    const res = await fetch(this.csvExportUrl(gid), { redirect: 'follow' });
    if (!res.ok) throw new Error(`Falha ao exportar aba ${label} (gid=${gid}): HTTP ${res.status}`);
    return parseCsv(await res.text());
  }

  async fetchAll(): Promise<DataSnapshot> {
    const warnings: string[] = [];
    if (!this.opts.sheetId) throw new Error('SHEET_ID vazio — configure o ID da planilha no .env.');
    const g = this.opts.gids;

    const [leadsRows, agRows, vRows, mdRows, maRows, mpRows] = await Promise.all([
      this.fetchTab(g.leads ?? '', 'LEADS'),
      this.fetchTab(g.agendamentos ?? '', 'AGENDAMENTOS & CALL'),
      this.fetchTab(g.vendas ?? '', 'VENDAS'),
      this.fetchTab(g.midiaDiaria ?? '', 'ACOMPANHAMENTO DIÁRIO'),
      this.fetchTab(g.midiaAnuncio ?? '', 'MÉTRICAS ADS'),
      this.fetchTab(g.midiaPublico ?? '', 'TOP PÚBLICOS'),
    ]);

    const leads = leadsRows ? parseLeadRows(leadsRows, this.opts.utmMap, warnings) : [];
    if (!leadsRows) warnings.push('LEADS: gid não configurado.');
    const agendamentos = agRows ? parseAgendamentoRows(agRows, warnings) : [];
    if (!agRows) warnings.push('AGENDAMENTOS: gid não configurado — funil comercial parcial.');
    const vendas = vRows ? parseVendaRows(vRows, warnings) : [];
    if (!vRows) warnings.push('VENDAS: gid não configurado — faturamento = 0.');
    const midiaDiaria = mdRows ? parseMidiaDiariaRows(mdRows) : [];
    if (!mdRows) warnings.push('ACOMPANHAMENTO DIÁRIO: gid não configurado — investimento = 0.');
    const midiaAnuncio = maRows ? parseMidiaAnuncioRows(maRows) : [];
    const midiaPublico = mpRows ? parseMidiaPublicoRows(mpRows) : [];

    mergeAdsIntoDiaria(midiaDiaria, midiaAnuncio);

    return { leads, agendamentos, vendas, midiaDiaria, midiaPublico, midiaAnuncio, warnings };
  }
}
