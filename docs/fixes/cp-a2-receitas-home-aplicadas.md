# CP-A2 — Receitas da Home aplicadas (proposta CP-A + ajustes da revisão)

**Data:** 17/11/2026. **Base:** [proposals/cp-a-receitas-home.md](../proposals/cp-a-receitas-home.md), aprovada pelo Gabriel com 9 ajustes.

## Resumo

- As 100 receitas da Home estão como na proposta, com os ajustes da revisão: **81 mudam**, **19 ficam iguais** (só o texto neutro dos passos).
- As 100 cabem em **400 ml** no leitor do backend (máximo: 400 ml, Recovery02), sem item sem medida, sem congelado, sem nada barrado no Lite e sem "BLENDi" nos passos.
- O Recovery tem **4 receitas veganas e sem laticínios** (07, 09, 14 e 16). Com os dados reais, nenhuma combinação de dieta cai mais no fallback para outros goals.
- Leitor: passa a ler "fluid oz" (ajuste 7), e concentrado líquido conta pela medida (ajuste 8).
- Testes novos travam as regras das 100 receitas. API: de 1002 para **1018** testes. Mobile: de 922 para **923**. Typecheck nos 3 workspaces, lint e as duas suítes passam.

## O que mudou

| Arquivo | Mudança |
|---|---|
| [dailyRecipes.data.ts](../../apps/mobile/src/components/home/dailyRecipes.data.ts) | Ingredientes, macros e `contains` das 81. `pulseCount` sai de todas (não sobrou congelado). `durationMinutes` não muda (a proposta não muda o tempo). Comentário com as premissas (leite, iogurte e cottage 2% com os códigos USDA, fontes dos macros, volume pelo leitor) |
| [en.json](../../apps/mobile/src/locales/en.json) / [pt-BR.json](../../apps/mobile/src/locales/pt-BR.json) | Nomes, ingredientes, quantidades e passos. Mesmas chaves. As únicas chaves novas são as do 4º ingrediente de 9 receitas (Muscle07, 08, 13, 18, 19; Energy19; Recovery14, 16, 19), no padrão `dailyRecipe<Goal><NN>Ingredient4Name/Amount`. Nenhuma chave ficou sem uso, porque nenhuma receita perdeu ingrediente |
| [recipeVolume.utils.ts](../../apps/api/src/utils/recipeVolume.utils.ts) | Ajuste 7: a regex de onça fluida aceita "fluid oz" |
| [ingredientWeights.utils.ts](../../apps/api/src/utils/ingredientWeights.utils.ts) | Ajuste 8: `CONCENTRATE_INGREDIENT_TERMS` ("concentrate", "concentrado") conta como nome de líquido, exceto com nome de proteína ("whey protein concentrate" continua sendo pó). Xarope/"syrup" já estava nos termos de líquido |
| [recipeVolume.utils.test.ts](../../apps/api/src/utils/recipeVolume.utils.test.ts) | Bloco "fluid oz e concentrados líquidos": 9 testes |
| [homeRecipeMarkings.test.ts](../../apps/api/src/utils/homeRecipeMarkings.test.ts) | Bloco "regras das 100 receitas" com 7 testes. Fixture do WeightLoss com o leite 2% e as citações do ajuste 9 corrigidas |
| [dailyRecipeSelection.test.tsx](../../apps/mobile/src/components/home/dailyRecipeSelection.test.tsx) | 2 expectativas alteradas e 1 teste novo (ver "Testes do app") |

## Ajustes da revisão

1. **Iogurte grego e cottage sem tipo:** "Greek yogurt"/"Iogurte grego" pela USDA 01287 e "Cottage cheese"/"Cottage" pela USDA 01015, como a proposta já calculava. "Nonfat Greek yogurt" e "Low-fat cottage cheese" do WeightLoss continuam como estão.
2. **Volume:** a regra é o leitor (`estimateRecipeVolumeMl`, textos em inglês), não a xícara cheia.
3. **Recovery19:** receita nova, de outra família (ver abaixo).
4. **Muscle01:** reforçada para 35 g (ver abaixo).
5. **Nome repetido em pt-BR:** a WeightLoss16 passa a se chamar **"Shake Vegetal de Banana"**, no padrão de "Shake Vegetal de Cacau" (WeightLoss04) e "Shake Vegetal de Amora" (WeightLoss13), sem promessa de resultado. O nome em inglês ("Banana Plant Protein") fica. Não há mais nome repetido nem em en nem em pt-BR.
6. **Muscle18 e Muscle12:** como na proposta.
7. **"fluid oz":** "8 fluid oz" = 236,6 ml (antes contava 0).
8. **Concentrados:** "2 tbsp" de concentrado de cereja = 29,6 ml (antes contava 19,3 ml, como cereja em pedaços). O efeito nas receitas está abaixo.
9. **Citações no teste do WeightLoss:** soymilk unsweetened = USDA 16222 e tofu silken firm = USDA 16162. Os valores não mudaram.

### Muscle01 — Power Protein Blend / Blend Power Protein

Leite no lugar do leite de amêndoas e 5 g a mais de whey. Mesmo nome. **P35 C41 G7 · 353 kcal** (4/4/9: 367 kcal, −3,8%) · **383 ml** · contains **dairy** (antes dairy, nuts, por causa do leite de amêndoas).

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 35g Whey protein | 35g Whey protein | 35 | 26,3 | 2,8 | 1,8 | 133 | B: Whey protein concentrate |
| 1 medium Banana | 1 unidade média Banana | 118 | 1,3 | 27,1 | 0,4 | 105 | B: Ripe banana |
| 230ml Milk | 230ml Leite | 230 | 7,6 | 11,0 | 4,6 | 115 | U 01079 (referência única do "Leite") |
| **Total** | | **383** | **35,1** | **41,0** | **6,7** | **353** | |

A quantidade de whey está em gramas ("35g"), não em "1 scoop", porque o scoop da Home vale 30 g. Com 1 scoop (30 g) e 250 ml de leite, a receita ficaria com 32 g de proteína. Com 1 1/2 scoop, passaria de 40 g.

Passos: "Add the whey protein and banana to the cup." / "Adicione whey protein e banana ao copo."; "Add the milk and close the lid." / "Acrescente leite e feche a tampa."; os passos 3 e 4 são os mesmos do Muscle.

### Recovery19 — Cacao Banana Recovery / Recuperação com Banana e Cacau

Substitui "Strawberry Protein Recovery" (whey + morango + água de coco), que repetia a Recovery15. É a família do leite com cacau, a sugestão do prompt. Nenhuma outra receita do Recovery usa leite ou cacau, e o conjunto (banana + cacau + iogurte grego + leite) não aparece em nenhuma das 100.

Na revisão do relatório, o Gabriel decidiu trocar 100 ml do leite por 100 g de iogurte grego para subir a proteína. A primeira versão (banana + cacau + 250 ml de leite) tinha P11 C42 G6 · 242 kcal. A receita passa a dividir banana e iogurte grego com a Recovery12 (cúrcuma + banana + iogurte), mas o conjunto continua diferente.

**P17 C41 G6 · 265 kcal** (4/4/9: 286 kcal, −7,3%) · **373 ml** · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 medium Banana | 1 unidade média Banana | 118 | 1,3 | 27,1 | 0,4 | 105 | B: Ripe banana |
| 1 tbsp Cacao powder | 1 colher(es) de sopa Cacau em pó | 5,4 | 1,1 | 3,1 | 0,7 | 12 | U 19165 Cocoa, dry powder, unsweetened |
| 100g Greek yogurt | 100g Iogurte grego | 100 | 10,0 | 3,9 | 1,9 | 73 | U 01287 (referência única do "Iogurte grego") |
| 150ml Milk | 150ml Leite | 150 | 5,0 | 7,2 | 3,0 | 75 | U 01079 (referência única do "Leite") |
| **Total** | | **373** | **17,3** | **41,4** | **6,0** | **265** | |

Passos: "Add the banana, cacao powder and greek yogurt to the cup." / "Adicione banana, cacau em pó e iogurte grego ao copo."; "Add the milk and close the lid." / "Acrescente leite e feche a tampa."; os passos 3 e 4 são os mesmos do Recovery.

## Efeito do ajuste 8 nas Recovery 02, 04, 10 e 17

O concentrado de cereja ("2 tbsp") passou de 19,3 ml para 29,6 ml (+10,3 ml):

| Receita | Proposta (leitor antigo) | Com o ajuste 8 | Ação |
|---|---|---|---|
| Recovery02 Tart Cherry Recovery | 399 ml | 410 ml | **Leite de aveia de 180 para 170 ml → 400 ml.** Macros refeitos: P23 C44 G6 · 333 kcal (antes P23 C45 G7 · 337) |
| Recovery04 Cherry Protein Recharge | 299 ml | 310 ml | nenhuma |
| Recovery10 Beet Cherry Recharge | 288 ml | 298 ml | nenhuma |
| Recovery17 Hemp Cherry Recovery | 184 ml | 194 ml | nenhuma |

Recovery02 depois do ajuste: 2 tbsp de concentrado (1,0/25,0/0,0/110, FDC 2286580) + 200 g de iogurte grego (19,9/7,9/3,8/146, U 01287) + 170 ml de leite de aveia (1,7/11,1/2,6/77, B). Soma: 22,6/43,9/6,4/332,5 kcal. O volume é 399,6 ml, que o leitor arredonda para 400.

## Receitas compatíveis por goal e dieta (antes → depois)

| Goal | vegan | dairy_free | nut_free | no_added_sugar |
|---|---|---|---|---|
| Muscle | 3 → 3 | 3 → 3 | 13 → 14 | 16 → 16 |
| Wellness | 2 → 2 | 2 → 2 | 20 → 20 | 20 → 20 |
| Energy | 5 → 6 | 6 → 7 | 17 → 17 | 19 → 19 |
| Recovery | **0 → 4** | **0 → 4** | 20 → 20 | 20 → 20 |
| WeightLoss | 8 → 8 | 9 → 9 | 16 → 16 | 20 → 20 |

Muscle nut_free +1: a Muscle01 deixou de usar leite de amêndoas. Energy vegan e dairy_free +1: a Energy18 nova (aveia, mirtilo e bebida de soja) substitui a receita com iogurte grego, laranja e cenoura. O Wellness fica no mínimo exigido pelo teste (2 e 2).

## Testes

### API ([homeRecipeMarkings.test.ts](../../apps/api/src/utils/homeRecipeMarkings.test.ts)), bloco "regras das 100 receitas (CP-A)"

| Teste | O que trava |
|---|---|
| volume até 400 ml | `estimateRecipeVolumeMl` com os textos em inglês ≤ o menor copo entre os modelos (400 ml), sem item em `unmeasured` |
| nada barrado no Lite | `validateRecipeRestrictions(receita, [], 'Lite')` compliant nas 100 (congelado ou gelo, em ingredientes e passos) |
| texto neutro | nenhum "BLENDi" nos passos em en e pt-BR |
| 4/4/9 | kcal declarada a ±10% de 4P + 4C + 9G |
| duplicadas | nenhum par com o mesmo conjunto de ingredientes (nome normalizado pelo tokenizador do validador, sem quantidades) |
| paridade en/pt-BR | para cada ingrediente, os mesmos números na quantidade e o mesmo volume no leitor |
| opções por dieta | cada goal com pelo menos 2 veganas e 2 sem laticínios |

- A marcação `contains` continua conferida pelo validador nos testes que já existiam.
- O teste do leitor que já existia (mesmo volume em en e pt-BR, sem item sem medida) ficou como estava. Só saiu o comentário que dizia que o limite não era conferido.
- **Conferência de que os testes travam:** rodei o arquivo contra os dados antigos (stash temporário dos 3 arquivos da Home). Falham volume, Lite, "BLENDi", duplicadas, opções por dieta e os macros do WeightLoss. Com os dados novos, passam todos.
- **Fixture do WeightLoss:** `skim` virou `milk` (USDA 01079, 2%), porque as 4 receitas do WeightLoss com leite passaram a usar "Milk". A checagem de variedade das bases passou de `['water', 'soy', 'skim']` para `['water', 'soy', 'milk']`. Os comentários "congelado fica para o CP-A" saíram.

### Leitor ([recipeVolume.utils.test.ts](../../apps/api/src/utils/recipeVolume.utils.test.ts))

- "fluid oz" e "fluid ounce(s)", soltos e com nome ("8 fluid oz" de leite de amêndoas e "4 fluid oz" de café, os 2 casos do lote da auditoria).
- Concentrado de cereja em en e pt-BR, em colher e em xícara; concentrado de suco de uva; xarope de bordo e de agave.
- "Whey protein concentrate" em scoop e em xícara continua contando como pó (30 ml).

### Testes do app ([dailyRecipeSelection.test.tsx](../../apps/mobile/src/components/home/dailyRecipeSelection.test.tsx))

Seleção, filtro e rotação não mudaram. Mudaram 2 expectativas, por causa dos dados:

1. **"Lite não esconde as Muscle acima de 35 g":** a lista esperada era Muscle01, 02, 09 e 18 (36-38 g). Com os macros somados, só a Muscle02 (36 g) passa de 35 g. As outras 3 ficaram com 35 g. Agora a lista esperada é só a Muscle02. A outra parte do teste (o pool do Lite é o goal inteiro) não mudou.
2. **"Recovery não tem receita vegana: usa os outros goals":** o Recovery passou a ter 4 veganas. Agora o teste confere que o pool vem do próprio goal (07, 09, 14 e 16, nessa ordem). Um teste novo confere que, com os dados reais, nenhum goal × combinação de dieta × modelo cai no fallback. O fallback para os outros goals continua coberto com dados sintéticos em `dailyRecipeSelection.synthetic.test.tsx`, sem mudança.

O restante passa sem mudança: a rotação Muscle + vegan, que continua com 3 receitas, o card, o botão de preparar, a troca de dieta e a rotação diária.

## Verificação

| Comando | Resultado |
|---|---|
| `pnpm typecheck` (shared, api, mobile) | ok, os 3 sem erro |
| `pnpm lint` (shared, api, mobile) | ok, sem erro nem aviso |
| `pnpm --filter @blendi/api test` | 1018 de 1018 |
| `pnpm --filter @blendi/mobile test` | 47 suítes, 923 de 923 |

As chaves das receitas são `TranslationKey` no arquivo de dados. O typecheck do mobile confere todas pela checagem estrita do `t()`, sem cast.

## Diferenças em relação à proposta

Além dos ajustes 1 a 8, nenhuma. A conferência foi feita por script: a proposta foi lida tabela a tabela e aplicada sem edição à mão.
- As 81 receitas que mudam têm os ingredientes, as quantidades, os passos, os macros declarados e a marcação `contains` da proposta. As exceções são as dos ajustes: Muscle01 (4), Recovery19 (3), Recovery02 (8) e o nome pt-BR da WeightLoss16 (5).
- As 19 que ficam iguais mantêm ingredientes, quantidades, nome, macros e marcação. Só os passos mudam ("to the BLENDi cup." → "to the cup."; "ao copo do BLENDi." → "ao copo.").
- Volumes: iguais aos da proposta em todas, exceto Muscle01, Recovery19 e as 4 com concentrado.
- Fora da proposta: `durationMinutes` não muda em nenhuma receita, porque a proposta não trata do tempo. Só o `pulseCount` sai.

## As 100 receitas (depois)

Volume no leitor do backend, com os textos em inglês. P/C/G em g.

| id | Nome (en / pt-BR) | P/C/G | kcal | Volume | contains | Mudou? |
|---|---|---|---|---|---|---|
| Muscle01 | Power Protein Blend / Blend Power Protein | 35/41/7 | 353 | 383 ml | dairy | sim |
| Muscle02 | Chocolate PB Power / Power Chocolate com Amendoim | 36/20/15 | 358 | 346 ml | dairy, nuts | sim |
| Muscle03 | Berry Protein Yogurt / Iogurte Proteico com Frutas Vermelhas | 26/39/5 | 295 | 371 ml | dairy, animal, added_sugar | sim |
| Muscle04 | Tropical Protein Blend / Blend Proteico Tropical | 25/26/14 | 317 | 395 ml | dairy | sim |
| Muscle05 | Oats Almond Bulk / Aveia com Pasta de Amêndoas | 22/48/26 | 498 | 372 ml | dairy, nuts | sim |
| Muscle06 | Cottage Mango Power / Cottage com Manga | 23/49/5 | 333 | 380 ml | dairy, animal, added_sugar | não (só passos) |
| Muscle07 | Double Chocolate Muscle / Duplo Chocolate Muscle | 31/42/7 | 331 | 353 ml | dairy | sim |
| Muscle08 | Tofu Berry Builder / Tofu com Frutas Vermelhas | 35/20/8 | 287 | 387 ml | — (vegana) | sim |
| Muscle09 | Classic Oat Protein / Proteína Clássica com Aveia | 35/35/8 | 353 | 310 ml | dairy | sim |
| Muscle10 | Granola Yogurt Power / Iogurte com Granola | 22/35/7 | 291 | 244 ml | dairy, animal, nuts, added_sugar | não (só passos) |
| Muscle11 | Creamy Avocado Protein / Proteína Cremosa com Abacate | 32/19/14 | 319 | 330 ml | dairy | sim |
| Muscle12 | PB Banana Builder / Amendoim com Banana | 18/46/21 | 418 | 400 ml | dairy, nuts | sim |
| Muscle13 | Hemp Banana Bulk / Cânhamo com Banana | 31/46/15 | 427 | 398 ml | — (vegana) | sim |
| Muscle14 | Date Sweet Protein / Proteína Adocicada com Tâmaras | 32/50/7 | 372 | 328 ml | dairy | sim |
| Muscle15 | Cottage Pineapple Coconut / Cottage com Abacaxi e Coco | 17/30/7 | 239 | 330 ml | dairy | sim |
| Muscle16 | Chocolate Almond Muscle / Chocolate com Amêndoas | 28/23/13 | 321 | 296 ml | dairy, nuts | não (só passos) |
| Muscle17 | Mango Chia Protein / Proteína com Manga e Chia | 23/38/8 | 303 | 375 ml | dairy | sim |
| Muscle18 | Simple Oat Muscle / Aveia Simples Muscle | 35/53/8 | 418 | 329 ml | dairy | sim |
| Muscle19 | Plant Power Banana / Proteína Vegetal com Banana | 33/37/14 | 388 | 394 ml | nuts | sim |
| Muscle20 | Cacao Yogurt Builder / Iogurte com Cacau | 21/28/5 | 241 | 220 ml | dairy, animal, added_sugar | não (só passos) |
| Wellness01 | Green Balance Smoothie / Smoothie Equilíbrio Verde | 17/32/3 | 222 | 362 ml | dairy | sim |
| Wellness02 | Kale Pear Refresh / Couve com Pera | 16/34/4 | 221 | 358 ml | dairy | sim |
| Wellness03 | Cucumber Pineapple Cooler / Pepino com Abacaxi | 16/24/3 | 179 | 392 ml | dairy | sim |
| Wellness04 | Tropical Green Glow / Brilho Verde Tropical | 10/35/3 | 192 | 395 ml | dairy | sim |
| Wellness05 | Beet Berry Bliss / Beterraba com Frutas Vermelhas | 17/23/3 | 183 | 382 ml | dairy | sim |
| Wellness06 | Carrot Orange Sunrise / Cenoura com Laranja | 17/28/3 | 198 | 399 ml | dairy | sim |
| Wellness07 | Kiwi Spinach Fresh / Kiwi com Espinafre | 10/31/3 | 177 | 368 ml | dairy | sim |
| Wellness08 | Cucumber Apple Calm / Pepino com Maçã | 8/29/3 | 175 | 400 ml | — (vegana) | sim |
| Wellness09 | Kale Blueberry Balance / Couve com Mirtilo | 17/29/4 | 204 | 328 ml | dairy | sim |
| Wellness10 | Watermelon Yogurt Splash / Melancia com Iogurte | 12/21/2 | 145 | 392 ml | dairy | sim |
| Wellness11 | Papaya Green Balance / Mamão com Verdes | 16/23/3 | 183 | 325 ml | dairy | não (só passos) |
| Wellness12 | Celery Apple Fresh / Aipo com Maçã | 8/34/2 | 184 | 392 ml | dairy | sim |
| Wellness13 | Carrot Mango Smooth / Cenoura com Manga | 9/34/4 | 188 | 383 ml | — (vegana) | sim |
| Wellness14 | Beet Orange Vitality / Beterraba com Laranja | 17/28/3 | 207 | 399 ml | dairy | não (só passos) |
| Wellness15 | Pear Spinach Light / Pera com Espinafre | 12/33/3 | 189 | 308 ml | dairy | sim |
| Wellness16 | Kiwi Cucumber Yogurt / Kiwi com Pepino e Iogurte | 17/27/4 | 198 | 347 ml | dairy | sim |
| Wellness17 | Kale Pineapple Fresh / Couve com Abacaxi | 9/33/3 | 179 | 395 ml | dairy | sim |
| Wellness18 | Strawberry Cucumber Calm / Morango com Pepino | 16/19/3 | 162 | 361 ml | dairy | sim |
| Wellness19 | Papaya Chia Yogurt / Mamão com Chia e Iogurte | 18/27/6 | 234 | 305 ml | dairy | não (só passos) |
| Wellness20 | Carrot Pineapple Balance / Cenoura com Abacaxi | 16/29/3 | 199 | 392 ml | dairy | sim |
| Energy01 | Fast Fuel Mango Oats / Manga com Aveia Turbo | 8/53/6 | 275 | 395 ml | nuts | sim |
| Energy02 | Date Banana Fuel / Tâmara com Banana | 10/74/5 | 353 | 396 ml | dairy | sim |
| Energy03 | Cacao Oat Boost / Cacau com Aveia | 13/36/8 | 251 | 285 ml | dairy | sim |
| Energy04 | Matcha Morning Energy / Energia Matinal com Matcha | 11/40/5 | 235 | 370 ml | dairy | sim |
| Energy05 | Tropical Oat Charge / Carga Tropical com Aveia | 6/49/3 | 234 | 395 ml | — (vegana) | sim |
| Energy06 | Triple Date Power / Força Tripla de Tâmaras | 15/93/8 | 476 | 362 ml | dairy | sim |
| Energy07 | Espresso Banana Kick / Espresso com Banana | 10/40/5 | 233 | 398 ml | dairy | sim |
| Energy08 | Maca Mango Rise / Maca com Manga | 10/40/5 | 234 | 400 ml | dairy | sim |
| Energy09 | Granola Banana Energy / Granola com Banana | 12/51/10 | 332 | 392 ml | dairy, nuts | sim |
| Energy10 | Pineapple Oat Rush / Abacaxi com Aveia | 8/61/6 | 320 | 395 ml | — (vegana) | sim |
| Energy11 | Cacao Nib Charge / Carga de Nibs de Cacau | 11/43/10 | 293 | 373 ml | dairy | sim |
| Energy12 | Mango Date Spark / Faísca de Manga com Tâmara | 8/69/4 | 322 | 393 ml | dairy | sim |
| Energy13 | Matcha Pineapple Zing / Matcha com Abacaxi | 9/34/5 | 203 | 397 ml | dairy | sim |
| Energy14 | Honey Oat Fuel / Mel com Aveia | 5/53/4 | 268 | 295 ml | animal, added_sugar | não (só passos) |
| Energy15 | Banana PB Charge / Banana com Pasta de Amendoim | 6/46/11 | 307 | 384 ml | nuts | não (só passos) |
| Energy16 | Papaya Date Fuel / Mamão com Tâmara | 8/61/4 | 295 | 393 ml | dairy | sim |
| Energy17 | Mocha Energy Blend / Blend Mocha Energético | 9/16/6 | 140 | 285 ml | dairy | sim |
| Energy18 | Blueberry Oat Fuel / Mirtilo com Aveia | 11/40/6 | 253 | 371 ml | — (vegana) | sim |
| Energy19 | Date Cacao Oat Power / Força de Tâmara com Cacau e Aveia | 8/76/7 | 371 | 333 ml | — (vegana) | sim |
| Energy20 | Coconut Pineapple Energy / Energia de Coco com Abacaxi | 8/33/8 | 218 | 380 ml | dairy | sim |
| Recovery01 | Golden Recovery Smoothie / Smoothie Dourado Recovery | 25/31/2 | 235 | 395 ml | dairy | sim |
| Recovery02 | Tart Cherry Recovery / Recuperação com Cereja Ácida | 23/44/6 | 333 | 400 ml | dairy | sim |
| Recovery03 | Golden Turmeric Pineapple / Abacaxi Dourado com Cúrcuma | 16/29/3 | 207 | 320 ml | dairy | não (só passos) |
| Recovery04 | Cherry Protein Recharge / Recarga Proteica com Cereja | 25/37/2 | 272 | 310 ml | dairy | sim |
| Recovery05 | Ginger Mango Soothe / Gengibre com Manga | 16/31/4 | 224 | 320 ml | dairy | não (só passos) |
| Recovery06 | Pomegranate Chia Recovery / Romã com Chia | 17/28/6 | 234 | 278 ml | dairy | não (só passos) |
| Recovery07 | Banana Coconut Recharge / Recarga de Banana com Coco | 24/39/3 | 265 | 398 ml | — (vegana) | sim |
| Recovery08 | Ginger Pineapple Ease / Gengibre com Abacaxi | 16/28/3 | 203 | 320 ml | dairy | não (só passos) |
| Recovery09 | Blueberry Protein Recovery / Recuperação com Mirtilo | 24/32/3 | 239 | 398 ml | — (vegana) | sim |
| Recovery10 | Beet Cherry Recharge / Recarga de Beterraba com Cereja | 17/39/3 | 257 | 298 ml | dairy | sim |
| Recovery11 | Papaya Protein Soothe / Mamão Proteico Calmante | 25/26/2 | 218 | 395 ml | dairy | sim |
| Recovery12 | Turmeric Banana Calm / Cúrcuma com Banana | 16/34/3 | 227 | 273 ml | dairy | não (só passos) |
| Recovery13 | Pomegranate Protein Recharge / Recarga Proteica com Romã | 25/27/2 | 226 | 348 ml | dairy | não (só passos) |
| Recovery14 | Ginger Orange Revive / Gengibre com Laranja | 28/22/5 | 242 | 366 ml | — (vegana) | sim |
| Recovery15 | Berry Protein Recovery / Recuperação Proteica com Frutas Vermelhas | 26/26/3 | 221 | 392 ml | dairy | sim |
| Recovery16 | Golden Pineapple Protein / Proteína Dourada com Abacaxi | 24/33/2 | 240 | 390 ml | — (vegana) | sim |
| Recovery17 | Hemp Cherry Recovery / Cânhamo com Cereja | 19/32/8 | 275 | 194 ml | dairy | sim |
| Recovery18 | Kiwi Protein Refresh / Kiwi Proteico Refrescante | 26/31/3 | 242 | 398 ml | dairy | sim |
| Recovery19 | Cacao Banana Recovery / Recuperação com Banana e Cacau | 17/41/6 | 265 | 373 ml | dairy | sim |
| Recovery20 | Ginger Pomegranate Soothe / Gengibre com Romã | 15/23/3 | 179 | 273 ml | dairy | não (só passos) |
| WeightLoss01 | Raspberry Whey Shake / Shake de Whey com Framboesa | 34/26/5 | 276 | 355 ml | dairy, animal | sim |
| WeightLoss02 | Strawberry Plant Protein / Proteína Vegetal com Morango | 28/18/5 | 227 | 380 ml | — (vegana) | sim |
| WeightLoss03 | Blueberry Chia Yogurt / Iogurte com Mirtilo e Chia | 23/27/5 | 233 | 312 ml | dairy | sim |
| WeightLoss04 | Cocoa Plant Protein Shake / Shake Vegetal de Cacau | 30/13/7 | 218 | 290 ml | — (vegana) | não (só passos) |
| WeightLoss05 | Peach Cottage Blend / Blend de Cottage com Pêssego | 23/23/4 | 217 | 400 ml | dairy | sim |
| WeightLoss06 | Green Kiwi Protein / Proteína Verde com Kiwi | 23/23/3 | 198 | 400 ml | — (vegana) | não (só passos) |
| WeightLoss07 | Pineapple Whey Refresher / Refresco de Whey com Abacaxi | 26/21/0 | 186 | 400 ml | dairy, animal | sim |
| WeightLoss08 | Strawberry Oat Yogurt / Iogurte com Morango e Aveia | 19/31/2 | 212 | 320 ml | dairy | sim |
| WeightLoss09 | Raspberry Egg White Shake / Shake de Clara com Framboesa | 28/30/4 | 271 | 375 ml | animal | sim |
| WeightLoss10 | Cherry Almond Whey / Whey com Cereja e Amêndoa | 28/21/4 | 219 | 400 ml | dairy, animal, nuts | sim |
| WeightLoss11 | Pumpkin Yogurt Blend / Blend de Iogurte com Abóbora | 24/20/3 | 202 | 400 ml | dairy | sim |
| WeightLoss12 | Blueberry Tofu Smoothie / Smoothie de Tofu com Mirtilo | 17/21/7 | 214 | 400 ml | — (vegana) | sim |
| WeightLoss13 | Blackberry Plant Shake / Shake Vegetal de Amora | 25/30/6 | 277 | 400 ml | — (vegana) | sim |
| WeightLoss14 | Pear Whey Smoothie / Smoothie de Whey com Pera | 27/25/3 | 225 | 400 ml | dairy, animal, nuts | sim |
| WeightLoss15 | Pumpkin Plant Protein / Proteína Vegetal com Abóbora | 24/13/5 | 186 | 400 ml | nuts | não (só passos) |
| WeightLoss16 | Banana Plant Protein / Shake Vegetal de Banana | 22/26/2 | 202 | 380 ml | — (vegana) | sim + nome pt-BR |
| WeightLoss17 | Green Tofu Pineapple / Tofu Verde com Abacaxi | 14/25/5 | 194 | 360 ml | — (vegana) | sim |
| WeightLoss18 | Cherry Yogurt Blend / Blend de Iogurte com Cereja | 24/28/3 | 231 | 400 ml | dairy | sim |
| WeightLoss19 | Mango Cottage Blend / Blend de Cottage com Manga | 20/22/4 | 197 | 400 ml | dairy, nuts | sim |
| WeightLoss20 | Peach Flax Yogurt / Iogurte com Pêssego e Linhaça | 20/23/5 | 212 | 330 ml | dairy | sim |
