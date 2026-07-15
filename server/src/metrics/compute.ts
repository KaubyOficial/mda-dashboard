import type { DataSnapshot } from '../domain/entities.js';
import type {
  AnuncioRow,
  CommercialFunnel,
  DailyPoint,
  Kpi,
  LeadsDetail,
  MarketingFunnel,
  MetricsResponse,
  PublicoRow,
  Range,
  SegmentRow,
} from '../domain/metrics.js';
import type { EnrichedLead } from '../crossjoin/match.js';
import { enrichLeads } from '../crossjoin/match.js';
import { isInRange, eachDay, previousRange } from './period.js';
import { makeDelta, safeDiv, sum } from './helpers.js';

interface BaseAgg {
  faturamento: number;
  investimento: number;
  lucro: number;
  leadsTotal: number;
  leadsMorno: number;
  leadsMql: number;
  nVendas: number;
  nAgend: number;
  nComp: number;
  roas: number | null;
}

function baseAgg(enriched: EnrichedLead[], snap: DataSnapshot, range: Range): BaseAgg {
  const leads = enriched.filter((l) => isInRange(l.date, range));
  const investimento = sum(
    snap.midiaDiaria.filter((m) => isInRange(m.date, range)).map((m) => m.investimentoBRL),
  );
  const vendasRange = snap.vendas.filter((v) => isInRange(v.date, range));
  const faturamento = sum(vendasRange.map((v) => v.valorBRL));
  const agendRange = snap.agendamentos.filter((a) => isInRange(a.date, range));
  return {
    faturamento,
    investimento,
    lucro: faturamento - investimento,
    leadsTotal: leads.length,
    leadsMorno: leads.filter((l) => l.qualificacao === 'Morno').length,
    leadsMql: leads.filter((l) => l.qualificacao === 'MQL').length,
    nVendas: vendasRange.length,
    nAgend: agendRange.length,
    nComp: agendRange.filter((a) => a.compareceu).length,
    roas: safeDiv(faturamento, investimento),
  };
}

function computeKpis(cur: BaseAgg, prev: BaseAgg): Kpi[] {
  const cplTodos = safeDiv(cur.investimento, cur.leadsTotal);
  const cplTodosPrev = safeDiv(prev.investimento, prev.leadsTotal);
  const cplMorno = safeDiv(cur.investimento, cur.leadsMorno);
  const cplMornoPrev = safeDiv(prev.investimento, prev.leadsMorno);
  const cplMql = safeDiv(cur.investimento, cur.leadsMql);
  const cplMqlPrev = safeDiv(prev.investimento, prev.leadsMql);
  const cac = safeDiv(cur.investimento, cur.nVendas);
  const cacPrev = safeDiv(prev.investimento, prev.nVendas);
  const conv = safeDiv(cur.nVendas, cur.leadsTotal);
  const convPrev = safeDiv(prev.nVendas, prev.leadsTotal);

  return [
    kpi('faturamento', 'Faturamento', cur.faturamento, prev.faturamento, 'currency', 'up', 'Σ valor das vendas no período'),
    kpi('investimento', 'Investimento', cur.investimento, prev.investimento, 'currency', 'down', 'Σ gasto diário de mídia'),
    kpi('lucro', 'Lucro', cur.lucro, prev.lucro, 'currency', 'up', 'Faturamento − Investimento'),
    kpi('leads', 'Leads', cur.leadsTotal, prev.leadsTotal, 'number', 'up', 'nº de leads no período'),
    kpi('cpl', 'CPL (todos)', cplTodos ?? 0, cplTodosPrev ?? 0, 'currency', 'down', 'Investimento ÷ Leads totais'),
    kpi('cplMorno', 'CPL morno', cplMorno ?? 0, cplMornoPrev ?? 0, 'currency', 'down', 'Investimento ÷ Leads mornos'),
    kpi('cplMql', 'CPL MQL', cplMql ?? 0, cplMqlPrev ?? 0, 'currency', 'down', 'Investimento ÷ MQLs'),
    kpi('cac', 'CAC', cac ?? 0, cacPrev ?? 0, 'currency', 'down', 'Investimento ÷ nº de vendas'),
    kpi('conversao', 'Conversão lead→venda', (conv ?? 0) * 100, (convPrev ?? 0) * 100, 'percent', 'up', 'Vendas ÷ Leads totais'),
    kpi('roas', 'ROAS', cur.roas ?? 0, prev.roas ?? 0, 'ratio', 'up', 'Faturamento ÷ Investimento'),
  ];
}

function kpi(
  key: string,
  label: string,
  value: number,
  previous: number,
  format: Kpi['format'],
  good: 'up' | 'down',
  formula: string,
): Kpi {
  return { key, label, value, format, formula, delta: makeDelta(value, previous, good) };
}

function computeDaily(enriched: EnrichedLead[], snap: DataSnapshot, range: Range): DailyPoint[] {
  const leadsByDay = new Map<string, number>();
  for (const l of enriched) if (isInRange(l.date, range)) leadsByDay.set(l.date, (leadsByDay.get(l.date) ?? 0) + 1);
  const investByDay = new Map<string, number>();
  for (const m of snap.midiaDiaria) if (isInRange(m.date, range)) investByDay.set(m.date, (investByDay.get(m.date) ?? 0) + m.investimentoBRL);
  const fatByDay = new Map<string, number>();
  const vendasCountByDay = new Map<string, number>();
  for (const v of snap.vendas)
    if (isInRange(v.date, range)) {
      fatByDay.set(v.date, (fatByDay.get(v.date) ?? 0) + v.valorBRL);
      vendasCountByDay.set(v.date, (vendasCountByDay.get(v.date) ?? 0) + 1);
    }

  return eachDay(range).map((date) => {
    const leads = leadsByDay.get(date) ?? 0;
    const investimento = investByDay.get(date) ?? 0;
    return {
      date,
      leads,
      cpl: safeDiv(investimento, leads),
      investimento,
      vendas: vendasCountByDay.get(date) ?? 0,
      faturamento: fatByDay.get(date) ?? 0,
    };
  });
}

function computeLeadsDetail(enriched: EnrichedLead[], range: Range): LeadsDetail {
  const leads = enriched.filter((l) => isInRange(l.date, range));
  const porTemperatura: Record<string, number> = { quente: 0, morno: 0, frio: 0 };
  const porOrigem: Record<string, number> = {};
  let pago = 0;
  let organico = 0;
  for (const l of leads) {
    porTemperatura[l.temperatura] = (porTemperatura[l.temperatura] ?? 0) + 1;
    porOrigem[l.origem] = (porOrigem[l.origem] ?? 0) + 1;
    if (l.pagoOrganico === 'pago') pago++;
    else organico++;
  }
  return { porTemperatura, porOrigem, pagoVsOrganico: { pago, organico }, total: leads.length };
}

function computeMarketingFunnel(
  snap: DataSnapshot,
  enriched: EnrichedLead[],
  range: Range,
): MarketingFunnel {
  const md = snap.midiaDiaria.filter((m) => isInRange(m.date, range));
  const invest = sum(md.map((m) => m.investimentoBRL));
  const impressoes = sum(md.map((m) => m.impressoes));
  const cliques = sum(md.map((m) => m.cliques));
  const cliquesLP = sum(md.map((m) => m.cliquesBotaoLP));
  const vsl = sum(md.map((m) => m.vslPlays));
  const formsIni = sum(md.map((m) => m.formsIniciados));
  const formsFin = sum(md.map((m) => m.formsFinalizados));
  const leads = enriched.filter((l) => isInRange(l.date, range)).length;

  const steps = [
    { key: 'impressoes', label: 'Impressões', value: impressoes },
    { key: 'cliques', label: 'Cliques', value: cliques },
    { key: 'cliqueLP', label: 'Clique botão LP', value: cliquesLP },
    { key: 'vslPlays', label: 'Play VSL', value: vsl },
    { key: 'formsIniciados', label: 'Início forms', value: formsIni },
    { key: 'formsFinalizados', label: 'Forms finalizados', value: formsFin },
    { key: 'leads', label: 'Leads', value: leads },
  ];
  const withRates = steps.map((st, i) => ({
    ...st,
    rateFromPrev: i === 0 ? null : safeDiv(st.value, steps[i - 1]!.value),
  }));
  return {
    steps: withRates,
    costs: {
      cpc: safeDiv(invest, cliques),
      custoPorFormulario: safeDiv(invest, formsFin),
      cpl: safeDiv(invest, leads),
    },
  };
}

function computeCommercialFunnel(
  enriched: EnrichedLead[],
  snap: DataSnapshot,
  range: Range,
  warnings: string[],
): CommercialFunnel {
  const invest = sum(
    snap.midiaDiaria.filter((m) => isInRange(m.date, range)).map((m) => m.investimentoBRL),
  );
  const nLeads = enriched.filter((l) => isInRange(l.date, range)).length;
  const agend = snap.agendamentos.filter((a) => isInRange(a.date, range));
  const nAgend = agend.length;
  const nComp = agend.filter((a) => a.compareceu).length;
  const vendasRange = snap.vendas.filter((v) => isInRange(v.date, range));
  const nVendas = vendasRange.length;
  const faturamento = sum(vendasRange.map((v) => v.valorBRL));

  warnings.push(
    'FUNIL COMERCIAL: as abas atuais rastreiam Agendamento (CALL MARCADA) → Comparecimento (CALL REALIZADA) → Venda; não há etapa "contato"/"resposta" registrada (só aparece com CRM).',
  );

  const steps = [
    { key: 'leads', label: 'Leads', value: nLeads },
    { key: 'agendamentos', label: 'Agendamentos', value: nAgend },
    { key: 'comparecimentos', label: 'Comparecimentos', value: nComp },
    { key: 'vendas', label: 'Vendas', value: nVendas },
  ];
  const withRates = steps.map((st, i) => ({
    ...st,
    rateFromPrev: i === 0 ? null : safeDiv(st.value, steps[i - 1]!.value),
  }));
  return {
    steps: withRates,
    ticketMedio: safeDiv(faturamento, nVendas),
    custoPorAgendamento: safeDiv(invest, nAgend),
    custoPorVenda: safeDiv(invest, nVendas),
  };
}

function computeSegments(
  enriched: EnrichedLead[],
  investimentoTotal: number,
  range: Range,
  warnings: string[],
): SegmentRow[] {
  const leads = enriched.filter((l) => isInRange(l.date, range));
  const segments: SegmentRow['segmento'][] = ['Fora do perfil', 'Morno', 'MQL'];
  warnings.push(
    'SEGMENTOS: "taxa de resposta" não existe nas abas (não há etapa de resposta registrada) — null. Agend/comparec/venda por segmento vêm do casamento com AGENDAMENTOS/VENDAS (cobertura limitada ao período com LEADS).',
  );
  return segments.map((seg) => {
    const cohort = leads.filter((l) => l.qualificacao === seg);
    const nLeads = cohort.length;
    const nAgend = cohort.filter((l) => l.temAgendamento).length;
    const nComp = cohort.filter((l) => l.compareceu).length;
    const nVendas = cohort.filter((l) => l.temVenda).length;
    return {
      segmento: seg,
      leads: nLeads,
      custoPorLead: safeDiv(investimentoTotal, nLeads), // §4: investimento TOTAL ÷ contagem do segmento
      respostas: 0,
      taxaResposta: null,
      agendamentos: nAgend,
      taxaAgendamento: safeDiv(nAgend, nLeads),
      comparecimentos: nComp,
      taxaComparecimento: safeDiv(nComp, nAgend),
      vendas: nVendas,
      taxaVenda: safeDiv(nVendas, nComp),
      conversaoTotal: safeDiv(nVendas, nLeads),
      custoPorVenda: safeDiv(investimentoTotal, nVendas), // §4: investimento TOTAL ÷ vendas do segmento
    };
  });
}

function computePorPublico(snap: DataSnapshot, range: Range, warnings: string[]): PublicoRow[] {
  const rows = snap.midiaPublico.filter((m) => isInRange(m.date, range));
  const byPub = new Map<string, { inv: number; imp: number; clq: number; leads: number }>();
  for (const r of rows) {
    const cur = byPub.get(r.publico) ?? { inv: 0, imp: 0, clq: 0, leads: 0 };
    cur.inv += r.investimentoBRL;
    cur.imp += r.impressoes;
    cur.clq += r.cliques;
    cur.leads += r.leads;
    byPub.set(r.publico, cur);
  }
  if (byPub.size > 0)
    warnings.push('RELATÓRIO POR PÚBLICO: MQLs por público não existem na aba TOP PÚBLICOS — coluna MQL/custo-MQL fica "—".');
  return [...byPub.entries()]
    .map(([publico, v]): PublicoRow => ({
      publico,
      impressoes: v.imp,
      cpm: safeDiv(v.inv * 1000, v.imp),
      cliques: v.clq,
      ctr: safeDiv(v.clq, v.imp),
      leads: v.leads,
      mqls: 0, // não há coluna de MQL por público na aba
      conversaoCliqueForms: safeDiv(v.leads, v.clq),
      cpl: safeDiv(v.inv, v.leads),
      custoPorMql: null,
    }))
    .sort((a, b) => b.leads - a.leads);
}

function computePorAnuncio(snap: DataSnapshot, range: Range): AnuncioRow[] {
  // A aba MÉTRICAS ADS já traz Action Leads e MQL por anúncio — usamos direto (sem achismo de atribuição).
  const rows = snap.midiaAnuncio.filter((m) => isInRange(m.date, range));
  const byAd = new Map<
    string,
    { inv: number; imp: number; clq: number; leads: number; mqls: number }
  >();
  for (const r of rows) {
    const cur = byAd.get(r.anuncio) ?? { inv: 0, imp: 0, clq: 0, leads: 0, mqls: 0 };
    cur.inv += r.investimentoBRL;
    cur.imp += r.impressoes;
    cur.clq += r.cliques;
    cur.leads += r.leads;
    cur.mqls += r.mqls;
    byAd.set(r.anuncio, cur);
  }
  return [...byAd.entries()]
    .map(([anuncio, m]): AnuncioRow => ({
      anuncio,
      impressoes: m.imp,
      ctr: safeDiv(m.clq, m.imp),
      leadsTotais: m.leads,
      mornos: 0, // aba de ads não separa mornos; distribuição de qualificação vem da aba LEADS
      mqls: m.mqls,
      custoPorMql: safeDiv(m.inv, m.mqls),
      taxaCliqueForms: safeDiv(m.leads, m.clq),
    }))
    .sort((a, b) => b.leadsTotais - a.leadsTotais);
}

export interface ComputeMeta {
  lastSync: string | null;
  stale: boolean;
  source: string;
  extraWarnings: string[];
}

/** Motor completo: DataSnapshot + range → MetricsResponse (§4). Função PURA (testável isolada). */
export function computeMetrics(
  snap: DataSnapshot,
  range: Range,
  meta: ComputeMeta,
  preset?: string,
): MetricsResponse {
  const { enriched } = enrichLeads(snap);
  const prevRange = previousRange(range, preset);
  const cur = baseAgg(enriched, snap, range);
  const prev = baseAgg(enriched, snap, prevRange);
  const warnings: string[] = [...meta.extraWarnings, ...snap.warnings];

  return {
    range,
    previousRange: prevRange,
    kpis: computeKpis(cur, prev),
    daily: computeDaily(enriched, snap, range),
    leadsDetail: computeLeadsDetail(enriched, range),
    marketingFunnel: computeMarketingFunnel(snap, enriched, range),
    commercialFunnel: computeCommercialFunnel(enriched, snap, range, warnings),
    segments: computeSegments(enriched, cur.investimento, range, warnings),
    porPublico: computePorPublico(snap, range, warnings),
    porAnuncio: computePorAnuncio(snap, range),
    meta: {
      lastSync: meta.lastSync,
      stale: meta.stale,
      source: meta.source,
      warnings: dedupe(warnings),
      generatedAt: new Date().toISOString(),
    },
  };
}

function dedupe(arr: string[]): string[] {
  return [...new Set(arr)];
}
