import type { Origem, PagoOrganico, Temperatura, UtmSet } from '../domain/entities.js';
import { unescapeCell } from '../util/parse.js';

interface UtmRule {
  when: { field: keyof UtmSet; contains: string };
  temperature?: Temperatura;
  origin?: Origem;
}
export interface UtmMap {
  temperature_rules: UtmRule[];
  default_temperature: Temperatura;
  origin_rules: UtmRule[];
  default_origin: Origem;
  paid_rules: {
    paid_sources_contains: string[];
    organic_sources_contains: string[];
  };
}

function fieldVal(utm: UtmSet, field: keyof UtmSet): string {
  return unescapeCell(utm[field] ?? '').toLowerCase();
}

export function mapTemperatura(utm: UtmSet, map: UtmMap): Temperatura {
  for (const r of map.temperature_rules) {
    if (r.temperature && fieldVal(utm, r.when.field).includes(r.when.contains.toLowerCase())) {
      return r.temperature;
    }
  }
  return map.default_temperature;
}

export function mapOrigem(utm: UtmSet, map: UtmMap): Origem {
  for (const r of map.origin_rules) {
    if (r.origin && fieldVal(utm, r.when.field).includes(r.when.contains.toLowerCase())) {
      return r.origin;
    }
  }
  return map.default_origin;
}

/** Coluna 'ORGANICO OU PAGO?' vence quando presente; senão, fallback pelas regras de source. */
export function mapPagoOrganico(
  utm: UtmSet,
  rawColumn: string | null | undefined,
  map: UtmMap,
): PagoOrganico {
  const col = unescapeCell(rawColumn ?? '').toLowerCase();
  if (col.includes('pago')) return 'pago';
  if (col.includes('org')) return 'organico'; // orgânico / organico
  const src = fieldVal(utm, 'source');
  if (map.paid_rules.paid_sources_contains.some((s) => src.includes(s.toLowerCase()))) return 'pago';
  if (map.paid_rules.organic_sources_contains.some((s) => src.includes(s.toLowerCase())))
    return 'organico';
  return 'organico';
}
