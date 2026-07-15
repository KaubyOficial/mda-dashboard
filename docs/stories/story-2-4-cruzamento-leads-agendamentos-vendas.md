# Story 2.4 — Cruzamento LEADS × AGENDAMENTOS × VENDAS

**Epic:** 2 · **Owner:** @data-engineer · **Tamanho:** G · **Status:** ✅ Concluída

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
Casamento por e-mail (primário) + telefone (fallback); duplicata = mais recente; venda órfã = não atribuído.

## Acceptance Criteria
- [x] Relatório de casamento no sync (% e-mail, % telefone, não casados).

## File List
- `server/src/crossjoin/match.ts`

## Notas de execução
Implementado + testado (email match + bucket não-atribuído). Relatório vai pra match_report. Rodar contra dados reais quando as abas de vendas chegarem.

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
