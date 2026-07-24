# Runbook — Dashboard MDA (Story 7.4)

## Rodar em dev (local)

```bash
cd MDA/mda-dashboard
npm install
cp .env.example .env          # DATA_SOURCE=mock por padrão

# terminal 1 — API (mock ou csv)
npm run dev --workspace server

# terminal 2 — web com hot reload (proxy → :8080)
npm run dev:web --workspace web        # http://localhost:5278
```

Modos de fonte (`DATA_SOURCE` no `.env`):
- `mock` — dados sintéticos completos (UI dev).
- `csv` — export local real da aba LEADS: setar `CSV_LEADS_PATH`.
- `sheet-csv` — CÓPIA por link: setar `SHEET_ID` + `SHEET_GID_*` (gids na URL da planilha).
- `sheet-api` — produção: `GOOGLE_SERVICE_ACCOUNT_JSON` (Story 7.3, ainda stub).

Sync avulso (útil pra reconciliação): `npm run sync --workspace server`.

## Build de produção

```bash
npm run build          # web (Vite) + server (tsc)
# o Fastify serve web/dist automaticamente em produção
DATA_SOURCE=sheet-csv node --experimental-sqlite server/dist/index.js
```

## Deploy na VPS (Docker + Cloudflare Tunnel)

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

| Erro | Causa | Ação |
|---|---|---|
| `403 — a planilha X NÃO está compartilhada com <sa>` | passo 5 não feito | compartilhar como Leitor |
| `403 — a Google Sheets API está DESATIVADA` | passo 2 não feito | Enable no projeto certo |
| `404 — planilha X não encontrada` | `SHEET_ID` errado | usar o ID entre `/d/` e `/edit` |
| `Abas não encontradas: …` (lista as existentes) | aba renomeada na real | ajustar `SHEET_TAB_*` no `.env` |
| `429 — quota da Sheets API` | sync agressivo | subir `SYNC_INTERVAL_MINUTES` |

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

## Plugar um CRM no futuro (contrato DataSource — D6)

Implementar `class CrmSource implements DataSource` com `fetchAll()` devolvendo as 6 entidades normalizadas; registrar no factory (`server/src/datasource/index.ts`) sob um novo `DATA_SOURCE`. Nada acima da interface muda. Isso destrava as etapas "contato"/"respostas" do funil comercial e a "taxa de resposta" dos segmentos (hoje GAP).
