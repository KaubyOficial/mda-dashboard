# Story 2.5 — Sync engine

**Epic:** 2 · **Owner:** @data-engineer · **Tamanho:** M · **Status:** ✅ Concluída

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
Job 20min + POST /api/sync, lock, full refresh idempotente, timestamp/status.

## Acceptance Criteria
- [x] 2 syncs seguidos → mesmos dados; falha de rede mantém cache + flag stale.

## File List
- `server/src/sync/sync.ts`

## Notas de execução
Lock + full-refresh idempotente + sync_runs + isStale. Idempotência provada em teste. Falha → mantém cache e registra erro.

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
