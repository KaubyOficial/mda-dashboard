# Story 3.1 — API base + validação de range

**Epic:** 3 · **Owner:** @dev · **Tamanho:** M · **Status:** ✅ Concluída

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
GET /api/metrics?from&to, validação, fuso America/Sao_Paulo, cache por range invalidado no sync.

## Acceptance Criteria
- [x] Range inválido → 400; cache em memória por (range|preset).

## File List
- `server/src/api/server.ts`
- `server/src/metrics/period.ts`

## Notas de execução
Validação retorna 400 (verificado). Cache versionado por sync.

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
