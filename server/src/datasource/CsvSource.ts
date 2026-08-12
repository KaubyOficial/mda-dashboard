import { readFileSync } from 'node:fs';
import type { DataSource } from './DataSource.js';
import type { DataSnapshot } from '../domain/entities.js';
import type { UtmMap } from '../normalize/utm.js';
import { parseLeadRows } from '../normalize/leadRows.js';
import { parseCsv } from '../util/csv.js';

/**
 * Modo dev com os exports REAIS que já temos localmente (aba LEADS).
 * NÃO temos localmente as abas de mídia (diário/público/anúncio) nem agendamentos/vendas —
 * retornam vazias com WARNING explícito (o dashboard mostra "sem dado", não fabrica).
 * Assim que a CÓPIA completa estiver acessível, o SheetSource assume com todas as abas.
 */
export interface CsvSourceOptions {
  leadsPath: string;
  utmMap: UtmMap;
}

export class CsvSource implements DataSource {
  readonly name = 'csv (export local LEADS)';
  constructor(private readonly opts: CsvSourceOptions) {}

  async fetchAll(): Promise<DataSnapshot> {
    const warnings: string[] = [];
    const rows = parseCsv(readFileSync(this.opts.leadsPath, 'utf8'));
    const leads = parseLeadRows(rows, this.opts.utmMap, warnings);
    warnings.push(
      'GAP: exports locais não incluem abas de mídia — S2/S3/S5/S8/S9 sem dado neste modo.',
      'GAP: exports locais não incluem agendamentos/vendas — faturamento/funil comercial/segmentos sem dado neste modo.',
    );
    return {
      leads,
      agendamentos: [],
      vendas: [],
      leadsComercial: [],
      midiaDiaria: [],
      midiaPublico: [],
      midiaAnuncio: [],
      warnings,
    };
  }
}
