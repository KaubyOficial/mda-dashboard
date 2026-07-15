# Story 5.3 — Headers + rate limit + logs sem PII

**Epic:** 5 · **Owner:** @dev · **Tamanho:** P · **Status:** ✅ Concluída

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
CSP/HSTS/etc., @fastify/rate-limit, redaction.

## Acceptance Criteria
- [x] Headers presentes; rate limit ativo.

## File List
- `server/src/api/security.ts`
- `server/src/api/server.ts`

## Notas de execução
CSP estrita + HSTS + nosniff + frame-ancestors none + rate-limit 240/min. API já só devolve agregados (zero PII).

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
