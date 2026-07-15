# Runbook — Dashboard MDA (Story 7.4)

## Rodar em dev (local)

```bash
cd MDA/mda-dashboard
npm install
cp .env.example .env          # DATA_SOURCE=mock por padrão

# terminal 1 — API (mock ou csv)
npm run dev --workspace server

# terminal 2 — web com hot reload (proxy → :8080)
npm run dev:web --workspace web        # http://localhost:5173
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

## Monitoramento (Story 7.2)

- `/healthz` → liveness. `/api/health` → `{ lastSync, stale, syncing }`.
- Adicionar 1 entrada em `MDA/mda-monitor/config/checks.json` apontando pra `/api/health`; alertar se `stale=true` (sync > 2h) ou HTTP != 200.

## Se o sync quebrar

1. `GET /api/health` → ver `lastSync`/`stale`.
2. Ver `sync_runs` no SQLite (`status='error'`, coluna `error`) ou o log do container.
3. Causas comuns: header de coluna renomeado na planilha (o parser avisa em `warnings`), link da CÓPIA revogado, quota da Sheets API. O cache anterior é mantido em caso de falha (a UI marca "dados desatualizados").

## Plugar um CRM no futuro (contrato DataSource — D6)

Implementar `class CrmSource implements DataSource` com `fetchAll()` devolvendo as 6 entidades normalizadas; registrar no factory (`server/src/datasource/index.ts`) sob um novo `DATA_SOURCE`. Nada acima da interface muda. Isso destrava as etapas "contato"/"respostas" do funil comercial e a "taxa de resposta" dos segmentos (hoje GAP).
