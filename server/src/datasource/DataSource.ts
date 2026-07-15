import type { DataSnapshot } from '../domain/entities.js';

/**
 * Boundary pluggable (D6/§5.1). Uma implementação por origem.
 * V1: MockSource, CsvSource, SheetSource. Fase 2: CrmSource, MetaAdsSource — mesma interface.
 */
export interface DataSource {
  readonly name: string;
  /** Lê a origem inteira e devolve as 6 entidades normalizadas + warnings. Idempotente. */
  fetchAll(): Promise<DataSnapshot>;
}
