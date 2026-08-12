import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  actionValue,
  buildMetaMedia,
  classifyFunil,
  normalizeAdsetName,
  toFacts,
  type MetaFact,
} from '../src/normalize/metaRows.js';
import { MetaStore } from '../src/datasource/metaStore.js';
import { MetaAdsClient, type MetaInsightRow } from '../src/datasource/metaApi.js';
import { MetaSource } from '../src/datasource/MetaSource.js';
import type { DataSource } from '../src/datasource/DataSource.js';
import type { DataSnapshot } from '../src/domain/entities.js';
import { publicoSlug } from '../src/crossjoin/attribution.js';

/** Nomes REAIS da conta act_1695002784410550 (conferidos na API em 2026-08-06). */
const CAMP_OCDM = '[13/04/26] [OCDM] [Q] [AUTO] [CAPTAÇÃO] [IG - VISITOU 7D] [NOVOS ADS]';
const CAMP_C2 = '[23/04/26] [DISTRIBUIÇÃO] [C2] [AUTO] [Q] [IG ENVOLVIMENTO 30D]';
const CAMP_OUTRO = '[10/09/25] [F] [AUTO] [DISTRIBUIÇÃO] [RECONHECIMENTO] [VIDEO VIEW] [ADV+]';

test('classifyFunil — tag da campanha decide o funil', () => {
  assert.equal(classifyFunil(CAMP_OCDM), 'ocdm');
  assert.equal(classifyFunil(CAMP_C2), 'c2');
  assert.equal(classifyFunil(CAMP_OUTRO), 'outro');
  assert.equal(classifyFunil(''), 'outro'); // sem tag NUNCA vira ocdm no chute
});

test('normalizeAdsetName — tira o sufixo de rodízio de criativos e casa com a aba', () => {
  assert.equal(
    normalizeAdsetName('00 - IG Visitou 7D - AD54 - AD56 | AD58 - AD60'),
    '00 - IG Visitou 7D',
  );
  assert.equal(normalizeAdsetName('00 - IG Visitou 7D - AD38 - AD45'), '00 - IG Visitou 7D');
  assert.equal(normalizeAdsetName('00 - IG Visitou 7D'), '00 - IG Visitou 7D');
  // nomes que a aba TOP PÚBLICOS tem e não podem ser mutilados
  assert.equal(
    normalizeAdsetName('00 - Caiu Captura 180D + VV Convite 50% 30D'),
    '00 - Caiu Captura 180D + VV Convite 50% 30D',
  );
  assert.equal(
    normalizeAdsetName('00 - IG Envolvimento 180D Excl. Env 30D'),
    '00 - IG Envolvimento 180D Excl. Env 30D',
  );
  // o ponto de todo o exercício: o slug tem que bater com o utm_medium do lead
  assert.equal(
    publicoSlug(normalizeAdsetName('00 - IG Visitou 7D - AD38 - AD45')),
    'ig-visitou-7d',
  );
});

test('actionValue / toFacts — extrai as ações certas da resposta crua', () => {
  const row: MetaInsightRow = {
    date_start: '2026-06-22',
    campaign_name: CAMP_OCDM,
    adset_name: '00 - IG Visitou 7D - AD38 - AD45',
    ad_name: 'AD43 [OCDM] [VID] CAPTAÇÃO - QUAL É A MELHOR FORMA V3',
    spend: '80.75',
    impressions: '2953',
    inline_link_clicks: '43',
    actions: [
      { action_type: 'landing_page_view', value: '43' },
      { action_type: 'video_view', value: '993' },
      { action_type: 'lead', value: '8' },
      { action_type: 'offsite_conversion.fb_pixel_lead', value: '8' },
      { action_type: 'post_engagement', value: '120' },
    ],
  };
  assert.equal(actionValue(row.actions, 'landing_page_view'), 43);
  assert.equal(actionValue(row.actions, 'inexistente'), 0);
  assert.equal(actionValue(undefined, 'lead'), 0);

  const [f] = toFacts([row]);
  assert.ok(f);
  assert.equal(f.investimentoBRL, 80.75);
  assert.equal(f.impressoes, 2953);
  assert.equal(f.cliques, 43);
  assert.equal(f.lpViews, 43);
  assert.equal(f.vslPlays, 993);
  assert.equal(f.leads, 8); // 'lead' e pixel são o MESMO 8 — não podem somar 16
});

test('toFacts — sem "lead" agregado, cai no pixel', () => {
  const [f] = toFacts([
    {
      date_start: '2026-07-01',
      campaign_name: CAMP_OCDM,
      spend: '10',
      actions: [{ action_type: 'offsite_conversion.fb_pixel_lead', value: '3' }],
    },
  ]);
  assert.equal(f?.leads, 3);
});

const fact = (p: Partial<MetaFact>): MetaFact => ({
  date: '2026-07-01',
  campaign: CAMP_OCDM,
  adset: '00 - IG Visitou 7D',
  ad: 'AD02 [OCDM] [VID] CAPTAÇÃO',
  investimentoBRL: 0,
  impressoes: 0,
  cliques: 0,
  lpViews: 0,
  vslPlays: 0,
  leads: 0,
  ...p,
});

test('buildMetaMedia — C2 e campanha sem tag ficam de fora, e o gasto delas é reportado', () => {
  const ads = [
    fact({
      investimentoBRL: 23.8,
      impressoes: 1000,
      cliques: 10,
      lpViews: 5,
      vslPlays: 100,
      leads: 2,
    }),
    fact({
      campaign: CAMP_C2,
      ad: 'AD02 [C2] [VID] QUALIFICAÇÃO',
      investimentoBRL: 21.13,
      leads: 4,
    }),
    fact({ campaign: CAMP_OUTRO, ad: 'AD99 [ADV+]', investimentoBRL: 5 }),
  ];
  const r = buildMetaMedia(ads, [], 'ocdm');
  assert.equal(r.anuncios.length, 1, 'só o anúncio OCDM entra');
  assert.equal(r.anuncios[0]?.anuncio, 'AD02 [OCDM] [VID] CAPTAÇÃO');
  assert.equal(r.anuncios[0]?.mqls, 0, 'MQL nunca vem da Meta');
  assert.equal(r.split.gastoPorFunil.ocdm, 23.8);
  assert.equal(r.split.gastoPorFunil.c2, 21.13);
  assert.equal(r.split.gastoPorFunil.outro, 5);
  assert.deepEqual(r.split.campanhasOutro, [CAMP_OUTRO]);
  assert.equal(r.diaria.get('2026-07-01')?.investimentoBRL, 23.8, 'diária só conta OCDM');
});

test('buildMetaMedia — mesmo anúncio em 2 conjuntos soma numa linha só; público normaliza', () => {
  const ads = [
    fact({
      adset: '00 - IG Visitou 7D - AD38 - AD45',
      investimentoBRL: 10,
      impressoes: 100,
      leads: 1,
    }),
    fact({
      adset: '00 - IG Visitou 7D - AD46 - AD53',
      investimentoBRL: 5.5,
      impressoes: 50,
      leads: 2,
    }),
  ];
  const adsets = [
    fact({ adset: '00 - IG Visitou 7D - AD38 - AD45', ad: '', investimentoBRL: 10, leads: 1 }),
    fact({ adset: '00 - IG Visitou 7D - AD46 - AD53', ad: '', investimentoBRL: 5.5, leads: 2 }),
  ];
  const r = buildMetaMedia(ads, adsets, 'ocdm');
  assert.equal(r.anuncios.length, 1);
  assert.equal(r.anuncios[0]?.investimentoBRL, 15.5);
  assert.equal(r.anuncios[0]?.leads, 3);
  assert.equal(r.publicos.length, 1, 'os dois conjuntos são o MESMO público após a poda');
  assert.equal(r.publicos[0]?.publico, '00 - IG Visitou 7D');
  assert.equal(r.publicos[0]?.investimentoBRL, 15.5);
});

test('MetaStore — replaceWindow substitui a janela e preserva o resto', () => {
  const dir = mkdtempSync(join(tmpdir(), 'mda-meta-'));
  const path = join(dir, 'meta-insights.json');
  const store = new MetaStore(path, 'act_1');
  assert.equal(store.isEmpty(), true);

  store.replaceWindow('ad', '2026-06-01', '2026-06-30', [
    fact({ date: '2026-06-10', investimentoBRL: 100 }),
    fact({ date: '2026-06-20', investimentoBRL: 200 }),
  ]);
  store.save();

  // segundo sync: só a janela de julho é repuxada — junho tem que sobreviver
  const reopened = new MetaStore(path, 'act_1');
  assert.equal(reopened.facts('ad').length, 2);
  reopened.replaceWindow('ad', '2026-07-01', '2026-07-31', [
    fact({ date: '2026-07-05', investimentoBRL: 50 }),
  ]);
  assert.equal(reopened.facts('ad').length, 3);

  // repuxar a MESMA janela com valor revisado substitui, não duplica
  reopened.replaceWindow('ad', '2026-07-01', '2026-07-31', [
    fact({ date: '2026-07-05', investimentoBRL: 55 }),
  ]);
  const julho = reopened.facts('ad').filter((f) => f.date.startsWith('2026-07'));
  assert.equal(julho.length, 1);
  assert.equal(julho[0]?.investimentoBRL, 55);
  assert.deepEqual(reopened.coverage(), { since: '2026-06-10', until: '2026-07-05' });

  // cache de OUTRA conta é descartado (nunca misturar contas)
  reopened.save();
  assert.equal(new MetaStore(path, 'act_OUTRA').isEmpty(), true);
});

/** fetch falso: devolve as respostas na ordem, registrando as URLs pedidas. */
function fakeFetch(responses: Array<Record<string, unknown>>, urls: string[] = []): typeof fetch {
  let i = 0;
  return (async (url: string | URL) => {
    urls.push(String(url));
    const body = responses[Math.min(i++, responses.length - 1)];
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
}

test('MetaAdsClient — erro 190 vira instrução de trocar o token', async () => {
  const client = new MetaAdsClient({
    token: 't',
    accountId: '123',
    fetchImpl: fakeFetch([{ error: { code: 190, message: 'Session has expired' } }]),
    sleepImpl: async () => {},
  });
  await assert.rejects(
    () =>
      client.insightsDaily({
        level: 'ad',
        since: '2026-01-01',
        until: '2026-01-02',
        fields: ['spend'],
      }),
    /190.*EXPIRADO/s,
  );
});

test('MetaAdsClient — throttling (17) é retentado e depois passa', async () => {
  const urls: string[] = [];
  const client = new MetaAdsClient({
    token: 't',
    accountId: 'act_123',
    fetchImpl: fakeFetch(
      [
        { error: { code: 17, message: 'User request limit reached' } },
        { data: [{ date_start: '2026-01-01', spend: '1' }] },
      ],
      urls,
    ),
    sleepImpl: async () => {},
  });
  const rows = await client.insightsDaily({
    level: 'ad',
    since: '2026-01-01',
    until: '2026-01-01',
    fields: ['spend'],
  });
  assert.equal(rows.length, 1);
  assert.equal(urls.length, 2, 'uma retentativa');
  assert.match(urls[0] ?? '', /act_123\/insights/);
  assert.match(urls[0] ?? '', /time_increment=1/);
});

test('MetaAdsClient — janela grande é fatiada em blocos de chunkDays', async () => {
  const urls: string[] = [];
  const client = new MetaAdsClient({
    token: 't',
    accountId: '123',
    chunkDays: 30,
    fetchImpl: fakeFetch([{ data: [] }], urls),
    sleepImpl: async () => {},
  });
  await client.insightsDaily({
    level: 'ad',
    since: '2026-01-01',
    until: '2026-03-31',
    fields: ['spend'],
  });
  assert.equal(urls.length, 3, '90 dias em blocos de 30 = 3 requisições');
  const janelas = urls.map((u) =>
    decodeURIComponent(u)
      .match(/"since":"([\d-]+)","until":"([\d-]+)"/)
      ?.slice(1),
  );
  assert.deepEqual(janelas, [
    ['2026-01-01', '2026-01-30'],
    ['2026-01-31', '2026-03-01'],
    ['2026-03-02', '2026-03-31'],
  ]);
});

test('MetaAdsClient — "reduce the amount of data" parte a janela ao meio (não é retentado)', async () => {
  const urls: string[] = [];
  let chamadas = 0;
  const client = new MetaAdsClient({
    token: 't',
    accountId: '123',
    chunkDays: 400,
    sleepImpl: async () => {},
    fetchImpl: (async (url: string | URL) => {
      urls.push(String(url));
      chamadas++;
      // a janela inteira falha; as metades passam
      const isPrimeira = chamadas === 1;
      const body = isPrimeira
        ? {
            error: {
              code: 1,
              message: "Please reduce the amount of data you're asking for, then retry",
            },
          }
        : { data: [{ date_start: '2026-01-01', spend: '1' }] };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch,
  });
  const rows = await client.insightsDaily({
    level: 'ad',
    since: '2026-01-01',
    until: '2026-01-10',
    fields: ['spend'],
  });
  assert.equal(urls.length, 3, 'janela cheia + 2 metades — sem retentativa cega');
  assert.equal(rows.length, 2, 'as duas metades voltaram');
});

test('MetaAdsClient — segue a paginação até o fim', async () => {
  const urls: string[] = [];
  const client = new MetaAdsClient({
    token: 't',
    accountId: '123',
    fetchImpl: fakeFetch(
      [
        {
          data: [{ date_start: '2026-01-01', spend: '1' }],
          paging: { next: 'https://graph.facebook.com/next' },
        },
        { data: [{ date_start: '2026-01-02', spend: '2' }] },
      ],
      urls,
    ),
    sleepImpl: async () => {},
  });
  const rows = await client.insightsDaily({
    level: 'ad',
    since: '2026-01-01',
    until: '2026-01-02',
    fields: ['spend'],
  });
  assert.equal(rows.length, 2);
  assert.equal(urls[1], 'https://graph.facebook.com/next');
});

// ─────────────────────────── MetaSource (merge com a planilha) ───────────────────────────

function baseSnapshot(): DataSnapshot {
  return {
    leads: [],
    agendamentos: [],
    vendas: [],
    leadsComercial: [],
    midiaDiaria: [
      // dia que a aba cobre e as MÉTRICAS ADS também
      {
        date: '2026-06-23',
        investimentoBRL: 358.71, // total da CONTA (inclui C2)
        impressoes: 15234,
        alcance: 9000,
        cliques: 304,
        cliquesBotaoLP: 0,
        vslPlays: 0,
        chegouCadastro: 0,
        formsIniciados: 0,
        formsFinalizados: 36,
      },
      // dia órfão: a aba de mídia tem, mas MÉTRICAS ADS parou
      {
        date: '2026-07-01',
        investimentoBRL: 44.93,
        impressoes: 2000,
        alcance: 1500,
        cliques: 20,
        cliquesBotaoLP: 0,
        vslPlays: 0,
        chegouCadastro: 0,
        formsIniciados: 0,
        formsFinalizados: 4,
      },
    ],
    midiaPublico: [
      {
        date: '2026-06-23',
        publico: '00 - IG Visitou 7D',
        investimentoBRL: 300,
        impressoes: 1,
        cliques: 1,
        leads: 1,
      },
    ],
    midiaAnuncio: [
      {
        date: '2026-06-23',
        anuncio: 'AD43 [OCDM] [VID] CAPTAÇÃO',
        investimentoBRL: 300,
        impressoes: 1,
        cliques: 1,
        lpViews: 7,
        vslPlays: 70,
        chegouCadastro: 0,
        leads: 0,
        mqls: 0,
      },
    ],
    warnings: [],
  };
}

class FakeBase implements DataSource {
  readonly name = 'sheet (fake)';
  async fetchAll(): Promise<DataSnapshot> {
    return baseSnapshot();
  }
}

/** Client falso: responde /insights conforme o level pedido e o nó da conta com BRL/SP. */
function fakeClient(adRows: MetaInsightRow[], adsetRows: MetaInsightRow[]): MetaAdsClient {
  return new MetaAdsClient({
    token: 't',
    accountId: '1695002784410550',
    sleepImpl: async () => {},
    fetchImpl: (async (url: string | URL) => {
      const u = String(url);
      const body = u.includes('/insights')
        ? { data: u.includes('level=adset') ? adsetRows : adRows }
        : {
            name: 'EPN MENTORIA',
            currency: 'BRL',
            timezone_name: 'America/Sao_Paulo',
            account_status: 1,
          };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch,
  });
}

const metaRow = (p: Partial<MetaInsightRow>): MetaInsightRow => ({
  date_start: '2026-07-01',
  campaign_name: CAMP_OCDM,
  adset_name: '00 - IG Visitou 7D - AD38 - AD45',
  ad_name: 'AD02 [OCDM] [VID] CAPTAÇÃO',
  spend: '0',
  impressions: '0',
  inline_link_clicks: '0',
  actions: [],
  ...p,
});

function makeSource(
  adRows: MetaInsightRow[],
  adsetRows: MetaInsightRow[],
  applySpend = true,
): MetaSource {
  const dir = mkdtempSync(join(tmpdir(), 'mda-metasrc-'));
  return new MetaSource({
    base: new FakeBase(),
    token: 't',
    accountId: '1695002784410550',
    since: '2026-06-01',
    refreshDays: 35,
    funil: 'ocdm',
    applySpend,
    storePath: join(dir, 'meta-insights.json'),
    client: fakeClient(adRows, adsetRows),
    today: () => new Date('2026-07-02T12:00:00Z'),
  });
}

test('MetaSource — a aba VENCE no dia em que ela tem anúncio; a Meta só preenche o buraco', async () => {
  const src = makeSource(
    [
      // dia que a aba JÁ tem (23/06) — a Meta não pode sobrescrever
      metaRow({ date_start: '2026-06-23', spend: '999', impressions: '999' }),
      // dia órfão (01/07) — é o que a Meta existe para preencher
      metaRow({
        date_start: '2026-07-01',
        spend: '23.80',
        impressions: '1000',
        inline_link_clicks: '10',
        actions: [
          { action_type: 'landing_page_view', value: '5' },
          { action_type: 'video_view', value: '100' },
          { action_type: 'lead', value: '2' },
        ],
      }),
      // C2 no mesmo dia: entra no gasto da conta, mas não no funil
      metaRow({
        date_start: '2026-07-01',
        campaign_name: CAMP_C2,
        ad_name: 'AD02 [C2]',
        spend: '21.13',
      }),
    ],
    [
      metaRow({
        date_start: '2026-07-01',
        ad_name: '',
        spend: '23.80',
        actions: [{ action_type: 'lead', value: '2' }],
      }),
    ],
  );

  const snap = await src.fetchAll();

  const jun = snap.midiaAnuncio.filter((a) => a.date === '2026-06-23');
  assert.equal(jun.length, 1);
  assert.equal(jun[0]?.investimentoBRL, 300, 'linha da aba intacta');

  const jul = snap.midiaAnuncio.filter((a) => a.date === '2026-07-01');
  assert.equal(jul.length, 1, 'só o anúncio OCDM entrou');
  assert.equal(jul[0]?.investimentoBRL, 23.8);
  assert.equal(jul[0]?.leads, 2);

  const pubJul = snap.midiaPublico.filter((p) => p.date === '2026-07-01');
  assert.equal(pubJul[0]?.publico, '00 - IG Visitou 7D', 'sufixo de rodízio podado');

  // LP view e 3s video do dia órfão passam a existir (etapa do funil de marketing volta)
  const d0701 = snap.midiaDiaria.find((d) => d.date === '2026-07-01');
  assert.equal(d0701?.cliquesBotaoLP, 5);
  assert.equal(d0701?.vslPlays, 100);
  // e o gasto do dia vira SÓ OCDM (era 44,93 = 23,80 OCDM + 21,13 C2)
  assert.equal(d0701?.investimentoBRL, 23.8);
  assert.equal(d0701?.impressoes, 1000);

  // dia coberto pela aba de mídia mas SEM linha na Meta mantém o que a aba trazia
  const d0623 = snap.midiaDiaria.find((d) => d.date === '2026-06-23');
  assert.equal(d0623?.cliquesBotaoLP, 7, 'LP view vem da linha da ABA');

  assert.ok(
    snap.warnings.some((w) => w.includes('investimento diário recalculado')),
    'a troca do gasto tem que ser declarada em warning',
  );
});

test('MetaSource — META_APPLY_SPEND=false preserva o gasto da aba', async () => {
  const src = makeSource(
    [metaRow({ date_start: '2026-07-01', spend: '23.80' })],
    [metaRow({ date_start: '2026-07-01', ad_name: '', spend: '23.80' })],
    false,
  );
  const snap = await src.fetchAll();
  assert.equal(snap.midiaDiaria.find((d) => d.date === '2026-07-01')?.investimentoBRL, 44.93);
});

test('MetaSource — Meta fora do ar NÃO derruba o sync: planilha inteira + aviso', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'mda-metafail-'));
  const src = new MetaSource({
    base: new FakeBase(),
    token: 't',
    accountId: '1695002784410550',
    since: '2026-06-01',
    refreshDays: 35,
    funil: 'ocdm',
    applySpend: true,
    storePath: join(dir, 'meta-insights.json'),
    client: new MetaAdsClient({
      token: 't',
      accountId: '1',
      sleepImpl: async () => {},
      fetchImpl: (async () =>
        new Response(JSON.stringify({ error: { code: 190, message: 'expired' } }), {
          status: 400,
        })) as unknown as typeof fetch,
    }),
  });
  const snap = await src.fetchAll();
  assert.equal(snap.midiaAnuncio.length, 1, 'o que a planilha tinha continua lá');
  assert.equal(snap.midiaDiaria.length, 2);
  assert.ok(snap.warnings.some((w) => w.startsWith('META: falha ao ler')));
});
