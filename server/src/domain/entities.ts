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
 * · VENDAS tem só nome. Por isso o casamento usa e-mail → telefone → nome (fallbacks).
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
  midiaDiaria: MidiaDiaria[];
  midiaPublico: MidiaPublico[];
  midiaAnuncio: MidiaAnuncio[];
  warnings: string[];
}
