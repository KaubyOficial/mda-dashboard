# Dashboard da Mentoria MDA

Dashboard web de página única com todos os números do funil high-ticket do Caio: faturamento, investimento, lucro, leads, funil de marketing, funil comercial, segmentação MQL/Morno/Fora, relatórios por público e por anúncio — lidos de uma planilha Google Sheets, com filtro de período, comparação com período anterior e acesso protegido por SSO Google (Cloudflare Access).

## Stack
- **server/** — Node 22 + Fastify + `node:sqlite` (cache), motor de métricas puro (§4).
- **web/** — React 18 + Vite + TypeScript + Tailwind + Recharts, tema dark MDA.
- **config/** — `utm-map.json`, `metrics-config.json` (editáveis sem deploy).
- **docs/** — plano-mestre, arquitetura, dicionário de dados, runbook, `stories/`.

## Começar
Dois terminais, a partir da raiz do projeto:
```bash
npm install
cp .env.example .env      # o server lê este arquivo no boot; ajuste DATA_SOURCE (ver tabela abaixo)
npm run dev               # terminal 1 — API em :8080 (sync inicial só se o cache estiver vazio)
npm run dev:web           # terminal 2 — UI em :5173 (é a URL que se abre; faz proxy do /api pra :8080)
```
Vars setadas no shell vencem as do `.env`, então dá pra sobrepor pontualmente:
`DATA_SOURCE=mock npm run dev` (bash) · `$env:DATA_SOURCE="mock"; npm run dev` (PowerShell).

### Fontes de dados (`DATA_SOURCE`)
| Modo | Lê de | Quando usar |
|---|---|---|
| `sheet-api` | **planilha REAL**, Sheets API v4 read-only + service account | **produção** — é o único que lê a planilha viva |
| `sheet-csv` | cópia via link público, export CSV por gid | dev sem credencial |
| `csv` | exports locais de LEADS | dev offline |
| `mock` | dados sintéticos | UI sem planilha |

`sheet-csv` só funciona em planilha **"qualquer pessoa com o link"**. A planilha real tem **PII de lead**
(nome/telefone/e-mail) e não deve ser pública → produção é `sheet-api`. Setup da service account
(~5 min, 1×): **`docs/runbook.md` § Service account (sheet-api)**.

> ⚠️ O cache SQLite (`data/mda.sqlite`) é compartilhado entre as fontes e o sync é *full refresh*: subir com
> `DATA_SOURCE=mock` sobrescreve os dados reais do cache no primeiro sync do intervalo (~20 min).

## Comandos
| Comando | O quê |
|---|---|
| `npm run lint` | ESLint (0 warnings) |
| `npm run typecheck` | tsc server + web |
| `npm test` | golden tests do motor de métricas + auth/Sheets API (39) |
| `npm run build` | build web + server |
| `npm run sync --workspace server` | sync avulso (reconciliação) |

## Estado (2026-07-16)
Núcleo **completo e reconciliado ao centavo** (faturamento R$ 819.622,40 · investimento R$ 63.021,88 ·
5.181 leads · 203 vendas): scaffold, data layer, motor de métricas com golden tests, UI das 9 seções,
segurança (JWT Access + headers + rate limit), Docker/CI/runbook.

**Modo `sheet-api` implementado (2026-07-16)** — antes era um stub que lançava erro. Motivo: a fonte
em uso (`sheet-csv`) era uma **cópia congelada em 2026-07-07** (último lead 07/07), que nunca
atualizaria. Falta só o setup manual da service account (runbook § Service account) para ler a
planilha **viva**. Outro bloqueio externo: hosting/Cloudflare (Kauê, Story 1.2).

Ver `docs/stories/README.md` e `docs/data-dictionary.md`.
