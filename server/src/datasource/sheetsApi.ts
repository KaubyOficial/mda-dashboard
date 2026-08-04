import type { GoogleServiceAccountAuth } from './googleAuth.js';

/**
 * Cliente mínimo da Google Sheets API v4 (read-only), via fetch.
 *
 * Por que resolver aba por NOME e não por gid: os gids do .env são os da CÓPIA
 * (`1Y2sw…`). Copiar uma planilha NÃO garante preservação de gid, então apontar o
 * SHEET_ID para a planilha REAL mantendo os gids antigos leria a aba errada (ou 400)
 * — e silenciosamente, que é o pior modo de falhar num dashboard financeiro.
 * O nome da aba é o contrato estável e é o que o dicionário de dados documenta.
 */
const API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface SheetTabMeta {
  title: string;
  sheetId: number;
  rowCount: number;
  columnCount: number;
}

/** Aspas simples dentro do nome da aba dobram, em notação A1. */
function quoteA1Title(title: string): string {
  return `'${title.replace(/'/g, "''")}'`;
}

/** Índice de coluna 0-based → letra A1 (0→A, 8→I, 26→AA). Usado pelo backfill da coluna Phone. */
export function columnLetter(index0: number): string {
  let n = index0 + 1;
  let s = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export class SheetsApiClient {
  constructor(
    private readonly auth: GoogleServiceAccountAuth,
    private readonly spreadsheetId: string,
  ) {}

  private async request(url: string): Promise<unknown> {
    const doFetch = async (): Promise<Response> => {
      const token = await this.auth.getAccessToken();
      return fetch(url, { headers: { authorization: `Bearer ${token}` } });
    };

    let res = await doFetch();
    if (res.status === 401) {
      // Token pode ter sido revogado antes do exp — uma retentativa com token novo.
      this.auth.invalidate();
      res = await doFetch();
    }
    if (!res.ok) {
      const body = await res.text();
      throw new Error(this.explainError(res.status, body));
    }
    return JSON.parse(await res.text());
  }

  /** Traduz os erros que realmente acontecem em setup para uma ação concreta. */
  private explainError(status: number, body: string): string {
    const snippet = body.slice(0, 300);
    if (status === 403 && /caller does not have permission|PERMISSION_DENIED/i.test(body)) {
      return `403 — a planilha ${this.spreadsheetId} NÃO está compartilhada com ${this.auth.clientEmail}. Abra a planilha → Compartilhar → adicione esse e-mail como Leitor. (HTTP 403: ${snippet})`;
    }
    if (status === 403 && /has not been used in project|SERVICE_DISABLED/i.test(body)) {
      return `403 — a Google Sheets API está DESATIVADA no projeto da service account. Ative em: APIs & Services → Library → Google Sheets API → Enable. (HTTP 403: ${snippet})`;
    }
    if (status === 404) {
      return `404 — planilha ${this.spreadsheetId} não encontrada. Confira o SHEET_ID (é o trecho entre /d/ e /edit na URL). (HTTP 404: ${snippet})`;
    }
    if (status === 429) {
      return `429 — quota da Sheets API estourada (limite por minuto). Aumente SYNC_INTERVAL_MINUTES. (HTTP 429: ${snippet})`;
    }
    return `Sheets API HTTP ${status} em ${this.spreadsheetId}: ${snippet}`;
  }

  /** Metadados das abas — sem valores (fields restrito = resposta pequena e rápida). */
  async listTabs(): Promise<SheetTabMeta[]> {
    const url = `${API_BASE}/${encodeURIComponent(this.spreadsheetId)}?fields=${encodeURIComponent(
      'sheets.properties(title,sheetId,gridProperties(rowCount,columnCount))',
    )}`;
    const json = (await this.request(url)) as {
      sheets?: Array<{
        properties?: {
          title?: string;
          sheetId?: number;
          gridProperties?: { rowCount?: number; columnCount?: number };
        };
      }>;
    };
    return (json.sheets ?? []).map((s) => ({
      title: s.properties?.title ?? '',
      sheetId: s.properties?.sheetId ?? -1,
      rowCount: s.properties?.gridProperties?.rowCount ?? 0,
      columnCount: s.properties?.gridProperties?.columnCount ?? 0,
    }));
  }

  /**
   * Lê várias abas inteiras numa chamada. UNFORMATTED_VALUE mantém número como número
   * (o parser BR já trata string), mas datas viriam como serial — por isso
   * FORMATTED_VALUE: preserva exatamente o que o modo sheet-csv entregava aos
   * parsers, mantendo a reconciliação ao centavo válida.
   */
  async batchGetTabs(titles: string[]): Promise<Map<string, string[][]>> {
    const out = new Map<string, string[][]>();
    if (titles.length === 0) return out;

    const params = new URLSearchParams();
    for (const t of titles) params.append('ranges', quoteA1Title(t));
    params.set('majorDimension', 'ROWS');
    params.set('valueRenderOption', 'FORMATTED_VALUE');
    params.set('dateTimeRenderOption', 'FORMATTED_STRING');

    const url = `${API_BASE}/${encodeURIComponent(this.spreadsheetId)}/values:batchGet?${params.toString()}`;
    const json = (await this.request(url)) as {
      valueRanges?: Array<{ range?: string; values?: string[][] }>;
    };
    const ranges = json.valueRanges ?? [];
    // A ordem de valueRanges espelha a ordem dos ranges enviados.
    titles.forEach((title, i) => {
      const rows = ranges[i]?.values ?? [];
      out.set(
        title,
        rows.map((r) => r.map((c) => (c == null ? '' : String(c)))),
      );
    });
    return out;
  }
}
