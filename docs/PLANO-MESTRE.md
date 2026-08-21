# PLANO MESTRE — Dashboard da Mentoria MDA

**Projeto:** `MDA/mda-dashboard/` · **Owner:** Kauê · **Data:** 2026-07-07
**Orquestração:** AIOS (@aios-master) · **Status:** PLANEJADO — aguardando aprovação do Kauê

---

## 1. Visão

Dashboard web de página única com todos os números da mentoria MDA (funil high-ticket do Caio): faturamento, investimento, lucro, leads, funil de marketing, funil comercial, segmentação MQL/Morno/Desqualificado, relatórios por público e por anúncio — tudo lido de uma planilha Google Sheets, com dados retroativos, filtro de período com presets, comparação com período anterior, e acesso protegido por SSO Google (Cloudflare Access) por ser dado financeiro sensível.

## 2. Decisões travadas (questionário 2026-07-07)

| # | Decisão | Escolha do Kauê |
|---|---|---|
| D1 | Acesso à planilha (dev) | Liberar "qualquer pessoa com o link — Leitor" na CÓPIA. Planilha REAL depois via **service account** (Caio compartilha com o e-mail da SA). ✅ **RESOLVIDO 2026-07-07:** Kauê liberou o link; export verificado (HTTP 200). Story 0.1 desbloqueada. |
| D2 | Fonte das métricas de mídia | **100% planilha** (investimento, impressões, CPM, público, anúncio — equipe alimenta). Sem Meta API na V1. |
| D3 | Hosting | Kauê pediu recomendação → **Recomendação: VPS Linux barata (Hetzner CX22 ~€4/mês) + Docker + Cloudflare Tunnel** (ver §5.3). Story 1.2 formaliza a decisão (gate). **Nota 2026-07-07: Kauê ainda NÃO decidiu** (conta Cloudflare/domínio/VPS em aberto) — decisão fica pra Story 1.2; não bloqueia Epics 0, 2, 3 e 4 (dev/staging rodam local). ✅ **RESOLVIDO ago/2026:** produção no ar em `dash.mestresdoalgoritmo.com.br` (VPS + Docker + Cloudflare Tunnel/Access — ver `DEPLOY.md` §11). |
| D4 | Autenticação | **Cloudflare Access com SSO Google** — allowlist de e-mails (Kauê, Caio, comercial). Defesa em profundidade: app também valida o JWT do Access. *(Em produção o método de login ficou One-time PIN por e-mail, mesma allowlist.)* |
| D5 | Temperatura vs Qualificação | **2 eixos distintos.** Temperatura (quente/morno/frio) vem da **UTM** (de onde veio). Qualificação (MQL/Morno/Fora do perfil) vem do **formulário** (renda ≥ R$2k + conhece +1 semana — regra já travada em `MDA/mentoria/`). Dashboard mostra os dois separados. |
| D6 | Dados do comercial | **Cruzar abas da planilha** (LEADS × AGENDAMENTOS × VENDAS) por e-mail/telefone. Arquitetura deixa **adapter pluggable** pra plugar CRM depois sem reescrever. |
| D7 | Faturamento | **Valor real por venda na planilha** (ticket médio real, não preço fixo). |
| D8 | Sync | Job no servidor a cada **15–30 min** → cache SQLite local + botão "Atualizar agora" no dashboard. |

## 3. Escopo funcional (requisito → seção da página → epic/story)

Página única, seções empilhadas, header fixo com **date range picker** (padrão: mês atual) + presets (12 meses · Este ano · 6 meses · 3 meses · Mês atual) + botão "Atualizar agora" + timestamp do último sync.

| § | Seção | Conteúdo | Stories |
|---|---|---|---|
| S1 | **KPIs Hero** | Faturamento, Investimento, Lucro, Leads + CPL (todos/morno/MQL), CAC, taxa de conversão lead→venda, ROAS. Cada card com **delta vs período anterior** (↑/↓, valor e %, cor semântica — verde=melhor considerando a direção da métrica: CPL menor = melhor). | 3.2, 4.3 |
| S2 | **Diário — Leads & CPL** | Gráfico por dia: leads (barras) + CPL (linha, eixo secundário). | 3.3, 4.4 |
| S3 | **Diário — Investimento & Vendas** | Gráfico por dia: investimento e vendas (R$) + **linha de ROAS médio do mês**. | 3.3, 4.4 |
| S4 | **Detalhe dos Leads** | Temperatura (quente/morno/frio via UTM), origem (bio, anúncio, orgânico…), pagos vs orgânicos — donuts/barras + tabela resumo. | 3.4, 4.5 |
| S5 | **Funil de Marketing** | Impressões/alcance → cliques + CTR → clique botão LP + taxa (‖ play + play rate VSL) → início forms + taxa → forms finalizado + taxa → leads. Custos: CPC, custo/formulário, CPL. Visual de funil com taxas entre etapas. | 3.5, 4.6 |
| S6 | **Funil Comercial** | Leads → contato + taxa → respostas + taxa → agendamento + taxa → comparecimento + taxa → fechamento + taxa de venda. Ticket médio, custo/agendamento, custo/venda. | 3.6, 4.7 |
| S7 | **Segmentos de Qualificação** | Desqualificado · Morno · MQL: custo por lead do segmento, taxa de resposta, agendamento, comparecimento, venda, conversão total (lead do segmento → venda), custo por venda do segmento. Tabela comparativa 3 colunas. | 3.7, 4.8 |
| S8 | **Relatório por Público** | Por segmentação de anúncio: impressões, CPM, cliques, CTR, leads, MQLs, conversão clique→forms, CPL, custo/MQL. Tabela ordenável. | 3.8, 4.9 |
| S9 | **Relatório por Anúncio (UTM)** | Por anúncio: impressões, CTR, leads totais, mornos, MQLs, custo/MQL, taxa clique→forms preenchido. Tabela ordenável. | 3.8, 4.9 |

**Fora de escopo V1 (fase 2 — hooks previstos):** Meta Ads API ao vivo, integração CRM, alertas/notificações, multi-página, export PDF.

## 4. Glossário de métricas (fórmulas canônicas — fonte única da verdade)

> Story 0.3 valida cada fórmula com o Kauê; QA usa este glossário nos golden tests (Story 3.9). Nenhuma métrica pode ser implementada com fórmula diferente da listada aqui.

- **Faturamento** = Σ valor das vendas no período (data da VENDA dentro do range).
- **Investimento** = Σ gasto diário de mídia no período.
- **Lucro** = Faturamento − Investimento (V1 não considera custos operacionais; configurável depois).
- **ROAS** = Faturamento ÷ Investimento. **ROAS médio do mês** (linha do gráfico S3) = ROAS acumulado do mês corrente do range.
- **CPL (todos)** = Investimento ÷ Leads totais · **CPL morno** = Investimento ÷ Leads mornos · **CPL MQL** = Investimento ÷ MQLs. ✅ **DECIDIDO (Kauê, 2026-07-07): usa o investimento TOTAL do período nos 3 casos** — mais simples, mesmo sabendo que não é atribuição proporcional. Vale pra todos os "custo por X" de segmento (§S7: custo por lead e custo por venda de cada segmento = investimento total ÷ contagem do segmento).
- **CAC** = Investimento ÷ nº de vendas.
- **Taxa de conversão (todos)** = Vendas ÷ Leads totais.
- **CTR** = Cliques ÷ Impressões · **CPC** = Investimento ÷ Cliques · **CPM** = Investimento ÷ Impressões × 1000.
- **Taxas de funil** = etapa N ÷ etapa N−1. ✅ **DECIDIDO (Kauê, 2026-07-07): no funil comercial a taxa é SEMPRE referente à etapa anterior** (contato÷leads, respostas÷contatos, agendamentos÷respostas, comparecimentos÷agendamentos, vendas÷comparecimentos). Exceção definida no §3: "taxa total de conversão" do S7 = vendas do segmento ÷ leads do segmento (é explícita no requisito).
- **Período anterior** = janela de mesma duração imediatamente anterior ao range selecionado. ✅ **DECIDIDO (Kauê, 2026-07-07):** preset "mês atual" compara **dia 1..N do mês vs dia 1..N do mês anterior** (mesmo nº de dias corridos).
- **Qualificação** (MQL/Morno/Fora do perfil): regra simplificada travada — renda < R$2k → Fora; ≥ R$2k → Morno; ≥ R$2k E conhece +1 semana → MQL (normalização de variantes de texto conforme `MDA/mentoria/reclassificar_simplificada_inplace.py`).
- **Temperatura** (quente/morno/frio): mapeamento UTM → temperatura definido na Story 0.2 a partir das UTMs reais da planilha (ex.: remarketing = quente).

## 5. Arquitetura

### 5.1 Stack (padrão validado no Finance Dashboard)
- **Server:** Node 22 + Fastify + `node:sqlite` (⚠️ NÃO better-sqlite3 — regra de memória) — API REST de agregações, tudo server-side.
- **Sync worker:** job interno (setInterval + lock) a cada 20 min → lê a planilha → normaliza → grava SQLite (upsert idempotente, dados retroativos completos a cada sync — a planilha é a fonte da verdade, o SQLite é cache descartável/reconstruível).
- **Web:** React + Vite + TypeScript + Tailwind + Recharts (aplicar skill `dataviz` na construção dos gráficos). Build estático servido pelo Fastify. Tema dark MDA (`#0A0908` + gold `#FFD300` + verde `#37D67A` + vermelho `#FF6B6B`, fontes Anton/Plus Jakarta Sans — `MDA/carousels/BRAND.md`).
- **Fonte de dados pluggable (D6):** interface `DataSource` com implementação `SheetSource` (V1). Futuras: `CrmSource`, `MetaAdsSource`. Contrato: entrega entidades normalizadas (Lead, Agendamento, Venda, MidiaDiaria, MidiaPublico, MidiaAnuncio).
- **Acesso à planilha:** V1-dev = CSV export por link da CÓPIA; produção = **Google Sheets API v4 read-only com service account** (mesma interface, troca por env).

### 5.2 Fluxo de dados
```
Google Sheets ──(sync 20min / botão)──► Normalizador ──► SQLite (cache)
                                              │
              cruzamento LEADS×AGEND×VENDAS por e-mail/telefone (normalizado)
                                              │
Browser ◄─(HTTPS+Access JWT)─ Fastify API ◄─ agregador por range de datas
```
- O **browser nunca fala com o Google** — nem ID da planilha, nem dados brutos chegam ao client. Só agregados do range pedido.
- Cruzamento: e-mail lowercase/trim como chave primária; telefone normalizado (dígitos, com/sem 55/9) como fallback; submissão mais recente vence em duplicata (mesma regra do reclassificador).

### 5.3 Hosting — recomendação (D3)
**Recomendado: VPS Hetzner CX22 (~€3,79/mês) + Docker Compose + Cloudflare Tunnel + Cloudflare Access.**
- VPS não expõe NENHUMA porta pública (nem 443): o `cloudflared` faz túnel outbound → superfície de ataque mínima.
- Cloudflare Access na frente = SSO Google com allowlist de e-mails ANTES de qualquer byte chegar no app (D4).
- Alternativa custo-zero avaliada: PC local do Kauê + Tunnel — rejeitada como produção (depende do PC ligado; dado financeiro do Caio merece uptime), mas serve de **staging**.
- Precisa: domínio no Cloudflare (ex.: subdomínio `mda.kaubymedia.com.br`). Story 1.2 confirma domínio disponível e fecha o gate.

### 5.4 Segurança (dado sensível — requisito explícito do Kauê)
1. **Perímetro:** Cloudflare Access (SSO Google, allowlist). Sem bypass: origem só aceita tráfego do túnel.
2. **Defesa em profundidade:** Fastify valida assinatura do JWT `Cf-Access-Jwt-Assertion` (chaves públicas do team) em TODA request — se o túnel vazar, o app ainda nega.
3. **Segredos:** `.env` só no servidor (service account JSON, team domain), nunca no repo (gitignore + secret scanning no CI). Service account **read-only** e com acesso SÓ à planilha da mentoria.
4. **Headers:** CSP estrita (self, sem inline), HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors none.
5. **PII mínima:** dashboard só mostra agregados — nomes/e-mails/telefones de leads NÃO aparecem na UI nem nas respostas da API; logs sem PII.
6. **Rate limit** por IP/sessão + audit log de acessos (quem, quando — o Access já loga por e-mail).
7. **Dependências:** `npm audit` no CI + lockfile; imagem Docker slim non-root.
8. **Backups:** SQLite é cache reconstruível (fonte = planilha), mas config/env com backup manual documentado no runbook.

## 6. Time AIOS — designação de agentes

| Agente | Papel neste projeto |
|---|---|
| **@pm** | PRD, priorização, aceite de escopo, fase 2 |
| **@analyst** | Discovery da planilha, dicionário de dados, mapeamento UTM |
| **@po** | Validação de backlog, quality gates de negócio, UAT com Kauê |
| **@sm** | Instanciar stories numeradas em `docs/stories/`, ordem de execução |
| **@architect** | Arquitetura, decisão hosting, security design, revisão técnica |
| **@data-engineer** | Schema SQLite, sync engine, normalização, cruzamento de abas |
| **@dev** | Implementação (API, métricas, UI), correção de bugs |
| **@ux-design-expert** | Layout one-page, hierarquia visual, design system dos cards/gráficos |
| **@qa** | Test suites, golden tests de métricas, reconciliação, E2E, triage de bugs |
| **@devops** | Docker, VPS, Tunnel, Access, CI/CD, monitoramento, runbook |

## 7. Epics & Stories

> Convenção: story = arquivo numerado em `docs/stories/` criado pelo @sm na hora da execução, com acceptance criteria expandidos deste plano. Tamanhos: P (≤2h) · M (meio dia) · G (1 dia+).

### EPIC 0 — Discovery & Definição (@analyst lidera · @pm · @po)
*Objetivo: eliminar toda ambiguidade de dados e métricas antes de escrever código.*

- **0.1 — Mapear a planilha-cópia** (@analyst, M) — ⚠️ bloqueada até Kauê liberar o link. Inventário completo: todas as abas, colunas, tipos, exemplos, volumetria, células mescladas/fórmulas, abas de mídia (diário/público/anúncio), abas comerciais (agendamentos/vendas). Entrega: `docs/data-dictionary.md`.
  - AC: toda coluna usada por alguma métrica do §3 tem linha no dicionário com aba, índice, tipo, regra de parsing e exemplos reais; colunas ausentes p/ algum requisito listadas como GAP com proposta.
- **0.2 — Mapear UTMs reais → temperatura e origem** (@analyst, M) — extrair todos os valores distintos de utm_source/medium/campaign/content da planilha; propor tabela de mapeamento UTM→temperatura (quente/morno/frio) e UTM→origem (bio/anúncio/orgânico/etc.) + pagos vs orgânicos; validar com Kauê.
  - AC: 100% dos leads da cópia classificados pelos dois eixos (com bucket "não mapeado" ≤ definido pelo Kauê); mapeamento vira arquivo de config versionado (`config/utm-map.json`), editável sem deploy.
- **0.3 — PRD + glossário de métricas assinado** (@pm escreve, @po valida, G) — PRD curto referenciando §3/§4. ~~Resolver as 3 ambiguidades~~ ✅ **já resolvidas pelo Kauê em 2026-07-07** (CPL segmento = investimento total; taxas comerciais = etapa anterior; mês atual = mesmos N dias corridos — ver §4). Resta: confirmar fuso (America/Sao_Paulo) e moeda, e validar o exemplo numérico de cada fórmula.
  - AC: cada métrica do §4 tem fórmula final + 1 exemplo numérico calculado à mão a partir da planilha real e conferido pelo Kauê.
- **🚦 GATE G0 (@po + Kauê):** dicionário de dados completo + glossário assinado + mapeamento UTM aprovado. **Nada do Epic 2+ começa sem G0.**

### EPIC 1 — Fundação técnica (@architect lidera · @devops)

- **1.1 — Architecture doc + scaffold do repo** (@architect, M) — `docs/architecture.md` (conforme §5), monorepo `MDA/mda-dashboard/` (`server/`, `web/`, `config/`, `docs/`), TypeScript strict, ESLint/Prettier, vitest, estrutura DataSource pluggable.
  - AC: `npm run lint`, `npm run typecheck`, `npm test` verdes no esqueleto; interface `DataSource` documentada com contrato das 6 entidades.
- **1.2 — Decisão de hosting formalizada** (@architect + @devops + Kauê, P) — confirmar recomendação §5.3 (VPS+Tunnel+Access), domínio/subdomínio, conta Cloudflare, orçamento.
  - AC: decisão registrada no architecture doc; domínio confirmado; conta Hetzner/Cloudflare criadas ou tarefas do Kauê listadas.
- **1.3 — CI (GitHub Actions)** (@devops, P) — lint + typecheck + testes + `npm audit` + secret scanning (gitleaks) a cada push; repo privado `KaubyOficial/mda-dashboard`.
  - AC: pipeline verde; PR sem checks não mergeia.
- **🚦 GATE G1 (@architect):** architecture review — checklist `architect-checklist` aprovado.

### EPIC 2 — Data Layer (@data-engineer lidera · @dev)

- **2.1 — Schema SQLite + migrations** (@data-engineer, M) — tabelas: `leads` (com temperatura, origem, qualificação, UTMs), `agendamentos`, `vendas`, `midia_diaria`, `midia_publico`, `midia_anuncio`, `sync_runs` (log de execução). Índices por data.
  - AC: migrations idempotentes; schema documentado no data-dictionary.
- **2.2 — SheetSource: leitura da planilha** (@data-engineer, G) — leitura de todas as abas mapeadas na 0.1; modo dev (CSV por link da cópia) e modo prod (Sheets API v4 + service account) atrás da mesma interface; parsing defensivo (datas BR, R$ com vírgula, variantes de texto com `\` de escape — lição do reclassificador; linha malformada → quarentena, não crash).
  - AC: unit tests com fixtures reais extraídas da cópia; linhas quarentenadas ficam visíveis em `sync_runs.warnings`.
- **2.3 — Normalizador + qualificação + temperatura** (@data-engineer, G) — aplicar regra MQL/Morno/Fora (renda+conhece, normalizações da memória) OU ler coluna MQL existente (decidir na 0.1 — se a planilha já traz a coluna preenchida, ela vence); aplicar `utm-map.json` para temperatura/origem/pago-orgânico.
  - AC: classificação bate 100% com o resultado do `reclassificar_simplificada_inplace.py` num export de teste (mesma base → mesmos MQL/Morno/Fora).
- **2.4 — Cruzamento LEADS × AGENDAMENTOS × VENDAS** (@data-engineer, G) — casamento por e-mail normalizado, fallback telefone normalizado; duplicatas = submissão mais recente; venda sem lead casado → bucket "não atribuído" (aparece nos totais, não nos segmentos).
  - AC: relatório de casamento no sync (X% casados por e-mail, Y% por telefone, Z não casados); taxa de não-casados da cópia revisada com o Kauê.
- **2.5 — Sync engine** (@data-engineer, M) — job a cada 20 min + endpoint `POST /api/sync` (botão), lock anti-concorrência, full refresh idempotente (retroativo garantido), timestamp e status do último sync expostos.
  - AC: 2 syncs seguidos → mesmos dados (idempotência provada em teste); falha de rede → mantém cache anterior + flag "stale" na UI.
- **🚦 GATE G2 (@qa + @data-engineer):** reconciliação bruta — totais do SQLite (nº leads, nº vendas, Σ faturamento, Σ investimento por mês) conferidos manualmente contra a planilha, **ao centavo**. Relatório de reconciliação anexado à story.

### EPIC 3 — API & Motor de métricas (@dev lidera · @qa)

- **3.1 — API base + validação de range** (@dev, M) — `GET /api/metrics?from&to` (+ endpoints por seção), validação de datas, fuso America/Sao_Paulo, cache em memória por range (invalidado no sync).
- **3.2 — KPIs hero + comparação com período anterior** (@dev, M) — todas as métricas S1 com delta (absoluto, %, direção semântica: pra CPL/CAC menor=melhor).
- **3.3 — Séries diárias** (@dev, M) — leads/CPL por dia; investimento/vendas por dia + ROAS médio do mês (regra do §4).
- **3.4 — Agregações de detalhe de leads** (@dev, P) — temperatura, origem, pago vs orgânico.
- **3.5 — Funil de marketing** (@dev, M) — etapas + taxas + CPC/custo-forms/CPL conforme glossário.
- **3.6 — Funil comercial** (@dev, M) — etapas + taxas + ticket médio + custo/agendamento + custo/venda.
- **3.7 — Segmentos de qualificação** (@dev, M) — matriz 3 segmentos × 8 métricas do S7.
- **3.8 — Relatórios por público e por anúncio** (@dev, M) — agregação por segmentação e por UTM de anúncio, com métricas do S8/S9.
- **3.9 — Golden tests de métricas** (@qa, G) — para CADA métrica do glossário: teste unitário com fixture + **golden test contra valores calculados à mão na planilha-cópia** (mínimo 3 ranges: 1 mês cheio, range custom, range com dados parciais). Edge cases: divisão por zero (0 leads, 0 investimento), dia sem dados, range futuro, range de 1 dia.
  - AC: 100% das métricas com golden test passando; mutação proposital numa fórmula quebra o teste (prova de sensibilidade).
- **🚦 GATE G3 (@qa):** suite completa verde + cobertura das fórmulas 100% + revisão de código do motor de métricas pelo @architect.

### EPIC 4 — UI Dashboard (@ux-design-expert lidera design · @dev implementa)

- **4.1 — Design system + layout one-page** (@ux-design-expert, M) — wireframe das 9 seções, hierarquia (KPIs hero primeiro, "valores principais de cara"), tema dark MDA brand, tipografia, grid responsivo (desktop-first, utilizável no celular), estados de loading/erro/stale/vazio.
  - AC: preview HTML aprovado pelo Kauê ANTES de implementar em React.
- **4.2 — Shell + date picker + presets + sync** (@dev, M) — header fixo: range picker (padrão mês atual), presets (12 meses/Este ano/6 meses/3 meses/Mês atual), botão Atualizar agora + timestamp último sync + badge stale; range na URL (compartilhável).
- **4.3 — Seção KPIs hero** (@dev, M) — cards com valor grande, delta colorido (↑/↓ + % + absoluto vs período anterior), tooltip com a fórmula.
- **4.4 — Gráficos diários (S2+S3)** (@dev, M) — Recharts conforme skill `dataviz`; tooltip unificado por dia; linha ROAS médio.
- **4.5 — Seção detalhe de leads (S4)** (@dev, P)
- **4.6 — Funil de marketing (S5)** (@dev, M) — visual de funil com taxas entre etapas + custos; play rate da VSL em paralelo ao clique da LP.
- **4.7 — Funil comercial (S6)** (@dev, M)
- **4.8 — Segmentos de qualificação (S7)** (@dev, M) — tabela comparativa 3 colunas com highlight do melhor/pior por linha.
- **4.9 — Relatórios por público e anúncio (S8+S9)** (@dev, M) — tabelas ordenáveis, busca, densidade compacta.
- **🚦 GATE G4 (@ux-design-expert + Kauê):** review visual seção a seção contra o design aprovado na 4.1; responsivo verificado; zero PII visível.

### EPIC 5 — Segurança & Hardening (@architect + @devops · @qa audita)

- **5.1 — Cloudflare Access + Tunnel** (@devops, M) — app Access com Google SSO, allowlist de e-mails, túnel do container, origem sem portas públicas.
- **5.2 — Validação JWT no app** (@dev, M) — middleware Fastify validando `Cf-Access-Jwt-Assertion` (JWKS do team, aud, exp); requests sem JWT válido → 401 mesmo dentro do túnel; bypass configurável SÓ para localhost dev.
- **5.3 — Headers + rate limit + logs sem PII** (@dev, P) — CSP/HSTS/etc. (§5.4), @fastify/rate-limit, logger com redaction.
- **5.4 — Gestão de segredos + service account** (@devops, P) — SA read-only, escopo mínimo, JSON só no servidor; checklist de rotação documentado.
- **5.5 — Auditoria de segurança** (@qa + @architect, M) — checklist OWASP top 10 aplicável; testes: acesso sem login, JWT forjado/expirado, e-mail fora da allowlist, direct-to-origin, headers presentes, nenhum dado bruto/PII em nenhuma resposta da API, secret scanning limpo.
- **🚦 GATE G5 (@architect):** relatório da 5.5 sem findings críticos/altos. **GO/NO-GO de segurança — sem G5 não há deploy público.**

### EPIC 6 — QA final, Reconciliação & Bugfix (@qa lidera · @dev corrige · @po aceita)

- **6.1 — E2E Playwright** (@qa, G) — fluxos: login via Access (mock em staging), troca de presets, range custom, atualizar agora, todas as seções renderizam com dados reais da cópia, estados vazio/stale.
- **6.2 — Reconciliação fina (GO/NO-GO de dados)** (@qa + Kauê, M) — pra 3 períodos escolhidos pelo Kauê, TODOS os números das 9 seções conferidos contra cálculo manual na planilha. Meta: 100% batendo (tolerância zero em contagens e R$; arredondamento só na exibição).
- **6.3 — Ciclo de bugs** (@qa triagem → @dev fix → @qa re-teste, contínuo) — bugs viram issues com severidade (S1 bloqueia release, S2 corrige antes do go-live, S3 backlog); cada fix com teste de regressão; **regra: bug de fórmula de métrica = S1 sempre**.
- **6.4 — UAT com Kauê** (@po conduz, M) — Kauê usa o dashboard em staging por alguns dias com a cópia; feedbacks viram issues triadas.
- **🚦 GATE G6 (@po + Kauê):** reconciliação 100% + zero S1/S2 abertos + UAT aprovado por escrito.

### EPIC 7 — Deploy & Go-live (@devops lidera)

- **7.1 — Docker + Compose + deploy na VPS** (@devops, M) — imagem slim non-root, healthcheck, restart policy, deploy documentado (script `deploy.sh`).
- **7.2 — Monitoramento** (@devops, P) — `/healthz` + **probe no MDA Monitor existente** (`mda-monitor/config/checks.json` — é 1 entrada JSON, arquitetura pluggable já pronta) → alerta se o dashboard cair ou o sync travar (idade do último sync > 2h = degraded).
- **7.3 — Troca cópia → planilha REAL** (@devops + Kauê + Caio, P) — Caio compartilha a real com o e-mail da service account (Viewer); trocar `SHEET_ID` no env; sync; **repetir reconciliação da 6.2 em 1 período contra o painel real**.
- **7.4 — Runbook** (@devops, P) — `docs/runbook.md`: deploy, rollback, rotação de segredos, adicionar e-mail na allowlist, editar utm-map, o que fazer se o sync quebrar, como plugar o CRM futuro (contrato DataSource).
- **🚦 GATE G7 (@devops + @po):** produção no ar com planilha real, reconciliação pós-troca OK, monitor verde, runbook entregue.

### EPIC 8 — Otimização & Feedback QC (@pm lidera · @qa · @dev)

- **8.1 — Performance** (@dev, M) — página abre < 2s com 12 meses de range (medido); queries agregadas com índice; bundle < 300KB gz; Lighthouse ≥ 90 performance.
- **8.2 — Ciclo de feedback QC pós-go-live** (@qa + @pm, contínuo, 2 semanas) — checagem semanal: números continuam batendo com a planilha (spot-check automatizado: script compara 5 métricas do dia anterior), warnings de quarentena revisados, feedbacks do Caio/comercial coletados e triados.
- **8.3 — Ajustes de uso real** (@dev, M) — backlog do feedback: novas colunas que a equipe passar a preencher (comercial evoluindo — D6), ajustes de utm-map, refinamentos visuais.
- **8.4 — Preparação fase 2** (@pm + @architect, P) — spec curta dos adapters CRM e Meta Ads API sobre o contrato DataSource (não implementa — só deixa o encaixe documentado, decisão D6/D2).
- **🚦 GATE G8 (@pm + Kauê):** 2 semanas de spot-checks verdes + backlog fase 2 priorizado → projeto passa a modo manutenção.

## 8. Definition of Done global (toda story)

1. Acceptance criteria da story 100% atendidos e marcados `[x]` no arquivo da story.
2. `npm run lint` + `npm run typecheck` + `npm test` verdes.
3. Teste novo cobrindo o que a story adicionou (fórmula nova = golden test obrigatório).
4. Zero PII em logs/respostas introduzida pela story.
5. File List da story atualizado; commit convencional referenciando a story (`feat: ... [Story N.M]`).
6. Code review: stories do motor de métricas e de segurança exigem revisão do @architect; demais, self-review hostil do @dev + spot-check @qa.

## 9. Sequência de execução e dependências

```
0.1 → 0.2 → 0.3 → [G0]
1.1 → 1.2 → 1.3 → [G1]        (1.x pode rodar em paralelo com 0.2/0.3)
[G0+G1] → 2.1 → 2.2 → 2.3 → 2.4 → 2.5 → [G2]
[G2] → 3.1 → 3.2..3.8 (paralelo) → 3.9 → [G3]
4.1 (pode começar após G0) → [aprovação Kauê] → 4.2 → 4.3..4.9 → [G4]
5.1/5.2 (após 3.1) → 5.3/5.4 → 5.5 → [G5]
[G3+G4+G5] → 6.1 → 6.2 → 6.3/6.4 → [G6]
[G6] → 7.1 → 7.2 → 7.3 → 7.4 → [G7]
[G7] → 8.1 → 8.2 → 8.3 → 8.4 → [G8]
```

## 10. Riscos & mitigações

| Risco | Impacto | Mitigação |
|---|---|---|
| Planilha sem colunas p/ alguma métrica (ex.: play da VSL, clique no botão da LP, contato/resposta do comercial) | Seções S5/S6 incompletas | Story 0.1 lista GAPs; @pm decide com Kauê: equipe passa a preencher OU métrica entra como "sem dado" na V1 (card cinza, não some) |
| Estrutura da planilha muda (equipe renomeia coluna/aba) | Sync quebra silenciosamente | Parser valida headers no início do sync; header inesperado → sync falha alto + alerta no MDA Monitor; mapeamento de colunas em config versionada |
| Casamento e-mail/telefone com furos | Funil comercial distorcido | Relatório de casamento a cada sync (2.4); bucket "não atribuído" explícito; revisão com Kauê no G2 |
| Quota/latência da API Google | Dados velhos | Cache SQLite + flag stale; sync 20 min fica muito abaixo da quota |
| Acesso indevido (dado financeiro do Caio) | Crítico | Epic 5 inteiro + gate G5 GO/NO-GO; Access + JWT + túnel sem porta pública + PII zero na UI |
| Cópia ≠ planilha real (estrutura divergente) | Retrabalho na troca | 7.3 repete reconciliação na real antes de considerar live |

## 11. Tarefas do Kauê (fora do time AIOS)

- [x] ~~Ativar "qualquer pessoa com o link — Leitor" na planilha-CÓPIA~~ — ✅ feito 2026-07-07 (verificado, HTTP 200).
- [x] ~~Responder as 3 ambiguidades do glossário~~ — ✅ respondidas 2026-07-07: CPL/custos por segmento = investimento total (simples > "certo"); taxas comerciais = etapa anterior; mês atual vs anterior = mesmos N dias corridos.
- [ ] Aprovar wireframe (4.1), reconciliações (G2/G6) e UAT (6.4).
- [x] ~~**EM ABERTO (Kauê ainda não sabe — decidir na Story 1.2, não bloqueia o dev):** conta Cloudflare + domínio/subdomínio e VPS (~€4/mês) — ou optar por staging local primeiro.~~ — ✅ resolvido ago/2026: produção em `dash.mestresdoalgoritmo.com.br` (ver `DEPLOY.md`).
- [ ] Na virada pra real: pedir ao Caio pra compartilhar a planilha real com o e-mail da service account (Viewer).

---
*Plano gerado por Orion (@aios-master) em 2026-07-07. Próximo passo após aprovação: @sm instancia as stories do Epic 0 em `docs/stories/` e o @analyst inicia a 0.1 assim que o link da cópia estiver liberado.*
