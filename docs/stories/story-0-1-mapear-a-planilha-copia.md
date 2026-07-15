# Story 0.1 — Mapear a planilha-cópia

**Epic:** 0 · **Owner:** @analyst · **Tamanho:** M · **Status:** ✅ Concluída

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
Inventário de todas as abas, colunas, tipos, exemplos, volumetria.

## Acceptance Criteria
- [x] Toda coluna usada por métrica do §3 tem linha no dicionário (aba, índice, tipo, parsing, exemplos).
- [x] Colunas ausentes p/ algum requisito listadas como GAP com proposta.

## File List
- `docs/data-dictionary.md`

## Notas de execução
CÓPIA COMPLETA (11 abas) lida na íntegra 2026-07-07 via openpyxl + export CSV por gid. 6 abas do funil OCDM mapeadas 1:1 nas entidades; abas C2 e de referência documentadas. GAPs restantes são REAIS (coluna inexistente): contato/resposta do comercial. Ver docs/data-dictionary.md.

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
