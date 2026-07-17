import type { CommercialFunnel, MarketingFunnel, FunnelStep } from '../types';
import { fmtCurrency } from '../format';
import { EmptyHint, Section } from './states';
import { FunnelShape } from './FunnelShape';

function FunnelBody({
  steps,
  aside,
}: {
  steps: FunnelStep[];
  aside?: (step: FunnelStep, i: number) => string | null;
}) {
  if (steps.every((s) => s.value === 0)) return <EmptyHint>Sem dados no período.</EmptyHint>;
  return <FunnelShape steps={steps} aside={aside} />;
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
