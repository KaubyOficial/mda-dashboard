# Backlog de Stories — Dashboard MDA

Gerado pelo @sm a partir de `docs/PLANO-MESTRE.md`. Status ao vivo abaixo.
Legenda: ✅ concluída · 🟡 parcial · ⚪ pendente · 🔒 bloqueada (dependência externa: Kauê/Caio/planilha real).


## Epic 0 — Discovery & Definição

| Story | Título | Owner | Tam. | Status |
|---|---|---|---|---|
| [0.1](./story-0-1-mapear-a-planilha-copia.md) | Mapear a planilha-cópia | @analyst | M | ✅ done |
| [0.2](./story-0-2-mapear-utms-reais-temperatura-e-origem.md) | Mapear UTMs reais → temperatura e origem | @analyst | M | ✅ done |
| [0.3](./story-0-3-prd-glossario-de-metricas-assinado.md) | PRD + glossário de métricas assinado | @pm/@po | G | 🟡 partial |

## Epic 1 — Fundação técnica

| Story | Título | Owner | Tam. | Status |
|---|---|---|---|---|
| [1.1](./story-1-1-architecture-doc-scaffold-do-repo.md) | Architecture doc + scaffold do repo | @architect | M | ✅ done |
| [1.2](./story-1-2-decisao-de-hosting-formalizada.md) | Decisão de hosting formalizada | @architect/@devops | P | 🔒 blocked |
| [1.3](./story-1-3-ci-github-actions.md) | CI (GitHub Actions) | @devops | P | ✅ done |

## Epic 2 — Data Layer

| Story | Título | Owner | Tam. | Status |
|---|---|---|---|---|
| [2.1](./story-2-1-schema-sqlite-migrations.md) | Schema SQLite + migrations | @data-engineer | M | ✅ done |
| [2.2](./story-2-2-sheetsource-leitura-da-planilha.md) | SheetSource: leitura da planilha | @data-engineer | G | ✅ done |
| [2.3](./story-2-3-normalizador-qualificacao-temperatura.md) | Normalizador + qualificação + temperatura | @data-engineer | G | ✅ done |
| [2.4](./story-2-4-cruzamento-leads-agendamentos-vendas.md) | Cruzamento LEADS × AGENDAMENTOS × VENDAS | @data-engineer | G | ✅ done |
| [2.5](./story-2-5-sync-engine.md) | Sync engine | @data-engineer | M | ✅ done |

## Epic 3 — API & Motor de métricas

| Story | Título | Owner | Tam. | Status |
|---|---|---|---|---|
| [3.1](./story-3-1-api-base-validacao-de-range.md) | API base + validação de range | @dev | M | ✅ done |
| [3.2](./story-3-2-kpis-hero-comparacao-periodo-anterior.md) | KPIs hero + comparação período anterior | @dev | M | ✅ done |
| [3.3](./story-3-3-series-diarias.md) | Séries diárias | @dev | M | ✅ done |
| [3.4](./story-3-4-agregacoes-de-detalhe-de-leads.md) | Agregações de detalhe de leads | @dev | P | ✅ done |
| [3.5](./story-3-5-funil-de-marketing.md) | Funil de marketing | @dev | M | ✅ done |
| [3.6](./story-3-6-funil-comercial.md) | Funil comercial | @dev | M | 🟡 partial |
| [3.7](./story-3-7-segmentos-de-qualificacao.md) | Segmentos de qualificação | @dev | M | 🟡 partial |
| [3.8](./story-3-8-relatorios-por-publico-e-por-anuncio.md) | Relatórios por público e por anúncio | @dev | M | ✅ done |
| [3.9](./story-3-9-golden-tests-de-metricas.md) | Golden tests de métricas | @qa | G | ✅ done |

## Epic 4 — UI Dashboard

| Story | Título | Owner | Tam. | Status |
|---|---|---|---|---|
| [4.1](./story-4-1-design-system-layout-one-page.md) | Design system + layout one-page | @ux-design-expert | M | 🟡 partial |
| [4.2](./story-4-2-shell-date-picker-presets-sync.md) | Shell + date picker + presets + sync | @dev | M | ✅ done |
| [4.3](./story-4-3-secao-kpis-hero.md) | Seção KPIs hero | @dev | M | ✅ done |
| [4.4](./story-4-4-graficos-diarios-s2-s3.md) | Gráficos diários (S2+S3) | @dev | M | ✅ done |
| [4.5](./story-4-5-secao-detalhe-de-leads-s4.md) | Seção detalhe de leads (S4) | @dev | P | ✅ done |
| [4.6](./story-4-6-funil-de-marketing-s5.md) | Funil de marketing (S5) | @dev | M | ✅ done |
| [4.7](./story-4-7-funil-comercial-s6.md) | Funil comercial (S6) | @dev | M | ✅ done |
| [4.8](./story-4-8-segmentos-de-qualificacao-s7.md) | Segmentos de qualificação (S7) | @dev | M | ✅ done |
| [4.9](./story-4-9-relatorios-por-publico-e-anuncio-s8-s9.md) | Relatórios por público e anúncio (S8+S9) | @dev | M | ✅ done |

## Epic 5 — Segurança & Hardening

| Story | Título | Owner | Tam. | Status |
|---|---|---|---|---|
| [5.1](./story-5-1-cloudflare-access-tunnel.md) | Cloudflare Access + Tunnel | @devops | M | 🔒 blocked |
| [5.2](./story-5-2-validacao-jwt-no-app.md) | Validação JWT no app | @dev | M | ✅ done |
| [5.3](./story-5-3-headers-rate-limit-logs-sem-pii.md) | Headers + rate limit + logs sem PII | @dev | P | ✅ done |
| [5.4](./story-5-4-gestao-de-segredos-service-account.md) | Gestão de segredos + service account | @devops | P | 🔒 blocked |
| [5.5](./story-5-5-auditoria-de-seguranca.md) | Auditoria de segurança | @qa/@architect | M | ⚪ pending |

## Epic 6 — QA final, Reconciliação & Bugfix

| Story | Título | Owner | Tam. | Status |
|---|---|---|---|---|
| [6.1](./story-6-1-e2e-playwright.md) | E2E Playwright | @qa | G | ⚪ pending |
| [6.2](./story-6-2-reconciliacao-fina-go-no-go-de-dados.md) | Reconciliação fina (GO/NO-GO de dados) | @qa/Kauê | M | 🟡 partial |
| [6.3](./story-6-3-ciclo-de-bugs.md) | Ciclo de bugs | @qa/@dev | cont | ⚪ pending |
| [6.4](./story-6-4-uat-com-kaue.md) | UAT com Kauê | @po | M | ⚪ pending |

## Epic 7 — Deploy & Go-live

| Story | Título | Owner | Tam. | Status |
|---|---|---|---|---|
| [7.1](./story-7-1-docker-compose-deploy-na-vps.md) | Docker + Compose + deploy na VPS | @devops | M | 🟡 partial |
| [7.2](./story-7-2-monitoramento.md) | Monitoramento | @devops | P | ⚪ pending |
| [7.3](./story-7-3-troca-copia-planilha-real.md) | Troca cópia → planilha REAL | @devops/Kauê/Caio | P | 🔒 blocked |
| [7.4](./story-7-4-runbook.md) | Runbook | @devops | P | ✅ done |

## Epic 8 — Otimização & Feedback QC

| Story | Título | Owner | Tam. | Status |
|---|---|---|---|---|
| [8.1](./story-8-1-performance.md) | Performance | @dev | M | 🟡 partial |
| [8.2](./story-8-2-ciclo-de-feedback-qc-pos-go-live.md) | Ciclo de feedback QC pós-go-live | @qa/@pm | cont | ⚪ pending |
| [8.3](./story-8-3-ajustes-de-uso-real.md) | Ajustes de uso real | @dev | M | ⚪ pending |
| [8.4](./story-8-4-preparacao-fase-2.md) | Preparação fase 2 | @pm/@architect | P | ⚪ pending |

## Resumo

- **46** stories no total.
- ✅ 27 concluídas · 🟡 7 parciais · ⚪ 8 pendentes · 🔒 4 bloqueadas.

Dados reais da CÓPIA completa já lidos e reconciliados ao centavo (faturamento R$ 819.622,40 · investimento R$ 63.021,88). Bloqueios externos restantes: decisão de hosting (Kauê, 1.2), Cloudflare/Access (Kauê, 5.1), gestão de segredos/service account (5.4), planilha REAL do Caio (7.3).
