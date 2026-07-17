import type { Kpi } from '../types';
import { fmtValue } from '../format';

function DeltaBadge({ kpi }: { kpi: Kpi }) {
  const { delta } = kpi;
  if (delta.improved === null) {
    return <span className="text-xs text-muted">— sem variação</span>;
  }
  const up = delta.abs > 0;
  const color = delta.improved ? 'text-good' : 'text-bad';
  const arrow = up ? '▲' : '▼';
  const pct = delta.pct === null ? 'novo' : `${Math.abs(delta.pct).toFixed(0)}%`;
  const absTxt = fmtValue(Math.abs(delta.abs), kpi.format);
  return (
    <span className={`text-xs font-semibold ${color}`} title={`vs período anterior: ${fmtValue(delta.previous, kpi.format)}`}>
      {arrow} {pct} <span className="font-normal text-muted">({absTxt})</span>
    </span>
  );
}

export function KpiHero({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {kpis.map((k) => (
        <div key={k.key} className="card group relative" title={k.formula}>
          <div className="text-xs uppercase tracking-wider text-muted">{k.label}</div>
          <div className="mt-1 font-display text-2xl font-bold text-text">
            {fmtValue(k.value, k.format)}
          </div>
          <div className="mt-2">
            <DeltaBadge kpi={k} />
          </div>
          <div className="pointer-events-none absolute inset-x-0 bottom-full z-10 mb-1 hidden rounded-md border border-line bg-panel2 p-2 text-[11px] text-muted group-hover:block">
            {k.formula}
          </div>
        </div>
      ))}
    </div>
  );
}
