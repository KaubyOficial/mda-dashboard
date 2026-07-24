import type { CommercialFunnel, FunilPagoOrganico, MarketingFunnel, FunnelStep, SplitFunnel } from '../types';
import { fmtCurrency, fmtNumber, fmtRate } from '../format';
import { EmptyHint, Section } from './states';
import { FunnelShape } from './FunnelShape';

function FunnelBody({
  steps,
  aside,
  color,
}: {
  steps: FunnelStep[];
  aside?: (step: FunnelStep, i: number) => string | null;
  color?: string;
}) {
  if (steps.every((s) => s.value === 0)) return <EmptyHint>Sem dados no período.</EmptyHint>;
  return <FunnelShape steps={steps} aside={aside} color={color} />;
}

function CostRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 rounded-md bg-panel2 px-3 py-2 text-sm">
      <span className="truncate text-muted">{label}</span>
      <span className="shrink-0 tabular-nums">{value}</span>
    </div>
  );
}

export function MarketingFunnelView({ funnel }: { funnel: MarketingFunnel }) {
  // custo unitário ao lado da etapa que ele mede (como no funil de referência)
  const custoPorEtapa = (s: FunnelStep): string | null => {
    if (s.key === 'cliques' && funnel.costs.cpc !== null) return `CPC ${fmtCurrency(funnel.costs.cpc, true)}`;
    if (s.key === 'leads' && funnel.costs.cpl !== null) return `CPL ${fmtCurrency(funnel.costs.cpl, true)}`;
    return null;
  };
  return (
    <Section title="Funil de marketing" subtitle="taxa = etapa ÷ etapa anterior">
      <div className="card space-y-4">
        <FunnelBody steps={funnel.steps} aside={custoPorEtapa} />
        <div className="grid gap-2 sm:grid-cols-2">
          <CostRow label="CPC" value={funnel.costs.cpc === null ? '—' : fmtCurrency(funnel.costs.cpc, true)} />
          <CostRow label="CPL" value={funnel.costs.cpl === null ? '—' : fmtCurrency(funnel.costs.cpl, true)} />
        </div>
      </div>
    </Section>
  );
}

// cores próprias pra não confundir com os funis dourados de cima (pedido 2026-07-24):
// pago = vermelho (mesma família do "quente"), orgânico = azul.
const SPLIT_COLORS = { pago: '#FF6B6B', organico: '#4EA8DE' } as const;

function SplitFunnelCard({
  title,
  funnel,
  color,
}: {
  title: string;
  funnel: SplitFunnel;
  color: string;
}) {
  const nLeads = funnel.steps[0]?.value ?? 0;
  return (
    <div className="card space-y-4">
      <div className="flex items-baseline justify-between">
        <div className="text-xs font-semibold uppercase tracking-wider" style={{ color }}>
          {title}
        </div>
        <div className="text-xs text-muted">{fmtNumber(nLeads)} leads</div>
      </div>
      <FunnelBody steps={funnel.steps} color={color} />
      <CostRow label="Conversão lead→venda" value={fmtRate(funnel.conversaoTotal)} />
    </div>
  );
}

/**
 * Mesmo funil comercial (etapas contadas pela data do evento), recortado pela origem do lead
 * casado — pago + orgânico + "não atribuído" = funil comercial geral. O balde não atribuído
 * (evento sem lead casado, origem indecidível) aparece como nota pra soma sempre fechar à vista.
 */
export function PagoOrganicoFunnelView({ data }: { data: FunilPagoOrganico }) {
  const na = data.naoAtribuido;
  const temNa = na.agendamentos > 0 || na.vendas > 0;
  return (
    <Section
      title="Funil pago × orgânico"
      subtitle="mesmas etapas do funil comercial, separadas pela origem do lead"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <SplitFunnelCard title="Pago" funnel={data.pago} color={SPLIT_COLORS.pago} />
        <SplitFunnelCard title="Orgânico" funnel={data.organico} color={SPLIT_COLORS.organico} />
      </div>
      {temNa && (
        <p className="text-xs text-muted">
          Fora dos dois funis por falta de lead casado (não dá pra saber se é pago ou orgânico):{' '}
          <span className="tabular-nums text-text/80">
            {fmtNumber(na.agendamentos)} agendamento(s) · {fmtNumber(na.comparecimentos)}{' '}
            comparecimento(s) · {fmtNumber(na.vendas)} venda(s)
          </span>
          . Eles seguem contados no funil comercial geral — pago + orgânico + estes = o total.
        </p>
      )}
    </Section>
  );
}

export function CommercialFunnelView({ funnel }: { funnel: CommercialFunnel }) {
  const custoPorEtapa = (s: FunnelStep): string | null => {
    if (s.key === 'agendamentos' && funnel.custoPorAgendamento !== null)
      return `${fmtCurrency(funnel.custoPorAgendamento, true)}/agend.`;
    if (s.key === 'vendas' && funnel.custoPorVenda !== null) return `CAC ${fmtCurrency(funnel.custoPorVenda)}`;
    return null;
  };
  return (
    <Section title="Funil comercial" subtitle="taxa = etapa ÷ etapa anterior">
      <div className="card space-y-4">
        <FunnelBody steps={funnel.steps} aside={custoPorEtapa} />
        <div className="grid gap-2 sm:grid-cols-3">
          <CostRow label="Ticket médio" value={funnel.ticketMedio === null ? '—' : fmtCurrency(funnel.ticketMedio)} />
          <CostRow
            label="Custo/agendamento"
            value={funnel.custoPorAgendamento === null ? '—' : fmtCurrency(funnel.custoPorAgendamento, true)}
          />
          <CostRow label="Custo/venda" value={funnel.custoPorVenda === null ? '—' : fmtCurrency(funnel.custoPorVenda)} />
        </div>
      </div>
    </Section>
  );
}
