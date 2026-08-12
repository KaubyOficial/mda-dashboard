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

| Aba                       | gid        | Entidade          | Volumetria (2026-07-07)                             |
| ------------------------- | ---------- | ----------------- | --------------------------------------------------- |
| **LEADS**                 | 563141629  | `Lead` (primária) | 6.341 linhas → 5.181 leads (112 quarentena + dedup) |
| **AGENDAMENTOS & CALL**   | 1902127266 | `Agendamento`     | 558 com status de call                              |
| **VENDAS**                | 7064037    | `Venda`           | 203 VENDA REALIZADA                                 |
| **ACOMPANHAMENTO DIÁRIO** | 1191656695 | `MidiaDiaria`     | 515 dias                                            |
| **MÉTRICAS ADS**          | 449290879  | `MidiaAnuncio`    | 4.416 linhas (ad×dia)                               |
| **TOP PÚBLICOS**          | 412418203  | `MidiaPublico`    | 2.138 linhas (público×dia)                          |
| RESPOSTAS                 | 1946617532 | —                 | redundante (LEADS já traz MQL); não usada na V1     |
| RESPOSTAS COMPRADORES     | 594434532  | —                 | subset de compradores; não usada                    |
| CONTEÚDO \| C2 \| GERAL   | 1021013997 | —                 | **funil C2 (outro)** — fora da V1                   |
| ADS \| C2                 | 247468249  | —                 | **funil C2 (outro)** — fora da V1                   |
| NOMENCLATURA ADS          | 420927621  | —                 | dicionário de nomes de anúncio (referência)         |

## LEADS (fonte primária) — colunas reais

| #    | Header                                       | Uso                                | Parsing                      |
| ---- | -------------------------------------------- | ---------------------------------- | ---------------------------- |
| 0    | Data e Hora                                  | data do lead                       | BR/ISO → ISO                 |
| 2    | Nome                                         | chave terciária (nameKey)          | lower, sem acento            |
| 3    | CellPhone                                    | chave fallback                     | dígitos, sem 55              |
| 4    | E-mail                                       | chave primária                     | lower+trim                   |
| 5    | MQL                                          | qualificação (vence quando válida) | {MQL, Morno, Fora do perfil} |
| 6    | CAPITAL NECESSÁRIO?                          | renda (fallback)                   | faixa BR → R$                |
| 7–11 | OCDM_utm_campaign/source/medium/content/term | temperatura, origem, pago          | unescape `\`                 |
| 13   | ORGANICO OU PAGO?                            | pago vs orgânico (vence)           | pago/organico                |

**Qualificação (total real):** Fora 3.875 · Morno 950 · MQL 356. O rótulo MQL só foi preenchido a partir de ~2026 (2025 quase todo Fora/Morno) — propriedade real da planilha, não bug.
**Temperatura (regra 2026-07-24):** deriva do pago×orgânico — **pago = quente** (todo pago manda term quente) e **orgânico = morno** (quem veio organicamente é no mínimo morno); `frio` não é mais atribuída (as regras antigas por medium marcavam a maioria do orgânico como frio no chute). **Origem** (contagem histórica pré-correção): anúncio 4.059 · orgânico 1.060 (linhas de UTM em branco) · bio 52 · comercial 10.

### Semântica das UTMs (confirmada pelo Kauê, 2026-07-24) — fonte do `config/utm-map.json`

| Campo       | Valor                                                       | Significa                                  |
| ----------- | ----------------------------------------------------------- | ------------------------------------------ |
| utm_source  | `FacebookADS`                                               | tráfego **PAGO**                           |
| utm_source  | `ig`                                                        | Instagram **ORGÂNICO** (não é anúncio!)    |
| utm_medium  | `social`                                                    | orgânico de rede social                    |
| utm_medium  | slug de público (ex. `caiu-captura-180d_vv-convite-50-30d`) | **público do PAGO**                        |
| utm_term    | `quente`                                                    | **PAGO** (todo pago manda `quente`)        |
| utm_term    | outro (`frio`)                                              | orgânico — o term **não mede temperatura** |
| utm_content | `link_in_bio`                                               | orgânico + de onde veio (link da bio)      |
| utm_content | `video-adX`                                                 | qual criativo do pago                      |

Precedência do pago×orgânico no código (`mapPagoOrganico`): coluna `ORGANICO OU PAGO?` explícita (`pago`/`organico`) → regras da UTM em ordem (source primeiro, o sinal mais forte) → coluna com o utm_term cru do fluxo n8n novo (`quente`→pago, `frio`→orgânico) → default orgânico.

## AGENDAMENTOS & CALL

`0 Data · 2 Status · 3 Nome · 4 CellPhone · 5 E-mail · 6 CAPITAL · 7 ORGÂNICO`. **Sem e-mail preenchido** (casa por telefone/nome).

- **Status** = `CALL MARCADA` (agendado) ou `CALL REALIZADA` (compareceu). Agendamento = qualquer um dos dois; comparecimento = REALIZADA.
- Distribuição: CALL REALIZADA 385 · CALL MARCADA 173.

## VENDAS

`0 Data · 1 Funil · 2 Status · 3 Nome · 4 E-mail · 5 Valor · 6 SOMA DE LEADS · 7 Mentores · 8 Phone · 9 Utm Source · 10 Utm Medium · 11 SCK`.

- **Colunas `Utm Source` / `Utm Medium` / `SCK` (J/K/L) — criadas 2026-08-07** (`npm run comercial:init -- --vendas-cols`): a UTM DO CHECKOUT, ou seja, **por qual link a venda foi fechada** — diferente do lead casado, que diz de onde a PESSOA veio (caso real: Samuel virou lead orgânico em 25/03 e comprou em 31/07 pelo link do leo). Preenchidas pelo fluxo n8n (`docs/n8n`, versão 2026-08-07) nas vendas novas e por `npm run backfill:utm` (export oficial da Cakto) no histórico. **OPCIONAIS** no parser — célula vazia = venda sem UTM registrada (fica fora da atribuição do Comercial e conta na "cobertura" da seção). Alimentam a **seção Comercial** do dashboard: `utm_medium` = slug do vendedor (leo, gabriel; `config/comercial.json`); linha só com `SCK` também atribui (o `comercial-<slug>` do utm_content aparece literal no sck). `gui` é funil do forms e fica fora da seção.

- **Coluna `Phone` (col. I) — criada 2026-08-03**, preenchida pelo fluxo n8n de vendas com `data.customer.phone` do webhook da Cakto (formato `55DD9XXXXXXXX` = 55 + DDD + 9 dígitos; `normalizePhone` canoniza para DDD + 8). É **OPCIONAL** no parser: linha antiga com a célula vazia → sem telefone, casamento segue como era. **Por que ela existe:** o e-mail da aba é o do CHECKOUT — casa só quando o comprador usou o mesmo e-mail do formulário (medido 2026-08-03: **69 de 207** vendas do histórico; jul/2026 **11 de 15**) — e o nome da LEADS é muitas vezes só o primeiro (ambíguo, 6–56 candidatos). O telefone é a chave que resgata o resto. **Vale só daqui pra frente**: as 4 vendas de jul/2026 sem lead casado (lucas mota doria · caio augusto roque rodrigues · roberto cesar de lima serrano · roberta oliveira freitas fong yin) não têm telefone gravado e continuam órfãs.
- Ordem de casamento venda↔lead: **e-mail → telefone → nome** (`crossjoin/match.ts`).
- **Backfill retroativo aplicado em 2026-08-03** (`npm run backfill:phone`, a partir do export oficial da Cakto): 173 das 214 linhas já têm telefone. Sobram sem: 36 linhas de 2025 sem e-mail e sem casamento único no export, 1 ambígua e 4 cujo e-mail não existe no export. Detalhes e método em `docs/n8n/README.md § 7`.
- ⚠️ **O `Valor` mudou de significado ao longo do tempo:** nas linhas de 2025 (sem e-mail) ele é o **preço do produto** (`Valor Base do Produto` da Cakto); nas linhas gravadas pelo fluxo n8n atual é a **comissão líquida** (`commissions[0].totalAmount`). Isso importa para qualquer reconciliação contra export: usar a chave errada não casa nada.
- Só `Status = VENDA REALIZADA` conta (203). **Valor real** por venda (§4 D7): formato `R$ 4.297,00` (⚠️ há `R$ 1000,00` sem separador de milhar — parser trata). O valor é o **líquido Cakto** (`commissions[0].totalAmount` do webhook), não o valor pago pelo cliente.
- **Reconciliação ao centavo:** Σ Valor = **R$ 819.622,40** (bate com o cálculo manual na planilha). Ticket médio R$ 4.037,55.
- **Contagem = 1 COMPRADOR = 1 venda** (decisão Kauê 2026-07-17, **reconfirmada 2026-08-03**): pagamento dividido (metade pix/metade cartão, parcelas — mesmo e-mail em ≤60 dias) gera 2+ linhas e é **unido numa venda só**, somando o valor. ⚠️ Por design a contagem fica MENOR que a "Quantidade de vendas" da Cakto, que conta cada transação — jul/2026: Cakto mostra **18 transações**, dashboard mostra **15 compradores** (Gabriela 3×→1, Leonardo 2×→1); o **faturamento bate ao centavo** (R$ 60.418,64) porque a união só soma, não descarta.
- **Reconciliação contra o Cakto (`config/vendas-exclusions.json`):** linha da aba que comprovadamente NÃO existe no export oficial da Cakto (o fluxo n8n antigo grava qualquer POST do webhook como VENDA REALIZADA, sem filtro de evento/produto) é excluída por entrada explícita `{data ISO, email, valorBRL, motivo}` — nunca por heurística. Toda exclusão aplicada vira warning no sync; entrada que não casa mais (linha já apagada da planilha) também vira warning pedindo limpeza. Caso real: `2026-07-03 · feeoliveira.rosa@gmail.com · R$ 697,51`.
- ⚠️ **Data da linha: `$today` (dia do PROCESSAMENTO) até 2026-08-03, `paidAt` a partir daí** — o fluxo n8n foi corrigido no dia 03/08. Ex. do período antigo: vendas pagas em 14/07/2026 (Davyd, Lucas Lopes) estão na aba como 16/07. Totais mensais sempre bateram com a Cakto; o deslocamento de 1–2 dias afeta só o gráfico diário e **permanece nas linhas antigas** (não reescrevemos histórico).

## LEADS COMERCIAL (aba opcional — seção Comercial, criada 2026-08-07)

`0 Data · 1 Vendedor · 2 Nome · 3 E-mail · 4 Telefone` (qualquer ordem; o parser acha por nome de coluna).

- **O que é:** a lista de contatos que cada vendedor do comercial trabalha no mês, **colada à mão** do CSV que ele exporta. Não é escrita por automação nenhuma — é o "lugar certo" da lista que antes não tinha casa.
- `Data` = dia que o contato entrou na lista (define em que mês ele conta na conversão). Linha sem data conta em QUALQUER período (warning avisa). `Vendedor` = slug do link (leo, gabriel) — sem ele a linha não conta pra ninguém.
- A linha só precisa de UMA chave (nome, e-mail ou telefone) — são as mesmas chaves do casamento venda↔lead (`normalizeEmail`/`normalizePhone`/`normalizeName`). Contato repetido (mesmo vendedor + mesma chave) conta 1×.
- **Uso na seção Comercial:** denominador da conversão (vendas do vendedor ÷ leads da lista) e auditoria — venda de alguém DA LISTA sem a UTM do vendedor no checkout vira alerta "venda sem link rastreado".
- A aba é **opcional**: se não existir, o sync segue normal com aviso. Criar com `npm run comercial:init --workspace server`.

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

## Meta Marketing API (fonte de mídia desde 2026-08-06)

A automação do gestor de tráfego parou de preencher **MÉTRICAS ADS** e **TOP PÚBLICOS** em
**2026-06-23**. Desde 06/08/2026 o dashboard lê a Marketing API (read-only) e preenche o
buraco sozinho. Conta: `act_1695002784410550` "EPN MENTORIA" (BRL · America/Sao_Paulo ·
BM `941528080294046`).

**Mapeamento** (`server/src/normalize/metaRows.ts`):

| Entidade       | Campo                                  | Meta Insights                                                            |
| -------------- | -------------------------------------- | ------------------------------------------------------------------------ |
| `MidiaAnuncio` | anuncio                                | `ad_name` (level=ad)                                                     |
|                | investimentoBRL / impressoes / cliques | `spend` / `impressions` / `inline_link_clicks`                           |
|                | lpViews / vslPlays                     | `actions[landing_page_view]` / `actions[video_view]` (3s)                |
|                | leads                                  | `actions[lead]` (fallback `offsite_conversion.fb_pixel_lead`)            |
|                | mqls                                   | **0** — qualificação só existe na aba LEADS (`crossjoin/attribution.ts`) |
| `MidiaPublico` | publico                                | `adset_name` (level=adset) **normalizado**                               |

**Público = conjunto de anúncios.** A Meta não tem breakdown de "público" — público é
segmentação, que mora no adset. A API traz sufixo de rodízio de criativos que a aba não
tinha: `00 - IG Visitou 7D - AD54 - AD56 | AD58 - AD60` → `00 - IG Visitou 7D`. Sem a poda,
o `publicoSlug()` não casaria com o `utm_medium` do lead.

**Funil vem da CAMPANHA, não do anúncio.** `[OCDM]` = o funil que este dashboard mede;
`[C2]` = funil de qualificação (fora da V1); sem tag = `outro` (duas campanhas de
DISTRIBUIÇÃO/RECONHECIMENTO de 10/09/25, R$ 699,85 no total). Só o funil de `META_FUNIL`
entra. ⚠️ **`adCode()` não distingue funil**: existem `AD02 [OCDM]` e `AD02 [C2]` e o UTM só
carrega o número (`video-ad02`) — por isso o filtro é por campanha, antes do cruzamento.

**Precedência** (`server/src/datasource/MetaSource.ts`):

1. **Anúncios e públicos:** a **aba vence** no dia em que ela tem dado; a Meta só preenche
   os dias que faltam (24/06/2026 em diante). O histórico reconciliado não é tocado.
2. **Investimento/impressões/cliques do dia:** a **Meta vence**, com o gasto **só do OCDM**.
   Medido em 2026-08-06: a coluna `Gasto` da ACOMPANHAMENTO é o total da **CONTA** (bate à
   vírgula com a API em 35 de 36 dias de 01/07–05/08), enquanto o dashboard conta leads e
   vendas só do OCDM. `alcance` continua da aba — reach é deduplicado, não é somável.
   Desligável com `META_APPLY_SPEND=false`.
3. **LP view / 3s video por dia:** sempre agregados dos anúncios (`mergeAdsIntoDiaria`).

**Efeito da mudança (medido contra o cache anterior):** total histórico R$ 68.014,81 →
R$ 68.076,30 · jul/2026 R$ 1.583,33 → **R$ 966,63** · fora ficaram R$ 2.787,11 (C2
R$ 2.087,26 + outras R$ 699,85). O saldo é positivo porque a aba também tinha buracos
(08/04/2026 estava zerada e a conta gastou R$ 281,47) e porque em set–out/2025 a aba
registrava só parte das campanhas OCDM (as ADV+ ficavam de fora).

⚠️ **Inconsistência conhecida, não resolvida por decisão de escopo:** leads gerados por
anúncio do C2 **continuam contando** como lead pago (jul/2026: 12 de 116, `utm_medium =
ig-envolvimento-30d`). Com o gasto do C2 fora, o CPL "só pago" de julho fica R$ 8,33; se
esses leads também saíssem, seria R$ 9,29. Mudar isso mexe na contagem de leads do
dashboard inteiro — decisão do Kauê.
