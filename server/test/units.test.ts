import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDateISO, parseMoneyBRL, rendaLowerBoundBRL } from '../src/util/parse.js';
import { normalizeEmail, normalizePhone } from '../src/util/keys.js';
import { classifyByAnswers, normalizeConhece } from '../src/normalize/qualification.js';
import { previousRange, validateRange, RangeError, daysInclusive } from '../src/metrics/period.js';
import { enrichLeads } from '../src/crossjoin/match.js';
import { adCode, publicoSlug } from '../src/crossjoin/attribution.js';
import { mapOrigem, mapTemperatura, type UtmMap } from '../src/normalize/utm.js';
import {
  parseVendaRows,
  parseMidiaDiariaRows,
  parseMidiaAnuncioRows,
  mergeAdsIntoDiaria,
} from '../src/normalize/leadRows.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { fixture } from './fixtures.js';

const utmMap = JSON.parse(
  readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../config/utm-map.json'), 'utf8'),
) as UtmMap;
const utm = (source: string, medium: string, campaign = '') => ({
  source,
  medium,
  campaign,
  content: '',
  term: '',
});

test('parseDateISO — BR e ISO', () => {
  assert.equal(parseDateISO('05/03/2026'), '2026-03-05');
  assert.equal(parseDateISO('05/03/2026 14:30:00'), '2026-03-05');
  assert.equal(parseDateISO('2026-03-05T10:00:00'), '2026-03-05');
  assert.equal(parseDateISO('lixo'), null);
  assert.equal(parseDateISO(''), null);
});

test('parseMoneyBRL — formatos BR (incl. sem separador de milhar)', () => {
  assert.equal(parseMoneyBRL('R$ 4.297,00'), 4297);
  assert.equal(parseMoneyBRL('R$ 1000,00'), 1000); // regressão: bug do "R$ 1000,00" → 100
  assert.equal(parseMoneyBRL('R$ 10.000,50'), 10000.5);
  assert.equal(parseMoneyBRL('3862.0'), 3862); // ponto decimal (float exportado)
  assert.equal(parseMoneyBRL('2.000 a 3.000'), 2000);
  assert.equal(parseMoneyBRL('Acima de R$ 10.000'), 10000);
  assert.equal(parseMoneyBRL(''), null);
});

test('rendaLowerBound — regra da qualificação', () => {
  assert.equal(rendaLowerBoundBRL('Desempregado'), 0);
  assert.equal(rendaLowerBoundBRL('Ganhando menos de R$3.000\\/mês'), 0);
  assert.equal(rendaLowerBoundBRL('R$ 2.000 a R$ 3.000'), 2000);
  assert.equal(rendaLowerBoundBRL('Acima de R$ 10.000'), 10000);
});

test('classifyByAnswers — regra simplificada travada', () => {
  assert.equal(classifyByAnswers('R$ 1.000 a R$ 2.000', '1 ano').qualificacao, 'Fora do perfil');
  assert.equal(classifyByAnswers('R$ 2.000 a R$ 3.000', 'anúncio').qualificacao, 'Morno');
  assert.equal(classifyByAnswers('Acima de R$ 10.000', '3 meses').qualificacao, 'MQL');
  assert.equal(normalizeConhece('3 dias'), false);
  assert.equal(normalizeConhece('6 meses'), true);
});

test('normalizePhone — casa com/sem 55 e formatação', () => {
  assert.equal(normalizePhone('+55 (11) 99999-0001'), '11999990001');
  assert.equal(normalizePhone('11999990001'), '11999990001');
  assert.equal(normalizeEmail('  A@X.test '), 'a@x.test');
});

test('validateRange — erros', () => {
  assert.throws(() => validateRange('2026-13-01', '2026-03-31'), RangeError);
  assert.throws(() => validateRange('2026-03-31', '2026-03-01'), RangeError);
  assert.deepEqual(validateRange('2026-03-01', '2026-03-31'), { from: '2026-03-01', to: '2026-03-31' });
});

test('previousRange — mês-atual (N dias corridos) e genérico', () => {
  // mês atual: 1..15 de março → 1..15 de fevereiro
  assert.deepEqual(previousRange({ from: '2026-03-01', to: '2026-03-15' }, 'mes-atual'), {
    from: '2026-02-01',
    to: '2026-02-15',
  });
  // clamp: 1..31 de março → fevereiro tem 28 dias
  assert.deepEqual(previousRange({ from: '2026-03-01', to: '2026-03-31' }, 'mes-atual'), {
    from: '2026-02-01',
    to: '2026-02-28',
  });
  // genérico: janela de mesma duração imediatamente anterior
  assert.deepEqual(previousRange({ from: '2026-03-10', to: '2026-03-12' }), {
    from: '2026-03-07',
    to: '2026-03-09',
  });
  assert.equal(daysInclusive({ from: '2026-03-10', to: '2026-03-12' }), 3);
});

test('utm-map real — field names casam com UtmSet (regressão: tudo virava frio)', () => {
  // valores REAIS da aba LEADS
  assert.equal(mapTemperatura(utm('FacebookADS', 'ig-visitou-7d'), utmMap), 'quente');
  assert.equal(mapTemperatura(utm('FacebookADS', 'lookalike-1-lista-de-compradores-MDA'), utmMap), 'quente');
  assert.equal(mapTemperatura(utm('FacebookADS', 'ig-envolvimento-7d'), utmMap), 'morno');
  assert.equal(mapTemperatura(utm('ig', 'social'), utmMap), 'frio');
  assert.equal(mapTemperatura(utm('FacebookADS', 'x', '23-04-26-OCDM-Q-AUTO-CAPTACAO-REMARKETING'), utmMap), 'quente');
  assert.equal(mapOrigem(utm('FacebookADS', 'ig-visitou-7d'), utmMap), 'anuncio');
  assert.equal(mapOrigem(utm('BioOrganico', ''), utmMap), 'bio');
});

test('enrichLeads — vendas casam por nome (aba VENDAS só tem nome) + não atribuído', () => {
  const f = fixture();
  const { enriched, report, unattributedVendas } = enrichLeads(f);
  assert.equal(report.byName, 2); // V1→ana souza, V2→duda reis
  assert.equal(report.byEmail, 0);
  assert.equal(report.unmatched, 0);
  assert.equal(unattributedVendas.length, 0);
  const l1 = enriched.find((l) => l.id === 'L1')!;
  assert.equal(l1.temVenda, true);
  assert.equal(l1.valorVendaBRL, 4297);
  // agendamento casa por telefone (aba AGENDAMENTOS não tem e-mail)
  assert.equal(enriched.find((l) => l.id === 'L2')!.temAgendamento, true);

  // venda órfã (nome desconhecido) cai em não-atribuído
  f.vendas.push({ id: 'V9', date: '2026-03-07', emailKey: '', phoneKey: '', nameKey: 'ninguem', valorBRL: 999 });
  const r2 = enrichLeads(f);
  assert.equal(r2.report.unmatched, 1);
  assert.equal(r2.unattributedVendas[0]!.valorBRL, 999);
});

test('adCode — casa utm_content do lead com o nome do anúncio da aba', () => {
  // dado real: 'video-ad02' (utm) precisa casar com 'AD02 [OCDM] [VID] CAPTAÇÃO - …' (aba)
  assert.equal(adCode('video-ad02'), '02');
  assert.equal(adCode('AD02 [OCDM] [VID] CAPTAÇÃO - IMAGINA EU CRIANDO SEU CANAL'), '02');
  assert.equal(adCode('video-ad2'), '02'); // padding: ad2 e ad02 são o mesmo anúncio
  assert.equal(adCode('AD44 [OCDM] [VID] CAPTAÇÃO - QUAL É A MELHOR FORMA V4'), '44');
  // sem código → não casa com ninguém (não pode virar atribuição no chute)
  assert.equal(adCode('link_in_bio'), null);
  assert.equal(adCode('organico'), null);
  assert.equal(adCode('120232344800710100'), null);
  assert.equal(adCode(''), null);
});

test('publicoSlug — casa utm_medium do lead com o nome do público da aba', () => {
  assert.equal(publicoSlug('00 - IG Visitou 7D'), 'ig-visitou-7d');
  assert.equal(publicoSlug('ig-visitou-7d'), 'ig-visitou-7d');
  // acento, %, + e o espaço a mais que aparece no dado real têm que colapsar no mesmo slug
  assert.equal(
    publicoSlug('00 - Caiu Captura 180D + VV Convite 50% 30D + Envolvimento 1D'),
    publicoSlug('caiu-captura-180d-vv-convite-50-30D-envolvimento-1d'),
  );
  assert.equal(
    publicoSlug('caiu-captura-180d-vv-convite-50- 30D-envolvimento-1d'),
    publicoSlug('caiu-captura-180d-vv-convite-50-30D-envolvimento-1d'),
  );
  assert.equal(publicoSlug('00 - Aberto | H | 22 - 44'), 'aberto-h-22-44');
  assert.equal(publicoSlug('(sem público)'), 'sem-publico');
});

test('parseVendaRows — une pagamento dividido (mesmo e-mail) e NÃO une nomes iguais sem e-mail', () => {
  const header = ['Data', 'Status', 'Nome', 'E-mail', 'Valor'];
  const rows = [
    header,
    // 1 venda paga em partes no mesmo dia (metade cartão / metade pix) → deve virar UMA (4202.35)
    ['16/06/2026', 'VENDA REALIZADA', 'João Paulo', 'joaopaulo@gmail.com', '2497,51'],
    ['16/06/2026', 'VENDA REALIZADA', 'João Paulo', 'joaopaulo@gmail.com', '1704,84'],
    // 1 venda em 2 parcelas, 16 dias de distância (dentro da janela) → UMA (4292.02)
    ['20/04/2026', 'VENDA REALIZADA', 'Gustavo', 'gustavo@gmail.com', '2146,01'],
    ['06/05/2026', 'VENDA REALIZADA', 'Gustavo', 'gustavo@gmail.com', '2146,01'],
    // 2 pessoas DIFERENTES de mesmo primeiro nome, SEM e-mail, ticket cheio → NÃO une (2 vendas)
    ['16/07/2025', 'VENDA REALIZADA', 'Rafael', '', '4297,00'],
    ['14/08/2025', 'VENDA REALIZADA', 'Rafael', '', '4297,00'],
    // linha ignorada (status diferente)
    ['01/01/2026', 'CANCELADA', 'Fulano', 'fulano@gmail.com', '4297,00'],
  ];
  const warnings: string[] = [];
  const vendas = parseVendaRows(rows, warnings);
  // 2 (João Paulo + Gustavo unidos) + 2 (Rafaéis separados) = 4 vendas; CANCELADA fora
  assert.equal(vendas.length, 4);
  const byEmail = (e: string) => vendas.find((v) => v.emailKey === e)!;
  assert.equal(Math.round(byEmail('joaopaulo@gmail.com').valorBRL * 100), 420235);
  assert.equal(Math.round(byEmail('gustavo@gmail.com').valorBRL * 100), 429202);
  // os 2 Rafaéis sem e-mail seguem separados, ticket cheio cada
  const rafaeis = vendas.filter((v) => v.emailKey === '' && v.nameKey === 'rafael');
  assert.equal(rafaeis.length, 2);
  assert.ok(rafaeis.every((v) => v.valorBRL === 4297));
  // faturamento total preservado (soma não muda ao unir): 4202.35+4292.02+4297+4297
  const total = vendas.reduce((s, v) => s + v.valorBRL, 0);
  assert.equal(Math.round(total * 100), 420235 + 429202 + 429700 + 429700);
  assert.ok(warnings.some((w) => w.includes('divididas em 2+ linhas')));
});

test('chegouCadastro — lê a coluna manual do ACOMPANHAMENTO DIÁRIO (clique no botão da LP)', () => {
  const rows = [
    ['Data', 'Gasto', 'Leads', 'Cliques no Link', 'Impressões', 'VPG', 'Cliques no Botão', 'IniciouForms'],
    ['01/03/2026', '100', '12', '100', '1000', '40', '18', '15'],
  ];
  const md = parseMidiaDiariaRows(rows);
  assert.equal(md[0]!.chegouCadastro, 18);
  assert.equal(md[0]!.formsIniciados, 15);
});

test('chegouCadastro — coluna ausente = 0 (etapa fica escondida, não quebra)', () => {
  const rows = [
    ['Data', 'Gasto', 'Leads', 'Cliques no Link', 'Impressões', 'IniciouForms'],
    ['01/03/2026', '100', '12', '100', '1000', '15'],
  ];
  assert.equal(parseMidiaDiariaRows(rows)[0]!.chegouCadastro, 0);
});

test('chegouCadastro — vem do custom conversion das MÉTRICAS ADS quando o diário está 0', () => {
  const diaria = parseMidiaDiariaRows([
    ['Data', 'Gasto', 'Leads', 'Impressões', 'IniciouForms'],
    ['01/03/2026', '100', '12', '1000', '15'],
  ]);
  assert.equal(diaria[0]!.chegouCadastro, 0); // sem coluna no diário
  const ads = parseMidiaAnuncioRows(
    [
      ['date', 'Ad Name', 'Spend', 'Action Leads', 'Impressions', 'Action Landing Page View', 'Chegou Cadastro'],
      ['2026-03-01', 'AD1', '50', '6', '500', '30', '7'],
      ['2026-03-01', 'AD2', '50', '6', '500', '25', '5'],
    ],
    [],
  );
  mergeAdsIntoDiaria(diaria, ads);
  assert.equal(diaria[0]!.chegouCadastro, 12); // 7 + 5 agregados por dia
});

test('parseVendaRows — mesmo e-mail distante (> janela) fica separado + avisa recompra', () => {
  const header = ['Data', 'Status', 'Nome', 'E-mail', 'Valor'];
  const rows = [
    header,
    ['01/01/2025', 'VENDA REALIZADA', 'Maria', 'maria@x.com', '4297,00'],
    ['01/10/2025', 'VENDA REALIZADA', 'Maria', 'maria@x.com', '4297,00'], // 9 meses depois
  ];
  const warnings: string[] = [];
  const vendas = parseVendaRows(rows, warnings);
  assert.equal(vendas.length, 2); // recompra: NÃO une
  assert.ok(warnings.some((w) => w.includes('mais de 60 dias')));
});
