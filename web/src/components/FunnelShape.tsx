import type { FunnelStep } from '../types';
import { fmtNumber, fmtRate } from '../format';

/**
 * Desenho de funil de verdade: cada etapa é um trapézio centralizado cuja borda
 * de baixo encosta na largura da etapa seguinte, formando um funil contínuo.
 *
 * As larguras são % do container (não da própria faixa), então uma etapa MAIOR que
 * a anterior alarga corretamente em vez de ser cortada — acontece com dado real
 * (ex.: forms finalizados > iniciados quando o pixel dispara fora de ordem).
 */

/**
 * Larguras em % do container: afunilam por ETAPA (largura decrescente constante),
 * não por magnitude — igual ao funil de referência.
 *
 * Motivo: o topo é ordens de grandeza maior que a base (impressões ~2,1M vs leads
 * ~5,2k = 400×). Em largura proporcional, tudo abaixo do 1º degrau encosta no piso
 * e vira uma coluna reta — deixa de ler como funil. A magnitude está no número
 * dentro da faixa e a queda real está na taxa % ao lado.
 */
const TOP_W = 100;
const BOT_W = 34;
function widths(steps: FunnelStep[]): number[] {
  const n = steps.length;
  if (n === 1) return [TOP_W];
  return steps.map((_, i) => TOP_W - (TOP_W - BOT_W) * (i / (n - 1)));
}

const BAND_H = 44;
const GAP = 4;

export function FunnelShape({
  steps,
  aside,
}: {
  steps: FunnelStep[];
  aside?: (step: FunnelStep, i: number) => string | null;
}) {
  const w = widths(steps);

  return (
    <div className="w-full">
      {steps.map((s, i) => {
        const top = w[i]!;
        // fecha o bico na última etapa; caso contrário encosta na largura da próxima
        const bottom = i === steps.length - 1 ? top * 0.75 : w[i + 1]!;
        const poly = `polygon(${50 - top / 2}% 0, ${50 + top / 2}% 0, ${50 + bottom / 2}% 100%, ${50 - bottom / 2}% 100%)`;
        const asideTxt = aside?.(s, i) ?? null;
        // etapa maior que a anterior (taxa > 100%): a silhueta não mostra isso, então sinaliza no número
        const grew = i > 0 && s.rateFromPrev !== null && s.rateFromPrev > 1;
        // taxa suprimida no servidor por depender de etapa subcontada
        const incomparavel = i > 0 && s.rateFromPrev === null && (s.partial === true || steps[i - 1]?.partial === true);
        return (
          <div key={s.key} className="flex items-center gap-3" style={{ marginBottom: i < steps.length - 1 ? GAP : 0 }}>
            {/* etapa */}
            <div className="w-28 shrink-0 text-right sm:w-36">
              <div className="truncate text-xs text-muted" title={s.label}>
                {s.label}
              </div>
            </div>

            {/* trapézio — etapa parcial fica hachurada pra não passar por número fechado */}
            <div
              className={`relative flex flex-1 items-center justify-center ${
                s.partial ? 'bg-gold/50' : 'bg-gradient-to-b from-gold to-gold/80'
              }`}
              style={{ height: BAND_H, clipPath: poly }}
              title={s.partial ? 'Etapa subcontada: o campo não foi rastreado em parte do período (ver avisos)' : undefined}
            >
              <span className="font-display text-sm font-bold tabular-nums text-ink">
                {fmtNumber(s.value)}
                {s.partial ? <span className="ml-1 font-normal opacity-70">parcial</span> : null}
              </span>
            </div>

            {/* taxa vs etapa anterior + custo unitário */}
            <div className="w-24 shrink-0 sm:w-32">
              <div
                className={`text-xs font-semibold tabular-nums ${grew ? 'text-gold' : incomparavel ? 'text-muted' : 'text-good'}`}
                title={
                  incomparavel
                    ? 'Taxa não comparável: depende de uma etapa subcontada no período (ver avisos)'
                    : grew
                      ? 'Etapa maior que a anterior — o desenho afunila por etapa, veja os números'
                      : undefined
                }
              >
                {i === 0 ? '—' : incomparavel ? 'n/d' : fmtRate(s.rateFromPrev)}
                {grew ? ' ↑' : ''}
              </div>
              {asideTxt && <div className="truncate text-[11px] tabular-nums text-muted">{asideTxt}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
