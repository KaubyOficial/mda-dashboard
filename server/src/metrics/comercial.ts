import { existsSync } from 'node:fs';
import { readJson } from '../config.js';
import type { DataSnapshot, LeadComercial, Venda } from '../domain/entities.js';
import type { ComercialSection, ComercialVendedorRow, Range } from '../domain/metrics.js';
import { isInRange } from './period.js';
import { safeDiv } from './helpers.js';

/**
 * Seção Comercial (pedido Kauê 2026-08-07): vendas fechadas pelos vendedores do comercial
 * (leo, gabriel…), atribuídas pela UTM DO CHECKOUT — não pelo lead casado. O lead diz de onde a
 * PESSOA veio; a UTM da venda diz POR QUAL LINK ela comprou (caso real: Samuel virou lead
 * orgânico em março e comprou em julho pelo link do leo). gui fica FORA: o link dele existe,
 * mas é o funil do forms (decisão Kauê 2026-08-07).
 *
 * Em paralelo, a lista de leads do vendedor (aba LEADS COMERCIAL) dá a conversão do mês e o
 * cruzamento de auditoria: venda de alguém DA LISTA sem a UTM do vendedor = vendeu sem o link
 * rastreado (o alerta existe exatamente pra garantir o uso do link).
 */

export interface VendedorConfig {
  /** utm_medium do link rastreado (minúsculo). */
  slug: string;
  nome: string;
  /** % do vendedor sobre o faturamento líquido Cakto das vendas dele; null = não configurada. */
  comissaoPct: number | null;
}

export interface ComercialConfig {
  vendedores: VendedorConfig[];
  /** mediums de pessoa-que-vende que NÃO entram na seção (ex.: gui = funil do forms). */
  foraDaSecao: string[];
}

/** Config OPCIONAL — sem o arquivo, a seção aparece vazia com aviso de configuração. */
export function loadComercialConfig(path: string): ComercialConfig | null {
  if (!path || !existsSync(path)) return null;
  const raw = readJson<Partial<ComercialConfig>>(path);
  return {
    vendedores: (raw.vendedores ?? []).map((v) => ({
      slug: String(v.slug ?? '').trim().toLowerCase(),
      nome: String(v.nome ?? v.slug ?? '').trim(),
      comissaoPct: v.comissaoPct == null ? null : Number(v.comissaoPct),
    })),
    foraDaSecao: (raw.foraDaSecao ?? []).map((s) => String(s).trim().toLowerCase()),
  };
}

/**
 * A qual vendedor a VENDA pertence, pela UTM do checkout. utm_medium é a fonte primária
 * (o padrão dos links é utm_medium=<slug>); o sck entra de fallback pra linha backfillada
 * que só tenha SCK — o utm_content dos links é `comercial-<slug>`, que aparece literal no sck.
 */
function vendedorDaVenda(v: Venda, slugs: string[]): string | null {
  const medium = (v.utmMedium ?? '').trim().toLowerCase();
  if (medium) return slugs.includes(medium) ? medium : null;
  const sck = (v.sck ?? '').toLowerCase();
  if (sck) {
    for (const s of slugs) if (sck.includes(`comercial-${s}`)) return s;
  }
  return null;
}

/** A venda tem QUALQUER registro de UTM do checkout (pra medir cobertura do histórico). */
function temUtm(v: Venda): boolean {
  return Boolean(v.utmSource || v.utmMedium || v.sck);
}

interface ListaIndex {
  byEmail: Map<string, LeadComercial>;
  byPhone: Map<string, LeadComercial>;
  byName: Map<string, LeadComercial>;
}

function indexLista(lista: LeadComercial[]): ListaIndex {
  const byEmail = new Map<string, LeadComercial>();
  const byPhone = new Map<string, LeadComercial>();
  const byName = new Map<string, LeadComercial>();
  for (const lc of lista) {
    if (lc.emailKey && !byEmail.has(lc.emailKey)) byEmail.set(lc.emailKey, lc);
    if (lc.phoneKey && !byPhone.has(lc.phoneKey)) byPhone.set(lc.phoneKey, lc);
    if (lc.nameKey && !byName.has(lc.nameKey)) byName.set(lc.nameKey, lc);
  }
  return { byEmail, byPhone, byName };
}

/** Mesma cadeia do casamento venda↔lead do resto do dashboard: e-mail → telefone → nome. */
function findNaLista(v: Venda, idx: ListaIndex): LeadComercial | null {
  if (v.emailKey && idx.byEmail.has(v.emailKey)) return idx.byEmail.get(v.emailKey)!;
  if (v.phoneKey && idx.byPhone.has(v.phoneKey)) return idx.byPhone.get(v.phoneKey)!;
  if (v.nameKey && idx.byName.has(v.nameKey)) return idx.byName.get(v.nameKey)!;
  return null;
}

export function computeComercial(
  snap: DataSnapshot,
  range: Range,
  cfg: ComercialConfig | null,
  warnings: string[],
): ComercialSection {
  if (!cfg || cfg.vendedores.length === 0) {
    return {
      configurado: false,
      vendedores: [],
      vendasSemLinkRastreado: [],
      mediumsDesconhecidos: [],
      cobertura: { comUtm: 0, total: 0 },
    };
  }

  const slugs = cfg.vendedores.map((v) => v.slug);
  const fora = new Set(cfg.foraDaSecao);
  const vendasRange = snap.vendas.filter((v) => isInRange(v.date, range));
  const idx = indexLista(snap.leadsComercial);

  // lead da lista entra no período pela DATA em que entrou na lista; sem data → todo período
  const listaRange = snap.leadsComercial.filter((lc) => lc.date === '' || isInRange(lc.date, range));

  const porVendedor = new Map<string, { vendas: number; faturamento: number }>();
  const semLink: ComercialSection['vendasSemLinkRastreado'] = [];
  const mediumsDesconhecidos = new Set<string>();
  let comUtm = 0;

  for (const v of vendasRange) {
    if (temUtm(v)) comUtm++;
    const dono = vendedorDaVenda(v, slugs);
    if (dono) {
      const cur = porVendedor.get(dono) ?? { vendas: 0, faturamento: 0 };
      cur.vendas++;
      cur.faturamento += v.valorBRL;
      porVendedor.set(dono, cur);
    }

    // medium com cara de comercial mas fora da config = vendedor novo sem link cadastrado
    const medium = (v.utmMedium ?? '').trim().toLowerCase();
    const source = (v.utmSource ?? '').trim().toLowerCase();
    if (source === 'comercial' && medium && !slugs.includes(medium) && !fora.has(medium)) {
      mediumsDesconhecidos.add(medium);
    }

    // AUDITORIA: comprador que está na LISTA de um vendedor mas a venda não veio marcada com a
    // UTM dele → vendeu sem o link rastreado (ou com o link de outro). É o alerta central da
    // seção — sem ele, venda sem link some da atribuição e ninguém percebe.
    const naLista = findNaLista(v, idx);
    if (naLista && naLista.vendedor && slugs.includes(naLista.vendedor) && dono !== naLista.vendedor) {
      semLink.push({
        vendedor: cfg.vendedores.find((c) => c.slug === naLista.vendedor)?.nome ?? naLista.vendedor,
        date: v.date,
        valorBRL: v.valorBRL,
        utmDaVenda: dono ?? ((v.utmMedium ?? '').trim() || null),
      });
    }
  }

  if (mediumsDesconhecidos.size > 0) {
    warnings.push(
      `COMERCIAL: venda(s) no período com utm_source=Comercial e medium fora da config (${[...mediumsDesconhecidos].join(', ')}) — vendedor novo? Cadastrar em config/comercial.json para entrar na seção.`,
    );
  }

  const vendedores = cfg.vendedores.map((vc): ComercialVendedorRow => {
    const agg = porVendedor.get(vc.slug) ?? { vendas: 0, faturamento: 0 };
    const leadsLista = listaRange.filter((lc) => lc.vendedor === vc.slug).length;
    const comissaoBRL =
      vc.comissaoPct == null ? null : (agg.faturamento * vc.comissaoPct) / 100;
    return {
      vendedor: vc.nome,
      slug: vc.slug,
      leadsLista,
      vendas: agg.vendas,
      conversao: safeDiv(agg.vendas, leadsLista),
      faturamentoBruto: agg.faturamento,
      comissaoPct: vc.comissaoPct,
      comissaoBRL,
      liquidoBRL: comissaoBRL == null ? null : agg.faturamento - comissaoBRL,
    };
  });

  return {
    configurado: true,
    vendedores,
    vendasSemLinkRastreado: semLink,
    mediumsDesconhecidos: [...mediumsDesconhecidos].sort(),
    cobertura: { comUtm, total: vendasRange.length },
  };
}
