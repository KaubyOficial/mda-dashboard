# Story 7.2 — Monitoramento

**Epic:** 7 · **Owner:** @devops · **Tamanho:** P · **Status:** ⚪ Pendente

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
healthz + probe no MDA Monitor (checks.json) — alerta se cair ou sync travar (>2h).

## Acceptance Criteria
- [ ] Entrada JSON no mda-monitor.

## File List
- `/healthz já existe`

## Notas de execução
App expõe /healthz e /api/health (idade do sync). Adicionar 1 entrada em MDA/mda-monitor/config/checks.json quando a URL existir.

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
