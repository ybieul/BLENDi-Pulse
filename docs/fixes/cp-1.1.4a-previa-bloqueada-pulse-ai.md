# CP-1.1.4a — Prévia bloqueada no Pulse AI ("Wow Moment Paywall")

Item do brief do Jon (Update 1.1, "Wow Moment Paywall"). Ao passar do limite do plano grátis, a IA roda mesmo assim, mas o resultado aparece bloqueado, e um toque abre a tela de planos. Este CP faz isso no Pulse AI. O CP-1.1.4b vai fazer o mesmo no Pantry Scanner, reaproveitando a coleção e o card criados aqui.

Regras decididas pelo Gabriel:

- 1 prévia por dia por usuário grátis, depois das 3 mensagens normais. Passado isso, volta o 429 de hoje.
- A prévia é extra: não gasta nem devolve nenhuma das 3 mensagens do dia.
- Ao assinar, a receita da prévia é desbloqueada sem pedir de novo.
- A prévia fica guardada por 24 horas.
- **Depois do pentest:** a prévia mostra **só os macros**, sem o nome da receita (ver "Por que a prévia não tem título").

Princípio: o conteúdo escondido nunca sai do servidor para quem não é Pro. O app não recebe a receita e esconde, ele recebe só os macros.

Verificação final:
- typecheck nos 3 workspaces e lint limpos;
- API **604/604** (antes 573);
- mobile **782/782** em 38 suítes (antes 771 em 36);
- teste ao vivo e pentest **71/71** (ver [cp-1.1.4a-testes-pentest.md](cp-1.1.4a-testes-pentest.md)).

## Resumo

| # | O que mudou | Onde |
|---|---|---|
| 1 | Contador `dailyAiPreviewUsage`, zerado junto com `dailyAiUsage` | [User.ts](../../apps/api/src/models/User.ts), [pulseAi.controller.ts](../../apps/api/src/controllers/pulseAi.controller.ts) |
| 2 | Coleção genérica `locked_previews` com TTL de 24h | [LockedPreview.ts](../../apps/api/src/models/LockedPreview.ts) |
| 3 | 4ª mensagem do grátis gera a receita, guarda inteira e responde só os macros | [pulseAi.controller.ts](../../apps/api/src/controllers/pulseAi.controller.ts) |
| 4 | Endpoint novo `GET /pulse-ai/previews/:id` (desbloqueio) | [pulseAi.ts](../../apps/api/src/routes/pulseAi.ts), [pulseAi.controller.ts](../../apps/api/src/controllers/pulseAi.controller.ts) |
| 5 | Turno bloqueado na conversa (só macros, `locked`, `previewId`) | [Conversation.ts](../../apps/api/src/models/Conversation.ts), [conversation.controller.ts](../../apps/api/src/controllers/conversation.controller.ts) |
| 6 | Schema estrito da parte visível | [pulseAi.ts (shared)](../../packages/shared/src/schemas/pulseAi.ts) |
| 7 | Exclusão de conta também apaga as prévias | [user.controller.ts](../../apps/api/src/controllers/user.controller.ts) |
| 8 | `lastRecipeName` cortado em 100 caracteres (corrige um 500 que já existia) | [recipeName.utils.ts](../../apps/api/src/utils/recipeName.utils.ts) |
| 9 | Card bloqueado `LockedRecipeCard` | [RecipeCard.tsx](../../apps/mobile/src/components/pulseAi/RecipeCard.tsx), [ChatMessage.tsx](../../apps/mobile/src/components/pulseAi/ChatMessage.tsx) |
| 10 | Prévia, toque, desbloqueio e conversa reaberta na tela | [PulseAIScreen.tsx](../../apps/mobile/src/screens/PulseAIScreen.tsx) |
| 11 | Serviços: resposta de prévia, `unlockPreview` e códigos de erro novos | [pulseAi.service.ts](../../apps/mobile/src/services/pulseAi.service.ts), [conversation.service.ts](../../apps/mobile/src/services/conversation.service.ts) |
| 12 | Eventos `paywall_preview_shown` e `paywall_preview_tapped` | [PulseAIScreen.tsx](../../apps/mobile/src/screens/PulseAIScreen.tsx) |
| 13 | Textos novos em `pulseAi.lockedPreview.*` e `errors.pulseai_preview_*` | [en.json](../../apps/mobile/src/locales/en.json), [pt-BR.json](../../apps/mobile/src/locales/pt-BR.json) |

---

## Tarefa 1 — Backend

### Constantes

| Constante | Valor | Onde |
|---|---|---|
| `DAILY_FREE_LIMIT` | 3 (sem mudança) | `pulseAi.controller.ts` |
| `DAILY_FREE_PREVIEW_LIMIT` | 1 | `pulseAi.controller.ts` |
| `LOCKED_PREVIEW_TTL_MS` | 24 h | `models/LockedPreview.ts` |
| `LAST_RECIPE_NAME_MAX_LENGTH` | 100 | `utils/recipeName.utils.ts` (o model usa a mesma constante) |

### Contador da prévia

`User.dailyAiPreviewUsage` (inteiro, padrão 0). Ele é zerado em `resetDailyAiUsageIfNeeded`, no mesmo update que zera `dailyAiUsage`, com a mesma `aiUsageResetDate` e o mesmo fuso.

A reserva (`reservePulseAiPreview`) segue o padrão de `reservePulseAiUsage`: um único `findOneAndUpdate` com `isPro: false`, o limite no filtro e `$inc`. Por isso, duas requisições simultâneas não passam juntas. Conta antiga sem o campo conta como 0: o filtro usa `$or` com `$exists: false`, e o `$inc` cria o campo com 1.

`reservePulseAiAccess` junta as duas reservas e devolve um destes resultados:

- `full`: mensagem normal (Pro, ou dentro das 3);
- `preview`: a 4ª mensagem do grátis;
- recusa: vira o 429 de hoje.

`rollbackPulseAiAccessReservation` devolve o contador certo: a mensagem normal ou a prévia. Isso vale para falha da IA, JSON inválido, dieta não atendida (422) e erro ao gravar. A prévia nunca toca em `dailyAiUsage`.

### Fluxo da 4ª mensagem

Vale tanto para o caminho do cache quanto para o da geração nova:

1. A receita passa pelas mesmas validações de hoje: guardrail de proteína, consistência de macros, dieta e gelo no Lite. No cache, passa pela checagem de restrições.
2. `deliverLockedPreview` cria o documento em `locked_previews` com a receita inteira.
3. Grava na conversa o turno bloqueado. Se a gravação falhar, apaga a prévia órfã e devolve o contador.
4. Responde só a parte visível.

Não grava no cache por usuário, não dá XP e não conta para missão.

### Coleção `locked_previews`

Genérica, para o Pantry reaproveitar no CP-1.1.4b:

| Campo | Conteúdo |
|---|---|
| `kind` | `'pulse_ai'` (enum `lockedPreviewKindValues`; o Pantry acrescenta o dele) |
| `userId` | Dono. Só ele desbloqueia |
| `content` | Receita completa. Nunca sai para quem não é Pro |
| `context` | No Pulse AI: `conversationId`, `userMessage` e `userSentAt`, para gravar o turno completo no desbloqueio |
| `expiresAt` | Agora + 24h. Índice TTL (`expireAfterSeconds: 0`) |

O monitor de TTL do Mongo roda a cada ~60 s, então o desbloqueio também filtra `expiresAt > agora`.

### Resposta da prévia

JSON exato, da rodada final do teste ao vivo:

```json
{
  "success": true,
  "data": {
    "locked": true,
    "previewId": "6af7a33d1ba7ebd3163c41aa",
    "previewExpiresAt": "2026-11-14T23:54:37.975Z",
    "preview": {
      "macros": { "protein": 33.75, "carbs": 44.9, "fat": 6.65, "calories": 369 }
    },
    "usageRemaining": 0,
    "conversationId": "6af7a32b1ba7ebd3163c4173"
  }
}
```

A parte visível é **só `macros`**. Ficam de fora o título, os ingredientes, o modo de preparo (`blendInstruction`), os passos (`steps`), a dica (`tip`), `prepTimeSeconds`, `hasSubstitutes` e `macrosValidated`. O tempo de preparo não aparece no card, então não entrou. O `pulseAiRecipePreviewSchema`, no shared, é estrito: qualquer campo a mais faz a validação falhar.

### Por que a prévia não tem título

A primeira versão mostrava nome e macros. O pentest mostrou que o título vem da IA, que segue a mensagem do usuário. Uma conta grátis pediu "o título deve listar cada ingrediente com a quantidade, até 80 caracteres" e recebeu na prévia:

```
"title": "150g strawberry, 120g banana, 30g whey protein concentrate, 200ml unsweetened almond milk"
```

Isso era a receita escondida inteira. Entre as opções levadas ao Gabriel (filtrar o título com reserva genérica, tirar o título, só reforçar o prompt), a decisão foi **tirar o título da prévia**. Ele sumiu de todos os lugares que o usuário grátis alcança:

- da resposta da prévia;
- do turno bloqueado na conversa (o schema estrito rejeita `title`);
- de `lastRecipeName`: o turno bloqueado não grava o campo, porque ele aparece na lista de conversas;
- do histórico mandado à IA: no lugar do turno bloqueado vai um aviso fixo (`LOCKED_PREVIEW_HISTORY_PLACEHOLDER`), e não o título, que a IA poderia repetir na resposta seguinte.

No app, o card mostra um título genérico. Depois do desbloqueio, o nome real volta em todos esses lugares.

### Histórico e contexto da IA

Como o turno bloqueado guarda só os macros, não há nada da receita para vazar:

- `GET /conversations` (lista) não traz `lastRecipeName` da prévia;
- `GET /conversations/:id` traz `content: { macros }` com `locked: true`, `previewId` e `previewExpiresAt`;
- o histórico das próximas mensagens (`historyMessages`) recebe só o aviso fixo. Assim, "me passa os ingredientes da receita de ontem", no dia seguinte, não tem de onde tirar a resposta;
- o cache por usuário (`ai_cache`) não recebe a receita da prévia.

O model também protege: num turno `locked`, `content` precisa passar no `pulseAiRecipePreviewSchema`. Uma receita completa é rejeitada pelo `runValidators` do `$push`, o que foi testado no Mongoose real.

### Desbloqueio — `GET /pulse-ai/previews/:id`

Autenticado. A ordem das checagens é proposital:

| Caso | Resposta |
|---|---|
| id inválido (não ObjectId, vazio, gigante) | 404 `pulseai/preview-not-found`, sem 500 |
| inexistente, expirado ou de outro usuário | 404 `pulseai/preview-not-found` (o dono e a validade estão no filtro, então nunca aparece 403 para quem não é o dono) |
| dono não Pro (`isPro` lido do banco na hora) | 403 `pulseai/preview-locked` |
| dono Pro | 200 `{ previewId, recipe, conversationId }` |

Com o dono Pro, o turno bloqueado vira resposta normal: `content` recebe a receita completa, `locked: false`, sai o `previewExpiresAt`, e o `lastRecipeName` passa a ser o nome real, cortado em 100. Se o turno bloqueado não existir mais, grava o turno completo uma vez só. O `previewId` fica no turno, e o filtro do `$push` (`'messages.previewId': { $ne }`) impede duplicar em chamadas repetidas ou simultâneas. Chamar de novo devolve a mesma receita.

O desbloqueio não dá XP nem conta para missão.

**Rate limit:** nenhuma rota do Pulse AI tem limitador próprio. O endpoint novo fica coberto pelo `authenticatedLimiter` global (120 req/min por usuário, em `index.ts`). Seguindo o escopo, não foi criado um limitador novo.

### Exclusão de conta

`DELETE /users/me` passou a apagar também `locked_previews` (`LockedPreviewModel.deleteMany({ userId })`, na mesma transação). Antes disso, o teste ao vivo encontrou 3 prévias órfãs com a receita completa depois da exclusão.

### `lastRecipeName` com mais de 100 caracteres

Esse bug já existia antes deste CP e aparecia em qualquer mensagem, inclusive de Pro. Quando a IA devolvia um título com mais de 100 caracteres, o `$set` de `lastRecipeName` falhava na validação do schema (`maxlength`) e a resposta virava 500. O rollback já devolvia o uso. Agora `toLastRecipeName` corta só o resumo em 100 caracteres, sem deixar meio emoji, e a receita continua inteira no turno. O helper fica em `utils/` porque os testes existentes mockam `../models/Conversation` inteiro.

### O que não mudou

- Pro: nenhuma mudança de comportamento, a não ser que o título longo não dá mais 500.
- O limite de 3 mensagens, o 429 e o código `pulseai/daily-limit-reached`.
- Analytics no backend.
- Pantry Scanner (fica para o CP-1.1.4b) e tela de planos.

---

## Tarefa 2 — App

### Serviços

O `pulseAi.service` agora lida com dois tipos de resposta, `PulseAiRecipeResult | PulseAiLockedPreviewResult`, e a prévia é identificada por `locked: true`. Na prévia ele não chama `handleXPResponse`/`handleMissionResponse` nem dispara `ai_message_sent`.

A função nova `unlockPreview(previewId)` mapeia os códigos novos:

| Código | Chave |
|---|---|
| `pulseai/preview-not-found` | `errors.pulseai_preview_expired` |
| `pulseai/preview-locked` | `errors.pulseai_preview_locked` |

`ConversationMessage` ganhou `locked`, `previewId` e `previewExpiresAt`.

### Card bloqueado

`LockedRecipeCard`, no mesmo arquivo do `RecipeCard`, reaproveita as pílulas de macro (`MacroPill` e o hook `useMacroPills`, extraído do card normal sem mudar o visual). De cima para baixo:

1. Selo "Pulse AI" e um cadeado.
2. Título genérico "Your Pulse AI recipe" / "Sua receita do Pulse AI".
3. Macros.
4. Linhas falsas, só `View`s sem texto, com larguras fixas que não vêm da receita. Por cima, o desfoque, e no centro um cadeado com "Unlock with Pulse Pro" / "Desbloqueie com o Pulse Pro".

Sem os botões do rodapé (preparar, lista, compartilhar, salvar), porque todos dependem da receita completa. O card inteiro é um botão que abre a rota `Upgrade`.

**Android:** usa um véu semitransparente (`colors.overlay.white[80]`, que inverte com o tema) em vez do `BlurView`. Sem o modo experimental, o `BlurView` do expo-blur no Android só aplica uma cor por cima, sem desfocar. O modo experimental pesa dentro de `FlatList`. No iOS fica o `BlurView`, com `tint` seguindo o tema. O véu não foi conferido no aparelho (ver testes manuais).

**Acessibilidade:**
- o card é lido como "Receita bloqueada. Toque para desbloquear com o Pulse Pro" (sem o nome, que fica escondido);
- as linhas falsas ficam fora do leitor de tela (`accessibilityElementsHidden` e `importantForAccessibility="no-hide-descendants"`).

**Expirada:** o card mostra "Esta prévia expirou. Peça de novo para ver a receita completa.", sem ação de toque.

### Tela do Pulse AI

- **Prévia recebida:** o card bloqueado entra no chat, `usageRemaining` vira 0 (campo desabilitado e botão "Upgrade", como no limite de hoje) e dispara `paywall_preview_shown`.
- **Toque no card:** dispara `paywall_preview_tapped` e navega para a raiz, rota `Upgrade`.
- **Virou Pro:** um efeito que observa `isPro` (do auth store) e as mensagens chama `unlockPreview` para cada prévia ainda bloqueada no chat e troca o card pelo `RecipeCard` normal. A compra atualiza o auth store antes do `goBack` da tela de planos, então ao voltar o card já foi trocado. Escolhi o efeito no lugar de um listener de foco porque ele cobre os dois casos (voltar dos planos e reabrir a conversa) com um só caminho. Uma ref evita chamada duplicada para a mesma prévia.
- **Expirada (404):** marca o card como expirado e mostra um toast curto (`errors.pulseai_preview_expired`), sem erro genérico.
- **403 ou falha de rede:** nada muda. O card continua bloqueado e a próxima mudança tenta de novo.
- **Conversa reaberta** (histórico ou conversa do dia): turnos com `locked` viram card bloqueado, ou expirado se `previewExpiresAt` já passou. Se a pessoa já for Pro, desbloqueia.

### Analytics

No padrão do `analytics.service` (`trackEvent`), sem nenhum dado da receita:

| Evento | Quando | Propriedades |
|---|---|---|
| `paywall_preview_shown` | A prévia chega no chat | `source: 'pulse_ai'` |
| `paywall_preview_tapped` | Toque no card bloqueado | `source: 'pulse_ai'` |

`purchase_completed` continua igual. A prévia **não** dispara `ai_message_sent`, que segue contando só receitas entregues de verdade. Se o Gabriel quiser contar a prévia também, é uma linha no serviço.

### Textos novos

- `pulseAi.lockedPreview`: `genericTitle`, `unlockCta`, `a11yLabel`, `expired` e `expiredA11yLabel`.
- `errors`: `pulseai_preview_expired` e `pulseai_preview_locked`.

Estão nos dois idiomas e passam pela checagem estrita do `t()`, sem cast. Foram inseridos sem reformatar o resto dos arquivos.

---

## Testes

| Arquivo | O que cobre |
|---|---|
| [pulseAiPreview.controller.test.ts](../../apps/api/src/controllers/pulseAiPreview.controller.test.ts) (novo, 23 testes) | Ver lista abaixo. Os models são fakes com estado, e as operações atômicas são avaliadas de uma vez no `exec()`, como o Mongo faria. É isso que permite testar a corrida |
| [Conversation.test.ts](../../apps/api/src/models/Conversation.test.ts) (novo, 8 testes) | Schema real do Mongoose (`validateSync`): turno `locked` aceita só macros e rejeita receita completa, `tip` e `title`; turno normal continua exigindo a receita completa; `toLastRecipeName` corta em 100, passa no schema e não deixa meio emoji |
| [LockedRecipeCard.test.tsx](../../apps/mobile/src/components/pulseAi/LockedRecipeCard.test.tsx) (novo, 4 testes) | Título genérico e macros. Com uma prévia "vazada" (título, ingredientes, passos e dica), nenhum desses textos aparece na árvore. Rótulo e papel de acessibilidade, linhas falsas fora do leitor de tela, toque e variante expirada |
| [PulseAIScreen.lockedPreview.test.tsx](../../apps/mobile/src/screens/PulseAIScreen.lockedPreview.test.tsx) (novo, 7 testes) | 4ª mensagem com card bloqueado, chat no limite e evento sem dados da receita; toque abre `Upgrade` com evento; volta como Pro e o card vira normal; expirada mostra aviso sem erro genérico; sem assinar, nada muda; conversa reaberta como não Pro e como Pro |

O que o teste do controller cobre:

- 4ª mensagem com o JSON inteiro comparado (não só a ausência de campos), receita completa guardada, validade de 24h, `dailyAiUsage` intacto, sem XP, missão nem cache;
- o turno gravado só com macros e sem `lastRecipeName`;
- o GET da conversa sem nada da receita;
- o histórico mandado à IA no dia seguinte, só com o aviso fixo;
- 5ª mensagem com 429 sem chamar a IA;
- contador zerado no dia seguinte no fuso do usuário, e não zerado no mesmo dia;
- conta antiga sem o campo;
- falha da IA (503) e dieta não atendida (422) devolvendo a prévia;
- caminho do cache;
- Pro nunca recebe prévia;
- dentro das 3, nada muda;
- título com a receita dentro não sai em lugar nenhum;
- título longo numa mensagem normal, com `lastRecipeName` cortado;
- corrida;
- desbloqueio:
  - Pro recebe a receita inteira e o turno é substituído;
  - duas chamadas não duplicam o turno;
  - sem o turno, grava uma vez só;
  - não Pro recebe 403;
  - outro usuário recebe 404;
  - prévia expirada recebe 404;
  - ids inválidos recebem 404.

Os testes existentes do Pulse AI continuam passando sem mudar expectativa. Os avisos de `act(...)` no teste da tela vêm de efeitos que já existiam na `PulseAIScreen`, como a sincronização do Pantry ao montar.

## Testes manuais no aparelho

1. **3 mensagens + prévia + limite:** conta grátis manda 3 mensagens normais, e o contador desce 2 → 1 → 0. A 4ª mostra o card bloqueado com "Sua receita do Pulse AI", os macros e o desfoque (iOS) ou o véu (Android). O campo fica desabilitado com "Upgrade".
2. **5ª mensagem:** não dá para enviar pelo app, porque o campo está desabilitado. Para conferir o 429, chamar a API direto.
3. **Toque:** tocar no card abre a tela de planos. No Android, conferir se o véu fica bom nos dois temas.
4. **Assinatura (com build):** assinar no sandbox e voltar. O card vira receita completa sem pedir de novo. Reabrir pelo histórico e conferir que continua completa e que a lista mostra o nome da receita.
5. **Sem assinar:** fechar a tela de planos não muda nada.
6. **Leitor de tela:** VoiceOver e TalkBack leem "Receita bloqueada. Toque para desbloquear com o Pulse Pro", e as linhas falsas não são lidas.
7. **Conversa reaberta:** reabrir a conversa com a prévia pelo histórico mostra o card bloqueado. Se a prévia tiver mais de 24h, mostra o card expirado.
8. **Dia seguinte:** no fuso do usuário, as 3 mensagens e a prévia voltam.

## Próximo passo (CP-1.1.4b)

O Pantry Scanner reaproveita:
- `locked_previews`, acrescentando o `kind` dele em `lockedPreviewKindValues`;
- o padrão de reserva e rollback;
- o `LockedRecipeCard`.

O que o pentest ensinou vale lá também: o nome da receita é gerado pela IA e não pode ser tratado como parte visível.

## Arquivos

- **Novos:**
  - `apps/api/src/models/LockedPreview.ts`
  - `apps/api/src/utils/recipeName.utils.ts`
  - `apps/api/src/controllers/pulseAiPreview.controller.test.ts`
  - `apps/api/src/models/Conversation.test.ts`
  - `apps/mobile/src/components/pulseAi/LockedRecipeCard.test.tsx`
  - `apps/mobile/src/screens/PulseAIScreen.lockedPreview.test.tsx`
- **Alterados:**
  - `packages/shared/src/schemas/pulseAi.ts`
  - no backend: `User.ts`, `Conversation.ts`, `pulseAi.controller.ts`, `conversation.controller.ts`, `user.controller.ts`, `routes/pulseAi.ts`
  - no app: `pulseAi.service.ts`, `conversation.service.ts`, `RecipeCard.tsx`, `ChatMessage.tsx`, `PulseAIScreen.tsx`, `en.json`, `pt-BR.json`
- **Não mudaram:** Pantry Scanner, `UpgradeScreen` e fluxo de compra, `ChatInput`, `analytics.service` (app e backend), limite de 3 mensagens.
