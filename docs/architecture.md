# Arquitetura — Dashboard MDA (Story 1.1)

> Fonte de verdade do desenho técnico. Complementa o `PLANO-MESTRE.md` (§5) com o estado real do código.

## 1. Visão de alto nível

```
Google Sheets (CÓPIA / real)
        │  fetchAll()  (DataSource pluggable)
        ▼
  Normalizador  ── qualificação (MQL/Morno/Fora) + UTM→temperatura/origem + parsing BR
        │
        ▼
  DataSnapshot (6 entidades)  ──►  SQLite (cache reconstruível, node:sqlite)
        │                                │  readSnapshot()
        │  enrichLeads (LEADS×AGEND×VENDAS por e-mail/telefone)
        ▼                                ▼
                          Motor de métricas (puro, §4)  ──►  cache por range
                                         │
  Browser ◄── HTTPS + Cloudflare Access JWT ── Fastify (REST, só agregados)
```

O **browser nunca fala com o Google**. Nenhum ID de planilha, e-mail, telefone ou dado bruto chega ao client — a API devolve apenas agregados do range pedido.

## 2. Monorepo

```
mda-dashboard/
├── config/            utm-map.json · metrics-config.json (editáveis sem deploy)
├── docs/              PLANO-MESTRE · architecture · data-dictionary · runbook · stories/
├── server/            Node 22 + Fastify + node:sqlite (TS strict)
│   └── src/
│       ├── domain/        entities.ts (contrato das 6 entidades) · metrics.ts (DTOs)
│       ├── datasource/    DataSource + CsvSource · MockSource · SheetSource · index (factory)
│       ├── normalize/     qualification · utm · leadRows (parsers de aba)
│       ├── db/            schema · db · repo (write/readSnapshot)
│       ├── crossjoin/     match (LEADS×AGEND×VENDAS)
│       ├── sync/          sync (engine + lock + stale)
│       ├── metrics/       period · helpers · compute (todas as fórmulas §4)
│       ├── api/           server (rotas) · security (Access JWT, headers, rate limit)
│       ├── cli/           sync.ts (`npm run sync`)
│       └── index.ts       boot
└── web/               React 18 + Vite + TS + Tailwind + Recharts
    └── src/            App · components/ (Shell, KpiHero, DailyCharts, LeadsDetail, Funnels, Segments, Reports)
```

## 3. Contrato `DataSource` (boundary pluggable — D6)

Uma interface, várias origens. `fetchAll(): Promise<DataSnapshot>` entrega **6 entidades normalizadas** (`Lead`, `Agendamento`, `Venda`, `MidiaDiaria`, `MidiaPublico`, `MidiaAnuncio`) + `warnings`.

| Implementação | Uso | Estado |
|---|---|---|
| `MockSource` | dev de UI sem planilha — dados sintéticos determinísticos das 6 entidades | ✅ |
| `CsvSource` | export local isolado (aba LEADS) | ✅ |
| `SheetSource` (`sheet-csv`) | **CÓPIA real por gid — 6 abas OCDM** | ✅ **reconciliado ao centavo** |
| `SheetSource` (`sheet-api`) | produção: Sheets API v4 + service account | 🟡 stub (Story 7.3) |
| `CrmSource` / `MetaAdsSource` | fase 2 | encaixe documentado, não implementado |

Trocar de fonte = variável `DATA_SOURCE` no `.env`. Nada acima da interface muda.

O `SheetSource` (`sheet-csv`) lê as 6 abas reais do funil OCDM por gid (ver `docs/data-dictionary.md`):
LEADS, AGENDAMENTOS & CALL, VENDAS, ACOMPANHAMENTO DIÁRIO, MÉTRICAS ADS, TOP PÚBLICOS. Sync real: 5.181 leads,
558 agendamentos, 203 vendas, 515 dias de mídia. **Faturamento R$ 819.622,40 e investimento R$ 63.021,88
batem ao centavo** com o cálculo manual. As abas C2 são de outro funil e não entram na V1.

## 4. Fluxo de dados e cruzamento

- **Chaves de casamento:** e-mail `lowercase+trim` (primário); telefone só-dígitos sem `55`/9-extra (fallback). Duplicata de lead → submissão mais recente vence.
- **Venda órfã** (sem lead casado) → bucket "não atribuído": entra no faturamento total, fora dos segmentos.
- **Datas:** tudo ISO `YYYY-MM-DD` no fuso `America/Sao_Paulo`. Faturamento entra no range pela **data da venda** (§4).

## 5. Motor de métricas

`server/src/metrics/compute.ts` é **puro** (DataSnapshot + range → MetricsResponse) — por isso é testável isolado com fixtures calculadas à mão (golden tests, Story 3.9). Todas as fórmulas seguem o glossário §4. Decisões travadas:
- CPL/custos por segmento usam **investimento total** do período.
- Taxas de funil = **etapa ÷ etapa anterior**.
- "Mês atual" compara **dia 1..N vs dia 1..N do mês anterior** (clampado ao último dia).
- Divisão por zero → `null` (nunca crash; a UI mostra "—").

**GAPs conhecidos** (fonte atual não traz a coluna — entram quando a CÓPIA completa / adapter comercial chegar): etapas "contato"/"respostas" do funil comercial; "taxa de resposta" dos segmentos; leads/MQLs por público. Cada um emite `warning` visível na UI.

## 6. Segurança (Epic 5)

1. **Perímetro:** Cloudflare Access (SSO Google + allowlist) na frente; origem só aceita o túnel (`cloudflared`), sem portas públicas.
2. **Defesa em profundidade:** `server/src/api/security.ts` valida o JWT `Cf-Access-Jwt-Assertion` em toda request `/api/*` (JWKS RS256 via `node:crypto`, checa `aud`/`exp`). Em dev, `AUTH_BYPASS=true` libera **só localhost**.
3. **Headers:** CSP estrita, HSTS, X-Content-Type-Options, Referrer-Policy, frame-ancestors none.
4. **PII zero:** API só devolve agregados; sem nomes/e-mails/telefones.
5. **Rate limit** por IP (240/min). **Segredos** só no servidor (`.env` gitignored; SA read-only).

## 7. Hosting (D3 — Story 1.2, decisão do Kauê pendente)

Recomendado: **VPS Hetzner CX22 + Docker Compose + Cloudflare Tunnel + Access**. `Dockerfile` (slim non-root) + `docker-compose.yml` + `deploy.sh` prontos. Staging custo-zero = PC local + Tunnel.

## 8. Desvios em relação ao plano (registrados)

- **Testes:** `node:test` nativo em vez de vitest (mais leve; mesmo objetivo — `npm test` roda 21 testes verdes).
- **JWT:** validação com `node:crypto` em vez de lib externa (zero dependência, menos superfície).
- **Bundle web:** ~167 KB gz (Recharts domina). Meta < 300 KB gz atendida no gzip; JS bruto 596 KB → code-split é tarefa da Story 8.1.
