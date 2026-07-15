# Story 2.3 — Normalizador + qualificação + temperatura

**Epic:** 2 · **Owner:** @data-engineer · **Tamanho:** G · **Status:** ✅ Concluída

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
Regra MQL/Morno/Fora + coluna MQL existente (vence quando válida) + utm-map.

## Acceptance Criteria
- [x] Classificação bate 100% com reclassificar_simplificada_inplace.py num export de teste.

## File List
- `server/src/normalize/qualification.ts`
- `server/src/normalize/utm.ts`

## Notas de execução
Regra simplificada travada implementada + testes. Validar bit-a-bit contra o script Python num export dedicado no G2.

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
