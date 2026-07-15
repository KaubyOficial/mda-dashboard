import { loadConfig } from './config.js';
import { openDb } from './db/db.js';
import { getLastSync } from './db/repo.js';
import { createDataSource } from './datasource/index.js';
import { SyncEngine } from './sync/sync.js';
import { buildServer } from './api/server.js';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const db = openDb(cfg.dbPath);
  const source = createDataSource(cfg);
  const sync = new SyncEngine(db, source);

  // sync inicial se o cache estiver vazio (primeira subida)
  const info = getLastSync(db);
  if (!info.lastSync) {
    console.log(`[boot] cache vazio — sync inicial via ${source.name}...`);
    const r = await sync.run();
    console.log(`[boot] sync ${r.status}`, r.counts, r.error ? `erro: ${r.error}` : '');
  }
  sync.startInterval(cfg.syncIntervalMinutes);

  const app = buildServer(cfg, db, sync);
  await app.listen({ port: cfg.port, host: cfg.host });
  console.log(`[boot] MDA Dashboard em http://${cfg.host}:${cfg.port} (fonte: ${cfg.dataSource})`);
}

main().catch((e) => {
  console.error('[fatal]', e);
  process.exit(1);
});
