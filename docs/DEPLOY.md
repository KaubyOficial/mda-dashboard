# DEPLOY — Dashboard MDA

> **Para quem vai colocar isto no ar sem ter participado do desenvolvimento.**
> Este documento é auto-suficiente: stack, o que precisa existir no servidor, passo a passo,
> verificação e armadilhas conhecidas. Complementa o `runbook.md` (operação do dia a dia) e o
> `architecture.md` (desenho técnico). Se algum dos três divergir, **o código vence** — os paths
> de arquivo citados aqui são a fonte real.
>
> Estado deste doc: escrito em **2026-08-06**, conferido contra o commit `71e1a3c` e contra um
> `npm run build` executado de verdade.

---

## 0. Resumo em 30 segundos

- **Não é site estático.** É **um processo Node** que serve a API _e_ a interface na mesma porta.
- **Stack:** Node ≥22 + Fastify 5 (backend, TypeScript) · React 18 + Vite 5 + Tailwind + Recharts (frontend).
- **Dados:** lê uma **planilha Google** (Sheets API v4, read-only, service account) e guarda num
  **cache SQLite local**, ressincronizado a cada 20 min. Não existe banco de dados externo.
- **Acesso:** **Cloudflare Access** (SSO Google + allowlist de e-mails) na frente, **sem porta pública**
  no servidor. O app ainda revalida o JWT do Access por conta própria.
- **Porta:** 8080 (`PORT`).
- **Segredos:** um arquivo `.env` e uma **chave JSON de service account** — nenhum dos dois está no git.

```
Planilha Google ──(Sheets API v4 read-only, SA)──► Fastify :8080 ──► SQLite (cache local)
                                                        │
Browser ──HTTPS──► Cloudflare Access ──Tunnel──────────►┘   (mesmo processo serve web/dist)
```

---

## 1. Pré-requisitos

### No servidor

Escolha **um** dos dois caminhos (§4 ou §5):

| Caminho                                                    | Precisa de                                       |
| ---------------------------------------------------------- | ------------------------------------------------ |
| **A — Docker** (recomendado, é o que o repo já automatiza) | Docker + plugin `docker compose`                 |
| **B — Node direto**                                        | Node **≥ 22** (`engines` do `package.json`), npm |

Em ambos: disco gravável para o cache SQLite e **saída para a internet** em
`oauth2.googleapis.com`, `sheets.googleapis.com` e `<team>.cloudflareaccess.com`.
Recursos: o processo é leve (cache de agregados em memória, SQLite em arquivo); uma VPS de
2 vCPU / 2 GB sobra. A imagem Docker é `node:22-slim` e roda como usuário **não-root** (uid 10001).

### Contas de terceiros

1. **Google Cloud** — projeto `mda-mestres-do-algoritmo` com a **Google Sheets API ativada**
   e a service account `mda-dashboard@mda-mestres-do-algoritmo.iam.gserviceaccount.com`.
   Já existem. O que importa para o deploy é ter a **chave JSON** dessa SA.
2. **Planilha "Mestres do Algoritmo | OCDM"** — dona é a conta do Caio
   (`mestresdoalgoritmo@gmail.com`). A SA precisa estar compartilhada nela como **Leitor**.
3. **Cloudflare** — conta com um domínio, para criar o **Tunnel** e o app do **Access**.
   ⚠️ O domínio, o _team domain_ e o **AUD** do app **ainda não existem** — ver §11.

### Repositório

`KaubyOficial/mda-dashboard` (privado). Dois avisos sobre o clone:

- `.github/workflows/ci.yml` **não está versionado** (foi para o `.gitignore` porque o token `gh`
  não tinha o scope `workflow`). O clone não terá CI. Isso não afeta o deploy.
- `.env`, `data/` e `service-account*.json` também não vêm no clone — **por design** (§2).

---

## 2. Os dois arquivos que NÃO estão no git

Precisam ser colocados no servidor à mão, na **raiz do projeto**.

### 2.1 `service-account-mda.json` — a chave privada da service account

É o **único segredo de verdade** do sistema. Chave RSA que autentica no Google.

- Transferir por canal seguro (`scp`, gerenciador de segredos) — **nunca** por e-mail/chat/commit.
- Permissão restritiva no host: `chmod 400`.
- O `.gitignore` já cobre `service-account*.json` — mas confira antes de qualquer `git add`.
- O escopo pedido pelo código é `spreadsheets.readonly`: **o dashboard nunca escreve na planilha**.
- Rotação: gerar nova chave no GCP → substituir o arquivo → reiniciar o processo → revogar a antiga.

> Se a chave se perder, nada é destruído: gere outra no GCP. O cache SQLite é descartável e a
> planilha é a fonte da verdade.

### 2.2 `.env` — a configuração

Copiar de `.env.example` e preencher. **Não há dependência `dotenv`**: o próprio código chama
`process.loadEnvFile()` em `server/src/config.ts:14`, procurando o `.env` **na raiz do projeto**
(não no cwd). Variáveis já presentes no ambiente **vencem** as do arquivo.

`.env` mínimo de produção:

```dotenv
DATA_SOURCE=sheet-api
SHEET_ID=<id da planilha REAL — trecho entre /d/ e /edit na URL>
GOOGLE_SERVICE_ACCOUNT_JSON=./service-account-mda.json

PORT=8080
HOST=0.0.0.0                 # no Docker o compose já força isto

SYNC_INTERVAL_MINUTES=20
TIMEZONE=America/Sao_Paulo
CURRENCY=BRL
DEFAULT_TICKET=4297

AUTH_BYPASS=false            # ⚠️ OBRIGATÓRIO mudar — o .env de dev está em true
CF_ACCESS_TEAM_DOMAIN=<algo>.cloudflareaccess.com
CF_ACCESS_AUD=<AUD tag do app Access>

TUNNEL_TOKEN=<token do Cloudflare Tunnel>   # usado só pelo docker-compose
```

---

## 3. Variáveis de ambiente — referência completa

Tudo que `server/src/config.ts` lê. Nenhuma outra variável tem efeito.

| Variável                                | Default no código        | Obrigatória em produção      | O que faz                                                                    |
| --------------------------------------- | ------------------------ | ---------------------------- | ---------------------------------------------------------------------------- |
| `DATA_SOURCE`                           | `mock`                   | **sim** → `sheet-api`        | Fonte de dados. Ver ⚠️ em §10.1                                              |
| `SHEET_ID`                              | _(vazio)_                | **sim**                      | ID da planilha real                                                          |
| `GOOGLE_SERVICE_ACCOUNT_JSON`           | `./service-account.json` | **sim**                      | **Path** do arquivo de chave (resolvido contra a raiz do projeto, não o cwd) |
| `PORT`                                  | `8080`                   | não                          | Porta HTTP                                                                   |
| `HOST`                                  | `127.0.0.1`              | **sim** (Docker) → `0.0.0.0` | Interface de escuta                                                          |
| `AUTH_BYPASS`                           | `true`                   | **sim** → `false`            | Ver §6.3                                                                     |
| `CF_ACCESS_TEAM_DOMAIN`                 | _(vazio)_                | **sim**                      | Domínio do time Cloudflare Access (de onde vem o JWKS)                       |
| `CF_ACCESS_AUD`                         | _(vazio)_                | **sim**                      | AUD tag do app Access                                                        |
| `SYNC_INTERVAL_MINUTES`                 | `20`                     | não                          | Intervalo do full refresh                                                    |
| `TIMEZONE`                              | `America/Sao_Paulo`      | não                          | Fuso dos recortes de período                                                 |
| `CURRENCY`                              | `BRL`                    | não                          | Moeda de exibição                                                            |
| `DEFAULT_TICKET`                        | `4297`                   | não                          | Ticket usado **só** quando a venda não traz valor                            |
| `SHEET_TAB_LEADS`                       | `LEADS`                  | não                          | Override do nome da aba                                                      |
| `SHEET_TAB_AGENDAMENTOS`                | `AGENDAMENTOS & CALL`    | não                          | idem                                                                         |
| `SHEET_TAB_VENDAS`                      | `VENDAS`                 | não                          | idem                                                                         |
| `SHEET_TAB_MIDIA_DIARIA`                | `ACOMPANHAMENTO DIÁRIO`  | não                          | idem                                                                         |
| `SHEET_TAB_MIDIA_PUBLICO`               | `TOP PÚBLICOS`           | não                          | idem                                                                         |
| `SHEET_TAB_MIDIA_ANUNCIO`               | `MÉTRICAS ADS`           | não                          | idem                                                                         |
| `CSV_RESPOSTAS_PATH` · `CSV_LEADS_PATH` | _(vazio)_                | não                          | Só no modo `csv` (dev)                                                       |
| `SHEET_GID_*` (7 vars)                  | _(vazio)_                | não                          | Só no modo `sheet-csv` (dev)                                                 |
| `TUNNEL_TOKEN`                          | —                        | **sim** (Docker)             | Lido pelo `docker-compose.yml`, **não** pelo app                             |

**Caminhos fixos, não configuráveis** (`config.ts:94-96`): o banco é sempre
`<raiz>/data/mda.sqlite`; os configs são sempre `<raiz>/config/utm-map.json` e
`<raiz>/config/vendas-exclusions.json`.

---

## 4. Caminho A — Deploy com Docker (recomendado)

É o caminho que o repo já automatiza (`Dockerfile`, `docker-compose.yml`, `deploy.sh`).

```bash
git clone git@github.com:KaubyOficial/mda-dashboard.git
cd mda-dashboard

# 1. colocar os dois arquivos de §2 na raiz
#    .env  +  service-account-mda.json

# 2. habilitar o bind mount da chave no docker-compose.yml (está comentado — ver abaixo)

# 3. subir
bash deploy.sh
```

### 4.1 ⚠️ Ajuste obrigatório no `docker-compose.yml`

A linha do bind mount da service account está **comentada** e com **nome diferente** do que o
`.env` usa. Descomente e corrija para bater com `GOOGLE_SERVICE_ACCOUNT_JSON`:

```yaml
volumes:
  - mda-data:/app/data
  - ./service-account-mda.json:/app/service-account-mda.json:ro # ← descomentar/corrigir
```

Sem isso o container sobe, mas todo sync falha com erro de credencial.

### 4.2 `.dockerignore` — por que ele existe

O `Dockerfile` faz `COPY . .` no estágio de build. Sem um `.dockerignore`, isso colocaria o `.env`,
a **chave da service account** e o **cache SQLite (com PII de lead)** dentro da camada de build.
A imagem final é multi-stage e não os copia — mas a intermediária ficaria com os segredos no host,
e um `docker build --target build` os exporia.

Foi adicionado um `.dockerignore` em 2026-08-06 cobrindo isso (segredos, `data/`, `node_modules`,
`dist/`, `docs/`, `.git`). ⚠️ **Não foi possível rodar `docker build` para validá-lo** — a máquina
onde este doc foi escrito não tem Docker. **No primeiro deploy, confira que o build passa** e que a
imagem final não contém os segredos:

```bash
docker compose build
docker run --rm --entrypoint sh <imagem> -c 'ls -la /app; ls -la /app/data 2>&1'
# esperado: SEM .env, SEM service-account-mda.json; /app/data vazio (volume monta por cima)
```

### 4.3 O que o compose já resolve

- `env_file: .env` — o `.env` **não** é copiado para dentro da imagem (o `Dockerfile` copia só
  `server/dist`, `web/dist` e `config/`); ele chega como variáveis de ambiente. Funciona porque
  `loadEnvFile()` simplesmente não acha `/app/.env` e o código cai no `process.env`.
- Força `HOST=0.0.0.0`, `PORT=8080` e **`AUTH_BYPASS=false`** — mesmo que o `.env` diga outra coisa.
- Volume nomeado `mda-data:/app/data` — o SQLite sobrevive a restart e rebuild.
- **Nenhum `ports:`** — de propósito. A origem não expõe porta; o acesso entra pelo `cloudflared`,
  que faz conexão **outbound**. Não abra porta no firewall.
- Serviço `cloudflared` já incluído, lendo `TUNNEL_TOKEN` do ambiente.
- `restart: unless-stopped` nos dois serviços.
- `HEALTHCHECK` a cada 30s batendo em `/healthz`.

### 4.4 O que o `deploy.sh` faz

Aborta se não houver `.env` → `docker compose build` → `docker compose up -d` → aguarda o
healthcheck por até 60s (20 tentativas × 3s) e sai com erro se não passar.

---

## 5. Caminho B — Deploy sem Docker (Node direto)

```bash
git clone git@github.com:KaubyOficial/mda-dashboard.git
cd mda-dashboard

# 1. colocar .env e service-account-mda.json na raiz (§2)

npm ci
npm run build        # gera web/dist (Vite) + server/dist (tsc) — nesta ordem

node --experimental-sqlite server/dist/index.js
```

- **A flag `--experimental-sqlite` é obrigatória.** O projeto usa o `node:sqlite` nativo
  (⚠️ **não** `better-sqlite3` — não instale). Conferido: a flag funciona em Node 22 e em Node 24.
- `npm run build` **precisa rodar antes**: sem `web/dist`, o Fastify não registra o servidor de
  estáticos e a URL raiz devolve 404 — a API responde, mas não há interface.
- A pasta `data/` é criada sozinha no boot (`mkdirSync` recursivo em `db/db.ts:10`).

### 5.1 systemd (sugestão — não versionada no repo)

```ini
[Unit]
Description=MDA Dashboard
After=network-online.target

[Service]
Type=simple
User=mda
WorkingDirectory=/opt/mda-dashboard
ExecStart=/usr/bin/node --experimental-sqlite server/dist/index.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

Mantenha `HOST=127.0.0.1` e ponha o `cloudflared` apontando para `http://localhost:8080`.
**Não** exponha a 8080 no firewall.

---

## 6. Cloudflare — Tunnel + Access

### 6.1 Tunnel (ingress sem porta pública)

1. Zero Trust → Networks → Tunnels → **Create a tunnel** (tipo _Cloudflared_).
2. Copiar o **token** → `TUNNEL_TOKEN` no `.env` (Docker) ou na config do `cloudflared` (Caminho B).
3. Public hostname: `mda.<seu-dominio>` → serviço `http://dashboard:8080` (Docker, nome do serviço
   no compose) ou `http://localhost:8080` (Caminho B).

### 6.2 Access (quem pode entrar)

1. Zero Trust → Access → Applications → **Add an application** (Self-hosted).
2. Domínio: o mesmo `mda.<seu-dominio>`.
3. Identity provider: **Google (SSO)**.
4. Policy: **Allow** por **lista de e-mails** — Kauê, Caio e quem mais for autorizado.
5. Copiar o **Application Audience (AUD) Tag** → `CF_ACCESS_AUD`.
6. Copiar o **team domain** (`<algo>.cloudflareaccess.com`) → `CF_ACCESS_TEAM_DOMAIN`.
7. Reiniciar o app para reler o `.env`.

Adicionar/remover e-mail depois **não exige deploy** — é só a política no painel.

### 6.3 Como a autenticação funciona no app (`server/src/api/security.ts`)

Defesa em profundidade: se o túnel vazar, o app ainda nega.

- Um `preHandler` global valida o header `Cf-Access-Jwt-Assertion` em toda request:
  assinatura **RS256** contra o JWKS do Cloudflare (`https://<team>/cdn-cgi/access/certs`,
  cacheado 1h), mais `exp` e `aud`. Implementado com `node:crypto` — **zero biblioteca de JWT**.
- `AUTH_BYPASS=true` libera **somente** `127.0.0.1`/`::1`. Uma request remota continua exigindo
  JWT mesmo com a flag ligada. Ainda assim: **deixe `false` em produção.**
- Se `CF_ACCESS_TEAM_DOMAIN`/`CF_ACCESS_AUD` estiverem vazios e chegar request remota, a resposta é
  **500 "Access não configurado"** — o sistema falha fechado, não aberto.

> ### ⚠️ Limite importante: só `/api/*` é protegido pelo app
>
> `security.ts:96` — `if (!req.url.startsWith('/api/')) return;`. Os **estáticos**
> (`index.html`, bundle JS/CSS) são servidos **sem autenticação**; o código assume que o
> Cloudflare Access protege o perímetro.
>
> **Consequência prática:** se alguém publicar isto com porta pública e **sem** Access na frente,
> qualquer um com o link carrega a casca da interface (os dados dariam 401/500, mas a página abre).
> **Não exponha a origem diretamente.** Rotas públicas por decisão de projeto: `/healthz` e
> `/api/health` (ambas só devolvem status de saúde/sync, nenhum número do negócio).

### 6.4 O que o app já faz sozinho

- Headers em toda resposta: CSP (`default-src 'self'`), HSTS, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: no-referrer`, `X-Frame-Options: DENY`.
- Rate limit: **240 req/min** por IP.
- **Nenhum PII sai na API** — o browser recebe só agregados; nome, e-mail e telefone de lead nunca
  cruzam a fronteira. O `index.html` tem `robots: noindex, nofollow`.
- **Zero recurso externo na página** (sem CDN, sem fonte remota, sem analytics) — coerente com a CSP.

---

## 7. Primeiro boot e verificação

No boot, se o cache estiver vazio, o app roda **um sync inicial** antes de abrir a porta
(`server/src/index.ts:15-20`) — a primeira subida demora alguns segundos a mais. Depois disso o
sync passa a rodar a cada `SYNC_INTERVAL_MINUTES`.

Checklist de aceite:

```bash
# 1. o processo está vivo
curl -s localhost:8080/healthz
# → {"status":"ok"}

# 2. a fonte é a certa e o sync aconteceu
curl -s localhost:8080/api/health
# → {"status":"ok","source":"sheet-api","lastSync":"<ISO recente>","stale":false,"syncing":false}
```

- `source` **tem que ser `sheet-api`**. Se vier `mock`/`sheet-csv`, o `.env` não foi lido ou há
  processo antigo segurando a porta (§10.3).
- `lastSync` **não pode ser `null`** — null significa que o sync inicial falhou (credencial,
  compartilhamento da planilha, API desativada). Ver a tabela de diagnóstico em
  `runbook.md § Service account`.
- `stale: true` = último sync tem mais de 2h.

```bash
# 3. um número real (rodar por dentro do túnel/localhost)
curl -s "localhost:8080/api/metrics?from=2026-07-01&to=2026-07-31" | head -c 400
```

**Conferência de valor** (é um dashboard financeiro — não aceite "abriu, tá funcionando"):
julho/2026 deve bater **R$ 60.418,64 de faturamento e 15 vendas**, número reconciliado com a
Cakto em 2026-08-03. Se divergir, **não é problema de deploy** — é dado; chame o Kauê.

4. Abrir `https://mda.<dominio>` no browser: deve cair no SSO do Google, e só depois carregar o
   dashboard. Se abrir sem pedir login, o Access não está aplicado — pare e revise §6.

---

## 8. Operação

| Tarefa                             | Como                                                                                                            |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Forçar re-leitura da planilha      | botão _sync_ na UI, ou `POST /api/sync`                                                                         |
| Sync pela linha de comando         | `npm run sync --workspace server`                                                                               |
| Ver saúde / última sincronização   | `GET /api/health`                                                                                               |
| Logs (Docker)                      | `docker compose logs -f dashboard`                                                                              |
| Alterar mapeamento UTM             | editar `config/utm-map.json` → rodar um sync. **Sem deploy**                                                    |
| Parâmetros de métrica              | `config/metrics-config.json`. **Sem deploy**                                                                    |
| Excluir linha de venda (reembolso) | `config/vendas-exclusions.json` → sync. Nunca heurística: match exato de data+e-mail+valor, com aviso auditável |
| Adicionar e-mail ao acesso         | painel do Cloudflare Access. **Sem deploy**                                                                     |
| Rotacionar a chave da SA           | nova chave no GCP → substituir arquivo → `docker compose restart` → revogar a antiga                            |

**Monitoramento:** apontar um check para `/api/health` e alertar se HTTP ≠ 200 **ou** `stale=true`.
Já existe um lugar pronto para isso: `MDA/mda-monitor/config/checks.json`.

### Se o sync quebrar

1. `GET /api/health` → olhar `lastSync`/`stale`.
2. Tabela `sync_runs` no SQLite (coluna `status='error'`, coluna `error`) ou o log do container.
3. Causas comuns: header de coluna renomeado na planilha (o parser emite `warnings` que aparecem
   na própria UI), aba renomeada (→ ajustar `SHEET_TAB_*`), quota da Sheets API (→ subir
   `SYNC_INTERVAL_MINUTES`), chave revogada.
4. **Falha de sync não destrói dado**: o cache anterior é preservado e a UI marca "desatualizado".
   Isso é comportamento provado, não suposição.

---

## 9. Backup e rollback

**Não há o que fazer backup.** O SQLite em `data/` é **cache reconstruível**; a planilha Google é a
fonte da verdade. Apagar `data/` e reiniciar reconstrói tudo no sync do boot.

O que **precisa** de backup, fora do servidor: o `.env` e a chave da service account.

**Rollback:**

```bash
docker compose down
git checkout <tag-ou-commit-anterior>
bash deploy.sh
```

---

## 10. Armadilhas conhecidas (leia antes, não depois)

### 10.1 `DATA_SOURCE=mock` sobrescreve os dados reais

O cache SQLite é **compartilhado entre as fontes** e o sync é **full refresh**. Subir o processo
apontando para `mock` (ou `sheet-csv`) apaga o conteúdo real no primeiro tick de sync.
Em produção: **sempre `sheet-api`**. O `sheet-csv` lê uma **cópia congelada em 2026-07-07** e
existe só como histórico — nunca use.

### 10.2 A planilha real tem PII e não pode ser pública

O modo `sheet-csv` exige a planilha em "qualquer pessoa com o link". A planilha real tem
nome/telefone/e-mail de lead. Por isso produção é `sheet-api` + service account. **Não torne a
planilha pública para "simplificar o deploy".**

### 10.3 Processo zumbi na 8080

Já aconteceu em dev: um processo antigo, com `.env` velho, continuar servindo a porta enquanto o
novo falha com `EADDRINUSE`. Sintoma: os números não mudam depois do restart.
**Diagnóstico:** `GET /api/health` → se `source` não bate com o `.env`, é zumbi.
No Docker isso não ocorre; no Caminho B, matar o PID e confirmar a porta livre antes de subir.

### 10.4 Nome da aba, não gid

As abas são resolvidas **por nome** — gid não é estável entre cópias. O match tolera
acento/caixa/espaço extra (a aba de mídia na planilha real tem **dois espaços à esquerda**:
`"  ACOMPANHAMENTO DIÁRIO"`). Se uma aba for renomeada, o sync **falha alto listando as abas
existentes** em vez de ler a aba errada em silêncio — comportamento deliberado.

### 10.5 `npm run build` na ordem certa

O script raiz já faz `web` **antes** de `server`. Se rodar os builds à mão, mantenha a ordem — e
lembre que sem `web/dist` não existe interface (§5).

### 10.6 Fim de linha (Windows → Linux)

O git global desta máquina está com `autocrlf=true` e os repos são autorados em **LF**. Se o deploy
sair de um clone feito no Windows, confira que `deploy.sh` está com LF — `bash` quebra com CRLF
(`bad interpreter`). Clonar direto no servidor Linux evita o problema.

### 10.7 Data da venda pode deslocar 1–2 dias

O fluxo n8n antigo grava `Data` = dia do processamento, não `paidAt`. O total do mês fecha; o
gráfico diário pode deslocar. Já corrigido no fluxo vivo em 2026-08-03. **Não é bug do dashboard** —
está documentado em `data-dictionary.md § VENDAS`.

---

## 11. O que NÃO está resolvido (pendências, não bugs)

Estas coisas **bloqueiam ou condicionam** o deploy e dependem de decisão humana:

1. **A hospedagem nunca foi formalizada** (Story 1.2). O plano previa VPS Hetzner CX22 + Cloudflare,
   e o `docker-compose.yml`/`deploy.sh` já implementam essa topologia — mas **nenhum servidor foi
   provisionado**. Qualquer host com Docker serve.
2. **Cloudflare: domínio, _team domain_ e AUD não existem ainda.** Precisam ser criados (§6) antes
   de preencher `CF_ACCESS_TEAM_DOMAIN` e `CF_ACCESS_AUD`.
3. **Service account está como Editor na planilha, não Leitor.** Foi elevada temporariamente para um
   backfill em 2026-08-03 e **precisa voltar para Leitor** — o dashboard nunca escreve.
4. **`.github/workflows/ci.yml` não está no repositório remoto.** Para incluir:
   `gh auth refresh -s workflow` → remover `.github/workflows/` do `.gitignore` → commit + push.
5. **Não há e2e/smoke test automatizado de deploy** (Story 6.1 não executada). A verificação do §7 é
   manual e deve ser feita.
6. **O `.dockerignore` novo não foi validado com `docker build`** — não havia Docker na máquina onde
   foi escrito. Validar no primeiro deploy, com os comandos do §4.2.
7. **A árvore de trabalho local tem mudanças não commitadas** (ferramentas de backfill, docs, testes).
   Nada disso é necessário para rodar. Um clone do GitHub traz o estado do commit `71e1a3c`, que é
   o que este documento descreve.

---

## 12. Referência rápida de arquivos

| Arquivo                                           | Para quê                                                        |
| ------------------------------------------------- | --------------------------------------------------------------- |
| `server/src/index.ts`                             | **entrypoint do backend** (compilado em `server/dist/index.js`) |
| `web/index.html` → `web/src/main.tsx`             | **entrypoint do frontend**                                      |
| `server/src/config.ts`                            | toda leitura de env, paths e defaults                           |
| `server/src/api/server.ts`                        | rotas, cache por range, serviço dos estáticos                   |
| `server/src/api/security.ts`                      | JWT do Access, headers de segurança                             |
| `server/src/datasource/index.ts`                  | factory das fontes de dados                                     |
| `server/src/sync/sync.ts`                         | motor de sincronização (lock + intervalo + stale)               |
| `server/src/metrics/compute.ts`                   | motor de métricas puro — todas as fórmulas                      |
| `.env.example`                                    | template das variáveis                                          |
| `Dockerfile` · `docker-compose.yml` · `deploy.sh` | empacotamento e deploy                                          |
| `docs/runbook.md`                                 | operação e setup detalhado da service account                   |
| `docs/architecture.md`                            | desenho técnico                                                 |
| `docs/data-dictionary.md`                         | o que cada coluna de cada aba significa                         |
