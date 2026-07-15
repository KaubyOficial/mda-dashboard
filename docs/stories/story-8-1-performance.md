# Story 8.1 — Performance

**Epic:** 8 · **Owner:** @dev · **Tamanho:** M · **Status:** 🟡 Parcial (ver notas)

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
Página < 2s com 12m; queries com índice; bundle < 300KB gz; Lighthouse ≥ 90.

## Acceptance Criteria
- [ ] Metas medidas.

## File List
- `web/vite.config.ts`

## Notas de execução
Bundle atual ~167KB gz (Recharts domina — acima da meta 300KB? não, 167<300, mas o JS bruto 596KB). Considerar code-split/lazy dos gráficos e trocar Recharts se necessário.

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
