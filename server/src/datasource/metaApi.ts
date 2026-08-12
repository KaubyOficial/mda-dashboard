/**
 * Cliente mínimo da Meta Marketing API (Graph), read-only, via fetch — zero dep nova.
 *
 * Porquê existir: as abas MÉTRICAS ADS e TOP PÚBLICOS são preenchidas por uma automação
 * do gestor de tráfego que PAROU em 2026-06-23. Sem elas o dashboard perde o relatório
 * por anúncio, por público e a etapa "Visualizou a LP" do funil de marketing (que é
 * agregada das ADS, não uma coluna da ACOMPANHAMENTO). A API devolve exatamente os
 * mesmos números — conferido contra a planilha em 22–23/06/2026: gasto, impressões,
 * inline_link_clicks e leads batem EXATOS, por dia e por anúncio.
 *
 * Não escreve nada: só GET em /insights e no nó da conta.
 */

const GRAPH_BASE = 'https://graph.facebook.com';

/** Uma linha crua de /insights. Os campos variam com o `level` pedido. */
export interface MetaInsightRow {
  date_start: string;
  date_stop?: string;
  campaign_name?: string;
  adset_name?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  inline_link_clicks?: string;
  actions?: Array<{ action_type: string; value: string }>;
}

export interface MetaAccountInfo {
  id: string;
  name: string;
  currency: string;
  timezoneName: string;
  accountStatus: number;
}

export type MetaLevel = 'ad' | 'adset' | 'campaign' | 'account';

export interface MetaInsightsQuery {
  level: MetaLevel;
  since: string; // YYYY-MM-DD
  until: string; // YYYY-MM-DD
  fields: string[];
}

/** Erros que valem retentativa: throttling da Marketing API e instabilidade transitória. */
const RETRYABLE_CODES = new Set([1, 2, 4, 17, 32, 341, 613]);

/**
 * "Please reduce the amount of data you're asking for" — code 1, mas NÃO é transitório:
 * repetir a mesma janela dá o mesmo erro. Quem resolve é recortar o período (o cliente
 * parte a janela ao meio sozinho). Aconteceu de verdade no backfill de 20 meses.
 */
export function isDataVolumeError(code: number, message: string): boolean {
  return code === 1 && /reduce the amount of data/i.test(message);
}

export interface MetaClientOptions {
  token: string;
  /** aceita '1695002784410550' ou 'act_1695002784410550' */
  accountId: string;
  apiVersion?: string;
  /** page size do /insights — a API responde 500 sem reclamar */
  pageSize?: number;
  /** teto de páginas por consulta (backstop anti-loop) */
  maxPages?: number;
  /** tamanho do bloco de dias por requisição (o backfill inteiro não cabe num pedido só) */
  chunkDays?: number;
  /** injetável nos testes */
  fetchImpl?: typeof fetch;
  /** injetável nos testes — sem isso o backoff faria o teste dormir de verdade */
  sleepImpl?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class MetaAdsClient {
  readonly accountId: string;
  private readonly token: string;
  private readonly apiVersion: string;
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly chunkDays: number;
  private readonly doFetch: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: MetaClientOptions) {
    if (!opts.token) throw new Error('META_ACCESS_TOKEN vazio.');
    if (!opts.accountId) throw new Error('META_AD_ACCOUNT_ID vazio.');
    this.token = opts.token;
    this.accountId = opts.accountId.startsWith('act_') ? opts.accountId : `act_${opts.accountId}`;
    this.apiVersion = opts.apiVersion || 'v23.0';
    this.pageSize = opts.pageSize ?? 500;
    this.maxPages = opts.maxPages ?? 60;
    this.chunkDays = Math.max(1, opts.chunkDays ?? 92);
    this.doFetch = opts.fetchImpl ?? fetch;
    this.sleep = opts.sleepImpl ?? defaultSleep;
  }

  /**
   * Traduz o erro da Graph API para a AÇÃO que resolve. Os códigos abaixo são os que
   * realmente aparecem em setup/produção deste projeto.
   */
  private explainError(code: number, subcode: number, message: string): string {
    if (code === 190) {
      return `Meta API 190 — token inválido ou EXPIRADO. Gere um novo (idealmente um token de SYSTEM USER na BM, que não expira) e atualize META_ACCESS_TOKEN no .env. (${message})`;
    }
    if (code === 200 || code === 10) {
      return `Meta API ${code} — o token não tem permissão de leitura de anúncios nesta conta. Confira: (a) escopo ads_read, (b) o usuário/system user tem acesso à conta ${this.accountId} na Business Manager. (${message})`;
    }
    if (code === 100 && /Unsupported get request|does not exist/i.test(message)) {
      return `Meta API 100 — conta ${this.accountId} não encontrada ou sem acesso. Confira META_AD_ACCOUNT_ID (só dígitos, o prefixo act_ é adicionado sozinho). (${message})`;
    }
    if (RETRYABLE_CODES.has(code)) {
      return `Meta API ${code} — limite de requisições atingido e as retentativas não bastaram. Aumente SYNC_INTERVAL_MINUTES ou reduza META_REFRESH_DAYS. (${message})`;
    }
    return `Meta API erro ${code}${subcode ? `/${subcode}` : ''}: ${message}`;
  }

  /** GET com retry exponencial nos erros transitórios/throttling. */
  private async getJson(url: string): Promise<Record<string, unknown>> {
    let lastErr = '';
    for (let attempt = 0; attempt < 4; attempt++) {
      const res = await this.doFetch(url);
      const text = await res.text();
      let json: Record<string, unknown>;
      try {
        json = JSON.parse(text) as Record<string, unknown>;
      } catch {
        throw new Error(
          `Meta API devolveu resposta não-JSON (HTTP ${res.status}): ${text.slice(0, 200)}`,
        );
      }
      const err = json.error as
        { code?: number; error_subcode?: number; message?: string } | undefined;
      if (!err) return json;

      const code = err.code ?? 0;
      const message = err.message ?? '';
      if (isDataVolumeError(code, message)) throw new DataVolumeError(message);
      const retryable = RETRYABLE_CODES.has(code) || res.status === 429 || res.status >= 500;
      lastErr = this.explainError(code, err.error_subcode ?? 0, message);
      if (!retryable || attempt === 3) throw new Error(lastErr);
      await this.sleep(1000 * Math.pow(3, attempt)); // 1s, 3s, 9s
    }
    throw new Error(lastErr || 'Meta API: falha desconhecida.');
  }

  /** Metadados da conta — usados para provar moeda/fuso antes de confiar nos números. */
  async getAccount(): Promise<MetaAccountInfo> {
    const params = new URLSearchParams({
      fields: 'name,account_id,currency,timezone_name,account_status',
      access_token: this.token,
    });
    const json = (await this.getJson(
      `${GRAPH_BASE}/${this.apiVersion}/${this.accountId}?${params.toString()}`,
    )) as {
      name?: string;
      account_id?: string;
      currency?: string;
      timezone_name?: string;
      account_status?: number;
    };
    return {
      id: this.accountId,
      name: json.name ?? '',
      currency: json.currency ?? '',
      timezoneName: json.timezone_name ?? '',
      accountStatus: json.account_status ?? 0,
    };
  }

  /** Uma janela contínua, seguindo a paginação até o fim. */
  private async fetchRange(q: MetaInsightsQuery): Promise<MetaInsightRow[]> {
    const params = new URLSearchParams({
      level: q.level,
      time_increment: '1',
      time_range: JSON.stringify({ since: q.since, until: q.until }),
      fields: q.fields.join(','),
      limit: String(this.pageSize),
      access_token: this.token,
    });
    let url = `${GRAPH_BASE}/${this.apiVersion}/${this.accountId}/insights?${params.toString()}`;

    const rows: MetaInsightRow[] = [];
    for (let page = 0; page < this.maxPages; page++) {
      const json = (await this.getJson(url)) as {
        data?: MetaInsightRow[];
        paging?: { next?: string };
      };
      rows.push(...(json.data ?? []));
      const next = json.paging?.next;
      if (!next) return rows;
      url = next; // a URL de next já carrega token e cursor
    }
    throw new Error(
      `Meta API: paginação passou de ${this.maxPages} páginas em ${q.level} ${q.since}..${q.until} — reduza META_CHUNK_DAYS.`,
    );
  }

  /** Janela que se parte ao meio sozinha quando a Meta reclama do volume. */
  private async fetchRangeSplitting(q: MetaInsightsQuery): Promise<MetaInsightRow[]> {
    try {
      return await this.fetchRange(q);
    } catch (e) {
      if (!(e instanceof DataVolumeError)) throw e;
      if (q.since >= q.until) {
        throw new Error(
          `Meta API: nem um único dia (${q.since}, level=${q.level}) coube na resposta. Reduza os campos pedidos. (${e.message})`,
        );
      }
      const meio = midDate(q.since, q.until);
      const a = await this.fetchRangeSplitting({ ...q, until: meio });
      const b = await this.fetchRangeSplitting({ ...q, since: addDays(meio, 1) });
      return [...a, ...b];
    }
  }

  /**
   * /insights com time_increment=1 (uma linha por dia por entidade).
   *
   * Fatiado em blocos de `chunkDays`: o backfill de 20 meses num pedido só é recusado com
   * "Please reduce the amount of data you're asking for" (medido em 2026-08-06). Cada bloco
   * ainda se parte ao meio sozinho se a Meta reclamar — o período pode ficar mais denso no
   * futuro sem ninguém ter que ajustar config.
   *
   * Sem `use_unified_attribution_setting`: a janela padrão foi conferida contra a planilha
   * (leads por dia 21/36 em 22–23/06 batem EXATO), então mexer nela quebraria a
   * comparabilidade com o histórico que o gestor de tráfego exportou.
   */
  async insightsDaily(q: MetaInsightsQuery): Promise<MetaInsightRow[]> {
    const rows: MetaInsightRow[] = [];
    let cursor = q.since;
    while (cursor <= q.until) {
      const fim = minDate(addDays(cursor, this.chunkDays - 1), q.until);
      rows.push(...(await this.fetchRangeSplitting({ ...q, since: cursor, until: fim })));
      cursor = addDays(fim, 1);
    }
    return rows;
  }
}

/** Erro de volume: sinaliza ao chamador que a janela precisa ser recortada. */
export class DataVolumeError extends Error {}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function minDate(a: string, b: string): string {
  return a < b ? a : b;
}

/** Dia do meio entre duas datas ISO (para partir a janela). */
function midDate(since: string, until: string): string {
  const a = Date.parse(`${since}T00:00:00Z`);
  const b = Date.parse(`${until}T00:00:00Z`);
  return new Date(a + Math.floor((b - a) / 2)).toISOString().slice(0, 10);
}

/** Campos pedidos por nível. Só o necessário: resposta menor = menos throttling. */
export const AD_FIELDS = [
  'date_start',
  'campaign_name',
  'adset_name',
  'ad_name',
  'spend',
  'impressions',
  'inline_link_clicks',
  'actions',
];

export const ADSET_FIELDS = [
  'date_start',
  'campaign_name',
  'adset_name',
  'spend',
  'impressions',
  'inline_link_clicks',
  'actions',
];
