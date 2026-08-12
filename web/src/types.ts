/** Espelho dos DTOs da API (server/src/domain/metrics.ts) — só agregados, zero PII. */
export interface Range {
  from: string;
  to: string;
}
export interface Delta {
  current: number;
  previous: number;
  abs: number;
  pct: number | null;
  goodDirection: 'up' | 'down';
  improved: boolean | null;
}
export interface Kpi {
  key: string;
  label: string;
  value: number;
  format: 'currency' | 'number' | 'percent' | 'ratio';
  formula: string;
  delta: Delta;
  /** mini-métrica exibida embaixo do valor principal (ex.: CPL só do tráfego pago). */
  sub?: {
    label: string;
    value: number | null;
    format: 'currency' | 'number' | 'percent' | 'ratio';
    formula: string;
  };
}
export interface DailyPoint {
  date: string;
  leads: number;
  cpl: number | null;
  investimento: number;
  vendas: number;
  faturamento: number;
}
export interface LeadsDetail {
  porTemperatura: Record<string, number>;
  porOrigem: Record<string, number>;
  pagoVsOrganico: { pago: number; organico: number };
  total: number;
}
export interface FunnelStep {
  key: string;
  label: string;
  value: number;
  rateFromPrev: number | null;
  /** etapa subcontada no período (campo não rastreado em parte dos dias) */
  partial?: boolean;
  /** explicação do que a etapa realmente mede (tooltip) */
  hint?: string;
}
export interface MarketingFunnel {
  steps: FunnelStep[];
  costs: { cpc: number | null; cpl: number | null };
}
export interface CommercialFunnel {
  steps: FunnelStep[];
  ticketMedio: number | null;
  custoPorAgendamento: number | null;
  custoPorVenda: number | null;
}
/** Funil comercial recortado por origem do lead (pago × orgânico); etapas por data do evento. */
export interface SplitFunnel {
  steps: FunnelStep[];
  conversaoTotal: number | null;
}
export interface FunilPagoOrganico {
  pago: SplitFunnel;
  organico: SplitFunnel;
  /** eventos do período sem lead casado (origem indecidível). */
  naoAtribuido: { agendamentos: number; comparecimentos: number; vendas: number };
}
/** De onde vêm os leads ORGÂNICOS — agrupado pela UTM (source · medium · content). */
export interface OrigemOrganicaRow {
  origem: string;
  leads: number;
  mornos: number;
  mqls: number;
  agendamentos: number;
  vendas: number;
  conversaoTotal: number | null;
}
export interface SegmentRow {
  segmento: string;
  leads: number;
  custoPorLead: number | null;
  respostas: number;
  taxaResposta: number | null;
  agendamentos: number;
  taxaAgendamento: number | null;
  comparecimentos: number;
  taxaComparecimento: number | null;
  vendas: number;
  taxaVenda: number | null;
  conversaoTotal: number | null;
  custoPorVenda: number | null;
}
export interface PublicoRow {
  publico: string;
  impressoes: number;
  cpm: number | null;
  cliques: number;
  ctr: number | null;
  leads: number;
  mornos: number;
  mqls: number;
  conversaoCliqueForms: number | null;
  cpl: number | null;
  custoPorMql: number | null;
}
export interface AnuncioRow {
  anuncio: string;
  impressoes: number;
  ctr: number | null;
  leadsTotais: number;
  mornos: number;
  mqls: number;
  custoPorMql: number | null;
  taxaCliqueForms: number | null;
}
/** Seção Comercial — vendas por link rastreado do vendedor (UTM do checkout) × lista de leads. */
export interface ComercialVendedorRow {
  vendedor: string;
  slug: string;
  leadsLista: number;
  vendas: number;
  conversao: number | null;
  faturamentoBruto: number;
  comissaoPct: number | null;
  comissaoBRL: number | null;
  liquidoBRL: number | null;
}
export interface ComercialSection {
  configurado: boolean;
  vendedores: ComercialVendedorRow[];
  vendasSemLinkRastreado: { vendedor: string; date: string; valorBRL: number; utmDaVenda: string | null }[];
  mediumsDesconhecidos: string[];
  cobertura: { comUtm: number; total: number };
}
export interface MetricsResponse {
  range: Range;
  previousRange: Range;
  kpis: Kpi[];
  daily: DailyPoint[];
  leadsDetail: LeadsDetail;
  marketingFunnel: MarketingFunnel;
  commercialFunnel: CommercialFunnel;
  funilPagoOrganico: FunilPagoOrganico;
  segments: SegmentRow[];
  porPublico: PublicoRow[];
  porAnuncio: AnuncioRow[];
  origensOrganico: OrigemOrganicaRow[];
  comercial: ComercialSection;
  meta: {
    lastSync: string | null;
    stale: boolean;
    source: string;
    warnings: string[];
    generatedAt: string;
  };
}
export interface SyncResult {
  status: 'ok' | 'error';
  source: string;
  counts: Record<string, number>;
  warnings: string[];
  error?: string;
  skipped?: boolean;
}
