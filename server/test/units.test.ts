import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDateISO, parseMoneyBRL, rendaLowerBoundBRL } from '../src/util/parse.js';
import { normalizeEmail, normalizePhone } from '../src/util/keys.js';
import { classifyByAnswers, normalizeConhece } from '../src/normalize/qualification.js';
import { previousRange, validateRange, RangeError, daysInclusive } from '../src/metrics/period.js';
import { enrichLeads } from '../src/crossjoin/match.js';
import { adCode, publicoSlug } from '../src/crossjoin/attribution.js';
import { columnLetter } from '../src/datasource/sheetsApi.js';
import { readXlsxSheet, parseWorksheetXml } from '../src/util/xlsx.js';
import { parseExportNumber, parseExportDate, nomeCompativel } from '../src/cli/exportCakto.js';
import { mapOrigem, mapPagoOrganico, mapTemperatura, type UtmMap } from '../src/normalize/utm.js';
import {
  parseLeadRows,
  parseLeadComercialRows,
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
const utm = (source: string, medium: string, campaign = '', content = '', term = '') => ({
  source,
  medium,
  campaign,
  content,
  term,
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

test('normalizePhone — casa com/sem 55, formatação E o nono dígito do celular', () => {
  // as 3 grafias do MESMO número têm que virar a MESMA chave (achado real 2026-07-24:
  // AGENDAMENTOS grava sem o 9, LEADS com o 9 → 13 agendamentos ficavam órfãos)
  assert.equal(normalizePhone('+55 (11) 99999-0001'), '1199990001');
  assert.equal(normalizePhone('11999990001'), '1199990001');
  assert.equal(normalizePhone('1199990001'), '1199990001');
  // fixo (10 dígitos sem 9 na 3ª posição) não é tocado
  assert.equal(normalizePhone('1133334444'), '1133334444');
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

test('utm-map real — origem casa com os valores REAIS da aba LEADS', () => {
  assert.equal(mapOrigem(utm('FacebookADS', 'ig-visitou-7d'), utmMap), 'anuncio');
  assert.equal(mapOrigem(utm('BioOrganico', ''), utmMap), 'bio');
});

test('mapTemperatura — pago=quente, orgânico=morno (2026-07-24: term não mede temperatura)', () => {
  assert.equal(mapTemperatura('pago'), 'quente');
  assert.equal(mapTemperatura('organico'), 'morno');
});

test('parseLeadRows — temperatura deriva do pago/orgânico (pago 100% quente, orgânico no mínimo morno)', () => {
  const header = ['Data', 'Nome', 'E-mail', 'CellPhone', 'OCDM_utm_source', 'OCDM_utm_medium', 'OCDM_utm_content', 'OCDM_utm_term', 'ORGANICO OU PAGO?'];
  const rows = [
    header,
    // pago real: FacebookADS + público de remarketing + criativo + term quente
    ['01/07/2026', 'Ana', 'a@x.test', '11999990001', 'FacebookADS', 'caiu-captura-180d_vv-convite-50-30d', 'video-ad02', 'quente', ''],
    // orgânico real: ig + social + link da bio + term frio
    ['01/07/2026', 'Bia', 'b@x.test', '11999990002', 'ig', 'social', 'link_in_bio', 'frio', ''],
  ];
  const leads = parseLeadRows(rows, utmMap, []);
  const ana = leads.find((l) => l.emailKey === 'a@x.test')!;
  const bia = leads.find((l) => l.emailKey === 'b@x.test')!;
  assert.equal(ana.pagoOrganico, 'pago');
  assert.equal(ana.temperatura, 'quente');
  assert.equal(bia.pagoOrganico, 'organico');
  assert.equal(bia.temperatura, 'morno'); // nunca mais 'frio' no chute
});

test('mapOrigem — semântica 2026-07-24: link_in_bio=bio, video-ad=anúncio, ig sozinho=orgânico', () => {
  // content link_in_bio diz DE ONDE o orgânico veio (link da bio)
  assert.equal(mapOrigem(utm('ig', 'social', '', 'link_in_bio'), utmMap), 'bio');
  // content video-adX = criativo do pago, mesmo sem source
  assert.equal(mapOrigem(utm('', '', '', 'video-ad07'), utmMap), 'anuncio');
  // source ig SEM content de bio = Instagram orgânico genérico (não é mais 'anuncio')
  assert.equal(mapOrigem(utm('ig', 'social'), utmMap), 'organico');
});

test('mapPagoOrganico — semântica 2026-07-24: ig/social/link_in_bio/frio = orgânico; FacebookADS/quente/video-ad = pago', () => {
  // coluna explícita do fluxo velho segue vencendo tudo
  assert.equal(mapPagoOrganico(utm('ig', 'social'), 'pago', utmMap), 'pago');
  assert.equal(mapPagoOrganico(utm('FacebookADS', 'x'), 'organico', utmMap), 'organico');
  // source = sinal mais forte: ig é Instagram ORGÂNICO, FacebookADS é pago
  assert.equal(mapPagoOrganico(utm('ig', 'social'), '', utmMap), 'organico');
  assert.equal(mapPagoOrganico(utm('FacebookADS', 'x'), '', utmMap), 'pago');
  assert.equal(mapPagoOrganico(utm('BioOrganico', 'biografia-caio'), '', utmMap), 'organico');
  // coluna com o utm_term cru (fluxo n8n novo): quente → pago, frio → orgânico
  assert.equal(mapPagoOrganico(utm('', ''), 'quente', utmMap), 'pago');
  assert.equal(mapPagoOrganico(utm('', ''), 'frio', utmMap), 'organico');
  // …mas o source contraditório vence o term cru (FacebookADS com 'frio' segue pago)
  assert.equal(mapPagoOrganico(utm('FacebookADS', 'x'), 'frio', utmMap), 'pago');
  // sem source: term no próprio UTM decide (todo pago manda quente)
  assert.equal(mapPagoOrganico(utm('', '', '', '', 'quente'), '', utmMap), 'pago');
  assert.equal(mapPagoOrganico(utm('', '', '', '', 'frio'), '', utmMap), 'organico');
  // content decide quando não há source/term: video-adX = criativo pago, link_in_bio = orgânico
  assert.equal(mapPagoOrganico(utm('', '', '', 'video-ad02'), '', utmMap), 'pago');
  assert.equal(mapPagoOrganico(utm('', '', '', 'link_in_bio'), '', utmMap), 'organico');
  // medium com slug de público (ex. caiu-captura-…) é público do PAGO; 'social' é orgânico
  assert.equal(mapPagoOrganico(utm('', 'caiu-captura-180d_vv-convite-50-30d'), '', utmMap), 'pago');
  assert.equal(mapPagoOrganico(utm('', 'social'), '', utmMap), 'organico');
  // valor desconhecido na coluna (ex.: 'comercial') → fallback pelas regras, não quebra
  assert.equal(mapPagoOrganico(utm('Comercial', 'leo'), 'comercial', utmMap), 'organico');
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

test('enrichLeads — venda casa por TELEFONE quando o e-mail do checkout é outro e o nome não bate', () => {
  // Caso real das vendas "não atribuídas": a Cakto grava o e-mail do checkout (diferente do
  // e-mail do formulário) e o nome COMPLETO, enquanto a aba LEADS guarda só o primeiro nome.
  // Antes da coluna Phone essa venda era irrecuperável; agora casa pelo telefone canônico.
  const f = fixture();
  const lead = f.leads[0]!;
  f.vendas.push({
    id: 'V-PHONE',
    date: '2026-03-08',
    emailKey: 'outro-email-do-checkout@gmail.com',
    phoneKey: lead.phoneKey,
    nameKey: 'nome completo que nao existe na aba leads',
    valorBRL: 4297,
  });
  const r = enrichLeads(f);
  assert.equal(r.report.byPhone, 1);
  assert.equal(r.report.unmatched, 0);
  assert.equal(r.enriched.find((l) => l.id === lead.id)!.temVenda, true);
});

test('parseVendaRows — lê a coluna Phone (canoniza 55/nono dígito) e fica vazia quando a coluna não existe', () => {
  // header real da aba VENDAS depois de 2026-08-03 (coluna I = "Phone")
  const header = ['Data', 'Funil', 'Status', 'Nome', 'E-mail', 'Valor', 'SOMA DE LEADS', 'Mentores', 'Phone'];
  const rows = [
    header,
    // formato que a Cakto manda em `customer.phone`: 55 + DDD + 9 dígitos → chave canônica DDD + 8
    ['31/07/2026', 'Aplicação', 'VENDA REALIZADA', 'Comprador Exemplo', 'r@gmail.com', 'R$ 3.702,90', '1', '', '5574912345678'],
    // formatado à mão na planilha
    ['31/07/2026', 'Aplicação', 'VENDA REALIZADA', 'Outro', 'o@gmail.com', 'R$ 100,00', '1', '', '(11) 99999-0001'],
    // linha antiga, anterior à coluna (célula vazia) → sem telefone, casamento segue por e-mail/nome
    ['01/07/2026', 'Aplicação', 'VENDA REALIZADA', 'Antigo', 'a@gmail.com', 'R$ 100,00', '1', '', ''],
  ];
  const warnings: string[] = [];
  const vendas = parseVendaRows(rows, warnings);
  assert.equal(vendas.find((v) => v.emailKey === 'r@gmail.com')!.phoneKey, '7412345678');
  assert.equal(vendas.find((v) => v.emailKey === 'o@gmail.com')!.phoneKey, '1199990001');
  assert.equal(vendas.find((v) => v.emailKey === 'a@gmail.com')!.phoneKey, '');

  // aba sem a coluna (histórico) → nenhum telefone, e nada quebra
  const semColuna = parseVendaRows(
    [
      ['Data', 'Status', 'Nome', 'E-mail', 'Valor'],
      ['01/07/2026', 'VENDA REALIZADA', 'Antigo', 'a@gmail.com', 'R$ 100,00'],
    ],
    warnings,
  );
  assert.equal(semColuna[0]!.phoneKey, '');
});

test('parseVendaRows — na união de pagamento dividido o telefone sobrevive mesmo se a 1ª parte não tiver', () => {
  // parcela paga antes da coluna Phone existir + parcela paga depois: a venda unida fica com o telefone
  const header = ['Data', 'Status', 'Nome', 'E-mail', 'Valor', 'Phone'];
  const rows = [
    header,
    ['01/07/2026', 'VENDA REALIZADA', 'Leonardo', 'leo@icloud.com', 'R$ 2.179,89', ''],
    ['05/07/2026', 'VENDA REALIZADA', 'Leonardo', 'leo@icloud.com', 'R$ 1.897,71', '5511999990001'],
  ];
  const warnings: string[] = [];
  const vendas = parseVendaRows(rows, warnings);
  assert.equal(vendas.length, 1);
  assert.equal(vendas[0]!.date, '2026-07-01'); // data da 1ª parte, como antes
  assert.equal(Math.round(vendas[0]!.valorBRL * 100), 407760);
  assert.equal(vendas[0]!.phoneKey, '1199990001');
});

test('columnLetter — índice 0-based vira letra A1 (a coluna Phone é a I)', () => {
  // errar isso escreveria o telefone NA COLUNA ERRADA da planilha do cliente
  assert.equal(columnLetter(0), 'A');
  assert.equal(columnLetter(8), 'I'); // Phone, aba VENDAS
  assert.equal(columnLetter(25), 'Z');
  assert.equal(columnLetter(26), 'AA');
  assert.equal(columnLetter(51), 'AZ');
  assert.equal(columnLetter(52), 'BA');
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

test('parseVendaRows — CASO REAL jul/2026: exclusão + união = 15 vendas e R$ 60.418,64 (Gabriela 3×→1, Leonardo 2×→1)', () => {
  const header = ['Data', 'Status', 'Nome', 'E-mail', 'Valor'];
  const rows = [
    header,
    ['01/07/2026', 'VENDA REALIZADA', 'Lucas mota doria', 'comercialswatch@gmail.com', 'R$ 4.294,51'],
    ['01/07/2026', 'VENDA REALIZADA', 'Leonardo Sacco Ribeiro', 'saccoleonardo96@icloud.com', 'R$ 2.179,89'],
    ['01/07/2026', 'VENDA REALIZADA', 'Leonardo Sacco Ribeiro', 'saccoleonardo96@icloud.com', 'R$ 1.897,71'],
    ['02/07/2026', 'VENDA REALIZADA', 'Felipe Gonçalves da Silva', 'felipe.lulu2833@gmail.com', 'R$ 4.080,09'],
    ['03/07/2026', 'VENDA REALIZADA', 'Caio Augusto Roque Rodrigues', 'caio03062004@gmail.com', 'R$ 2.562,78'],
    ['03/07/2026', 'VENDA REALIZADA', 'Luis Fernando de Oliveira Rosa', 'feeoliveira.rosa@gmail.com', 'R$ 697,51'],
    ['07/07/2026', 'VENDA REALIZADA', 'Nathan Luis Aguilar Carlos Pereira', 'nathanluis@gmail.com', 'R$ 4.294,51'],
    ['07/07/2026', 'VENDA REALIZADA', 'Edilson da Silva Braga Junior', 'edilson.silva00@hotmail.com', 'R$ 4.080,09'],
    ['16/07/2026', 'VENDA REALIZADA', 'Davyd Pereira de Lima', 'davydmusico@gmail.com', 'R$ 3.997,51'],
    ['16/07/2026', 'VENDA REALIZADA', 'Lucas Lopes Duarte', 'luca_slopesduarte@hotmail.com', 'R$ 4.294,51'],
    ['17/07/2026', 'VENDA REALIZADA', 'roberto cesar de lima serrano', 'roberto.robertosonic@gmail.com', 'R$ 4.080,09'],
    ['17/07/2026', 'VENDA REALIZADA', 'Jodson Santana Franco', 'jodson.s.franco@gmail.com', 'R$ 4.080,09'],
    ['22/07/2026', 'VENDA REALIZADA', 'Roberta Oliveira Freitas Fong Yin', 'robertaf.yin@gmail.com', 'R$ 4.080,09'],
    ['28/07/2026', 'VENDA REALIZADA', 'Endi Elua Souza Ouvidio', 'endiouvidio@yahoo.com', 'R$ 4.294,51'],
    ['28/07/2026', 'VENDA REALIZADA', 'Gabriela', 'oigabizinha@outlook.com', 'R$ 1.297,51'],
    ['29/07/2026', 'VENDA REALIZADA', 'Gabriela', 'oigabizinha@outlook.com', 'R$ 1.297,51'],
    ['29/07/2026', 'VENDA REALIZADA', 'Gabriela', 'oigabizinha@outlook.com', 'R$ 1.609,83'],
    ['31/07/2026', 'VENDA REALIZADA', 'Samuel Correa De Paula', 'samucacorrea@live.com', 'R$ 4.294,51'],
    ['31/07/2026', 'VENDA REALIZADA', 'Rafael Ferreira Dias', 'rafaeldias05082002@gmail.com', 'R$ 3.702,90'],
  ];
  const warnings: string[] = [];
  const vendas = parseVendaRows(rows, warnings, [
    { data: '2026-07-03', email: 'feeoliveira.rosa@gmail.com', valorBRL: 697.51, motivo: 'não existe no Cakto' },
  ]);
  // 19 linhas − 1 fantasma = 18 transações Cakto → 15 compradores (Gabriela 3→1, Leonardo 2→1)
  assert.equal(vendas.length, 15);
  // faturamento EXATO do export oficial da Cakto (Σ líquido)
  const total = vendas.reduce((s, v) => s + v.valorBRL, 0);
  assert.equal(Math.round(total * 100), 6041864);
  const gabriela = vendas.find((v) => v.emailKey === 'oigabizinha@outlook.com')!;
  assert.equal(Math.round(gabriela.valorBRL * 100), 420485);
  assert.ok(!vendas.some((v) => v.emailKey === 'feeoliveira.rosa@gmail.com'));
});

test('parseVendaRows — exclusão por reconciliação Cakto remove a linha certa e avisa; entrada obsoleta também avisa', () => {
  const header = ['Data', 'Status', 'Nome', 'E-mail', 'Valor'];
  const rows = [
    header,
    ['03/07/2026', 'VENDA REALIZADA', 'Luis Fernando de Oliveira Rosa', 'feeoliveira.rosa@gmail.com', 'R$ 697,51'],
    ['03/07/2026', 'VENDA REALIZADA', 'Caio Augusto', 'caio@gmail.com', 'R$ 2.562,78'],
  ];
  const warnings: string[] = [];
  const vendas = parseVendaRows(rows, warnings, [
    { data: '2026-07-03', email: 'feeoliveira.rosa@gmail.com', valorBRL: 697.51, motivo: 'não existe no Cakto' },
    { data: '2026-01-01', email: 'ninguem@x.com', valorBRL: 1, motivo: 'entrada obsoleta' },
  ]);
  assert.equal(vendas.length, 1);
  assert.equal(vendas[0]!.emailKey, 'caio@gmail.com');
  assert.ok(warnings.some((w) => w.includes('excluída') && w.includes('feeoliveira.rosa@gmail.com')));
  assert.ok(warnings.some((w) => w.includes('não casaram') && w.includes('ninguem@x.com')));
});

test('parseVendaRows — exclusão exige data+e-mail+valor exatos (valor diferente NÃO exclui)', () => {
  const header = ['Data', 'Status', 'Nome', 'E-mail', 'Valor'];
  const rows = [header, ['03/07/2026', 'VENDA REALIZADA', 'Luis', 'feeoliveira.rosa@gmail.com', 'R$ 4.297,00']];
  const warnings: string[] = [];
  const vendas = parseVendaRows(rows, warnings, [
    { data: '2026-07-03', email: 'feeoliveira.rosa@gmail.com', valorBRL: 697.51, motivo: 'x' },
  ]);
  assert.equal(vendas.length, 1); // valor não bate → linha fica
  assert.ok(warnings.some((w) => w.includes('não casaram')));
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

// ── export da Cakto (.xlsx/.csv) — usado pelo backfill da coluna Phone ────────────────────
const fixturePath = (name: string): string =>
  resolve(dirname(fileURLToPath(import.meta.url)), 'fixtures', name);

test('readXlsxSheet — lê um .xlsx REAL (fixture gerada por Excel/openpyxl), com string, número, data e célula vazia', () => {
  const rows = readXlsxSheet(fixturePath('cakto-export.xlsx'));
  assert.equal(rows.length, 4);
  assert.deepEqual(rows[0], [
    'ID da Venda',
    'Status da Venda',
    'Nome do Cliente',
    'Email do Cliente',
    'Telefone do Cliente',
    'Valor Base do Produto',
    'Comissão',
    'Data de Pagamento',
  ]);
  // número continua número (não vira string com vírgula) e a data vem como serial do Excel
  assert.equal(rows[1]?.[5], 4297);
  assert.equal(rows[1]?.[6], 4154.86);
  assert.equal(parseExportDate(rows[1]?.[7] ?? null), '2025-09-15');
  // e-mail vazio vira null SEM comer as colunas seguintes (o bug real do export)
  assert.equal(rows[2]?.[3], null);
  assert.equal(rows[2]?.[4], '5521912345678');
  assert.equal(rows[2]?.[6], 1997.51);
  // entidades XML são desescapadas
  assert.equal(rows[2]?.[2], 'João "Zé" Gomes & Cia');
});

test('parseWorksheetXml — célula vazia self-closing NÃO encerra a linha (bug real do export da Cakto)', () => {
  // `<c r="D2"/>` é célula vazia. Um regex que terminasse a linha no primeiro `/>` perderia
  // E2 e F2 em silêncio — foi exatamente o que aconteceu com o export real.
  const xml =
    '<sheetData>' +
    '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
    '<row r="2"><c r="A2" t="str"><v>x</v></c><c r="D2"/><c r="E2"><v>42</v></c><c r="F2" t="s"><v>1</v></c></row>' +
    '</sheetData>';
  const rows = parseWorksheetXml(xml, ['cabeçalho', 'fim']);
  assert.deepEqual(rows[0], ['cabeçalho', 'fim']);
  assert.deepEqual(rows[1], ['x', null, null, null, 42, 'fim']);
});

test('parseExportNumber — número puro do xlsx, ponto decimal do CSV Cakto e formato BR', () => {
  assert.equal(parseExportNumber(4154.86), 4154.86); // xlsx
  assert.equal(parseExportNumber('4154.86'), 4154.86); // CSV da Cakto
  assert.equal(parseExportNumber('R$ 4.154,86'), 4154.86); // reexportado pela planilha
  assert.equal(parseExportNumber(''), null);
  assert.equal(parseExportNumber(null), null);
  assert.equal(parseExportNumber('lixo'), null);
});

test('parseExportDate — ISO com fuso do CSV, dd/MM/yyyy e serial do Excel caem no mesmo dia', () => {
  assert.equal(parseExportDate('2026-07-31T18:36:07.937797-03:00'), '2026-07-31');
  assert.equal(parseExportDate('31/07/2026'), '2026-07-31');
  assert.equal(parseExportDate(46234), '2026-07-31'); // serial do Excel
  assert.equal(parseExportDate(''), null);
  assert.equal(parseExportDate(null), null);
});

test('nomeCompativel — aba tem só o primeiro nome, export tem o completo (token truncado também casa)', () => {
  assert.equal(nomeCompativel('Maira', 'Maira Pinto Gomes'), true);
  assert.equal(nomeCompativel('Maira Pint', 'Maira Pinto Gomes'), true); // token truncado na aba
  assert.equal(nomeCompativel('MAÍRA', 'maira pinto gomes'), true); // acento/caixa
  assert.equal(nomeCompativel('Maira Souza', 'Maira Pinto Gomes'), false);
  // a direção que NÃO casa: a aba tem MAIS tokens do que o export (todo token da aba
  // precisa achar par no export — é o que segura o falso positivo)
  assert.equal(nomeCompativel('Maira Pinto Gomes', 'Maira'), false);
  assert.equal(nomeCompativel('', 'Maira'), false);
});

// ─────────────────────────────── Seção Comercial (2026-08-07) ───────────────────────────────

test('parseVendaRows — lê as colunas de UTM do checkout e fica vazio quando não existem', () => {
  // header real da aba VENDAS depois do comercial:init --vendas-cols (J/K/L no fim)
  const header = ['Data', 'Funil', 'Status', 'Nome', 'E-mail', 'Valor', 'SOMA DE LEADS', 'Mentores', 'Phone', 'Utm Source', 'Utm Medium', 'SCK'];
  const rows = [
    header,
    // caso REAL: venda do Samuel pelo link do leo (export Cakto 31/07/2026)
    ['31/07/2026', 'Aplicação', 'VENDA REALIZADA', 'Samuel Correa De Paula', 's@live.com', 'R$ 4.294,51', '1', '', '5511999990002', 'Comercial', 'leo', 'OCDM_Comercial_leo_comercial-leo_comercial'],
    ['01/07/2026', 'Aplicação', 'VENDA REALIZADA', 'Antigo', 'a@gmail.com', 'R$ 100,00', '1', '', '', '', '', ''],
  ];
  const warnings: string[] = [];
  const vendas = parseVendaRows(rows, warnings);
  const samuel = vendas.find((v) => v.emailKey === 's@live.com')!;
  assert.equal(samuel.utmSource, 'Comercial');
  assert.equal(samuel.utmMedium, 'leo');
  assert.equal(samuel.sck, 'OCDM_Comercial_leo_comercial-leo_comercial');
  const antigo = vendas.find((v) => v.emailKey === 'a@gmail.com')!;
  assert.equal(antigo.utmMedium, '');

  // aba sem as colunas (histórico) → utm vazia, nada quebra
  const semColuna = parseVendaRows(
    [
      ['Data', 'Status', 'Nome', 'E-mail', 'Valor'],
      ['01/07/2026', 'VENDA REALIZADA', 'Antigo', 'a@gmail.com', 'R$ 100,00'],
    ],
    warnings,
  );
  assert.equal(semColuna[0]!.utmSource, '');
  assert.equal(semColuna[0]!.utmMedium, '');
});

test('parseVendaRows — na união de pagamento dividido a UTM sobrevive (e viaja como trio, sem misturar partes)', () => {
  const header = ['Data', 'Status', 'Nome', 'E-mail', 'Valor', 'Utm Source', 'Utm Medium', 'SCK'];
  const rows = [
    header,
    // 1ª parte anterior às colunas de UTM (células vazias), 2ª parte com o link do leo
    ['01/07/2026', 'VENDA REALIZADA', 'Cliente', 'c@x.com', 'R$ 2.000,00', '', '', ''],
    ['03/07/2026', 'VENDA REALIZADA', 'Cliente', 'c@x.com', 'R$ 2.297,00', 'Comercial', 'leo', 'OCDM_Comercial_leo_comercial-leo_comercial'],
  ];
  const warnings: string[] = [];
  const vendas = parseVendaRows(rows, warnings);
  assert.equal(vendas.length, 1);
  assert.equal(vendas[0]!.utmMedium, 'leo');
  assert.equal(vendas[0]!.utmSource, 'Comercial');
  assert.equal(Math.round(vendas[0]!.valorBRL * 100), 429700);
});

test('parseLeadComercialRows — aliases de coluna, dedup por contato e avisos de data/vendedor', () => {
  const rows = [
    ['Data', 'Vendedor', 'Nome', 'E-mail', 'Telefone'],
    ['01/08/2026', 'Leo', 'Fulano da Silva', 'f@x.com', '5511999990001'],
    // mesmo contato colado 2× na lista do leo → conta 1 (fica a data mais antiga)
    ['05/08/2026', 'leo', 'Fulano da Silva', 'f@x.com', ''],
    // sem data → aceito, com aviso
    ['', 'gabriel', 'Beltrana Souza', 'b@x.com', ''],
    // sem vendedor → aceito, com aviso (não conta pra ninguém)
    ['02/08/2026', '', 'Ciclano', 'c@x.com', ''],
    // sem nenhuma chave → quarentena
    ['02/08/2026', 'leo', '', '', ''],
  ];
  const warnings: string[] = [];
  const lista = parseLeadComercialRows(rows, warnings);
  assert.equal(lista.length, 3);
  const fulano = lista.find((l) => l.emailKey === 'f@x.com')!;
  assert.equal(fulano.vendedor, 'leo'); // caixa normalizada
  assert.equal(fulano.date, '2026-08-01'); // data mais antiga vence no dedup
  assert.equal(fulano.phoneKey, '1199990001'); // canonizada (sem 55, sem nono dígito)
  assert.equal(lista.find((l) => l.emailKey === 'b@x.com')!.date, '');
  assert.ok(warnings.some((w) => w.includes('sem Data')));
  assert.ok(warnings.some((w) => w.includes('sem Vendedor')));
  assert.ok(warnings.some((w) => w.includes('sem nome/e-mail/telefone')));
});
