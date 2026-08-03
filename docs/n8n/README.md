# n8n — Diagnóstico e correção dos fluxos da planilha OCDM (2026-07-23)

Investigação disparada por: *"um dos dias teve 44 leads pagos, 54 respostas no formulário,
e na lista de leads não tem nenhum"*. Tudo abaixo foi medido na **planilha real**
(`1M3B5pg…`, via service account read-only do dashboard) e nos **exports reais** dos fluxos n8n.

## O que foi encontrado (fatos medidos, não hipóteses)

### 1. O dia citado é 14/06/2026 — e os leads ESTÃO na aba LEADS
- ACOMPANHAMENTO DIÁRIO 14/06: **Leads = 44** (número da Meta) ✔
- RESPOSTAS 14/06: **54 linhas** ✔
- LEADS 14/06: **56 linhas** — nas linhas **4896–4951** da aba.
- Se um filtro por data mostrou "nenhum": o n8n grava a coluna `Data` como **TEXTO**
  (`"14/06/2026"`), e filtro/ordenação de data do Sheets não casa texto com data.
  Não faltam linhas nesse dia.

### 2. ✅ RESOLVIDO (2026-07-23, confirmação do Kauê): queda de pagos = CORTE DE ORÇAMENTO
O orçamento caiu de ~R$ 300/dia para **R$ 40–60/dia** — não houve vazamento contínuo de webhook.
A conta fecha: julho tem ~R$ 1.050 de gasto (01–23/07, agora preenchido) ÷ 79 leads fb-ads
na planilha = **CPL ~R$ 13**, consistente com o CPL ~R$ 11 de junho. Números batem entre
gerenciador, planilha e dash. As perdas REAIS ficaram restritas aos blackouts do §3.
O texto abaixo fica como registro da investigação.

### 2b. (histórico da investigação) captação de PAGOS caiu em 17/06 (−85%)
| Período | Pagos/dia na LEADS | Orgânico/dia |
|---|---|---|
| 01–16/06 | **~29/dia** (468 em 16 dias) | ~7/dia |
| 17/06–23/07 | **~4/dia** (154 em 37 dias) | ~7/dia (inalterado) |

- `ig-visitou-7d`: 286 → 42 linhas (praticamente extinto). `caiu-captura`: 123 → 70.
- **Exatamente em 17/06**: o Gasto da mídia marca `R$ 0,00` e para de ser preenchido;
  `IniciouForms` morre; e o formulário foi trocado (comentário no Code node: *"o formulário
  mudou e os índices vieram desalinhados"*).
- **Não dá pra decidir daqui** se (a) as campanhas frias/de escala foram pausadas em 17/06
  (aí a planilha está "certa" e o que falta é mídia rodando) ou (b) os anúncios seguem
  gerando ~30–44 leads pagos/dia e o **webhook do form novo não dispara** para a LP paga
  (aí são ~1.000 leads perdidos — nem planilha, nem ActiveCampaign, nem comercial).
  **Checar no Meta Ads Manager o gasto de julho** e o total de respostas na plataforma do
  form num dia recente. Se (b): conferir na plataforma do formulário se o webhook aponta
  para `https://webhook.envious.com.br/webhook/mentoria-cadastro` em TODAS as
  variantes/páginas do form (a LP paga pode estar com outra URL/versão antiga).

### 3. Dias com ZERO leads (blackout total do pipeline) — confirmado pelo Kauê: erro no webhook
- **24–28/06** (0 nos dias 24, 25, 27, 28; 1 no dia 26): **perdidos PARA SEMPRE**. E foram dias
  de orçamento CHEIO (R$ 262–328/dia, ~R$ 1.480 no total) → estimativa de ~100–125 leads pagos
  que nunca entraram em planilha/ActiveCampaign/comercial.
- **14/07** (zero em LEADS e RESPOSTAS): executions falharam e o Kauê **re-rodou no dia 15/07**
  → os leads existem, mas com `Data = 15/07/2026` (o fluxo grava `DateTime.now()` do
  processamento, não a hora do envio). Por isso 14/07 fica furado e 15/07 tem pico (19).
  Nota permanente de dado: qualquer análise por dia verá esse deslocamento.
- 20/06 e 20/07 quase zero (4–5) — compatível com o orçamento reduzido, não com falha.
- Padrão compatível com a **credencial OAuth do Google expirando** (app GCP em modo
  Testing → refresh token morre em ~7 dias) — exatamente o motivo do fluxo novo se chamar
  *"teste sheets vitalicio"* (service account não expira). Webhook não tem retry: cada
  janela dessas = leads perdidos para sempre.
- Os exports "NOVO ATIVO"/"CORRIGIDO" de 26/06 mostram que estavam mexendo no fluxo no
  meio do blackout de 24–28/06.

### 4. Bugs nos fluxos (corrigidos nos JSONs desta pasta)
**Fluxo velho** (`mentoria-cadastro2`, OAuth — ainda ATIVO):
- Coluna `CAPITAL NECESSÁRIO?` referencia `respostas.tem_valor_disponivel`, que o Code node
  **não produz** desde que o form mudou → coluna morta desde **29/05** (última linha
  preenchida: 4441). A pergunta de capital saiu do form; não há o que derivar.
- A tentativa de conserto de 26/06 ("CORRIGIDO") tem **sintaxe inválida**:
  `$json.(respostas.tem_valor_disponivel || '')`.
- Usa OAuth (expira — causa provável dos blackouts).

**Fluxo novo** (`mentoria-cadastro`, service account — assumiu em 22/07):
- Grava o `utm_term` CRU (`quente`/`frio`) na coluna `ORGANICO OU PAGO?` em vez de
  `pago`/`organico` → quebra filtros/fórmulas humanas na planilha (o dashboard já foi
  blindado, ver §6).
- `JSON.parse(item.body)` quebra se o form postar `application/json` (body já objeto).

**Fluxo de vendas** (`ocdm-vendas`):
- **Sem filtro de evento**: qualquer POST vira "VENDA REALIZADA". Se a Cakto mandar
  `refund`/`chargeback`/pix gerado para o mesmo webhook, entra como venda.
- **Sem filtro de produto**: compra aprovada de QUALQUER produto da conta Cakto viraria
  linha na aba. **Caso real (achado 2026-08-03):** linha `03/07/2026 · Luis Fernando de
  Oliveira Rosa · R$ 697,51` que NÃO existe no export oficial da Mentoria (18 transações ·
  R$ 60.418,64 em jul/2026) — inflava o faturamento do dashboard em R$ 697,51. O JSON
  corrigido desta pasta agora filtra também `data.product.name` contém "Mentoria"
  (2ª condição no nó IF). Enquanto o fluxo corrigido não é importado, o dashboard exclui a
  linha via `config/vendas-exclusions.json` (reconciliação explícita, com warning).
- `Data` = dia do processamento (`$today`), não a data do pagamento (`paidAt`) — por isso
  vendas pagas 14/07/2026 (Davyd, Lucas Lopes) estão na aba como 16/07.
- `Valor` = `commissions[0].totalAmount` = **líquido** após taxas Cakto (ex.: 844,51 de um
  pagamento de 847,99). O histórico da aba já é assim (consistente), mas fica documentado:
  o "faturamento" do dashboard é o líquido Cakto.
- Usa OAuth (mesmo risco de expirar).

### 5. Outros achados
- **7 duplicatas** mesmo e-mail/mesmo dia desde junho (submissão dupla do form). O dashboard
  deduplica por id (e-mail+fone+data+nome); a planilha fica com as duas linhas (inofensivo).
- A coluna `Leads` do ACOMPANHAMENTO DIÁRIO **mudou de significado em 17/06**: era o número
  da Meta digitado à mão; virou a fórmula `=IF(A540=""; ""; COUNTIFS(LEADS!B:B; A540))`
  (verificado com render FORMULA da API, linhas 540–580; MQL e Morno idem). Ou seja: ela
  conta as linhas da própria aba LEADS — **incluindo orgânico** — e não "leads chegando dos
  anúncios". Auto-referente: se o webhook perder leads, ela cai junto e não acusa nada.
- A aba RESPOSTAS é escrita pela MESMA execução do n8n (nó "Pesquisa", logo depois do nó
  "Leads"). A atribuição FacebookADS lá está correta quando o lead chega, mas o VOLUME
  despencou igual: **28,9 linhas FacebookADS/dia (01–16/06) → 3,6/dia (julho)** — com
  17–21/06 em ZERO fb-ads (5 dias seguidos) enquanto o orgânico fluía normal, depois
  rajadas em 22–23 e 29–30/06 (~20/dia) e goteira em julho. Esse padrão liga-desliga não é
  compatível com "campanha rodando normal com CPL um pouco maior".
- Não existe NENHUMA linha `frio` na história da aba: todo o pago do funil é remarketing
  `quente`. (Fato do funil, não bug.)
- Os paths dos webhooks já foram renomeados (UUID → `mentoria-cadastro2`;
  `acelerador-mda-cakto` → `ocdm-vendas`). Cada rename quebra quem posta na URL antiga.

### 6. Dashboard (já corrigido e testado neste repo)
`mapPagoOrganico` agora entende `quente`/`frio` na coluna `ORGANICO OU PAGO?` → `pago`
(server/src/normalize/utm.ts). Antes já caía certo pelo fallback de `utm_source`
(FacebookADS→pago), mas agora não depende disso. Lint · typecheck · **51 testes** verdes.

## Como aplicar (checklist)

1. **Importar os 2 JSONs** desta pasta no n8n (Workflows → Import from File), ou aplicar as
   mesmas mudanças direto nos fluxos vivos (são pequenas — ver §4).
2. **Webhook path do fluxo de leads — AJUSTAR ANTES DE ATIVAR** (achado 2026-08-03: o
   export real do fluxo ATIVO escuta em `mentoria-cadastro2`, não `mentoria-cadastro` como
   este JSON corrigido assume). Se ativar o corrigido sem ajustar, ele escuta numa URL que
   o form não usa e **nenhum lead entra**. Como corrigir (opção A, recomendada — não mexe
   no form):
   a. Importar o JSON corrigido (fica INATIVO por padrão);
   b. Abrir o workflow importado → clicar 2× no nó **Webhook** → campo **Path** → trocar
      `mentoria-cadastro` por **`mentoria-cadastro2`** → Save;
   c. **Um path só pode estar ativo em UM workflow por vez** → desativar o fluxo atual
      (toggle Active OFF) e IMEDIATAMENTE ativar o corrigido (janela de segundos sem
      receptor; fazer em horário de pouco tráfego);
   d. Testar com um envio real do form e conferir a linha nova na aba LEADS.
   Opção B (se preferir migrar a URL): manter `mentoria-cadastro` no corrigido, ativar,
   e trocar a URL do webhook NA PLATAFORMA DO FORM para
   `https://webhook.envious.com.br/webhook/mentoria-cadastro` em TODAS as variantes/
   páginas do quiz (inclusive a da LP paga) — só desativar o fluxo antigo depois de
   confirmar que leads chegam pelo path novo.
3. Se usou a opção A do item 2, este passo já aconteceu (o corrigido assumiu o path
   `mentoria-cadastro2`). Se usou a opção B: **desativar o fluxo velho** DEPOIS de
   confirmar na plataforma do formulário que nenhuma página/variante ainda posta em
   `mentoria-cadastro2` (checar TODAS as versões do quiz, inclusive a da LP paga —
   suspeita central do §2).
4. No fluxo de vendas: o webhook da Cakto já deve estar apontando para
   `.../webhook/ocdm-vendas`; confirmar no painel da Cakto (Configurações → Webhooks) e
   conferir quais **eventos** estão marcados (o filtro novo segura, mas o certo é enviar
   só `purchase_approved`) e quais **produtos** (o webhook da Cakto aceita escopo por
   produto — marcar só a Mentoria; o filtro novo por `data.product.name` segura de
   qualquer forma).
   ⚠️ Depois de importar o fluxo corrigido, apagar da planilha a linha fantasma
   `03/07/2026 · Luis Fernando de Oliveira Rosa · R$ 697,51` (aba VENDAS, linha 202 em
   03/08/2026) e remover a entrada correspondente de `config/vendas-exclusions.json` do
   dashboard (o sync avisa quando ela ficar obsoleta).
   ⚠️ **Reembolso/chargeback**: se uma venda aprovada for reembolsada depois, a Cakto tira
   ela do dashboard oficial, mas a linha fica na aba → divergência nova. O fluxo corrigido
   não trata (o webhook manda `refund`/`chargeback`, mas atualizar linha existente por
   e-mail+valor no Sheets via n8n é frágil); se acontecer, registrar a linha em
   `config/vendas-exclusions.json` com motivo "reembolsada".
5. **Service account**: os fluxos corrigidos usam a credencial "Google Service Account
   account" (a mesma que o fluxo novo de leads já usa com sucesso desde 22/07). Ela precisa
   de **Editor** na planilha. ⚠️ A SA do *dashboard* (`mda-dashboard@…`) deve continuar
   **Leitor** — ideal ser duas SAs diferentes; se for a mesma, saiba que ela está com
   Editor de novo.
6. **Alarme de falha**: em n8n → Settings do workflow → Error Workflow, criar um fluxo de
   erro que mande e-mail/Telegram. Foi a ausência disso que deixou 5 dias de blackout
   passarem batido em junho.
7. **Pendências humanas que nenhum código resolve** (estado em 23/07):
   - ✅ Gasto do ACOMPANHAMENTO DIÁRIO: automação do gestor de tráfego já preencheu
     **até 23/07** (verificado na planilha). CAC/ROAS/Lucro de julho voltam a ser reais no
     próximo sync do dashboard.
   - ⏳ **MÉTRICAS ADS e TOP PÚBLICOS ainda param em 23/06** (verificado): os relatórios por
     anúncio/por público e a etapa "Visualizou a LP" do funil ficam sem julho até a
     automação cobrir essas 2 abas também.
   - ⏳ `IniciouForms` vazio desde 18/06 — a etapa "Início forms" do funil segue parcial.
   - Pergunta do §2: **respondida** (orçamento reduzido de propósito; campanhas normais).
