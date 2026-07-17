# Story 5.4 — Gestão de segredos + service account

**Epic:** 5 · **Owner:** @devops · **Tamanho:** P · **Status:** ✅ Concluída (código) · falta só o setup manual do Kauê

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
SA read-only, escopo mínimo, JSON só no servidor.

## Acceptance Criteria
- [x] Checklist de rotação documentado.
- [x] SA read-only (escopo `spreadsheets.readonly`), JSON só no servidor, gitignored.

## File List
- `.env.example`
- `docs/runbook.md`
- `.gitignore`
- `server/src/datasource/googleAuth.ts`
- `server/test/sheetapi.test.ts`

## Notas de execução
**2026-07-16 — auth implementada e provada ao vivo.** `googleAuth.ts`: JWT RS256 assinado com
`node:crypto` → troca JWT-bearer por access_token → cache com skew de 60s. **Zero dependência
nova** (mesmo padrão do JWT do Cloudflare Access; `googleapis` custaria ~50MB p/ ler 6 abas).
Escopo `spreadsheets.readonly` — a dashboard nunca escreve na planilha do cliente.
Verificado ao vivo contra a Sheets API (SA do REDE F × planilha de Cortes DE, descartável):
token OK, cache HIT, `listTabs`/`batchGet` OK, e os erros 403/404 traduzidos com a ação.
8 testes (assinatura RS256 conferida contra chave pública real, cache, skew, JSON inválido).

**Decisão (Kauê, 2026-07-16):** SA **própria da MDA**, criada na conta dona da planilha —
NÃO reusar a `rede-f-pipeline` (não misturar REDE F com MDA). Passo a passo em
`docs/runbook.md § Service account (sheet-api)`. Não depende do Caio (Kauê tem a conta dona).

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
