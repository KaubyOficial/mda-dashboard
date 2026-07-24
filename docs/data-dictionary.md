# Dicionário de Dados — Dashboard MDA (Story 0.1)

> **Fonte VIVA desde 2026-07-16:** planilha REAL `SHEET_ID=1M3B5pgTk1yLZhofUQFH_l9vTIAlxb5aejFnvfxpcNx0`
> ("Mestres do Algoritmo | OCDM"), via `DATA_SOURCE=sheet-api` + service account read-only.
> Mapeamento original feito em 2026-07-07 sobre a CÓPIA (`1Y2sw…`), hoje congelada — estrutura
> confirmada idêntica na real (mesmas 11 abas, mesmos gids).
> **11 abas.** O funil da mentoria (OCDM / status APLICAÇÃO) usa 6 delas; as abas **C2** são de OUTRO funil e ficam fora da V1.

> ⚠️ **A aba de mídia tem nome com 2 ESPAÇOS À ESQUERDA na planilha real: `"  ACOMPANHAMENTO DIÁRIO"`.**
> Por isso o `sheet-api` resolve aba por nome **normalizado** (trim + colapso de espaço + sem acento +
> caixa). Match exato falharia com "aba não encontrada" → investimento 0.
>
> ⚠️ **A aba de mídia vive atrasada:** em 2026-07-16 o último dia preenchido era **20/06/2026**,
> enquanto LEADS chegava a 16/07. Quando o período pedido passa disso, o motor emite warning
> `MÍDIA: …` (investimento/CPL/CAC/ROAS subcontados, Lucro otimista). Não é bug do parser — é
> preenchimento manual em atraso.

## Mapa de abas → gid → entidade

| Aba | gid | Entidade | Volumetria (2026-07-07) |
|---|---|---|---|
| **LEADS** | 563141629 | `Lead` (primária) | 6.341 linhas → 5.181 leads (112 quarentena + dedup) |
| **AGENDAMENTOS & CALL** | 1902127266 | `Agendamento` | 558 com status de call |
| **VENDAS** | 7064037 | `Venda` | 203 VENDA REALIZADA |
| **ACOMPANHAMENTO DIÁRIO** | 1191656695 | `MidiaDiaria` | 515 dias |
| **MÉTRICAS ADS** | 449290879 | `MidiaAnuncio` | 4.416 linhas (ad×dia) |
| **TOP PÚBLICOS** | 412418203 | `MidiaPublico` | 2.138 linhas (público×dia) |
| RESPOSTAS | 1946617532 | — | redundante (LEADS já traz MQL); não usada na V1 |
| RESPOSTAS COMPRADORES | 594434532 | — | subset de compradores; não usada |
| CONTEÚDO \| C2 \| GERAL | 1021013997 | — | **funil C2 (outro)** — fora da V1 |
| ADS \| C2 | 247468249 | — | **funil C2 (outro)** — fora da V1 |
| NOMENCLATURA ADS | 420927621 | — | dicionário de nomes de anúncio (referência) |

## LEADS (fonte primária) — colunas reais

| # | Header | Uso | Parsing |
|---|---|---|---|
| 0 | Data e Hora | data do lead | BR/ISO → ISO |
| 2 | Nome | chave terciária (nameKey) | lower, sem acento |
| 3 | CellPhone | chave fallback | dígitos, sem 55 |
| 4 | E-mail | chave primária | lower+trim |
| 5 | MQL | qualificação (vence quando válida) | {MQL, Morno, Fora do perfil} |
| 6 | CAPITAL NECESSÁRIO? | renda (fallback) | faixa BR → R$ |
| 7–11 | OCDM_utm_campaign/source/medium/content/term | temperatura, origem, pago | unescape `\` |
| 13 | ORGANICO OU PAGO? | pago vs orgânico (vence) | pago/organico |

**Qualificação (total real):** Fora 3.875 · Morno 950 · MQL 356. O rótulo MQL só foi preenchido a partir de ~2026 (2025 quase todo Fora/Morno) — propriedade real da planilha, não bug.
**Temperatura (regra 2026-07-24):** deriva do pago×orgânico — **pago = quente** (todo pago manda term quente) e **orgânico = morno** (quem veio organicamente é no mínimo morno); `frio` não é mais atribuída (as regras antigas por medium marcavam a maioria do orgânico como frio no chute). **Origem** (contagem histórica pré-correção): anúncio 4.059 · orgânico 1.060 (linhas de UTM em branco) · bio 52 · comercial 10.

### Semântica das UTMs (confirmada pelo Kauê, 2026-07-24) — fonte do `config/utm-map.json`

| Campo | Valor | Significa |
|---|---|---|
| utm_source | `FacebookADS` | tráfego **PAGO** |
| utm_source | `ig` | Instagram **ORGÂNICO** (não é anúncio!) |
| utm_medium | `social` | orgânico de rede social |
| utm_medium | slug de público (ex. `caiu-captura-180d_vv-convite-50-30d`) | **público do PAGO** |
| utm_term | `quente` | **PAGO** (todo pago manda `quente`) |
| utm_term | outro (`frio`) | orgânico — o term **não mede temperatura** |
| utm_content | `link_in_bio` | orgânico + de onde veio (link da bio) |
| utm_content | `video-adX` | qual criativo do pago |

Precedência do pago×orgânico no código (`mapPagoOrganico`): coluna `ORGANICO OU PAGO?` explícita (`pago`/`organico`) → regras da UTM em ordem (source primeiro, o sinal mais forte) → coluna com o utm_term cru do fluxo n8n novo (`quente`→pago, `frio`→orgânico) → default orgânico.

## AGENDAMENTOS & CALL

`0 Data · 2 Status · 3 Nome · 4 CellPhone · 5 E-mail · 6 CAPITAL · 7 ORGÂNICO`. **Sem e-mail preenchido** (casa por telefone/nome).
- **Status** = `CALL MARCADA` (agendado) ou `CALL REALIZADA` (compareceu). Agendamento = qualquer um dos dois; comparecimento = REALIZADA.
- Distribuição: CALL REALIZADA 385 · CALL MARCADA 173.

## VENDAS

`0 Data · 2 Status · 3 Nome · 4 E-mail · 5 Valor · 7 Mentores`. **Só nome/valor confiáveis** (casa por nome; e-mail parcial).
- Só `Status = VENDA REALIZADA` conta (203). **Valor real** por venda (§4 D7): formato `R$ 4.297,00` (⚠️ há `R$ 1000,00` sem separador de milhar — parser trata).
- **Reconciliação ao centavo:** Σ Valor = **R$ 819.622,40** (bate com o cálculo manual na planilha). Ticket médio R$ 4.037,55.

## ACOMPANHAMENTO DIÁRIO (mídia diária)

`0 Data · 1 Gasto · 2 Leads · 3 Cliques no Link · 4 Alcance · 5 Impressões · 6 VPG · 7 IniciouForms · 8 MQL · 9 Morno`.
- `MidiaDiaria`: investimento=Gasto, cliques=Cliques no Link, impressoes, alcance, formsIniciados=IniciouForms, formsFinalizados=Leads.
- LP-view e VSL-play (funil de mkt) vêm agregados por dia da aba MÉTRICAS ADS.
- ⚠️ **VPG ≈ Landing Page View** (36.858 ≈ 37.293, 98,8%). VPG é o nome que a planilha dá a "visualizou a LP" — a MESMA coisa que o LP View das ADS, **não** o clique no botão. Por isso o dashboard usa o LP View (ADS) para "Visualizou a LP" e não duplica com VPG.
- **Coluna OPCIONAL `Cliques no Botão` (`chegouCadastro`)** — cliques no botão da VSL (`/monetizacao-vsl/` → `/cadastro-monetizacao/`), a etapa ENTRE "chegou na LP" e "começou o formulário". Aliases aceitos: `Cliques no Botão`/`Botão LP`/`Chegou Cadastro`/`Cadastro`/`Clicou no Botão`. Se a coluna não existir, fica 0 e a etapa **some** do funil (não vira degrau falso). Também pode vir como custom conversion na MÉTRICAS ADS (`Chegou Cadastro`), agregada por dia — a coluna manual do dia vence.
- **Reconciliação:** Σ Gasto = **R$ 63.021,88** (exato).

### Funil de marketing — mapeamento das 2 páginas da LP (confirmado com o Kauê, 2026-07-17)
`/monetizacao-vsl/` (VSL) **carregou** = "Visualizou a LP" (Landing Page View / VPG) → clicou "QUERO ACELERAR" e foi pro `/cadastro-monetizacao/` (disclaimer) = **"Clicou no botão"** (`chegouCadastro`, opcional) → clicou "QUERO ACESSAR" e o form começou = "Início forms" (IniciouForms, desde 2026-03-18) → enviou o form = **Lead**.

## MÉTRICAS ADS (por anúncio) — traz leads e MQL próprios

`0 date · 1 Ad Name · 2 Spend · 3 Action Leads · 4 Impressions · 5 Inline Link Clicks · 6 Action Landing Page View · 7 Action 3s Video Views · 18 MQL`.
- `MidiaAnuncio`: investimento=Spend, cliques=Inline Link Clicks, lpViews=LP View, vslPlays=3s Video, **leads=Action Leads, mqls=MQL**. → S9 sem achismo de atribuição.

## TOP PÚBLICOS (por público) — traz leads

`0 DATA · 1 NOME · 2 GASTO · 3 LEADS · 4 IMPRESSÕES · 5 CLIQUES · 6 VIDEO VIEW · 7 VPG · 8 ALCANCE · 9 PÚBLICO`.
- `MidiaPublico`: investimento=GASTO, **leads=LEADS**, impressoes, cliques, publico=PÚBLICO. → S8 com CPL real. **MQL por público não existe** na aba (custo/MQL = "—").

## GAPs REAIS remanescentes (não é achismo — a coluna não existe)

- **Funil comercial:** as abas rastreiam Agendamento → Comparecimento → Venda. Não há etapa "contato"/"resposta" registrada (só com CRM). Por isso o funil tem 4 etapas, não 6.
- **Segmentos — "taxa de resposta":** idem (sem etapa de resposta). Agend/comparec/venda por segmento vêm do casamento com AGENDAMENTOS/VENDAS.
- **Cobertura do casamento venda↔lead:** ~64% (129/203). A aba VENDAS começa em 2024-12 e a LEADS só em 2025-08 — vendas anteriores não têm lead correspondente. Não afeta faturamento/CAC/ticket (que são por data), só a atribuição de venda a segmento de qualificação.
- **Funil C2:** existe (2 abas) mas é outro funil; incluir depende de decisão do Kauê.
