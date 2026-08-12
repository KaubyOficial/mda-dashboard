import type { DataSource } from './DataSource.js';
import type { DataSnapshot, MidiaAnuncio, MidiaPublico } from '../domain/entities.js';
import { mergeAdsIntoDiaria } from '../normalize/leadRows.js';
import {
  buildMetaMedia,
  toFacts,
  type Funil,
  type MetaMediaResult,
} from '../normalize/metaRows.js';
import { AD_FIELDS, ADSET_FIELDS, MetaAdsClient } from './metaApi.js';
import { MetaStore } from './metaStore.js';

/**
 * Fonte COMPOSTA: planilha (leads/agendamentos/vendas/acompanhamento) + Meta Marketing API
 * (anúncios/públicos/gasto do funil).
 *
 * Regras de precedência — decididas com o Kauê em 2026-08-06:
 *
 *  a) ANÚNCIOS e PÚBLICOS: **a aba vence no dia em que ela TEM dado**. As abas MÉTRICAS ADS
 *     e TOP PÚBLICOS pararam em 2026-06-23; a Meta preenche de 24/06 em diante sem tocar no
 *     histórico que já estava reconciliado.
 *
 *  b) INVESTIMENTO DIÁRIO: a Meta VENCE, com o gasto só do funil OCDM. Motivo medido: a
 *     coluna Gasto da ACOMPANHAMENTO é o total da CONTA (OCDM + C2 + campanhas antigas de
 *     distribuição) — bate à vírgula com a API em 35 de 36 dias de 01/07–05/08 — enquanto o
 *     dashboard só conta leads/vendas do OCDM. Impressões e cliques vêm junto, senão CPM e
 *     CPC ficariam com denominador de um funil e numerador de outro.
 *     `alcance` continua vindo da aba: reach é deduplicado, não é somável por anúncio.
 *
 *  c) LP views / 3s video: sempre da Meta via mergeAdsIntoDiaria (a aba nunca teve).
 *
 * Nada aqui escreve na planilha — a service account segue read-only.
 */
export interface MetaSourceOptions {
  base: DataSource;
  token: string;
  accountId: string;
  apiVersion?: string;
  /** primeiro dia do backfill quando o cache está vazio */
  since: string;
  /** janela repuxada a cada sync (a Meta revisa atribuição por ~28 dias) */
  refreshDays: number;
  /** dias por requisição — o backfill inteiro não cabe num pedido só */
  chunkDays?: number;
  /** funil mantido — 'ocdm' por decisão de escopo da V1 */
  funil: Funil;
  /** se false, o gasto diário continua vindo da aba (total da conta) */
  applySpend: boolean;
  storePath: string;
  /** injetável nos testes */
  client?: MetaAdsClient;
  today?: () => Date;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);

function daysAgo(base: Date, n: number): string {
  const d = new Date(base);
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
}

const brl = (n: number): string =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export class MetaSource implements DataSource {
  readonly name: string;
  private readonly client: MetaAdsClient;

  constructor(private readonly opts: MetaSourceOptions) {
    this.client =
      opts.client ??
      new MetaAdsClient({
        token: opts.token,
        accountId: opts.accountId,
        apiVersion: opts.apiVersion,
        chunkDays: opts.chunkDays,
      });
    this.name = `${opts.base.name} + meta`;
  }

  /** Repuxa a janela recente (ou o histórico todo, se o cache estiver vazio) e devolve o cache. */
  private async refreshStore(warnings: string[]): Promise<MetaMediaResult> {
    const store = new MetaStore(this.opts.storePath, this.client.accountId);
    const now = this.opts.today ? this.opts.today() : new Date();
    const until = iso(now);
    const backfill = store.isEmpty();
    const since = backfill ? this.opts.since : daysAgo(now, this.opts.refreshDays);

    if (backfill) {
      warnings.push(
        `META: cache vazio — backfill completo de ${since} até ${until} (acontece uma vez; depois só a janela de ${this.opts.refreshDays} dias).`,
      );
    }

    // Sequencial de propósito: no backfill isso são ~8 blocos por nível, e dois fluxos
    // concorrentes contra a mesma conta é o caminho mais curto para o throttling.
    const adRows = await this.client.insightsDaily({
      level: 'ad',
      since,
      until,
      fields: AD_FIELDS,
    });
    const adsetRows = await this.client.insightsDaily({
      level: 'adset',
      since,
      until,
      fields: ADSET_FIELDS,
    });

    store.replaceWindow('ad', since, until, toFacts(adRows));
    store.replaceWindow('adset', since, until, toFacts(adsetRows));
    store.save();

    return buildMetaMedia(store.facts('ad'), store.facts('adset'), this.opts.funil);
  }

  /** Confere moeda e fuso: número certo em moeda errada é o pior tipo de erro silencioso. */
  private async checkAccount(warnings: string[]): Promise<void> {
    const acc = await this.client.getAccount();
    if (acc.currency && acc.currency !== 'BRL') {
      warnings.push(
        `META: a conta ${acc.name} está em ${acc.currency}, não BRL — o investimento vindo da API NÃO é comparável com a planilha. Revise antes de usar os números.`,
      );
    }
    if (acc.timezoneName && acc.timezoneName !== 'America/Sao_Paulo') {
      warnings.push(
        `META: fuso da conta é ${acc.timezoneName} (esperado America/Sao_Paulo) — o corte de dia da API não bate com o da planilha.`,
      );
    }
  }

  async fetchAll(): Promise<DataSnapshot> {
    const snap = await this.opts.base.fetchAll();
    const warnings = snap.warnings;

    let media: MetaMediaResult;
    try {
      await this.checkAccount(warnings);
      media = await this.refreshStore(warnings);
    } catch (e) {
      // Meta fora do ar não pode derrubar o dashboard inteiro: a planilha já veio.
      warnings.push(
        `META: falha ao ler a Marketing API — anúncios/públicos ficam só com o que a planilha tem. Motivo: ${
          e instanceof Error ? e.message : String(e)
        }`,
      );
      return snap;
    }

    // ── (a) anúncios e públicos: a aba vence nos dias em que ela tem dado ──────────────
    const diasComAba = new Set(snap.midiaAnuncio.map((a) => a.date));
    const anunciosNovos = media.anuncios.filter((a) => !diasComAba.has(a.date));
    const midiaAnuncio: MidiaAnuncio[] = [...snap.midiaAnuncio, ...anunciosNovos];

    const diasComAbaPub = new Set(snap.midiaPublico.map((p) => p.date));
    const publicosNovos = media.publicos.filter((p) => !diasComAbaPub.has(p.date));
    const midiaPublico: MidiaPublico[] = [...snap.midiaPublico, ...publicosNovos];

    if (anunciosNovos.length > 0 || publicosNovos.length > 0) {
      const dias = new Set(anunciosNovos.map((a) => a.date));
      warnings.push(
        `META: ${anunciosNovos.length} linha(s) de anúncio e ${publicosNovos.length} de público vieram da Marketing API, cobrindo ${dias.size} dia(s) que as abas MÉTRICAS ADS / TOP PÚBLICOS não têm.`,
      );
    }

    // ── (b) investimento/impressões/cliques do dia: só o funil incluído ────────────────
    if (this.opts.applySpend && media.diaria.size > 0) {
      let trocados = 0;
      let deltaGasto = 0;
      for (const d of snap.midiaDiaria) {
        const m = media.diaria.get(d.date);
        if (!m) continue;
        deltaGasto += m.investimentoBRL - d.investimentoBRL;
        d.investimentoBRL = m.investimentoBRL;
        d.impressoes = m.impressoes;
        d.cliques = m.cliques;
        trocados++;
      }
      // dias que a Meta tem e a aba não (ex.: hoje, antes de alguém preencher a planilha)
      const diasDaAba = new Set(snap.midiaDiaria.map((d) => d.date));
      for (const [date, m] of media.diaria) {
        if (diasDaAba.has(date)) continue;
        snap.midiaDiaria.push({
          date,
          investimentoBRL: m.investimentoBRL,
          impressoes: m.impressoes,
          alcance: 0, // reach não é somável por anúncio — fica 0 em vez de inventar
          cliques: m.cliques,
          cliquesBotaoLP: 0,
          vslPlays: 0,
          chegouCadastro: 0,
          formsIniciados: 0,
          formsFinalizados: 0,
        });
        deltaGasto += m.investimentoBRL;
        trocados++;
      }
      const fora = media.split.gastoPorFunil.c2 + media.split.gastoPorFunil.outro;
      warnings.push(
        `META: investimento diário recalculado só com o funil ${this.opts.funil.toUpperCase()} em ${trocados} dia(s) (${brl(deltaGasto)} vs. o total da conta que a aba trazia). Ficaram DE FORA ${brl(fora)}: C2 ${brl(media.split.gastoPorFunil.c2)} + outras campanhas ${brl(media.split.gastoPorFunil.outro)}.`,
      );
      if (media.split.campanhasOutro.length > 0) {
        warnings.push(
          `META: campanhas sem tag [OCDM]/[C2] (não entram em nenhum funil): ${media.split.campanhasOutro.join(' | ')}.`,
        );
      }
    }

    // ── (c) LP view / 3s video por dia, agora com a série completa de anúncios ─────────
    mergeAdsIntoDiaria(snap.midiaDiaria, midiaAnuncio);
    snap.midiaDiaria.sort((a, b) => a.date.localeCompare(b.date));

    return { ...snap, midiaAnuncio, midiaPublico, warnings };
  }
}
