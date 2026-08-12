import type { Db } from './db.js';
import type {
  Agendamento,
  DataSnapshot,
  Lead,
  LeadComercial,
  MidiaAnuncio,
  MidiaDiaria,
  MidiaPublico,
  Origem,
  PagoOrganico,
  Qualificacao,
  Temperatura,
  Venda,
} from '../domain/entities.js';

/** Full refresh idempotente (§2.2/2.5): substitui todo o cache numa transação. */
export function writeSnapshot(db: Db, snap: DataSnapshot): void {
  db.exec('BEGIN');
  try {
    for (const t of [
      'leads',
      'agendamentos',
      'vendas',
      'leads_comercial',
      'midia_diaria',
      'midia_publico',
      'midia_anuncio',
    ]) {
      db.exec(`DELETE FROM ${t}`);
    }

    const insLead = db.prepare(
      `INSERT OR REPLACE INTO leads (id,date,email_key,phone_key,name_key,qualificacao,temperatura,origem,pago_organico,utm_source,utm_medium,utm_campaign,utm_content,utm_term,renda_brl,conhece)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const l of snap.leads) {
      insLead.run(
        l.id, l.date, l.emailKey, l.phoneKey, l.nameKey, l.qualificacao, l.temperatura, l.origem, l.pagoOrganico,
        l.utm.source, l.utm.medium, l.utm.campaign, l.utm.content, l.utm.term,
        l.rendaBRL, l.conhecePlusSemana ? 1 : 0,
      );
    }

    const insAg = db.prepare(
      `INSERT OR REPLACE INTO agendamentos (id,date,email_key,phone_key,name_key,status,compareceu) VALUES (?,?,?,?,?,?,?)`,
    );
    for (const a of snap.agendamentos) {
      insAg.run(a.id, a.date, a.emailKey, a.phoneKey, a.nameKey, a.status, a.compareceu ? 1 : 0);
    }

    const insV = db.prepare(
      `INSERT OR REPLACE INTO vendas (id,date,email_key,phone_key,name_key,valor_brl,utm_source,utm_medium,sck) VALUES (?,?,?,?,?,?,?,?,?)`,
    );
    for (const v of snap.vendas)
      insV.run(
        v.id, v.date, v.emailKey, v.phoneKey, v.nameKey, v.valorBRL,
        v.utmSource ?? '', v.utmMedium ?? '', v.sck ?? '',
      );

    const insLc = db.prepare(
      `INSERT OR REPLACE INTO leads_comercial (id,date,vendedor,email_key,phone_key,name_key) VALUES (?,?,?,?,?,?)`,
    );
    for (const lc of snap.leadsComercial)
      insLc.run(lc.id, lc.date, lc.vendedor, lc.emailKey, lc.phoneKey, lc.nameKey);

    const insMd = db.prepare(
      `INSERT OR REPLACE INTO midia_diaria (date,investimento_brl,impressoes,alcance,cliques,cliques_botao_lp,vsl_plays,chegou_cadastro,forms_iniciados,forms_finalizados)
       VALUES (?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const m of snap.midiaDiaria) {
      insMd.run(m.date, m.investimentoBRL, m.impressoes, m.alcance, m.cliques, m.cliquesBotaoLP, m.vslPlays, m.chegouCadastro, m.formsIniciados, m.formsFinalizados);
    }

    const insMp = db.prepare(
      `INSERT OR REPLACE INTO midia_publico (date,publico,investimento_brl,impressoes,cliques,leads) VALUES (?,?,?,?,?,?)`,
    );
    for (const m of snap.midiaPublico) insMp.run(m.date, m.publico, m.investimentoBRL, m.impressoes, m.cliques, m.leads);

    const insMa = db.prepare(
      `INSERT OR REPLACE INTO midia_anuncio (date,anuncio,investimento_brl,impressoes,cliques,lp_views,vsl_plays,chegou_cadastro,leads,mqls) VALUES (?,?,?,?,?,?,?,?,?,?)`,
    );
    for (const m of snap.midiaAnuncio)
      insMa.run(m.date, m.anuncio, m.investimentoBRL, m.impressoes, m.cliques, m.lpViews, m.vslPlays, m.chegouCadastro, m.leads, m.mqls);

    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}

type Row = Record<string, unknown>;
const s = (v: unknown): string => (v == null ? '' : String(v));
const n = (v: unknown): number => (v == null ? 0 : Number(v));

export function readSnapshot(db: Db): DataSnapshot {
  const leads = (db.prepare('SELECT * FROM leads').all() as Row[]).map(
    (r): Lead => ({
      id: s(r.id),
      date: s(r.date),
      emailKey: s(r.email_key),
      phoneKey: s(r.phone_key),
      nameKey: s(r.name_key),
      qualificacao: s(r.qualificacao) as Qualificacao,
      temperatura: s(r.temperatura) as Temperatura,
      origem: s(r.origem) as Origem,
      pagoOrganico: s(r.pago_organico) as PagoOrganico,
      utm: {
        source: s(r.utm_source),
        medium: s(r.utm_medium),
        campaign: s(r.utm_campaign),
        content: s(r.utm_content),
        term: s(r.utm_term),
      },
      rendaBRL: r.renda_brl == null ? null : Number(r.renda_brl),
      conhecePlusSemana: n(r.conhece) === 1,
    }),
  );
  const agendamentos = (db.prepare('SELECT * FROM agendamentos').all() as Row[]).map(
    (r): Agendamento => ({
      id: s(r.id),
      date: s(r.date),
      emailKey: s(r.email_key),
      phoneKey: s(r.phone_key),
      nameKey: s(r.name_key),
      status: s(r.status),
      compareceu: n(r.compareceu) === 1,
    }),
  );
  const vendas = (db.prepare('SELECT * FROM vendas').all() as Row[]).map(
    (r): Venda => ({
      id: s(r.id),
      date: s(r.date),
      emailKey: s(r.email_key),
      phoneKey: s(r.phone_key),
      nameKey: s(r.name_key),
      valorBRL: n(r.valor_brl),
      utmSource: s(r.utm_source),
      utmMedium: s(r.utm_medium),
      sck: s(r.sck),
    }),
  );
  const leadsComercial = (db.prepare('SELECT * FROM leads_comercial').all() as Row[]).map(
    (r): LeadComercial => ({
      id: s(r.id),
      date: s(r.date),
      vendedor: s(r.vendedor),
      emailKey: s(r.email_key),
      phoneKey: s(r.phone_key),
      nameKey: s(r.name_key),
    }),
  );
  const midiaDiaria = (db.prepare('SELECT * FROM midia_diaria').all() as Row[]).map(
    (r): MidiaDiaria => ({
      date: s(r.date),
      investimentoBRL: n(r.investimento_brl),
      impressoes: n(r.impressoes),
      alcance: n(r.alcance),
      cliques: n(r.cliques),
      cliquesBotaoLP: n(r.cliques_botao_lp),
      vslPlays: n(r.vsl_plays),
      chegouCadastro: n(r.chegou_cadastro),
      formsIniciados: n(r.forms_iniciados),
      formsFinalizados: n(r.forms_finalizados),
    }),
  );
  const midiaPublico = (db.prepare('SELECT * FROM midia_publico').all() as Row[]).map(
    (r): MidiaPublico => ({
      date: s(r.date),
      publico: s(r.publico),
      investimentoBRL: n(r.investimento_brl),
      impressoes: n(r.impressoes),
      cliques: n(r.cliques),
      leads: n(r.leads),
    }),
  );
  const midiaAnuncio = (db.prepare('SELECT * FROM midia_anuncio').all() as Row[]).map(
    (r): MidiaAnuncio => ({
      date: s(r.date),
      anuncio: s(r.anuncio),
      investimentoBRL: n(r.investimento_brl),
      impressoes: n(r.impressoes),
      cliques: n(r.cliques),
      lpViews: n(r.lp_views),
      vslPlays: n(r.vsl_plays),
      chegouCadastro: n(r.chegou_cadastro),
      leads: n(r.leads),
      mqls: n(r.mqls),
    }),
  );
  return {
    leads,
    agendamentos,
    vendas,
    leadsComercial,
    midiaDiaria,
    midiaPublico,
    midiaAnuncio,
    warnings: [],
  };
}

export interface SyncRunInfo {
  lastSync: string | null;
  lastStatus: string | null;
  warnings: string[];
}

export function getLastSync(db: Db): SyncRunInfo {
  const row = db
    .prepare(`SELECT finished_at, status, warnings_json FROM sync_runs WHERE status='ok' ORDER BY id DESC LIMIT 1`)
    .get() as Row | undefined;
  if (!row) return { lastSync: null, lastStatus: null, warnings: [] };
  let warnings: string[] = [];
  try {
    warnings = JSON.parse(s(row.warnings_json) || '[]') as string[];
  } catch {
    warnings = [];
  }
  return { lastSync: s(row.finished_at), lastStatus: s(row.status), warnings };
}
