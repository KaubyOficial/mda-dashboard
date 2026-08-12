import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import type { Funil } from './normalize/metaRows.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** raiz do projeto = server/src/.. /.. */
export const PROJECT_ROOT = resolve(__dirname, '..', '..');

/**
 * Carrega o .env da raiz do projeto. Vars já presentes no ambiente VENCEM as do
 * arquivo (precedência do process.loadEnvFile), então `DATA_SOURCE=x npm run dev`
 * continua sobrepondo o .env. Sem .env, seguem os defaults do env().
 */
function loadEnvFile(): void {
  const path = resolve(PROJECT_ROOT, '.env');
  if (!existsSync(path)) return;
  process.loadEnvFile(path);
}

function env(key: string, fallback = ''): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

/**
 * Resolve path relativo contra a RAIZ do projeto, não contra o cwd — `npm run sync`
 * roda de server/ e o servidor roda da raiz; um "./service-account.json" precisa
 * apontar para o mesmo arquivo nos dois casos.
 */
function resolvePath(p: string): string {
  return p ? resolve(PROJECT_ROOT, p) : '';
}

export interface AppConfig {
  dataSource: 'csv' | 'mock' | 'sheet-csv' | 'sheet-api';
  csvRespostasPath: string;
  csvLeadsPath: string;
  sheetId: string;
  sheetGids: Record<string, string>;
  sheetTabs: Record<string, string>;
  googleServiceAccountJson: string;
  syncIntervalMinutes: number;
  timezone: string;
  currency: string;
  defaultTicket: number;
  port: number;
  host: string;
  cfAccessTeamDomain: string;
  cfAccessAud: string;
  authBypass: boolean;
  dbPath: string;
  utmMapPath: string;
  vendaExclusionsPath: string;
  comercialPath: string;
  meta: MetaConfig;
}

/**
 * Meta Marketing API (read-only). Ligada quando META_ACCESS_TOKEN e META_AD_ACCOUNT_ID
 * existem — sem elas o dashboard roda exatamente como antes, só com a planilha.
 */
export interface MetaConfig {
  enabled: boolean;
  accessToken: string;
  adAccountId: string;
  apiVersion: string;
  /** primeiro dia do backfill inicial (a Meta guarda ~37 meses) */
  since: string;
  /** janela repuxada a cada sync — a atribuição da Meta ainda mexe nos números por ~28 dias */
  refreshDays: number;
  /** dias por requisição (o backfill inteiro não cabe num pedido só) */
  chunkDays: number;
  /** funil mantido: 'ocdm' | 'c2' | 'outro' */
  funil: Funil;
  /** recalcular o investimento diário só com o funil acima (tira C2 do CPL/CAC/ROAS) */
  applySpend: boolean;
  storePath: string;
}

export function loadConfig(): AppConfig {
  loadEnvFile();
  return {
    dataSource: (env('DATA_SOURCE', 'mock') as AppConfig['dataSource']) || 'mock',
    csvRespostasPath: env('CSV_RESPOSTAS_PATH'),
    csvLeadsPath: env('CSV_LEADS_PATH'),
    sheetId: env('SHEET_ID'),
    sheetGids: {
      respostas: env('SHEET_GID_RESPOSTAS'),
      leads: env('SHEET_GID_LEADS'),
      agendamentos: env('SHEET_GID_AGENDAMENTOS'),
      vendas: env('SHEET_GID_VENDAS'),
      midiaDiaria: env('SHEET_GID_MIDIA_DIARIA'),
      midiaPublico: env('SHEET_GID_MIDIA_PUBLICO'),
      midiaAnuncio: env('SHEET_GID_MIDIA_ANUNCIO'),
    },
    // Nomes das abas — contrato do modo sheet-api. Defaults = docs/data-dictionary.md;
    // só precisam ir ao .env se a planilha real renomear alguma aba.
    sheetTabs: {
      leads: env('SHEET_TAB_LEADS', 'LEADS'),
      agendamentos: env('SHEET_TAB_AGENDAMENTOS', 'AGENDAMENTOS & CALL'),
      vendas: env('SHEET_TAB_VENDAS', 'VENDAS'),
      midiaDiaria: env('SHEET_TAB_MIDIA_DIARIA', 'ACOMPANHAMENTO DIÁRIO'),
      midiaPublico: env('SHEET_TAB_MIDIA_PUBLICO', 'TOP PÚBLICOS'),
      midiaAnuncio: env('SHEET_TAB_MIDIA_ANUNCIO', 'MÉTRICAS ADS'),
      leadsComercial: env('SHEET_TAB_LEADS_COMERCIAL', 'LEADS COMERCIAL'),
    },
    googleServiceAccountJson: resolvePath(
      env('GOOGLE_SERVICE_ACCOUNT_JSON', './service-account.json'),
    ),
    syncIntervalMinutes: Number(env('SYNC_INTERVAL_MINUTES', '20')),
    timezone: env('TIMEZONE', 'America/Sao_Paulo'),
    currency: env('CURRENCY', 'BRL'),
    defaultTicket: Number(env('DEFAULT_TICKET', '4297')),
    port: Number(env('PORT', '8080')),
    host: env('HOST', '127.0.0.1'),
    cfAccessTeamDomain: env('CF_ACCESS_TEAM_DOMAIN'),
    cfAccessAud: env('CF_ACCESS_AUD'),
    authBypass: env('AUTH_BYPASS', 'true') === 'true',
    dbPath: resolve(PROJECT_ROOT, 'data', 'mda.sqlite'),
    utmMapPath: resolve(PROJECT_ROOT, 'config', 'utm-map.json'),
    vendaExclusionsPath: resolve(PROJECT_ROOT, 'config', 'vendas-exclusions.json'),
    comercialPath: resolve(PROJECT_ROOT, 'config', 'comercial.json'),
    meta: loadMetaConfig(),
  };
}

function loadMetaConfig(): MetaConfig {
  const accessToken = env('META_ACCESS_TOKEN');
  const adAccountId = env('META_AD_ACCOUNT_ID');
  return {
    enabled: Boolean(accessToken && adAccountId) && env('META_ENABLED', 'true') !== 'false',
    accessToken,
    adAccountId,
    apiVersion: env('META_API_VERSION', 'v23.0'),
    since: env('META_SINCE', '2024-12-01'),
    refreshDays: Number(env('META_REFRESH_DAYS', '35')),
    chunkDays: Number(env('META_CHUNK_DAYS', '92')),
    funil: env('META_FUNIL', 'ocdm') as Funil,
    applySpend: env('META_APPLY_SPEND', 'true') !== 'false',
    storePath: resolve(PROJECT_ROOT, 'data', 'meta-insights.json'),
  };
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}
