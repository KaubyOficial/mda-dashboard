import type { Agendamento, DataSnapshot, Lead, Venda } from '../domain/entities.js';

/** Lead enriquecido com desfecho comercial casado (§2.4). */
export interface EnrichedLead extends Lead {
  temAgendamento: boolean;
  compareceu: boolean;
  temVenda: boolean;
  valorVendaBRL: number;
}

export interface MatchReport {
  byEmail: number;
  byPhone: number;
  byName: number;
  unmatched: number;
  totalVendas: number;
}

interface MatchResult {
  enriched: EnrichedLead[];
  unattributedVendas: Venda[];
  /** cada agendamento/venda com o lead que casou (null = sem lead) — p/ recortes por atributo do lead. */
  agendamentosComLead: { ag: Agendamento; lead: Lead | null }[];
  vendasComLead: { venda: Venda; lead: Lead | null }[];
  report: MatchReport;
}

interface LeadIndex {
  byEmail: Map<string, Lead>;
  byPhone: Map<string, Lead>;
  byName: Map<string, Lead>;
}

function indexLeads(leads: Lead[]): LeadIndex {
  const byEmail = new Map<string, Lead>();
  const byPhone = new Map<string, Lead>();
  const byName = new Map<string, Lead>();
  for (const l of leads) {
    if (l.emailKey && !byEmail.has(l.emailKey)) byEmail.set(l.emailKey, l);
    if (l.phoneKey && !byPhone.has(l.phoneKey)) byPhone.set(l.phoneKey, l);
    if (l.nameKey && !byName.has(l.nameKey)) byName.set(l.nameKey, l);
  }
  return { byEmail, byPhone, byName };
}

function findLead(
  rec: { emailKey: string; phoneKey: string; nameKey: string },
  idx: LeadIndex,
): { lead: Lead | undefined; via: 'email' | 'phone' | 'name' | 'none' } {
  if (rec.emailKey && idx.byEmail.has(rec.emailKey)) return { lead: idx.byEmail.get(rec.emailKey)!, via: 'email' };
  if (rec.phoneKey && idx.byPhone.has(rec.phoneKey)) return { lead: idx.byPhone.get(rec.phoneKey)!, via: 'phone' };
  if (rec.nameKey && idx.byName.has(rec.nameKey)) return { lead: idx.byName.get(rec.nameKey)!, via: 'name' };
  return { lead: undefined, via: 'none' };
}

/**
 * Casa agendamentos e vendas aos leads pela mesma cadeia: e-mail → telefone → nome.
 * Na aba VENDAS o e-mail é o do CHECKOUT: casa quando o comprador usou o mesmo do formulário,
 * senão não casa com nada. O telefone (coluna `Phone`, escrita pelo n8n desde 2026-08-03) é o
 * que resgata esses casos — linhas anteriores à coluna não têm telefone e seguem caindo em
 * nome/não atribuído.
 * Venda sem lead casado → bucket "não atribuído": entra no faturamento total, fora dos segmentos (§2.4).
 */
export function enrichLeads(snap: DataSnapshot): MatchResult {
  const idx = indexLeads(snap.leads);
  const enriched = new Map<string, EnrichedLead>();
  for (const l of snap.leads) {
    enriched.set(l.id, { ...l, temAgendamento: false, compareceu: false, temVenda: false, valorVendaBRL: 0 });
  }

  const agendamentosComLead: MatchResult['agendamentosComLead'] = [];
  for (const ag of snap.agendamentos) {
    const { lead } = findLead(ag, idx);
    agendamentosComLead.push({ ag, lead: lead ?? null });
    if (!lead) continue;
    const e = enriched.get(lead.id)!;
    e.temAgendamento = true;
    if (ag.compareceu) e.compareceu = true;
  }

  let byEmail = 0;
  let byPhone = 0;
  let byName = 0;
  let unmatched = 0;
  const unattributedVendas: Venda[] = [];
  const vendasComLead: MatchResult['vendasComLead'] = [];
  for (const v of snap.vendas) {
    const { lead, via } = findLead(v, idx);
    vendasComLead.push({ venda: v, lead: lead ?? null });
    if (!lead) {
      unmatched++;
      unattributedVendas.push(v);
      continue;
    }
    if (via === 'email') byEmail++;
    else if (via === 'phone') byPhone++;
    else if (via === 'name') byName++;
    const e = enriched.get(lead.id)!;
    e.temVenda = true;
    e.valorVendaBRL += v.valorBRL;
  }

  return {
    enriched: [...enriched.values()],
    unattributedVendas,
    agendamentosComLead,
    vendasComLead,
    report: { byEmail, byPhone, byName, unmatched, totalVendas: snap.vendas.length },
  };
}
