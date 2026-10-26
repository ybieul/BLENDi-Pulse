# CP-C — `weightGoal` na Pulse AI/Pantry Scanner + paridade do guardrail de proteína

**Base:** [cp-c-investigacao-personalizacao-pulse-ai-pantry-scanner.md](cp-c-investigacao-personalizacao-pulse-ai-pantry-scanner.md) (investigação pura, sem código alterado).
**Escopo:** conectar `weightGoal` ao prompt dos dois pipelines (Pulse AI e Pantry Scanner) com uma instrução qualitativa por valor (lose/maintain/gain); estender o guardrail físico de proteína (Layer 2) para também rodar no Pantry Scanner.
**Método:** implementação tarefa por tarefa, com typecheck limpo validado após cada tarefa de código. Teste real na Tarefa 4: servidor não subido — os controllers reais (`chat`, `analyzePantry`) foram chamados diretamente, sem HTTP, contra o MongoDB Atlas real (banco `test`), usando `node:test` `mock.module()` (Node 22, flag `--experimental-test-module-mocks`) para substituir **só** `callAi`/`callVisionAi` de `aiProvider.service.ts` — a única dependência externa real dos dois fluxos — antes de importar os controllers. Nenhuma linha de `pulseAi.controller.ts`/`pantryScanner.controller.ts` foi copiada, reescrita ou contornada; a lógica de negócio real (perfil do Mongo, `buildSystemPrompt`, os dois guardrails, cache) executou sem modificação.
**Contas de teste:** 9 contas descartáveis (`cpc-verify-weightgoal-*-<timestamp>@test.blendi.local`), removidas ao final do próprio script (`deleteMany`) com **0 remanescentes** confirmados duas vezes: no mesmo processo e por um segundo script, em processo separado, sem nenhum `mock.module` nem import de controller. Scripts temporários (`apps/api/cpc-verify-weightgoal-tmp.test.ts`, `apps/api/cpc-cleanup-check-tmp.ts`) apagados ao final — `git status` final idêntico ao estado desta tarefa (só os 4 arquivos de código-fonte alterados abaixo).

---

## Tarefa 1 — Conectar `weightGoal` aos dois pipelines

### 1.1/1.2 — `.select({...})` e tipo local em cada controller

`pulseAi.controller.ts:235` (`.select({...})` de `findPulseAiUserProfile`) ganhou `weightGoal: 1`; o tipo `PulseAiUserProfile` ganhou `weightGoal?: WeightGoal;` (`pulseAi.controller.ts:75`); o mapeamento do lean result ganhou `weightGoal: user.weightGoal as WeightGoal | undefined` (`pulseAi.controller.ts:257`).

Mesmo padrão em `pantryScanner.controller.ts`: `.select({...})` de `findPantryScannerUserProfile` ganhou `weightGoal: 1` (linha 384), `PantryScannerUserProfile` ganhou `weightGoal?: WeightGoal;` (linha 58), mapeamento em `weightGoal: user.weightGoal as WeightGoal | undefined` (linha 406).

Campo opcional (não `WeightGoal` puro) — mesmo padrão já usado por `dailyCarbTarget`/`recentBlendRecipeNames` nesta mesma base: embora o schema do Mongoose declare `weightGoal` como `required: true` (`User.ts:471-475`), isso só é enforced em escrita; contas cuja persistência antecede a coleta deste campo (linha de trabalho CP-B anterior) podem não tê-lo no documento, e uma leitura `.lean()` simplesmente devolve `undefined` nesse caso, sem erro. A Tarefa 4 testa exatamente esse caso (`weightGoal` ausente).

### 1.3 — `PulseAiPromptUserContext` e repasse nas duas chamadas reais

`promptBuilder.service.ts:31`: `weightGoal?: WeightGoal;` adicionado à interface. As duas interfaces que a estendem (`BuildPulseAiPromptInput`, linha 62; `BuildPantryRecipePromptInput`, linha 72) herdam o campo automaticamente.

Repasse nas duas chamadas reais que montam esse contexto:
- `runPulseAiChat` → `buildPulseAiPrompt({...})`, `pulseAi.controller.ts:595`: `weightGoal: currentUser.weightGoal,`.
- `generatePantryRecipes` → `buildPantryRecipePrompt({...})`, `pantryScanner.controller.ts:539`: `weightGoal: user.weightGoal,`.

### Achado extra (fora da checklist literal, mas necessário para "ponta a ponta"): cache key da Pulse AI

A cache key de `cache.service.ts` já incluía `model`/`goal`/`unitSystem` — campos que, assim como `weightGoal` a partir desta tarefa, afetam o texto do system prompt — justamente para que qualquer mudança nesses valores gere uma chave diferente e nunca sirva uma resposta em cache construída sob um contexto antigo. Sem incluir `weightGoal`, um usuário que mudasse o objetivo de peso e repetisse a mesma mensagem dentro do TTL do cache receberia uma receita gerada com o texto de `weightGoal` **anterior**, porque o cache hit (`pulseAi.controller.ts`, branch `cachedResponse`) pula inteiramente a chamada a `buildPulseAiPrompt`/`buildSystemPrompt`.

Corrigido reaproveitando o mesmo padrão: `CacheKeyInput`/`generateCacheKey`/`setInCache` (`cache.service.ts:18,53,61,76,116,129`) ganharam `weightGoal?: string` (default `'none'`, mesmo motivo do campo ser opcional em `PulseAiPromptUserContext`), e as duas chamadas reais em `pulseAi.controller.ts` (`generateCacheKey` na leitura, linha 532; `setInCache` na escrita, linha 693) passam `weightGoal: currentUser.weightGoal`. O índice do hash de verificação (`cacheKeyParts[...] !== normalizedMessageHash`) foi ajustado de `[7]` para `[8]` (`pulseAi.controller.ts:539`), deslocado pelo novo segmento inserido entre `unitSystem` e `aiProvider`. Nenhum teste existente depende do formato antigo da chave (confirmado por busca, zero resultados).

**Achado incidental, não corrigido (fora de escopo):** durante o teste real da Tarefa 4, a primeira tentativa (usando um `callAi` fake que devolvia `provider: 'fake'`) revelou que `setInCache` (`cache.service.ts:137` da versão antes desta correção) lança `Error: [cache.service] cacheKey does not match the provided query metadata` sempre que `aiResponse.provider`/`aiResponse.model` (valores reais, pós-chamada) diferem do `env.AI_PROVIDER`/`env.AI_MODEL` (valores configurados, usados na chave computada **antes** da chamada). Isso é préexistente e não relacionado a `weightGoal` — se `callAi` algum dia cair em fallback de provider de verdade (o campo `fromFallback` em `AiProviderResponse` sugere que esse caminho existe), a resposta teria o `provider` do fallback, a gravação em cache lançaria essa exceção, e `runPulseAiChat` propagaria o erro (não há `catch` em torno de `setInCache`). Não corrigido aqui — é um problema de cache/fallback, não de personalização por `weightGoal`; meu fake foi ajustado para ecoar `env.AI_PROVIDER`/`env.AI_MODEL` para não disparar isso artificialmente durante o teste.

---

## Tarefa 2 — Nova seção em `buildSystemPrompt`

### 2.1 — Conteúdo por valor

`WEIGHT_GOAL_GUIDANCE`/`buildWeightGoalSection` (`promptBuilder.service.ts:216-240`):

```ts
const WEIGHT_GOAL_GUIDANCE: Record<WeightGoal, string[]> = {
  lose: [
    'Weight goal guidance (lose):',
    '- Favor ingredients with a high protein-to-calorie and fiber-to-calorie ratio.',
    '- Prefer lower-calorie-density liquid bases (water, unsweetened plant milk) over denser ones (whole milk, fruit juice).',
    '- Avoid adding high-calorie-density, low-satiety ingredients (honey, added sugar, excess peanut butter, dried fruit) unless the user explicitly asks for them.',
  ],
  maintain: [
    'Weight goal guidance (maintain):',
    '- Apply no special bias from this goal. Build the recipe with the same standard, balanced proportions you would use without a weight goal in context.',
  ],
  gain: [
    'Weight goal guidance (gain):',
    '- Favor high-calorie-density ingredients (peanut butter, oats, banana, whole milk, nuts) to increase the calorie density of the recipe without increasing its volume beyond what the blender can handle.',
    "- The blender's physical volume and protein limits below still apply and take priority over this guidance.",
  ],
};

function buildWeightGoalSection(weightGoal: WeightGoal | undefined): string {
  if (!weightGoal) {
    return '';
  }

  return WEIGHT_GOAL_GUIDANCE[weightGoal].join('\n');
}
```

`maintain` é explícito em não aplicar nenhum viés ("*Apply no special bias from this goal*"), por instrução literal do prompt original — evita que o modelo invente um viés próprio só por ver o campo presente.

### 2.2 — Posicionamento: não contradiz nem duplica os guardrails físicos/de escopo

A seção é inserida (`promptBuilder.service.ts:349-365`) **depois** de `buildRecipeScopeSection()` (regra de 25–40% da meta diária de proteína por receita) e **antes** de `buildBlenderGuardrailsSection(...)` (última seção do prompt, limite físico de volume/proteína por modelo de blender):

```ts
sections.push(
  '', buildMacroCalculationSection(),
  '', buildNutritionReferenceSection(),
  '', buildCalorieEquationCheckSection(),
  '', buildRecipeScopeSection()
);

const weightGoalSection = buildWeightGoalSection(weightGoal);
if (weightGoalSection) {
  sections.push('', weightGoalSection);
}

sections.push('', buildBlenderGuardrailsSection(blendiModel, unitSystem));
```

O texto do bloco `gain` referencia essa ordem explicitamente ("*...limits **below** still apply and take priority over this guidance*") — não é só a posição que evita a contradição, o próprio texto declara a prioridade do guardrail físico sobre a preferência qualitativa de `weightGoal`. É uma preferência de composição, nunca uma autorização para violar os limites físicos.

### 2.3 — Chamada automática nos dois pipelines

`buildSystemPrompt` destructura `weightGoal` (`promptBuilder.service.ts:281`) a partir do parâmetro de tipo `PulseAiPromptUserContext & {...}` — como os dois pipelines (achado 2 da investigação anterior) chamam a **mesma** função `buildSystemPrompt` (Pulse AI via `buildPulseAiPrompt`, Pantry Scanner via `buildPantryRecipePrompt`), a seção vale automaticamente para os dois, sem duplicar lógica. Confirmado por execução real na Tarefa 4 (os dois pipelines, nos 4 valores de `weightGoal`).

---

## Tarefa 3 — Paridade do guardrail de proteína no Pantry Scanner

### 3.1 — Padrão atual na Pulse AI (citação)

`ensureBlenderGuardrail` (`pulseAi.controller.ts:321-354`, linhas renumeradas pela Tarefa 1 mas o corpo é o mesmo da investigação anterior): chama `validateProteinGuardrail`; se violar, loga e faz **um único retry** via `buildProteinGuardrailRetryMessage` + `generatePulseAiRecipe` com o histórico de mensagens + a mensagem de retry anexada; retorna `retried.recipe ?? recipe` (sem loop, nunca bloqueia o usuário mesmo se o retry falhar). Chamada real em `pulseAi.controller.ts:675-676`: a proteína (Layer 2) roda **antes** de `ensureMacroConsistency` (Layer 3).

### 3.2 — Implementação no Pantry Scanner

`ensurePantryRecipeProteinGuardrail` (`pantryScanner.controller.ts:285-317`) replica exatamente essa lógica, reaproveitando (não reescrevendo) `validateProteinGuardrail`/`buildProteinGuardrailRetryMessage` — as mesmas funções de `blenderGuardrail.utils.ts` já usadas pela Pulse AI. Mesmo único retry; mesmo `maxTokens: 2000` já usado pelo retry de `ensurePantryRecipeMacroConsistency` (não o `PANTRY_RECIPE_MAX_TOKENS: 7000` da geração inicial, que é para as 2 receitas juntas).

Em `generatePantryRecipes` (`pantryScanner.controller.ts:562-571`), cada receita passa primeiro pelo guardrail de proteína e só depois pelo de macro/calorias — mesma ordem da Pulse AI:

```ts
return await Promise.all(
  recipes.map(async recipe => {
    const proteinGuardedRecipe = await ensurePantryRecipeProteinGuardrail(
      recipe,
      prompt,
      user.blendiModel
    );
    return ensurePantryRecipeMacroConsistency(proteinGuardedRecipe, prompt);
  })
);
```

### 3.3 — Layer 3 (macro/calorias) não afetada

Confirmado por `git diff`: o corpo de `ensurePantryRecipeMacroConsistency` está **byte a byte idêntico** ao estado anterior a esta tarefa — nenhuma linha dentro da função foi tocada. A única mudança é qual receita ela recebe como argumento (a já corrigida pelo guardrail de proteína, quando aplicável). Os dois guardrails coexistem, cada um checando sua própria condição, exatamente como já acontecia na Pulse AI.

---

## Tarefa 4 — Testes reais

### 4.1 — System prompt real capturado por `weightGoal`, nos dois pipelines

8 contas de teste criadas direto via `UserModel.create(...)` (mesmo conjunto de campos que `auth.controller.ts` usa em `register`) — **duas baterias separadas de 4, uma por pipeline, contas não reaproveitadas entre Pulse AI e Pantry Scanner**: 4 contas para o teste da Pulse AI (`lose`, `maintain`, `gain`, e uma com o campo removido via `$unset` após a criação, simulando uma conta sem o dado) e outras 4 contas, com os mesmos 4 cenários, para o teste do Pantry Scanner. Mais a conta dedicada da Tarefa 4.2 (Lite), total **9 contas nesta execução** — ver reconciliação completa na seção "Correção pós-revisão" ao final deste documento. `chat()` e `analyzePantry()` — os handlers exportados reais, sem nenhuma cópia — foram chamados diretamente com `req`/`res`/`next` fake, contra o Atlas real. `callAi`/`callVisionAi` foram substituídos via `mock.module()` para capturar o `systemPrompt` recebido e devolver uma receita fake válida, sem nenhuma chamada de rede real.

Texto real capturado para `weightGoal: 'lose'` na Pulse AI (`PULSE_AI_SYSTEM_PROMPT[lose]`, trecho relevante):

```
Recipe scope:
- This shake is one of multiple meals the user has in a day, not their entire daily nutrition by itself.
- Unless the user explicitly asks for their full daily target in a single shake, the recipe should provide between 25% and 40% of the user's daily protein target.
- Never default to putting the user's entire daily target into a single recipe.
Weight goal guidance (lose):
- Favor ingredients with a high protein-to-calorie and fiber-to-calorie ratio.
- Prefer lower-calorie-density liquid bases (water, unsweetened plant milk) over denser ones (whole milk, fruit juice).
- Avoid adding high-calorie-density, low-satiety ingredients (honey, added sugar, excess peanut butter, dried fruit) unless the user explicitly asks for them.
Physical blender guardrails (BLENDi Pro+):
- The combined volume of all ingredients in the recipe must not exceed 400ml.
- Total protein in this recipe must not exceed 45g.
- Never suggest an ingredient combination that exceeds the physical capacity of the user's blender.
```

O mesmo padrão se repetiu para `maintain`/`gain` (bloco correspondente presente) e para `none` (nenhum bloco "Weight goal guidance" no prompt), nos dois pipelines — confirmado não só por leitura visual do log, mas por **asserções automáticas no próprio teste** (`node:test`, `assert.ok`) que verificam, para cada valor e para os dois pipelines: o bloco esperado está presente, os outros dois blocos estão ausentes, e nenhum bloco aparece quando `weightGoal` é `none`. Execução real:

```
ok 1 - CP-C Tarefa 4 — weightGoal no prompt + paridade do guardrail de proteína
# pass 1
# fail 0
```

### 4.2 — Guardrail de proteína forçado no Pantry Scanner (Lite)

Conta de teste dedicada (`blendiModel: 'Lite'`, limite real `maxProteinGrams: 35` via `BLENDER_LIMITS`). O `callAi` fake devolveu, na chamada inicial, um array de 2 receitas: uma com `protein: 50` (acima do limite) e outra com `protein: 20` (dentro do limite) — para provar que o guardrail corrige só a receita que viola, não as duas. Saída real do servidor (log do próprio `pantryScanner.controller.ts`, não reconstruído):

```
[pantryScanner] protein guardrail exceeded, retrying {
  blendiModel: 'Lite',
  discrepancy: { declaredProtein: 50, maxProteinGrams: 35 }
}
```

O `callAi` fake detectou o retry pelo texto da mensagem (`"exceeded the physical protein guardrail"`, produzido por `buildProteinGuardrailRetryMessage`, a função real) e devolveu uma receita corrigida (`protein: 30`). Resultado final das 2 receitas, devolvido pelo `analyzePantry` real:

```json
[
  { "title": "Recipe A (corrected)", "macros": { "protein": 30, "carbs": 15, "fat": 5, "calories": 225 } },
  { "title": "Recipe B (within limit)", "macros": { "protein": 20, "carbs": 20, "fat": 5, "calories": 205 } }
]
```

Asserções automáticas confirmaram: as 2 receitas finais têm `protein <= 35`, e o log de invocações do `callAi` fake contém, para este cenário, uma chamada cuja última mensagem inclui o texto do retry de proteína — prova de que o retry aconteceu de verdade, por execução, não por leitura de código. **Confirmado: o guardrail de proteína agora roda de verdade no Pantry Scanner.**

### 4.3 — Typecheck

```
@blendi/shared  tsc --noEmit   (sem erros)
@blendi/api     tsc --noEmit   (sem erros)
```

Rodado após cada tarefa de código (1, 2, 3) e novamente ao final.

### 4.4 — Limpeza de contas de teste

9 contas (`cpc-verify-weightgoal-*-<timestamp>@test.blendi.local`) removidas via `deleteMany` dentro do próprio script de teste — `DELETE_RESULT: {"deletedCount":9}`, com `REMAINING_AFTER_CLEANUP (mesmo processo): 0`. Confirmação **independente** adicional, em processo separado (`cpc-cleanup-check-tmp.ts`, sem nenhum `mock.module` nem import de controller, só uma leitura direta do Atlas):

```
INDEPENDENT_REMAINING_CPC_TEST_ACCOUNTS: 0
```

Os dois scripts temporários (`apps/api/cpc-verify-weightgoal-tmp.test.ts`, `apps/api/cpc-cleanup-check-tmp.ts`) foram apagados ao final. `git status` final:

```
 M apps/api/src/controllers/pantryScanner.controller.ts
 M apps/api/src/controllers/pulseAi.controller.ts
 M apps/api/src/services/cache.service.ts
 M apps/api/src/services/promptBuilder.service.ts
?? docs/fixes/cp-c-investigacao-personalizacao-pulse-ai-pantry-scanner.md
?? docs/fixes/cp-c-weightgoal-pulse-ai-paridade-guardrail-pantry.md
```

Nenhum arquivo novo remanescente além deste documento; nenhum arquivo de código-fonte alterado além dos 4 listados.

### Nota de método — por que `mock.module()` e não hijack de `require.cache`

A primeira tentativa desta tarefa seguiu o método do CP-A.6 (hijack de `require.cache`, substituindo só a dependência externa antes de importar o controller). Essa tentativa **falhou silenciosamente**: os controllers deste projeto rodam como ESM real (todo o código usa `import`/`export` nativo, executado via `tsx`), onde `require.cache` não é a fonte de verdade do grafo de módulos — mutar o objeto devolvido por `require()` não afeta os bindings que o `import` real do controller resolve. O sintoma só apareceu na saída real: logs `[aiProvider] provider=google model=gemini-3.5-flash-lite` e um erro real de rede do Gemini (`[GoogleGenerativeAI Error]... 400 Bad Request`) — prova de que a chamada real aconteceu 9 vezes antes de eu notar e corrigir. Trocando para `node:test` `mock.module()` (Node 22, intercepta no nível de resolução de módulos ESM, não no cache CJS), o mesmo teste passou a interceptar de verdade — confirmado pela ausência total de qualquer log `[aiProvider]` real no restante da execução, e pelos valores fake aparecendo no `systemPrompt` capturado e nas receitas devolvidas.

---

## Resumo final

**Implementado:**
- `weightGoal` conectado de ponta a ponta (banco → profile dos dois controllers → `PulseAiPromptUserContext` → `buildSystemPrompt`) nos dois pipelines (Pulse AI e geração de receita do Pantry Scanner), que compartilham a mesma função de montagem de prompt.
- 3 blocos de texto (`lose`/`maintain`/`gain`) adicionados a `buildSystemPrompt`, posicionados e redigidos para nunca contradizer ou duplicar os guardrails físicos de blender (`buildBlenderGuardrailsSection`) ou a regra de escopo de porção (`buildRecipeScopeSection`) — confirmado por citação e por texto real de prompt capturado em teste, para os 4 estados possíveis (`lose`/`maintain`/`gain`/ausente) nos dois pipelines.
- Guardrail físico de proteína (Layer 2) agora roda também no Pantry Scanner (`ensurePantryRecipeProteinGuardrail`), com o mesmo padrão de retry único já usado na Pulse AI — confirmado por execução real forçando o cenário de excesso e observando o retry e a correção final.
- Guardrail de macro/calorias (Layer 3) do Pantry Scanner confirmado inalterado (`git diff` sem nenhuma linha dentro da função).
- Correção incidental na cache key da Pulse AI (`cache.service.ts`) para incluir `weightGoal`, sem a qual a personalização ficaria inconsistente em qualquer cache hit após uma mudança de objetivo de peso.
- Typecheck limpo em `@blendi/shared` e `@blendi/api`. Contas de teste removidas e confirmadas com 0 remanescentes, duas vezes, em processos separados.

---

## Correção pós-revisão (3 pontos levantados após a primeira versão deste documento)

### Ponto 1 — identidade do documento de investigação

Confirmado por `find` direto no disco: o arquivo que existe é
`docs/fixes/cp-c-investigacao-personalizacao-pulse-ai-pantry-scanner.md`
(prefixo `cp-c-`). Esse mesmo nome já aparecia como `??` (novo, não
rastreado) no `git status` **do início desta conversa**, antes de eu tocar
em qualquer arquivo — ou seja, **eu não renomeei nada**; o arquivo já
existia com esse nome quando esta conversa começou, criado numa sessão
anterior que eu não executei.

O que de fato está inconsistente é **o conteúdo desse arquivo pré-existente
consigo mesmo**: sua própria "Nota de nomenclatura" (linhas 3-10) afirma
"Este documento usa o nome de arquivo exato pedido no prompt
(`cp-b-investigacao-personalizacao-pulse-ai-pantry-scanner.md`)" — mas o
arquivo real está salvo como `cp-c-...md`, não `cp-b-...md`. Essa
autodescrição equivocada já existia antes desta conversa (a memória
`project_cp_b_investigacao_personalizacao_spec.md`, escrita na sessão que
gerou aquele documento, repete o mesmo nome errado). Não toquei nesse
arquivo (só li, nunca escrevi) — por instrução explícita do prompt original
("Não altere nenhuma documentação pré-existente... a investigação
anterior"), a inconsistência permanece lá, sem correção, e meu link para
ele (linha 3 deste documento) está correto porque aponta para o arquivo que
genuinamente existe. Corrigi a memória (`project_cp_b_investigacao_personalizacao_spec.md`)
para refletir o nome real. Se quiser que o texto interno daquele documento
antigo seja corrigido, isso exigiria uma ação explícita separada (fora do
escopo deste CP).

### Ponto 2 — contagem de contas de teste

A reconciliação completa, por execução:

| Execução | Contas criadas | Motivo |
|---|---|---|
| Tentativa 1 (hijack de `require.cache`, método que se revelou não funcionar neste projeto ESM) | 9 | 4 Pulse AI + 4 Pantry Scanner + 1 Lite (Tarefa 4.2) — mesma estrutura do script final, só que com chamadas reais de IA em vez de mockadas |
| Experimento isolado de depuração do `mock.module()` (`cpc-mock-experiment-tmp.test.ts`, usado só para validar se a técnica funcionava antes de reescrever o script completo) | 1 | 1 conta única, para confirmar que o `callAi` fake era de fato chamado |
| Execução final (bem-sucedida, citada nas Tarefas 4.1/4.2 acima) | 9 | 4 Pulse AI + 4 Pantry Scanner + 1 Lite |
| **Total** | **19** | |

As "5 contas" da primeira versão deste documento (Tarefa 4.1) estavam
erradas — já corrigido acima para "8 contas" (4+4, separadas por pipeline)
+ 1 da Tarefa 4.2 = 9, só da execução final. A sua suspeita sobre a
tentativa fracassada também ter criado contas estava certa: o log completo
daquela tentativa (salvo em
`/private/tmp/.../scratchpad/cpc-task4-output.log`) mostra, na mesma
estrutura de 9 iterações, `DELETE_RESULT: {"deletedCount":9}` e
`REMAINING_AFTER_CLEANUP (mesmo processo): 0` — ou seja, aquela tentativa
também limpou sozinha as próprias 9 contas, dentro do mesmo processo, antes
de eu trocar de método. A confirmação independente que eu já tinha rodado
(`INDEPENDENT_REMAINING_CPC_TEST_ACCOUNTS: 0`) usava um regex **sem**
filtro de `runId`, então já cobria as contas de ambas as tentativas — só
não cobria a conta do experimento isolado (email com prefixo
`mock-experiment3-`, padrão diferente), fechada agora na checagem do Ponto
3 abaixo.

### Ponto 3 — chamadas de rede reais e rastros fora das contas de usuário

**Chamadas de rede reais que aconteceram:** confirmado, a tentativa 1
(hijack falho) fez 4 chamadas reais a `callAi` (as 4 iterações do loop da
Pulse AI, todas com `HTTP_STATUS 200`, receita real gerada pelo modelo
configurado) e 5 chamadas reais a `callVisionAi` (as 4 iterações do Pantry
Scanner + a conta Lite da Tarefa 4.2), todas as 5 falhando com `400 Bad
Request` do Google (a imagem fake que eu construí só tem os 3 bytes mágicos
de JPEG, não é um JPEG decodificável de verdade — por isso a Vision API
rejeitou antes de chegar a gerar qualquer receita real nesse ramo). A chave
usada (`AI_API_KEY`/`VISION_API_KEY` em `apps/api/.env`) é local e
git-ignored (`apps/api/.gitignore:2`, confirmado) — a mesma chave de
desenvolvimento já usada para todo trabalho local neste projeto (não uma
chave de produção isolada), e o modelo configurado é `gemini-3.5-flash-lite`
(camada barata/rápida). Não tenho acesso ao painel de billing para
confirmar o custo exato, mas o sinal disponível (chave de dev local, modelo
barato, 4 conclusões reais pequenas + 5 falhas de validação de entrada que
tendem a não consumir tokens de geração) aponta para impacto trivial — da
mesma natureza dos testes de integração real já feitos antes neste projeto
(ver `progress_cp3_3_testing`, que já envolveu chamadas reais de IA).

**Rastros fora das contas de usuário — este foi um achado real, graças à sua pergunta:**
`UserModel.deleteMany` apaga só o documento do usuário — não existe nenhum
cascade para as coleções que `chat()`/`analyzePantry()` escrevem como
efeito colateral de uma chamada que termina com sucesso real
(`persistConversationTurn` → `ConversationModel`, `setInCache` →
`AiCacheModel`, `awardXP` → `XPLogModel.insertOne`,
`updateMissionProgress`/`findOrCreateDailyMission` → `DailyMissionModel`).
Query direta no Atlas, na janela de tempo das execuções de hoje, encontrou
exatamente estes números, já pareados por coleção:

| Coleção | Documentos órfãos encontrados | Apagados | Confirmados 0 depois |
|---|---|---|---|
| `ConversationModel` | 9 | 9 | ✓ |
| `AiCacheModel` | 8 | 8 | ✓ |
| `DailyMissionModel` | 12 | 12 | ✓ |
| `XPLogModel` | 19 | 19 | ✓ |

**Reconciliação exata de por que os números diferem entre si** (contra as
19 contas de teste criadas nas 3 execuções desta tarefa: 4 Pulse AI + 5
Pantry Scanner, repetido em 2 tentativas, mais 1 chamada avulsa de um
experimento de depuração do `mock.module()` — ver tabela do Ponto 2 acima):

- `ConversationModel` (9) e `AiCacheModel` (8) só recebem escrita do fluxo
  da **Pulse AI** (`runPulseAiChat`) — o Pantry Scanner nunca grava
  conversa nem usa esse cache. Das 9 chamadas de chat bem-sucedidas no
  total (4 na 1ª tentativa com IA real + 4 na execução final + 1 do
  experimento de depuração), todas as 9 persistiram a conversa
  (`persistConversationTurn` vem primeiro no código), mas só 8 chegaram a
  gravar no cache: a chamada do experimento de depuração usava um `callAi`
  fake que devolvia `provider:'fake'` em vez do valor real de
  `env.AI_PROVIDER` — isso disparou exatamente o bug de
  `cacheKey does not match the provided query metadata` descrito acima
  (achado incidental da Tarefa 1), então `setInCache` lançou erro **antes**
  de gravar, e a execução nunca chegou a `triggerPulseAiXP`/
  `triggerPulseAiMissionProgress` para essa chamada. 9 conversas, 8 caches
  — a diferença de 1 é exatamente essa chamada.
- `DailyMissionModel` (12) e `XPLogModel` (19) recebem escrita dos **dois**
  fluxos (`triggerPulseAiMissionProgress`/`triggerPantryScannerMissionProgress`
  chamam a mesma `updateMissionProgress`; idem para XP) — por isso o
  universo de chamadas relevante é maior: 13 chamadas bem-sucedidas no
  total que chegaram a essa etapa (4 Pulse AI da 1ª tentativa + 9 da
  execução final, sendo 4 Pulse AI + 5 Pantry Scanner; a chamada do
  experimento de depuração nunca chegou aqui, pelo motivo acima; as 5
  chamadas de Pantry Scanner da 1ª tentativa falharam antes, na visão real
  do Google, 400 Bad Request, então também nunca chegaram aqui).
  - `DailyMissionModel` deveria ter **no mínimo 13** documentos (uma por
    chamada bem-sucedida — `findOrCreateDailyMission` sempre cria o
    documento do dia para aquele usuário, mesmo quando a missão sorteada
    não bate com a ação feita, `missionProgress.service.ts:227-243`), mas
    o Atlas só tinha 12 — exatamente 1 a menos, consistente com a corrida
    que eu já tinha observado nos logs (`Mission update failed: Error:
    User not found` — o `userId` já tinha sido apagado por
    `UserModel.deleteMany`, no final do script, antes dessa chamada
    fire-and-forget terminar, porque ela nunca é esperada pelo controller).
  - `XPLogModel` deveria ter **no mínimo 13** (uma por chamada, a XP de
    ação síncrona via `triggerPulseAiXP`/`triggerPantryScannerXP`), mas o
    Atlas tinha 19 — **6 mais** que o mínimo. O mecanismo exato que
    permite isso, confirmado por citação de código
    (`missionProgress.service.ts:349`): `updateMissionProgress` pode
    disparar um **segundo** `awardXP`, totalmente separado do primeiro,
    quando a missão diária sorteada aleatoriamente para aquele usuário
    (3 de um pool maior, `generateDailyMissions`) bater com o tipo exato
    da ação feita (`usePulseAI` ou `scanPantry`) — isso soma 13 (XP de
    ação, garantida) + até 13 (XP de missão, condicional ao sorteio
    aleatório bater) = até 26 possíveis, e 19 é um valor plausível dentro
    desse intervalo (13 + 6). **Isto é mecanismo confirmado por código, não
    uma contagem documento-a-documento confirmada** — eu apaguei os
    documentos de `DailyMissionModel`/`XPLogModel` sem ter salvo antes o
    detalhe individual de qual usuário recebeu o bônus de missão, então não
    posso provar exatamente quais 6 chamadas fecharam a missão sorteada
    naquele dia, só que o código tem exatamente esse caminho e a aritmética
    fecha (13+6=19).

Todos os 14 `userId` distintos referenciados por esses documentos foram
confirmados **inexistentes** como usuário real (`USER_..._STILL_EXISTS:
false` para todos, checado um a um antes de qualquer exclusão — o script
tinha uma trava explícita para abortar sem apagar nada se algum desses
`userId` ainda existisse como usuário real). Apagados os 48 documentos
órfãos (`CONVERSATIONS_DELETED: 9`, `AI_CACHE_DELETED: 8`,
`DAILY_MISSIONS_DELETED: 12`, `XP_LOGS_DELETED: 19`), e reconfirmado **0
remanescentes** na mesma janela, duas vezes: no mesmo processo e, depois,
por um terceiro script independente (sem nenhuma lógica de limpeza, só
leitura):

```
INDEPENDENT_REMAINING_USERS: 0
INDEPENDENT_REMAINING_CONVERSATIONS_IN_WINDOW: 0
INDEPENDENT_REMAINING_AI_CACHE_IN_WINDOW: 0
INDEPENDENT_REMAINING_DAILY_MISSIONS_IN_WINDOW: 0
INDEPENDENT_REMAINING_XP_LOGS_IN_WINDOW: 0
```

Nenhum outro efeito colateral externo confirmado: `awardXP` só dispara push
real via `sendNotificationBatch` quando o usuário tem `pushToken` válido
(`xp.service.ts:166-168`) — nenhuma das contas de teste tinha esse campo
setado, então nenhuma notificação push real foi enviada. `BlendLogModel` é
só lido (nunca escrito) por esses dois fluxos. O e-mail de boas-vindas do
`register` real nunca disparou porque os usuários de teste foram criados
direto via `UserModel.create`, sem passar por `auth.controller.ts`.

Os 3 scripts temporários desta correção (`cpc-orphan-check-tmp.ts`,
`cpc-orphan-independent-check-tmp.ts`, e o já citado
`cpc-mock-experiment-tmp.test.ts`) foram apagados ao final. `git status`
permanece idêntico ao já listado na Tarefa 4.4 (só os 4 arquivos de
código-fonte + os 2 documentos).

### Pergunta decorrente, investigada à parte (fora do escopo deste CP)

A mesma ausência de cascade existe num fluxo real de exclusão de conta em
produção? Investigação própria, separada deste CP, sem nenhuma alteração
de código: [investigacao-cascade-exclusao-conta.md](investigacao-cascade-exclusao-conta.md).
Resumo direto: **não existe hoje nenhum fluxo de exclusão (nem soft-delete)
de conta no app** — nem rota no backend, nem tela no mobile — então não há
bug ativo em produção agora. Mas o mapeamento de todas as coleções que
referenciam `userId` confirma que, se esse fluxo for construído no futuro
sem cascade explícito, o mesmo gap se repete em pelo menos 12 coleções, 4
delas sem TTL (persistiriam para sempre, sem autolimpeza) — `UserPhoto`
entre elas, que guarda uma foto real do usuário.

---

**Deliberadamente fora de escopo (não implementado, por instrução explícita do prompt original):**
- Guardrail de textura/gelo (nunca validado no backend em nenhum pipeline, só como instrução de texto).
- Parser de unidades para volume/porção (`amount` continua sendo texto livre em todo o sistema).
- `dailyFatTarget` (campo de edição de gordura permanece comentado no app, por decisão do usuário).
- Qualquer guardrail de backend que valide se a receita "respeitou" a intenção de `weightGoal` — decisão explícita de manter isso só como instrução de texto, já que é uma preferência qualitativa, não uma métrica numérica verificável.
- Restrição alimentar/alergia (fora de escopo desde a investigação anterior).
- A correção do achado incidental de cache/fallback de provider (seção da Tarefa 1) — préexistente, não relacionado a `weightGoal`, não corrigido aqui.
