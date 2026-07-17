import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDateISO, parseMoneyBRL, rendaLowerBoundBRL } from '../src/util/parse.js';
import { normalizeEmail, normalizePhone } from '../src/util/keys.js';
import { classifyByAnswers, normalizeConhece } from '../src/normalize/qualification.js';
import { previousRange, validateRange, RangeError, daysInclusive } from '../src/metrics/period.js';
import { enrichLeads } from '../src/crossjoin/match.js';
import { adCode, publicoSlug } from '../src/crossjoin/attribution.js';
import { mapOrigem, mapTemperatura, type UtmMap } from '../src/normalize/utm.js';
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
