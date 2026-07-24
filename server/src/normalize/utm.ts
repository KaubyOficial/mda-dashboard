import type { Origem, PagoOrganico, Temperatura, UtmSet } from '../domain/entities.js';
import { unescapeCell } from '../util/parse.js';

interface UtmRule {
  when: { field: keyof UtmSet; contains: string };
  origin?: Origem;
}
interface PagoOrganicoRule {
  when: { field: keyof UtmSet; contains: string };
  value: PagoOrganico;
}
export interface UtmMap {
  origin_rules: UtmRule[];
  default_origin: Origem;
  pago_organico_rules: {
    rules: PagoOrganicoRule[];
    default: PagoOrganico;
  };
}

function fieldVal(utm: UtmSet, field: keyof UtmSet): string {
  return unescapeCell(utm[field] ?? '').toLowerCase();
}

/**
 * Temperatura NÃO vem mais de regras de UTM (Kauê 2026-07-24): todo tráfego pago manda
 * term=quente (100% quente hoje) e orgânico que virou lead é NO MÍNIMO morno. Não existe
 * sinal na UTM que meça "frio" de verdade — as regras antigas por medium marcavam a maioria
 * do orgânico como frio no chute.
 */
export function mapTemperatura(pagoOrganico: PagoOrganico): Temperatura {
  return pagoOrganico === 'pago' ? 'quente' : 'morno';
}

export function mapOrigem(utm: UtmSet, map: UtmMap): Origem {
  for (const r of map.origin_rules) {
    if (r.origin && fieldVal(utm, r.when.field).includes(r.when.contains.toLowerCase())) {
      return r.origin;
    }
  }
  return map.default_origin;
}

/**
 * Pago × orgânico. Precedência:
 * 1. Coluna 'ORGANICO OU PAGO?' com 'pago'/'organico' explícito (fluxo n8n velho) — vence sempre.
 * 2. Regras da UTM em ordem (source primeiro: é o sinal mais forte — FacebookADS=pago, ig=orgânico;
 *    um source pago com term contraditório continua pago).
 * 3. Coluna com o utm_term CRU (fluxo n8n novo, 2026-07-22+): a semântica do funil (Kauê
 *    2026-07-24) é term 'quente' = tráfego pago e 'frio' = orgânico — o term NÃO mede temperatura
 *    (todo pago viria 'quente'; a temperatura do orgânico fica indefinida).
 */
export function mapPagoOrganico(
  utm: UtmSet,
  rawColumn: string | null | undefined,
  map: UtmMap,
): PagoOrganico {
  const col = unescapeCell(rawColumn ?? '').toLowerCase();
  if (col.includes('pago')) return 'pago';
  if (col.includes('org')) return 'organico'; // orgânico / organico
  for (const r of map.pago_organico_rules.rules) {
    if (fieldVal(utm, r.when.field).includes(r.when.contains.toLowerCase())) return r.value;
  }
  if (col === 'quente') return 'pago';
  if (col === 'frio') return 'organico';
  return map.pago_organico_rules.default;
}
