# Story 3.9 — Golden tests de métricas

**Epic:** 3 · **Owner:** @qa · **Tamanho:** G · **Status:** ✅ Concluída

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
Teste por métrica + golden contra valores calculados à mão; edge cases.

## Acceptance Criteria
- [x] 100% das métricas com golden; mutação quebra o teste.

## File List
- `server/test/metrics.test.ts`
- `server/test/fixtures.ts`
- `server/test/units.test.ts`
- `server/test/db.test.ts`

## Notas de execução
21 testes verdes incl. teste de sensibilidade (mutação de venda). Edge cases: div/0, 1 dia, range futuro.

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
