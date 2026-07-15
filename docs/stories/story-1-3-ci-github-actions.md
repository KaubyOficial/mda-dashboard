# Story 1.3 — CI (GitHub Actions)

**Epic:** 1 · **Owner:** @devops · **Tamanho:** P · **Status:** ✅ Concluída

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
lint + typecheck + testes + npm audit + secret scanning a cada push.

## Acceptance Criteria
- [x] Pipeline verde; PR sem checks não mergeia.

## File List
- `.github/workflows/ci.yml`

## Notas de execução
Workflow criado. Repo KaubyOficial/mda-dashboard ainda não inicializado (git init + push = tarefa quando o Kauê quiser versionar).

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
