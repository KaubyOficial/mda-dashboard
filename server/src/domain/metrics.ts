/** DTOs de saída da API — SÓ agregados, ZERO PII (§5.4 item 5). */

export interface Range {
  from: string; // ISO YYYY-MM-DD inclusive
  to: string; // ISO YYYY-MM-DD inclusive
}

export interface Delta {
  current: number;
  previous: number;
  abs: number; // current - previous
  pct: number | null; // null quando previous = 0
  /** direção que conta como "melhor" pra esta métrica (semântica de cor). */
  goodDirection: 'up' | 'down';
  /** true quando o movimento foi na direção boa. */
  improved: boolean | null;
}

export interface Kpi {
  key: string;
  label: string;
  value: number;
  format: 'currency' | 'number' | 'percent' | 'ratio';
  formula: string;
  delta: Delta;
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
  /** taxa vs etapa anterior (§4) — null na primeira etapa. */
  rateFromPrev: number | null;
}

export interface MarketingFunnel {
  steps: FunnelStep[];
  costs: { cpc: number | null; custoPorFormulario: number | null; cpl: number | null };
}

export interface CommercialFunnel {
  steps: FunnelStep[];
  ticketMedio: number | null;
  custoPorAgendamento: number | null;
  custoPorVenda: number | null;
}

export interface SegmentRow {
  segmento: 'Fora do perfil' | 'Morno' | 'MQL';
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
  conversaoTotal: number | null; // vendas do segmento ÷ leads do segmento
  custoPorVenda: number | null;
}

export interface PublicoRow {
  publico: string;
  impressoes: number;
  cpm: number | null;
  cliques: number;
  ctr: number | null;
  leads: number;
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

export interface MetricsResponse {
  range: Range;
  previousRange: Range;
  kpis: Kpi[];
  daily: DailyPoint[];
  leadsDetail: LeadsDetail;
  marketingFunnel: MarketingFunnel;
  commercialFunnel: CommercialFunnel;
  segments: SegmentRow[];
  porPublico: PublicoRow[];
  porAnuncio: AnuncioRow[];
  meta: {
    lastSync: string | null;
    stale: boolean;
    source: string;
    warnings: string[];
    generatedAt: string;
  };
}
