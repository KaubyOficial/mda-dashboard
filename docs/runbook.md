# Runbook — Dashboard MDA (Story 7.4)

> Para **colocar no ar pela primeira vez**, use o `DEPLOY.md` (guia completo, auto-suficiente).
> Este runbook cobre dev local e operação do dia a dia.

## Rodar em dev (local)

```bash
cd MDA/mda-dashboard
npm install
cp .env.example .env          # DATA_SOURCE=sheet-api por padrão; ajuste se não tiver credencial

# terminal 1 — API
npm run dev --workspace server

# terminal 2 — web com hot reload (proxy → :8080)
npm run dev:web                        # da RAIZ, não com --workspace web
                                       # http://localhost:5278
```

Modos de fonte (`DATA_SOURCE` no `.env`):

- `mock` — dados sintéticos completos (UI dev).
- `csv` — export local real da aba LEADS: setar `CSV_LEADS_PATH`.
- `sheet-csv` — CÓPIA por link: setar `SHEET_ID` + `SHEET_GID_*` (gids na URL da planilha).
  ⚠️ A cópia está **congelada em 2026-07-07** — só histórico, nunca produção.
- `sheet-api` — **produção**, implementado desde 2026-07-16: `GOOGLE_SERVICE_ACCOUNT_JSON`.

Sync avulso (útil pra reconciliação): `npm run sync --workspace server`.

## Build de produção

```bash
npm run build          # web (Vite) + server (tsc) — nesta ordem
# o Fastify serve web/dist automaticamente em produção
node --experimental-sqlite server/dist/index.js    # com DATA_SOURCE=sheet-api no .env
```

## Deploy na VPS (Docker + Cloudflare Tunnel)

> Versão detalhada, com pré-requisitos, segredos, verificação e armadilhas: **`DEPLOY.md`**.

1. Provisionar VPS (Hetzner CX22), instalar Docker + docker-compose.
2. Copiar repo + `.env` (com `SHEET_ID`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `AUTH_BYPASS=false`).
3. `bash deploy.sh` (build + up).
4. Criar túnel Cloudflare (`cloudflared`) apontando `mda.<dominio>` → `http://localhost:8080`. **Nenhuma porta pública na VPS.**
5. Criar app no **Cloudflare Access**: SSO Google, allowlist de e-mails (Kauê, Caio, comercial), copiar o **AUD** para `CF_ACCESS_AUD`.

### Rollback

`docker compose down && git checkout <tag-anterior> && bash deploy.sh`. O SQLite é cache reconstruível — apagar `data/` e re-sincronizar não perde nada (a planilha é a fonte).

## Operação

- **Adicionar e-mail à allowlist:** painel Cloudflare Access → app MDA → política → adicionar e-mail. Sem deploy.
- **Editar mapeamento UTM:** editar `config/utm-map.json` e rodar um sync (`POST /api/sync`). Sem deploy.
- **Ajustar parâmetros de métrica:** `config/metrics-config.json` (fuso, moeda, ticket padrão).
- **Rotação de segredos:** gerar nova service account key no GCP → substituir o JSON no servidor → `docker compose restart`. Revogar a antiga. A SA é **read-only** e com acesso só à planilha da mentoria.

## Service account (sheet-api) — ligar na planilha REAL

> **Por que existe:** o modo `sheet-csv` lê por link público. A planilha real tem **PII de lead**
> (nome, telefone, e-mail) e não pode ser pública → produção usa `sheet-api` (Sheets API v4
> read-only + service account). Decisão (Kauê, 2026-07-16): **SA própria da MDA**, criada na conta
> dona da planilha — sem misturar com o projeto GCP do REDE F.

**Setup (1×, ~5 min).** Logado na conta Google **dona da planilha** (a da MDA):

1. **Criar projeto:** <https://console.cloud.google.com/projectcreate> → nome `mda-dashboard` → Create.
2. **Ativar a API:** APIs & Services → Library → buscar **Google Sheets API** → **Enable**
   (com o projeto `mda-dashboard` selecionado no seletor do topo).
3. **Criar a service account:** IAM & Admin → Service Accounts → **+ Create service account**
   → nome `mda-dashboard-reader` → **Create and continue** → **sem** papel (não precisa de
   papel IAM: o acesso vem do compartilhamento da planilha) → **Done**.
4. **Baixar a chave:** clicar na SA → aba **Keys** → Add key → **Create new key** → **JSON** → Create.
   Salvar como `MDA/mda-dashboard/service-account-mda.json`
   (`service-account*.json` já é gitignored — a chave nunca vai pro git).
5. **Compartilhar a planilha:** abrir a planilha **REAL** "Mestres do Algoritmo | OCDM" →
   **Compartilhar** → colar o e-mail da SA (`...@mda-dashboard.iam.gserviceaccount.com`,
   está no campo `client_email` do JSON) → permissão **Leitor** → desmarcar "Notificar" → Enviar.
6. **Apontar o `.env`:** `DATA_SOURCE=sheet-api` e `SHEET_ID=` o ID da planilha REAL
   (o trecho entre `/d/` e `/edit` na URL).
7. **Sincronizar:** `npm run sync --workspace server`.

**Diagnóstico** — os erros já vêm traduzidos com a ação:

| Erro                                                 | Causa                 | Ação                            |
| ---------------------------------------------------- | --------------------- | ------------------------------- |
| `403 — a planilha X NÃO está compartilhada com <sa>` | passo 5 não feito     | compartilhar como Leitor        |
| `403 — a Google Sheets API está DESATIVADA`          | passo 2 não feito     | Enable no projeto certo         |
| `404 — planilha X não encontrada`                    | `SHEET_ID` errado     | usar o ID entre `/d/` e `/edit` |
| `Abas não encontradas: …` (lista as existentes)      | aba renomeada na real | ajustar `SHEET_TAB_*` no `.env` |
| `429 — quota da Sheets API`                          | sync agressivo        | subir `SYNC_INTERVAL_MINUTES`   |

**Notas.**

- Aba é resolvida por **NOME**, não por gid: gid não é estável entre cópia e planilha real, e
  ler a aba errada silenciosamente é o pior modo de falhar num dashboard financeiro. O match
  tolera acento/caixa/espaço extra; se não achar, **falha alto** listando as abas existentes.
- Token de SA renova sozinho (headless, sem expiração de refresh token) — ao contrário de OAuth
  de usuário, que exigiria reautorização periódica.
- Rotação: ver "Rotação de segredos" acima.

## Monitoramento (Story 7.2)

- `/healthz` → liveness. `/api/health` → `{ lastSync, stale, syncing }`.
- Adicionar 1 entrada em `MDA/mda-monitor/config/checks.json` apontando pra `/api/health`; alertar se `stale=true` (sync > 2h) ou HTTP != 200.

## Se o sync quebrar

1. `GET /api/health` → ver `lastSync`/`stale`.
2. Ver `sync_runs` no SQLite (`status='error'`, coluna `error`) ou o log do container.
3. Causas comuns: header de coluna renomeado na planilha (o parser avisa em `warnings`), link da CÓPIA revogado, quota da Sheets API. O cache anterior é mantido em caso de falha (a UI marca "dados desatualizados").

## Seção Comercial — vendas por link rastreado (2026-08-07)

A seção atribui vendas ao vendedor pela **UTM do checkout** (colunas `Utm Source`/`Utm Medium`/`SCK`
da aba VENDAS) e cruza com a lista de leads de cada vendedor (aba `LEADS COMERCIAL`). Vendedores e
% de comissão ficam em **`config/comercial.json`** (mudou → reiniciar o server). `gui` está em
`foraDaSecao` (funil do forms).

**Setup one-off (já rodado em 2026-08-07):**

1. Promover a SA do dashboard a **Editor** na planilha (voltar pra Leitor no fim).
2. `npm run comercial:init --workspace server -- --vendas-cols` — cria a aba `LEADS COMERCIAL`
   (Data · Vendedor · Nome · E-mail · Telefone) e as 3 colunas de UTM no fim da aba VENDAS.
3. `npm run backfill:utm --workspace server -- --export "<export Cakto .csv|.xlsx>"` (dry-run;
   repetir com `--apply`) — preenche a UTM do histórico a partir do export oficial. Nunca
   sobrescreve célula preenchida; linha sem e-mail casa por valor+data±3d+nome (candidato único).
4. Importar/ajustar o fluxo n8n de vendas (versão 2026-08-07 em `docs/n8n/`) — grava as 3 colunas
   nas vendas novas. ⚠️ Conferir a PRIMEIRA venda nova: se as células saírem vazias, ver o path
   da UTM no payload real (README do n8n explica).
5. Voltar a SA para **Leitor**.

**Operação mensal:** o vendedor exporta a lista dele (CSV) → colar as linhas na aba
`LEADS COMERCIAL` preenchendo `Data` (dia que entrou na lista) e `Vendedor` (slug do link:
leo, gabriel). O dashboard faz o resto no próximo sync. Vendedor novo = criar o link no padrão
(`utm_source=Comercial&utm_medium=<slug>&utm_content=comercial-<slug>&utm_term=comercial` +
`sck`) e cadastrar em `config/comercial.json`.

**Hosting futuro:** nada muda — a seção lê tudo da planilha via a mesma SA read-only do
dashboard; os CLIs de setup são one-off e rodam de qualquer máquina com a chave.

## Plugar um CRM no futuro (contrato DataSource — D6)

Implementar `class CrmSource implements DataSource` com `fetchAll()` devolvendo as 6 entidades normalizadas; registrar no factory (`server/src/datasource/index.ts`) sob um novo `DATA_SOURCE`. Nada acima da interface muda. Isso destrava as etapas "contato"/"respostas" do funil comercial e a "taxa de resposta" dos segmentos (hoje GAP).

## Meta Marketing API — ligar, rodar e rotacionar o token

Read-only (`GET /insights`). Sem `META_ACCESS_TOKEN` + `META_AD_ACCOUNT_ID` no `.env` o
dashboard roda exatamente como antes, só com a planilha.

```bash
META_ACCESS_TOKEN=EAAG...        # token com escopo ads_read na conta
META_AD_ACCOUNT_ID=1695002784410550   # só dígitos; o act_ é adicionado pelo código
META_SINCE=2024-12-01            # 1º dia do backfill (a Meta guarda ~37 meses)
META_REFRESH_DAYS=35             # janela repuxada a cada sync (atribuição muda ~28 dias)
META_CHUNK_DAYS=92               # dias por requisição
META_FUNIL=ocdm                  # funil dos RELATÓRIOS por anúncio/público
META_FUNIS_GASTO=ocdm,c2         # funis somados no INVESTIMENTO do dia (2026-08-12)
META_APPLY_SPEND=true            # false = investimento volta a ser o total da aba
```

- **1º sync = backfill** de `META_SINCE` até hoje (~90 s, ~2,3 MB em `data/meta-insights.json`).
  Os seguintes levam ~6 s: só a janela de `META_REFRESH_DAYS` é repuxada e o resto vem do
  cache em disco. Apagar `data/meta-insights.json` refaz o backfill sozinho.
- **Prova de que está ligado:** `/api/health` mostra `"source": "sheet (sheet-api) + meta"`.
  Se mostrar só `sheet-api`, o processo é velho (zumbi) ou falta credencial.

### Trocar o token (obrigatório antes de 2026-10-01)

O token em uso é de **usuário** (app "Data Center", Bruna Louise) e **expira em
2026-10-01** — quando expirar, o sync avisa `Meta API 190 — token inválido ou EXPIRADO` e
o dashboard continua servindo a planilha (não quebra). O certo é um **system user**:

1. Business Manager `941528080294046` ("01 - BM Páginas White") → Configurações do negócio
   → Usuários → **Usuários do sistema** → adicionar, função **Analista**.
2. **Adicionar ativos** → Contas de anúncio → `EPN MENTORIA` → permissão de **visualizar
   desempenho**.
3. **Gerar novo token** → app da BM → marcar **`ads_read`** → copiar.
4. Colar em `META_ACCESS_TOKEN` no `.env` e reiniciar a API. Token de system user não expira.

### Erros traduzidos (o que fazer)

| Mensagem                                  | Ação                                       |
| ----------------------------------------- | ------------------------------------------ |
| `Meta API 190 — token ... EXPIRADO`       | gerar token novo (acima)                   |
| `Meta API 200 — sem permissão de leitura` | faltou `ads_read` ou acesso à conta na BM  |
| `Meta API 100 — conta não encontrada`     | `META_AD_ACCOUNT_ID` errado (só dígitos)   |
| `Meta API 4/17 — limite de requisições`   | aumentar `SYNC_INTERVAL_MINUTES`           |
| `Please reduce the amount of data`        | tratado sozinho: a janela se parte ao meio |
