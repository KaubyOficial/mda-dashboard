import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openDb } from '../src/db/db.js';
import { readSnapshot, writeSnapshot } from '../src/db/repo.js';
import { computeMetrics } from '../src/metrics/compute.js';
import { fixture, MARCO } from './fixtures.js';

const META = { lastSync: null, stale: false, source: 'test', extraWarnings: [] };

test('writeSnapshot/readSnapshot — roundtrip preserva contagens', () => {
  const db = openDb(':memory:');
  const snap = fixture();
  writeSnapshot(db, snap);
  const back = readSnapshot(db);
  assert.equal(back.leads.length, 5);
  assert.equal(back.vendas.length, 2);
  assert.equal(back.agendamentos.length, 3);
  assert.equal(back.midiaDiaria.length, 2);
});

test('idempotência — 2 syncs seguidos dão o mesmo resultado (§2.5)', () => {
  const db = openDb(':memory:');
  writeSnapshot(db, fixture());
  const a = computeMetrics(readSnapshot(db), MARCO, META);
  writeSnapshot(db, fixture()); // full refresh de novo
  const b = computeMetrics(readSnapshot(db), MARCO, META);
  assert.equal(a.kpis.find((k) => k.key === 'faturamento')!.value, b.kpis.find((k) => k.key === 'faturamento')!.value);
  assert.equal(a.leadsDetail.total, b.leadsDetail.total);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM leads').get()!.c, 5);
});
