import type { DataSnapshot } from '../src/domain/entities.js';

/**
 * Fixture com números escolhidos para cálculo à mão (golden tests §3.9).
 * Reflete o shape REAL das entidades (nameKey, status de call, leads/MQL por mídia).
 * Tudo em Março/2026. Valores esperados documentados em metrics.test.ts.
 */
export function fixture(): DataSnapshot {
  return {
    // utm.content casa com o anúncio pelo código (AD1 ↔ 'video-ad1') e utm.medium casa com o
    // público pelo slug ('ig-visitou-7d' ↔ '00 - IG Visitou 7D') — igual ao dado real.
    leads: [
      lead('L1', '2026-03-01', 'MQL', 'quente', 'pago', 'anuncio', 'video-ad1', 'ig-visitou-7d', 'a@x.test', '11999990001', 'ana souza'),
      lead('L2', '2026-03-01', 'Morno', 'quente', 'pago', 'anuncio', 'video-ad1', 'ig-visitou-7d', 'b@x.test', '11999990002', 'bruno lima'),
      // orgânico: sem anúncio e com público que não existe na aba → entra no unmatched das duas atribuições
      // (source ig = Instagram orgânico; UTM real do link da bio)
      lead('L3', '2026-03-02', 'Fora do perfil', 'morno', 'organico', 'bio', 'link_in_bio', 'social', 'c@x.test', '11999990003', 'caio dias', 'ig'),
      lead('L4', '2026-03-02', 'MQL', 'quente', 'pago', 'anuncio', 'video-ad2', 'aberto-h-22-44', 'd@x.test', '11999990004', 'duda reis'),
      lead('L5', '2026-03-02', 'Fora do perfil', 'quente', 'pago', 'anuncio', 'video-ad1', 'ig-visitou-7d', 'e@x.test', '11999990005', 'edu melo'),
    ],
    agendamentos: [
      ag('A1', '2026-03-03', 'CALL REALIZADA', 'a@x.test', '11999990001', 'ana souza'),
      ag('A2', '2026-03-03', 'CALL MARCADA', 'b@x.test', '11999990002', 'bruno lima'),
      ag('A3', '2026-03-04', 'CALL REALIZADA', 'd@x.test', '11999990004', 'duda reis'),
    ],
    vendas: [
      venda('V1', '2026-03-05', 'ana souza', 4297),
      venda('V2', '2026-03-06', 'duda reis', 3997),
    ],
    midiaDiaria: [
      md('2026-03-01', 100, 1000, 100, 40, 20, 15, 12),
      md('2026-03-02', 300, 3000, 200, 80, 40, 30, 24),
    ],
    midiaPublico: [
      { date: '2026-03-01', publico: '00 - IG Visitou 7D', investimentoBRL: 250, impressoes: 2500, cliques: 150, leads: 4 },
      { date: '2026-03-02', publico: '00 - Aberto | H | 22 - 44', investimentoBRL: 150, impressoes: 1500, cliques: 150, leads: 2 },
    ],
    // mqls aqui = coluna MQL da MÉTRICAS ADS, subcontada no dado real (por isso a atribuição vem da LEADS)
    midiaAnuncio: [
      { date: '2026-03-01', anuncio: 'AD1 [OCDM] [VID] CAPTAÇÃO', investimentoBRL: 200, impressoes: 2000, cliques: 150, lpViews: 60, vslPlays: 30, chegouCadastro: 0, leads: 3, mqls: 0 },
      { date: '2026-03-02', anuncio: 'AD2 [OCDM] [VID] CAPTAÇÃO', investimentoBRL: 200, impressoes: 2000, cliques: 150, lpViews: 40, vslPlays: 20, chegouCadastro: 0, leads: 2, mqls: 1 },
    ],
    warnings: [],
  };
}

function lead(
  id: string,
  date: string,
  qualificacao: DataSnapshot['leads'][number]['qualificacao'],
  temperatura: DataSnapshot['leads'][number]['temperatura'],
  pagoOrganico: DataSnapshot['leads'][number]['pagoOrganico'],
  origem: DataSnapshot['leads'][number]['origem'],
  content: string,
  medium: string,
  emailKey: string,
  phoneKey: string,
  nameKey: string,
  source = 'FacebookADS',
): DataSnapshot['leads'][number] {
  return {
    id,
    date,
    emailKey,
    phoneKey,
    nameKey,
    qualificacao,
    temperatura,
    origem,
    pagoOrganico,
    utm: { source, medium, campaign: 'OCDM', content, term: '' },
    rendaBRL: qualificacao === 'Fora do perfil' ? 1000 : 5000,
    conhecePlusSemana: qualificacao === 'MQL',
  };
}

function ag(
  id: string,
  date: string,
  status: string,
  emailKey: string,
  phoneKey: string,
  nameKey: string,
): DataSnapshot['agendamentos'][number] {
  return { id, date, emailKey, phoneKey, nameKey, status, compareceu: status === 'CALL REALIZADA' };
}

function venda(id: string, date: string, nameKey: string, valorBRL: number): DataSnapshot['vendas'][number] {
  return { id, date, emailKey: '', phoneKey: '', nameKey, valorBRL };
}

function md(
  date: string,
  investimentoBRL: number,
  impressoes: number,
  cliques: number,
  cliquesBotaoLP: number,
  vslPlays: number,
  formsIniciados: number,
  formsFinalizados: number,
  chegouCadastro = 0,
): DataSnapshot['midiaDiaria'][number] {
  return {
    date,
    investimentoBRL,
    impressoes,
    alcance: Math.round(impressoes * 0.7),
    cliques,
    cliquesBotaoLP,
    vslPlays,
    chegouCadastro,
    formsIniciados,
    formsFinalizados,
  };
}

export const MARCO = { from: '2026-03-01', to: '2026-03-31' };
