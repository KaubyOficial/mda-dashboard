import { loadConfig } from '../config.js';
import { openDb } from '../db/db.js';
import { createDataSource } from '../datasource/index.js';
import { SyncEngine } from '../sync/sync.js';

/** `npm run sync` — roda um sync avulso e imprime o relatório (útil pra reconciliação/CI). */
async function main(): Promise<void> {
  const cfg = loadConfig();
  const db = openDb(cfg.dbPath);
  const source = createDataSource(cfg);
  const sync = new SyncEngine(db, source);
  const r = await sync.run();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.status === 'ok' ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
