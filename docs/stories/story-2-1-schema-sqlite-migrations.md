# Story 2.1 — Schema SQLite + migrations

**Epic:** 2 · **Owner:** @data-engineer · **Tamanho:** M · **Status:** ✅ Concluída

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
Tabelas leads/agendamentos/vendas/midia_*/sync_runs/match_report. Índices por data.

## Acceptance Criteria
- [x] Migrations idempotentes; schema documentado.

## File List
- `server/src/db/schema.ts`
- `server/src/db/db.ts`

## Notas de execução
node:sqlite (regra de memória — NÃO better-sqlite3). Índices por data criados.

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
