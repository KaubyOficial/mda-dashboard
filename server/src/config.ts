import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
/** raiz do projeto = server/src/.. /.. */
export const PROJECT_ROOT = resolve(__dirname, '..', '..');

function env(key: string, fallback = ''): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

export interface AppConfig {
  dataSource: 'csv' | 'mock' | 'sheet-csv' | 'sheet-api';
  csvRespostasPath: string;
  csvLeadsPath: string;
  sheetId: string;
  sheetGids: Record<string, string>;
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
}

export function loadConfig(): AppConfig {
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
    googleServiceAccountJson: env('GOOGLE_SERVICE_ACCOUNT_JSON', './service-account.json'),
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
  };
}

export function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}
