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
  /** mini-métrica exibida embaixo do valor principal (ex.: CPL só do tráfego pago). */
  sub?: {
    label: string;
    value: number | null; // null = denominador zero no período ("—")
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
  /** taxa vs etapa anterior (§4) — null na primeira etapa. */
  rateFromPrev: number | null;
  /**
   * Etapa sabidamente subcontada no período (o campo não foi rastreado em parte dos dias).
   * Quando true, nem a taxa dela nem a da etapa seguinte são comparáveis — a UI mostra "—".
   */
  partial?: boolean;
  /** Explicação do que a etapa realmente mede (tooltip na UI) — quando o rótulo pode enganar. */
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

/**
 * Funil comercial recortado por origem do lead (pago × orgânico). Etapas contadas pela DATA DO
 * EVENTO (igual ao funil comercial geral); a origem vem do lead casado (e-mail→telefone→nome).
 * pago + organico + naoAtribuido = funil comercial geral, etapa a etapa.
 */
export interface SplitFunnel {
  steps: FunnelStep[];
  /** vendas ÷ leads do recorte. */
  conversaoTotal: number | null;
}

export interface FunilPagoOrganico {
  pago: SplitFunnel;
  organico: SplitFunnel;
  /** eventos do período SEM lead casado — não dá pra saber se são pago ou orgânico. */
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

/**
 * Seção Comercial: vendas fechadas pelos vendedores (leo, gabriel…), atribuídas pela UTM DO
 * CHECKOUT (colunas Utm/SCK da aba VENDAS), cruzadas com a lista de leads de cada vendedor
 * (aba LEADS COMERCIAL) para conversão e auditoria de uso do link rastreado.
 */
export interface ComercialVendedorRow {
  vendedor: string; // nome de exibição
  slug: string; // utm_medium do link
  /** contatos na lista do vendedor no período (aba LEADS COMERCIAL, pela Data). */
  leadsLista: number;
  /** vendas do período com a UTM do vendedor no checkout. */
  vendas: number;
  /** vendas ÷ leads da lista — null quando a lista está vazia no período. */
  conversao: number | null;
  /** líquido Cakto (mesma base de faturamento do resto do dashboard). */
  faturamentoBruto: number;
  comissaoPct: number | null; // null = configurar em config/comercial.json
  comissaoBRL: number | null;
  /** faturamento − comissão do vendedor. */
  liquidoBRL: number | null;
}

export interface ComercialSection {
  /** false = config/comercial.json ausente ou sem vendedores. */
  configurado: boolean;
  vendedores: ComercialVendedorRow[];
  /**
   * AUDITORIA: venda de alguém que está na LISTA de um vendedor mas SEM a UTM dele no checkout
   * — vendeu sem o link rastreado (utmDaVenda null) ou com o link de outro (slug/medium).
   */
  vendasSemLinkRastreado: { vendedor: string; date: string; valorBRL: number; utmDaVenda: string | null }[];
  /** utm_source=Comercial com medium que não está na config — vendedor novo sem cadastro. */
  mediumsDesconhecidos: string[];
  /** quantas vendas do período têm QUALQUER UTM registrada (histórico sem backfill não tem). */
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
