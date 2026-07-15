# Story 0.2 — Mapear UTMs reais → temperatura e origem

**Epic:** 0 · **Owner:** @analyst · **Tamanho:** M · **Status:** ✅ Concluída

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
Extrair valores distintos de utm_* e propor mapeamento UTM→temperatura e UTM→origem + pago/orgânico.

## Acceptance Criteria
- [x] 100% dos leads classificados nos dois eixos.
- [x] Mapeamento em config versionada editável sem deploy.

## File List
- `config/utm-map.json`
- `server/src/normalize/utm.ts`
- `server/test/units.test.ts`

## Notas de execução
utm-map.json ancorado + VALIDADO nos dados reais: quente 2.681 · frio 1.883 · morno 617; origem anúncio 4.059/orgânico 1.060/bio 52. Corrigido bug de field-name (medium/source, não utm_medium) + teste de regressão. Validar buckets finais com o Kauê.

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
