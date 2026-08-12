import { existsSync } from 'node:fs';
import type { AppConfig } from '../config.js';
import { readJson } from '../config.js';
import type { UtmMap } from '../normalize/utm.js';
import type { VendaExclusion } from '../normalize/leadRows.js';
import type { DataSource } from './DataSource.js';
import { CsvSource } from './CsvSource.js';
import { MetaSource } from './MetaSource.js';
import { MockSource } from './MockSource.js';
import { SheetSource } from './SheetSource.js';

/** Config OPCIONAL de reconciliação — sem o arquivo, nenhuma linha é excluída. */
function loadVendaExclusions(path: string): VendaExclusion[] {
  if (!path || !existsSync(path)) return [];
  const raw = readJson<{ excluir?: VendaExclusion[] }>(path);
  return raw.excluir ?? [];
}

/**
 * Envelopa a fonte da planilha com a Meta Marketing API quando há credencial.
 * Sem META_* no .env, devolve a fonte original — o comportamento antigo, intacto.
 * Não faz sentido em 'mock' (dado sintético) nem em 'csv' (export local sem mídia viva).
 */
function withMeta(base: DataSource, cfg: AppConfig): DataSource {
  if (!cfg.meta.enabled) return base;
  if (cfg.dataSource === 'mock' || cfg.dataSource === 'csv') return base;
  return new MetaSource({
    base,
    token: cfg.meta.accessToken,
    accountId: cfg.meta.adAccountId,
    apiVersion: cfg.meta.apiVersion,
    since: cfg.meta.since,
    refreshDays: cfg.meta.refreshDays,
    chunkDays: cfg.meta.chunkDays,
    funil: cfg.meta.funil,
    applySpend: cfg.meta.applySpend,
    storePath: cfg.meta.storePath,
  });
}

export function createDataSource(cfg: AppConfig): DataSource {
  return withMeta(createBaseDataSource(cfg), cfg);
}

function createBaseDataSource(cfg: AppConfig): DataSource {
  const utmMap = readJson<UtmMap>(cfg.utmMapPath);
  const vendaExclusions = loadVendaExclusions(cfg.vendaExclusionsPath);
  switch (cfg.dataSource) {
    case 'mock':
      return new MockSource();
    case 'csv':
      if (!cfg.csvLeadsPath) throw new Error('CSV_LEADS_PATH vazio para DATA_SOURCE=csv.');
      return new CsvSource({ leadsPath: cfg.csvLeadsPath, utmMap });
    case 'sheet-csv':
      return new SheetSource({
        mode: 'sheet-csv',
        sheetId: cfg.sheetId,
        gids: cfg.sheetGids,
        tabs: cfg.sheetTabs,
        utmMap,
        vendaExclusions,
      });
    case 'sheet-api':
      return new SheetSource({
        mode: 'sheet-api',
        sheetId: cfg.sheetId,
        gids: cfg.sheetGids,
        tabs: cfg.sheetTabs,
        serviceAccountJsonPath: cfg.googleServiceAccountJson,
        utmMap,
        vendaExclusions,
      });
    default:
      throw new Error(`DATA_SOURCE desconhecido: ${cfg.dataSource}`);
  }
}

export type { DataSource };
