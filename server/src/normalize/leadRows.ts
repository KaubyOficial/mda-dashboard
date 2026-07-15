import type {
  Agendamento,
  Lead,
  MidiaAnuncio,
  MidiaDiaria,
  MidiaPublico,
  UtmSet,
  Venda,
} from '../domain/entities.js';
import type { UtmMap } from './utm.js';
import { mapOrigem, mapPagoOrganico, mapTemperatura } from './utm.js';
import { classifyByAnswers, normalizeQualLabel } from './qualification.js';
import { headerIndex, normHeader } from '../util/csv.js';
import { parseDateISO, parseInt0, parseMoneyBRL, unescapeCell } from '../util/parse.js';
import { makeLeadId, normalizeEmail, normalizeName, normalizePhone } from '../util/keys.js';

function get(row: string[], idx: number | undefined): string {
  if (idx === undefined) return '';
  return unescapeCell(row[idx] ?? '');
}

/** Lookup de coluna por nome (aceita vários aliases), tolerante a acento/espaço. */
function colFinder(header: string[]): (...names: string[]) => number | undefined {
  const H = headerIndex(header);
  return (...names: string[]) => {
    for (const n of names) {
      const idx = H.get(normHeader(n));
      if (idx !== undefined) return idx;
    }
    return undefined;
  };
}

// ─────────────────────────────────────────── LEADS ───────────────────────────────────────────
/** Aba LEADS (fonte primária de leads). Dedup por id (submissão mais recente vence). */
export function parseLeadRows(rows: string[][], utmMap: UtmMap, warnings: string[]): Lead[] {
  if (rows.length < 2) return [];
  const col = colFinder(rows[0]!);
  const iDate = col('Data', 'Data e Hora');
  const iName = col('Nome', 'Confirme o seu Nome?');
  const iEmail = col('E-mail', 'Email', 'Confirme o seu E-mail?');
  const iPhone = col('CellPhone', 'Telefone', '(DDD)+Número do Whatsapp: Vamos te Chamar nesse Número!');
  const iMql = col('MQL');
  const iCapital = col('CAPITAL NECESSÁRIO?', 'O que melhor descreve sua situação atual?');
  const iConhece = col('Conhece?');
  const iSource = col('OCDM_utm_source', 'UTM_SOURCE');
  const iMedium = col('OCDM_utm_medium', 'UTM_MEDIUM');
  const iCampaign = col('OCDM_utm_campaign', 'UTM_CAMPAIGN');
  const iContent = col('OCDM_utm_content', 'UTM_CONTENT');
  const iTerm = col('OCDM_utm_term', 'UTM_TERM');
  const iOrgPago = col('ORGANICO OU PAGO?', 'ORGÂNICO OU PAGO?');

  const dedup = new Map<string, Lead>();
  let quarantined = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const date = parseDateISO(get(row, iDate));
    if (!date) {
      quarantined++;
      continue;
    }
    const emailKey = normalizeEmail(get(row, iEmail));
    const phoneKey = normalizePhone(get(row, iPhone));
    const nameKey = normalizeName(get(row, iName));
    if (!emailKey && !phoneKey && !nameKey) {
      quarantined++;
      continue;
    }
    const utm: UtmSet = {
      source: get(row, iSource),
      medium: get(row, iMedium),
      campaign: get(row, iCampaign),
      content: get(row, iContent),
      term: get(row, iTerm),
    };
    const labelFromSheet = normalizeQualLabel(get(row, iMql));
    const byAnswers = classifyByAnswers(get(row, iCapital), get(row, iConhece));
    const lead: Lead = {
      id: makeLeadId(emailKey, phoneKey, date, nameKey),
      date,
      emailKey,
      phoneKey,
      nameKey,
      qualificacao: labelFromSheet ?? byAnswers.qualificacao,
      temperatura: mapTemperatura(utm, utmMap),
      origem: mapOrigem(utm, utmMap),
      pagoOrganico: mapPagoOrganico(utm, get(row, iOrgPago), utmMap),
      utm,
      rendaBRL: byAnswers.rendaBRL,
      conhecePlusSemana: byAnswers.conhecePlusSemana,
    };
    const existing = dedup.get(lead.id);
    if (!existing || existing.date <= lead.date) dedup.set(lead.id, lead);
  }
  if (quarantined > 0) warnings.push(`LEADS: ${quarantined} linhas em quarentena (sem data/chave).`);
  return [...dedup.values()];
}

// ──────────────────────────────────── AGENDAMENTOS & CALL ────────────────────────────────────
const STATUS_MARCADA = 'CALL MARCADA';
const STATUS_REALIZADA = 'CALL REALIZADA';

/** Aba AGENDAMENTOS & CALL. Agendamento = Status CALL MARCADA ou CALL REALIZADA; compareceu = REALIZADA. Sem e-mail (só telefone+nome). */
export function parseAgendamentoRows(rows: string[][], warnings: string[]): Agendamento[] {
  if (rows.length < 2) return [];
  const col = colFinder(rows[0]!);
  const iDate = col('Data', 'Data e Hora');
  const iStatus = col('Status');
  const iName = col('Nome');
  const iPhone = col('CellPhone', 'Telefone');
  const iEmail = col('E-mail', 'Email');
  const out: Agendamento[] = [];
  let skipped = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const status = get(row, iStatus).toUpperCase();
    if (status !== STATUS_MARCADA && status !== STATUS_REALIZADA) {
      skipped++;
      continue;
    }
    const date = parseDateISO(get(row, iDate));
    if (!date) continue;
    out.push({
      id: `ag-${r}`,
      date,
      emailKey: normalizeEmail(get(row, iEmail)),
      phoneKey: normalizePhone(get(row, iPhone)),
      nameKey: normalizeName(get(row, iName)),
      status,
      compareceu: status === STATUS_REALIZADA,
    });
  }
  if (iStatus === undefined) warnings.push('AGENDAMENTOS: coluna Status não encontrada.');
  else if (skipped > 0) warnings.push(`AGENDAMENTOS: ${skipped} linhas sem status de call (ignoradas).`);
  return out;
}

// ─────────────────────────────────────────── VENDAS ──────────────────────────────────────────
const STATUS_VENDA = 'VENDA REALIZADA';

/** Aba VENDAS. Só Status VENDA REALIZADA conta. Valor real. Sem e-mail/telefone confiável → casamento por nome. */
export function parseVendaRows(rows: string[][], warnings: string[]): Venda[] {
  if (rows.length < 2) return [];
  const col = colFinder(rows[0]!);
  const iDate = col('Data', 'Data da Venda', 'Data e Hora');
  const iStatus = col('Status');
  const iName = col('Nome');
  const iEmail = col('E-mail', 'Email');
  const iValor = col('Valor', 'Valor da Venda', 'Faturamento');
  const out: Venda[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    if (iStatus !== undefined && get(row, iStatus).toUpperCase() !== STATUS_VENDA) continue;
    const date = parseDateISO(get(row, iDate));
    if (!date) continue;
    out.push({
      id: `v-${r}`,
      date,
      emailKey: normalizeEmail(get(row, iEmail)),
      phoneKey: '',
      nameKey: normalizeName(get(row, iName)),
      valorBRL: parseMoneyBRL(get(row, iValor)) ?? 0,
    });
  }
  if (iValor === undefined) warnings.push('VENDAS: coluna Valor não encontrada — faturamento = 0.');
  return out;
}

// ──────────────────────────────── ACOMPANHAMENTO DIÁRIO (mídia) ───────────────────────────────
/** Aba ACOMPANHAMENTO DIÁRIO. LP view/vídeo são preenchidos depois pelo agregado de MÉTRICAS ADS. */
export function parseMidiaDiariaRows(rows: string[][]): MidiaDiaria[] {
  if (rows.length < 2) return [];
  const col = colFinder(rows[0]!);
  const iDate = col('Data', 'Dia', 'DIA');
  const iInv = col('Gasto', 'Investimento', 'Investimento diário');
  const iLeads = col('Leads');
  const iClq = col('Cliques no Link', 'Cliques');
  const iAlc = col('Alcance');
  const iImp = col('Impressões');
  const iFi = col('IniciouForms', 'Forms Iniciados', 'Início Forms');
  const out: MidiaDiaria[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const date = parseDateISO(get(row, iDate));
    if (!date) continue;
    out.push({
      date,
      investimentoBRL: parseMoneyBRL(get(row, iInv)) ?? 0,
      impressoes: parseInt0(get(row, iImp)),
      alcance: parseInt0(get(row, iAlc)),
      cliques: parseInt0(get(row, iClq)),
      cliquesBotaoLP: 0, // preenchido do agregado de MÉTRICAS ADS
      vslPlays: 0, // idem
      formsIniciados: parseInt0(get(row, iFi)),
      formsFinalizados: parseInt0(get(row, iLeads)),
    });
  }
  return out;
}

// ─────────────────────────────────────── MÉTRICAS ADS ────────────────────────────────────────
/** Aba MÉTRICAS ADS (por anúncio/dia). Traz Action Leads e MQL próprios. */
export function parseMidiaAnuncioRows(rows: string[][]): MidiaAnuncio[] {
  if (rows.length < 2) return [];
  const col = colFinder(rows[0]!);
  const iDate = col('date', 'Date', 'Data');
  const iAd = col('Ad Name', 'Anúncio', 'Anuncio');
  const iSpend = col('Spend (Cost, Amount Spent)', 'Spend', 'Gasto', 'Investimento');
  const iLeads = col('Action Leads', 'Leads');
  const iImp = col('Impressions', 'Impressões');
  const iClq = col('Inline Link Clicks', 'Cliques', 'Link Clicks');
  const iLp = col('Action Landing Page View', 'Landing Page View', 'LP View');
  const iVsl = col('Action 3s Video Views', '3s Video Views', 'Video Views');
  const iMql = col('MQL');
  const out: MidiaAnuncio[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const date = parseDateISO(get(row, iDate));
    if (!date) continue;
    const anuncio = get(row, iAd) || '(sem anúncio)';
    out.push({
      date,
      anuncio,
      investimentoBRL: parseMoneyBRL(get(row, iSpend)) ?? 0,
      impressoes: parseInt0(get(row, iImp)),
      cliques: parseInt0(get(row, iClq)),
      lpViews: parseInt0(get(row, iLp)),
      vslPlays: parseInt0(get(row, iVsl)),
      leads: parseInt0(get(row, iLeads)),
      mqls: parseInt0(get(row, iMql)),
    });
  }
  return out;
}

// ─────────────────────────────────────── TOP PÚBLICOS ────────────────────────────────────────
/** Aba TOP PÚBLICOS (por público/dia). Traz leads por público. */
export function parseMidiaPublicoRows(rows: string[][]): MidiaPublico[] {
  if (rows.length < 2) return [];
  const col = colFinder(rows[0]!);
  const iDate = col('DATA', 'Data');
  const iPub = col('PÚBLICO', 'Publico', 'NOME', 'Nome');
  const iGasto = col('GASTO', 'Gasto', 'Investimento');
  const iLeads = col('LEADS', 'Leads');
  const iImp = col('IMPRESSÕES', 'Impressões');
  const iClq = col('CLIQUES', 'Cliques');
  const out: MidiaPublico[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const date = parseDateISO(get(row, iDate));
    if (!date) continue;
    out.push({
      date,
      publico: get(row, iPub) || '(sem público)',
      investimentoBRL: parseMoneyBRL(get(row, iGasto)) ?? 0,
      impressoes: parseInt0(get(row, iImp)),
      cliques: parseInt0(get(row, iClq)),
      leads: parseInt0(get(row, iLeads)),
    });
  }
  return out;
}

/** Agrega LP views e 3s video das MÉTRICAS ADS por dia e injeta na mídia diária (funil de mkt). */
export function mergeAdsIntoDiaria(diaria: MidiaDiaria[], anuncios: MidiaAnuncio[]): void {
  const lpByDay = new Map<string, number>();
  const vslByDay = new Map<string, number>();
  for (const a of anuncios) {
    lpByDay.set(a.date, (lpByDay.get(a.date) ?? 0) + a.lpViews);
    vslByDay.set(a.date, (vslByDay.get(a.date) ?? 0) + a.vslPlays);
  }
  for (const d of diaria) {
    d.cliquesBotaoLP = lpByDay.get(d.date) ?? 0;
    d.vslPlays = vslByDay.get(d.date) ?? 0;
  }
}
