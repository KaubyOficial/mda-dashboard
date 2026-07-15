# Dashboard da Mentoria MDA

Dashboard web de página única com todos os números do funil high-ticket do Caio: faturamento, investimento, lucro, leads, funil de marketing, funil comercial, segmentação MQL/Morno/Fora, relatórios por público e por anúncio — lidos de uma planilha Google Sheets, com filtro de período, comparação com período anterior e acesso protegido por SSO Google (Cloudflare Access).

## Stack
- **server/** — Node 22 + Fastify + `node:sqlite` (cache), motor de métricas puro (§4).
- **web/** — React 18 + Vite + TypeScript + Tailwind + Recharts, tema dark MDA.
- **config/** — `utm-map.json`, `metrics-config.json` (editáveis sem deploy).
- **docs/** — plano-mestre, arquitetura, dicionário de dados, runbook, `stories/`.

## Começar
```bash
npm install
cp .env.example .env      # DATA_SOURCE=mock por padrão
npm run dev --workspace server      # API em :8080 (faz sync inicial)
npm run dev:web --workspace web     # UI em :5173
```

## Comandos
| Comando | O quê |
|---|---|
| `npm run lint` | ESLint (0 warnings) |
| `npm run typecheck` | tsc server + web |
| `npm test` | golden tests do motor de métricas (21) |
| `npm run build` | build web + server |
| `npm run sync --workspace server` | sync avulso (reconciliação) |

## Estado (2026-07-07)
Núcleo **completo, ligado à CÓPIA real (6 abas OCDM) e reconciliado ao centavo** (faturamento R$ 819.622,40 · investimento R$ 63.021,88 · 5.181 leads · 203 vendas): scaffold, data layer, motor de métricas com golden tests, UI das 9 seções, segurança (JWT Access + headers + rate limit), Docker/CI/runbook. **Bloqueado só em decisões externas:** hosting/Cloudflare (Kauê, Story 1.2), service account p/ produção (5.4/7.3). Ver `docs/stories/README.md` e `docs/data-dictionary.md`.

Para rodar contra a planilha real: `cp .env.example .env` (já vem com `SHEET_ID` + gids reais) → `DATA_SOURCE=sheet-csv npm run dev --workspace server`.
