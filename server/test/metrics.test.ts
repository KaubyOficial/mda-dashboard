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
  near(kpi(r, 'vendas').value, 2); // nº de vendas no período
  near(kpi(r, 'cpm').value, 100); // 400 ÷ 4000 impressões × 1000
});

test('KPI CPM — sem impressões vira 0 (safeDiv), não NaN/Infinity', () => {
  const f = fixture();
  f.midiaDiaria = f.midiaDiaria.map((m) => ({ ...m, impressoes: 0 }));
  const r = computeMetrics(f, MARCO, META);
  assert.equal(kpi(r, 'cpm').value, 0);
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
  near(mf.costs.cpl, 80);
});

test('funil de marketing — sem etapa "Forms finalizados" (era a coluna Leads da mídia = métrica duplicada)', () => {
  const mf = computeMetrics(fixture(), MARCO, META).marketingFunnel;
  assert.equal(
    mf.steps.find((s) => s.key === 'formsFinalizados'),
    undefined,
  );
  assert.ok(!mf.steps.some((s) => /finalizad/i.test(s.label)));
  // a última etapa é Leads, vinda da aba LEADS (mesma fonte do KPI)
  assert.equal(mf.steps.at(-1)!.key, 'leads');
  assert.equal(mf.steps.at(-1)!.value, 5);
});

test('funil de marketing — IniciouForms não rastreado: avisa E suprime as taxas incomparáveis', () => {
  const f = fixture();
  // 03-01 tem lead (forms_finalizados 12) mas IniciouForms vazio → subcontagem silenciosa
  f.midiaDiaria = f.midiaDiaria.map((m) => (m.date === '2026-03-01' ? { ...m, formsIniciados: 0 } : m));
  const r = computeMetrics(f, MARCO, META);
  assert.ok(
    r.meta.warnings.some((w) => /FUNIL DE MARKETING/.test(w) && /Início forms/.test(w) && /2026-03-02/.test(w)),
    `esperado warning de rastreio; veio: ${JSON.stringify(r.meta.warnings)}`,
  );
  const byKey = Object.fromEntries(r.marketingFunnel.steps.map((s) => [s.key, s]));
  assert.equal(byKey.formsIniciados!.partial, true);
  // a etapa parcial não é comparável nem com a anterior nem com a seguinte
  assert.equal(byKey.formsIniciados!.rateFromPrev, null);
  assert.equal(byKey.leads!.rateFromPrev, null);
  // as etapas que não dependem dela seguem com taxa normal
  near(byKey.cliqueLP!.rateFromPrev, 0.4);
});

test('funil de marketing — com rastreio completo, taxas normais e nada de "parcial"', () => {
  const r = computeMetrics(fixture(), MARCO, META);
  const byKey = Object.fromEntries(r.marketingFunnel.steps.map((s) => [s.key, s]));
  assert.ok(!byKey.formsIniciados!.partial);
  near(byKey.formsIniciados!.rateFromPrev, 45 / 120);
  near(byKey.leads!.rateFromPrev, 5 / 45);
  assert.ok(!r.meta.warnings.some((w) => /Início forms/.test(w)));
});

test('funil de marketing — etapa "Clicou no botão" entra ENTRE "Visualizou a LP" e "Início forms" quando há dado', () => {
  const f = fixture();
  // chegouCadastro: 03-01=20, 03-02=40 → total 60 (entre cliqueLP 120 e formsIni 45)
  f.midiaDiaria = f.midiaDiaria.map((m) => ({ ...m, chegouCadastro: m.date === '2026-03-01' ? 20 : 40 }));
  const mf = computeMetrics(f, MARCO, META).marketingFunnel;
  const keys = mf.steps.map((s) => s.key);
  assert.deepEqual(keys, ['impressoes', 'cliques', 'cliqueLP', 'chegouCadastro', 'formsIniciados', 'leads']);
  const byKey = Object.fromEntries(mf.steps.map((s) => [s.key, s]));
  assert.equal(byKey.chegouCadastro!.value, 60);
  near(byKey.chegouCadastro!.rateFromPrev, 60 / 120); // vs Visualizou a LP
  near(byKey.formsIniciados!.rateFromPrev, 45 / 60); // agora encadeia no botão, não na LP
});

test('funil de marketing — etapa "Clicou no botão" some quando não há dado (não mostra degrau 0)', () => {
  const mf = computeMetrics(fixture(), MARCO, META).marketingFunnel; // fixture: chegouCadastro=0
  assert.equal(mf.steps.find((s) => s.key === 'chegouCadastro'), undefined);
  const byKey = Object.fromEntries(mf.steps.map((s) => [s.key, s]));
  near(byKey.formsIniciados!.rateFromPrev, 45 / 120); // encadeia direto na LP
});

test('funil de marketing — sem etapa de Play VSL; início de forms encadeia no clique da LP', () => {
  const mf = computeMetrics(fixture(), MARCO, META).marketingFunnel;
  assert.equal(
    mf.steps.find((s) => s.key === 'vslPlays'),
    undefined,
  );
  assert.ok(!mf.steps.some((s) => /vsl/i.test(s.label)));
  const byKey = Object.fromEntries(mf.steps.map((s) => [s.key, s]));
  // sem o VSL no meio, a taxa passa a ser forms iniciados ÷ cliques na LP
  near(byKey.formsIniciados!.rateFromPrev, 45 / 120);
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

test('relatório por anúncio — impressões/CTR da aba ADS + MQL/Morno atribuídos da LEADS por utm_content (§S9)', () => {
  const ads = computeMetrics(fixture(), MARCO, META).porAnuncio;
  const ad1 = ads.find((a) => a.anuncio === 'AD1 [OCDM] [VID] CAPTAÇÃO')!;
  assert.equal(ad1.leadsTotais, 3); // Action Leads da aba (mídia)
  near(ad1.ctr, 0.075); // 150/2000
  near(ad1.taxaCliqueForms, 3 / 150); // leads/cliques
  // L1 (MQL) + L2 (Morno) + L5 (Fora) têm utm_content 'video-ad1' → casam com 'AD1 …' pelo código
  assert.equal(ad1.mqls, 1);
  assert.equal(ad1.mornos, 1);
  near(ad1.custoPorMql, 200); // 200/1 — apesar da coluna MQL da aba estar 0 nesse anúncio
  const ad2 = ads.find((a) => a.anuncio === 'AD2 [OCDM] [VID] CAPTAÇÃO')!;
  assert.equal(ad2.leadsTotais, 2);
  assert.equal(ad2.mqls, 1); // L4
  assert.equal(ad2.mornos, 0);
});

test('relatório por anúncio — a coluna MQL da aba ADS NÃO é a fonte (regressão: vinha quase tudo zerado)', () => {
  const f = fixture();
  // zera a coluna MQL da aba de ads: a atribuição pela LEADS tem que continuar de pé
  f.midiaAnuncio = f.midiaAnuncio.map((a) => ({ ...a, mqls: 0 }));
  const ads = computeMetrics(f, MARCO, META).porAnuncio;
  assert.equal(ads.find((a) => a.anuncio === 'AD1 [OCDM] [VID] CAPTAÇÃO')!.mqls, 1);
  assert.equal(ads.find((a) => a.anuncio === 'AD2 [OCDM] [VID] CAPTAÇÃO')!.mqls, 1);
});

test('relatório por público — leads/CPL reais da aba TOP PÚBLICOS (§S8)', () => {
  const pubs = computeMetrics(fixture(), MARCO, META).porPublico;
  const a = pubs.find((p) => p.publico === '00 - IG Visitou 7D')!;
  near(a.cpm, 100); // 250*1000/2500
  near(a.ctr, 0.06); // 150/2500
  assert.equal(a.leads, 4); // leads da própria aba TOP PÚBLICOS (não mexemos)
  near(a.cpl, 62.5); // 250/4
  // MQL/Morno vêm da LEADS por utm_medium: L1 (MQL) + L2 (Morno) + L5 (Fora) são 'ig-visitou-7d'
  assert.equal(a.mqls, 1);
  assert.equal(a.mornos, 1);
  near(a.custoPorMql, 250); // 250/1
  const b = pubs.find((p) => p.publico === '00 - Aberto | H | 22 - 44')!;
  assert.equal(b.mqls, 1); // L4
  assert.equal(b.mornos, 0);
});

test('relatório por público — lead cujo utm_medium não existe na aba não é chutado em ninguém', () => {
  const r = computeMetrics(fixture(), MARCO, META);
  // L3 é 'social' (orgânico) → não casa com nenhum público
  const somaMql = r.porPublico.reduce((s, p) => s + p.mqls, 0);
  const somaMorno = r.porPublico.reduce((s, p) => s + p.mornos, 0);
  assert.equal(somaMql, 2); // L1 e L4 — L3 (Fora do perfil) não vira MQL de ninguém
  assert.equal(somaMorno, 1); // L2
  assert.ok(
    r.meta.warnings.some((w) => /POR PÚBLICO/.test(w) && /não casaram/.test(w)),
    'esperado warning declarando os leads não casados',
  );
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

// --- Cobertura da mídia (achado real 2026-07-16: mídia parava em 20/06, leads em 16/07) ---

const midiaWarn = (r: ReturnType<typeof computeMetrics>) =>
  r.meta.warnings.find((w) => w.startsWith('MÍDIA:')) ?? null;

test('mídia — avisa quando a aba não cobre o fim do período (KPIs subcontados)', () => {
  // fixture: mídia só em 01–02/03; período vai até 31/03 → 29 dias sem mídia.
  const r = computeMetrics(fixture(), MARCO, META);
  const w = midiaWarn(r);
  assert.ok(w, 'deveria avisar que a mídia não cobre o período');
  assert.match(w, /só vai até 2026-03-02/);
  assert.match(w, /subcontados/);
});

test('mídia — sem aviso quando a aba cobre o período inteiro', () => {
  const r = computeMetrics(fixture(), { from: '2026-03-01', to: '2026-03-02' }, META);
  assert.equal(midiaWarn(r), null);
});

test('mídia — atraso de 1 dia é normal e NÃO vira aviso (senão avisa todo dia)', () => {
  const r = computeMetrics(fixture(), { from: '2026-03-01', to: '2026-03-03' }, META);
  assert.equal(midiaWarn(r), null, 'gasto do dia entra no fim do dia — 1 dia de lag é operação normal');
});

test('mídia — período INTEIRO sem mídia avisa que investimento/CAC/ROAS estão zerados', () => {
  const r = computeMetrics(fixture(), { from: '2026-03-10', to: '2026-03-31' }, META);
  const w = midiaWarn(r);
  assert.ok(w, 'deveria avisar');
  assert.match(w, /NENHUM dia do período/);
  assert.match(w, /último dia preenchido: 2026-03-02/);
});
