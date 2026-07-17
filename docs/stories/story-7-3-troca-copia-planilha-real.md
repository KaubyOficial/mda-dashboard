# Story 7.3 — Troca cópia → planilha REAL

**Epic:** 7 · **Owner:** @devops/Kauê · **Tamanho:** P · **Status:** ✅ Concluída (2026-07-16) — LIVE na planilha real

> Instanciada pelo @sm a partir do PLANO-MESTRE (§7). AC expandidos abaixo.

## Objetivo
Kauê compartilha a planilha REAL com a SA (Leitor); trocar SHEET_ID; sync; repetir reconciliação.

## Acceptance Criteria
- [x] Modo `sheet-api` implementado (era um stub que lançava erro).
- [x] Reconciliação pós-troca OK (ao centavo, contra soma crua da planilha).

## File List
- `server/src/datasource/sheetsApi.ts`
- `server/src/datasource/SheetSource.ts`
- `server/src/datasource/index.ts`
- `server/src/config.ts`
- `.env` · `.env.example` · `docs/runbook.md`

## Notas de execução
**2026-07-16 — desbloqueada e implementada.** O bloqueio registrado ("depende do Caio") caiu:
o Kauê tem acesso à **conta dona** da planilha, então cria a SA e compartilha sozinho.

**Diagnóstico que motivou a troca:** a fonte em uso (`sheet-csv` → `1Y2sw…`) é a
**"Cópia de Cópia planilha mentoria MDA"**, snapshot **congelado em 2026-07-07** (último lead
07/07/2026, `modifiedTime` 07/07). Não atualizava desde então e nunca atualizaria.

**Por que não bastou trocar o SHEET_ID:** `sheet-csv` exige planilha "qualquer pessoa com o
link" (a cópia 1, privada, dá HTTP 401 no export). A planilha real tem PII de lead → não pode
ser pública. Logo: `sheet-api` + SA.

**Implementado:** `sheetsApi.ts` (cliente v4 read-only via fetch) + `sheet-api` no `SheetSource`.
Abas resolvidas por **NOME** (gid não é estável entre cópia e real; ler aba errada em silêncio
seria o pior modo de falhar), match tolerante a acento/caixa/espaço, e falha alto listando as
abas existentes. `FORMATTED_VALUE` preserva exatamente o que os parsers recebiam do CSV → a
reconciliação ao centavo segue válida. Erros 403/404/429 traduzidos com a ação (verificados ao
vivo contra a API real).

## ✅ LIVE 2026-07-16 — troca feita e reconciliada
Kauê criou projeto GCP **próprio da MDA** (`mda-mestres-do-algoritmo`) + SA
`mda-dashboard@mda-mestres-do-algoritmo.iam.gserviceaccount.com` e compartilhou a planilha REAL
`1M3B5pgTk1yLZhofUQFH_l9vTIAlxb5aejFnvfxpcNx0`. `.env` → `DATA_SOURCE=sheet-api` + SHEET_ID real.

**Reconciliação ao centavo** (soma CRUA da planilha via API × KPI da dashboard — sem passar pelos
parsers, para não ser circular): faturamento **R$ 827.914,42 = 827.914,42** ✅ · investimento
**R$ 63.021,88 = 63.021,88** ✅ · vendas **205 = 205** ✅. Último lead = **16/07/2026 (hoje)** → viva.
Deltas vs. a cópia congelada: +109 leads (5.181→5.290), +2 vendas (203→205), +R$ 8.292,02.

**2 achados reais na planilha (não são bugs do código):**
1. **Aba de mídia com 2 espaços à esquerda** (`"  ACOMPANHAMENTO DIÁRIO"`). O match por nome
   normalizado absorveu; match exato teria dado "aba não encontrada" → investimento 0.
2. **Mídia parada em 20/06/2026** (26 dias) enquanto leads/vendas correm até hoje → em julho a
   dashboard mostra investimento/CPL/CAC/ROAS **zerados** e Lucro = Faturamento (falso).
   **Mitigação:** novo warning `MÍDIA: …` em `compute.ts` (tolerância de 2 dias, porque o gasto do
   dia entra no fim do dia e avisar todo dia viraria ruído) + 4 testes. **Conserto de verdade =
   alguém preencher a aba.**

**Verificação:** lint · typecheck · **43 testes** · build verdes.

⚠️ **Segurança:** a CÓPIA `1Y2sw…` está "qualquer pessoa com o link" **com PII de 5.181 leads**
(nome/telefone/e-mail) — provado: uma SA sem relação com a MDA conseguiu lê-la. Restringir ou
apagar após a troca.

---
_Referência: docs/PLANO-MESTRE.md · glossário §4 · arquitetura docs/architecture.md_
