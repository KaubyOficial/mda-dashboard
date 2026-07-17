import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import type { LeadsDetail as LeadsDetailData } from '../types';
import { fmtNumber } from '../format';
import { EmptyHint, Section } from './states';

const TEMP_COLORS: Record<string, string> = {
  quente: '#FF6B6B',
  morno: '#FFD300',
  frio: '#4EA8DE',
};
const PALETTE = ['#FFD300', '#37D67A', '#FF6B6B', '#4EA8DE', '#B983FF'];

function Donut({ data }: { data: { name: string; value: number; color: string }[] }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <EmptyHint>Sem leads.</EmptyHint>;
  return (
    <ResponsiveContainer width="100%" height={180}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={45} outerRadius={70} paddingAngle={2}>
          {data.map((d) => (
            <Cell key={d.name} fill={d.color} stroke="#141210" />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: '#1D1A16', border: '1px solid #2A2621', borderRadius: 8 }}
          // Pie não põe `color` no payload do tooltip, e o recharts cai em '#000' — invisível no dark.
          itemStyle={{ color: '#F5F1E8' }}
          formatter={(v: number, n: string) => [fmtNumber(v), n]}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

function Legend({ data }: { data: { name: string; value: number; color: string }[] }) {
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {data.map((d) => (
        <li key={d.name} className="flex items-center justify-between">
          <span className="flex items-center gap-2 capitalize">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: d.color }} />
            {d.name}
          </span>
          <span className="tabular-nums text-muted">{fmtNumber(d.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function LeadsDetail({ data }: { data: LeadsDetailData }) {
  const temp = Object.entries(data.porTemperatura).map(([name, value]) => ({
    name,
    value,
    color: TEMP_COLORS[name] ?? '#8A8375',
  }));
  const origem = Object.entries(data.porOrigem).map(([name, value], i) => ({
    name,
    value,
    color: PALETTE[i % PALETTE.length]!,
  }));
  const pago = [
    { name: 'pago', value: data.pagoVsOrganico.pago, color: '#FFD300' },
    { name: 'orgânico', value: data.pagoVsOrganico.organico, color: '#37D67A' },
  ];
  return (
    <Section title="Detalhe dos leads" subtitle={`${fmtNumber(data.total)} leads`}>
      <div className="grid gap-4 md:grid-cols-3">
        <div className="card">
          <div className="text-xs uppercase tracking-wider text-muted">Temperatura (UTM)</div>
          <Donut data={temp} />
          <Legend data={temp} />
        </div>
        <div className="card">
          <div className="text-xs uppercase tracking-wider text-muted">Origem</div>
          <Donut data={origem} />
          <Legend data={origem} />
        </div>
        <div className="card">
          <div className="text-xs uppercase tracking-wider text-muted">Pago vs Orgânico</div>
          <Donut data={pago} />
          <Legend data={pago} />
        </div>
      </div>
    </Section>
  );
}
