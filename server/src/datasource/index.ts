import type { AppConfig } from '../config.js';
import { readJson } from '../config.js';
import type { UtmMap } from '../normalize/utm.js';
import type { DataSource } from './DataSource.js';
import { CsvSource } from './CsvSource.js';
import { MockSource } from './MockSource.js';
import { SheetSource } from './SheetSource.js';

export function createDataSource(cfg: AppConfig): DataSource {
  const utmMap = readJson<UtmMap>(cfg.utmMapPath);
  switch (cfg.dataSource) {
    case 'mock':
      return new MockSource();
    case 'csv':
      if (!cfg.csvLeadsPath) throw new Error('CSV_LEADS_PATH vazio para DATA_SOURCE=csv.');
      return new CsvSource({ leadsPath: cfg.csvLeadsPath, utmMap });
    case 'sheet-csv':
      return new SheetSource({ mode: 'sheet-csv', sheetId: cfg.sheetId, gids: cfg.sheetGids, utmMap });
    case 'sheet-api':
      return new SheetSource({
        mode: 'sheet-api',
        sheetId: cfg.sheetId,
        gids: cfg.sheetGids,
        serviceAccountJsonPath: cfg.googleServiceAccountJson,
        utmMap,
      });
    default:
      throw new Error(`DATA_SOURCE desconhecido: ${cfg.dataSource}`);
  }
}

export type { DataSource };
