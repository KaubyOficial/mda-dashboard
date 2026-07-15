import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AppConfig } from '../config.js';
import { PROJECT_ROOT } from '../config.js';
import type { Db } from '../db/db.js';
import { getLastSync, readSnapshot } from '../db/repo.js';
import { computeMetrics } from '../metrics/compute.js';
import { RangeError, previousRange, validateRange } from '../metrics/period.js';
import { isStale, type SyncEngine } from '../sync/sync.js';
import { registerAuth, registerSecurityHeaders } from './security.js';

/** cache em memória por (range|preset), invalidado a cada sync. */
class RangeCache {
  private map = new Map<string, unknown>();
  private version = 0;
  bump(): void {
    this.version++;
    this.map.clear();
  }
  key(from: string, to: string, preset: string): string {
    return `${this.version}:${from}:${to}:${preset}`;
  }
  get<T>(k: string): T | undefined {
    return this.map.get(k) as T | undefined;
  }
  set(k: string, v: unknown): void {
    this.map.set(k, v);
  }
}

export function buildServer(cfg: AppConfig, db: Db, sync: SyncEngine): FastifyInstance {
  const app = Fastify({ logger: { level: 'info' }, trustProxy: true });
  const cache = new RangeCache();

  registerSecurityHeaders(app);
  registerAuth(app, cfg);

  void app.register(rateLimit, { max: 240, timeWindow: '1 minute' });

  app.get('/healthz', async () => ({ status: 'ok' }));
  app.get('/api/health', async () => {
    const info = getLastSync(db);
    return {
      status: 'ok',
      source: cfg.dataSource,
      lastSync: info.lastSync,
      stale: isStale(info.lastSync),
      syncing: sync.isRunning(),
    };
  });

  app.get('/api/metrics', async (req, reply) => {
    const q = req.query as { from?: string; to?: string; preset?: string };
    let range;
    try {
      range = validateRange(q.from, q.to);
    } catch (e) {
      if (e instanceof RangeError) return reply.code(400).send({ error: e.message });
      throw e;
    }
    const preset = q.preset ?? '';
    const cacheKey = cache.key(range.from, range.to, preset);
    const cached = cache.get(cacheKey);
    if (cached) return cached;

    const snap = readSnapshot(db);
    const info = getLastSync(db);
    const result = computeMetrics(snap, range, {
      lastSync: info.lastSync,
      stale: isStale(info.lastSync),
      source: cfg.dataSource,
      extraWarnings: info.warnings,
    }, preset || undefined);
    cache.set(cacheKey, result);
    return result;
  });

  app.get('/api/previous-range', async (req, reply) => {
    const q = req.query as { from?: string; to?: string; preset?: string };
    try {
      const range = validateRange(q.from, q.to);
      return previousRange(range, q.preset);
    } catch (e) {
      if (e instanceof RangeError) return reply.code(400).send({ error: e.message });
      throw e;
    }
  });

  app.post('/api/sync', async () => {
    const r = await sync.run();
    cache.bump();
    return r;
  });

  // dashboard estático (build do web) — servido pelo Fastify (§5.1)
  const webDist = resolve(PROJECT_ROOT, 'web', 'dist');
  if (existsSync(webDist)) {
    void app.register(fastifyStatic, { root: webDist, prefix: '/' });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith('/api/')) return reply.code(404).send({ error: 'not found' });
      return reply.sendFile('index.html');
    });
  }

  return app;
}
