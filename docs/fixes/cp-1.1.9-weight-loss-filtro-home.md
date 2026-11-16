# CP-1.1.9 — Objetivo "Weight Loss" e filtro das receitas da Home

**Contexto:** o brief do Jon pedia para "considerar" um objetivo de perda de peso. Existiam dois campos diferentes:

- `goal` (Muscle, Wellness, Energy, Recovery): para que a pessoa usa o blend. Define o multiplicador de proteína, o tema da receita na IA, as 20 receitas da Home, as missões, as notificações, os favoritos e o cache da IA.
- `weightGoal` (lose, maintain, gain): direção do peso, escolhida na tela de corpo do onboarding (que dá para pular) e no completar perfil. Define o ajuste de calorias (−500 / 0 / +300), a orientação de peso na IA e a estimativa de prazo até o peso-alvo.

"Perder peso" não aparecia entre os objetivos, e quem pulava a tela de corpo ficava com o `weightGoal` provisório `maintain`, sem orientação de emagrecimento. A investigação também mostrou que **as receitas da Home não filtravam dieta nem modelo**: uma pessoa vegana ou sem laticínios podia ver whey, iogurte ou mel na Home.

**Decisões do Gabriel:**

- 5º objetivo "Weight Loss", completo, sempre com `weightGoal` `lose`.
- 20 receitas novas geradas neste CP, no padrão das outras 80.
- O filtro da Home entra neste CP.
- Rodadas seguintes (ver [Achados e correções](#achados-e-correções)): filtrar a Home pelo limite de proteína do modelo, XP de calorias em faixa só para Weight Loss, renomear o concentrado de cereja, sincronizar as metas no Me para qualquer goal, limites de volume corrigidos para 400/400/600 ml (a linha de MAX do copo, confirmada pelo Jon, com o fl oz derivado), bloquear receita da IA acima do limite físico e separar "IA indisponível" de "não coube / dieta".

Testes e pentest deste CP: [cp-1.1.9-testes-pentest.md](cp-1.1.9-testes-pentest.md).

**Resultado final:** typecheck e lint limpos nos 3 workspaces; API **627 → 764** testes; mobile **813 → 848**; todos passando.

---

## Tarefa 1 — O valor novo

- **Identificador:** `WeightLoss` (PascalCase como os outros). Nome exibido: "Weight Loss" / "Perda de peso"; ícone `trending-down-outline`, na cor `colors.text.primary` como as outras opções.
- **Lista única no shared:** `USER_GOAL_VALUES` e o tipo `UserGoal` em [user.ts](../../packages/shared/src/schemas/user.ts). Passaram a importar dela:
  - Zod: `registerSchema`, `updateUserSchema`, `calculateMacrosSchema`;
  - Mongoose: `User` (enum do `goal`) e `Favorite`;
  - backend: `MissionGoal`, tipos do User;
  - app: store de onboarding, navegação, `auth.service`, `purchase.service`, Home, Me, Pulse AI, `ChatInput`, telas de onboarding.
- **Cópias que sobraram:** os mapas por goal com conteúdo próprio de cada um. O `Record<UserGoal, …>` faz o TypeScript exigir todos os goals:
  - `PROTEIN_MULTIPLIERS`, `GOAL_CONTEXT`, `MISSION_POOLS`;
  - faixas da tela de metas (`GOAL_CONFIG`);
  - chaves de sugestão da Pulse AI (`GOAL_I18N_KEYS` em `PulseAIScreen` e `ChatInput`, já duplicadas antes);
  - as duas listas de opções com ícone: `OnboardingGoalScreen` e `EditSettingSheet`. A do sheet não é tipada por goal; essa duplicação já existia antes.
- **Casts removidos:** os `as TranslationKey` da lista de objetivos do `EditSettingSheet`. As chaves agora são conferidas pelo `t()`.
- **Contas existentes:** nada muda; ninguém tinha o valor novo. Sem migração.

## Tarefa 2 — Coerência com `weightGoal`

Regra no shared ([user.ts](../../packages/shared/src/schemas/user.ts)):
- `WEIGHT_LOSS_GOAL`, `WEIGHT_LOSS_REQUIRED_WEIGHT_GOAL = 'lose'`, `isWeightGoalAllowedForGoal`;
- código de erro `WEIGHT_LOSS_REQUIRES_LOSE_ERROR_CODE = 'user/weight-loss-requires-lose'`.

### Backend

Função pura `resolveWeightLossGoalCoherence` ([weightLossGoal.utils.ts](../../apps/api/src/utils/weightLossGoal.utils.ts)). Ela olha o **estado final** do usuário: o goal do corpo da requisição ou, se ausente, o salvo.

| Situação | Resultado |
|---|---|
| Goal final WeightLoss, `weightGoal` ausente no corpo | grava `lose` no mesmo `$set` |
| Goal final WeightLoss + `maintain`/`gain` no corpo (troca de goal ou só `weightGoal` com WeightLoss salvo) | **400 `user/weight-loss-requires-lose`**, nada gravado |
| WeightLoss salvo com `weightGoal` incoerente (dado antigo) | qualquer PATCH corrige para `lose` |
| Sair de WeightLoss para outro goal | `weightGoal` mantido |
| Outros goals | sem mudança |

- **Recálculo de metas:** o `weightGoal` trocado pela regra conta como gatilho de `shouldRecalculateMacroTargets`.
- **Atomicidade:**
  - o `lose` imposto vai no mesmo `findOneAndUpdate` do goal;
  - o único caminho com corrida é um PATCH só de `maintain`/`gain` enquanto outro PATCH troca o goal para WeightLoss. Esse update leva o filtro `{ goal: { $ne: 'WeightLoss' } }` (também no `updateOne` condicional de `otherBlenderModel`). Se não casar, a resposta é 400;
  - `updateMe` passou de `findByIdAndUpdate` para `findOneAndUpdate({ _id, ...filtro })`. Sem o filtro, o comportamento é idêntico ao de antes.
- **`POST /users/calculate-macros`:** com WeightLoss e sem `weightGoal` no corpo, usa `lose` (não o `weightGoal` salvo do fallback de perfil). Com `maintain`/`gain`, responde 400 com o mesmo código.
- **Cadastro:** `getAccountCreationBodyProfileDefaults(goal)` faz a conta WeightLoss nascer com `lose` (os outros goals mantêm o provisório `maintain`). Um `weightGoal` enviado no cadastro continua sendo descartado pelo Zod.
- **Guarda no documento:** `userSchema.pre('validate')` recusa WeightLoss sem `lose` em `create`/`save` (cadastro, Google, Apple). Os PATCHes não passam por esse hook; para eles vale a regra atômica acima.

### App

- **Onboarding** ([onboarding.store.ts](../../apps/mobile/src/store/onboarding.store.ts)):
  - `setGoal('WeightLoss')` já grava `weightGoal: 'lose'`. Pular a tela de corpo manda `lose` no PATCH final.
  - **Decisão de implementação:** trocar de Weight Loss para outro objetivo **antes** da tela de corpo desfaz esse `lose` automático. Sem isso, um usuário de outro goal mandaria `lose` sem ter escolhido. Depois da tela de corpo, o valor escolhido lá é mantido.
  - `selectedGoal`/`weightGoal` do store passaram a ser tipados (`UserGoal`/`WeightGoal`), o que removeu os casts.
- **Tela de corpo e completar perfil:**
  - com Weight Loss, "Perder peso" aparece marcado, "Manter" e "Ganhar" ficam desabilitados (opacidade `LOCKED_WEIGHT_GOAL_CHIP_OPACITY`, `accessibilityState.disabled`), com a linha `onboarding.weightGoalLockedByWeightLoss`;
  - lógica comum em [weightGoalLock.utils.ts](../../apps/mobile/src/utils/weightGoalLock.utils.ts).
- **Me:** o Me não mostra nem edita `weightGoal`. Trocar o objetivo para Weight Loss grava `lose` no backend. O usuário local recebe as metas recalculadas (ver achado 4) e a query do perfil é invalidada, então o completar perfil mostra "Perder" travado.
- **Erro:** `errors.user_weight_loss_requires_lose` em en e pt-BR.

## Tarefa 3 — Metas, IA, missões, notificações

- **Proteína:** `PROTEIN_MULTIPLIERS.WeightLoss = 2.0` g/kg, para preservar massa magra em déficit. Os outros multiplicadores, os limites do clamp e o ajuste de calorias do `weightGoal` não mudaram.
- **Padrões da tela de metas** (`GOAL_CONFIG.WeightLoss`, para quem pula o corpo):

  | | Faixa | Sugerido | De onde vem |
  |---|---|---|---|
  | Proteína | 140–200 g | 150 g | 2,0 g/kg na faixa de peso de referência do Muscle (70–100 kg; 75 kg → 150 g) |
  | Calorias | 1.200–1.900 kcal | 1.500 kcal | Faixa do Wellness (1.600–2.400, sugerido 2.000) menos os 500 kcal do `lose`; piso elevado a 1.200, o mesmo de `AUTO_CALORIE_TARGET_MIN_SUGGESTION` |

- **IA:** `GOAL_CONTEXT.WeightLoss = 'prioritize satiety, high protein and fiber, and lower calories per serving'`. Soma-se à seção "Weight goal guidance (lose)", que aparece uma vez só, sem repetir as regras dela.
  - **Comparação com o código anterior:** 2.304 combinações (3 modelos × 4 goals antigos × 4 `weightGoal` × 2 idiomas × 2 unidades × 6 dietas × Pulse AI/Pantry). **0 diferenças.** No WeightLoss, só a linha do goal muda.
  - As mudanças posteriores no bloco de limites físicos (achado 7) alteraram os prompts de todos de propósito. Ver o documento de testes.
- **Missões:** `MISSION_POOLS.WeightLoss` com `hitProteinGoal` 3, `makeBlend` 3, `hitHydrationGoal` 2, `makeBlendFromFavorite` 2, `usePulseAI` 1, `favoriteRecipe` 1.
  - `hitCalorieGoal` ficou de fora: a missão era concluída quando a soma de calorias dos blends do dia chegava à meta **ou passava dela**, sem teto. Ver também o achado 2.
- **Notificações (Daily Pulse):** "Keep the rhythm! Your {recipeName} blend fits today's plan 🍓" / "Mantenha o ritmo! Seu blend {recipeName} cabe no plano de hoje 🍓", e as versões genéricas. Sem promessa de resultado (há teste com regex).
- **Sugestões da Pulse AI:** `pulseAi.goals.weightLoss` (título, subtítulo, 3 sugestões, 3 placeholders) em en e pt-BR.
- **Analytics:** nenhum evento manda `goal` hoje, então não havia nada a mudar.

## Tarefa 4 — 20 receitas da Home para Weight Loss

Mesmo formato e convenção de chaves das outras 80:
- a 1ª é `home.goalWeightLossRecipe` / `home.dailyRecipeIngredientWeightLoss{N}Name|Amount` / `home.dailyRecipeWeightLoss01Step{N}`;
- as demais são `home.dailyRecipeWeightLoss{NN}…`;
- 3 ingredientes e 4 passos cada, em en e pt-BR. Receitas com fruta congelada têm `pulseCount: 8` no passo 3.

**Regras atendidas e conferidas em teste** ([homeRecipeMarkings.test.ts](../../apps/api/src/utils/homeRecipeMarkings.test.ts)):
- sem gelo; sem mel, xarope ou açúcar adicionado;
- até 400 ml e 35 g de proteína;
- 180–320 kcal; proteína ≥ 25% das kcal; fibra ≥ 1,5 g;
- 8 veganas, 7 delas sem castanhas; 8 sem laticínios e sem castanhas;
- bases variadas (água, bebida de soja, leite desnatado, iogurte, bebida de aveia, leite de amêndoas) e proteínas variadas (whey isolado, proteína vegetal, iogurte grego, tofu, cottage, proteína de clara);
- nomes sem promessa de resultado.

**Fontes dos macros:**
- **Contas:** ingrediente a ingrediente, arredondamento meio-para-cima. O volume conta 1 g como 1 ml.
- **Tabela do backend** ([nutritionReference.config.ts](../../apps/api/src/config/nutritionReference.config.ts)): whey isolado, proteína vegetal, proteína de clara, iogurte grego desnatado, leite desnatado, leite de amêndoas, bebida de aveia, morango, mirtilo, manga, banana, espinafre e aveia (com fibra do USDA).
- **USDA SR Legacy:** bebida de soja (16139), framboesa (09302), amora (09042), tofu silken (16161), chia (12006), linhaça (12220), cacau (19165), kiwi (09148), abacaxi (09266), pêssego (09236), cereja (09070), abóbora (11424), cottage 1% (01016) e pera (09252).

| # | Nome (en / pt-BR) | Ingredientes | P | C | G | kcal | Fibra | Vol. | Contém |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Raspberry Whey Shake / Shake de Whey com Framboesa | Whey isolate 30g; framboesa cong. 125g; leite desnatado 200ml | 34 | 26 | 2 | 244 | 8,1 | 355 | dairy, animal* |
| 2 | Strawberry Plant Protein / Proteína Vegetal com Morango | Proteína vegetal 30g; morango cong. 150g; bebida de soja 200ml | 28 | 18 | 5 | 227 | 3,8 | 380 | — |
| 3 | Blueberry Chia Yogurt / Iogurte com Mirtilo e Chia | Iogurte grego 0% 200g; mirtilo cong. 100g; chia 12g | 23 | 27 | 5 | 233 | 6,5 | 312 | dairy |
| 4 | Cocoa Plant Protein Shake / Shake Vegetal de Cacau | Proteína vegetal 30g; cacau 10g; bebida de soja 250ml | 30 | 13 | 7 | 218 | 4,7 | 290 | — |
| 5 | Peach Cottage Blend / Blend de Cottage com Pêssego | Cottage light 150g; pêssego cong. 150g; leite desnatado 100ml | 23 | 23 | 2 | 201 | 2,2 | 400 | dairy |
| 6 | Green Kiwi Protein / Proteína Verde com Kiwi | Proteína vegetal 30g; kiwi 140g; água 230ml | 23 | 23 | 3 | 198 | 4,2 | 400 | — |
| 7 | Pineapple Whey Refresher / Refresco de Whey com Abacaxi | Whey isolate 30g; abacaxi cong. 150g; água 220ml | 26 | 21 | 0 | 186 | 2,1 | 400 | dairy, animal* |
| 8 | Strawberry Oat Yogurt / Iogurte com Morango e Aveia | Iogurte grego 0% 150g; morango cong. 150g; aveia 20g | 19 | 31 | 2 | 212 | 5,0 | 320 | dairy |
| 9 | Raspberry Egg White Shake / Shake de Clara com Framboesa | Proteína de clara 30g; framboesa cong. 125g; bebida de aveia 220ml | 28 | 30 | 4 | 271 | 8,1 | 375 | animal |
| 10 | Cherry Almond Whey / Whey com Cereja e Amêndoa | Whey isolate 30g; cereja cong. 120g; leite de amêndoas 250ml | 28 | 21 | 4 | 219 | 2,5 | 400 | dairy, animal*, nuts |
| 11 | Pumpkin Yogurt Blend / Blend de Iogurte com Abóbora | Iogurte grego 0% 200g; purê de abóbora 100g; leite desnatado 100ml | 25 | 20 | 1 | 186 | 2,9 | 400 | dairy |
| 12 | Blueberry Tofu Smoothie / Smoothie de Tofu com Mirtilo | Tofu macio 200g; mirtilo cong. 100g; bebida de soja 100ml | 17 | 21 | 7 | 214 | 3,0 | 400 | — |
| 13 | Blackberry Plant Shake / Shake Vegetal de Amora | Proteína vegetal 30g; amora cong. 120g; bebida de aveia 250ml | 25 | 30 | 6 | 277 | 6,4 | 400 | — |
| 14 | Pear Whey Smoothie / Smoothie de Whey com Pera | Whey isolate 30g; pera 150g; leite de amêndoas 220ml | 27 | 25 | 3 | 225 | 4,7 | 400 | dairy, animal*, nuts |
| 15 | Pumpkin Plant Protein / Proteína Vegetal com Abóbora | Proteína vegetal 30g; purê de abóbora 120g; leite de amêndoas 250ml | 24 | 13 | 5 | 186 | 3,5 | 400 | nuts |
| 16 | Banana Plant Protein / Proteína Vegetal com Banana | Proteína vegetal 30g; banana cong. 100g; água 250ml | 22 | 26 | 2 | 202 | 2,6 | 380 | — |
| 17 | Green Tofu Pineapple / Tofu Verde com Abacaxi | Tofu macio 180g; abacaxi cong. 150g; espinafre 30g | 14 | 25 | 5 | 194 | 2,9 | 360 | — |
| 18 | Cherry Yogurt Blend / Blend de Iogurte com Cereja | Iogurte grego 0% 200g; cereja cong. 100g; leite desnatado 100ml | 24 | 28 | 1 | 215 | 2,1 | 400 | dairy |
| 19 | Mango Cottage Blend / Blend de Cottage com Manga | Cottage light 150g; manga cong. 120g; leite de amêndoas 130ml | 20 | 22 | 4 | 197 | 1,9 | 400 | dairy, nuts |
| 20 | Peach Flax Yogurt / Iogurte com Pêssego e Linhaça | Iogurte grego 0% 170g; pêssego cong. 150g; linhaça 10g | 20 | 23 | 5 | 212 | 5,0 | 330 | dairy |

P/C/G em g, kcal, fibra em g, volume em ml.

\* "Whey protein **isolate**" também casa com o termo vegano "protein isolate" (proteína sem origem vegetal declarada) nas regras do backend, então essas receitas são marcadas `animal` além de `dairy`. O próprio teste de marcação apontou isso. Para revisão do Jon: a nº 17 (tofu) tem a menor proteína, 14 g (cerca de 29% das kcal).

## Tarefa 5 — Filtro das receitas da Home

- **Dados separados do componente:** [dailyRecipes.data.ts](../../apps/mobile/src/components/home/dailyRecipes.data.ts), sem React Native, só imports de tipo. Ficam aqui as 100 receitas, cada uma com a marcação explícita `contains` (`dairy`, `animal`, `nuts`, `added_sugar`, `ice`). O `DailyRecipeCard` reexporta `DAILY_RECIPES`.
- **Compatibilidade no shared** ([homeRecipeCompatibility.ts](../../packages/shared/src/utils/homeRecipeCompatibility.ts)):
  - `DIETARY_PREFERENCE_FORBIDDEN_CONTENTS`: vegan proíbe `dairy` e `animal`; `dairy_free` proíbe `dairy`; `nut_free` proíbe `nuts`; `no_added_sugar` proíbe `added_sugar`;
  - `LITE_FORBIDDEN_CONTENTS` (`ice`);
  - `isHomeRecipeAllowed`, que também confere o limite de proteína do modelo (achado 1).
- **Seleção** ([dailyRecipeSelection.ts](../../apps/mobile/src/components/home/dailyRecipeSelection.ts)):
  1. receitas compatíveis do goal;
  2. senão, compatíveis dos outros goals, na ordem de `USER_GOAL_VALUES`;
  3. senão, `null`: o card dá lugar a um atalho "Pedir à Pulse AI" com o pedido preenchido (`home.dailyRecipeUnavailable`, `home.dailyRecipeAskPulseAi`, `home.dailyRecipeAskPulseAiPrompt`).
- **Rotação:** determinística (dia local % tamanho), agora sobre a lista filtrada. Sem dieta e fora do Lite, a lista é exatamente o pool de antes, na mesma ordem.
- **Troca de dieta:** reflete na Home sem reiniciar o app. A tela de metas atualiza o usuário local e invalida a query do perfil; a Home lê `profile.dietaryPreferences ?? authUser.dietaryPreferences`.
- **Botão de preparar:** inalterado (mesmo `PulseAiRecipe`).
- **Conferência pelas regras do backend:** um teste da API carrega o arquivo de dados por `import()` dinâmico, monta o `PulseAiRecipe` em inglês que o app monta e roda `validateRecipeRestrictions`. Ele falha se a marcação de qualquer uma das 100 receitas não bater com as regras de dieta e gelo. Não há segunda lista de palavras no app.

Receitas compatíveis por goal (Pro+/Steel; o Lite tira as 4 receitas do Muscle acima de 35 g, ver achado 1):

| Dieta | Muscle | Wellness | Energy | Recovery | WeightLoss |
|---|---|---|---|---|---|
| sem dieta | 20 (Lite 16) | 20 | 20 | 20 | 20 |
| dairy_free | 3 | 2 | 6 | **0** | 9 |
| vegan | 3 | 2 | 5 | **0** | 8 |
| nut_free | 13 | 20 | 17 | 20 | 16 |
| no_added_sugar | 16 | 20 | 19 | 20 | 20 |
| vegan + nut_free (e as 4 juntas) | 2 | 2 | 3 | **0** | 7 |

Recovery com dieta vegana ou sem laticínios usa o fallback dos outros goals. Com os dados atuais, nenhuma combinação esvazia tudo; o atalho da Pulse AI só foi testado com dados sintéticos.

## Tarefa 6 — Testes

Detalhes em [cp-1.1.9-testes-pentest.md](cp-1.1.9-testes-pentest.md). Arquivos novos:

- **API:**
  - [weightLossGoal.utils.test.ts](../../apps/api/src/utils/weightLossGoal.utils.test.ts): regra, cadastro, multiplicador, missões, notificações, faixa de XP;
  - [user.controller.weightLoss.test.ts](../../apps/api/src/controllers/user.controller.weightLoss.test.ts): PATCH, corrida, cálculo de macros, mass assignment;
  - [auth.controller.weightLoss.test.ts](../../apps/api/src/controllers/auth.controller.weightLoss.test.ts);
  - [weightLossGoal.models.test.ts](../../apps/api/src/models/weightLossGoal.models.test.ts);
  - [promptBuilder.weightLoss.test.ts](../../apps/api/src/services/promptBuilder.weightLoss.test.ts);
  - [homeRecipeMarkings.test.ts](../../apps/api/src/utils/homeRecipeMarkings.test.ts);
  - [recipeVolume.utils.test.ts](../../apps/api/src/utils/recipeVolume.utils.test.ts);
  - [pulseAi.blenderLimits.test.ts](../../apps/api/src/controllers/pulseAi.blenderLimits.test.ts);
  - [pantryScanner.blenderLimits.test.ts](../../apps/api/src/controllers/pantryScanner.blenderLimits.test.ts).
- **Mobile:** [dailyRecipeSelection.test.tsx](../../apps/mobile/src/components/home/dailyRecipeSelection.test.tsx) e [dailyRecipeSelection.synthetic.test.tsx](../../apps/mobile/src/components/home/dailyRecipeSelection.synthetic.test.tsx), mais casos novos nos testes do store, das telas de objetivo, corpo, metas, completar perfil e Me, e no de códigos de erro.

**Testes existentes alterados:**

| Teste | O que mudou | Motivo |
|---|---|---|
| `DailyRecipeCard.test.tsx` | passa as props novas obrigatórias | expectativas iguais |
| `OnboardingBodyScreen.test.tsx` | goal mockado virou variável | infraestrutura, expectativas iguais |
| `MeScreen.test.tsx` | mocks de `api.patch` e `updateUserProfile` viraram variáveis | infraestrutura, expectativas iguais |
| `pulseAi.controller.test.ts` (CP-1.1.1c) | "retry que falha no provedor" passou de 422 `pulseai/dietary-restriction-unmet` para **503 `pulseai/ai-unavailable`** | decisão do Gabriel (achado 8) |

Na correção dos limites de volume (achado 7, 400/400/600 ml), os testes escritos neste mesmo CP tiveram as expectativas atualizadas; estão listados em [cp-1.1.9-testes-pentest.md, rodada 4](cp-1.1.9-testes-pentest.md#rodada-4--limites-de-volume-corrigidos-400--400--600-ml).

Nenhum teste contava a lista de goals.

## Testes manuais (Expo Go)

1. **Onboarding com Weight Loss, sem pular o corpo:** "Perder peso" já marcado, as outras opções desabilitadas com a explicação, metas sugeridas com déficit.
2. **Onboarding com Weight Loss, pulando o corpo:** a tela de metas mostra 140–200 g e 1.200–1.900 kcal; depois de concluir, o completar perfil mostra "Perder".
3. **Me:**
   - trocar para Weight Loss: com corpo preenchido, as metas caem cerca de 500 kcal, e o completar perfil mostra "Perder" travado;
   - voltar para outro goal: mantém "Perder".
4. **Tentar "ganhar peso" com Weight Loss:** os chips de "Manter" e "Ganhar" ficam desabilitados. Pela API, `PATCH {weightGoal:"gain"}` responde 400 `user/weight-loss-requires-lose`.
5. **Home com cada dieta:**
   - vegana: sem whey, iogurte nem mel;
   - Recovery + vegana: receita de outro goal;
   - trocar a dieta na tela de metas e voltar: a Home já mostra a receita nova.
6. **Home com Lite e Muscle:** avançando o relógio do aparelho por 20 dias, Muscle 01, 02, 09 e 18 não aparecem.
7. **Combinação que esvazia o pool:** não acontece com os dados reais; está coberta em `dailyRecipeSelection.synthetic.test.tsx`.

---

## Achados e correções

Achados reportados ao fim da implementação e da rodada de testes; todos foram decididos pelo Gabriel.

| # | Achado | Origem | Decisão / correção |
|---|---|---|---|
| 1 | Muscle 01 e 02 (38 g) e Muscle 09 e 18 (36 g) passam do limite de proteína do Lite (35 g) e apareciam na Home para quem tem Lite | já existia | **Filtrar por limite.** `BLENDER_LIMITS` foi para o shared ([blenderLimits.ts](../../packages/shared/src/blenderLimits.ts)) como fonte única (o backend reexporta em `pricing.config.ts`), e a Home esconde do Lite as receitas acima de `maxProteinGrams`. As receitas não mudaram |
| 2 | O XP "calorieGoal" (e a conclusão da missão `hitCalorieGoal`) saía ao atingir **ou passar** da meta de calorias, inclusive para Weight Loss | já existia | **Faixa só no Weight Loss:** XP só com o total do dia entre 90% e 100% da meta (`getCalorieGoalXpRange`, `isWithinCalorieGoalXpRange`, usado em `awardDailyBlendGoalXP`, [blendLog.controller.ts](../../apps/api/src/controllers/blendLog.controller.ts)). Outros goals iguais a antes. Cada blend é avaliado ao ser registrado: XP já ganho não é retirado; um salto direto de < 90% para > 100% não dá XP naquele dia |
| 3 | "Tart cherry concentrate" das receitas de Recovery (02, 04, 10, 17) às vezes leva açúcar no mercado e não era marcado | já existia | **Renomear:** "Unsweetened tart cherry concentrate" / "Concentrado de cereja ácida sem açúcar" no ingrediente e no passo 1. Macros, marcação e nomes das receitas iguais |
| 4 | Ao trocar de objetivo, o Me não levava ao usuário local as metas recalculadas pelo backend (WeeklyReport/History ficavam desatualizados) | já existia | **Corrigido para todos os goals:** `pickReturnedTargets` aplica só os campos numéricos que vieram na resposta do PATCH. Muda o comportamento de quem não usa Weight Loss (antes as metas locais ficavam velhas) |
| 5 | Granola (Muscle10, Energy09) conta como `nuts` | regra conservadora do backend | **Mantido.** Não é bug: bloquear granola para quem é sem castanhas é o comportamento conservador correto |
| 6 | Pedido explícito de "ganhar peso" no chat com Weight Loss gerou 723 kcal com mel, pasta de amendoim e leite integral | comportamento do prompt (`lose` evita esses ingredientes "a menos que a pessoa peça") | **Mantido por decisão do Gabriel:** quem quiser algo diferente do proposto consegue pedindo explicitamente no chat |
| 7 | Receita da IA acima do limite físico era entregue: proteína (36,3 g no Lite) gerava retry, mas nunca bloqueava; volume não era validado (3 de 5 receitas acima de 400 ml); limites em ml e fl oz não batiam | já existia | **Corrigido.** Limites de volume 400/400/600 ml (ml como fonte da verdade, fl oz derivado); leitor de quantidades; bloqueio após um retry. Detalhes abaixo |
| 8 | Se a nova tentativa falhava no provedor (cota, rede), a pessoa via "não coube no BLENDi" ou "não atende sua dieta" | desta correção e do CP-1.1.1c | **Separado:** a falha do provedor responde "IA indisponível". Detalhes abaixo |
| 9 | `POST /users/calculate-macros` em imperial valida altura/peso na faixa métrica antes de converter (68,9 pol é recusado) | já existia, documentado no schema | **Não corrigido:** o app sempre manda métrico; hoje não afeta ninguém |
| 10 | 26 das 80 receitas antigas da Home passam de 400 ml pela estimativa do leitor de quantidades, e a Home não filtra por volume | já existia | **Não corrigido neste CP** (decisão do Gabriel): as receitas da Home não foram alteradas; a correção das quantidades fica para um CP separado. Lista abaixo |
| 11 | Três fatores de fl oz diferentes no projeto: `MILLILITERS_PER_FLUID_OUNCE = 29.574` (app, hidratação), `ML_PER_US_FLUID_OUNCE = 29.5735` (shared, limites do copo) e `29.5735` literal no leitor de quantidades | já existia (app) / deste CP | **Não unificado** (decisão do Gabriel): trocar o app para 29,5735 mudaria 180 das 7.501 metas de hidratação exibidas (0,1 fl oz a mais, ex.: 590 ml de 19,9 para 20,0 fl oz) e 182 dos 2.536 valores digitáveis em fl oz gravados com 1 ml a menos (ex.: 17,6 fl oz de 521 para 520 ml). Limites 17,0–270,5 fl oz e o caso 84,5 fl oz = 2499 ml não mudariam |

### Achado 7 — limite físico do BLENDi

**Limites de volume:** os ml e os fl oz não batiam (Lite e Pro+ 400 ml vs. 17,5 fl oz ≈ 518 ml; Steel 600 ml vs. 21 fl oz ≈ 621 ml), e o prompt mostrava um limite diferente conforme a unidade.

- **1ª decisão (substituída):** valer os fl oz, com os ml derivados (518/518/621 ml). Foi a versão testada ao vivo nas rodadas 2 e 3 ([testes](cp-1.1.9-testes-pentest.md)).
- **Decisão final, confirmada pelo Jon:** a fonte da verdade é o **ml**, o volume máximo recomendado para bater, ou seja, a **linha de MAX do copo** (não a capacidade total). O fl oz é só a forma de mostrar o mesmo limite a quem usa o sistema imperial: é derivado do ml e **arredondado para baixo** na 1ª casa decimal, para que o valor em oz, convertido de volta, nunca passe do ml.

| Modelo | ml (fonte da verdade) | fl oz derivado | fl oz × 29,5735 | Proteína |
|---|---|---|---|---|
| Lite | **400** | 400 ÷ 29,5735 = 13,53 → **13,5** | 399,24 ml ≤ 400 | 35 g |
| Pro+ | **400** | 13,53 → **13,5** | 399,24 ml ≤ 400 | 45 g |
| Steel | **600** | 600 ÷ 29,5735 = 20,29 → **20,2** | 597,38 ml ≤ 600 | 55 g |

Em [blenderLimits.ts](../../packages/shared/src/blenderLimits.ts): `maxVolumeOz = Math.floor(maxVolumeMl ÷ ML_PER_US_FLUID_OUNCE × 10) ÷ 10`. Em relação ao código anterior ao CP, os ml são os mesmos (400/400/600) e só os oz mudaram (17,5/17,5/21 → 13,5/13,5/20,2).

**Leitor de quantidades** ([recipeVolume.utils.ts](../../apps/api/src/utils/recipeVolume.utils.ts)):
- lê `g`/`kg`/`mg`, `ml`/`l`/`cl`/`dl`, `cup`/`xícara`, `tbsp`/`colher de sopa`, `tsp`/`colher de chá` (`colher` sem tipo conta como de chá), `oz`, `fl oz`, `lb`;
- frações (`1/2`, `1 1/2`, `½`), vírgula decimal e faixas (usa o menor valor);
- medida entre parênteses prevalece (`1 scoop (30g)`);
- 1 g de sólido = 1 ml;
- itens sem medida ("1 banana", "1 scoop") contam como 0. O total é um piso: acima do limite é violação certa; abaixo pode esconder itens não medidos. Risco aceito para não bloquear receitas corretas por falta de unidade.

**Prompt:** o bloco de limites físicos mostra 400ml/600ml no métrico e 13.5oz/20.2oz no imperial, e ganhou a linha "When adding up the volume, count each gram of a solid ingredient as 1ml.", a mesma conta do backend.

**Bloqueio** (`validateBlenderLimits` e `buildBlenderLimitRetryMessage` em [blenderGuardrail.utils.ts](../../apps/api/src/utils/blenderGuardrail.utils.ts)):
- **Pulse AI:**
  - acima do limite (proteína e/ou volume): uma nova tentativa com mensagem que cita os números;
  - se continuar acima ou voltar inválida: **422 `pulseai/blender-limit-unmet`**, uso do dia devolvido, sem cache, conversa nem XP;
  - conferência final depois das correções de macros e de dieta, que podem passar do limite de novo;
  - receita guardada no cache que passe do limite é removida e gerada de novo.
- **Pantry Scanner:**
  - a mesma regra por receita: a receita é descartada;
  - se todas caírem só pelo limite: **422 `scanner/blender-limit-unmet`**, scan devolvido, sem XP;
  - se alguma caiu pela dieta: continua `scanner/dietary-restriction-unmet`.
- **App:** `errors.pulseai_blender_limit_unmet` e `errors.scanner_blender_limit_unmet` em en e pt-BR, mapeados em `pulseAi.service.ts` e `pantryScanner.service.ts`.

### Achado 8 — falha do provedor separada de "não coube / dieta"

Vale para as novas tentativas de limite físico e de dieta, na Pulse AI e no Pantry:

| Na nova tentativa | Pulse AI | Pantry (nenhuma receita sobrou) |
|---|---|---|
| A receita continua fora da regra, ou volta inválida | 422 `pulseai/blender-limit-unmet` ou `pulseai/dietary-restriction-unmet` | 422 `scanner/blender-limit-unmet` ou `scanner/dietary-restriction-unmet` |
| A chamada lança erro (provedor fora, cota, rede, qualquer exceção) | **503 `pulseai/ai-unavailable`** | **503 `scanner/vision-unavailable`** |

- **Implementação:** cada verificação devolve o motivo (`'unmet'` ou `'aiUnavailable'`), e o controller escolhe a resposta.
- **Sem custo para a pessoa:** uso ou scan devolvido, sem cache, conversa nem XP.
- **No Pantry:** se uma receita se perde pelo provedor e a outra é aprovada, a aprovada é entregue (200).
- **Qualquer exceção conta:** qualquer erro na nova tentativa conta como indisponível, porque a receita nem chegou a ser avaliada.
- **Textos:** os dois códigos 503 já existiam e já têm mensagem no app.

### Achado 10 — receitas antigas da Home acima de 400 ml (pré-existente, não corrigido)

- **Escopo do critério de 400 ml:** vale só para as 20 receitas de Weight Loss, conferidas em teste com cada ingrediente em g/ml (maior volume: 400 ml).
- **As 80 antigas:** usam medidas caseiras ("1 cup", "1 scoop"), e nenhum teste soma o volume delas. Passadas pelo mesmo leitor de quantidades do backend, **26 passam de 400 ml**.
- **Como a estimativa conta:** 1 cup = 236,6 ml; 1 g = 1 ml; itens sem medida ("1 scoop", "2 dates", "1 handful") = 0. Por isso é um piso: o volume real é igual ou maior.
- **A Home não filtra por volume:** só por dieta, gelo e proteína do Lite. Essas receitas continuam aparecendo para Lite e Pro+ (400 ml), e a Tofu Berry Builder passa até do Steel (600 ml).
- **Decisão do Gabriel:** as receitas da Home não foram alteradas. A correção das quantidades fica para um CP separado.

| Goal | Receita (en) | Ingredientes | Volume estimado |
|---|---|---|---|
| Muscle | Berry Protein Yogurt | 250g Greek yogurt; 1 cup Mixed berries; 1 tbsp Honey | 501 ml |
| Muscle | Tropical Protein Blend | 1 scoop Whey protein; 1 cup Pineapple; 200ml Light coconut milk | 437 ml |
| Muscle | Cottage Mango Power | 200g Cottage cheese; 1 cup Mango; 1 tbsp Honey | 451 ml |
| Muscle | Tofu Berry Builder | 150g Silken tofu; 1 cup Frozen mixed berries; 250ml Oat milk | **637 ml** |
| Muscle | Cottage Pineapple Coconut | 150g Cottage cheese; 1 cup Pineapple; 1 tbsp Coconut flakes | 401 ml |
| Muscle | Mango Chia Protein | 200g Greek yogurt; 1 cup Frozen mango chunks; 1 tbsp Chia seeds | 451 ml |
| Wellness | Cucumber Pineapple Cooler | 1/2 cup Cucumber; 1 cup Pineapple; 150g Greek yogurt | 505 ml |
| Wellness | Tropical Green Glow | 1 handful Spinach; 1 cup Mango; 200ml Milk kefir | 437 ml |
| Wellness | Beet Berry Bliss | 1/2 cup Cooked beet; 1 cup Strawberries; 150g Greek yogurt | 505 ml |
| Wellness | Watermelon Yogurt Splash | 1 cup Watermelon; 100g Greek yogurt; 200ml Coconut water | 537 ml |
| Wellness | Kale Pineapple Fresh | 1 handful Kale; 1 cup Pineapple; 200ml Milk kefir | 437 ml |
| Wellness | Strawberry Cucumber Calm | 1 cup Strawberries; 1/2 cup Cucumber; 150g Greek yogurt | 505 ml |
| Wellness | Papaya Chia Yogurt | 150g Greek yogurt; 1 cup Papaya; 1 tbsp Chia seeds | 401 ml |
| Energy | Fast Fuel Mango Oats | 40g Oats; 1 cup Mango; 250ml Almond milk | 527 ml |
| Energy | Tropical Oat Charge | 1 cup Pineapple; 30g Oats; 250ml Coconut water | 517 ml |
| Energy | Maca Mango Rise | 1 cup Mango; 1 tsp Maca powder; 250ml Low-fat milk | 492 ml |
| Energy | Pineapple Oat Rush | 40g Oats; 1 cup Pineapple; 250ml Oat milk | 527 ml |
| Energy | Mango Date Spark | 2 Dates; 1 cup Mango; 250ml Low-fat milk | 487 ml |
| Energy | Matcha Pineapple Zing | 1 tsp Matcha powder; 1 cup Pineapple; 250ml Low-fat milk | 492 ml |
| Energy | Papaya Date Fuel | 1 cup Papaya; 2 Dates; 250ml Low-fat milk | 487 ml |
| Energy | Coconut Pineapple Energy | 1 cup Pineapple; 1 tbsp Coconut flakes; 250ml Low-fat milk | 501 ml |
| Recovery | Golden Recovery Smoothie | 1 scoop Whey protein; 1 cup Pineapple; 250ml Coconut water | 487 ml |
| Recovery | Tart Cherry Recovery | 2 tbsp Unsweetened tart cherry concentrate; 200g Greek yogurt; 200ml Oat milk | 430 ml |
| Recovery | Blueberry Protein Recovery | 1 scoop Whey protein; 1 cup Blueberries; 250ml Coconut water | 487 ml |
| Recovery | Papaya Protein Soothe | 1 scoop Whey protein; 1 cup Papaya; 250ml Coconut water | 487 ml |
| Recovery | Berry Protein Recovery | 1 scoop Whey protein; 1 cup Mixed berries; 250ml Coconut water | 487 ml |

Por goal: Muscle 6, Wellness 7, Energy 8, Recovery 5. O padrão é quase sempre "1 cup de fruta + 200 a 250 ml de líquido". Com o limite intermediário de 518 ml, 4 delas já passavam (527, 527, 537 e 637 ml).

