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
import { qualifByAnuncio, qualifByPublico } from '../crossjoin/attribution.js';
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
  impressoes: number;
  roas: number | null;
}

function baseAgg(enriched: EnrichedLead[], snap: DataSnapshot, range: Range): BaseAgg {
  const leads = enriched.filter((l) => isInRange(l.date, range));
  const midiaRange = snap.midiaDiaria.filter((m) => isInRange(m.date, range));
  const investimento = sum(midiaRange.map((m) => m.investimentoBRL));
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
    impressoes: sum(midiaRange.map((m) => m.impressoes)),
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
  const cpm = safeDiv(cur.investimento * 1000, cur.impressoes);
  const cpmPrev = safeDiv(prev.investimento * 1000, prev.impressoes);

  return [
    kpi('faturamento', 'Faturamento', cur.faturamento, prev.faturamento, 'currency', 'up', 'Σ valor das vendas no período'),
    kpi('investimento', 'Investimento', cur.investimento, prev.investimento, 'currency', 'down', 'Σ gasto diário de mídia'),
    kpi('lucro', 'Lucro', cur.lucro, prev.lucro, 'currency', 'up', 'Faturamento − Investimento'),
    kpi('vendas', 'Vendas', cur.nVendas, prev.nVendas, 'number', 'up', 'nº de vendas no período'),
    kpi('leads', 'Leads', cur.leadsTotal, prev.leadsTotal, 'number', 'up', 'nº de leads no período'),
    kpi('cpm', 'CPM', cpm ?? 0, cpmPrev ?? 0, 'currency', 'down', 'Investimento ÷ Impressões × 1.000'),
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
  warnings: string[],
): MarketingFunnel {
  const md = snap.midiaDiaria.filter((m) => isInRange(m.date, range));
  const invest = sum(md.map((m) => m.investimentoBRL));
  const impressoes = sum(md.map((m) => m.impressoes));
  const cliques = sum(md.map((m) => m.cliques));
  const cliquesLP = sum(md.map((m) => m.cliquesBotaoLP));
  const formsIni = sum(md.map((m) => m.formsIniciados));
  const leads = enriched.filter((l) => isInRange(l.date, range)).length;

  /**
   * NÃO existe etapa "Forms finalizados": no ACOMPANHAMENTO DIÁRIO ela é a coluna "Leads",
   * ou seja, a MESMA métrica da etapa Leads, só que contada pela planilha de mídia. Mostrar
   * as duas criava um degrau falso (a mídia só conta lead pago e só cobre os dias com mídia,
   * enquanto a aba LEADS conta tudo, inclusive orgânico). A etapa Leads (aba LEADS) é a fonte
   * de verdade — é a mesma que alimenta o KPI de leads.
   */
  // "IniciouForms" só passou a ser preenchido em parte do histórico: dia com mídia rodando e
  // 0 no campo = não rastreado, não "ninguém iniciou". Sem marcar, a etapa fica subcontada e a
  // taxa seguinte passa de 100% parecendo métrica real.
  const naoRastreados = md.filter((m) => m.formsIniciados === 0 && m.formsFinalizados > 0);
  const iniParcial = naoRastreados.length > 0 && formsIni > 0;
  if (iniParcial) {
    const inicio = md.filter((m) => m.formsIniciados > 0).map((m) => m.date).sort()[0];
    warnings.push(
      `FUNIL DE MARKETING: "Início forms" não foi rastreado em ${naoRastreados.length} dia(s) do período que tiveram lead (campo IniciouForms vazio na planilha${inicio ? `; o preenchimento começa em ${inicio}` : ''}). A etapa está subcontada, então as taxas que dependem dela ficam "—" neste recorte.`,
    );
  }

  const steps = [
    { key: 'impressoes', label: 'Impressões', value: impressoes },
    { key: 'cliques', label: 'Cliques', value: cliques },
    { key: 'cliqueLP', label: 'Clique botão LP', value: cliquesLP },
    { key: 'formsIniciados', label: 'Início forms', value: formsIni, partial: iniParcial },
    { key: 'leads', label: 'Leads', value: leads },
  ];
  // taxa de/para uma etapa parcial é incomparável — melhor null do que um número que sabemos errado
  const withRates = steps.map((st, i) => {
    const prev = steps[i - 1];
    const incomparavel = st.partial === true || prev?.partial === true;
    return {
      ...st,
      rateFromPrev: i === 0 || incomparavel ? null : safeDiv(st.value, prev!.value),
    };
  });

  return {
    steps: withRates,
    costs: {
      cpc: safeDiv(invest, cliques),
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

function computePorPublico(
  snap: DataSnapshot,
  enriched: EnrichedLead[],
  range: Range,
  warnings: string[],
): PublicoRow[] {
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
  // A aba TOP PÚBLICOS não tem coluna de MQL — a qualificação vem da aba LEADS via utm_medium.
  const leadsRange = enriched.filter((l) => isInRange(l.date, range));
  const qualif = qualifByPublico(leadsRange, [...byPub.keys()]);
  if (byPub.size > 0 && qualif.unmatched > 0)
    warnings.push(
      `RELATÓRIO POR PÚBLICO: MQL/Morno vêm da aba LEADS cruzados por utm_medium (a aba TOP PÚBLICOS não tem coluna de MQL). ${qualif.unmatched} lead(s) do período não casaram com nenhum público da aba (orgânico/bio ou público fora do TOP) e ficam fora dessas colunas.`,
    );
  return [...byPub.entries()]
    .map(([publico, v]): PublicoRow => {
      const q = qualif.byKey.get(publico);
      return {
        publico,
        impressoes: v.imp,
        cpm: safeDiv(v.inv * 1000, v.imp),
        cliques: v.clq,
        ctr: safeDiv(v.clq, v.imp),
        leads: v.leads,
        mornos: q?.mornos ?? 0,
        mqls: q?.mqls ?? 0,
        conversaoCliqueForms: safeDiv(v.leads, v.clq),
        cpl: safeDiv(v.inv, v.leads),
        custoPorMql: safeDiv(v.inv, q?.mqls ?? 0),
      };
    })
    .sort((a, b) => b.leads - a.leads);
}

function computePorAnuncio(
  snap: DataSnapshot,
  enriched: EnrichedLead[],
  range: Range,
  warnings: string[],
): AnuncioRow[] {
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
  /**
   * MQL/Morno saem da aba LEADS cruzados por utm_content, NÃO da coluna MQL da MÉTRICAS ADS:
   * no dado real essa coluna está quase toda vazia (68 MQL contra 356 marcados na LEADS),
   * e Morno ela não tem. Mantemos impressões/CTR/investimento da aba de ads (única fonte).
   */
  const leadsRange = enriched.filter((l) => isInRange(l.date, range));
  const qualif = qualifByAnuncio(leadsRange, [...byAd.keys()]);
  const mqlNaAba = sum([...byAd.values()].map((m) => m.mqls));
  const mqlAtribuido = sum([...qualif.byKey.values()].map((q) => q.mqls));
  if (byAd.size > 0 && mqlAtribuido !== mqlNaAba)
    warnings.push(
      `RELATÓRIO POR ANÚNCIO: MQL/Morno vêm da aba LEADS cruzados por utm_content (código do anúncio), não da coluna MQL da MÉTRICAS ADS — ela traz ${mqlNaAba} MQL contra ${mqlAtribuido} atribuídos pela LEADS no período. ${qualif.unmatched} lead(s) sem anúncio correspondente (orgânico/bio) ficam fora dessas colunas.`,
    );
  return [...byAd.entries()]
    .map(([anuncio, m]): AnuncioRow => {
      const q = qualif.byKey.get(anuncio);
      return {
        anuncio,
        impressoes: m.imp,
        ctr: safeDiv(m.clq, m.imp),
        leadsTotais: m.leads,
        mornos: q?.mornos ?? 0,
        mqls: q?.mqls ?? 0,
        custoPorMql: safeDiv(m.inv, q?.mqls ?? 0),
        taxaCliqueForms: safeDiv(m.leads, m.clq),
      };
    })
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
    marketingFunnel: computeMarketingFunnel(snap, enriched, range, warnings),
    commercialFunnel: computeCommercialFunnel(enriched, snap, range, warnings),
    segments: computeSegments(enriched, cur.investimento, range, warnings),
    porPublico: computePorPublico(snap, enriched, range, warnings),
    porAnuncio: computePorAnuncio(snap, enriched, range, warnings),
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
