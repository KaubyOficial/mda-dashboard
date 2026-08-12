import type {
  Agendamento,
  Lead,
  LeadComercial,
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
    const pagoOrganico = mapPagoOrganico(utm, get(row, iOrgPago), utmMap);
    const lead: Lead = {
      id: makeLeadId(emailKey, phoneKey, date, nameKey),
      date,
      emailKey,
      phoneKey,
      nameKey,
      qualificacao: labelFromSheet ?? byAnswers.qualificacao,
      temperatura: mapTemperatura(pagoOrganico),
      origem: mapOrigem(utm, utmMap),
      pagoOrganico,
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

/**
 * Linha da aba VENDAS que NÃO existe no Cakto (fonte oficial) e deve ficar fora do dashboard.
 * Mantidas em config/vendas-exclusions.json, uma a uma, com motivo — nunca por heurística.
 * Caso real: o fluxo n8n antigo grava QUALQUER POST do webhook como "VENDA REALIZADA"
 * (sem filtro de evento nem de produto), então a aba pode ter linhas que não são venda
 * paga da Mentoria. A reconciliação é contra o export oficial da Cakto.
 */
export interface VendaExclusion {
  /** Data da linha na planilha, em ISO (yyyy-mm-dd). */
  data: string;
  email: string;
  valorBRL: number;
  motivo: string;
}

/**
 * Aba VENDAS. Só Status VENDA REALIZADA conta. Valor real (líquido Cakto). Chaves de
 * casamento: e-mail → telefone (coluna `Phone`, opcional) → nome.
 * 1 COMPRADOR = 1 venda (decisão Kauê 2026-07-17, reconfirmada 2026-08-03): pagamento
 * dividido (metade pix/metade cartão, parcelas) aparece em 2+ linhas e é UNIDO numa venda
 * só. Por isso a contagem fica MENOR que a "Quantidade de vendas" da Cakto, que conta cada
 * transação — o faturamento bate ao centavo, a contagem é por cliente de propósito.
 */
export function parseVendaRows(
  rows: string[][],
  warnings: string[],
  exclusions: VendaExclusion[] = [],
): Venda[] {
  if (rows.length < 2) return [];
  const col = colFinder(rows[0]!);
  const iDate = col('Data', 'Data da Venda', 'Data e Hora');
  const iStatus = col('Status');
  const iName = col('Nome');
  const iEmail = col('E-mail', 'Email');
  // Coluna OPCIONAL (criada 2026-08-03, preenchida pelo fluxo n8n com `data.customer.phone`
  // do webhook da Cakto). É a ÚNICA chave que o checkout e o formulário compartilham de fato:
  // o e-mail da Cakto costuma ser outro e a aba LEADS guarda muitas vezes só o primeiro nome.
  // Ausente/vazia → phoneKey '' e o casamento segue como antes (e-mail → nome).
  const iPhone = col('Phone', 'Telefone', 'CellPhone', 'Celular', 'Whatsapp', 'WhatsApp');
  const iValor = col('Valor', 'Valor da Venda', 'Faturamento');
  // UTM DO CHECKOUT — colunas opcionais (2026-08-07), gravadas pelo n8n a partir do webhook da
  // Cakto e backfilladas do export oficial. Sem elas a venda fica com utm '' (comportamento
  // antigo) e a seção Comercial só enxerga o que o casamento com a lista mostrar.
  const iUtmSource = col('Utm Source', 'Utm_source', 'UTM_SOURCE', 'utm_source');
  const iUtmMedium = col('Utm Medium', 'Utm_medium', 'UTM_MEDIUM', 'utm_medium');
  const iSck = col('SCK', 'sck', 'Sck');
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
      phoneKey: normalizePhone(get(row, iPhone)),
      nameKey: normalizeName(get(row, iName)),
      valorBRL: parseMoneyBRL(get(row, iValor)) ?? 0,
      utmSource: get(row, iUtmSource).trim(),
      utmMedium: get(row, iUtmMedium).trim(),
      sck: get(row, iSck).trim(),
    });
  }
  if (iValor === undefined) warnings.push('VENDAS: coluna Valor não encontrada — faturamento = 0.');
  // Exclusões PRIMEIRO (a linha fantasma não pode nem entrar num grupo de pagamento dividido).
  const kept = applyVendaExclusions(out, exclusions, warnings);
  return dedupeSplitPayments(kept, warnings);
}

/** Remove as linhas listadas na config de reconciliação, com aviso auditável (nunca silencioso). */
function applyVendaExclusions(
  vendas: Venda[],
  exclusions: VendaExclusion[],
  warnings: string[],
): Venda[] {
  if (exclusions.length === 0) return vendas;
  const matches = (v: Venda, e: VendaExclusion): boolean =>
    v.date === e.data &&
    v.emailKey === normalizeEmail(e.email) &&
    Math.abs(v.valorBRL - e.valorBRL) < 0.005;

  const removed: string[] = [];
  const kept = vendas.filter((v) => {
    const hit = exclusions.find((e) => matches(v, e));
    if (!hit) return true;
    removed.push(`${v.date} ${v.emailKey || v.nameKey} R$ ${v.valorBRL.toFixed(2)} (${hit.motivo})`);
    return false;
  });

  if (removed.length > 0) {
    warnings.push(
      `VENDAS: ${removed.length} linha(s) excluída(s) por reconciliação com a Cakto (config/vendas-exclusions.json): ${removed.join('; ')}.`,
    );
  }
  const unused = exclusions.filter((e) => !vendas.some((v) => matches(v, e)));
  if (unused.length > 0) {
    warnings.push(
      `VENDAS: ${unused.length} exclusão(ões) de config/vendas-exclusions.json não casaram com nenhuma linha (já removidas da planilha?) — pode apagar da config: ${unused
        .map((e) => `${e.data} ${e.email}`)
        .join('; ')}.`,
    );
  }
  return kept;
}

/** Janela p/ tratar 2+ vendas do mesmo cliente como pagamento dividido/parcelado (em dias). */
const SPLIT_WINDOW_DAYS = 60;

function daysApart(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;
}

/**
 * Une pagamentos divididos: o MESMO cliente (mesmo e-mail) aparecendo em 2+ linhas de VENDA
 * próximas no tempo é UMA venda paga em partes (ex.: metade cartão / metade pix, ou parcelas),
 * não vendas separadas. Soma os valores e mantém a data da 1ª parte. Sem isso a contagem de
 * vendas e o ticket médio ficam inflados. (A Cakto conta cada transação — por isso a
 * "Quantidade de vendas" de lá é maior; decisão do Kauê: aqui é por cliente.)
 *
 * Regra de segurança: linhas SEM e-mail NUNCA são unidas — a aba VENDAS traz só o primeiro nome
 * em muitos casos (Lucas, Rafael, Daniel…) e primeiros nomes iguais são pessoas diferentes, cada
 * uma com ticket cheio. O e-mail é a única chave de identidade confiável. Vendas do mesmo e-mail
 * distantes (> janela) ficam separadas (recompra/renovação) e viram aviso para conferência.
 */
export function dedupeSplitPayments(vendas: Venda[], warnings: string[]): Venda[] {
  const byEmail = new Map<string, Venda[]>();
  const out: Venda[] = [];
  for (const v of vendas) {
    if (!v.emailKey) {
      out.push(v); // sem e-mail: identidade não comprovável → nunca une
      continue;
    }
    const arr = byEmail.get(v.emailKey);
    if (arr) arr.push(v);
    else byEmail.set(v.emailKey, [v]);
  }

  const merges: string[] = [];
  let farApart = 0;
  for (const rows of byEmail.values()) {
    if (rows.length === 1) {
      out.push(rows[0]!);
      continue;
    }
    rows.sort((a, b) => a.date.localeCompare(b.date));
    let run: Venda[] = [rows[0]!];
    const flush = () => {
      if (run.length === 1) {
        out.push(run[0]!);
        return;
      }
      const first = run[0]!;
      const valor = run.reduce((s, x) => s + x.valorBRL, 0);
      // mantém id/chaves/data da 1ª parte e soma o valor; o telefone vem da 1ª parte que TIVER
      // um (parcela antiga sem a coluna Phone não pode apagar o telefone de uma parte posterior).
      const phoneKey = first.phoneKey || run.find((x) => x.phoneKey)?.phoneKey || '';
      // idem para a UTM do checkout: numa venda dividida, a PRIMEIRA parte que registrou UTM
      // define o link (o trio source/medium/sck viaja junto — não misturar campos de partes
      // diferentes).
      const comUtm = run.find((x) => x.utmSource || x.utmMedium || x.sck) ?? first;
      out.push({
        ...first,
        phoneKey,
        valorBRL: valor,
        utmSource: comUtm.utmSource ?? '',
        utmMedium: comUtm.utmMedium ?? '',
        sck: comUtm.sck ?? '',
      });
      merges.push(`${first.nameKey || first.emailKey} (${run.length}× = R$ ${valor.toFixed(2)})`);
    };
    for (let i = 1; i < rows.length; i++) {
      if (daysApart(rows[i]!.date, run[run.length - 1]!.date) <= SPLIT_WINDOW_DAYS) {
        run.push(rows[i]!);
      } else {
        farApart++;
        flush();
        run = [rows[i]!];
      }
    }
    flush();
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  if (merges.length > 0) {
    warnings.push(
      `VENDAS: ${merges.length} venda(s) estavam divididas em 2+ linhas (mesmo cliente, pagamento em partes) e foram unidas numa venda só: ${merges.join('; ')}.`,
    );
  }
  if (farApart > 0) {
    warnings.push(
      `VENDAS: ${farApart} caso(s) de mesmo e-mail com compras a mais de ${SPLIT_WINDOW_DAYS} dias — mantidas como vendas SEPARADAS (possível recompra). Conferir se não é parcela atrasada.`,
    );
  }
  return out;
}

// ─────────────────────────────────────── LEADS COMERCIAL ─────────────────────────────────────
/**
 * Aba LEADS COMERCIAL (opcional): a lista de contatos que cada vendedor trabalha, colada do CSV
 * que ele exporta. Colunas: Data · Vendedor · Nome · E-mail · Telefone (qualquer ordem; a linha
 * só precisa de UMA chave — nome, e-mail ou telefone — pra poder casar com a venda depois).
 * Linha SEM data é aceita (conta em qualquer período) — o aviso denuncia pra não virar hábito.
 * Dedup: o mesmo contato colado 2× na lista do mesmo vendedor conta uma vez.
 */
export function parseLeadComercialRows(rows: string[][], warnings: string[]): LeadComercial[] {
  if (rows.length < 2) return [];
  const col = colFinder(rows[0]!);
  const iDate = col('Data', 'Data e Hora', 'Date');
  const iVendedor = col('Vendedor', 'Comercial', 'Responsável', 'Responsavel');
  const iName = col('Nome', 'Name', 'Cliente');
  const iEmail = col('E-mail', 'Email');
  const iPhone = col('Telefone', 'Phone', 'CellPhone', 'Celular', 'Whatsapp', 'WhatsApp', 'Número', 'Numero');

  const dedup = new Map<string, LeadComercial>();
  let quarantined = 0;
  let semData = 0;
  let semVendedor = 0;
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r]!;
    const emailKey = normalizeEmail(get(row, iEmail));
    const phoneKey = normalizePhone(get(row, iPhone));
    const nameKey = normalizeName(get(row, iName));
    if (!emailKey && !phoneKey && !nameKey) {
      quarantined++;
      continue;
    }
    const date = parseDateISO(get(row, iDate)) ?? '';
    if (!date) semData++;
    const vendedor = get(row, iVendedor).trim().toLowerCase();
    if (!vendedor) semVendedor++;
    const lead: LeadComercial = {
      id: `${vendedor}|${emailKey || phoneKey || nameKey}`,
      date,
      vendedor,
      emailKey,
      phoneKey,
      nameKey,
    };
    const existing = dedup.get(lead.id);
    // repetido: fica a linha COM data mais antiga (entrou na lista primeiro)
    if (!existing || (lead.date !== '' && (existing.date === '' || lead.date < existing.date))) {
      dedup.set(lead.id, lead);
    }
  }
  if (quarantined > 0)
    warnings.push(`LEADS COMERCIAL: ${quarantined} linha(s) sem nome/e-mail/telefone (ignoradas).`);
  if (semData > 0)
    warnings.push(
      `LEADS COMERCIAL: ${semData} linha(s) sem Data — entram na contagem de QUALQUER período. Preencher a data em que o contato entrou na lista deixa a conversão do mês correta.`,
    );
  if (semVendedor > 0)
    warnings.push(
      `LEADS COMERCIAL: ${semVendedor} linha(s) sem Vendedor — não contam pra nenhum vendedor na seção Comercial. Preencher com o slug do link (leo, gabriel…).`,
    );
  return [...dedup.values()];
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
  // Cliques no botão da VSL que levam ao /cadastro-monetizacao/ (etapa entre "chegou na LP" e
  // "começou o form"). Coluna opcional — aceita vários nomes; se não existir fica 0 e a etapa
  // some do funil. Também pode vir da aba MÉTRICAS ADS (custom conversion) via mergeAdsIntoDiaria.
  const iCad = col(
    'Cliques no Botão',
    'Cliques Botão',
    'Clique no Botão',
    'Clique Botão',
    'Botão LP',
    'Botao LP',
    'Chegou Cadastro',
    'Chegou no Cadastro',
    'Cadastro',
    'Foi pro Cadastro',
    'Clicou no Botão',
  );
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
      chegouCadastro: iCad === undefined ? 0 : parseInt0(get(row, iCad)),
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
  // Custom conversion opcional p/ cliques no botão da VSL → página de cadastro (etapa entre LP e form).
  const iCad = col(
    'Action Chegou Cadastro',
    'Chegou Cadastro',
    'Cliques no Botão',
    'Clique Botão',
    'Botão LP',
    'Cadastro',
  );
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
      chegouCadastro: iCad === undefined ? 0 : parseInt0(get(row, iCad)),
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
  const cadByDay = new Map<string, number>();
  for (const a of anuncios) {
    lpByDay.set(a.date, (lpByDay.get(a.date) ?? 0) + a.lpViews);
    vslByDay.set(a.date, (vslByDay.get(a.date) ?? 0) + a.vslPlays);
    cadByDay.set(a.date, (cadByDay.get(a.date) ?? 0) + a.chegouCadastro);
  }
  for (const d of diaria) {
    d.cliquesBotaoLP = lpByDay.get(d.date) ?? 0;
    d.vslPlays = vslByDay.get(d.date) ?? 0;
    // "chegou no cadastro" pode vir da coluna manual (ACOMPANHAMENTO) ou do custom conversion (ADS).
    // A manual do dia vence se já veio preenchida; senão usa o agregado das ADS.
    if (d.chegouCadastro === 0) d.chegouCadastro = cadByDay.get(d.date) ?? 0;
  }
}
