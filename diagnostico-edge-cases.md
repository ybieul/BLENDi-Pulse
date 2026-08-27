# Diagnóstico de Edge Cases — Lógica de Negócio (pré-lançamento)

**Data:** 2026-08-13
**Escopo:** Timezone, Streak, XP/idempotência, Missões diárias, Shopping List offline, RevenueCat webhooks, Pantry Scanner, Pulse AI/histórico de conversas.
**Método:** leitura integral dos arquivos relevantes e de seus importadores, verificação linha a linha contra os cenários especificados — nenhuma suposição sobre comportamento sem confirmação no código. Nenhuma alteração de código foi feita durante este diagnóstico.

> **Nota sobre o escopo:** o brief original enquadra o trabalho como "seis áreas de maior risco" (timezone, streak, XP, missões, shopping list, RevenueCat), mas define 8 tarefas — Pantry Scanner (Tarefa 7) e Pulse AI/histórico (Tarefa 8) não estavam na lista das seis áreas citadas na introdução. Registrado aqui como a própria primeira divergência encontrada entre intenção documentada e escopo real.

---

## Sumário executivo

| Severidade | Qtde | Descrição |
|---|---|---|
| 🔴 Alta | 7 | Pode corromper dado, causar perda silenciosa de dado do usuário, ou permitir ação indevida (custo duplicado, feature inteira quebrada) |
| 🟡 Média | 6 | Comportamento incorreto, mas sem corrupção permanente — geralmente autocurável ou de escopo limitado |
| 🟢 Baixa | 3 | Edge case improvável em produção ou inconsistência menor |
| ✅ Correto | 30 | Comportamento verificado e confirmado correto — documentado para evitar retrabalho futuro |

Os 7 achados de severidade Alta se concentram em três causas raiz recorrentes:
1. **Falta de idempotência/lock em operações concorrentes que não usam índice único do MongoDB** (streak, duplo-toque no Pulse AI) — contrasta com XP e missões, que têm proteção real via índice único.
2. **Ausência de validação de dado na borda** (timezone IANA nunca validado, apesar do comentário do schema dizer o contrário) propagando falha para múltiplas features e, no pior caso, para outros usuários (cron de notificações).
3. **Sync offline do mobile com fonte de verdade errada** (Shopping List: o toggle de check nunca escreve no cache que o sync realmente lê) e **replace destrutivo sem merge** no backend.

---

## Tarefa 1 — Timezone: consistência entre backend e mobile

Arquivos: `apps/api/src/utils/timezone.utils.ts` + 11 importadores (controllers, services, jobs) identificados via grep; `apps/mobile/src/services/timezone.service.ts`; `apps/mobile/App.tsx`; `packages/shared/src/schemas/{auth,user}.ts`.

Todas as 5 funções exportadas (`toUTC`, `toLocalDate`, `getMidnightUTC`, `isSameDayInTimezone`, `getNextOccurrenceUTC`) convergem para o mesmo primitivo interno (`getParts`, via `Intl.DateTimeFormat`), então o comportamento com timezone nulo/inválido é idêntico nas 5.

### Achados

- **🔴 Alta — Nenhuma validação real de timezone IANA existe.** `packages/shared/src/schemas/user.ts:218-238` e `auth.ts:75-107` só verificam string não-vazia. O comentário do schema afirma que "a validação de existência do timezone no banco de dados IANA é responsabilidade da camada de negócio" — busca em todo o repo não encontrou nenhuma chamada a `Intl.supportedValuesOf('timeZone')` ou equivalente. Um valor como `"America/Nova_York"` (erro de digitação) é aceito e persistido.
- **🔴 Alta — Timezone inválido derruba a requisição com 500 genérico.** `Intl.DateTimeFormat({timeZone: <inválido>})` lança `RangeError` síncrono, não capturado em `timezone.utils.ts`. Em contexto de requisição HTTP, propaga até `errorHandler.ts:20` (`statusCode ?? 500`) — sem código de erro específico. Afeta blend log, hidratação, suplementos, XP, missões, relatório semanal e Pulse AI.
- **🔴 Alta — Um único usuário com timezone corrompido derruba notificações de outros usuários.** `apps/api/src/jobs/notifications.jobs.ts` — os 4 jobs de cron (`runDailyPulseJob`, `runStreakReminderJob`, `runSupplementReminderJob`, `runHydrationReminderJob`) iteram usuários em `for...of` sem try/catch por usuário (linhas 182-208, 231-262, 285-329, 352-394). A exceção de um usuário corrompido aborta o loop inteiro — usuários posicionados depois dele no resultado da query não recebem notificação naquele tick. O `.catch()` só existe no nível do `cron.schedule` (linhas 519-545), evitando o processo cair, mas não evitando o batch abortar. Repete a cada tick (5-30 min) até correção manual.
- **🟡 Média — Corrida entre sync de timezone e ações sensíveis a data.** `syncTimezoneIfNeeded()` (`apps/mobile/src/services/timezone.service.ts:58-75`) é fire-and-forget (`void ... .catch(() => undefined)`), disparado em `App.tsx:169` e `App.tsx:337-347`, nunca aguardado. Cenário do prompt (blend 23:55 em NY → troca pra LA → blend 00:10): o timezone usado no segundo blend depende de corrida de rede não-determinística entre o `PATCH /auth/timezone` e o `POST` do blend. O resultado é internamente consistente para qualquer timezone que vencer a corrida (já que `BlendLog.createdAt` é sempre UTC real e a comparação usa o timezone atual do perfil), mas não-determinístico e pode divergir do que a tela sugeriu ao usuário.
- **🟢 Baixa — Sem fallback explícito de timezone `undefined`/`null` dentro de `timezone.utils.ts`.** Na prática protegido por `User.timezone` ser `required:true` com `default:'America/New_York'` (`models/User.ts:363-367`) e pelo Zod já bloquear string vazia — mas se um documento for criado/editado fora do Mongoose, `Intl.DateTimeFormat({timeZone: undefined})` cai silenciosamente no timezone do processo do servidor (comportamento nativo do JS, não intencional).
- **✅ Correto — Leitura de `user.timezone` sempre fresca por requisição.** Nenhum controller usa cache em memória do processo; todo `UserModel.findById(...).lean()` busca o valor mais recente persistido.

---

## Tarefa 2 — Streak: cálculo e invariantes

Arquivo: `apps/api/src/controllers/blendLog.controller.ts` (função `updateCurrentStreak`, linhas 252-297) + `models/User.ts` + `models/BlendLog.ts`.

### Achados

- **🔴 Alta — Lost update de `currentStreak` em blends concorrentes no primeiro blend do dia.** Dois blends simultâneos (duplo toque, retry, dois devices) logo após virada de dia: ambos capturam `currentStreak` (ex: 5) antes de qualquer escrita (`getBlendUserContext`, linha 317/346). Cada `updateCurrentStreak` calcula `nextStreak` de forma independente e faz `$set: {currentStreak: nextStreak}` (valor absoluto computado em app, não `$inc`). Dependendo do entrelaçamento das duas queries `findOne` de "log anterior", uma requisição pode calcular `nextStreak=6` (viu apenas o log de ontem) e a outra `nextStreak=5` (viu o log da outra requisição como "mesmo dia", preservando o valor antigo). Se a escrita de 5 for a última a chegar, **o incremento do dia é perdido silenciosamente**. `longestStreak` está protegido por `$max` (nunca regride), mas `currentStreak` não tem proteção equivalente contra esse "lost update".
- **✅ Correto — Mesmo dia não incrementa duas vezes (caso sequencial).** `isSameDayInTimezone` → `Math.max(currentStreak, 1)` preserva o valor.
- **✅ Correto — "Dia anterior" é calendário local, não janela de 24h.** `isPreviousDayInTimezone` (linhas 156-163) compara componentes ano/mês/dia via `toLocalDate`, nunca diferença de milissegundos. Exemplo do prompt (blend 23h + blend 01h do dia seguinte, só 2h de diferença) incrementa corretamente.
- **✅ Correto — Reset para 1 após gap de 3+ dias.** Nenhum dos dois `if`/`else if` bate, `nextStreak` permanece no valor inicial `1`.
- **✅ Correto — Primeiro blend da vida do usuário → streak = 1, não 0.** `previousLog` nulo pula o bloco condicional inteiro, mantém o default `1`.
- **✅ Correto — `currentStreak` e `longestStreak` atualizados na mesma operação atômica.** Um único `findByIdAndUpdate` com `$set` + `$max` (linhas 276-291).
- **Informativo — `lastBlendDate` não existe no `User`.** Continuação/quebra de streak é derivada de uma query ao próprio `BlendLog` (`findOne` com índice `{userId:1, createdAt:-1}`), não de um campo cacheado — decisão de design válida, mas é exatamente o que abre a janela de corrida do achado acima.

---

## Tarefa 3 — XP: idempotência e race conditions

Arquivos: `apps/api/src/models/XPLog.ts` + `apps/api/src/services/xp.service.ts` (integral).

Índice único `{userId:1, xpType:1, logDate:1}` (`XPLog.ts:59`). TTL de 90 dias confirmado no código atual (`XP_LOG_TTL_SECONDS = 7_776_000`).

### Achados

- **🟡 Média — `Date.now()` (resolução de milissegundos, não segundos) não garante unicidade sob concorrência real em tipos multi-ocorrência.** `buildLogDate` (`xp.service.ts:47-55`) usa `${localDateKey}_${Date.now()}` para `blend`, `pulseAi`, `favoriteRecipe`, `pantryScanner`. Duas requisições no mesmo milissegundo pro mesmo usuário colidiriam no índice único, e o catch de 11000 trataria a segunda como duplicata legítima — perdendo o award de XP. Janela estreita, mas não é impossível sob carga real.
- **✅ Correto — Insert no XPLog acontece antes do `$inc` em totalXP, com early-return em duplicata.** Se o insert falhar com 11000, o catch retorna imediatamente (linhas 91-105) antes de qualquer incremento — não existe o risco de "totalXP incrementado sem log correspondente".
- **✅ Correto — Detecção de level-up sob awards concorrentes é matematicamente correta.** `$inc` atômico do MongoDB + `levelBefore = calculateLevel(newTotalXP - amount)` reconstrói sempre o estado real imediatamente anterior à própria operação, independente de quantas operações concorrentes existam. Simulação dos dois entrelaçamentos possíveis confirma: exatamente uma detecta o level-up corretamente, nunca zero ou duas.
- **✅ Correto — `lastLevelUp` previne notificação duplicada.** Guard atômico (`$lt` no filtro do `updateOne` + checagem de `modifiedCount > 0`) — mesmo sob concorrência, só a primeira escrita bem-sucedida notifica.

---

## Tarefa 4 — Missões diárias: geração e progresso concorrente

Arquivos: `apps/api/src/services/missionProgress.service.ts` (integral) + `models/DailyMission.ts` + `config/missionDefinitions.ts`.

### Achados

- **🟡 Média — Bônus de missão pode ficar sem ser atribuído sob concorrência nas 2 últimas missões do dia.** `reconcileMissionBonus` (linhas 78-115) é chamada em toda invocação de `updateMissionProgress`, o que já reduz bastante o risco (qualquer ação subsequente relacionada a missão recalcula). Mas usa o snapshot retornado pela própria operação (`findOneAndUpdate` com `new:true`), não um `findOne` fresco. Se duas chamadas concorrentes completam, respectivamente, a penúltima e a última missão do dia (ex: blend + cron de suplemento simultâneos), pode acontecer de nenhuma das duas ver o snapshot com as 3 completas — o bônus só é recuperado por uma AÇÃO FUTURA relacionada a missão no mesmo dia; se não houver, fica perdido silenciosamente.
- **✅ Correto — Criação concorrente do documento do dia é tratada corretamente.** `findOrCreateDailyMission` (linhas 218-258): a chamada perdedora do `insertOne` (erro 11000) re-busca o documento da vencedora e opera sobre ele — nenhum progresso é perdido.
- **✅ Correto — `bonusAwarded` protegido por duas camadas independentes.** Update condicional atômico (`{bonusAwarded:false}` no filtro) + idempotência independente via índice único do XPLog (`missionBonus` não é multi-ocorrência).
- **✅ Correto/Informativo — `FALLBACK_MISSION_TYPES` nunca é necessário nos 4 goals, mesmo no pior caso combinado** (supplementStack vazio + favoritos vazios + scanPantry no limite simultaneamente) — todos os 4 pools mantêm ≥4 tipos únicos. Rede de segurança nunca exercitada com os pools atuais.
- **✅ Correto — Colisão de TTL com insert do dia é estruturalmente impossível.** `missionDate` (dia-calendário da missão) e `createdAt` (usado só pro TTL) são campos independentes — um documento prestes a expirar nunca tem `missionDate` de hoje.

---

## Tarefa 5 — Shopping List offline: sync de estado final

Arquivos: `apps/mobile/src/utils/shoppingListSync.utils.ts` + `reconnectSync.utils.ts` + `apps/mobile/src/screens/ShoppingListDetailScreen.tsx` + `apps/mobile/src/utils/shoppingListAddItems.utils.ts` + `apps/api/src/controllers/shoppingList.controller.ts` (investigação estendida além dos 2 arquivos indicados no prompt, necessária pra responder aos cenários).

### Achados

- **🔴 Alta — Toggle de check offline nunca escreve no cache do React Query — a dirty flag fica desconectada do dado real.** `handleToggleCheck` (`ShoppingListDetailScreen.tsx:230-272`) escreve o toggle só em `localItems` (`useState` do componente) e chama `markListDirty`, mas nunca `queryClient.setQueryData`. `syncDirtyShoppingLists` (`reconnectSync.utils.ts:95-121`) lê exatamente esse cache do React Query, que nunca recebeu o toggle. Agravado por um `useEffect` (`ShoppingListDetailScreen.tsx:214-218`) que resseta `localItems` a partir de `data` (o cache, sem o toggle) em qualquer refetch/invalidação — pode apagar o toggle offline antes mesmo do reconnect sync rodar. Resultado: em ambos os casos do Cenário 1 do prompt (lista em cache ou não), os checks feitos offline nunca chegam ao backend — e quando a lista está em cache, a flag ainda é marcada como limpa (`markListClean`), dando falsa confiança de sucesso.
- **🔴 Alta — `updateItems` no backend é replace total sem merge/detecção de conflito.** `shoppingList.controller.ts` (`updateItems`): `$set: { items }` substitui o array inteiro do documento pelo array enviado pelo cliente, sem comparar versão/`updatedAt`. Qualquer item existente no banco mas ausente no array enviado (adicionado por outro device, ou entre o fetch original e o sync) é apagado silenciosamente. A preocupação específica do prompt (IDs `temp_` colidindo com IDs definitivos) **não se confirma** — `normalizeStoredItem` trata qualquer `temp_`/ID desconhecido como item novo, gerando UUID fresco, sem colisão — mas o problema mais amplo (replace destrutivo) é real e mais grave que o cenário original cogitava.
- **🟡 Média — Adicionar item manualmente pela tela de detalhe não tem suporte a offline.** `handleAddItem` (`ShoppingListDetailScreen.tsx:301-341`) não verifica `isOffline` e, no catch, só reverte o item local e mostra toast de erro — sem `markListDirty`. Item digitado manualmente enquanto offline é perdido, sem nem a proteção incompleta que o toggle tem.
- **✅ Correto — Cache do React Query (`shoppingListDetail`) é persistido em MMKV, sobrevive a app morto.** `config/queryClient.ts:98-125`, `App.tsx:100-102` (`PersistQueryClientProvider`). A premissa do Cenário 2 do prompt ("cache perdido ao fechar o app") não se confirma — mas isso não ajuda, porque a causa raiz é que o toggle nunca chega a esse cache (achado acima).
- **✅ Correto — Fluxo de adicionar itens via importação de receita segue o padrão certo.** `appendIngredientsToShoppingList` (`shoppingListAddItems.utils.ts:146-174`) atualiza o cache do React Query otimisticamente e marca dirty corretamente no catch — mostra que a arquitetura sabe fazer certo; o toggle de check é o outlier.

---

## Tarefa 6 — RevenueCat webhooks: ciclo de vida da assinatura

**Nota de divergência:** o prompt indicou `apps/api/src/controllers/purchase.controller.ts` para os "quatro handlers de evento de webhook" — esse arquivo só contém `verifyPurchase` (endpoint client-driven de sincronização pós-compra). Os webhooks reais estão em `apps/api/src/controllers/revenueCatWebhook.controller.ts` (`handleRevenueCatWebhook`, montado em `POST /webhooks/revenuecat`), uma função única com branches internos por `event.type` — não quatro handlers separados. Ambos os arquivos foram lidos integralmente.

### Achados

- **🟡 Média — `markCancellationRequested` não checa `isPro` — CANCELLATION fora de ordem após EXPIRATION resseta o campo num perfil já expirado.** (`revenueCatWebhook.controller.ts:140-159,291`) Se EXPIRATION processar primeiro (`isPro:false` + `$unset subscriptionCancelRequestedAt`) e CANCELLATION chegar depois (retry/atraso), `markCancellationRequested` é chamado incondicionalmente e reseta `subscriptionCancelRequestedAt` — perfil fica com `isPro:false` e "cancelamento pendente" simultaneamente. Sem impacto em controle de acesso (`isPro` permanece correto), mas é um estado logicamente inconsistente até o próximo evento de compra/renovação limpar.
- **🟡 Média — INITIAL_PURCHASE/RENEWAL sem tratamento específico de erro do RevenueCat.** (`revenueCatWebhook.controller.ts:263-274`) Diferente de CANCELLATION e EXPIRATION (que degradam graciosamente usando dados do próprio payload), esse branch não tem try/catch local — falha na API do RevenueCat propaga pro catch genérico (500). Mitigado parcialmente pelo retry automático de webhooks do RevenueCat e pelo caminho redundante client-driven (`verifyPurchase`).
- **✅ Correto — Sync de INITIAL_PURCHASE/RENEWAL é idempotente.** `syncActiveSubscriptionFromRevenueCat` sempre re-deriva o estado a partir da API live do RevenueCat (não confia no payload do webhook), então entregas duplicadas produzem o mesmo resultado.
- **✅ Correto — Verificação de assinatura robusta.** Header ausente → 401 explícito; HMAC-SHA256 com `timingSafeEqual` + janela de tolerância de 5 min contra replay.
- **✅ Correto — Usuário não encontrado retorna 200 ignorado, sem crash nem falha silenciosa perigosa.** Evita tempestade de retries desnecessários.
- **✅ Correto — EXPIRATION limpa `subscriptionCancelRequestedAt` e preserva `subscriptionId`,** confirmado no código atual (bate com a decisão documentada da Fase 3).
- **🟢 Baixa — Chamada duplicada (inofensiva) de `markCancellationRequested` no branch de CANCELLATION** (uma vez dentro do catch, outra incondicional logo depois) — redundante mas sem efeito observável, escrita idempotente.

---

## Tarefa 7 — Edge cases do Pantry Scanner

Arquivo: `apps/api/src/controllers/pantryScanner.controller.ts` (integral, 559 linhas).

### Achados

Todos os 3 cenários pedidos verificados como **corretos**:

- **✅ Correto — `getNextScanResetDate` usa loop `while`, sempre alcança um ciclo futuro** mesmo com `scanResetDate` muito atrasado (ex: conta de 4 meses sem uso) — refuta a preocupação de uma única chamada de `addMonths` deixar o resultado ainda no passado.
- **✅ Correto — `scanCount` só é incrementado após confirmar ingredientes usáveis.** Rastreado o fluxo completo: checagem de limite antes da chamada à IA, sem incremento em nenhum caminho de erro/vazio (falha de IA, parse inválido, sem comida detectada, sem ingredientes de confiança suficiente) — só na linha 525, após confirmar `usableIngredients.length > 0`.
- **✅ Correto — JSON inválido/malformado da IA tratado com erro específico e controlado,** não vaza como exceção crua (`scanner/vision-parse-error`, dupla proteção em `parsePantryVisionAnalysis` e `parsePantryRecipes`).
- **✅ Correto — Reset de ciclo usa update condicional otimista**, seguro sob concorrência (recomputação determinística evita inconsistência mesmo se uma das duas escritas concorrentes "perder").
- **✅ Correto/Informativo — Falha na geração de receita não desfaz o incremento** (scan já foi cobrado, por design — o invariante documentado é sobre ingredientes válidos, não sobre sucesso de geração de receita).
- **✅ Correto — `scanCount` ilimitado pra usuários Pro não vaza na UI** — verificado que os dois pontos de exibição (`PantryScannerScreen.tsx:399`, `PulseAIScreen.tsx:548`) são condicionados a `!isPro`/`isFreeTier`.

Nenhum achado de severidade Alta/Média nesta tarefa.

---

## Tarefa 8 — Edge cases do Pulse AI e histórico de conversas

Arquivo: `apps/api/src/controllers/pulseAi.controller.ts` (integral, 805 linhas) + `models/Conversation.ts` (TTL confirmado em 90 dias).

### Achados

- **🔴 Alta — Duplo toque gera mensagens duplicadas na conversa + consome 2x o rate limit + 2x custo de IA.** Duas requisições quase simultâneas resolvem para o mesmo `conversationId` (`resolveConversationContext`, linhas 418-447) — se ambas derem cache miss (`getFromCache`, linha 544), ambas chamam a IA e ambas fazem `$push` na mesma conversa (`persistConversationTurn`, linha 688) — `$push` é aditivo, então as duas gravações são aplicadas, gerando duplicata real no histórico. O rate limiting (corretamente atômico, ver abaixo) incrementa `dailyAiUsage` duas vezes de forma válida — um único duplo-toque acidental consome 2 das 3 consultas diárias gratuitas e gera 2 chamadas reais à API de IA (custo dobrado). Diferente de XP e missões, não existe nenhuma chave de idempotência ou lock protegendo esse fluxo.
- **🟢 Baixa — `persistConversationTurn` ignora o resultado do `updateOne` — perda silenciosa se o documento expirar por TTL no meio do request.** (linhas 449-474) Função retorna `Promise<void>`, nunca checa `matchedCount`. Se o documento de conversa for removido pelo TTL de 90 dias entre a leitura do `conversationId` e esta escrita (janela de milissegundos), o `updateOne` é um no-op silencioso — mensagem do usuário + receita gerada pela IA (já processada, já paga) são perdidas sem log, sem erro, sem indicação ao usuário. Janela de corrida extremamente estreita, mas correção seria barata (checar `matchedCount === 0`).
- **✅ Correto — Rate limiting do free tier é atomicamente correto sob concorrência.** `reservePulseAiUsage` usa o mesmo padrão `$lt` + `$inc` já validado nas Tarefas 4 e 7 — impossível ultrapassar o limite de 3 mesmo sob requisições concorrentes reais.
- **✅ Correto — Reserva de uso com rollback atômico em todo caminho de falha.** `rollbackPulseAiUsageReservation`, chamada consistentemente sempre que o fluxo falha após a reserva (IA indisponível, resposta inválida, falha ao persistir) — usuário não é cobrado no limite diário por requisições que não completaram.

---

## Tabela-resumo final — todos os achados por severidade

### 🔴 Alta

| # | Achado | Arquivo:linha |
|---|---|---|
| T1-F1 | Nenhuma validação real de timezone IANA, apesar do comentário do schema afirmar o contrário | `packages/shared/src/schemas/user.ts:218-238`, `auth.ts:75-107` |
| T1-F2 | Timezone inválido → `RangeError` não capturado → 500 genérico em qualquer feature com data | `timezone.utils.ts` (todas as funções) |
| T1-F3 | Um usuário com timezone corrompido derruba notificações de outros usuários no mesmo tick de cron | `notifications.jobs.ts:182-208,231-262,285-329,352-394` |
| T2-F1 | Lost update de `currentStreak` em blends concorrentes no primeiro blend do dia | `blendLog.controller.ts:252-297` |
| T5-F1 | Toggle de check offline nunca escreve no cache do React Query — dirty flag desconectada do dado real | `ShoppingListDetailScreen.tsx:230-272,214-218` |
| T5-F2 | `updateItems` do backend é replace total sem merge/detecção de conflito concorrente | `shoppingList.controller.ts` (`updateItems`) |
| T8-F1 | Duplo toque no Pulse AI gera mensagens duplicadas + 2x rate limit + 2x custo de IA | `pulseAi.controller.ts:418-474,544-693` |

### 🟡 Média

| # | Achado | Arquivo:linha |
|---|---|---|
| T1-F6 | Corrida entre sync de timezone (fire-and-forget) e ações sensíveis a data | `timezone.service.ts:58-75`, `App.tsx:169,337-347` |
| T3-F1 | `Date.now()` (ms) não garante unicidade sob concorrência real em XP multi-ocorrência | `xp.service.ts:47-55` |
| T4-F1 | Bônus de missão pode ficar sem ser atribuído sob concorrência nas 2 últimas missões do dia | `missionProgress.service.ts:78-115,348` |
| T5-F3 | Adicionar item manualmente na tela de detalhe não tem suporte a offline (item se perde) | `ShoppingListDetailScreen.tsx:301-341` |
| T6-F1 | CANCELLATION fora de ordem após EXPIRATION reseta `subscriptionCancelRequestedAt` num perfil já expirado | `revenueCatWebhook.controller.ts:140-159,291` |
| T6-F2 | INITIAL_PURCHASE/RENEWAL sem tratamento específico de erro do RevenueCat | `revenueCatWebhook.controller.ts:263-274` |

### 🟢 Baixa

| # | Achado | Arquivo:linha |
|---|---|---|
| T1-F4 | Sem fallback explícito de timezone `undefined`/`null` (protegido estruturalmente na prática) | `timezone.utils.ts`, `models/User.ts:363-367` |
| T6-F3 | Chamada duplicada inofensiva de `markCancellationRequested` | `revenueCatWebhook.controller.ts:277-291` |
| T8-F2 | `persistConversationTurn` ignora resultado do `updateOne` — perda silenciosa em corrida de TTL rara | `pulseAi.controller.ts:449-474` |

### ✅ Comportamentos corretos confirmados (não corrigir)

| Área | Comportamento | Arquivo:linha |
|---|---|---|
| Timezone | Leitura de `user.timezone` sempre fresca por requisição, sem cache em processo | `blendLog.controller.ts:165-189` e equivalentes |
| Streak | Mesmo dia não incrementa duas vezes (caso sequencial) | `blendLog.controller.ts:269-270` |
| Streak | "Dia anterior" é calendário local, não janela de 24h | `blendLog.controller.ts:156-163` |
| Streak | Reset pra 1 após gap de 3+ dias | `blendLog.controller.ts:266-274` |
| Streak | Primeiro blend → streak = 1, não 0 | `blendLog.controller.ts:266-268` |
| Streak | `currentStreak`/`longestStreak` na mesma operação atômica | `blendLog.controller.ts:276-291` |
| XP | Insert no XPLog antes do `$inc`, com early-return em duplicata | `xp.service.ts:84-105` |
| XP | Detecção de level-up sob concorrência é matematicamente correta | `xp.service.ts:107-134` |
| XP | `lastLevelUp` previne notificação duplicada com guard atômico | `xp.service.ts:135-159` |
| Missões | Criação concorrente do documento do dia tratada sem perda de progresso | `missionProgress.service.ts:218-258` |
| Missões | `bonusAwarded` protegido por update condicional + idempotência do XPLog | `missionProgress.service.ts:99-109` |
| Missões | `FALLBACK_MISSION_TYPES` nunca necessário nos 4 goals (rede de segurança não testada) | `missionDefinitions.ts` |
| Missões | Colisão de TTL com insert do dia é estruturalmente impossível | `DailyMission.ts:119-120` |
| Shopping List | Cache do React Query persistido em MMKV, sobrevive a app morto | `config/queryClient.ts:98-125` |
| Shopping List | IDs `temp_` corretamente trocados por UUIDs reais, sem colisão | `shoppingList.controller.ts` (`normalizeStoredItem`) |
| Shopping List | Fluxo de importação de receita marca dirty e atualiza cache corretamente (padrão de referência) | `shoppingListAddItems.utils.ts:146-174` |
| RevenueCat | Sync de INITIAL_PURCHASE/RENEWAL é idempotente | `revenueCatWebhook.controller.ts:112-138` |
| RevenueCat | Verificação de assinatura robusta (401 + HMAC + anti-replay) | `revenueCatWebhook.controller.ts:210-228` |
| RevenueCat | Usuário não encontrado → 200 ignorado, sem crash | `revenueCatWebhook.controller.ts:257-261` |
| RevenueCat | EXPIRATION limpa `subscriptionCancelRequestedAt` e preserva `subscriptionId` | `revenueCatWebhook.controller.ts:161-182` |
| Pantry Scanner | `getNextScanResetDate` sempre alcança ciclo futuro (loop `while`) | `pantryScanner.controller.ts:162-170` |
| Pantry Scanner | Reset de ciclo com update condicional otimista, seguro sob concorrência | `pantryScanner.controller.ts:261-289` |
| Pantry Scanner | `scanCount` só incrementa após confirmar ingredientes usáveis | `pantryScanner.controller.ts:505-525` |
| Pantry Scanner | Falha em geração de receita não desfaz cobrança do scan (por design) | `pantryScanner.controller.ts:537` |
| Pantry Scanner | JSON inválido da IA tratado sem vazar exceção crua | `pantryScanner.controller.ts:193-219,479-488` |
| Pantry Scanner | `scanCount` ilimitado pra Pro não vaza na UI | `PantryScannerScreen.tsx:399`, `PulseAIScreen.tsx:548` |
| Pulse AI | Rate limiting do free tier atomicamente correto sob concorrência | `pulseAi.controller.ts:184-224` |
| Pulse AI | Reserva de uso com rollback atômico em todo caminho de falha | `pulseAi.controller.ts:226-243,564-736` |

---

## Notas metodológicas

- Duas divergências entre o texto do prompt original e o código real foram encontradas e usadas para redirecionar a investigação: (1) "seis áreas" citadas na intro vs. 8 tarefas reais; (2) webhooks do RevenueCat estão em `revenueCatWebhook.controller.ts`, não em `purchase.controller.ts` como indicado.
- Nenhuma alteração de código, log de debug ou refatoração foi feita durante este diagnóstico — conforme solicitado.
- Achados de concorrência (streak, missões, Pulse AI) foram verificados por simulação manual de entrelaçamento de operações contra o código real, não por teste de carga automatizado — recomenda-se validar os achados de severidade Alta com teste de concorrência real antes de priorizar a correção.
