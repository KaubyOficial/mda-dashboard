# Story 2.2 — SheetSource: leitura da planilha

**Epic:** 2 · **Owner:** @data-engineer · **Tamanho:** G · **Status:** ✅ Concluída

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
Leitura de todas as abas; modo dev (CSV por link) e prod (Sheets API); parsing defensivo + quarentena.

## Acceptance Criteria
- [x] Unit tests com fixtures reais; linhas quarentenadas em sync_runs.warnings.

## File List
- `server/src/datasource/SheetSource.ts`
- `server/src/normalize/leadRows.ts`

## Notas de execução
SheetSource lê as 6 abas REAIS do funil OCDM por gid (sheet-csv): LEADS, AGENDAMENTOS & CALL, VENDAS, ACOMPANHAMENTO DIÁRIO, MÉTRICAS ADS, TOP PÚBLICOS. Parsers por-aba ancorados nas colunas reais. Sync real OK: 5.181 leads/558 agend/203 vendas/515 dias/4.416 ads/2.138 públicos. modo sheet-api = stub (Story 7.3).

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
