# CP-1.1.4b — Prévia bloqueada no Pantry Scanner ("Wow Moment Paywall")

Item do brief do Jon (Update 1.1, "Wow Moment Paywall"). O [CP-1.1.4a](cp-1.1.4a-previa-bloqueada-pulse-ai.md) fez isso no Pulse AI. Este CP aplica o mesmo padrão no Pantry Scanner, reaproveitando a coleção `locked_previews`, a reserva atômica com rollback, o `LockedRecipeCard` e os eventos `paywall_preview_*`.

Regras decididas pelo Gabriel:

- 1 prévia por ciclo mensal, depois dos 3 scans grátis. Passado isso, o comportamento é o de hoje.
- A prévia é extra: não conta como scan e não devolve scan.
- Visíveis: os ingredientes detectados na foto e, de cada receita, **só os macros**. Nome, ingredientes, passos, dicas e o resto ficam no servidor (lição do pentest do 1.1.4a: o título é gerado pela IA e pode carregar a receita inteira).
- Validade da prévia: 7 dias.
- O app guarda no aparelho o id da última prévia. Quem vira Pro e abre o scanner dentro da validade vê as receitas desbloqueadas do último scan.

Princípio: o conteúdo escondido nunca sai do servidor para quem não é Pro, por nenhuma rota.

Verificação final:
- typecheck nos 3 workspaces e lint limpos;
- API **627/627** (antes 604);
- mobile **813/813** em 42 suítes (antes 782 em 38);
- teste ao vivo e pentest **83/83** (ver [cp-1.1.4b-testes-pentest.md](cp-1.1.4b-testes-pentest.md)).

## Resumo

| # | O que mudou | Onde |
|---|---|---|
| 1 | Contador `monthlyScanPreviewUsage`, zerado no mesmo update que `scanCount` | [User.ts](../../apps/api/src/models/User.ts), [pantryScanner.controller.ts](../../apps/api/src/controllers/pantryScanner.controller.ts) |
| 2 | `kind` novo `'pantry_scanner'` e validade por kind | [LockedPreview.ts](../../apps/api/src/models/LockedPreview.ts) |
| 3 | 4º scan do grátis: reserva antes da visão, gera, guarda e responde só ingredientes + macros | [pantryScanner.controller.ts](../../apps/api/src/controllers/pantryScanner.controller.ts) |
| 4 | Endpoint novo `GET /pantry-scanner/previews/:id` (desbloqueio) | [routes/pantryScanner.ts](../../apps/api/src/routes/pantryScanner.ts) |
| 5 | Schemas estritos da prévia e do desbloqueio | [pantryScanner.ts (shared)](../../packages/shared/src/schemas/pantryScanner.ts) |
| 6 | Serviço: resposta de prévia, `unlockPantryPreview` e códigos novos | [pantryScanner.service.ts](../../apps/mobile/src/services/pantryScanner.service.ts) |
| 7 | `LockedRecipeCard` com `source` (`pulse_ai` por padrão) | [RecipeCard.tsx](../../apps/mobile/src/components/pulseAi/RecipeCard.tsx) |
| 8 | Cards bloqueados, toque, desbloqueio ao voltar Pro e aviso do último scan | [PantryScannerScreen.tsx](../../apps/mobile/src/screens/PantryScannerScreen.tsx) |
| 9 | Última prévia no aparelho, por usuário | [pantryLastPreview.utils.ts](../../apps/mobile/src/utils/pantryLastPreview.utils.ts) |
| 10 | Limpeza da última prévia ao sair e ao excluir a conta | [auth.store.ts](../../apps/mobile/src/store/auth.store.ts) |
| 11 | Textos `pantryScanner.lockedPreview.*` e `errors.scanner_preview_*` | [en.json](../../apps/mobile/src/locales/en.json), [pt-BR.json](../../apps/mobile/src/locales/pt-BR.json) |

---

## Tarefa 1 — Backend

### Constantes

| Constante | Valor | Onde |
|---|---|---|
| `FREE_MONTHLY_SCAN_LIMIT` | 3 (sem mudança) | `pantryScanner.controller.ts` |
| `FREE_MONTHLY_SCAN_PREVIEW_LIMIT` | 1 | `pantryScanner.controller.ts` |
| `LOCKED_PREVIEW_TTL_MS_BY_KIND` | `pulse_ai`: 24 h, `pantry_scanner`: 7 dias | `models/LockedPreview.ts` |

`LOCKED_PREVIEW_TTL_MS` (só 24 h) virou `LOCKED_PREVIEW_TTL_MS_BY_KIND`. O Pulse AI passou a ler `LOCKED_PREVIEW_TTL_MS_BY_KIND.pulse_ai`, com o mesmo valor. No teste do Pulse AI mudou só o nome do export no mock do model, nenhuma expectativa.

### Contador e reserva

`User.monthlyScanPreviewUsage` (inteiro, padrão 0). `resetScanCycleIfNeeded` zera o campo no mesmo `$set` e com o mesmo filtro (`isPro: false` + `scanResetDate` antigo) que zera `scanCount`.

`reservePantryScanPreview` segue o padrão de `reservePulseAiPreview`: um único `findOneAndUpdate` com `isPro: false`, `scanCount >= 3`, limite da prévia no filtro (`$or` com `$exists: false` para conta antiga) e `$inc`. Ela roda **antes** da IA de visão, e só para quem é grátis e já está no limite do ciclo. Sem prévia livre, sai o 429 de hoje (`scanner/monthly-limit-reached`) sem chamar a IA. Pro e grátis dentro dos 3 seguem o fluxo de hoje, sem tocar no campo.

Duas requisições simultâneas não passam juntas: a segunda falha no filtro e recebe 429 antes da visão. Por isso há no máximo 1 prévia e no máximo 1 chamada de visão paga pela prévia.

Um caso de borda que **não** mudou: com `scanCount` 2, dois scans simultâneos passam pela checagem de hoje, os dois chamam a visão, e o segundo cai no 429 do `incrementPantryScanCount`. Isso já era assim e continua igual, porque o prompt limita a prévia a quem já estava no limite antes da visão.

### Caminhos sem receita: devolução da prévia

A prévia fica "presa" a partir da reserva. `releasePreview` a devolve uma vez só (`rollbackPantryScanPreview`, `$inc: -1` com `$gt: 0` no filtro).

| Caminho | Resposta | Como devolve |
|---|---|---|
| Visão indisponível (`AiProviderRequestError`) | 503 `scanner/vision-unavailable` | `releasePreview()` antes de responder |
| Erro inesperado na visão | handler de erro | `catch` do `analyzePantry` chama `releasePreview()` antes do `next` |
| Resposta inválida da visão | 500 `scanner/vision-parse-error` | `releasePreview()` antes de responder |
| Sem comida | 200 `noFoodDetected` (como hoje) | `releasePreview()` antes de responder |
| Sem ingrediente utilizável | 200 `noUsableIngredients` (como hoje) | `releasePreview()` antes de responder |
| Geração vazia ou falha da IA | 200 com `recipes: []` (como hoje) | `releasePreview()` em `runPantryPreviewScan` |
| Todas as receitas violando a dieta | 422 `scanner/dietary-restriction-unmet` | `releasePreview()` em `runPantryPreviewScan` |
| Erro ao gravar a prévia (ou o schema estrito recusar a parte visível) | handler de erro | `deliverPantryLockedPreview` apaga a prévia órfã e relança; o `catch` devolve |

A devolução vem antes da resposta nos caminhos conhecidos, para um novo scan logo em seguida já ver a prévia livre. Nesses caminhos, `scansUsed` volta como `scanCount` (3), porque a prévia nunca tocou nele.

### Prévia entregue

`runPantryPreviewScan` gera as receitas com as mesmas validações de hoje (`generatePantryRecipes`: guardrail de proteína, consistência de macros, dieta e gelo no Lite). Com receita entregue, `deliverPantryLockedPreview`:

1. cria o documento em `locked_previews`: `kind: 'pantry_scanner'`, `userId`, `content: { recipes }` (completas), `context: { ingredients }` (os detectados, devolvidos no desbloqueio) e `expiresAt` = agora + 7 dias;
2. monta a resposta passando pelo `pantryLockedPreviewResultSchema` (estrito). Se falhar, apaga a prévia e relança.

Não incrementa `scanCount`, não dá XP, não conta para missão e não grava cache (o Pantry não tem cache).

### Resposta da prévia

JSON exato, da rodada final do teste ao vivo (conta A, foto da despensa; a IA de visão leu os morangos desenhados como "tomato"):

```json
{
  "success": true,
  "data": {
    "locked": true,
    "previewId": "6af7b7e53adc367929421670",
    "previewExpiresAt": "2026-11-21T01:22:45.878Z",
    "ingredients": [
      {
        "name": "banana",
        "estimatedQuantity": "4 units",
        "confidence": "high"
      },
      {
        "name": "tomato",
        "estimatedQuantity": "4 units",
        "confidence": "medium"
      },
      {
        "name": "rolled oats",
        "confidence": "high"
      },
      {
        "name": "almond milk",
        "confidence": "high"
      },
      {
        "name": "peanut butter",
        "confidence": "high"
      }
    ],
    "recipes": [
      {
        "macros": {
          "protein": 11.3,
          "carbs": 76.5,
          "fat": 12.8,
          "calories": 461
        }
      },
      {
        "macros": {
          "protein": 9.4,
          "carbs": 40.5,
          "fat": 15.4,
          "calories": 331
        }
      }
    ],
    "scansUsed": 3,
    "scansLimit": 3,
    "resetDate": "2026-12-14T01:22:20.670Z"
  }
}
```

A parte visível é: `locked`, `previewId`, `previewExpiresAt`, os ingredientes detectados (`name`, `estimatedQuantity` quando houver, `confidence`), os dados do ciclo (`scansUsed`, `scansLimit`, `resetDate`) e, de cada receita, **só `macros`** (reaproveita o `pulseAiRecipePreviewSchema` do 1.1.4a). O schema estrito também deixa de fora:

- `analysisNotes`, que é texto livre da IA de visão e pode ser induzido pela própria foto. Ele não faz parte das regras visíveis da decisão, e o app não o mostra hoje (ver "Decisões tomadas" no fim);
- `noFoodDetected`, porque a prévia só existe quando há comida;
- `xpAwarded`, `leveledUp` e `newLevel`, porque a prévia não dá XP.

### Desbloqueio — `GET /pantry-scanner/previews/:id`

Autenticado e coberto pelo `authenticatedLimiter` global (120 req/min por usuário), como o do Pulse AI.

| Caso | Resposta |
|---|---|
| id inválido (não ObjectId, vazio, gigante) | 404 `scanner/preview-not-found`, sem 500 |
| inexistente, expirado, de outro usuário ou de outro `kind` | 404 `scanner/preview-not-found` (dono, kind e validade no filtro) |
| dono não Pro (`isPro` lido do banco na hora) | 403 `scanner/preview-locked` |
| dono Pro | 200 `{ previewId, ingredients, recipes }` |

Chamar de novo devolve o mesmo, e o desbloqueio não dá XP nem conta para missão. Os dois endpoints filtram pelo próprio `kind`: o do Pulse AI (`kind: 'pulse_ai'`, já existia) não abre prévia do Pantry, e o do Pantry não abre prévia do Pulse AI.

### Exclusão de conta

`DELETE /users/me` já apaga `locked_previews` com `deleteMany({ userId })`, sem filtro de `kind`, então cobre o kind novo. Só o comentário foi atualizado, e o pentest conferiu 0 prévias sobrando.

### O que não mudou

- Pro e grátis dentro dos 3 scans: o mesmo fluxo e as mesmas respostas.
- O 429 `scanner/monthly-limit-reached` e o código do 5º scan em diante.
- Pulse AI: mesmo comportamento e mesma validade de 24h.
- Analytics no backend.

---

## Tarefa 2 — App

### Serviço

`analyzePantry` agora devolve `PantryAnalysisResult | PantryLockedPreviewResult`, e `isPantryLockedPreview` separa os dois. Na prévia, o serviço valida com o schema estrito (uma resposta com campo a mais é recusada), **não** chama `handleXPResponse`/`handleMissionResponse` e **não** dispara `pantry_scan_completed`, que continua contando só scans entregues.

A função nova `unlockPantryPreview(previewId)` codifica o id na URL e mapeia:

| Código | Chave |
|---|---|
| `scanner/preview-not-found` | `errors.scanner_preview_expired` |
| `scanner/preview-locked` | `errors.scanner_preview_locked` |

### Card bloqueado

O `LockedRecipeCard` ganhou a prop `source` (`'pulse_ai'` por padrão), que só troca os textos: selo, título genérico, CTA, rótulo de acessibilidade e texto de expirada. No Pulse AI nada muda: as chaves são as mesmas e os 4 testes do card do 1.1.4a passam sem alteração. No Pantry:

- selo "Pantry Scanner";
- título "Your pantry recipe" / "Sua receita da despensa";
- expirada: "This preview has expired. Scan again to get new recipes." / "Esta prévia expirou. Escaneie de novo para ver novas receitas."

O visual, as linhas falsas sem texto, o desfoque no iOS, o véu no Android (`colors.overlay.white[80]`) e a acessibilidade ("Receita bloqueada. Toque para desbloquear com o Pulse Pro", linhas falsas fora do leitor de tela) são os mesmos do 1.1.4a.

### Tela do Pantry

- **Prévia recebida:** segue o caminho de hoje. Etapa dos ingredientes (os detectados, marcados) e, depois de "Gerar receitas", a etapa das receitas com um `LockedRecipeCard` por receita. O subtítulo "Com base em…" usa os ingredientes, que são visíveis. O id e a validade são guardados no aparelho.
- **`paywall_preview_shown`:** dispara quando os cards bloqueados aparecem na etapa das receitas, uma vez por prévia.
- **Toque no card:** dispara `paywall_preview_tapped` e abre a rota `Upgrade`, pelo mesmo caminho de navegação do limite de hoje.
- **Voltou como Pro:** um efeito que observa `isPro` chama `unlockPantryPreview` e troca os cards por `RecipeCard` normais, com os botões de hoje (preparar, salvar, lista, compartilhar). Mesmo raciocínio do 1.1.4a: a compra atualiza o auth store antes do `goBack` da tela de planos.
- **Expirada (404):** os cards viram a variante expirada, aparece o toast `errors.scanner_preview_expired` e a prévia guardada sai do aparelho.
- **403 ou rede:** nada muda.
- **Não assinou:** nada muda e não há chamada de desbloqueio.
- **5º scan:** o comportamento de hoje (volta para a captura e abre `Upgrade`).

### Última prévia no aparelho

[pantryLastPreview.utils.ts](../../apps/mobile/src/utils/pantryLastPreview.utils.ts), no storage que o app já usa (`createAppStorage('blendi-pulse')`, MMKV criptografado). A chave é `pantry_last_preview:<userId>`, e o valor guarda só `{ previewId, expiresAt, unlockedSeen }`, nada da receita.

Ela é limpa:

| Quando | Onde |
|---|---|
| Sair da conta | `logout` no `auth.store` |
| Excluir a conta | `deleteAccount` no `auth.store` |
| Expirar | `readLastPantryPreview` apaga ao ler |
| Desbloqueio responde 404 | tela (aviso do último scan e cards na tela) |
| Scan novo depois de ver as receitas desbloqueadas | `clearLastPantryPreviewIfSeen` no início do scan; `unlockedSeen` é marcado quando a etapa das receitas mostra as receitas desbloqueadas |
| Dispensar o aviso | tela |

Uma prévia nova substitui a anterior.

**Aviso "Recipes from your last scan" / "Receitas do seu último scan":** aparece na captura só para Pro, com prévia guardada e válida. É uma pílula discreta no topo do visor, no mesmo estilo do contador de scans (overlay escuro fixo da câmera), com um botão de fechar. Tocar abre a etapa das receitas com os ingredientes e as receitas desbloqueados. Dispensar limpa o id. Para quem é grátis com prévia guardada, a captura não mostra nada novo.

### Analytics

| Evento | Quando | Propriedades |
|---|---|---|
| `paywall_preview_shown` | Os cards bloqueados aparecem | `source: 'pantry_scanner'` |
| `paywall_preview_tapped` | Toque no card bloqueado | `source: 'pantry_scanner'` |

Nenhum dado das receitas nos eventos. O `paywall_preview_shown` do Pulse AI **não precisou mudar**: ele continua no `PulseAIScreen` com `source: 'pulse_ai'`. `pantry_scan_completed` não dispara na prévia.

### Textos novos

- `pantryScanner.lockedPreview`: `badge`, `genericTitle`, `unlockCta`, `a11yLabel`, `expired`, `expiredA11yLabel`, `lastScanTitle`, `lastScanA11yLabel` e `lastScanDismiss`.
- `errors`: `scanner_preview_expired` e `scanner_preview_locked`.

Estão nos dois idiomas e passam pela checagem estrita do `t()`, sem cast. O mapa de chaves do card é tipado como `TranslationKey`.

---

## Testes

| Arquivo | O que cobre |
|---|---|
| [pantryScannerPreview.controller.test.ts](../../apps/api/src/controllers/pantryScannerPreview.controller.test.ts) (novo, 23 testes) | Fakes com estado, operações atômicas avaliadas no `exec()`. Lista abaixo |
| [pantryScanner.preview.test.ts](../../apps/mobile/src/services/pantryScanner.preview.test.ts) (novo, 8) | Prévia sem XP, missão nem `pantry_scan_completed`; scan normal continua disparando; resposta "vazada" (receita completa ou `analysisNotes`) recusada; desbloqueio, URL codificada e os 2 códigos novos |
| [pantryLastPreview.utils.test.ts](../../apps/mobile/src/utils/pantryLastPreview.utils.test.ts) (novo, 6) | Por usuário; só id e validade; expirada e inválida apagadas; limpeza no scan novo só depois de vista; prévia nova substitui |
| [auth.store.pantryPreview.test.ts](../../apps/mobile/src/store/auth.store.pantryPreview.test.ts) (novo, 3) | Logout e exclusão limpam a prévia do usuário; falha ao limpar não impede sair |
| [PantryScannerScreen.lockedPreview.test.tsx](../../apps/mobile/src/screens/PantryScannerScreen.lockedPreview.test.tsx) (novo, 14) | Ver lista abaixo |

Backend:
- 4º scan: JSON inteiro comparado, prévia com `kind: 'pantry_scanner'` e 7 dias, receitas completas guardadas, `scanCount` intacto, sem XP, missão nem cache, receita com a "receita no título" sem sair;
- 5º scan: 429 sem chamar visão nem geração;
- conta antiga sem o campo;
- ciclo novo zera scans e prévia no mesmo update; no mesmo ciclo, a prévia não volta;
- corrida: 2 simultâneos = 1 prévia e 1 chamada de visão;
- rollback em cada caminho da tabela acima (9 testes, incluindo erro inesperado e erro ao gravar), e a prévia devolvida ainda pode ser usada;
- Pro acima de 3 e grátis no 3º scan: nada muda;
- desbloqueio: dono Pro recebe tudo e repetir devolve igual, sem XP nem missão; não Pro, 403; outro usuário, expirada, inexistente e 6 ids inválidos, 404 sem 500;
- cruzamento: Pulse AI com id do Pantry, 404; Pantry com id `pulse_ai` (conteúdo em formato válido), 404.

Conferi que os testes pegam erro com mutações temporárias no controller (título na parte visível, rollback de "sem comida" removido, filtro de `kind` removido). Na primeira tentativa, o fake do model exigia `kind` mesmo quando o filtro não tinha, e o teste de cruzamento não pegava a falta do filtro. O fake foi corrigido para tratar ausência como "qualquer kind", como o Mongo faz, e agora pega.

Mobile (tela):
- cards só com macros e título genérico, com uma prévia "vazada" (título, ingredientes, passos, dica, `analysisNotes`) sem nenhum desses textos na árvore; evento com só `{ source }`; prévia guardada para o usuário certo, sem receita no storage;
- toque abre `Upgrade` com evento;
- voltar como Pro troca os cards pelas receitas e marca como vista;
- expirada: card expirado e toast, sem erro genérico, e limpa o id;
- não assinou: nada muda; Pro com 403: nada muda;
- 5º scan: captura e `Upgrade`;
- aviso: aparece para Pro e abre ingredientes e receitas; não aparece para grátis (a captura continua com 3 botões); dispensar limpa; expirada guardada some; 404 limpa; prévia de outro usuário não aparece; scan novo limpa só depois de vista.

Testes existentes: API e mobile passam sem mudar expectativa. Mudaram duas linhas de teste que não são expectativa:
- o mock do `LockedPreview` no teste do Pulse AI (`LOCKED_PREVIEW_TTL_MS` → `LOCKED_PREVIEW_TTL_MS_BY_KIND`, mesmo valor);
- [recipeRestrictionErrors.test.ts](../../apps/mobile/src/services/recipeRestrictionErrors.test.ts) ganhou um `if (isPantryLockedPreview(result)) throw` para estreitar o tipo, porque `analyzePantry` agora devolve a união.

## Testes manuais (Expo Go e aparelho)

1. **3 scans normais:** conta grátis faz 3 scans, e o contador da captura desce 2 → 1 → 0.
2. **4º scan, prévia:** os ingredientes detectados aparecem na etapa dos ingredientes. Em "Gerar receitas", 2 cards com "Sua receita da despensa", selo "Pantry Scanner", os macros e o desfoque (iOS) ou o véu (Android). Nenhum nome de receita.
3. **5º scan, limite:** volta para a captura e abre a tela de planos, como hoje.
4. **Tocar e abrir os planos:** tocar num card abre a tela de planos. Fechar sem assinar não muda nada.
5. **Assinar no sandbox (com build):** assinar e voltar. Os cards viram receitas completas com preparar, salvar, lista e compartilhar.
6. **Fechar, virar Pro e reabrir:** com uma conta grátis, ver a prévia e fechar o scanner. Virar Pro (sandbox ou, só em conta de teste, `isPro` no banco de dev) e reabrir o scanner. Aparece "Receitas do seu último scan" na captura. Tocar abre ingredientes e receitas. Fechar e reabrir: o aviso continua. Fazer um scan novo: o aviso some. Repetir e tocar no X: o aviso some.
7. **Grátis com prévia guardada:** reabrir o scanner como grátis não mostra o aviso.
8. **Sair da conta:** com prévia guardada, sair e entrar como Pro em outra conta. O aviso não aparece.
9. **Véu no Android:** conferir o card bloqueado nos temas claro e escuro.
10. **Leitor de tela:** VoiceOver e TalkBack leem "Receita bloqueada. Toque para desbloquear com o Pulse Pro", as linhas falsas não são lidas, e o aviso do último scan lê "Abrir as receitas do seu último scan" e "Dispensar as receitas do seu último scan".
11. **Ciclo novo:** na data de renovação, os 3 scans e a prévia voltam.

## Decisões tomadas sem perguntar

- **`analysisNotes` fora da prévia.** O prompt pede "os ingredientes detectados como hoje" e diz que só os ingredientes e os macros ficam visíveis. As notas da análise são texto livre da IA de visão, que a foto pode induzir (o pentest confirmou), e o app não as mostra hoje. Por isso o schema estrito as deixa de fora. Nos caminhos sem receita (sem comida, sem ingrediente utilizável), a resposta é a de hoje e continua com elas: nada escondido foi gerado ainda.
- **Quando o `paywall_preview_shown` dispara.** No Pantry, os cards só aparecem depois de "Gerar receitas", então o evento dispara quando eles aparecem, e não quando a resposta chega.
- **Aviso do último scan abre a etapa das receitas**, com os ingredientes no subtítulo e a seta de voltar levando aos ingredientes.

## Arquivos

- **Novos:**
  - `apps/api/src/controllers/pantryScannerPreview.controller.test.ts`
  - `apps/mobile/src/utils/pantryLastPreview.utils.ts` e `.test.ts`
  - `apps/mobile/src/services/pantryScanner.preview.test.ts`
  - `apps/mobile/src/store/auth.store.pantryPreview.test.ts`
  - `apps/mobile/src/screens/PantryScannerScreen.lockedPreview.test.tsx`
- **Alterados:**
  - `packages/shared/src/schemas/pantryScanner.ts`
  - no backend: `LockedPreview.ts`, `User.ts`, `pantryScanner.controller.ts`, `routes/pantryScanner.ts`, `pulseAi.controller.ts` (só a constante de validade), `user.controller.ts` (só o comentário), e o mock no `pulseAiPreview.controller.test.ts`
  - no app: `pantryScanner.service.ts`, `RecipeCard.tsx`, `PantryScannerScreen.tsx`, `auth.store.ts`, `en.json`, `pt-BR.json` e uma linha em `recipeRestrictionErrors.test.ts`
- **Não mudaram:** `UpgradeScreen` e fluxo de compra, `PulseAIScreen`, `analytics.service` (app e backend), limite de 3 scans e histórico (não há).
