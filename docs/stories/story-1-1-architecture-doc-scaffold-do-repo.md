# Story 1.1 — Architecture doc + scaffold do repo

**Epic:** 1 · **Owner:** @architect · **Tamanho:** M · **Status:** ✅ Concluída

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
Monorepo server/web/config/docs, TS strict, ESLint/Prettier, testes, DataSource pluggable.

## Acceptance Criteria
- [x] lint, typecheck, test verdes no esqueleto.
- [x] Interface DataSource documentada com contrato das 6 entidades.

## File List
- `package.json`
- `tsconfig.base.json`
- `eslint.config.js`
- `docs/architecture.md`
- `server/src/domain/entities.ts`
- `server/src/datasource/DataSource.ts`

## Notas de execução
Testes via node:test (nativo) em vez de vitest — mais leve, mesmo objetivo; `npm test` verde (21 testes).

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
