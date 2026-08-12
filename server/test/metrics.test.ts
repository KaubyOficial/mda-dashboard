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

test('KPI CPL — mini-métrica "só pago" usa só os leads pagos no denominador', () => {
  const r = computeMetrics(fixture(), MARCO, META);
  const cpl = kpi(r, 'cpl');
  near(cpl.value, 80); // 400 ÷ 5 (todos)
  assert.ok(cpl.sub, 'CPL deveria trazer a mini-métrica "só pago"');
  assert.equal(cpl.sub!.label, 'só pago');
  near(cpl.sub!.value, 100); // 400 ÷ 4 leads pagos (L3 orgânico sai do denominador)
});

test('KPI Leads — valor principal é o total e a mini-métrica traz só os pagos', () => {
  const r = computeMetrics(fixture(), MARCO, META);
  const leads = kpi(r, 'leads');
  assert.equal(leads.value, 5); // todos (4 pagos + L3 orgânico)
  assert.ok(leads.sub, 'Leads deveria trazer a mini-métrica "só pago"');
  assert.equal(leads.sub!.label, 'só pago');
  assert.equal(leads.sub!.format, 'number');
  assert.equal(leads.sub!.value, 4); // L1, L2, L4, L5
});

test('KPI Leads "só pago" — sem lead pago no período é 0 (contagem real, não "—")', () => {
  const f = fixture();
  f.leads = f.leads.map((l) => ({ ...l, pagoOrganico: 'organico' as const }));
  const leads = kpi(computeMetrics(f, MARCO, META), 'leads');
  assert.equal(leads.value, 5);
  assert.equal(leads.sub!.value, 0); // zero pago é um fato, não um denominador indefinido
});

test('KPI CPL "só pago" — sem lead pago no período vira null (não NaN/Infinity)', () => {
  const f = fixture();
  f.leads = f.leads.map((l) => ({ ...l, pagoOrganico: 'organico' as const }));
  const r = computeMetrics(f, MARCO, META);
  assert.equal(kpi(r, 'cpl').sub!.value, null);
  assert.equal(kpi(r, 'cplMorno').sub!.value, null);
  assert.equal(kpi(r, 'cplMql').sub!.value, null);
});

test('KPIs CPL morno/MQL — mini-métrica "só pago" desconta o orgânico do denominador', () => {
  const f = fixture();
  // vira o morno pago (L2) em orgânico: o CPL morno geral fica igual, mas o "só pago" some
  f.leads = f.leads.map((l) => (l.id === 'L2' ? { ...l, pagoOrganico: 'organico' as const } : l));
  const r = computeMetrics(f, MARCO, META);
  near(kpi(r, 'cplMorno').value, 400); // 400 ÷ 1 morno (geral, não muda)
  assert.equal(kpi(r, 'cplMorno').sub!.value, null); // 0 mornos pagos
  near(kpi(r, 'cplMql').sub!.value as number, 200); // 400 ÷ 2 MQLs pagos (L1, L4)
});

test('funil pago × orgânico — mesmas etapas do comercial, atribuídas pelo lead casado', () => {
  const r = computeMetrics(fixture(), MARCO, META);
  const fp = r.funilPagoOrganico;
  // pagos: L1, L2, L4, L5 · agend (A1,A2,A3 → leads pagos) · comparec: A1,A3 · vendas: V1,V2
  const pago = Object.fromEntries(fp.pago.steps.map((s) => [s.key, s.value]));
  assert.deepEqual(pago, { leads: 4, agendamentos: 3, comparecimentos: 2, vendas: 2 });
  const rates = Object.fromEntries(fp.pago.steps.map((s) => [s.key, s.rateFromPrev]));
  near(rates.agendamentos as number, 0.75); // 3/4
  near(rates.comparecimentos as number, 2 / 3);
  near(rates.vendas as number, 1);
  near(fp.pago.conversaoTotal, 0.5); // 2/4
  // orgânico: só L3, sem agendamento/venda
  const org = Object.fromEntries(fp.organico.steps.map((s) => [s.key, s.value]));
  assert.deepEqual(org, { leads: 1, agendamentos: 0, comparecimentos: 0, vendas: 0 });
  near(fp.organico.conversaoTotal, 0); // 0/1
  // tudo casou → nada no balde e nenhum warning de não-atribuído
  assert.deepEqual(fp.naoAtribuido, { agendamentos: 0, comparecimentos: 0, vendas: 0 });
  assert.ok(!r.meta.warnings.some((w) => /FUNIL PAGO × ORGÂNICO/.test(w)));
});

test('funil pago × orgânico — pago + orgânico + não atribuído = funil comercial, etapa a etapa', () => {
  const f = fixture();
  // venda órfã (sem lead) no período: precisa cair no "não atribuído", não sumir
  f.vendas.push({ id: 'V9', date: '2026-03-08', emailKey: '', phoneKey: '', nameKey: 'ninguem', valorBRL: 999 });
  const r = computeMetrics(f, MARCO, META);
  const fp = r.funilPagoOrganico;
  const na: Record<string, number> = { leads: 0, ...fp.naoAtribuido };
  const soma = (key: string) =>
    fp.pago.steps.find((s) => s.key === key)!.value +
    fp.organico.steps.find((s) => s.key === key)!.value +
    na[key]!;
  for (const s of r.commercialFunnel.steps) assert.equal(soma(s.key), s.value, s.key);
  assert.equal(fp.naoAtribuido.vendas, 1);
  assert.ok(
    r.meta.warnings.some((w) => /FUNIL PAGO × ORGÂNICO/.test(w) && /não atribuído/.test(w)),
    'deveria declarar o evento sem lead casado',
  );
});

test('funil pago × orgânico — venda de lead ANTIGO conta no período da venda (igual ao KPI)', () => {
  const f = fixture();
  // lead pago de FEVEREIRO que comprou em MARÇO: a venda tem que aparecer no recorte de março
  f.leads.push({
    ...f.leads[0]!,
    id: 'L0',
    date: '2026-02-10',
    emailKey: 'z@x.test',
    phoneKey: '11999990009',
    nameKey: 'zeca prado',
  });
  f.vendas.push({ id: 'V3', date: '2026-03-10', emailKey: '', phoneKey: '', nameKey: 'zeca prado', valorBRL: 1000 });
  const r = computeMetrics(f, MARCO, META);
  const pago = Object.fromEntries(r.funilPagoOrganico.pago.steps.map((s) => [s.key, s.value]));
  assert.equal(pago.leads, 4); // L0 é de fevereiro — não entra nos leads de março
  assert.equal(pago.vendas, 3); // mas a venda dele é de março e entra (V1, V2, V3)
  // e bate com o KPI de vendas do período
  assert.equal(r.kpis.find((k) => k.key === 'vendas')!.value, 3);
});

test('origens do orgânico — canal canônico: variações de link-da-bio viram UMA linha', () => {
  const f = fixture();
  // 3 grafias reais do MESMO canal (Kauê 2026-07-24): ig·social·link_in_bio,
  // BioOrganico·biografia-caio·organico e social·link_in_bio → todas origem 'bio'
  const clone = (id: string, email: string, utm: Partial<(typeof f.leads)[number]['utm']>) => ({
    ...f.leads[2]!,
    id,
    emailKey: email,
    phoneKey: '',
    nameKey: id,
    utm: { source: '', medium: '', campaign: '', content: '', term: '', ...utm },
  });
  f.leads.push(clone('L7', 'g@x.test', { source: 'BioOrganico', medium: 'biografia-caio', content: 'organico' }));
  f.leads.push(clone('L8', 'h@x.test', { medium: 'social', content: 'link_in_bio' }));
  const r = computeMetrics(f, MARCO, META);
  const bio = r.origensOrganico.find((o) => o.origem === 'Link da bio');
  assert.ok(bio, 'as variações de link-da-bio deveriam colapsar em "Link da bio"');
  assert.equal(bio!.leads, 3); // L3 + L7 + L8 numa linha só
  assert.equal(r.origensOrganico.length, 1);
  near(bio!.conversaoTotal, 0);
});

test('origens do orgânico — sem UTM vira "(sem UTM)", canal desconhecido mantém rótulo cru, pago fica fora', () => {
  const f = fixture();
  const base = f.leads[2]!;
  f.leads.push({
    ...base,
    id: 'L6',
    emailKey: 'f@x.test',
    phoneKey: '11999990006',
    nameKey: 'fabi luz',
    qualificacao: 'MQL',
    origem: 'organico', // sem UTM nenhuma → não cai em regra de origem
    utm: { source: '', medium: '', campaign: '', content: '', term: '' },
  });
  f.leads.push({
    ...base,
    id: 'L9',
    emailKey: 'i@x.test',
    phoneKey: '11999990009',
    nameKey: 'igor sá',
    origem: 'organico', // canal novo que nenhuma regra conhece → rótulo cru denuncia
    utm: { source: 'youtube', medium: 'video', campaign: '', content: '', term: '' },
  });
  const r = computeMetrics(f, MARCO, META);
  const semUtm = r.origensOrganico.find((o) => o.origem === '(sem UTM)');
  assert.ok(semUtm, 'lead orgânico sem UTM deveria aparecer como "(sem UTM)"');
  assert.equal(semUtm!.mqls, 1);
  assert.ok(r.origensOrganico.some((o) => o.origem === 'youtube · video'));
  // nenhum lead pago vaza pro quadro de orgânico
  const totalOrganico = r.origensOrganico.reduce((s, o) => s + o.leads, 0);
  assert.equal(totalOrganico, 3); // L3 + L6 + L9
});

test('detalhe de leads — temperatura/origem/pago (§S4; temperatura segue pago/orgânico)', () => {
  const d = computeMetrics(fixture(), MARCO, META).leadsDetail;
  assert.equal(d.total, 5);
  // 2026-07-24: pago=quente (4), orgânico=morno (1); 'frio' não existe mais → nem aparece
  assert.deepEqual(d.porTemperatura, { quente: 4, morno: 1 });
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

// ─────────────────────────────── Seção Comercial (2026-08-07) ───────────────────────────────

const COMERCIAL_CFG = {
  vendedores: [
    { slug: 'leo', nome: 'Leo', comissaoPct: 10 },
    { slug: 'gabriel', nome: 'Gabriel', comissaoPct: null },
  ],
  foraDaSecao: ['gui'],
};

/** fixture + vendas com UTM + lista comercial — cenário completo da seção. */
function fixtureComercial() {
  const snap = fixture();
  snap.vendas = [
    ...snap.vendas,
    // venda do leo pelo link rastreado (caso Samuel: lead antigo, comprou pelo link)
    { id: 'V3', date: '2026-03-10', emailKey: 'samuel@x.test', phoneKey: '', nameKey: 'samuel paula', valorBRL: 4294.51, utmSource: 'Comercial', utmMedium: 'leo', sck: 'OCDM_Comercial_leo_comercial-leo_comercial' },
    // linha backfillada só com SCK (sem medium) → ainda atribui ao leo
    { id: 'V4', date: '2026-03-12', emailKey: 'marcia@x.test', phoneKey: '', nameKey: 'marcia barreto', valorBRL: 4127.36, utmSource: '', utmMedium: '', sck: 'OCDM_Comercial_leo_comercial-leo_comercial' },
    // venda do gui = funil do forms → NÃO entra na seção nem vira medium desconhecido
    { id: 'V5', date: '2026-03-15', emailKey: 'g@x.test', phoneKey: '', nameKey: 'cliente gui', valorBRL: 1000, utmSource: 'Comercial', utmMedium: 'gui', sck: '' },
    // vendedor novo sem cadastro → alerta de medium desconhecido
    { id: 'V6', date: '2026-03-16', emailKey: 'n@x.test', phoneKey: '', nameKey: 'cliente novo', valorBRL: 2000, utmSource: 'Comercial', utmMedium: 'novato', sck: '' },
    // contato DA LISTA do gabriel que comprou SEM o link rastreado → alerta de auditoria
    { id: 'V7', date: '2026-03-20', emailKey: 'lista@x.test', phoneKey: '', nameKey: 'pessoa da lista', valorBRL: 3000, utmSource: '', utmMedium: '', sck: '' },
  ];
  snap.leadsComercial = [
    { id: 'leo|l1@x.test', date: '2026-03-01', vendedor: 'leo', emailKey: 'l1@x.test', phoneKey: '', nameKey: 'contato um' },
    { id: 'leo|samuel@x.test', date: '2026-03-02', vendedor: 'leo', emailKey: 'samuel@x.test', phoneKey: '', nameKey: 'samuel paula' },
    { id: 'gabriel|lista@x.test', date: '2026-03-05', vendedor: 'gabriel', emailKey: 'lista@x.test', phoneKey: '', nameKey: 'pessoa da lista' },
    // sem data → conta em qualquer período
    { id: 'gabriel|semdata@x.test', date: '', vendedor: 'gabriel', emailKey: 'semdata@x.test', phoneKey: '', nameKey: 'sem data' },
    // fora do período (não conta em março)
    { id: 'leo|abril@x.test', date: '2026-04-01', vendedor: 'leo', emailKey: 'abril@x.test', phoneKey: '', nameKey: 'so em abril' },
  ];
  return snap;
}

test('comercial — atribuição por UTM (medium e SCK), gui fora, comissão e conversão', () => {
  const r = computeMetrics(fixtureComercial(), MARCO, { ...META, comercial: COMERCIAL_CFG });
  const c = r.comercial;
  assert.equal(c.configurado, true);

  const leo = c.vendedores.find((v) => v.slug === 'leo')!;
  assert.equal(leo.vendas, 2); // V3 (medium) + V4 (só sck)
  near(leo.faturamentoBruto, 4294.51 + 4127.36);
  assert.equal(leo.leadsLista, 2); // contato um + samuel (abril fica fora)
  near(leo.conversao, 2 / 2);
  near(leo.comissaoBRL!, (4294.51 + 4127.36) * 0.1);
  near(leo.liquidoBRL!, (4294.51 + 4127.36) * 0.9);

  const gabriel = c.vendedores.find((v) => v.slug === 'gabriel')!;
  assert.equal(gabriel.vendas, 0);
  assert.equal(gabriel.leadsLista, 2); // pessoa da lista + sem-data
  assert.equal(gabriel.comissaoBRL, null); // % não configurada

  // gui não vira linha nem medium desconhecido; 'novato' vira alerta
  assert.ok(!c.vendedores.some((v) => v.slug === 'gui'));
  assert.deepEqual(c.mediumsDesconhecidos, ['novato']);
  assert.ok(r.meta.warnings.some((w) => w.includes('novato')));

  // auditoria: pessoa da lista do gabriel comprou sem link rastreado
  assert.equal(c.vendasSemLinkRastreado.length, 1);
  assert.equal(c.vendasSemLinkRastreado[0]!.vendedor, 'Gabriel');
  assert.equal(c.vendasSemLinkRastreado[0]!.utmDaVenda, null);
  near(c.vendasSemLinkRastreado[0]!.valorBRL, 3000);

  // cobertura: das 7 vendas de março, 4 têm alguma UTM (V3, V4, V5, V6)
  assert.deepEqual(c.cobertura, { comUtm: 4, total: 7 });
});

test('comercial — sem config a seção vem desconfigurada e nada quebra', () => {
  const r = computeMetrics(fixtureComercial(), MARCO, META); // META sem `comercial`
  assert.equal(r.comercial.configurado, false);
  assert.equal(r.comercial.vendedores.length, 0);
});

test('comercial — venda da lista casada mas marcada com o link de OUTRO vendedor vira alerta com o medium', () => {
  const snap = fixtureComercial();
  // samuel está na LISTA do leo, mas a venda veio marcada como gabriel
  snap.vendas = snap.vendas.map((v) =>
    v.id === 'V3' ? { ...v, utmMedium: 'gabriel', sck: '' } : v,
  );
  const r = computeMetrics(snap, MARCO, { ...META, comercial: COMERCIAL_CFG });
  const alerta = r.comercial.vendasSemLinkRastreado.find((a) => a.vendedor === 'Leo');
  assert.ok(alerta, 'venda do samuel deveria virar alerta na lista do leo');
  assert.equal(alerta!.utmDaVenda, 'gabriel');
  // e a venda conta pro gabriel (a UTM manda na atribuição)
  assert.equal(r.comercial.vendedores.find((v) => v.slug === 'gabriel')!.vendas, 1);
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
