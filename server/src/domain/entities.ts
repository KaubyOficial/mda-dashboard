/**
 * Contrato de entidades normalizadas (§5.1 do PLANO-MESTRE).
 * Mapeado 1:1 nas 11 abas REAIS da planilha "Mestres do Algoritmo _ OCDM"
 * (ver docs/data-dictionary.md). Datas ISO 'YYYY-MM-DD' fuso America/Sao_Paulo.
 * Sem PII na saída da API; as entidades cruas trazem e-mail/telefone/nome (chaves de cruzamento).
 */

export type Temperatura = 'quente' | 'morno' | 'frio';
export type Qualificacao = 'MQL' | 'Morno' | 'Fora do perfil';
export type Origem = 'bio' | 'anuncio' | 'organico' | 'comercial';
export type PagoOrganico = 'pago' | 'organico';

export interface UtmSet {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  term: string;
}

/**
 * Chaves de cruzamento normalizadas (§5.2) — nunca expostas na API.
 * Realidade das abas: LEADS tem e-mail+telefone+nome · AGENDAMENTOS tem telefone+nome (sem e-mail)
 * · VENDAS tem nome + e-mail do CHECKOUT (casa quando o comprador usou o mesmo e-mail do
 * formulário — medido 2026-08-03: 69 de 207 vendas do histórico; quando ele usou outro, o e-mail
 * não casa com nada) e, desde 2026-08-03, a coluna `Phone` do webhook da Cakto — a chave que
 * sobra quando e-mail e nome falham. Casamento: e-mail → telefone → nome (fallbacks).
 */
export interface MatchKeys {
  emailKey: string; // lowercase + trim
  phoneKey: string; // só dígitos, sem 55/9 de prefixo
  nameKey: string; // nome normalizado (lower, sem acento, espaços colapsados)
}

export interface Lead extends MatchKeys {
  id: string;
  date: string;
  qualificacao: Qualificacao;
  temperatura: Temperatura;
  origem: Origem;
  pagoOrganico: PagoOrganico;
  utm: UtmSet;
  rendaBRL: number | null;
  conhecePlusSemana: boolean;
}

export interface Agendamento extends MatchKeys {
  id: string;
  date: string; // data do agendamento/call
  status: string; // 'CALL MARCADA' | 'CALL REALIZADA' (cru)
  compareceu: boolean; // status === 'CALL REALIZADA'
}

export interface Venda extends MatchKeys {
  id: string;
  date: string; // data da venda
  valorBRL: number; // valor REAL da venda (§4 D7) — aba VENDAS col 'Valor'
  // UTM DO CHECKOUT (colunas opcionais `Utm Source`/`Utm Medium`/`SCK` da aba VENDAS, gravadas
  // pelo n8n a partir do webhook da Cakto e backfilladas do export oficial). É a única forma de
  // saber POR QUAL LINK a venda foi fechada — o lead casado diz de onde a PESSOA veio, não o
  // link usado na compra (caso real: Samuel virou lead orgânico em março e comprou em julho
  // pelo link rastreado do comercial). Linha sem as colunas → ''.
  utmSource?: string;
  utmMedium?: string;
  sck?: string;
}

/**
 * Aba LEADS COMERCIAL (opcional, criada 2026-08-07): a lista de contatos que cada vendedor do
 * comercial (leo, gabriel…) trabalha no mês. Colada à mão a partir do CSV que o vendedor exporta.
 * Serve para (a) medir conversão da lista → venda e (b) auditar se a venda de alguém da lista
 * veio com o link rastreado do vendedor (utm_medium = slug).
 */
export interface LeadComercial extends MatchKeys {
  id: string;
  /** dia que entrou na lista; '' quando a linha não tem data (conta em qualquer período, com aviso). */
  date: string;
  /** slug do vendedor (minúsculo, igual ao utm_medium do link); '' quando a coluna não diz. */
  vendedor: string;
}

/** Aba ACOMPANHAMENTO DIÁRIO (+ LP view/vídeo agregados da aba MÉTRICAS ADS por dia). */
export interface MidiaDiaria {
  date: string;
  investimentoBRL: number; // Gasto
  impressoes: number;
  alcance: number;
  cliques: number; // Cliques no Link
  cliquesBotaoLP: number; // Action Landing Page View (agregado das ADS por dia) = "chegou na LP"
  vslPlays: number; // Action 3s Video Views (agregado das ADS por dia)
  // Cliques no botão da VSL que levam à página de cadastro (/cadastro-monetizacao/) — a etapa
  // ENTRE "chegou na LP" e "começou o formulário". Meta/planilha ainda podem não trazer: 0 = não
  // rastreado (a etapa some do funil em vez de mostrar um degrau falso). Ver docs/data-dictionary.md.
  chegouCadastro: number;
  formsIniciados: number; // IniciouForms (clicou "QUERO ACESSAR" no disclaimer → form começa)
  formsFinalizados: number; // Leads (contagem de mídia do dia)
}

/** Aba TOP PÚBLICOS (traz leads por público). */
export interface MidiaPublico {
  date: string;
  publico: string;
  investimentoBRL: number; // GASTO
  impressoes: number;
  cliques: number;
  leads: number; // LEADS (a aba já traz)
}

/** Aba MÉTRICAS ADS (traz leads e MQLs por anúncio — Action Leads / MQL). */
export interface MidiaAnuncio {
  date: string;
  anuncio: string; // Ad Name
  investimentoBRL: number; // Spend
  impressoes: number;
  cliques: number; // Inline Link Clicks
  lpViews: number; // Action Landing Page View
  vslPlays: number; // Action 3s Video Views
  chegouCadastro: number; // custom conversion "chegou no cadastro" (0 se a coluna não existir)
  leads: number; // Action Leads
  mqls: number; // MQL (col da aba)
}

export interface DataSnapshot {
  leads: Lead[];
  agendamentos: Agendamento[];
  vendas: Venda[];
  /** aba LEADS COMERCIAL (opcional — [] quando a aba ainda não existe). */
  leadsComercial: LeadComercial[];
  midiaDiaria: MidiaDiaria[];
  midiaPublico: MidiaPublico[];
  midiaAnuncio: MidiaAnuncio[];
  warnings: string[];
}
