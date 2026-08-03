import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

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
  };
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}
