# IDs de produto do Android (formato com plano base) e restauração de compra

Prepara o código para vender no Android junto com o iOS. As assinaturas do Google Play ainda não existem (faltam a conta de comerciante do Google Payments e as assinaturas no Play Console), mas o app e o backend já reconhecem os IDs no formato que a RevenueCat usa para elas.

Nenhuma mudança nos IDs configurados, nos preços ou na RevenueCat. O webhook e o analytics não mudaram. A única mudança de comportamento no iOS foi a correção do bug da restauração (ver [Bug corrigido junto](#bug-corrigido-junto-restauração-nunca-encontrava-a-assinatura)), combinada com o Gabriel antes de ser feita.

## Resumo

| # | Item | Situação |
|---|---|---|
| 1 | No Android a RevenueCat identifica o produto como `<assinatura>:<plano base>` (ex.: `pulse_pro_monthly:monthly`), e o código comparava o ID exato em 5 pontos | Corrigido: os 5 pontos normalizam o ID antes de comparar |
| 2 | Restauração de compra sempre dizia "nenhuma compra encontrada", inclusive no iOS | Corrigido junto (`Object.keys` num array) |
| 3 | Outros lugares que comparam ID de produto | Nenhum além dos 5 (mobile, backend e shared) |

Verificação final: typecheck nos 3 workspaces, lint, API **520/520** (antes 492), mobile **733/733** em 35 suítes (antes 712 em 33).

Depois veio uma rodada de testes e pentest, que achou e corrigiu 1 problema de severidade baixa (item que não é string em `activeSubscriptions`). Ver [ids-produto-android-plano-base-testes-pentest.md](ids-produto-android-plano-base-testes-pentest.md).

---

## Tarefa 1 — Normalização do ID

`normalizeProductId(productId)` devolve só o que vem antes do primeiro `:`, ou o ID inteiro se não houver `:`. Não aplica trim nem minúsculas.

Existe uma cópia em cada lado, com o mesmo código e os mesmos testes, ao lado das constantes dos IDs:

- mobile: [pricing.config.ts](../../apps/mobile/src/config/pricing.config.ts#L15)
- backend: [pricing.config.ts](../../apps/api/src/config/pricing.config.ts#L17)

Não foi criado pacote compartilhado só para isso.

| Entrada | Saída | Casa com |
|---|---|---|
| `pulse_pro_monthly` | `pulse_pro_monthly` | mensal |
| `pulse_pro_monthly:monthly` | `pulse_pro_monthly` | mensal |
| `pulse_pro_monthly:p1m:extra` | `pulse_pro_monthly` | mensal |
| `pulse_pro_annual:annual` | `pulse_pro_annual` | anual |
| `pulse_pro_monthly_trial` | `pulse_pro_monthly_trial` | nenhum |
| `pulse_pro_monthlyx` | `pulse_pro_monthlyx` | nenhum |
| `""`, `":"`, `":monthly"` | `""` | nenhum |

Depois de normalizar, a comparação continua **exata** (`===`). Não se usa `startsWith` nem `includes`, por isso IDs parecidos não são aceitos.

**A normalização vale só para comparar.** O ID original continua sendo o que se guarda, envia e registra:

- o `productId` e o `subscriptionId` (quando não há `store_transaction_id`) que o backend devolve e salva;
- o `productId` de cada plano mostrado no paywall;
- o `productIdentifier` do evento `purchase_completed`;
- o `product_id` do webhook nos eventos do PostHog.

## Tarefa 2 — Os 5 pontos

### Backend ([revenueCat.service.ts](../../apps/api/src/services/revenueCat.service.ts))

| # | Função | O que mudou |
|---|---|---|
| 4 | [`isTrackedProductId`](../../apps/api/src/services/revenueCat.service.ts#L79) | Filtra as chaves de `subscriber.subscriptions` comparando o ID normalizado. Deixou de ser um *type guard* (`productId is ...`), porque `pulse_pro_monthly:monthly` não é o literal `pulse_pro_monthly` |
| 5 | [`mapProductIdToPlan`](../../apps/api/src/services/revenueCat.service.ts#L87) | Decide mensal ou anual pelo ID normalizado |

O critério de escolha de `extractActiveSubscriptionSnapshot` não mudou. Com mais de uma assinatura ativa, vence a que expira por último e, num empate, a primeira encontrada.

### Mobile ([purchase.service.ts](../../apps/mobile/src/services/purchase.service.ts))

Os 3 pontos usam uma função nova, [`getTrackedPlanId`](../../apps/mobile/src/services/purchase.service.ts#L168), que recebe um ID e devolve `'monthly'`, `'annual'` ou `null`.

| # | Função | O que mudou |
|---|---|---|
| 1 | [`selectTrackedPackage`](../../apps/mobile/src/services/purchase.service.ts#L182) | Quando a offering não tem o pacote `monthly`/`annual` padrão, procura em `availablePackages` pelo ID normalizado. O pacote padrão continua tendo prioridade |
| 2 | [`hasTrackedSubscription`](../../apps/mobile/src/services/purchase.service.ts#L300) | Usa `getActiveTrackedPlanIds`, que lê os IDs de `activeSubscriptions` e os normaliza. Também corrige o bug descrito abaixo |
| 3 | `restorePurchaseHistory` ([linha 457](../../apps/mobile/src/services/purchase.service.ts#L457)) | Escolhe anual se houver um anual ativo em qualquer formato; senão, mensal |

**ID mandado ao backend na restauração.** Continua sendo o ID da constante (`pulse_pro_annual` ou `pulse_pro_monthly`), e não o ID que veio do SDK. Isso foi confirmado no código: o `verifyPurchaseSchema` de [purchase.controller.ts](../../apps/api/src/controllers/purchase.controller.ts) só valida `productId` e `platform`, e o handler não usa nenhum dos dois. O plano é decidido consultando a RevenueCat (`GET /v1/subscribers/{userId}`). Desde a remoção do `POST /receipts` esse campo não tem efeito.

### Outros lugares procurados

Foram procurados `PRODUCT_ID`, `productId`, `product_id`, `product.identifier`, `productIdentifier`, `activeSubscriptions` e `pulse_pro_` em `apps/mobile`, `apps/api` e `packages/shared`. Não há outra comparação de ID de produto.

- **Webhook da RevenueCat** ([revenueCatWebhook.controller.ts](../../apps/api/src/controllers/revenueCatWebhook.controller.ts)): só repassa `product_id` para o PostHog. Não foi alterado.
- **`packages/shared`:** não menciona ID de produto.
- **`toPurchasePlan`:** só copia `pkg.product.identifier` para o paywall, sem comparar.

---

## Bug corrigido junto: restauração nunca encontrava a assinatura

O prompt pedia "nenhuma mudança de comportamento no iOS". Este bug contradizia isso, então o trabalho foi parado e a correção foi combinada antes.

- **Problema:** no SDK instalado (`@revenuecat/purchases-typescript-internal` 18.15.1), `customerInfo.activeSubscriptions` é `string[]`. O `hasTrackedSubscription` fazia `Object.keys(customerInfo.activeSubscriptions)`, que num array devolve as posições (`"0"`, `"1"`…) e não os IDs. A checagem nunca casava, e "Restaurar compra" sempre mostrava "nenhuma compra encontrada", também no iOS. O ponto 3 já usava `.includes()` no próprio array e estava certo, mas nunca chegava a rodar.
- **Correção:** `getActiveTrackedPlanIds` lê os valores do array. Depois do pentest, ela também ignora itens que não são string e trata como lista vazia um valor que não é array.
- **Prova:** os testes novos de restauração foram rodados contra o `purchase.service.ts` antigo e falharam até com `pulse_pro_monthly` simples (8 de 15 falharam: os 7 de "encontra" e o de `selectTrackedPackage` com plano base).
- **Efeito no iOS:** a restauração passa a encontrar a assinatura ativa. A compra normal (`purchasePlan`) não passava por esse código e não muda.

---

## Testes

| Arquivo | Testes | O que cobre |
|---|---|---|
| [pricing.config.test.ts](../../apps/api/src/config/pricing.config.test.ts) (novo, API) | 6 | `normalizeProductId` com todos os casos da tabela acima |
| [revenueCat.service.test.ts](../../apps/api/src/services/revenueCat.service.test.ts) (novo, API) | 22 | `extractActiveSubscriptionSnapshot`: mensal e anual nos dois formatos, ID original preservado em `productId` e `subscriptionId`; produtos desconhecidos ignorados (inclusive `pulse_pro_monthly_trial`, `""`, `":"`); expirada ignorada; com as duas assinaturas, nos formatos simples, Android e misto, vence a que expira por último; empate fica com a primeira |
| [pricing.config.test.ts](../../apps/mobile/src/config/pricing.config.test.ts) (novo, mobile) | 6 | Mesmos casos do backend |
| [purchase.service.test.ts](../../apps/mobile/src/services/purchase.service.test.ts) (novo, mobile) | 15 | Restauração encontra a assinatura nos dois formatos e escolhe anual ou mensal; recusa IDs parecidos e não chama o backend; `selectTrackedPackage` (via `getAvailablePurchasePlans`) acha o pacote pelo ID com plano base, continua achando pelo ID simples, prefere o pacote padrão e recusa IDs parecidos |

- **Prova de que os testes pegam o problema:** `revenueCat.service.test.ts` rodado contra o `revenueCat.service.ts` antigo teve 9 falhas em 22, todas em casos com plano base. Os casos só com ID simples passaram, o que confirma que o iOS não mudou no backend.
- **Mocks no mobile:** o SDK da RevenueCat, `config/api`, `analytics.service` e `config/revenuecat.config`. A plataforma é a padrão do `jest-expo` (iOS).
- **Mock no backend:** só `config/env`, para não depender das variáveis de ambiente.
- **Testes existentes:** os do webhook (`revenueCatWebhook.controller.test.ts`) passam sem mudar nenhuma expectativa. Antes deste CP não havia teste de compra no mobile.

## Pendente (fora do código)

- **Teste ao vivo:** não foi feito, porque ainda não existe produto Android na RevenueCat. Quando as assinaturas existirem no Play Console, fazer uma compra e uma restauração reais em teste interno para confirmar o formato que a RevenueCat devolve no SDK (`activeSubscriptions`, `product.identifier`) e na API REST (`subscriber.subscriptions`). O código aceita os dois formatos, então qualquer um funciona.
- **Restauração no iOS:** como passou a funcionar só agora, vale testar "Restaurar compra" no sandbox do iOS também.
