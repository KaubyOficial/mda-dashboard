# Story 3.8 — Relatórios por público e por anúncio

**Epic:** 3 · **Owner:** @dev · **Tamanho:** M · **Status:** ✅ Concluída

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
Agregação por segmentação e por UTM de anúncio.

## Acceptance Criteria
- [x] Métricas do S8/S9.

## File List
- `server/src/metrics/compute.ts (computePorPublico/computePorAnuncio)`

## Notas de execução
Por anúncio: leads/MQLs vêm da PRÓPRIA aba MÉTRICAS ADS (Action Leads/MQL) — sem achismo. Por público: leads/CPL da aba TOP PÚBLICOS. Único "—" real: MQL por público (coluna inexistente na aba).

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
