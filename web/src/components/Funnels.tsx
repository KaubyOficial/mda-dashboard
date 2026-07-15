import type { CommercialFunnel, MarketingFunnel, FunnelStep } from '../types';
import { fmtCurrency, fmtNumber, fmtRate } from '../format';
import { EmptyHint, Section } from './states';

function FunnelBars({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  if (steps.every((s) => s.value === 0)) return <EmptyHint>Sem dados no período.</EmptyHint>;
  return (
    <div className="space-y-2">
      {steps.map((s, i) => {
        const w = Math.max(4, (s.value / max) * 100);
        return (
          <div key={s.key} className="flex items-center gap-3">
            <div className="w-36 shrink-0 text-sm text-muted">{s.label}</div>
            <div className="relative h-8 flex-1 overflow-hidden rounded-md bg-panel2">
              <div
                className="flex h-full items-center rounded-md bg-gradient-to-r from-gold/80 to-gold px-2 text-sm font-semibold text-ink"
                style={{ width: `${w}%` }}
              >
                {fmtNumber(s.value)}
              </div>
            </div>
            <div className="w-20 shrink-0 text-right text-xs tabular-nums text-muted">
              {i === 0 ? '—' : fmtRate(s.rateFromPrev)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CostRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between rounded-md bg-panel2 px-3 py-2 text-sm">
      <span className="text-muted">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

export function MarketingFunnelView({ funnel }: { funnel: MarketingFunnel }) {
  return (
    <Section title="Funil de marketing" subtitle="taxa = etapa ÷ etapa anterior">
      <div className="card space-y-4">
        <FunnelBars steps={funnel.steps} />
        <div className="grid gap-2 sm:grid-cols-3">
          <CostRow label="CPC" value={funnel.costs.cpc === null ? '—' : fmtCurrency(funnel.costs.cpc, true)} />
          <CostRow
            label="Custo/formulário"
            value={funnel.costs.custoPorFormulario === null ? '—' : fmtCurrency(funnel.costs.custoPorFormulario, true)}
          />
          <CostRow label="CPL" value={funnel.costs.cpl === null ? '—' : fmtCurrency(funnel.costs.cpl, true)} />
        </div>
      </div>
    </Section>
  );
}

export function CommercialFunnelView({ funnel }: { funnel: CommercialFunnel }) {
  return (
    <Section title="Funil comercial" subtitle="taxa = etapa ÷ etapa anterior">
      <div className="card space-y-4">
        <FunnelBars steps={funnel.steps} />
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
