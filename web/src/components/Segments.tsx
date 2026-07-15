import type { SegmentRow } from '../types';
import { fmtCurrency, fmtNumber, fmtRate } from '../format';
import { Section } from './states';

interface RowDef {
  label: string;
  get: (s: SegmentRow) => string;
  /** maior é melhor? pra highlight verde/vermelho por linha */
  higherBetter?: boolean;
  raw: (s: SegmentRow) => number | null;
}

const ROWS: RowDef[] = [
  { label: 'Leads', get: (s) => fmtNumber(s.leads), raw: (s) => s.leads },
  { label: 'Custo/lead', get: (s) => (s.custoPorLead === null ? '—' : fmtCurrency(s.custoPorLead, true)), higherBetter: false, raw: (s) => s.custoPorLead },
  { label: 'Taxa resposta', get: (s) => fmtRate(s.taxaResposta), higherBetter: true, raw: (s) => s.taxaResposta },
  { label: 'Agendamentos', get: (s) => fmtNumber(s.agendamentos), raw: (s) => s.agendamentos },
  { label: 'Taxa agendamento', get: (s) => fmtRate(s.taxaAgendamento), higherBetter: true, raw: (s) => s.taxaAgendamento },
  { label: 'Comparecimentos', get: (s) => fmtNumber(s.comparecimentos), raw: (s) => s.comparecimentos },
  { label: 'Taxa comparecimento', get: (s) => fmtRate(s.taxaComparecimento), higherBetter: true, raw: (s) => s.taxaComparecimento },
  { label: 'Vendas', get: (s) => fmtNumber(s.vendas), higherBetter: true, raw: (s) => s.vendas },
  { label: 'Taxa venda', get: (s) => fmtRate(s.taxaVenda), higherBetter: true, raw: (s) => s.taxaVenda },
  { label: 'Conversão total', get: (s) => fmtRate(s.conversaoTotal), higherBetter: true, raw: (s) => s.conversaoTotal },
  { label: 'Custo/venda', get: (s) => (s.custoPorVenda === null ? '—' : fmtCurrency(s.custoPorVenda)), higherBetter: false, raw: (s) => s.custoPorVenda },
];

function highlight(def: RowDef, val: number | null, all: (number | null)[]): string {
  if (def.higherBetter === undefined || val === null) return '';
  const nums = all.filter((x): x is number => x !== null);
  if (nums.length < 2) return '';
  const best = def.higherBetter ? Math.max(...nums) : Math.min(...nums);
  const worst = def.higherBetter ? Math.min(...nums) : Math.max(...nums);
  if (val === best && best !== worst) return 'text-good font-semibold';
  if (val === worst && best !== worst) return 'text-bad';
  return '';
}

export function Segments({ segments }: { segments: SegmentRow[] }) {
  const order: SegmentRow['segmento'][] = ['MQL', 'Morno', 'Fora do perfil'];
  const cols = order
    .map((seg) => segments.find((s) => s.segmento === seg))
    .filter((s): s is SegmentRow => Boolean(s));
  return (
    <Section title="Segmentos de qualificação" subtitle="MQL · Morno · Fora do perfil">
      <div className="card overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-line">
              <th className="th">Métrica</th>
              {cols.map((c) => (
                <th key={c.segmento} className="th text-right">
                  {c.segmento}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((def) => {
              const raws = cols.map((c) => def.raw(c));
              return (
                <tr key={def.label} className="border-b border-line/50">
                  <td className="td text-muted">{def.label}</td>
                  {cols.map((c, i) => (
                    <td key={c.segmento} className={`td text-right ${highlight(def, raws[i]!, raws)}`}>
                      {def.get(c)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
