import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMetrics } from '../src/metrics/compute.js';
import { fixture, MARCO } from './fixtures.js';

const META = { lastSync: '2026-03-31T12:00:00Z', stale: false, source: 'fixture', extraWarnings: [] };
const near = (a: number | null, b: number, eps = 1e-6) =>
  assert.ok(a !== null && Math.abs(a - b) < eps, `esperado ~${b}, veio ${a}`);
const kpi = (r: ReturnType<typeof computeMetrics>, key: string) => {
  const k = r.kpis.find((x) => x.key === key);
  assert.ok(k, `KPI ${key} ausente`);
  return k;
};

test('KPIs — valores canônicos (§4) calculados à mão', () => {
  const r = computeMetrics(fixture(), MARCO, META);
  near(kpi(r, 'faturamento').value, 8294);
  near(kpi(r, 'investimento').value, 400);
  near(kpi(r, 'lucro').value, 7894);
  near(kpi(r, 'leads').value, 5);
  near(kpi(r, 'cpl').value, 80); // 400/5
  near(kpi(r, 'cplMorno').value, 400); // 400/1
  near(kpi(r, 'cplMql').value, 200); // 400/2
  near(kpi(r, 'cac').value, 200); // 400/2
  near(kpi(r, 'conversao').value, 40); // 2/5 = 40%
  near(kpi(r, 'roas').value, 20.735); // 8294/400
});

test('delta vs período anterior — mês-atual sem dados no mês anterior', () => {
  const r = computeMetrics(fixture(), MARCO, META);
  // Março cheio detectado como month-to-date → previous = Fev/2026 (28 dias), sem dados.
  assert.equal(r.previousRange.from, '2026-02-01');
  assert.equal(r.previousRange.to, '2026-02-28');
  const fat = kpi(r, 'faturamento');
  assert.equal(fat.delta.previous, 0);
  assert.equal(fat.delta.pct, null); // previous 0 → pct null
  assert.equal(fat.delta.improved, true); // subiu, direção boa = up
});

test('série diária — dias específicos', () => {
  const r = computeMetrics(fixture(), MARCO, META);
  const d01 = r.daily.find((d) => d.date === '2026-03-01')!;
  assert.equal(d01.leads, 2);
  near(d01.investimento, 100);
  near(d01.cpl, 50); // 100/2
  assert.equal(d01.faturamento, 0);
  const d05 = r.daily.find((d) => d.date === '2026-03-05')!;
  assert.equal(d05.vendas, 1);
  near(d05.faturamento, 4297);
  assert.equal(d05.leads, 0);
  assert.equal(d05.cpl, null); // 0 leads → div/0
  assert.equal(r.daily.length, 31);
});

test('funil de marketing — etapas, taxas e custos', () => {
  const mf = computeMetrics(fixture(), MARCO, META).marketingFunnel;
  const byKey = Object.fromEntries(mf.steps.map((s) => [s.key, s]));
  assert.equal(byKey.impressoes!.value, 4000);
  assert.equal(byKey.cliques!.value, 300);
  assert.equal(byKey.leads!.value, 5);
  near(byKey.cliques!.rateFromPrev, 0.075); // 300/4000
  near(byKey.cliqueLP!.rateFromPrev, 0.4); // 120/300
  near(mf.costs.cpc, 400 / 300);
  near(mf.costs.custoPorFormulario, 400 / 36);
  near(mf.costs.cpl, 80);
});

test('funil comercial — etapas por data + custos', () => {
  const cf = computeMetrics(fixture(), MARCO, META).commercialFunnel;
  const v = Object.fromEntries(cf.steps.map((s) => [s.key, s.value]));
  assert.deepEqual(v, { leads: 5, agendamentos: 3, comparecimentos: 2, vendas: 2 });
  const rate = Object.fromEntries(cf.steps.map((s) => [s.key, s.rateFromPrev]));
  near(rate.agendamentos as number, 0.6); // 3/5
  near(rate.comparecimentos as number, 2 / 3);
  near(rate.vendas as number, 1); // 2/2
  near(cf.ticketMedio, 4147); // 8294/2
  near(cf.custoPorAgendamento, 400 / 3);
  near(cf.custoPorVenda, 200);
});

test('segmentos de qualificação — matriz 3×métricas (§S7)', () => {
  const segs = computeMetrics(fixture(), MARCO, META).segments;
  const mql = segs.find((s) => s.segmento === 'MQL')!;
  assert.equal(mql.leads, 2);
  near(mql.custoPorLead, 200); // investimento TOTAL 400 / 2 (§4)
  assert.equal(mql.agendamentos, 2);
  near(mql.taxaAgendamento, 1);
  assert.equal(mql.vendas, 2);
  near(mql.conversaoTotal, 1);
  near(mql.custoPorVenda, 200);

  const morno = segs.find((s) => s.segmento === 'Morno')!;
  assert.equal(morno.leads, 1);
  assert.equal(morno.comparecimentos, 0);
  assert.equal(morno.taxaComparecimento, 0); // 0/1
  assert.equal(morno.taxaVenda, null); // 0/0
  assert.equal(morno.custoPorVenda, null); // 400/0

  const fora = segs.find((s) => s.segmento === 'Fora do perfil')!;
  assert.equal(fora.leads, 2);
  assert.equal(fora.agendamentos, 0);
  assert.equal(fora.taxaComparecimento, null); // 0/0
});

test('relatório por anúncio — leads/MQL da própria aba MÉTRICAS ADS (§S9)', () => {
  const ads = computeMetrics(fixture(), MARCO, META).porAnuncio;
  const ad1 = ads.find((a) => a.anuncio === 'AD1')!;
  assert.equal(ad1.leadsTotais, 3); // Action Leads da aba
  assert.equal(ad1.mqls, 1); // MQL da aba
  near(ad1.ctr, 0.075); // 150/2000
  near(ad1.custoPorMql, 200); // 200/1
  near(ad1.taxaCliqueForms, 3 / 150); // leads/cliques
  const ad2 = ads.find((a) => a.anuncio === 'AD2')!;
  assert.equal(ad2.leadsTotais, 2);
  assert.equal(ad2.mqls, 1);
});

test('relatório por público — leads/CPL reais da aba TOP PÚBLICOS (§S8)', () => {
  const pubs = computeMetrics(fixture(), MARCO, META).porPublico;
  const a = pubs.find((p) => p.publico === 'PubA')!;
  near(a.cpm, 100); // 250*1000/2500
  near(a.ctr, 0.06); // 150/2500
  assert.equal(a.leads, 4);
  near(a.cpl, 62.5); // 250/4
  assert.equal(a.custoPorMql, null); // aba não tem MQL por público
});

test('detalhe de leads — temperatura/origem/pago (§S4)', () => {
  const d = computeMetrics(fixture(), MARCO, META).leadsDetail;
  assert.equal(d.total, 5);
  assert.deepEqual(d.porTemperatura, { quente: 2, morno: 1, frio: 2 });
  assert.equal(d.porOrigem.anuncio, 4);
  assert.equal(d.porOrigem.bio, 1);
  assert.deepEqual(d.pagoVsOrganico, { pago: 4, organico: 1 });
});

test('edge cases — range de 1 dia e range futuro sem dados', () => {
  const oneDay = computeMetrics(fixture(), { from: '2026-03-01', to: '2026-03-01' }, META);
  assert.equal(oneDay.daily.length, 1);
  assert.equal(oneDay.kpis.find((k) => k.key === 'leads')!.value, 2);

  const future = computeMetrics(fixture(), { from: '2027-01-01', to: '2027-01-31' }, META);
  assert.equal(future.kpis.find((k) => k.key === 'leads')!.value, 0);
  assert.equal(future.kpis.find((k) => k.key === 'roas')!.value, 0); // 0/0 → safeDiv null → 0
});

test('sensibilidade — mutar uma venda muda o faturamento (prova do golden)', () => {
  const f = fixture();
  const base = computeMetrics(f, MARCO, META).kpis.find((k) => k.key === 'faturamento')!.value;
  f.vendas[0]!.valorBRL += 1000;
  const mutated = computeMetrics(f, MARCO, META).kpis.find((k) => k.key === 'faturamento')!.value;
  assert.equal(mutated - base, 1000);
});
