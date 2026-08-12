import type { DataSource } from './DataSource.js';
import type {
  Agendamento,
  DataSnapshot,
  Lead,
  MidiaAnuncio,
  MidiaDiaria,
  MidiaPublico,
  Origem,
  PagoOrganico,
  Qualificacao,
  Temperatura,
  Venda,
} from '../domain/entities.js';

/** PRNG determinística (mulberry32) — dados sintéticos coerentes e estáveis para dev de UI. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function isoDaysAgo(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

const PUBLICOS = ['IG Visitou 7d', 'Lookalike Compradores', 'Envolvimento 30d', 'Remarketing 180d'];
const ANUNCIOS = ['AD26', 'AD27', 'AD28', 'AD35', 'AD37'];

export interface MockOptions {
  days?: number;
  seed?: number;
  today?: Date;
}

/** Gera ~N dias de dados sintéticos completos das 6 entidades. Determinístico por seed. */
export class MockSource implements DataSource {
  readonly name = 'mock (sintético)';
  private readonly days: number;
  private readonly rnd: () => number;
  private readonly today: Date;

  constructor(opts: MockOptions = {}) {
    this.days = opts.days ?? 120;
    this.rnd = mulberry32(opts.seed ?? 20260707);
    this.today = opts.today ?? new Date();
  }

  private pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.rnd() * arr.length)]!;
  }

  async fetchAll(): Promise<DataSnapshot> {
    const leads: Lead[] = [];
    const agendamentos: Agendamento[] = [];
    const vendas: Venda[] = [];
    const midiaDiaria: MidiaDiaria[] = [];
    const midiaPublico: MidiaPublico[] = [];
    const midiaAnuncio: MidiaAnuncio[] = [];

    let seq = 0;
    for (let d = this.days; d >= 0; d--) {
      const date = isoDaysAgo(this.today, d);
      const weekend = new Date(date + 'T12:00:00').getDay();
      const seasonal = weekend === 0 || weekend === 6 ? 0.6 : 1;
      const leadsToday = Math.round((12 + this.rnd() * 20) * seasonal);
      const invest = Math.round((300 + this.rnd() * 500) * seasonal);
      const impressoes = Math.round(invest * (30 + this.rnd() * 20));
      const cliques = Math.round(impressoes * (0.01 + this.rnd() * 0.02));
      const cliquesBotaoLP = Math.round(cliques * (0.4 + this.rnd() * 0.2));
      const vslPlays = Math.round(cliquesBotaoLP * (0.6 + this.rnd() * 0.2));
      // clique no botão da VSL → cadastro: entre "chegou na LP" e "começou o form"
      const chegouCadastro = Math.round(cliquesBotaoLP * (0.15 + this.rnd() * 0.1));
      const formsIniciados = Math.round(chegouCadastro * (0.6 + this.rnd() * 0.2));
      const formsFinalizados = Math.max(leadsToday, Math.round(formsIniciados * 0.8));

      midiaDiaria.push({
        date,
        investimentoBRL: invest,
        impressoes,
        alcance: Math.round(impressoes * 0.7),
        cliques,
        cliquesBotaoLP,
        vslPlays,
        chegouCadastro,
        formsIniciados,
        formsFinalizados,
      });

      // mídia por público / anúncio (rateio do investimento do dia)
      let restInvest = invest;
      let restImp = impressoes;
      let restClq = cliques;
      PUBLICOS.forEach((publico, i) => {
        const share = i === PUBLICOS.length - 1 ? 1 : 0.2 + this.rnd() * 0.2;
        const inv = i === PUBLICOS.length - 1 ? restInvest : Math.round(invest * share);
        const imp = i === PUBLICOS.length - 1 ? restImp : Math.round(impressoes * share);
        const clq = i === PUBLICOS.length - 1 ? restClq : Math.round(cliques * share);
        restInvest -= inv;
        restImp -= imp;
        restClq -= clq;
        midiaPublico.push({
          date,
          publico,
          investimentoBRL: inv,
          impressoes: imp,
          cliques: clq,
          leads: Math.round(clq * (0.03 + this.rnd() * 0.03)),
        });
      });
      ANUNCIOS.forEach((anuncio) => {
        const adClq = Math.round(cliques / ANUNCIOS.length);
        const adLeads = Math.round(adClq * (0.03 + this.rnd() * 0.03));
        midiaAnuncio.push({
          date,
          anuncio,
          investimentoBRL: Math.round(invest / ANUNCIOS.length),
          impressoes: Math.round(impressoes / ANUNCIOS.length),
          cliques: adClq,
          lpViews: Math.round(adClq * 0.5),
          vslPlays: Math.round(adClq * 0.3),
          chegouCadastro: Math.round(adClq * 0.08),
          leads: adLeads,
          mqls: Math.round(adLeads * 0.1),
        });
      });

      for (let k = 0; k < leadsToday; k++) {
        seq++;
        const emailKey = `lead${seq}@example.test`;
        const phoneKey = `1198${String(1000000 + seq).slice(-7)}`;
        const q = this.rnd();
        const qualificacao: Qualificacao =
          q < 0.08 ? 'MQL' : q < 0.3 ? 'Morno' : 'Fora do perfil';
        const paid: PagoOrganico = this.rnd() < 0.8 ? 'pago' : 'organico';
        // regra 2026-07-24: pago = quente, orgânico = morno (mesma derivação do parser real)
        const temperatura: Temperatura = paid === 'pago' ? 'quente' : 'morno';
        const origem: Origem = paid === 'pago' ? 'anuncio' : this.rnd() < 0.5 ? 'bio' : 'organico';
        const lead: Lead = {
          id: `${emailKey}|${date}`,
          date,
          emailKey,
          phoneKey,
          nameKey: `lead ${seq}`,
          qualificacao,
          temperatura,
          origem,
          pagoOrganico: paid,
          utm: {
            source: paid === 'pago' ? 'FacebookADS' : 'BioOrganico',
            medium: this.pick(['ig-visitou-7d', 'envolvimento-7d', 'social']),
            campaign: 'OCDM-AUTO-CAPTACAO',
            content: this.pick(ANUNCIOS),
            term: '',
          },
          rendaBRL: qualificacao === 'Fora do perfil' ? 1000 : 5000,
          conhecePlusSemana: qualificacao === 'MQL',
        };
        leads.push(lead);

        // funil comercial: parte dos leads avança
        const respondeu = this.rnd() < 0.35;
        if (respondeu && this.rnd() < 0.5) {
          const agDate = isoDaysAgo(this.today, Math.max(0, d - 2));
          const compareceu = this.rnd() < 0.6;
          agendamentos.push({
            id: `ag-${seq}`,
            date: agDate,
            emailKey,
            phoneKey,
            nameKey: `lead ${seq}`,
            status: compareceu ? 'CALL REALIZADA' : 'CALL MARCADA',
            compareceu,
          });
          if (compareceu && this.rnd() < 0.25) {
            vendas.push({
              id: `v-${seq}`,
              date: isoDaysAgo(this.today, Math.max(0, d - 3)),
              emailKey: '',
              phoneKey: '',
              nameKey: `lead ${seq}`,
              valorBRL: this.pick([4297, 4297, 3997, 5997]),
            });
          }
        }
      }
    }

    return {
      leads,
      agendamentos,
      vendas,
      leadsComercial: [],
      midiaDiaria,
      midiaPublico,
      midiaAnuncio,
      warnings: ['MOCK: dados sintéticos — não usar para reconciliação.'],
    };
  }
}
