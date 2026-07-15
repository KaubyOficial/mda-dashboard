# Story 5.2 — Validação JWT no app

**Epic:** 5 · **Owner:** @dev · **Tamanho:** M · **Status:** ✅ Concluída

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
Middleware Fastify validando Cf-Access-Jwt-Assertion (JWKS, aud, exp).

## Acceptance Criteria
- [x] Sem JWT válido → 401; bypass só localhost dev.

## File List
- `server/src/api/security.ts`

## Notas de execução
Implementado com node:crypto (JWKS RS256, sem dep externa). Ativa quando CF_ACCESS_TEAM_DOMAIN/AUD forem setados; em dev AUTH_BYPASS libera só localhost.

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
