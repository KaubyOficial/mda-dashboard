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
  /** eventos que tinham homônimo na LEADS, mas só criado DEPOIS do evento (guarda de data) */
  nomeRejeitadoPorData: { agendamentos: number; vendas: number };
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
  /** nome → TODOS os leads homônimos, na ordem da aba (o desempate precisa da data). */
  byName: Map<string, Lead[]>;
}

function indexLeads(leads: Lead[]): LeadIndex {
  const byEmail = new Map<string, Lead>();
  const byPhone = new Map<string, Lead>();
  const byName = new Map<string, Lead[]>();
  for (const l of leads) {
    if (l.emailKey && !byEmail.has(l.emailKey)) byEmail.set(l.emailKey, l);
    if (l.phoneKey && !byPhone.has(l.phoneKey)) byPhone.set(l.phoneKey, l);
    if (l.nameKey) {
      const arr = byName.get(l.nameKey);
      if (arr) arr.push(l);
      else byName.set(l.nameKey, [l]);
    }
  }
  return { byEmail, byPhone, byName };
}

/**
 * GUARDA DE DATA no fallback por NOME (2026-08-12): só casa com lead que já existia na data
 * do evento. E-mail e telefone são identidade forte e casam sempre; nome não é — nas linhas
 * de 2025 a aba VENDAS traz só o primeiro nome ("rafael", "pedro"), e sem essa guarda a venda
 * grudava no primeiro homônimo da aba, às vezes um lead criado MESES DEPOIS da venda.
 * Medido no dado real: 26 de 148 vendas casadas eram desse tipo — uma delas jogava uma venda
 * de 26/09/2025 dentro dos segmentos de agosto/2026. Entre os homônimos elegíveis vence o
 * primeiro da aba (ordem cronológica), que é o que o índice já devolvia.
 */
function findLead(
  rec: { emailKey: string; phoneKey: string; nameKey: string; date: string },
  idx: LeadIndex,
): { lead: Lead | undefined; via: 'email' | 'phone' | 'name' | 'none'; rejeitadoPorData?: true } {
  if (rec.emailKey && idx.byEmail.has(rec.emailKey)) return { lead: idx.byEmail.get(rec.emailKey)!, via: 'email' };
  if (rec.phoneKey && idx.byPhone.has(rec.phoneKey)) return { lead: idx.byPhone.get(rec.phoneKey)!, via: 'phone' };
  if (rec.nameKey) {
    const homonimos = idx.byName.get(rec.nameKey) ?? [];
    const lead = homonimos.find((l) => !l.date || !rec.date || l.date <= rec.date);
    if (lead) return { lead, via: 'name' };
    if (homonimos.length > 0) return { lead: undefined, via: 'none', rejeitadoPorData: true };
  }
  return { lead: undefined, via: 'none' };
}

/**
 * Casa agendamentos e vendas aos leads pela mesma cadeia: e-mail → telefone → nome.
 * Na aba VENDAS o e-mail é o do CHECKOUT: casa quando o comprador usou o mesmo do formulário,
 * senão não casa com nada. O telefone (coluna `Phone`, escrita pelo n8n desde 2026-08-03) é o
 * que resgata esses casos — linhas anteriores à coluna não têm telefone e seguem caindo em
 * nome/não atribuído.
 * O fallback por nome só aceita lead que já existia na data do evento (ver `findLead`).
 * Venda sem lead casado → bucket "não atribuído": entra no faturamento total, fora dos segmentos (§2.4).
 */
export function enrichLeads(snap: DataSnapshot): MatchResult {
  const idx = indexLeads(snap.leads);
  const enriched = new Map<string, EnrichedLead>();
  for (const l of snap.leads) {
    enriched.set(l.id, { ...l, temAgendamento: false, compareceu: false, temVenda: false, valorVendaBRL: 0 });
  }

  const nomeRejeitadoPorData = { agendamentos: 0, vendas: 0 };

  const agendamentosComLead: MatchResult['agendamentosComLead'] = [];
  for (const ag of snap.agendamentos) {
    const { lead, rejeitadoPorData } = findLead(ag, idx);
    agendamentosComLead.push({ ag, lead: lead ?? null });
    if (rejeitadoPorData) nomeRejeitadoPorData.agendamentos++;
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
    const { lead, via, rejeitadoPorData } = findLead(v, idx);
    vendasComLead.push({ venda: v, lead: lead ?? null });
    if (rejeitadoPorData) nomeRejeitadoPorData.vendas++;
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
    report: {
      byEmail,
      byPhone,
      byName,
      unmatched,
      totalVendas: snap.vendas.length,
      nomeRejeitadoPorData,
    },
  };
}
