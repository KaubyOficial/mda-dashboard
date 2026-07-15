# Story 3.6 — Funil comercial

**Epic:** 3 · **Owner:** @dev · **Tamanho:** M · **Status:** 🟡 Parcial (ver notas)

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
Etapas + taxas + ticket médio + custo/agendamento + custo/venda.

## Acceptance Criteria
- [ ] Taxas = etapa anterior; ticket médio real.

## File List
- `server/src/metrics/compute.ts (computeCommercialFunnel)`

## Notas de execução
Etapas leads→agendamentos→comparecimentos→vendas OK. "contato" e "respostas" = GAP (sem coluna na fonte; entram quando o adapter comercial/CRM for plugado — D6).

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
