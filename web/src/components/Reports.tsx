import { useState } from 'react';
import type { AnuncioRow, PublicoRow } from '../types';
import { fmtCurrency, fmtNumber, fmtRate } from '../format';
import { EmptyHint, Section } from './states';

interface Col<T> {
  key: keyof T;
  label: string;
  render: (row: T) => string;
  num: (row: T) => number;
}

/** Mostra 10 linhas por vez; o resto fica no scroll do próprio quadro (não estica a página). */
const VISIBLE_ROWS = 10;
const ROW_H = 37;
const HEAD_H = 38;

/** Deixa explícito que há mais linhas do que as 10 visíveis (senão o scroll esconde o resto). */
function rowsHint(total: number, singular: string, plural: string): string {
  const label = `${total} ${total === 1 ? singular : plural}`;
  return total > VISIBLE_ROWS ? `${label} · role o quadro para ver todos` : label;
}

function SortableTable<T>({
  rows,
  cols,
  firstLabel,
  firstField,
}: {
  rows: T[];
  cols: Col<T>[];
  firstLabel: string;
  firstField: keyof T & string;
}) {
  const [sortKey, setSortKey] = useState<keyof T | null>(null);
  const [dir, setDir] = useState<1 | -1>(-1);
  if (rows.length === 0) return <EmptyHint>Sem dados de mídia neste modo (GAP — ver avisos).</EmptyHint>;
  const sorted = sortKey
    ? [...rows].sort((a, b) => {
        const ca = cols.find((c) => c.key === sortKey)!;
        return (ca.num(a) - ca.num(b)) * dir;
      })
    : rows;
  const toggle = (k: keyof T) => {
    if (sortKey === k) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setSortKey(k);
      setDir(-1);
    }
  };
  return (
    <div className="overflow-auto" style={{ maxHeight: VISIBLE_ROWS * ROW_H + HEAD_H }}>
      <table className="w-full border-collapse">
        <thead className="sticky top-0 z-10 bg-panel">
          <tr className="border-b border-line">
            <th className="th">{firstLabel}</th>
            {cols.map((c) => (
              <th
                key={String(c.key)}
                className="th cursor-pointer select-none text-right hover:text-text"
                onClick={() => toggle(c.key)}
              >
                {c.label} {sortKey === c.key ? (dir === 1 ? '▲' : '▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const name = String((row as Record<string, unknown>)[firstField] ?? '');
            return (
            <tr key={i} className="border-b border-line/50 hover:bg-panel2/50">
              {/* nome em 1 linha só: mantém a altura da linha fixa, senão não fecham as 10 visíveis */}
              <td className="td font-medium">
                <div className="max-w-[260px] truncate" title={name}>
                  {name}
                </div>
              </td>
              {cols.map((c) => (
                <td key={String(c.key)} className="td whitespace-nowrap text-right">
                  {c.render(row)}
                </td>
              ))}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ReportPublico({ rows }: { rows: PublicoRow[] }) {
  const cols: Col<PublicoRow>[] = [
    { key: 'impressoes', label: 'Impressões', render: (r) => fmtNumber(r.impressoes), num: (r) => r.impressoes },
    { key: 'cpm', label: 'CPM', render: (r) => (r.cpm === null ? '—' : fmtCurrency(r.cpm, true)), num: (r) => r.cpm ?? -1 },
    { key: 'cliques', label: 'Cliques', render: (r) => fmtNumber(r.cliques), num: (r) => r.cliques },
    { key: 'ctr', label: 'CTR', render: (r) => fmtRate(r.ctr), num: (r) => r.ctr ?? -1 },
    { key: 'leads', label: 'Leads', render: (r) => (r.leads ? fmtNumber(r.leads) : '—'), num: (r) => r.leads },
    { key: 'mornos', label: 'Mornos', render: (r) => (r.mornos ? fmtNumber(r.mornos) : '—'), num: (r) => r.mornos },
    { key: 'mqls', label: 'MQLs', render: (r) => (r.mqls ? fmtNumber(r.mqls) : '—'), num: (r) => r.mqls },
    { key: 'cpl', label: 'CPL', render: (r) => (r.cpl === null ? '—' : fmtCurrency(r.cpl, true)), num: (r) => r.cpl ?? -1 },
    { key: 'custoPorMql', label: 'Custo/MQL', render: (r) => (r.custoPorMql === null ? '—' : fmtCurrency(r.custoPorMql)), num: (r) => r.custoPorMql ?? -1 },
  ];
  return (
    <Section title="Relatório por público" subtitle={rowsHint(rows.length, 'público', 'públicos')}>
      <div className="card">
        <SortableTable rows={rows} cols={cols} firstLabel="Público" firstField="publico" />
      </div>
    </Section>
  );
}

export function ReportAnuncio({ rows }: { rows: AnuncioRow[] }) {
  const cols: Col<AnuncioRow>[] = [
    { key: 'impressoes', label: 'Impressões', render: (r) => fmtNumber(r.impressoes), num: (r) => r.impressoes },
    { key: 'ctr', label: 'CTR', render: (r) => fmtRate(r.ctr), num: (r) => r.ctr ?? -1 },
    { key: 'leadsTotais', label: 'Leads', render: (r) => fmtNumber(r.leadsTotais), num: (r) => r.leadsTotais },
    { key: 'mornos', label: 'Mornos', render: (r) => fmtNumber(r.mornos), num: (r) => r.mornos },
    { key: 'mqls', label: 'MQLs', render: (r) => fmtNumber(r.mqls), num: (r) => r.mqls },
    { key: 'custoPorMql', label: 'Custo/MQL', render: (r) => (r.custoPorMql === null ? '—' : fmtCurrency(r.custoPorMql)), num: (r) => r.custoPorMql ?? -1 },
    { key: 'taxaCliqueForms', label: 'Clique→forms', render: (r) => fmtRate(r.taxaCliqueForms), num: (r) => r.taxaCliqueForms ?? -1 },
  ];
  return (
    <Section
      title="Relatório por anúncio (UTM)"
      subtitle={`atribuição por utm_content · ${rowsHint(rows.length, 'anúncio', 'anúncios')}`}
    >
      <div className="card">
        <SortableTable rows={rows} cols={cols} firstLabel="Anúncio" firstField="anuncio" />
      </div>
    </Section>
  );
}
