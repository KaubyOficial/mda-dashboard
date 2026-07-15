import type { Db } from '../db/db.js';
import type { DataSource } from '../datasource/DataSource.js';
import { writeSnapshot } from '../db/repo.js';
import { enrichLeads } from '../crossjoin/match.js';

export interface SyncResult {
  status: 'ok' | 'error';
  source: string;
  counts: Record<string, number>;
  warnings: string[];
  matchReport: { byEmail: number; byPhone: number; byName: number; unmatched: number; totalVendas: number };
  error?: string;
  skipped?: boolean;
}

/**
 * Sync engine (§2.5): lock anti-concorrência + full refresh idempotente + log em sync_runs.
 * Falha de fonte → mantém o cache anterior (não apaga) e registra erro.
 */
export class SyncEngine {
  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: Db,
    private readonly source: DataSource,
  ) {}

  isRunning(): boolean {
    return this.running;
  }

  /** Executa um sync. Se já houver um em andamento, retorna skipped (lock). */
  async run(): Promise<SyncResult> {
    if (this.running) {
      return {
        status: 'ok',
        skipped: true,
        source: this.source.name,
        counts: {},
        warnings: ['Sync já em andamento — ignorado (lock).'],
        matchReport: { byEmail: 0, byPhone: 0, byName: 0, unmatched: 0, totalVendas: 0 },
      };
    }
    this.running = true;
    const startedAt = new Date().toISOString();
    const ins = this.db.prepare(
      `INSERT INTO sync_runs (started_at,status,source) VALUES (?, 'running', ?)`,
    );
    const info = ins.run(startedAt, this.source.name);
    const syncId = Number(info.lastInsertRowid);

    try {
      const snap = await this.source.fetchAll();
      const match = enrichLeads(snap);
      writeSnapshot(this.db, snap); // full refresh idempotente
      const counts = {
        leads: snap.leads.length,
        agendamentos: snap.agendamentos.length,
        vendas: snap.vendas.length,
        midiaDiaria: snap.midiaDiaria.length,
        midiaPublico: snap.midiaPublico.length,
        midiaAnuncio: snap.midiaAnuncio.length,
      };
      this.db
        .prepare(
          `UPDATE sync_runs SET finished_at=?, status='ok', counts_json=?, warnings_json=? WHERE id=?`,
        )
        .run(new Date().toISOString(), JSON.stringify(counts), JSON.stringify(snap.warnings), syncId);
      this.db
        .prepare(
          `INSERT OR REPLACE INTO match_report (sync_id,by_email,by_phone,by_name,unmatched,total_vendas) VALUES (?,?,?,?,?,?)`,
        )
        .run(syncId, match.report.byEmail, match.report.byPhone, match.report.byName, match.report.unmatched, match.report.totalVendas);
      return {
        status: 'ok',
        source: this.source.name,
        counts,
        warnings: snap.warnings,
        matchReport: match.report,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      this.db
        .prepare(`UPDATE sync_runs SET finished_at=?, status='error', error=? WHERE id=?`)
        .run(new Date().toISOString(), msg, syncId);
      return {
        status: 'error',
        source: this.source.name,
        counts: {},
        warnings: [],
        matchReport: { byEmail: 0, byPhone: 0, byName: 0, unmatched: 0, totalVendas: 0 },
        error: msg,
      };
    } finally {
      this.running = false;
    }
  }

  startInterval(minutes: number): void {
    if (this.timer) return;
    const ms = Math.max(1, minutes) * 60_000;
    this.timer = setInterval(() => {
      void this.run();
    }, ms);
  }

  stopInterval(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

/** Considera o cache "stale" se o último sync passou de maxAgeHours. */
export function isStale(lastSync: string | null, maxAgeHours = 2): boolean {
  if (!lastSync) return true;
  const age = Date.now() - new Date(lastSync).getTime();
  return age > maxAgeHours * 3600_000;
}
