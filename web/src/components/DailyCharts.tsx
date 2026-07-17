import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DailyPoint } from '../types';
import { fmtCurrency, fmtDayShort, fmtNumber } from '../format';
import { EmptyHint, Section } from './states';

const AXIS = { stroke: '#8A8375', fontSize: 11 };
const GRID = '#2A2621';

function tooltipStyle() {
  return {
    contentStyle: {
      background: '#1D1A16',
      border: '1px solid #2A2621',
      borderRadius: 8,
      color: '#F5F1E8',
    },
    labelStyle: { color: '#8A8375' },
  };
}

export function DailyCharts({ daily, roas }: { daily: DailyPoint[]; roas: number }) {
  const hasInvest = daily.some((d) => d.investimento > 0);
  const hasLeads = daily.some((d) => d.leads > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section title="Diário — Leads & CPL">
        <div className="card h-72">
          {!hasLeads ? (
            <EmptyHint>Sem leads no período.</EmptyHint>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={daily} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDayShort} {...AXIS} />
                <YAxis yAxisId="l" {...AXIS} />
                <YAxis yAxisId="r" orientation="right" {...AXIS} />
                <Tooltip
                  {...tooltipStyle()}
                  labelFormatter={fmtDayShort}
                  formatter={(v: number, n: string) =>
                    n === 'CPL' ? [fmtCurrency(v, true), n] : [fmtNumber(v), n]
                  }
                />
                <Bar yAxisId="l" dataKey="leads" name="Leads" fill="#FFD300" radius={[3, 3, 0, 0]} />
                <Line
                  yAxisId="r"
                  type="monotone"
                  dataKey="cpl"
                  name="CPL"
                  stroke="#37D67A"
                  dot={false}
                  strokeWidth={2}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </Section>

      <Section title="Diário — Investimento & Vendas" subtitle={`ROAS médio: ${roas.toFixed(2)}×`}>
        <div className="card h-72">
          {!hasInvest ? (
            <EmptyHint>Sem dados de mídia neste modo (GAP — ver avisos).</EmptyHint>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={daily} margin={{ top: 8, right: 8, bottom: 4, left: -8 }}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="date" tickFormatter={fmtDayShort} {...AXIS} />
                <YAxis {...AXIS} tickFormatter={(v: number) => fmtCurrency(v)} width={64} />
                <Tooltip
                  {...tooltipStyle()}
                  labelFormatter={fmtDayShort}
                  formatter={(v: number, n: string) => [fmtCurrency(v), n]}
                />
                <ReferenceLine y={0} stroke={GRID} />
                <Bar dataKey="investimento" name="Investimento" fill="#FF6B6B" radius={[3, 3, 0, 0]} />
                <Bar dataKey="faturamento" name="Vendas (R$)" fill="#37D67A" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Section>
    </div>
  );
}
