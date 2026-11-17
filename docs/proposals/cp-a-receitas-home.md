# CP-A — Proposta de ajuste das 100 receitas fixas da Home

**Status:** **aplicada** em 17/11/2026, com os ajustes da revisão (iogurte e cottage sem tipo, Recovery19 nova, Muscle01 com 35 g, nome pt-BR da WeightLoss16, "fluid oz" e concentrados no leitor). Relatório: [fixes/cp-a2-receitas-home-aplicadas.md](../fixes/cp-a2-receitas-home-aplicadas.md). O texto abaixo é a proposta como foi revisada; onde o relatório diverge (Muscle01, Recovery19, Recovery02), vale o relatório.

Data: 17/11/2026. Base: análise de 16/11 (itens 1 a 9) e regras do Gabriel e do Jon (copo de 400 ml no Lite e Pro+ e 600 ml no Steel, nada congelado, texto neutro, leite sem tipo, Recovery com opções vegetais).

## Resumo

- **Mudam 81 receitas; 19 ficam iguais.** "Igual" quer dizer mesmos ingredientes, quantidades, nome e macros. As 100 mudam no texto dos passos (ver "Texto neutro", abaixo), uma troca mecânica que não conta como mudança da receita.
- **Motivos** (uma receita pode ter mais de um; "volume" são as 25 acima de 400 ml mais a Wellness20, que passaria do copo com a cenoura cozida):

| Motivo | Receitas |
|---|---|
| volume | 26 |
| leite | 24 |
| congelado | 18 |
| macros | 16 |
| duro cru | 12 |
| sem base | 4 |
| Recovery vegana | 4 |
| proteína | 2 |
| repetida | 2 |
| ingrediente sem referência | 1 |
| repetida com o leite sem tipo | 1 |

- 12 receitas mudam **só** por causa do leite (nome "Milk"/"Leite" e macros pela referência única); 8 mudam só nos macros declarados; 5 mudam só nos passos (instrução de cortar).
- **Depois:** as 100 cabem em 400 ml no leitor novo, nenhuma tem congelado, nenhuma é barrada no Lite pelo validador do backend, e não há duas receitas com os mesmos ingredientes. O Recovery passa a ter 4 receitas veganas e sem laticínios (Recovery07, 09, 14 e 16).

### Premissa do leite (e dos laticínios sem tipo)

- O ingrediente vira só **"Milk" / "Leite"**. Os macros usam uma referência única, o **leite semidesnatado 2%**: USDA SR Legacy 01079 (*Milk, reduced fat, fluid, 2% milkfat*), por 100 ml: 3,3 g de proteína, 4,8 g de carboidrato, 1,98 g de gordura e 50 kcal.
- **Por que o 2%:** fica no meio do caminho entre o desnatado (34 kcal, tabela do backend) e o integral (61 kcal, tabela do backend). Assim o erro de quem usa um ou outro fica pequeno para os dois lados: em 250 ml, o declarado fica 40 kcal acima do desnatado e 27 kcal abaixo do integral. A proteína quase não muda (3,2 a 3,4 g/100 ml).
- **Mesma lógica, aplicada aos laticínios sem tipo no nome:** "Greek yogurt"/"Iogurte grego" = USDA 01287 (*Yogurt, Greek, plain, lowfat*, 2%), e "Cottage cheese"/"Cottage" = USDA 01015 (*lowfat, 2%*). Quando o nome já diz o tipo, vale o tipo: "Nonfat Greek yogurt" e "Low-fat cottage cheese" do WeightLoss continuam como estão.
- **Para decidir (Gabriel):** o iogurte e o cottage devem seguir a regra do leite (nome sem tipo + referência única, como aqui) ou ganhar o tipo no nome?
- A mesma premissa vai, como comentário, para o arquivo de dados quando a proposta for aplicada.

### Fontes dos macros

Metodologia do CP-1.1.9 (WeightLoss): soma ingrediente por ingrediente, por 100 g ou 100 ml, com 1 ml = 1 g. A ordem das fontes:

1. **B**: tabela do backend, [nutritionReference.config.ts](../../apps/api/src/config/nutritionReference.config.ts).
2. **U nnnnn**: USDA FoodData Central, SR Legacy (abril/2018), pelo NDB number. Também é a fonte dos pesos de medida caseira ("1 medium", "1 cup", "1 tbsp").
3. **FDC nnnnnnn**: USDA FoodData Central, *Branded*, pelo fdcId. Só para os 5 itens que não existem no SR Legacy: concentrado de cereja ácida (Cherry Bay, 2286580), maca em pó (Navitas, 2604131, 1 tsp = 5 g), matcha (Tiesta Tea, 2308440, 1 tsp = 2 g), leite de coco light (HT Traders, 2082068) e nibs de cacau (Navitas, 2670464, 1 tbsp = 10 g).

Pesos que não estão na USDA: 1 scoop/dose de proteína = 30 g (rótulo típico, o mesmo do leitor e do CP-B3) e 1 punhado de folhas = 30 g (1 xícara de espinafre, USDA 11457, igual ao "1 handful (30g)" do WeightLoss17). Outras premissas: "Whey protein" sem tipo = concentrado (B); "Almond milk" sem tipo = sem açúcar (B); "Oat milk" = B; tâmara = medjool (U 09421, 24 g); maçã média = 182 g (U 09003, o mesmo peso do leitor), com macros da granny smith (U 09502); fruta congelada usa os valores da fresca, como no CP-1.1.9.

Os valores declarados no DEPOIS são a soma arredondada (meio para cima). A kcal vem da tabela de cada ingrediente; em todas as receitas que mudam, ela fica a menos de 10% da conta 4/4/9 (a conta aparece na linha de total de cada receita).

### Texto neutro (as 100 receitas)

Troca mecânica em todos os passos. O restante do texto fica igual nas receitas que não mudam:

| Antes | Depois |
|---|---|
| "Add the … to the BLENDi cup." | "Add the … to the cup." |
| "Adicione … ao copo do BLENDi." | "Adicione … ao copo." |

Nas receitas que mudam, os 4 passos são reescritos no mesmo padrão: (1) instrução de cortar, quando houver, e "Add the … to the cup."; (2) "Add the … and close the lid."; (3) "Blend on high for 25-30 seconds until smooth." (sem o passo de pulsar, que só existia por causa do congelado); e (4) a frase de servir de cada goal, sem mudança.

## O que a medição confirma e corrige na análise de 16/11

| Item | Análise | Medido aqui | Resultado |
|---|---|---|---|
| 1. Volume | ~50 de 80 acima de 400 ml; leitor antigo achou 26; Tofu Berry Builder 637 ml | Leitor antigo: **15**. Leitor novo (com unidades): **25**. Contando a xícara cheia (236,6 ml), como na análise: **34**. Tofu Berry Builder: 542 ml no leitor novo, **637 ml** com a xícara cheia | **Corrigido.** Os ~50 e os 26 não se reproduzem. A diferença vem da conta: o leitor conta fruta em xícara pelo peso (1 xícara de manga = 165 ml), não pela xícara cheia. A regra deste CP é o leitor novo (≤ 400 ml). A coluna "xícara cheia" mostra o que sobra pela outra conta |
| 2. Sem base | Muscle07, Muscle19, Energy19, Recovery16 | as mesmas 4 | **Confirmado** |
| 3. Duro cru | 11 receitas | 11 das 80 antigas (Wellness01, Wellness02, Wellness06, Wellness08, Wellness09, Wellness12, Wellness13, Wellness15, Wellness17, Wellness20, Energy18) + WeightLoss14 (pera) | **Confirmado** (12 contando o WeightLoss) |
| 4. Macros dos originais | Muscle01 ~26 g / ~262 kcal; Wellness01, Energy01, Recovery01 fora; as 76 derivadas batem (~25%) | Muscle01: 25,0 g / 252 kcal. Wellness01: proteína, carboidrato e gordura fora. Energy01: 8 g de proteína contra 16 declarados. Recovery01: 2 g de gordura contra 13. **Com ±10%, mais 15 derivadas ficam fora**: Muscle04, 07, 08, 12, 13, 15; Wellness04, 07, 12, 17; Energy20; Recovery02, 04, 10, 17 | **Confirmado e ampliado.** Causas: gordura do kefir e do leite de coco subestimada, açúcar do concentrado de cereja subestimado, pasta de amendoim "proteica" |
| 5. Repetidas | Wellness06 = Energy18; Wellness14 = Recovery19 | as mesmas | **Confirmado** |
| 6. Muscle com pouca proteína | Muscle13 8 g, Muscle08 12 g | declarado 8 e 12; recalculado 10,1 e 14,3 g | **Confirmado** |
| 7. Recovery sem vegana | nenhuma vegana nem sem laticínios | 20 de 20 com `dairy` | **Confirmado** |
| 8. "BLENDi" nos passos | todos | 100 de 100 | **Confirmado** |
| 9. Leite | "Low-fat milk" vira "Leite desnatado"; "Whole milk" também aparece | "Low-fat milk"/"Leite desnatado" em 12 receitas, "Whole milk"/"Leite integral" em 8, "Skim milk"/"Leite desnatado" em 4 (WeightLoss) | **Confirmado** |
| Congelado | Muscle 3, WeightLoss 15 | Muscle08, 13, 17; WeightLoss 01, 02, 03, 05, 07, 08, 09, 10, 12, 13, 16, 17, 18, 19, 20 | **Confirmado** |

### Achados novos

- **Muscle09 e Muscle18 ficariam iguais** com o leite sem tipo (whey + 30 g de aveia + 250 ml de leite). A Muscle18 muda para não repetir.
- **"Protein peanut butter"** (Muscle12) não tem referência de macros (varia de marca para marca). Proposta: pasta de amendoim comum.
- **Nome repetido no pt-BR** (já existia): "Proteína Vegetal com Banana" é o nome da Muscle19 e da WeightLoss16. Em inglês os nomes são diferentes. Não está na proposta; **para decidir** se renomeia.
- **Citações erradas na fixture do WeightLoss** ([homeRecipeMarkings.test.ts](../../apps/api/src/utils/homeRecipeMarkings.test.ts)): os valores estão certos, mas os números da USDA não. *Soymilk, unsweetened* é a U 16222, não a 16139; *Tofu, silken, firm* é a U 16162, não a 16161. Não corrigi, porque fica fora do escopo. Vale corrigir junto com a aplicação.
- **Leitor, fora do escopo deste CP, sem mudança:** (a) "8 fluid oz" não é lido (a regex aceita "fl oz" e "fluid ounces", não "fluid oz"). Apareceu 2 vezes no lote da auditoria, e esses itens contam 0. (b) "2 tbsp" de concentrado de cereja conta 19 ml, porque o nome casa com "cherry" na tabela de xícaras do CP-B3. O real são 29,6 ml. Os dois erram para baixo, que é o lado aceito pelo leitor, mas valem um CP próprio.

## Tarefa 1 — Leitor de volume com itens por unidade

- **Tabela:** `UNIT_WEIGHTS` e `UNIT_INGREDIENT_WEIGHTS` em [ingredientWeights.utils.ts](../../apps/api/src/utils/ingredientWeights.utils.ts). Uma constante por item, com a fonte no comentário:

| Item | Peso de 1 unidade | Fonte |
|---|---|---|
| Banana (média) | 118 g | U 09040, medium |
| Tâmara | 24 g | U 09421 medjool (deglet noor, 09087, tem 7,1 g; vale a maior) |
| Kiwi | 69 g | U 09148 |
| Laranja | 131 g | U 09200 |
| Maçã (média) | 182 g | U 09003 |
| Pera (média) | 178 g | U 09252 |
| Pêssego (médio) | 150 g | U 09236 |
| Cenoura (média) | 61 g | U 11124 |
| Abacate | 201 g ("1/4" = 50 g) | U 09037 |
| Talo de aipo (médio) | 40 g | U 11143 |
| Punhado de folhas (espinafre, couve, alface, rúcula) | 30 g | U 11457 (1 xícara de espinafre) e WeightLoss17 |
| Scoop/dose de proteína em pó | 30 g | rótulo típico (mesmo valor do CP-B3) |
| Dose de espresso | 30 ml | U 14210 (1 fl oz = 29,6 g) |

- **Regra:** quantidade só com número, sem medida de peso ou volume, conta *número × peso de 1 unidade* (1 g = 1 ml).
  - Exemplos: "1 banana", "2 bananas", "1/2 banana", "1 unidade média" + nome "Banana", "2 tâmaras", "1/4 de abacate", "1 talo de aipo", "1 punhado de espinafre", "1 scoop"/"1 dose" + nome de proteína, "1 dose de espresso".
  - O item é procurado na quantidade **e** no nome do ingrediente, com o mesmo tokenizador do validador de dieta (sem acento, singular/plural).
  - O tamanho conta sempre como médio. "1 large banana" conta 118 ml, e o leitor continua sendo um limite inferior.
- **Quando não casa, continua contando 0** (como antes), e o item vai para `unmeasured`:
  - item fora da tabela ("1 lime", "6 units" de morango, "4 folhas" de espinafre);
  - falta a palavra de unidade exigida ("1 espinafre", "1" de aipo, "1 scoop" sem nome de proteína);
  - a quantidade tem uma palavra que muda a conta ("2 slices", "1 lata");
  - o nome é de líquido ("leite de banana").
  - O que pode aparecer junto do número é uma lista fechada: tamanho, cor da variedade, "de/of" e estado ou preparo ("ripe", "madura", "picada"…).
- **Um só leitor:** `estimateRecipeVolumeMl` ([recipeVolume.utils.ts](../../apps/api/src/utils/recipeVolume.utils.ts)) é o que o guardrail usa para o Pulse AI e o Pantry (`validateBlenderLimits`). O mesmo leitor mede as receitas da Home: no teste novo do [homeRecipeMarkings.test.ts](../../apps/api/src/utils/homeRecipeMarkings.test.ts) e em toda esta proposta.
- **O que não mudou:** medida entre parênteses continua valendo primeiro ("2 medium (140g)" = 140 ml); xícara, colher, g e ml contam como antes. Limites, bloqueio e regras de dieta não mudaram.

### Testes

- [recipeVolume.utils.test.ts](../../apps/api/src/utils/recipeVolume.utils.test.ts), bloco "CP-A — itens por unidade":
  - 33 quantidades soltas, em en e pt-BR, cobrindo todos os casos do pedido;
  - 23 pares nome + quantidade, no formato da Home e da IA;
  - a medida de peso ou volume vence a unidade;
  - 15 casos que continuam em 0;
  - a unidade exigida decide ("1 dose" de proteína; "pó de maca" não é maçã);
  - soma com `unmeasured`;
  - entrada longa termina rápido.
  - Os 2 testes antigos que esperavam 0 para "1 banana", "2 kiwis", "1 large banana" e "1 green apple" passaram a usar um item fora da tabela ("1 lime").
- [pulseAi.blenderLimits.test.ts](../../apps/api/src/controllers/pulseAi.blenderLimits.test.ts): o teste "itens sem medida não contam" usava "1 large" banana + 380 ml. Ele virou dois:
  - "1 lime" + 380 ml continua sem nova tentativa;
  - "1 large" banana + 380 ml (498 ml) agora pede nova tentativa.
- [homeRecipeMarkings.test.ts](../../apps/api/src/utils/homeRecipeMarkings.test.ts), teste novo:
  - o leitor mede todos os ingredientes das 100 receitas, e o volume dá igual em en e pt-BR;
  - o limite de 400 ml não é conferido, porque a proposta não foi aplicada.

### Efeito nas receitas da IA (lote da auditoria, sem mudar limite nem bloqueio)

- **Base:** as receitas finais (última tentativa) dos 182 itens de `.audit/receitas-ia-2026-11-16.json`. São 177 receitas do Pulse AI e do Pantry; o leitor antigo é o do commit `d1b0950`.
- **32 de 177** mudam de volume, quase todas por causa da banana ("1 medium", "1/2 banana", "1 1/2") e dos kiwis ("3 units").
- **9 passariam do limite do copo** com o leitor novo. Em produção, elas teriam pedido nova tentativa:

| Item | Recurso | Copo | Leitor antigo → novo | Limite |
|---|---|---|---|---|
| #7 | pulse_ai | ProPlus | 293 → **411 ml** | 400 ml |
| #23 | pulse_ai | ProPlus | 292 → **440 ml** | 400 ml |
| #72 | pulse_ai | ProPlus | 277 → **425 ml** | 400 ml |
| #79 | pulse_ai | ProPlus | 324 → **442 ml** | 400 ml |
| #119 | pantry_scanner | ProPlus | 239 → **446 ml** | 400 ml |
| #162 | pulse_ai | Lite | 329 → **506 ml** | 400 ml |
| #172 | pulse_ai | Lite | 366 → **484 ml** | 400 ml |
| #175 | pulse_ai | ProPlus | 345 → **522 ml** | 400 ml |
| #182 | pulse_ai | Steel | 571 → **807 ml** | 600 ml |

Em todas, o volume real já passava do copo: o leitor antigo contava 0 para a banana ou o kiwi, como no item #182 do lote 8 ("2 bananas" com 571 ml, quando o real passava de 600). Daqui para a frente, a IA deve receber mais pedidos de nova tentativa nesses casos. Não mudei limite, prompt nem bloqueio.

### Itens sem medida que ainda não casam

- **Receitas da Home:** nenhum. Todos os ingredientes das 100 receitas são medidos, em en e em pt-BR, com o mesmo volume.
- **Lote da auditoria:** 7 ocorrências, que continuam contando 0:
  - "6 units", "4 units" e "2 units" de morango (Strawberries);
  - "4 folhas" de espinafre (2 vezes);
  - "8 fluid oz" e "4 fluid oz" (leite de amêndoas e café). Aqui o problema é a regex de "fluid oz", não a tabela (ver Achados novos).
- Morango por unidade (U 09316, 12 g o médio) e folha de espinafre (U 11457, 10 g) seriam fáceis de acrescentar. Não acrescentei porque não estavam no pedido.

## As 100 receitas — muda?

| id | Nome (en / pt-BR) | Muda? | Motivo |
|---|---|---|---|
| [Muscle01](#muscle01) | Power Protein Blend / Blend Power Protein | **sim** | macros |
| [Muscle02](#muscle02) | Chocolate PB Power / Power Chocolate com Amendoim | **sim** | leite |
| [Muscle03](#muscle03) | Berry Protein Yogurt / Iogurte Proteico com Frutas Vermelhas | **sim** | volume |
| [Muscle04](#muscle04) | Tropical Protein Blend / Blend Proteico Tropical | **sim** | macros |
| [Muscle05](#muscle05) | Oats Almond Bulk / Aveia com Pasta de Amêndoas | **sim** | leite |
| Muscle06 | Cottage Mango Power / Cottage com Manga | não | — |
| [Muscle07](#muscle07) | Double Chocolate Muscle / Duplo Chocolate Muscle | **sim** | sem base |
| [Muscle08](#muscle08) | Tofu Berry Builder / Tofu com Frutas Vermelhas | **sim** | volume, congelado, proteína |
| [Muscle09](#muscle09) | Classic Oat Protein / Proteína Clássica com Aveia | **sim** | leite |
| Muscle10 | Granola Yogurt Power / Iogurte com Granola | não | — |
| [Muscle11](#muscle11) | Creamy Avocado Protein / Proteína Cremosa com Abacate | **sim** | leite |
| [Muscle12](#muscle12) | PB Banana Builder / Amendoim com Banana | **sim** | leite, macros, ingrediente sem referência |
| [Muscle13](#muscle13) | Hemp Banana Bulk / Cânhamo com Banana | **sim** | congelado, proteína |
| [Muscle14](#muscle14) | Date Sweet Protein / Proteína Adocicada com Tâmaras | **sim** | leite |
| [Muscle15](#muscle15) | Cottage Pineapple Coconut / Cottage com Abacaxi e Coco | **sim** | macros |
| Muscle16 | Chocolate Almond Muscle / Chocolate com Amêndoas | não | — |
| [Muscle17](#muscle17) | Mango Chia Protein / Proteína com Manga e Chia | **sim** | congelado |
| [Muscle18](#muscle18) | Simple Oat Muscle / Aveia Simples Muscle | **sim** | leite, repetida com o leite sem tipo |
| [Muscle19](#muscle19) | Plant Power Banana / Proteína Vegetal com Banana | **sim** | sem base |
| Muscle20 | Cacao Yogurt Builder / Iogurte com Cacau | não | — |
| [Wellness01](#wellness01) | Green Balance Smoothie / Smoothie Equilíbrio Verde | **sim** | macros, volume, duro cru |
| [Wellness02](#wellness02) | Kale Pear Refresh / Couve com Pera | **sim** | duro cru |
| [Wellness03](#wellness03) | Cucumber Pineapple Cooler / Pepino com Abacaxi | **sim** | volume |
| [Wellness04](#wellness04) | Tropical Green Glow / Brilho Verde Tropical | **sim** | macros |
| [Wellness05](#wellness05) | Beet Berry Bliss / Beterraba com Frutas Vermelhas | **sim** | volume |
| [Wellness06](#wellness06) | Carrot Orange Sunrise / Cenoura com Laranja | **sim** | duro cru |
| [Wellness07](#wellness07) | Kiwi Spinach Fresh / Kiwi com Espinafre | **sim** | macros |
| [Wellness08](#wellness08) | Cucumber Apple Calm / Pepino com Maçã | **sim** | duro cru |
| [Wellness09](#wellness09) | Kale Blueberry Balance / Couve com Mirtilo | **sim** | duro cru |
| [Wellness10](#wellness10) | Watermelon Yogurt Splash / Melancia com Iogurte | **sim** | volume |
| Wellness11 | Papaya Green Balance / Mamão com Verdes | não | — |
| [Wellness12](#wellness12) | Celery Apple Fresh / Aipo com Maçã | **sim** | volume, duro cru, macros |
| [Wellness13](#wellness13) | Carrot Mango Smooth / Cenoura com Manga | **sim** | duro cru |
| Wellness14 | Beet Orange Vitality / Beterraba com Laranja | não | — |
| [Wellness15](#wellness15) | Pear Spinach Light / Pera com Espinafre | **sim** | duro cru |
| [Wellness16](#wellness16) | Kiwi Cucumber Yogurt / Kiwi com Pepino e Iogurte | **sim** | volume |
| [Wellness17](#wellness17) | Kale Pineapple Fresh / Couve com Abacaxi | **sim** | duro cru, macros |
| [Wellness18](#wellness18) | Strawberry Cucumber Calm / Morango com Pepino | **sim** | volume |
| Wellness19 | Papaya Chia Yogurt / Mamão com Chia e Iogurte | não | — |
| [Wellness20](#wellness20) | Carrot Pineapple Balance / Cenoura com Abacaxi | **sim** | duro cru, volume |
| [Energy01](#energy01) | Fast Fuel Mango Oats / Manga com Aveia Turbo | **sim** | macros, volume |
| [Energy02](#energy02) | Date Banana Fuel / Tâmara com Banana | **sim** | volume, leite |
| [Energy03](#energy03) | Cacao Oat Boost / Cacau com Aveia | **sim** | leite |
| [Energy04](#energy04) | Matcha Morning Energy / Energia Matinal com Matcha | **sim** | leite |
| [Energy05](#energy05) | Tropical Oat Charge / Carga Tropical com Aveia | **sim** | volume |
| [Energy06](#energy06) | Triple Date Power / Força Tripla de Tâmaras | **sim** | leite |
| [Energy07](#energy07) | Espresso Banana Kick / Espresso com Banana | **sim** | leite |
| [Energy08](#energy08) | Maca Mango Rise / Maca com Manga | **sim** | volume, leite |
| [Energy09](#energy09) | Granola Banana Energy / Granola com Banana | **sim** | volume, leite |
| [Energy10](#energy10) | Pineapple Oat Rush / Abacaxi com Aveia | **sim** | volume |
| [Energy11](#energy11) | Cacao Nib Charge / Carga de Nibs de Cacau | **sim** | leite |
| [Energy12](#energy12) | Mango Date Spark / Faísca de Manga com Tâmara | **sim** | volume, leite |
| [Energy13](#energy13) | Matcha Pineapple Zing / Matcha com Abacaxi | **sim** | volume, leite |
| Energy14 | Honey Oat Fuel / Mel com Aveia | não | — |
| Energy15 | Banana PB Charge / Banana com Pasta de Amendoim | não | — |
| [Energy16](#energy16) | Papaya Date Fuel / Mamão com Tâmara | **sim** | volume, leite |
| [Energy17](#energy17) | Mocha Energy Blend / Blend Mocha Energético | **sim** | leite |
| [Energy18](#energy18) | Carrot Orange Spark / Faísca de Cenoura com Laranja → **Blueberry Oat Fuel / Mirtilo com Aveia** | **sim** | repetida, duro cru |
| [Energy19](#energy19) | Date Cacao Oat Power / Força de Tâmara com Cacau e Aveia | **sim** | sem base |
| [Energy20](#energy20) | Coconut Pineapple Energy / Energia de Coco com Abacaxi | **sim** | volume, leite, macros |
| [Recovery01](#recovery01) | Golden Recovery Smoothie / Smoothie Dourado Recovery | **sim** | macros, volume |
| [Recovery02](#recovery02) | Tart Cherry Recovery / Recuperação com Cereja Ácida | **sim** | volume, macros |
| Recovery03 | Golden Turmeric Pineapple / Abacaxi Dourado com Cúrcuma | não | — |
| [Recovery04](#recovery04) | Cherry Protein Recharge / Recarga Proteica com Cereja | **sim** | macros |
| Recovery05 | Ginger Mango Soothe / Gengibre com Manga | não | — |
| Recovery06 | Pomegranate Chia Recovery / Romã com Chia | não | — |
| [Recovery07](#recovery07) | Banana Coconut Recharge / Recarga de Banana com Coco | **sim** | Recovery vegana |
| Recovery08 | Ginger Pineapple Ease / Gengibre com Abacaxi | não | — |
| [Recovery09](#recovery09) | Blueberry Protein Recovery / Recuperação com Mirtilo | **sim** | volume, Recovery vegana |
| [Recovery10](#recovery10) | Beet Cherry Recharge / Recarga de Beterraba com Cereja | **sim** | macros |
| [Recovery11](#recovery11) | Papaya Protein Soothe / Mamão Proteico Calmante | **sim** | volume |
| Recovery12 | Turmeric Banana Calm / Cúrcuma com Banana | não | — |
| Recovery13 | Pomegranate Protein Recharge / Recarga Proteica com Romã | não | — |
| [Recovery14](#recovery14) | Ginger Orange Revive / Gengibre com Laranja | **sim** | Recovery vegana |
| [Recovery15](#recovery15) | Berry Protein Recovery / Recuperação Proteica com Frutas Vermelhas | **sim** | volume |
| [Recovery16](#recovery16) | Golden Pineapple Protein / Proteína Dourada com Abacaxi | **sim** | sem base, Recovery vegana |
| [Recovery17](#recovery17) | Hemp Cherry Recovery / Cânhamo com Cereja | **sim** | macros |
| [Recovery18](#recovery18) | Kiwi Protein Refresh / Kiwi Proteico Refrescante | **sim** | volume |
| [Recovery19](#recovery19) | Beet Orange Recharge / Recarga de Beterraba com Laranja → **Strawberry Protein Recovery / Recuperação Proteica com Morango** | **sim** | repetida |
| Recovery20 | Ginger Pomegranate Soothe / Gengibre com Romã | não | — |
| [WeightLoss01](#weightloss01) | Raspberry Whey Shake / Shake de Whey com Framboesa | **sim** | congelado, leite |
| [WeightLoss02](#weightloss02) | Strawberry Plant Protein / Proteína Vegetal com Morango | **sim** | congelado |
| [WeightLoss03](#weightloss03) | Blueberry Chia Yogurt / Iogurte com Mirtilo e Chia | **sim** | congelado |
| WeightLoss04 | Cocoa Plant Protein Shake / Shake Vegetal de Cacau | não | — |
| [WeightLoss05](#weightloss05) | Peach Cottage Blend / Blend de Cottage com Pêssego | **sim** | congelado, leite |
| WeightLoss06 | Green Kiwi Protein / Proteína Verde com Kiwi | não | — |
| [WeightLoss07](#weightloss07) | Pineapple Whey Refresher / Refresco de Whey com Abacaxi | **sim** | congelado |
| [WeightLoss08](#weightloss08) | Strawberry Oat Yogurt / Iogurte com Morango e Aveia | **sim** | congelado |
| [WeightLoss09](#weightloss09) | Raspberry Egg White Shake / Shake de Clara com Framboesa | **sim** | congelado |
| [WeightLoss10](#weightloss10) | Cherry Almond Whey / Whey com Cereja e Amêndoa | **sim** | congelado |
| [WeightLoss11](#weightloss11) | Pumpkin Yogurt Blend / Blend de Iogurte com Abóbora | **sim** | leite |
| [WeightLoss12](#weightloss12) | Blueberry Tofu Smoothie / Smoothie de Tofu com Mirtilo | **sim** | congelado |
| [WeightLoss13](#weightloss13) | Blackberry Plant Shake / Shake Vegetal de Amora | **sim** | congelado |
| [WeightLoss14](#weightloss14) | Pear Whey Smoothie / Smoothie de Whey com Pera | **sim** | duro cru |
| WeightLoss15 | Pumpkin Plant Protein / Proteína Vegetal com Abóbora | não | — |
| [WeightLoss16](#weightloss16) | Banana Plant Protein / Proteína Vegetal com Banana | **sim** | congelado |
| [WeightLoss17](#weightloss17) | Green Tofu Pineapple / Tofu Verde com Abacaxi | **sim** | congelado |
| [WeightLoss18](#weightloss18) | Cherry Yogurt Blend / Blend de Iogurte com Cereja | **sim** | congelado, leite |
| [WeightLoss19](#weightloss19) | Mango Cottage Blend / Blend de Cottage com Manga | **sim** | congelado |
| [WeightLoss20](#weightloss20) | Peach Flax Yogurt / Iogurte com Pêssego e Linhaça | **sim** | congelado |

### Receitas que ficam iguais (19)

Só o texto neutro dos passos muda. Ingredientes, quantidades, nome e macros ficam como estão: volume ≤ 400 ml, macros dentro de ±10% da soma, sem leite com tipo, sem congelado e sem ingrediente duro.

| id | Nome (en / pt-BR) | Volume (leitor novo) | Declarado (P/C/G/kcal) | Recalculado | contains |
|---|---|---|---|---|---|
| Muscle06 | Cottage Mango Power / Cottage com Manga | 380 ml | 23/49/5/333 | 22,3/51,5/5,2/325 | dairy, animal, added_sugar |
| Muscle10 | Granola Yogurt Power / Iogurte com Granola | 244 ml | 22/35/7/291 | 22,0/33,3/7,5/284 | dairy, animal, nuts, added_sugar |
| Muscle16 | Chocolate Almond Muscle / Chocolate com Amêndoas | 296 ml | 28/23/13/321 | 28,4/21,7/14,1/325 | dairy, nuts |
| Muscle20 | Cacao Yogurt Builder / Iogurte com Cacau | 220 ml | 21/28/5/241 | 21,0/28,2/4,6/222 | dairy, animal, added_sugar |
| Wellness11 | Papaya Green Balance / Mamão com Verdes | 325 ml | 16/23/3/183 | 16,5/22,7/3,4/179 | dairy |
| Wellness14 | Beet Orange Vitality / Beterraba com Laranja | 399 ml | 17/28/3/207 | 17,6/29,8/3,2/208 | dairy |
| Wellness19 | Papaya Chia Yogurt / Mamão com Chia e Iogurte | 305 ml | 18/27/6/234 | 17,6/26,7/6,9/230 | dairy |
| Energy14 | Honey Oat Fuel / Mel com Aveia | 295 ml | 5/53/4/268 | 6,6/53,9/5,7/290 | animal, added_sugar |
| Energy15 | Banana PB Charge / Banana com Pasta de Amendoim | 384 ml | 6/46/11/307 | 7,8/46,6/12,1/312 | nuts |
| Recovery03 | Golden Turmeric Pineapple / Abacaxi Dourado com Cúrcuma | 320 ml | 16/29/3/207 | 16,1/29,6/3,2/201 | dairy |
| Recovery05 | Ginger Mango Soothe / Gengibre com Manga | 320 ml | 16/31/4/224 | 16,3/31,0/3,6/210 | dairy |
| Recovery06 | Pomegranate Chia Recovery / Romã com Chia | 278 ml | 17/28/6/234 | 17,1/26,5/6,9/232 | dairy |
| Recovery08 | Ginger Pineapple Ease / Gengibre com Abacaxi | 320 ml | 16/28/3/203 | 15,9/27,9/3,1/194 | dairy |
| Recovery12 | Turmeric Banana Calm / Cúrcuma com Banana | 273 ml | 16/34/3/227 | 16,5/35,1/3,3/224 | dairy |
| Recovery13 | Pomegranate Protein Recharge / Recarga Proteica com Romã | 348 ml | 25/27/2/226 | 24,1/25,4/2,2/216 | dairy |
| Recovery20 | Ginger Pomegranate Soothe / Gengibre com Romã | 273 ml | 15/23/3/179 | 15,1/21,8/3,2/175 | dairy |
| WeightLoss04 | Cocoa Plant Protein Shake / Shake Vegetal de Cacau | 290 ml | 30/13/7/218 | 30,1/12,8/7,2/218 | — (vegana) |
| WeightLoss06 | Green Kiwi Protein / Proteína Verde com Kiwi | 400 ml | 23/23/3/198 | 22,6/23,2/2,5/198 | — (vegana) |
| WeightLoss15 | Pumpkin Plant Protein / Proteína Vegetal com Abóbora | 400 ml | 24/13/5/186 | 23,6/13,2/5,1/186 | nuts |

Conferência: 81 que mudam + 19 iguais = 100 receitas.

## Detalhe das receitas que mudam

Em cada receita: os problemas, o ANTES (ingredientes, passos, macros declarados, recalculados e volume) e o DEPOIS (ingredientes com a conta de cada um, passos, macros a declarar, volume no leitor novo e marcação `contains`, derivada pelo `validateRecipeRestrictions` do backend). "Xícara cheia" é a conta física, com xícara = 236,6 ml, só para referência.

### Muscle

<a id="muscle01"></a>
#### Muscle01 — Power Protein Blend / Blend Power Protein

**Problemas:** macros declarados errados (receita original).

**Justificativa:** Ingredientes e volume ficam; só os macros passam a ser a soma real (38 g → 25 g de proteína; 420 → 252 kcal).

**ANTES** · declarado P38 C26 G18 · 420 kcal · recalculado P25,0 C30,3 G4,9 · 252 kcal · volume 398 ml (xícara cheia 398 ml) · contains dairy, nuts

| en | pt-BR |
|---|---|
| 1 scoop Whey protein | 1 dose Whey protein |
| 1 medium Banana | 1 unidade média Banana |
| 250ml Almond milk | 250ml Leite de amêndoas |

1. Add the whey protein and banana to the BLENDi cup.<br>Adicione whey protein e banana ao copo do BLENDi.
2. Add the almond milk and close the lid.<br>Acrescente leite de amêndoas e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

**DEPOIS** · declarar **P25 C30 G5 · 252 kcal** · volume **398 ml** no leitor novo (xícara cheia 398 ml) · contains **dairy, nuts**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop Whey protein | 1 dose Whey protein | 30,0 | 22,5 | 2,4 | 1,5 | 114 | B: Whey protein concentrate |
| 1 medium Banana | 1 unidade média Banana | 118,0 | 1,3 | 27,1 | 0,4 | 105 | B: Ripe banana (fibra U 09040) |
| 250ml Almond milk | 250ml Leite de amêndoas | 250,0 | 1,2 | 0,8 | 3,0 | 32 | B: Unsweetened almond milk |
| **Total** | | | **25,0** | **30,3** | **4,9** | **252** | 4/4/9: 265 kcal |

1. Add the whey protein and banana to the cup.<br>Adicione whey protein e banana ao copo.
2. Add the almond milk and close the lid.<br>Acrescente leite de amêndoas e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

<a id="muscle02"></a>
#### Muscle02 — Chocolate PB Power / Power Chocolate com Amendoim

**Problemas:** leite com tipo (integral).

**Justificativa:** "Whole milk" vira "Milk"; macros com a referência única.

**ANTES** · declarado P38 C21 G19 · 407 kcal · recalculado P36,1 C20,0 G20,3 · 391 kcal · volume 346 ml (xícara cheia 345 ml) · contains dairy, nuts

| en | pt-BR |
|---|---|
| 1 scoop Chocolate whey protein | 1 dose Whey protein sabor chocolate |
| 1 tbsp Peanut butter | 1 colher(es) de sopa Pasta de amendoim |
| 300ml Whole milk | 300ml Leite integral |

1. Add the chocolate whey protein and peanut butter to the BLENDi cup.<br>Adicione whey protein sabor chocolate e pasta de amendoim ao copo do BLENDi.
2. Add the whole milk and close the lid.<br>Acrescente leite integral e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

**DEPOIS** · declarar **P36 C20 G15 · 358 kcal** · volume **346 ml** no leitor novo (xícara cheia 345 ml) · contains **dairy, nuts**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop Chocolate whey protein | 1 dose Whey protein sabor chocolate | 30,0 | 22,5 | 2,4 | 1,5 | 114 | B: Whey protein concentrate |
| 1 tbsp Peanut butter | 1 colher(es) de sopa Pasta de amendoim | 16,0 | 4,0 | 3,2 | 8,0 | 94 | B: Peanut butter |
| 300ml Milk | 300ml Leite | 300,0 | 9,9 | 14,4 | 5,9 | 150 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **36,4** | **20,0** | **15,4** | **358** | 4/4/9: 365 kcal |

1. Add the chocolate whey protein and peanut butter to the cup.<br>Adicione whey protein sabor chocolate e pasta de amendoim ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

<a id="muscle03"></a>
#### Muscle03 — Berry Protein Yogurt / Iogurte Proteico com Frutas Vermelhas

**Problemas:** volume acima de 400 ml.

**Justificativa:** Frutas de 1 para 3/4 de xícara; o iogurte (a proteína) fica.

**ANTES** · declarado P26 C42 G6 · 326 kcal · recalculado P26,4 C42,6 G5,4 · 312 kcal · volume 407 ml (xícara cheia 501 ml) · contains dairy, animal, added_sugar

| en | pt-BR |
|---|---|
| 250g Greek yogurt | 250g Iogurte grego |
| 1 cup Mixed berries | 1 xícara Mix de frutas vermelhas |
| 1 tbsp Honey | 1 colher(es) de sopa Mel |

1. Add the greek yogurt and mixed berries to the BLENDi cup.<br>Adicione iogurte grego e mix de frutas vermelhas ao copo do BLENDi.
2. Add the honey and close the lid.<br>Acrescente mel e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

**DEPOIS** · declarar **P26 C39 G5 · 295 kcal** · volume **371 ml** no leitor novo (xícara cheia 442 ml) · contains **dairy, animal, added_sugar**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 250g Greek yogurt | 250g Iogurte grego | 250,0 | 24,9 | 9,8 | 4,8 | 182 | U 01287 Yogurt, Greek, plain, lowfat (referência única do "Iogurte grego") |
| 3/4 cup Mixed berries | 3/4 xícara Mix de frutas vermelhas | 106,5 | 1,1 | 11,6 | 0,5 | 49 | média de morango, mirtilo, framboesa e amora (mesmas fontes) |
| 1 tbsp Honey | 1 colher(es) de sopa Mel | 21,0 | 0,1 | 17,2 | 0,0 | 64 | B: Honey |
| **Total** | | | **26,0** | **38,7** | **5,3** | **295** | 4/4/9: 306 kcal |

1. Add the greek yogurt and mixed berries to the cup.<br>Adicione iogurte grego e mix de frutas vermelhas ao copo.
2. Add the honey and close the lid.<br>Acrescente mel e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

<a id="muscle04"></a>
#### Muscle04 — Tropical Protein Blend / Blend Proteico Tropical

**Problemas:** macros declarados fora de ±10% (gordura).

**Justificativa:** Só os macros mudam (gordura do leite de coco light pela referência).

**ANTES** · declarado P26 C28 G10 · 306 kcal · recalculado P25,4 C26,0 G13,7 · 316 kcal · volume 395 ml (xícara cheia 467 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 scoop Whey protein | 1 dose Whey protein |
| 1 cup Pineapple | 1 xícara Abacaxi |
| 200ml Light coconut milk | 200ml Leite de coco light |

1. Add the whey protein and pineapple to the BLENDi cup.<br>Adicione whey protein e abacaxi ao copo do BLENDi.
2. Add the light coconut milk and close the lid.<br>Acrescente leite de coco light e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

**DEPOIS** · declarar **P25 C26 G14 · 317 kcal** · volume **395 ml** no leitor novo (xícara cheia 467 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop Whey protein | 1 dose Whey protein | 30,0 | 22,5 | 2,4 | 1,5 | 114 | B: Whey protein concentrate |
| 1 cup Pineapple | 1 xícara Abacaxi | 165,0 | 0,9 | 21,6 | 0,2 | 82 | U 09266 Pineapple |
| 200ml Light coconut milk | 200ml Leite de coco light | 200,0 | 2,0 | 2,0 | 12,0 | 120 | FDC 2082068 Light coconut milk (HT Traders) |
| **Total** | | | **25,4** | **26,0** | **13,7** | **316** | 4/4/9: 329 kcal |

1. Add the whey protein and pineapple to the cup.<br>Adicione whey protein e abacaxi ao copo.
2. Add the light coconut milk and close the lid.<br>Acrescente leite de coco light e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

<a id="muscle05"></a>
#### Muscle05 — Oats Almond Bulk / Aveia com Pasta de Amêndoas

**Problemas:** leite com tipo (integral).

**Justificativa:** "Whole milk" vira "Milk".

**ANTES** · declarado P21 C47 G30 · 542 kcal · recalculado P21,7 C47,6 G31,2 · 531 kcal · volume 372 ml (xícara cheia 370 ml) · contains dairy, nuts

| en | pt-BR |
|---|---|
| 40g Oats | 40g Aveia |
| 2 tbsp Almond butter | 2 colher(es) de sopa Pasta de amêndoas |
| 300ml Whole milk | 300ml Leite integral |

1. Add the oats and almond butter to the BLENDi cup.<br>Adicione aveia e pasta de amêndoas ao copo do BLENDi.
2. Add the whole milk and close the lid.<br>Acrescente leite integral e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

**DEPOIS** · declarar **P22 C48 G26 · 498 kcal** · volume **372 ml** no leitor novo (xícara cheia 370 ml) · contains **dairy, nuts**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 40g Oats | 40g Aveia | 40,0 | 5,4 | 27,2 | 2,6 | 152 | B: Rolled oats |
| 2 tbsp Almond butter | 2 colher(es) de sopa Pasta de amêndoas | 32,0 | 6,7 | 6,0 | 17,8 | 196 | U 12195 Almond butter |
| 300ml Milk | 300ml Leite | 300,0 | 9,9 | 14,4 | 5,9 | 150 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **22,0** | **47,6** | **26,3** | **498** | 4/4/9: 515 kcal |

1. Add the oats and almond butter to the cup.<br>Adicione aveia e pasta de amêndoas ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

<a id="muscle07"></a>
#### Muscle07 — Double Chocolate Muscle / Duplo Chocolate Muscle

**Problemas:** sem base (vira pasta).

**Justificativa:** Ganha 200 ml de leite como base; cabe em 353 ml.

**ANTES** · declarado P26 C34 G3 · 267 kcal · recalculado P24,9 C32,7 G2,6 · 231 kcal · volume 153 ml (xícara cheia 163 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 scoop Chocolate whey protein | 1 dose Whey protein sabor chocolate |
| 1 tbsp Cacao powder | 1 colher(es) de sopa Cacau em pó |
| 1 medium Banana | 1 unidade média Banana |

1. Add the chocolate whey protein and cacao powder to the BLENDi cup.<br>Adicione whey protein sabor chocolate e cacau em pó ao copo do BLENDi.
2. Add the banana and close the lid.<br>Acrescente banana e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

**DEPOIS** · declarar **P31 C42 G7 · 331 kcal** · volume **353 ml** no leitor novo (xícara cheia 363 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop Chocolate whey protein | 1 dose Whey protein sabor chocolate | 30,0 | 22,5 | 2,4 | 1,5 | 114 | B: Whey protein concentrate |
| 1 tbsp Cacao powder | 1 colher(es) de sopa Cacau em pó | 5,4 | 1,1 | 3,1 | 0,7 | 12 | U 19165 Cocoa, dry powder, unsweetened |
| 1 medium Banana | 1 unidade média Banana | 118,0 | 1,3 | 27,1 | 0,4 | 105 | B: Ripe banana (fibra U 09040) |
| 200ml Milk | 200ml Leite | 200,0 | 6,6 | 9,6 | 4,0 | 100 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **31,5** | **42,3** | **6,6** | **331** | 4/4/9: 354 kcal |

1. Add the chocolate whey protein, cacao powder and banana to the cup.<br>Adicione whey protein sabor chocolate, cacau em pó e banana ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

<a id="muscle08"></a>
#### Muscle08 — Tofu Berry Builder / Tofu com Frutas Vermelhas

**Problemas:** volume acima de 400 ml; congelado; pouca proteína para Muscle.

**Justificativa:** Frutas frescas (3/4 de xícara), 1 dose de proteína vegetal e bebida de soja no lugar de 250 ml de leite de aveia: de 14 g para 35 g de proteína, vegana, dentro do copo.

**ANTES** · declarado P12 C34 G7 · 247 kcal · recalculado P14,3 C35,4 G8,4 · 271 kcal · volume 542 ml (xícara cheia 637 ml) · contains — (vegana)

| en | pt-BR |
|---|---|
| 150g Silken tofu | 150g Tofu macio |
| 1 cup Frozen mixed berries | 1 xícara Mix de frutas vermelhas congeladas |
| 250ml Oat milk | 250ml Leite de aveia |

1. Add the silken tofu and frozen mixed berries to the BLENDi cup.<br>Adicione tofu macio e mix de frutas vermelhas congeladas ao copo do BLENDi.
2. Add the oat milk and close the lid.<br>Acrescente leite de aveia e feche a tampa.
3. Pulse 8 times to break down the frozen pieces, then blend on high for 15 seconds until smooth.<br>Pulse 8 vezes para quebrar os pedaços congelados, depois bata em velocidade alta por 15 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

**DEPOIS** · declarar **P35 C20 G8 · 287 kcal** · volume **387 ml** no leitor novo (xícara cheia 457 ml) · contains **— (vegana)**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 150g Silken tofu | 150g Tofu macio | 150,0 | 10,3 | 3,6 | 4,0 | 93 | U 16162 Tofu, silken, firm |
| 1 scoop Plant protein powder | 1 dose Proteína vegetal em pó | 30,0 | 21,0 | 2,7 | 1,8 | 112 | B: Plant protein powder |
| 3/4 cup Mixed berries | 3/4 xícara Mix de frutas vermelhas | 106,5 | 1,1 | 11,6 | 0,5 | 49 | média de morango, mirtilo, framboesa e amora (mesmas fontes) |
| 100ml Unsweetened soy milk | 100ml Bebida de soja sem açúcar | 100,0 | 2,9 | 1,7 | 1,6 | 33 | U 16222 Soymilk, unsweetened |
| **Total** | | | **35,3** | **19,7** | **7,9** | **287** | 4/4/9: 291 kcal |

1. Add the silken tofu, plant protein powder and mixed berries to the cup.<br>Adicione tofu macio, proteína vegetal em pó e mix de frutas vermelhas ao copo.
2. Add the unsweetened soy milk and close the lid.<br>Acrescente bebida de soja sem açúcar e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

<a id="muscle09"></a>
#### Muscle09 — Classic Oat Protein / Proteína Clássica com Aveia

**Problemas:** leite com tipo (low-fat → "desnatado" no pt-BR).

**Justificativa:** "Low-fat milk"/"Leite desnatado" vira "Milk"/"Leite".

**ANTES** · declarado P36 C35 G6 · 338 kcal · recalculado P35,0 C35,3 G5,9 · 333 kcal · volume 310 ml (xícara cheia 310 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 scoop Whey protein | 1 dose Whey protein |
| 30g Oats | 30g Aveia |
| 250ml Low-fat milk | 250ml Leite desnatado |

1. Add the whey protein and oats to the BLENDi cup.<br>Adicione whey protein e aveia ao copo do BLENDi.
2. Add the low-fat milk and close the lid.<br>Acrescente leite desnatado e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

**DEPOIS** · declarar **P35 C35 G8 · 353 kcal** · volume **310 ml** no leitor novo (xícara cheia 310 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop Whey protein | 1 dose Whey protein | 30,0 | 22,5 | 2,4 | 1,5 | 114 | B: Whey protein concentrate |
| 30g Oats | 30g Aveia | 30,0 | 4,0 | 20,4 | 1,9 | 114 | B: Rolled oats |
| 250ml Milk | 250ml Leite | 250,0 | 8,2 | 12,0 | 5,0 | 125 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **34,8** | **34,8** | **8,4** | **353** | 4/4/9: 354 kcal |

1. Add the whey protein and oats to the cup.<br>Adicione whey protein e aveia ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

<a id="muscle11"></a>
#### Muscle11 — Creamy Avocado Protein / Proteína Cremosa com Abacate

**Problemas:** leite com tipo (low-fat → "desnatado" no pt-BR).

**Justificativa:** "Low-fat milk" vira "Milk".

**ANTES** · declarado P33 C19 G12 · 316 kcal · recalculado P31,9 C19,1 G11,5 · 299 kcal · volume 330 ml (xícara cheia 330 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 scoop Whey protein | 1 dose Whey protein |
| 1/4 fruit Avocado | 1/4 fruta Abacate |
| 250ml Low-fat milk | 250ml Leite desnatado |

1. Add the whey protein and avocado to the BLENDi cup.<br>Adicione whey protein e abacate ao copo do BLENDi.
2. Add the low-fat milk and close the lid.<br>Acrescente leite desnatado e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

**DEPOIS** · declarar **P32 C19 G14 · 319 kcal** · volume **330 ml** no leitor novo (xícara cheia 330 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop Whey protein | 1 dose Whey protein | 30,0 | 22,5 | 2,4 | 1,5 | 114 | B: Whey protein concentrate |
| 1/4 fruit Avocado | 1/4 fruta Abacate | 50,2 | 1,0 | 4,3 | 7,5 | 80 | B: Avocado (fibra U 09037) |
| 250ml Milk | 250ml Leite | 250,0 | 8,2 | 12,0 | 5,0 | 125 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **31,8** | **18,7** | **14,0** | **319** | 4/4/9: 328 kcal |

1. Add the whey protein and avocado to the cup.<br>Adicione whey protein e abacate ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

<a id="muscle12"></a>
#### Muscle12 — PB Banana Builder / Amendoim com Banana

**Problemas:** leite com tipo (integral); macros fora de ±10% (gordura); "pasta de amendoim proteica" sem referência de macros.

**Justificativa:** Pasta de amendoim comum (tem referência na tabela do backend; a "proteica" muda de marca para marca) e "Milk".

**ANTES** · declarado P19 C43 G20 · 428 kcal · recalculado P17,3 C45,5 G25,4 · 446 kcal · volume 400 ml (xícara cheia 398 ml) · contains dairy, nuts

| en | pt-BR |
|---|---|
| 2 tbsp Protein peanut butter | 2 colher(es) de sopa Pasta de amendoim proteica |
| 1 medium Banana | 1 unidade média Banana |
| 250ml Whole milk | 250ml Leite integral |

1. Add the protein peanut butter and banana to the BLENDi cup.<br>Adicione pasta de amendoim proteica e banana ao copo do BLENDi.
2. Add the whole milk and close the lid.<br>Acrescente leite integral e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

**DEPOIS** · declarar **P18 C46 G21 · 418 kcal** · volume **400 ml** no leitor novo (xícara cheia 398 ml) · contains **dairy, nuts**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 2 tbsp Peanut butter | 2 colher(es) de sopa Pasta de amendoim | 32,0 | 8,0 | 6,4 | 16,0 | 188 | B: Peanut butter |
| 1 medium Banana | 1 unidade média Banana | 118,0 | 1,3 | 27,1 | 0,4 | 105 | B: Ripe banana (fibra U 09040) |
| 250ml Milk | 250ml Leite | 250,0 | 8,2 | 12,0 | 5,0 | 125 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **17,5** | **45,5** | **21,3** | **418** | 4/4/9: 444 kcal |

1. Add the peanut butter and banana to the cup.<br>Adicione pasta de amendoim e banana ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

<a id="muscle13"></a>
#### Muscle13 — Hemp Banana Bulk / Cânhamo com Banana

**Problemas:** congelado; pouca proteína para Muscle.

**Justificativa:** Banana fresca, 1 dose de proteína vegetal e 30 ml a menos de leite de aveia: de 10 g para 31 g de proteína, continua vegana.

**ANTES** · declarado P8 C45 G11 · 311 kcal · recalculado P10,1 C45,1 G13,9 · 328 kcal · volume 398 ml (xícara cheia 398 ml) · contains — (vegana)

| en | pt-BR |
|---|---|
| 2 tbsp Hemp seeds | 2 colher(es) de sopa Semente de cânhamo |
| 1 Frozen banana | 1 unidade Banana congelada |
| 250ml Oat milk | 250ml Leite de aveia |

1. Add the hemp seeds and frozen banana to the BLENDi cup.<br>Adicione semente de cânhamo e banana congelada ao copo do BLENDi.
2. Add the oat milk and close the lid.<br>Acrescente leite de aveia e feche a tampa.
3. Pulse 8 times to break down the frozen pieces, then blend on high for 15 seconds until smooth.<br>Pulse 8 vezes para quebrar os pedaços congelados, depois bata em velocidade alta por 15 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

**DEPOIS** · declarar **P31 C46 G15 · 427 kcal** · volume **398 ml** no leitor novo (xícara cheia 398 ml) · contains **— (vegana)**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 2 tbsp Hemp seeds | 2 colher(es) de sopa Semente de cânhamo | 20,0 | 6,3 | 1,7 | 9,8 | 111 | U 12012 Hemp seed, hulled |
| 1 medium Banana | 1 unidade média Banana | 118,0 | 1,3 | 27,1 | 0,4 | 105 | B: Ripe banana (fibra U 09040) |
| 1 scoop Plant protein powder | 1 dose Proteína vegetal em pó | 30,0 | 21,0 | 2,7 | 1,8 | 112 | B: Plant protein powder |
| 220ml Oat milk | 220ml Leite de aveia | 220,0 | 2,2 | 14,3 | 3,3 | 99 | B: Oat milk |
| **Total** | | | **30,8** | **45,9** | **15,2** | **427** | 4/4/9: 444 kcal |

1. Add the hemp seeds, banana and plant protein powder to the cup.<br>Adicione semente de cânhamo, banana e proteína vegetal em pó ao copo.
2. Add the oat milk and close the lid.<br>Acrescente leite de aveia e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

<a id="muscle14"></a>
#### Muscle14 — Date Sweet Protein / Proteína Adocicada com Tâmaras

**Problemas:** leite com tipo (integral).

**Justificativa:** "Whole milk" vira "Milk".

**ANTES** · declarado P33 C47 G10 · 410 kcal · recalculado P31,4 C50,4 G10,6 · 399 kcal · volume 328 ml (xícara cheia 328 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 scoop Whey protein | 1 dose Whey protein |
| 2 Dates | 2 Tâmaras |
| 250ml Whole milk | 250ml Leite integral |

1. Add the whey protein and dates to the BLENDi cup.<br>Adicione whey protein e tâmaras ao copo do BLENDi.
2. Add the whole milk and close the lid.<br>Acrescente leite integral e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

**DEPOIS** · declarar **P32 C50 G7 · 372 kcal** · volume **328 ml** no leitor novo (xícara cheia 328 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop Whey protein | 1 dose Whey protein | 30,0 | 22,5 | 2,4 | 1,5 | 114 | B: Whey protein concentrate |
| 2 Dates | 2 Tâmaras | 48,0 | 0,9 | 36,0 | 0,1 | 133 | U 09421 Dates, medjool |
| 250ml Milk | 250ml Leite | 250,0 | 8,2 | 12,0 | 5,0 | 125 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **31,6** | **50,4** | **6,5** | **372** | 4/4/9: 387 kcal |

1. Add the whey protein and dates to the cup.<br>Adicione whey protein e tâmaras ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

<a id="muscle15"></a>
#### Muscle15 — Cottage Pineapple Coconut / Cottage com Abacaxi e Coco

**Problemas:** macros declarados fora de ±10% (gordura).

**Justificativa:** Só os macros mudam.

**ANTES** · declarado P18 C29 G5 · 233 kcal · recalculado P16,9 C30,0 G7,0 · 239 kcal · volume 330 ml (xícara cheia 401 ml) · contains dairy

| en | pt-BR |
|---|---|
| 150g Cottage cheese | 150g Cottage |
| 1 cup Pineapple | 1 xícara Abacaxi |
| 1 tbsp Coconut flakes | 1 colher(es) de sopa Coco em flocos |

1. Add the cottage cheese and pineapple to the BLENDi cup.<br>Adicione cottage e abacaxi ao copo do BLENDi.
2. Add the coconut flakes and close the lid.<br>Acrescente coco em flocos e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

**DEPOIS** · declarar **P17 C30 G7 · 239 kcal** · volume **330 ml** no leitor novo (xícara cheia 401 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 150g Cottage cheese | 150g Cottage | 150,0 | 15,7 | 7,1 | 3,4 | 122 | U 01015 Cottage cheese, lowfat 2% (referência única do "Cottage") |
| 1 cup Pineapple | 1 xícara Abacaxi | 165,0 | 0,9 | 21,6 | 0,2 | 82 | U 09266 Pineapple |
| 1 tbsp Coconut flakes | 1 colher(es) de sopa Coco em flocos | 5,3 | 0,4 | 1,3 | 3,4 | 35 | U 12108 Coconut, desiccated, not sweetened |
| **Total** | | | **16,9** | **30,0** | **7,0** | **239** | 4/4/9: 251 kcal |

1. Add the cottage cheese and pineapple to the cup.<br>Adicione cottage e abacaxi ao copo.
2. Add the coconut flakes and close the lid.<br>Acrescente coco em flocos e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

<a id="muscle17"></a>
#### Muscle17 — Mango Chia Protein / Proteína com Manga e Chia

**Problemas:** congelado.

**Justificativa:** Manga fresca no lugar da congelada; sai o passo de pulsar.

**ANTES** · declarado P23 C38 G8 · 316 kcal · recalculado P23,2 C37,7 G8,2 · 303 kcal · volume 375 ml (xícara cheia 451 ml) · contains dairy

| en | pt-BR |
|---|---|
| 200g Greek yogurt | 200g Iogurte grego |
| 1 cup Frozen mango chunks | 1 xícara Pedaços de manga congelada |
| 1 tbsp Chia seeds | 1 colher(es) de sopa Semente de chia |

1. Add the greek yogurt and frozen mango chunks to the BLENDi cup.<br>Adicione iogurte grego e pedaços de manga congelada ao copo do BLENDi.
2. Add the chia seeds and close the lid.<br>Acrescente semente de chia e feche a tampa.
3. Pulse 8 times to break down the frozen pieces, then blend on high for 15 seconds until smooth.<br>Pulse 8 vezes para quebrar os pedaços congelados, depois bata em velocidade alta por 15 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

**DEPOIS** · declarar **P23 C38 G8 · 303 kcal** · volume **375 ml** no leitor novo (xícara cheia 451 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 200g Greek yogurt | 200g Iogurte grego | 200,0 | 19,9 | 7,9 | 3,8 | 146 | U 01287 Yogurt, Greek, plain, lowfat (referência única do "Iogurte grego") |
| 1 cup Mango | 1 xícara Manga | 165,0 | 1,3 | 24,8 | 0,7 | 99 | B: Mango |
| 1 tbsp Chia seeds | 1 colher(es) de sopa Semente de chia | 12,0 | 2,0 | 5,1 | 3,7 | 58 | U 12006 Chia seeds |
| **Total** | | | **23,2** | **37,7** | **8,2** | **303** | 4/4/9: 317 kcal |

1. Add the greek yogurt and mango to the cup.<br>Adicione iogurte grego e manga ao copo.
2. Add the chia seeds and close the lid.<br>Acrescente semente de chia e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

<a id="muscle18"></a>
#### Muscle18 — Simple Oat Muscle / Aveia Simples Muscle

**Problemas:** leite com tipo (integral); fica igual à Muscle09 quando o leite vira "Milk".

**Justificativa:** Com o leite sem tipo, ficaria idêntica à Muscle09 (whey + 30 g de aveia + 250 ml de leite). Ganha meia banana e 10 g de aveia, com 200 ml de leite: continua "simples de aveia".

**ANTES** · declarado P36 C35 G11 · 383 kcal · recalculado P34,5 C34,8 G12,4 · 380 kcal · volume 310 ml (xícara cheia 310 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 scoop Whey protein | 1 dose Whey protein |
| 30g Oats | 30g Aveia |
| 250ml Whole milk | 250ml Leite integral |

1. Add the whey protein and oats to the BLENDi cup.<br>Adicione whey protein e aveia ao copo do BLENDi.
2. Add the whole milk and close the lid.<br>Acrescente leite integral e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

**DEPOIS** · declarar **P35 C53 G8 · 418 kcal** · volume **329 ml** no leitor novo (xícara cheia 329 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop Whey protein | 1 dose Whey protein | 30,0 | 22,5 | 2,4 | 1,5 | 114 | B: Whey protein concentrate |
| 40g Oats | 40g Aveia | 40,0 | 5,4 | 27,2 | 2,6 | 152 | B: Rolled oats |
| 1/2 Banana | 1/2 Banana | 59,0 | 0,6 | 13,6 | 0,2 | 53 | B: Ripe banana (fibra U 09040) |
| 200ml Milk | 200ml Leite | 200,0 | 6,6 | 9,6 | 4,0 | 100 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **35,1** | **52,8** | **8,2** | **418** | 4/4/9: 426 kcal |

1. Add the whey protein, oats and banana to the cup.<br>Adicione whey protein, aveia e banana ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

<a id="muscle19"></a>
#### Muscle19 — Plant Power Banana / Proteína Vegetal com Banana

**Problemas:** sem base (vira pasta).

**Justificativa:** Ganha 230 ml de bebida de soja como base; continua vegana.

**ANTES** · declarado P25 C34 G10 · 326 kcal · recalculado P26,3 C33,0 G10,2 · 312 kcal · volume 164 ml (xícara cheia 163 ml) · contains nuts

| en | pt-BR |
|---|---|
| 1 scoop Plant protein powder | 1 dose Proteína vegetal em pó |
| 1 tbsp Peanut butter | 1 colher(es) de sopa Pasta de amendoim |
| 1 medium Banana | 1 unidade média Banana |

1. Add the plant protein powder and peanut butter to the BLENDi cup.<br>Adicione proteína vegetal em pó e pasta de amendoim ao copo do BLENDi.
2. Add the banana and close the lid.<br>Acrescente banana e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

**DEPOIS** · declarar **P33 C37 G14 · 388 kcal** · volume **394 ml** no leitor novo (xícara cheia 393 ml) · contains **nuts**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop Plant protein powder | 1 dose Proteína vegetal em pó | 30,0 | 21,0 | 2,7 | 1,8 | 112 | B: Plant protein powder |
| 1 tbsp Peanut butter | 1 colher(es) de sopa Pasta de amendoim | 16,0 | 4,0 | 3,2 | 8,0 | 94 | B: Peanut butter |
| 1 medium Banana | 1 unidade média Banana | 118,0 | 1,3 | 27,1 | 0,4 | 105 | B: Ripe banana (fibra U 09040) |
| 230ml Unsweetened soy milk | 230ml Bebida de soja sem açúcar | 230,0 | 6,6 | 4,0 | 3,7 | 76 | U 16222 Soymilk, unsweetened |
| **Total** | | | **32,9** | **37,0** | **13,9** | **388** | 4/4/9: 404 kcal |

1. Add the plant protein powder, peanut butter and banana to the cup.<br>Adicione proteína vegetal em pó, pasta de amendoim e banana ao copo.
2. Add the unsweetened soy milk and close the lid.<br>Acrescente bebida de soja sem açúcar e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your muscle blend.<br>Sirva imediatamente e aproveite seu blend de ganho de massa.

### Wellness

<a id="wellness01"></a>
#### Wellness01 — Green Balance Smoothie / Smoothie Equilíbrio Verde

**Problemas:** macros declarados errados (receita original); volume acima de 400 ml; maçã crua inteira.

**Justificativa:** Iogurte de 200 para 150 g, maçã cortada em pedaços pequenos e macros pela soma real.

**ANTES** · declarado P18 C24 G10 · 260 kcal · recalculado P21,5 C31,7 G4,3 · 250 kcal · volume 412 ml (xícara cheia 397 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 handful Spinach | 1 punhado Espinafre |
| 200g Greek yogurt | 200g Iogurte grego |
| 1 medium Green apple | 1 unidade média Maçã verde |

1. Add the spinach and greek yogurt to the BLENDi cup.<br>Adicione espinafre e iogurte grego ao copo do BLENDi.
2. Add the green apple and close the lid.<br>Acrescente maçã verde e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

**DEPOIS** · declarar **P17 C32 G3 · 222 kcal** · volume **362 ml** no leitor novo (xícara cheia 362 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 handful Spinach | 1 punhado Espinafre | 30,0 | 0,9 | 1,1 | 0,1 | 7 | B: Raw spinach |
| 150g Greek yogurt | 150g Iogurte grego | 150,0 | 14,9 | 5,9 | 2,9 | 110 | U 01287 Yogurt, Greek, plain, lowfat (referência única do "Iogurte grego") |
| 1 medium Green apple | 1 unidade média Maçã verde | 182,0 | 0,8 | 24,8 | 0,3 | 106 | U 09502 Apples, granny smith |
| **Total** | | | **16,6** | **31,8** | **3,3** | **222** | 4/4/9: 224 kcal |

1. Cut the green apple into small pieces. Add the spinach and greek yogurt to the cup.<br>Corte a maçã verde em pedaços pequenos. Adicione espinafre e iogurte grego ao copo.
2. Add the green apple and close the lid.<br>Acrescente maçã verde e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

<a id="wellness02"></a>
#### Wellness02 — Kale Pear Refresh / Couve com Pera

**Problemas:** couve e pera inteiras.

**Justificativa:** Só os passos: tirar o talo da couve e cortar a pera.

**ANTES** · declarado P16 C35 G3 · 231 kcal · recalculado P16,4 C34,3 G3,6 · 221 kcal · volume 358 ml (xícara cheia 358 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 handful Kale | 1 punhado Couve |
| 1 medium Pear | 1 unidade média Pera |
| 150g Greek yogurt | 150g Iogurte grego |

1. Add the kale and pear to the BLENDi cup.<br>Adicione couve e pera ao copo do BLENDi.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

**DEPOIS** · declarar **P16 C34 G4 · 221 kcal** · volume **358 ml** no leitor novo (xícara cheia 358 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 handful Kale | 1 punhado Couve | 30,0 | 0,9 | 1,3 | 0,4 | 10 | U 11233 Kale, raw |
| 1 medium Pear | 1 unidade média Pera | 178,0 | 0,6 | 27,1 | 0,2 | 101 | U 09252 Pears |
| 150g Greek yogurt | 150g Iogurte grego | 150,0 | 14,9 | 5,9 | 2,9 | 110 | U 01287 Yogurt, Greek, plain, lowfat (referência única do "Iogurte grego") |
| **Total** | | | **16,4** | **34,3** | **3,6** | **221** | 4/4/9: 235 kcal |

1. Remove the kale stems and tear the leaves into small pieces. Cut the pear into small pieces, without the core. Add the kale and pear to the cup.<br>Tire o talo da couve e rasgue as folhas em pedaços pequenos. Corte a pera em pedaços pequenos, sem o miolo. Adicione couve e pera ao copo.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

<a id="wellness03"></a>
#### Wellness03 — Cucumber Pineapple Cooler / Pepino com Abacaxi

**Problemas:** volume acima de 400 ml.

**Justificativa:** Abacaxi de 1 para 3/4 de xícara.

**ANTES** · declarado P16 C30 G3 · 211 kcal · recalculado P16,2 C29,4 G3,1 · 200 kcal · volume 433 ml (xícara cheia 505 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1/2 cup Cucumber | 1/2 xícara Pepino |
| 1 cup Pineapple | 1 xícara Abacaxi |
| 150g Greek yogurt | 150g Iogurte grego |

1. Add the cucumber and pineapple to the BLENDi cup.<br>Adicione pepino e abacaxi ao copo do BLENDi.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

**DEPOIS** · declarar **P16 C24 G3 · 179 kcal** · volume **392 ml** no leitor novo (xícara cheia 446 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1/2 cup Cucumber | 1/2 xícara Pepino | 52,0 | 0,3 | 1,9 | 0,1 | 8 | U 11205 Cucumber, with peel |
| 3/4 cup Pineapple | 3/4 xícara Abacaxi | 123,8 | 0,7 | 16,2 | 0,1 | 62 | U 09266 Pineapple |
| 150g Greek yogurt | 150g Iogurte grego | 150,0 | 14,9 | 5,9 | 2,9 | 110 | U 01287 Yogurt, Greek, plain, lowfat (referência única do "Iogurte grego") |
| **Total** | | | **15,9** | **24,0** | **3,1** | **179** | 4/4/9: 188 kcal |

1. Add the cucumber and pineapple to the cup.<br>Adicione pepino e abacaxi ao copo.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

<a id="wellness04"></a>
#### Wellness04 — Tropical Green Glow / Brilho Verde Tropical

**Problemas:** macros declarados fora de ±10% (gordura, kcal).

**Justificativa:** Só os macros mudam.

**ANTES** · declarado P9 C35 G6 · 230 kcal · recalculado P9,8 C35,4 G2,8 · 192 kcal · volume 395 ml (xícara cheia 467 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 handful Spinach | 1 punhado Espinafre |
| 1 cup Mango | 1 xícara Manga |
| 200ml Milk kefir | 200ml Kefir de leite |

1. Add the spinach and mango to the BLENDi cup.<br>Adicione espinafre e manga ao copo do BLENDi.
2. Add the milk kefir and close the lid.<br>Acrescente kefir de leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

**DEPOIS** · declarar **P10 C35 G3 · 192 kcal** · volume **395 ml** no leitor novo (xícara cheia 467 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 handful Spinach | 1 punhado Espinafre | 30,0 | 0,9 | 1,1 | 0,1 | 7 | B: Raw spinach |
| 1 cup Mango | 1 xícara Manga | 165,0 | 1,3 | 24,8 | 0,7 | 99 | B: Mango |
| 200ml Milk kefir | 200ml Kefir de leite | 200,0 | 7,6 | 9,5 | 2,0 | 86 | U 01289 Kefir, lowfat, plain |
| **Total** | | | **9,8** | **35,4** | **2,8** | **192** | 4/4/9: 206 kcal |

1. Add the spinach and mango to the cup.<br>Adicione espinafre e manga ao copo.
2. Add the milk kefir and close the lid.<br>Acrescente kefir de leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

<a id="wellness05"></a>
#### Wellness05 — Beet Berry Bliss / Beterraba com Frutas Vermelhas

**Problemas:** volume acima de 400 ml.

**Justificativa:** Morango de 1 para 3/4 de xícara.

**ANTES** · declarado P17 C24 G4 · 200 kcal · recalculado P17,4 C26,1 G3,5 · 196 kcal · volume 420 ml (xícara cheia 505 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1/2 cup Cooked beet | 1/2 xícara Beterraba cozida |
| 1 cup Strawberries | 1 xícara Morango |
| 150g Greek yogurt | 150g Iogurte grego |

1. Add the cooked beet and strawberries to the BLENDi cup.<br>Adicione beterraba cozida e morango ao copo do BLENDi.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

**DEPOIS** · declarar **P17 C23 G3 · 183 kcal** · volume **382 ml** no leitor novo (xícara cheia 446 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1/2 cup Cooked beet | 1/2 xícara Beterraba cozida | 85,0 | 1,4 | 8,5 | 0,2 | 37 | U 11081 Beets, cooked |
| 3/4 cup Strawberries | 3/4 xícara Morango | 114,0 | 0,8 | 8,8 | 0,3 | 36 | B: Strawberry |
| 150g Greek yogurt | 150g Iogurte grego | 150,0 | 14,9 | 5,9 | 2,9 | 110 | U 01287 Yogurt, Greek, plain, lowfat (referência única do "Iogurte grego") |
| **Total** | | | **17,2** | **23,2** | **3,4** | **183** | 4/4/9: 192 kcal |

1. Add the cooked beet and strawberries to the cup.<br>Adicione beterraba cozida e morango ao copo.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

<a id="wellness06"></a>
#### Wellness06 — Carrot Orange Sunrise / Cenoura com Laranja

**Problemas:** cenoura crua (dura para o Lite).

**Justificativa:** Cenoura cozida (1/2 xícara) no lugar da crua.

**ANTES** · declarado P16 C27 G3 · 199 kcal · recalculado P16,7 C27,1 G3,2 · 196 kcal · volume 342 ml (xícara cheia 342 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 medium Carrot | 1 unidade média Cenoura |
| 1 medium Orange | 1 unidade média Laranja |
| 150g Greek yogurt | 150g Iogurte grego |

1. Add the carrot and orange to the BLENDi cup.<br>Adicione cenoura e laranja ao copo do BLENDi.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

**DEPOIS** · declarar **P17 C28 G3 · 198 kcal** · volume **399 ml** no leitor novo (xícara cheia 399 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1/2 cup Cooked carrot | 1/2 xícara Cenoura cozida | 78,0 | 0,6 | 6,4 | 0,1 | 27 | U 11125 Carrots, cooked, boiled |
| 1 medium Orange | 1 unidade média Laranja | 131,0 | 1,2 | 15,4 | 0,2 | 62 | U 09200 Oranges |
| 150g Greek yogurt | 150g Iogurte grego | 150,0 | 14,9 | 5,9 | 2,9 | 110 | U 01287 Yogurt, Greek, plain, lowfat (referência única do "Iogurte grego") |
| **Total** | | | **16,7** | **27,7** | **3,2** | **198** | 4/4/9: 206 kcal |

1. Add the cooked carrot and orange to the cup.<br>Adicione cenoura cozida e laranja ao copo.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

<a id="wellness07"></a>
#### Wellness07 — Kiwi Spinach Fresh / Kiwi com Espinafre

**Problemas:** macros declarados fora de ±10% (gordura, kcal).

**Justificativa:** Só os macros mudam.

**ANTES** · declarado P9 C30 G6 · 210 kcal · recalculado P10,0 C30,9 G2,9 · 177 kcal · volume 368 ml (xícara cheia 368 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 handful Spinach | 1 punhado Espinafre |
| 2 Kiwi | 2 Kiwi |
| 200ml Milk kefir | 200ml Kefir de leite |

1. Add the spinach and kiwi to the BLENDi cup.<br>Adicione espinafre e kiwi ao copo do BLENDi.
2. Add the milk kefir and close the lid.<br>Acrescente kefir de leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

**DEPOIS** · declarar **P10 C31 G3 · 177 kcal** · volume **368 ml** no leitor novo (xícara cheia 368 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 handful Spinach | 1 punhado Espinafre | 30,0 | 0,9 | 1,1 | 0,1 | 7 | B: Raw spinach |
| 2 Kiwi | 2 Kiwi | 138,0 | 1,6 | 20,2 | 0,7 | 84 | U 09148 Kiwifruit, green |
| 200ml Milk kefir | 200ml Kefir de leite | 200,0 | 7,6 | 9,5 | 2,0 | 86 | U 01289 Kefir, lowfat, plain |
| **Total** | | | **10,0** | **30,9** | **2,9** | **177** | 4/4/9: 189 kcal |

1. Add the spinach and kiwi to the cup.<br>Adicione espinafre e kiwi ao copo.
2. Add the milk kefir and close the lid.<br>Acrescente kefir de leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

<a id="wellness08"></a>
#### Wellness08 — Cucumber Apple Calm / Pepino com Maçã

**Problemas:** maçã crua inteira.

**Justificativa:** Só o passo de cortar a maçã.

**ANTES** · declarado P7 C29 G3 · 171 kcal · recalculado P8,0 C27,0 G3,1 · 167 kcal · volume 400 ml (xícara cheia 385 ml) · contains — (vegana)

| en | pt-BR |
|---|---|
| 1/2 cup Cucumber | 1/2 xícara Pepino |
| 1 medium Green apple | 1 unidade média Maçã verde |
| 100g Silken tofu | 100g Tofu macio |

1. Add the cucumber and green apple to the BLENDi cup.<br>Adicione pepino e maçã verde ao copo do BLENDi.
2. Add the silken tofu and close the lid.<br>Acrescente tofu macio e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

**DEPOIS** · declarar **P8 C29 G3 · 175 kcal** · volume **400 ml** no leitor novo (xícara cheia 400 ml) · contains **— (vegana)**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1/2 cup Cucumber | 1/2 xícara Pepino | 52,0 | 0,3 | 1,9 | 0,1 | 8 | U 11205 Cucumber, with peel |
| 1 medium Green apple | 1 unidade média Maçã verde | 182,0 | 0,8 | 24,8 | 0,3 | 106 | U 09502 Apples, granny smith |
| 100g Silken tofu | 100g Tofu macio | 100,0 | 6,9 | 2,4 | 2,7 | 62 | U 16162 Tofu, silken, firm |
| **Total** | | | **8,0** | **29,1** | **3,1** | **175** | 4/4/9: 176 kcal |

1. Cut the green apple into small pieces. Add the cucumber and green apple to the cup.<br>Corte a maçã verde em pedaços pequenos. Adicione pepino e maçã verde ao copo.
2. Add the silken tofu and close the lid.<br>Acrescente tofu macio e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

<a id="wellness09"></a>
#### Wellness09 — Kale Blueberry Balance / Couve com Mirtilo

**Problemas:** couve inteira.

**Justificativa:** Só o passo de tirar o talo da couve.

**ANTES** · declarado P17 C29 G4 · 220 kcal · recalculado P16,8 C28,7 G3,8 · 204 kcal · volume 328 ml (xícara cheia 417 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 handful Kale | 1 punhado Couve |
| 1 cup Blueberries | 1 xícara Mirtilo |
| 150g Greek yogurt | 150g Iogurte grego |

1. Add the kale and blueberries to the BLENDi cup.<br>Adicione couve e mirtilo ao copo do BLENDi.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

**DEPOIS** · declarar **P17 C29 G4 · 204 kcal** · volume **328 ml** no leitor novo (xícara cheia 417 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 handful Kale | 1 punhado Couve | 30,0 | 0,9 | 1,3 | 0,4 | 10 | U 11233 Kale, raw |
| 1 cup Blueberries | 1 xícara Mirtilo | 148,0 | 1,0 | 21,5 | 0,4 | 84 | B: Blueberry |
| 150g Greek yogurt | 150g Iogurte grego | 150,0 | 14,9 | 5,9 | 2,9 | 110 | U 01287 Yogurt, Greek, plain, lowfat (referência única do "Iogurte grego") |
| **Total** | | | **16,8** | **28,7** | **3,8** | **204** | 4/4/9: 216 kcal |

1. Remove the kale stems and tear the leaves into small pieces. Add the kale and blueberries to the cup.<br>Tire o talo da couve e rasgue as folhas em pedaços pequenos. Adicione couve e mirtilo ao copo.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

<a id="wellness10"></a>
#### Wellness10 — Watermelon Yogurt Splash / Melancia com Iogurte

**Problemas:** volume acima de 400 ml.

**Justificativa:** Água de coco de 200 para 140 ml.

**ANTES** · declarado P11 C22 G2 · 150 kcal · recalculado P12,3 C22,8 G2,5 · 157 kcal · volume 452 ml (xícara cheia 537 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 cup Watermelon | 1 xícara Melancia |
| 100g Greek yogurt | 100g Iogurte grego |
| 200ml Coconut water | 200ml Água de coco |

1. Add the watermelon and greek yogurt to the BLENDi cup.<br>Adicione melancia e iogurte grego ao copo do BLENDi.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

**DEPOIS** · declarar **P12 C21 G2 · 145 kcal** · volume **392 ml** no leitor novo (xícara cheia 477 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 cup Watermelon | 1 xícara Melancia | 152,0 | 0,9 | 11,5 | 0,2 | 46 | U 09326 Watermelon |
| 100g Greek yogurt | 100g Iogurte grego | 100,0 | 9,9 | 3,9 | 1,9 | 73 | U 01287 Yogurt, Greek, plain, lowfat (referência única do "Iogurte grego") |
| 140ml Coconut water | 140ml Água de coco | 140,0 | 1,0 | 5,2 | 0,3 | 27 | U 12119 Coconut water |
| **Total** | | | **11,9** | **20,6** | **2,4** | **145** | 4/4/9: 152 kcal |

1. Add the watermelon and greek yogurt to the cup.<br>Adicione melancia e iogurte grego ao copo.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

<a id="wellness12"></a>
#### Wellness12 — Celery Apple Fresh / Aipo com Maçã

**Problemas:** volume acima de 400 ml; aipo e maçã inteiros; macros fora de ±10% (gordura, kcal).

**Justificativa:** Kefir de 200 para 170 ml, aipo e maçã cortados, macros pela soma.

**ANTES** · declarado P8 C35 G5 · 217 kcal · recalculado P8,6 C33,5 G2,4 · 188 kcal · volume 422 ml (xícara cheia 407 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 stalk Celery | 1 talo Aipo |
| 1 medium Green apple | 1 unidade média Maçã verde |
| 200ml Milk kefir | 200ml Kefir de leite |

1. Add the celery and green apple to the BLENDi cup.<br>Adicione aipo e maçã verde ao copo do BLENDi.
2. Add the milk kefir and close the lid.<br>Acrescente kefir de leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

**DEPOIS** · declarar **P8 C34 G2 · 184 kcal** · volume **392 ml** no leitor novo (xícara cheia 392 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 stalk Celery | 1 talo Aipo | 40,0 | 0,3 | 1,2 | 0,1 | 6 | U 11143 Celery |
| 1 medium Green apple | 1 unidade média Maçã verde | 182,0 | 0,8 | 24,8 | 0,3 | 106 | U 09502 Apples, granny smith |
| 170ml Milk kefir | 170ml Kefir de leite | 170,0 | 6,4 | 8,1 | 1,7 | 73 | U 01289 Kefir, lowfat, plain |
| **Total** | | | **7,5** | **34,1** | **2,1** | **184** | 4/4/9: 186 kcal |

1. Cut the celery into small pieces. Cut the green apple into small pieces. Add the celery and green apple to the cup.<br>Corte o aipo em pedaços pequenos. Corte a maçã verde em pedaços pequenos. Adicione aipo e maçã verde ao copo.
2. Add the milk kefir and close the lid.<br>Acrescente kefir de leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

<a id="wellness13"></a>
#### Wellness13 — Carrot Mango Smooth / Cenoura com Manga

**Problemas:** cenoura crua (dura para o Lite).

**Justificativa:** Cenoura cozida no lugar da crua.

**ANTES** · declarado P8 C33 G3 · 191 kcal · recalculado P8,8 C33,0 G3,5 · 186 kcal · volume 326 ml (xícara cheia 398 ml) · contains — (vegana)

| en | pt-BR |
|---|---|
| 1 medium Carrot | 1 unidade média Cenoura |
| 1 cup Mango | 1 xícara Manga |
| 100g Silken tofu | 100g Tofu macio |

1. Add the carrot and mango to the BLENDi cup.<br>Adicione cenoura e manga ao copo do BLENDi.
2. Add the silken tofu and close the lid.<br>Acrescente tofu macio e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

**DEPOIS** · declarar **P9 C34 G4 · 188 kcal** · volume **383 ml** no leitor novo (xícara cheia 455 ml) · contains **— (vegana)**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1/2 cup Cooked carrot | 1/2 xícara Cenoura cozida | 78,0 | 0,6 | 6,4 | 0,1 | 27 | U 11125 Carrots, cooked, boiled |
| 1 cup Mango | 1 xícara Manga | 165,0 | 1,3 | 24,8 | 0,7 | 99 | B: Mango |
| 100g Silken tofu | 100g Tofu macio | 100,0 | 6,9 | 2,4 | 2,7 | 62 | U 16162 Tofu, silken, firm |
| **Total** | | | **8,8** | **33,6** | **3,5** | **188** | 4/4/9: 201 kcal |

1. Add the cooked carrot and mango to the cup.<br>Adicione cenoura cozida e manga ao copo.
2. Add the silken tofu and close the lid.<br>Acrescente tofu macio e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

<a id="wellness15"></a>
#### Wellness15 — Pear Spinach Light / Pera com Espinafre

**Problemas:** pera inteira.

**Justificativa:** Só o passo de cortar a pera.

**ANTES** · declarado P12 C31 G2 · 190 kcal · recalculado P12,0 C32,9 G2,6 · 189 kcal · volume 308 ml (xícara cheia 308 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 handful Spinach | 1 punhado Espinafre |
| 1 medium Pear | 1 unidade média Pera |
| 100g Cottage cheese | 100g Cottage |

1. Add the spinach and pear to the BLENDi cup.<br>Adicione espinafre e pera ao copo do BLENDi.
2. Add the cottage cheese and close the lid.<br>Acrescente cottage e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

**DEPOIS** · declarar **P12 C33 G3 · 189 kcal** · volume **308 ml** no leitor novo (xícara cheia 308 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 handful Spinach | 1 punhado Espinafre | 30,0 | 0,9 | 1,1 | 0,1 | 7 | B: Raw spinach |
| 1 medium Pear | 1 unidade média Pera | 178,0 | 0,6 | 27,1 | 0,2 | 101 | U 09252 Pears |
| 100g Cottage cheese | 100g Cottage | 100,0 | 10,4 | 4,8 | 2,3 | 81 | U 01015 Cottage cheese, lowfat 2% (referência única do "Cottage") |
| **Total** | | | **12,0** | **32,9** | **2,6** | **189** | 4/4/9: 203 kcal |

1. Cut the pear into small pieces, without the core. Add the spinach and pear to the cup.<br>Corte a pera em pedaços pequenos, sem o miolo. Adicione espinafre e pera ao copo.
2. Add the cottage cheese and close the lid.<br>Acrescente cottage e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

<a id="wellness16"></a>
#### Wellness16 — Kiwi Cucumber Yogurt / Kiwi com Pepino e Iogurte

**Problemas:** volume acima de 400 ml.

**Justificativa:** Pepino de 1/2 para 1/4 de xícara.

**ANTES** · declarado P16 C28 G4 · 212 kcal · recalculado P16,8 C28,0 G3,7 · 201 kcal · volume 406 ml (xícara cheia 406 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1/2 cup Cucumber | 1/2 xícara Pepino |
| 2 Kiwi | 2 Kiwi |
| 150g Greek yogurt | 150g Iogurte grego |

1. Add the cucumber and kiwi to the BLENDi cup.<br>Adicione pepino e kiwi ao copo do BLENDi.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

**DEPOIS** · declarar **P17 C27 G4 · 198 kcal** · volume **347 ml** no leitor novo (xícara cheia 347 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1/4 cup Cucumber | 1/4 xícara Pepino | 26,0 | 0,2 | 0,9 | 0,0 | 4 | U 11205 Cucumber, with peel |
| 2 Kiwi | 2 Kiwi | 138,0 | 1,6 | 20,2 | 0,7 | 84 | U 09148 Kiwifruit, green |
| 150g Greek yogurt | 150g Iogurte grego | 150,0 | 14,9 | 5,9 | 2,9 | 110 | U 01287 Yogurt, Greek, plain, lowfat (referência única do "Iogurte grego") |
| **Total** | | | **16,7** | **27,1** | **3,6** | **198** | 4/4/9: 208 kcal |

1. Add the cucumber and kiwi to the cup.<br>Adicione pepino e kiwi ao copo.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

<a id="wellness17"></a>
#### Wellness17 — Kale Pineapple Fresh / Couve com Abacaxi

**Problemas:** couve inteira; macros fora de ±10% (gordura, kcal).

**Justificativa:** Passo de tirar o talo da couve e macros pela soma.

**ANTES** · declarado P9 C33 G5 · 213 kcal · recalculado P9,3 C32,5 G2,7 · 179 kcal · volume 395 ml (xícara cheia 467 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 handful Kale | 1 punhado Couve |
| 1 cup Pineapple | 1 xícara Abacaxi |
| 200ml Milk kefir | 200ml Kefir de leite |

1. Add the kale and pineapple to the BLENDi cup.<br>Adicione couve e abacaxi ao copo do BLENDi.
2. Add the milk kefir and close the lid.<br>Acrescente kefir de leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

**DEPOIS** · declarar **P9 C33 G3 · 179 kcal** · volume **395 ml** no leitor novo (xícara cheia 467 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 handful Kale | 1 punhado Couve | 30,0 | 0,9 | 1,3 | 0,4 | 10 | U 11233 Kale, raw |
| 1 cup Pineapple | 1 xícara Abacaxi | 165,0 | 0,9 | 21,6 | 0,2 | 82 | U 09266 Pineapple |
| 200ml Milk kefir | 200ml Kefir de leite | 200,0 | 7,6 | 9,5 | 2,0 | 86 | U 01289 Kefir, lowfat, plain |
| **Total** | | | **9,3** | **32,5** | **2,7** | **179** | 4/4/9: 192 kcal |

1. Remove the kale stems and tear the leaves into small pieces. Add the kale and pineapple to the cup.<br>Tire o talo da couve e rasgue as folhas em pedaços pequenos. Adicione couve e abacaxi ao copo.
2. Add the milk kefir and close the lid.<br>Acrescente kefir de leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

<a id="wellness18"></a>
#### Wellness18 — Strawberry Cucumber Calm / Morango com Pepino

**Problemas:** volume acima de 400 ml.

**Justificativa:** Pepino de 1/2 para 1/4 de xícara.

**ANTES** · declarado P16 C19 G4 · 176 kcal · recalculado P16,3 C19,5 G3,4 · 166 kcal · volume 420 ml (xícara cheia 505 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 cup Strawberries | 1 xícara Morango |
| 1/2 cup Cucumber | 1/2 xícara Pepino |
| 150g Greek yogurt | 150g Iogurte grego |

1. Add the strawberries and cucumber to the BLENDi cup.<br>Adicione morango e pepino ao copo do BLENDi.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

**DEPOIS** · declarar **P16 C19 G3 · 162 kcal** · volume **361 ml** no leitor novo (xícara cheia 446 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 cup Strawberries | 1 xícara Morango | 152,0 | 1,1 | 11,7 | 0,5 | 49 | B: Strawberry |
| 1/4 cup Cucumber | 1/4 xícara Pepino | 26,0 | 0,2 | 0,9 | 0,0 | 4 | U 11205 Cucumber, with peel |
| 150g Greek yogurt | 150g Iogurte grego | 150,0 | 14,9 | 5,9 | 2,9 | 110 | U 01287 Yogurt, Greek, plain, lowfat (referência única do "Iogurte grego") |
| **Total** | | | **16,2** | **18,6** | **3,4** | **162** | 4/4/9: 169 kcal |

1. Add the strawberries and cucumber to the cup.<br>Adicione morango e pepino ao copo.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

<a id="wellness20"></a>
#### Wellness20 — Carrot Pineapple Balance / Cenoura com Abacaxi

**Problemas:** cenoura crua (dura para o Lite); volume acima de 400 ml com a cenoura cozida.

**Justificativa:** Cenoura cozida e abacaxi de 1 para 3/4 de xícara.

**ANTES** · declarado P16 C34 G3 · 227 kcal · recalculado P16,4 C33,4 G3,2 · 217 kcal · volume 376 ml (xícara cheia 448 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 medium Carrot | 1 unidade média Cenoura |
| 1 cup Pineapple | 1 xícara Abacaxi |
| 150g Greek yogurt | 150g Iogurte grego |

1. Add the carrot and pineapple to the BLENDi cup.<br>Adicione cenoura e abacaxi ao copo do BLENDi.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

**DEPOIS** · declarar **P16 C29 G3 · 199 kcal** · volume **392 ml** no leitor novo (xícara cheia 446 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1/2 cup Cooked carrot | 1/2 xícara Cenoura cozida | 78,0 | 0,6 | 6,4 | 0,1 | 27 | U 11125 Carrots, cooked, boiled |
| 3/4 cup Pineapple | 3/4 xícara Abacaxi | 123,8 | 0,7 | 16,2 | 0,1 | 62 | U 09266 Pineapple |
| 150g Greek yogurt | 150g Iogurte grego | 150,0 | 14,9 | 5,9 | 2,9 | 110 | U 01287 Yogurt, Greek, plain, lowfat (referência única do "Iogurte grego") |
| **Total** | | | **16,2** | **28,6** | **3,2** | **199** | 4/4/9: 207 kcal |

1. Add the cooked carrot and pineapple to the cup.<br>Adicione cenoura cozida e abacaxi ao copo.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your wellness blend.<br>Sirva imediatamente e aproveite seu blend de bem-estar.

### Energy

<a id="energy01"></a>
#### Energy01 — Fast Fuel Mango Oats / Manga com Aveia Turbo

**Problemas:** macros declarados errados (receita original); volume acima de 400 ml.

**Justificativa:** Leite de amêndoas de 250 para 190 ml; macros pela soma (16 g → 7 g de proteína).

**ANTES** · declarado P16 C42 G12 · 340 kcal · recalculado P8,0 C52,7 G6,3 · 283 kcal · volume 455 ml (xícara cheia 527 ml) · contains nuts

| en | pt-BR |
|---|---|
| 40g Oats | 40g Aveia |
| 1 cup Mango | 1 xícara Manga |
| 250ml Almond milk | 250ml Leite de amêndoas |

1. Add the oats and mango to the BLENDi cup.<br>Adicione aveia e manga ao copo do BLENDi.
2. Add the almond milk and close the lid.<br>Acrescente leite de amêndoas e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

**DEPOIS** · declarar **P8 C53 G6 · 275 kcal** · volume **395 ml** no leitor novo (xícara cheia 467 ml) · contains **nuts**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 40g Oats | 40g Aveia | 40,0 | 5,4 | 27,2 | 2,6 | 152 | B: Rolled oats |
| 1 cup Mango | 1 xícara Manga | 165,0 | 1,3 | 24,8 | 0,7 | 99 | B: Mango |
| 190ml Almond milk | 190ml Leite de amêndoas | 190,0 | 0,9 | 0,6 | 2,3 | 25 | B: Unsweetened almond milk |
| **Total** | | | **7,7** | **52,5** | **5,5** | **275** | 4/4/9: 291 kcal |

1. Add the oats and mango to the cup.<br>Adicione aveia e manga ao copo.
2. Add the almond milk and close the lid.<br>Acrescente leite de amêndoas e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

<a id="energy02"></a>
#### Energy02 — Date Banana Fuel / Tâmara com Banana

**Problemas:** volume acima de 400 ml; leite com tipo (low-fat).

**Justificativa:** Leite de 250 para 230 ml, sem tipo.

**ANTES** · declarado P10 C71 G3 · 351 kcal · recalculado P10,6 C75,6 G2,9 · 343 kcal · volume 416 ml (xícara cheia 416 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 medium Banana | 1 unidade média Banana |
| 2 Dates | 2 Tâmaras |
| 250ml Low-fat milk | 250ml Leite desnatado |

1. Add the banana and dates to the BLENDi cup.<br>Adicione banana e tâmaras ao copo do BLENDi.
2. Add the low-fat milk and close the lid.<br>Acrescente leite desnatado e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

**DEPOIS** · declarar **P10 C74 G5 · 353 kcal** · volume **396 ml** no leitor novo (xícara cheia 396 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 medium Banana | 1 unidade média Banana | 118,0 | 1,3 | 27,1 | 0,4 | 105 | B: Ripe banana (fibra U 09040) |
| 2 Dates | 2 Tâmaras | 48,0 | 0,9 | 36,0 | 0,1 | 133 | U 09421 Dates, medjool |
| 230ml Milk | 230ml Leite | 230,0 | 7,6 | 11,0 | 4,6 | 115 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **9,8** | **74,2** | **5,0** | **353** | 4/4/9: 381 kcal |

1. Add the banana and dates to the cup.<br>Adicione banana e tâmaras ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

<a id="energy03"></a>
#### Energy03 — Cacao Oat Boost / Cacau com Aveia

**Problemas:** leite com tipo (integral).

**Justificativa:** "Whole milk" vira "Milk".

**ANTES** · declarado P13 C35 G10 · 282 kcal · recalculado P13,1 C35,5 G11,7 · 279 kcal · volume 285 ml (xícara cheia 295 ml) · contains dairy

| en | pt-BR |
|---|---|
| 30g Oats | 30g Aveia |
| 1 tbsp Cacao powder | 1 colher(es) de sopa Cacau em pó |
| 250ml Whole milk | 250ml Leite integral |

1. Add the oats and cacao powder to the BLENDi cup.<br>Adicione aveia e cacau em pó ao copo do BLENDi.
2. Add the whole milk and close the lid.<br>Acrescente leite integral e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

**DEPOIS** · declarar **P13 C36 G8 · 251 kcal** · volume **285 ml** no leitor novo (xícara cheia 295 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 30g Oats | 30g Aveia | 30,0 | 4,0 | 20,4 | 1,9 | 114 | B: Rolled oats |
| 1 tbsp Cacao powder | 1 colher(es) de sopa Cacau em pó | 5,4 | 1,1 | 3,1 | 0,7 | 12 | U 19165 Cocoa, dry powder, unsweetened |
| 250ml Milk | 250ml Leite | 250,0 | 8,2 | 12,0 | 5,0 | 125 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **13,4** | **35,5** | **7,6** | **251** | 4/4/9: 264 kcal |

1. Add the oats and cacao powder to the cup.<br>Adicione aveia e cacau em pó ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

<a id="energy04"></a>
#### Energy04 — Matcha Morning Energy / Energia Matinal com Matcha

**Problemas:** leite com tipo (low-fat).

**Justificativa:** "Low-fat milk" vira "Milk".

**ANTES** · declarado P9 C40 G3 · 223 kcal · recalculado P10,7 C40,6 G2,8 · 215 kcal · volume 370 ml (xícara cheia 373 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 tsp Matcha powder | 1 colher de chá Pó de matcha |
| 1 medium Banana | 1 unidade média Banana |
| 250ml Low-fat milk | 250ml Leite desnatado |

1. Add the matcha powder and banana to the BLENDi cup.<br>Adicione pó de matcha e banana ao copo do BLENDi.
2. Add the low-fat milk and close the lid.<br>Acrescente leite desnatado e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

**DEPOIS** · declarar **P11 C40 G5 · 235 kcal** · volume **370 ml** no leitor novo (xícara cheia 373 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 tsp Matcha powder | 1 colher de chá Pó de matcha | 2,0 | 1,0 | 1,0 | 0,0 | 5 | FDC 2308440 Matcha (Tiesta Tea), 1 tsp = 2 g |
| 1 medium Banana | 1 unidade média Banana | 118,0 | 1,3 | 27,1 | 0,4 | 105 | B: Ripe banana (fibra U 09040) |
| 250ml Milk | 250ml Leite | 250,0 | 8,2 | 12,0 | 5,0 | 125 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **10,5** | **40,1** | **5,3** | **235** | 4/4/9: 250 kcal |

1. Add the matcha powder and banana to the cup.<br>Adicione pó de matcha e banana ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

<a id="energy05"></a>
#### Energy05 — Tropical Oat Charge / Carga Tropical com Aveia

**Problemas:** volume acima de 400 ml.

**Justificativa:** Água de coco de 250 para 200 ml.

**ANTES** · declarado P5 C51 G2 · 242 kcal · recalculado P6,7 C51,3 G2,6 · 244 kcal · volume 445 ml (xícara cheia 517 ml) · contains — (vegana)

| en | pt-BR |
|---|---|
| 1 cup Pineapple | 1 xícara Abacaxi |
| 30g Oats | 30g Aveia |
| 250ml Coconut water | 250ml Água de coco |

1. Add the pineapple and oats to the BLENDi cup.<br>Adicione abacaxi e aveia ao copo do BLENDi.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

**DEPOIS** · declarar **P6 C49 G3 · 234 kcal** · volume **395 ml** no leitor novo (xícara cheia 467 ml) · contains **— (vegana)**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 cup Pineapple | 1 xícara Abacaxi | 165,0 | 0,9 | 21,6 | 0,2 | 82 | U 09266 Pineapple |
| 30g Oats | 30g Aveia | 30,0 | 4,0 | 20,4 | 1,9 | 114 | B: Rolled oats |
| 200ml Coconut water | 200ml Água de coco | 200,0 | 1,4 | 7,4 | 0,4 | 38 | U 12119 Coconut water |
| **Total** | | | **6,4** | **49,5** | **2,5** | **234** | 4/4/9: 246 kcal |

1. Add the pineapple and oats to the cup.<br>Adicione abacaxi e aveia ao copo.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

<a id="energy06"></a>
#### Energy06 — Triple Date Power / Força Tripla de Tâmaras

**Problemas:** leite com tipo (low-fat).

**Justificativa:** "Low-fat milk" vira "Milk".

**ANTES** · declarado P14 C87 G4 · 440 kcal · recalculado P15,1 C93,7 G5,1 · 456 kcal · volume 362 ml (xícara cheia 362 ml) · contains dairy

| en | pt-BR |
|---|---|
| 3 Dates | 3 Tâmaras |
| 40g Oats | 40g Aveia |
| 250ml Low-fat milk | 250ml Leite desnatado |

1. Add the dates and oats to the BLENDi cup.<br>Adicione tâmaras e aveia ao copo do BLENDi.
2. Add the low-fat milk and close the lid.<br>Acrescente leite desnatado e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

**DEPOIS** · declarar **P15 C93 G8 · 476 kcal** · volume **362 ml** no leitor novo (xícara cheia 362 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 3 Dates | 3 Tâmaras | 72,0 | 1,3 | 54,0 | 0,1 | 199 | U 09421 Dates, medjool |
| 40g Oats | 40g Aveia | 40,0 | 5,4 | 27,2 | 2,6 | 152 | B: Rolled oats |
| 250ml Milk | 250ml Leite | 250,0 | 8,2 | 12,0 | 5,0 | 125 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **15,0** | **93,2** | **7,7** | **476** | 4/4/9: 501 kcal |

1. Add the dates and oats to the cup.<br>Adicione tâmaras e aveia ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

<a id="energy07"></a>
#### Energy07 — Espresso Banana Kick / Espresso com Banana

**Problemas:** leite com tipo (low-fat).

**Justificativa:** "Low-fat milk" vira "Milk".

**ANTES** · declarado P9 C39 G3 · 219 kcal · recalculado P9,8 C40,1 G2,8 · 213 kcal · volume 398 ml (xícara cheia 398 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 Espresso shot | 1 Dose de espresso |
| 1 medium Banana | 1 unidade média Banana |
| 250ml Low-fat milk | 250ml Leite desnatado |

1. Add the espresso shot and banana to the BLENDi cup.<br>Adicione dose de espresso e banana ao copo do BLENDi.
2. Add the low-fat milk and close the lid.<br>Acrescente leite desnatado e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

**DEPOIS** · declarar **P10 C40 G5 · 233 kcal** · volume **398 ml** no leitor novo (xícara cheia 398 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 Espresso shot | 1 Dose de espresso | 30,0 | 0,0 | 0,5 | 0,1 | 3 | U 14210 Espresso |
| 1 medium Banana | 1 unidade média Banana | 118,0 | 1,3 | 27,1 | 0,4 | 105 | B: Ripe banana (fibra U 09040) |
| 250ml Milk | 250ml Leite | 250,0 | 8,2 | 12,0 | 5,0 | 125 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **9,6** | **39,6** | **5,4** | **233** | 4/4/9: 245 kcal |

1. Add the espresso shot and banana to the cup.<br>Adicione dose de espresso e banana ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

<a id="energy08"></a>
#### Energy08 — Maca Mango Rise / Maca com Manga

**Problemas:** volume acima de 400 ml; leite com tipo (low-fat).

**Justificativa:** Leite de 250 para 230 ml, sem tipo.

**ANTES** · declarado P9 C39 G3 · 219 kcal · recalculado P10,7 C41,2 G3,1 · 224 kcal · volume 420 ml (xícara cheia 492 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 cup Mango | 1 xícara Manga |
| 1 tsp Maca powder | 1 colher de chá Pó de maca |
| 250ml Low-fat milk | 250ml Leite desnatado |

1. Add the mango and maca powder to the BLENDi cup.<br>Adicione manga e pó de maca ao copo do BLENDi.
2. Add the low-fat milk and close the lid.<br>Acrescente leite desnatado e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

**DEPOIS** · declarar **P10 C40 G5 · 234 kcal** · volume **400 ml** no leitor novo (xícara cheia 472 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 cup Mango | 1 xícara Manga | 165,0 | 1,3 | 24,8 | 0,7 | 99 | B: Mango |
| 1 tsp Maca powder | 1 colher de chá Pó de maca | 5,0 | 1,0 | 4,0 | 0,0 | 20 | FDC 2604131 Maca powder (Navitas), 1 tsp = 5 g |
| 230ml Milk | 230ml Leite | 230,0 | 7,6 | 11,0 | 4,6 | 115 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **9,9** | **39,8** | **5,2** | **234** | 4/4/9: 246 kcal |

1. Add the mango and maca powder to the cup.<br>Adicione manga e pó de maca ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

<a id="energy09"></a>
#### Energy09 — Granola Banana Energy / Granola com Banana

**Problemas:** volume acima de 400 ml; leite com tipo (integral).

**Justificativa:** Leite de 250 para 230 ml, sem tipo.

**ANTES** · declarado P12 C54 G13 · 381 kcal · recalculado P12,4 C51,5 G14,9 · 369 kcal · volume 412 ml (xícara cheia 412 ml) · contains dairy, nuts

| en | pt-BR |
|---|---|
| 3 tbsp Granola | 3 colher(es) de sopa Granola |
| 1 medium Banana | 1 unidade média Banana |
| 250ml Whole milk | 250ml Leite integral |

1. Add the granola and banana to the BLENDi cup.<br>Adicione granola e banana ao copo do BLENDi.
2. Add the whole milk and close the lid.<br>Acrescente leite integral e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

**DEPOIS** · declarar **P12 C51 G10 · 332 kcal** · volume **392 ml** no leitor novo (xícara cheia 392 ml) · contains **dairy, nuts**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 3 tbsp Granola | 3 colher(es) de sopa Granola | 22,9 | 3,1 | 12,3 | 5,6 | 112 | U 08037 Granola, homemade |
| 1 medium Banana | 1 unidade média Banana | 118,0 | 1,3 | 27,1 | 0,4 | 105 | B: Ripe banana (fibra U 09040) |
| 230ml Milk | 230ml Leite | 230,0 | 7,6 | 11,0 | 4,6 | 115 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **12,0** | **50,5** | **10,5** | **332** | 4/4/9: 344 kcal |

1. Add the granola and banana to the cup.<br>Adicione granola e banana ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

<a id="energy10"></a>
#### Energy10 — Pineapple Oat Rush / Abacaxi com Aveia

**Problemas:** volume acima de 400 ml.

**Justificativa:** Leite de aveia de 250 para 190 ml.

**ANTES** · declarado P8 C65 G5 · 337 kcal · recalculado P8,8 C65,1 G6,5 · 347 kcal · volume 455 ml (xícara cheia 527 ml) · contains — (vegana)

| en | pt-BR |
|---|---|
| 40g Oats | 40g Aveia |
| 1 cup Pineapple | 1 xícara Abacaxi |
| 250ml Oat milk | 250ml Leite de aveia |

1. Add the oats and pineapple to the BLENDi cup.<br>Adicione aveia e abacaxi ao copo do BLENDi.
2. Add the oat milk and close the lid.<br>Acrescente leite de aveia e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

**DEPOIS** · declarar **P8 C61 G6 · 320 kcal** · volume **395 ml** no leitor novo (xícara cheia 467 ml) · contains **— (vegana)**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 40g Oats | 40g Aveia | 40,0 | 5,4 | 27,2 | 2,6 | 152 | B: Rolled oats |
| 1 cup Pineapple | 1 xícara Abacaxi | 165,0 | 0,9 | 21,6 | 0,2 | 82 | U 09266 Pineapple |
| 190ml Oat milk | 190ml Leite de aveia | 190,0 | 1,9 | 12,3 | 2,9 | 86 | B: Oat milk |
| **Total** | | | **8,2** | **61,2** | **5,6** | **320** | 4/4/9: 328 kcal |

1. Add the oats and pineapple to the cup.<br>Adicione aveia e abacaxi ao copo.
2. Add the oat milk and close the lid.<br>Acrescente leite de aveia e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

<a id="energy11"></a>
#### Energy11 — Cacao Nib Charge / Carga de Nibs de Cacau

**Problemas:** leite com tipo (low-fat).

**Justificativa:** "Low-fat milk" vira "Milk".

**ANTES** · declarado P10 C43 G6 · 266 kcal · recalculado P11,1 C43,3 G7,8 · 273 kcal · volume 373 ml (xícara cheia 383 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 tbsp Cacao nibs | 1 colher(es) de sopa Nibs de cacau |
| 1 medium Banana | 1 unidade média Banana |
| 250ml Low-fat milk | 250ml Leite desnatado |

1. Add the cacao nibs and banana to the BLENDi cup.<br>Adicione nibs de cacau e banana ao copo do BLENDi.
2. Add the low-fat milk and close the lid.<br>Acrescente leite desnatado e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

**DEPOIS** · declarar **P11 C43 G10 · 293 kcal** · volume **373 ml** no leitor novo (xícara cheia 383 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 tbsp Cacao nibs | 1 colher(es) de sopa Nibs de cacau | 10,0 | 1,3 | 3,7 | 5,0 | 63 | FDC 2670464 Cacao nibs (Navitas) |
| 1 medium Banana | 1 unidade média Banana | 118,0 | 1,3 | 27,1 | 0,4 | 105 | B: Ripe banana (fibra U 09040) |
| 250ml Milk | 250ml Leite | 250,0 | 8,2 | 12,0 | 5,0 | 125 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **10,9** | **42,8** | **10,3** | **293** | 4/4/9: 307 kcal |

1. Add the cacao nibs and banana to the cup.<br>Adicione nibs de cacau e banana ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

<a id="energy12"></a>
#### Energy12 — Mango Date Spark / Faísca de Manga com Tâmara

**Problemas:** volume acima de 400 ml; leite com tipo (low-fat).

**Justificativa:** Leite de 250 para 180 ml, sem tipo.

**ANTES** · declarado P10 C69 G3 · 343 kcal · recalculado P10,6 C73,2 G3,2 · 337 kcal · volume 463 ml (xícara cheia 535 ml) · contains dairy

| en | pt-BR |
|---|---|
| 2 Dates | 2 Tâmaras |
| 1 cup Mango | 1 xícara Manga |
| 250ml Low-fat milk | 250ml Leite desnatado |

1. Add the dates and mango to the BLENDi cup.<br>Adicione tâmaras e manga ao copo do BLENDi.
2. Add the low-fat milk and close the lid.<br>Acrescente leite desnatado e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

**DEPOIS** · declarar **P8 C69 G4 · 322 kcal** · volume **393 ml** no leitor novo (xícara cheia 465 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 2 Dates | 2 Tâmaras | 48,0 | 0,9 | 36,0 | 0,1 | 133 | U 09421 Dates, medjool |
| 1 cup Mango | 1 xícara Manga | 165,0 | 1,3 | 24,8 | 0,7 | 99 | B: Mango |
| 180ml Milk | 180ml Leite | 180,0 | 5,9 | 8,6 | 3,6 | 90 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **8,1** | **69,4** | **4,3** | **322** | 4/4/9: 349 kcal |

1. Add the dates and mango to the cup.<br>Adicione tâmaras e manga ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

<a id="energy13"></a>
#### Energy13 — Matcha Pineapple Zing / Matcha com Abacaxi

**Problemas:** volume acima de 400 ml; leite com tipo (low-fat).

**Justificativa:** Leite de 250 para 230 ml, sem tipo.

**ANTES** · declarado P9 C35 G3 · 203 kcal · recalculado P10,3 C35,1 G2,6 · 192 kcal · volume 417 ml (xícara cheia 492 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 tsp Matcha powder | 1 colher de chá Pó de matcha |
| 1 cup Pineapple | 1 xícara Abacaxi |
| 250ml Low-fat milk | 250ml Leite desnatado |

1. Add the matcha powder and pineapple to the BLENDi cup.<br>Adicione pó de matcha e abacaxi ao copo do BLENDi.
2. Add the low-fat milk and close the lid.<br>Acrescente leite desnatado e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

**DEPOIS** · declarar **P9 C34 G5 · 203 kcal** · volume **397 ml** no leitor novo (xícara cheia 472 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 tsp Matcha powder | 1 colher de chá Pó de matcha | 2,0 | 1,0 | 1,0 | 0,0 | 5 | FDC 2308440 Matcha (Tiesta Tea), 1 tsp = 2 g |
| 1 cup Pineapple | 1 xícara Abacaxi | 165,0 | 0,9 | 21,6 | 0,2 | 82 | U 09266 Pineapple |
| 230ml Milk | 230ml Leite | 230,0 | 7,6 | 11,0 | 4,6 | 115 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **9,5** | **33,7** | **4,8** | **202** | 4/4/9: 215 kcal |

1. Add the matcha powder and pineapple to the cup.<br>Adicione pó de matcha e abacaxi ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

<a id="energy16"></a>
#### Energy16 — Papaya Date Fuel / Mamão com Tâmara

**Problemas:** volume acima de 400 ml; leite com tipo (low-fat).

**Justificativa:** Leite de 250 para 200 ml, sem tipo.

**ANTES** · declarado P9 C60 G3 · 303 kcal · recalculado P10,0 C64,1 G2,9 · 300 kcal · volume 443 ml (xícara cheia 535 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 cup Papaya | 1 xícara Mamão |
| 2 Dates | 2 Tâmaras |
| 250ml Low-fat milk | 250ml Leite desnatado |

1. Add the papaya and dates to the BLENDi cup.<br>Adicione mamão e tâmaras ao copo do BLENDi.
2. Add the low-fat milk and close the lid.<br>Acrescente leite desnatado e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

**DEPOIS** · declarar **P8 C61 G4 · 295 kcal** · volume **393 ml** no leitor novo (xícara cheia 485 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 cup Papaya | 1 xícara Mamão | 145,0 | 0,7 | 15,7 | 0,4 | 62 | U 09226 Papayas |
| 2 Dates | 2 Tâmaras | 48,0 | 0,9 | 36,0 | 0,1 | 133 | U 09421 Dates, medjool |
| 200ml Milk | 200ml Leite | 200,0 | 6,6 | 9,6 | 4,0 | 100 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **8,2** | **61,3** | **4,4** | **295** | 4/4/9: 317 kcal |

1. Add the papaya and dates to the cup.<br>Adicione mamão e tâmaras ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

<a id="energy17"></a>
#### Energy17 — Mocha Energy Blend / Blend Mocha Energético

**Problemas:** leite com tipo (integral).

**Justificativa:** "Whole milk" vira "Milk".

**ANTES** · declarado P9 C15 G9 · 177 kcal · recalculado P9,1 C15,6 G9,8 · 168 kcal · volume 285 ml (xícara cheia 295 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 Espresso shot | 1 Dose de espresso |
| 1 tbsp Cacao powder | 1 colher(es) de sopa Cacau em pó |
| 250ml Whole milk | 250ml Leite integral |

1. Add the espresso shot and cacao powder to the BLENDi cup.<br>Adicione dose de espresso e cacau em pó ao copo do BLENDi.
2. Add the whole milk and close the lid.<br>Acrescente leite integral e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

**DEPOIS** · declarar **P9 C16 G6 · 140 kcal** · volume **285 ml** no leitor novo (xícara cheia 295 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 Espresso shot | 1 Dose de espresso | 30,0 | 0,0 | 0,5 | 0,1 | 3 | U 14210 Espresso |
| 1 tbsp Cacao powder | 1 colher(es) de sopa Cacau em pó | 5,4 | 1,1 | 3,1 | 0,7 | 12 | U 19165 Cocoa, dry powder, unsweetened |
| 250ml Milk | 250ml Leite | 250,0 | 8,2 | 12,0 | 5,0 | 125 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **9,3** | **15,6** | **5,7** | **140** | 4/4/9: 152 kcal |

1. Add the espresso shot and cacao powder to the cup.<br>Adicione dose de espresso e cacau em pó ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

<a id="energy18"></a>
#### Energy18 — Carrot Orange Spark / Faísca de Cenoura com Laranja → Blueberry Oat Fuel / Mirtilo com Aveia

**Problemas:** repetida (= Wellness06); cenoura crua.

**Justificativa:** Receita nova no padrão Energy (aveia + fruta + base), vegana. A cenoura com laranja fica só no Wellness06.

**ANTES** · declarado P16 C27 G3 · 199 kcal · recalculado P16,7 C27,1 G3,2 · 196 kcal · volume 342 ml (xícara cheia 342 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 medium Orange | 1 unidade média Laranja |
| 1 medium Carrot | 1 unidade média Cenoura |
| 150g Greek yogurt | 150g Iogurte grego |

1. Add the orange and carrot to the BLENDi cup.<br>Adicione laranja e cenoura ao copo do BLENDi.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

**DEPOIS** · declarar **P11 C40 G6 · 253 kcal** · volume **371 ml** no leitor novo (xícara cheia 437 ml) · contains **— (vegana)**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 30g Oats | 30g Aveia | 30,0 | 4,0 | 20,4 | 1,9 | 114 | B: Rolled oats |
| 3/4 cup Blueberries | 3/4 xícara Mirtilo | 111,0 | 0,8 | 16,1 | 0,3 | 63 | B: Blueberry |
| 230ml Unsweetened soy milk | 230ml Bebida de soja sem açúcar | 230,0 | 6,6 | 4,0 | 3,7 | 76 | U 16222 Soymilk, unsweetened |
| **Total** | | | **11,4** | **40,5** | **6,0** | **253** | 4/4/9: 261 kcal |

1. Add the oats and blueberries to the cup.<br>Adicione aveia e mirtilo ao copo.
2. Add the unsweetened soy milk and close the lid.<br>Acrescente bebida de soja sem açúcar e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

<a id="energy19"></a>
#### Energy19 — Date Cacao Oat Power / Força de Tâmara com Cacau e Aveia

**Problemas:** sem base (tudo seco).

**Justificativa:** Refeita: 30 g de aveia (era 40), as mesmas tâmaras e cacau, e 250 ml de leite de aveia como base. Continua vegana.

**ANTES** · declarado P7 C62 G3 · 303 kcal · recalculado P7,3 C66,3 G3,4 · 297 kcal · volume 93 ml (xícara cheia 103 ml) · contains — (vegana)

| en | pt-BR |
|---|---|
| 40g Oats | 40g Aveia |
| 2 Dates | 2 Tâmaras |
| 1 tbsp Cacao powder | 1 colher(es) de sopa Cacau em pó |

1. Add the oats and dates to the BLENDi cup.<br>Adicione aveia e tâmaras ao copo do BLENDi.
2. Add the cacao powder and close the lid.<br>Acrescente cacau em pó e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

**DEPOIS** · declarar **P8 C76 G7 · 371 kcal** · volume **333 ml** no leitor novo (xícara cheia 343 ml) · contains **— (vegana)**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 30g Oats | 30g Aveia | 30,0 | 4,0 | 20,4 | 1,9 | 114 | B: Rolled oats |
| 2 Dates | 2 Tâmaras | 48,0 | 0,9 | 36,0 | 0,1 | 133 | U 09421 Dates, medjool |
| 1 tbsp Cacao powder | 1 colher(es) de sopa Cacau em pó | 5,4 | 1,1 | 3,1 | 0,7 | 12 | U 19165 Cocoa, dry powder, unsweetened |
| 250ml Oat milk | 250ml Leite de aveia | 250,0 | 2,5 | 16,2 | 3,8 | 112 | B: Oat milk |
| **Total** | | | **8,5** | **75,8** | **6,5** | **371** | 4/4/9: 396 kcal |

1. Add the oats, dates and cacao powder to the cup.<br>Adicione aveia, tâmaras e cacau em pó ao copo.
2. Add the oat milk and close the lid.<br>Acrescente leite de aveia e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

<a id="energy20"></a>
#### Energy20 — Coconut Pineapple Energy / Energia de Coco com Abacaxi

**Problemas:** volume acima de 400 ml; leite com tipo (low-fat); macros fora de ±10% (gordura).

**Justificativa:** Leite de 250 para 200 ml, sem tipo; macros pela soma.

**ANTES** · declarado P9 C36 G4 · 216 kcal · recalculado P9,7 C35,4 G6,1 · 223 kcal · volume 430 ml (xícara cheia 501 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 cup Pineapple | 1 xícara Abacaxi |
| 1 tbsp Coconut flakes | 1 colher(es) de sopa Coco em flocos |
| 250ml Low-fat milk | 250ml Leite desnatado |

1. Add the pineapple and coconut flakes to the BLENDi cup.<br>Adicione abacaxi e coco em flocos ao copo do BLENDi.
2. Add the low-fat milk and close the lid.<br>Acrescente leite desnatado e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

**DEPOIS** · declarar **P8 C33 G8 · 218 kcal** · volume **380 ml** no leitor novo (xícara cheia 451 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 cup Pineapple | 1 xícara Abacaxi | 165,0 | 0,9 | 21,6 | 0,2 | 82 | U 09266 Pineapple |
| 1 tbsp Coconut flakes | 1 colher(es) de sopa Coco em flocos | 5,3 | 0,4 | 1,3 | 3,4 | 35 | U 12108 Coconut, desiccated, not sweetened |
| 200ml Milk | 200ml Leite | 200,0 | 6,6 | 9,6 | 4,0 | 100 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **7,9** | **32,5** | **7,6** | **218** | 4/4/9: 230 kcal |

1. Add the pineapple and coconut flakes to the cup.<br>Adicione abacaxi e coco em flocos ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your energy blend.<br>Sirva imediatamente e aproveite seu blend de energia.

### Recovery

<a id="recovery01"></a>
#### Recovery01 — Golden Recovery Smoothie / Smoothie Dourado Recovery

**Problemas:** macros declarados errados (receita original); volume acima de 400 ml.

**Justificativa:** Água de coco de 250 para 200 ml; macros pela soma (13 g → 2 g de gordura).

**ANTES** · declarado P24 C20 G13 · 290 kcal · recalculado P25,2 C33,3 G2,2 · 244 kcal · volume 445 ml (xícara cheia 517 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 scoop Whey protein | 1 dose Whey protein |
| 1 cup Pineapple | 1 xícara Abacaxi |
| 250ml Coconut water | 250ml Água de coco |

1. Add the whey protein and pineapple to the BLENDi cup.<br>Adicione whey protein e abacaxi ao copo do BLENDi.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

**DEPOIS** · declarar **P25 C31 G2 · 235 kcal** · volume **395 ml** no leitor novo (xícara cheia 467 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop Whey protein | 1 dose Whey protein | 30,0 | 22,5 | 2,4 | 1,5 | 114 | B: Whey protein concentrate |
| 1 cup Pineapple | 1 xícara Abacaxi | 165,0 | 0,9 | 21,6 | 0,2 | 82 | U 09266 Pineapple |
| 200ml Coconut water | 200ml Água de coco | 200,0 | 1,4 | 7,4 | 0,4 | 38 | U 12119 Coconut water |
| **Total** | | | **24,8** | **31,5** | **2,1** | **234** | 4/4/9: 244 kcal |

1. Add the whey protein and pineapple to the cup.<br>Adicione whey protein e abacaxi ao copo.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

<a id="recovery02"></a>
#### Recovery02 — Tart Cherry Recovery / Recuperação com Cereja Ácida

**Problemas:** volume acima de 400 ml; macros fora de ±10% (carboidrato, kcal).

**Justificativa:** Leite de aveia de 200 para 180 ml; macros pela soma.

**ANTES** · declarado P21 C35 G6 · 278 kcal · recalculado P22,9 C45,9 G6,8 · 346 kcal · volume 419 ml (xícara cheia 430 ml) · contains dairy

| en | pt-BR |
|---|---|
| 2 tbsp Unsweetened tart cherry concentrate | 2 colher(es) de sopa Concentrado de cereja ácida sem açúcar |
| 200g Greek yogurt | 200g Iogurte grego |
| 200ml Oat milk | 200ml Leite de aveia |

1. Add the unsweetened tart cherry concentrate and greek yogurt to the BLENDi cup.<br>Adicione concentrado de cereja ácida sem açúcar e iogurte grego ao copo do BLENDi.
2. Add the oat milk and close the lid.<br>Acrescente leite de aveia e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

**DEPOIS** · declarar **P23 C45 G7 · 337 kcal** · volume **399 ml** no leitor novo (xícara cheia 410 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 2 tbsp Unsweetened tart cherry concentrate | 2 colher(es) de sopa Concentrado de cereja ácida sem açúcar | 30,0 | 1,0 | 25,0 | 0,0 | 110 | FDC 2286580 Tart cherry concentrate (Cherry Bay), 1 oz = 30 ml |
| 200g Greek yogurt | 200g Iogurte grego | 200,0 | 19,9 | 7,9 | 3,8 | 146 | U 01287 Yogurt, Greek, plain, lowfat (referência única do "Iogurte grego") |
| 180ml Oat milk | 180ml Leite de aveia | 180,0 | 1,8 | 11,7 | 2,7 | 81 | B: Oat milk |
| **Total** | | | **22,7** | **44,6** | **6,5** | **337** | 4/4/9: 328 kcal |

1. Add the unsweetened tart cherry concentrate and greek yogurt to the cup.<br>Adicione concentrado de cereja ácida sem açúcar e iogurte grego ao copo.
2. Add the oat milk and close the lid.<br>Acrescente leite de aveia e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

<a id="recovery04"></a>
#### Recovery04 — Cherry Protein Recharge / Recarga Proteica com Cereja

**Problemas:** macros fora de ±10% (carboidrato, kcal).

**Justificativa:** Só os macros mudam (o concentrado de cereja tem mais açúcar que o declarado).

**ANTES** · declarado P24 C26 G2 · 218 kcal · recalculado P25,3 C36,7 G2,0 · 272 kcal · volume 299 ml (xícara cheia 310 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 scoop Whey protein | 1 dose Whey protein |
| 2 tbsp Unsweetened tart cherry concentrate | 2 colher(es) de sopa Concentrado de cereja ácida sem açúcar |
| 250ml Coconut water | 250ml Água de coco |

1. Add the whey protein and unsweetened tart cherry concentrate to the BLENDi cup.<br>Adicione whey protein e concentrado de cereja ácida sem açúcar ao copo do BLENDi.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

**DEPOIS** · declarar **P25 C37 G2 · 272 kcal** · volume **299 ml** no leitor novo (xícara cheia 310 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop Whey protein | 1 dose Whey protein | 30,0 | 22,5 | 2,4 | 1,5 | 114 | B: Whey protein concentrate |
| 2 tbsp Unsweetened tart cherry concentrate | 2 colher(es) de sopa Concentrado de cereja ácida sem açúcar | 30,0 | 1,0 | 25,0 | 0,0 | 110 | FDC 2286580 Tart cherry concentrate (Cherry Bay), 1 oz = 30 ml |
| 250ml Coconut water | 250ml Água de coco | 250,0 | 1,8 | 9,3 | 0,5 | 48 | U 12119 Coconut water |
| **Total** | | | **25,3** | **36,7** | **2,0** | **272** | 4/4/9: 266 kcal |

1. Add the whey protein and unsweetened tart cherry concentrate to the cup.<br>Adicione whey protein e concentrado de cereja ácida sem açúcar ao copo.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

<a id="recovery07"></a>
#### Recovery07 — Banana Coconut Recharge / Recarga de Banana com Coco

**Problemas:** Recovery sem opção vegana.

**Justificativa:** Proteína vegetal no lugar do whey: vira vegana e sem laticínios.

**ANTES** · declarado P26 C39 G2 · 278 kcal · recalculado P25,6 C38,8 G2,4 · 267 kcal · volume 398 ml (xícara cheia 398 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 scoop Whey protein | 1 dose Whey protein |
| 1 medium Banana | 1 unidade média Banana |
| 250ml Coconut water | 250ml Água de coco |

1. Add the whey protein and banana to the BLENDi cup.<br>Adicione whey protein e banana ao copo do BLENDi.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

**DEPOIS** · declarar **P24 C39 G3 · 265 kcal** · volume **398 ml** no leitor novo (xícara cheia 398 ml) · contains **— (vegana)**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop Plant protein powder | 1 dose Proteína vegetal em pó | 30,0 | 21,0 | 2,7 | 1,8 | 112 | B: Plant protein powder |
| 1 medium Banana | 1 unidade média Banana | 118,0 | 1,3 | 27,1 | 0,4 | 105 | B: Ripe banana (fibra U 09040) |
| 250ml Coconut water | 250ml Água de coco | 250,0 | 1,8 | 9,3 | 0,5 | 48 | U 12119 Coconut water |
| **Total** | | | **24,1** | **39,1** | **2,7** | **265** | 4/4/9: 277 kcal |

1. Add the plant protein powder and banana to the cup.<br>Adicione proteína vegetal em pó e banana ao copo.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

<a id="recovery09"></a>
#### Recovery09 — Blueberry Protein Recovery / Recuperação com Mirtilo

**Problemas:** volume acima de 400 ml; Recovery sem opção vegana.

**Justificativa:** Proteína vegetal no lugar do whey e água de coco de 250 para 220 ml.

**ANTES** · declarado P26 C33 G2 · 254 kcal · recalculado P25,3 C33,1 G2,4 · 246 kcal · volume 428 ml (xícara cheia 517 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 scoop Whey protein | 1 dose Whey protein |
| 1 cup Blueberries | 1 xícara Mirtilo |
| 250ml Coconut water | 250ml Água de coco |

1. Add the whey protein and blueberries to the BLENDi cup.<br>Adicione whey protein e mirtilo ao copo do BLENDi.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

**DEPOIS** · declarar **P24 C32 G3 · 239 kcal** · volume **398 ml** no leitor novo (xícara cheia 487 ml) · contains **— (vegana)**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop Plant protein powder | 1 dose Proteína vegetal em pó | 30,0 | 21,0 | 2,7 | 1,8 | 112 | B: Plant protein powder |
| 1 cup Blueberries | 1 xícara Mirtilo | 148,0 | 1,0 | 21,5 | 0,4 | 84 | B: Blueberry |
| 220ml Coconut water | 220ml Água de coco | 220,0 | 1,6 | 8,2 | 0,4 | 42 | U 12119 Coconut water |
| **Total** | | | **23,6** | **32,3** | **2,7** | **239** | 4/4/9: 248 kcal |

1. Add the plant protein powder and blueberries to the cup.<br>Adicione proteína vegetal em pó e mirtilo ao copo.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

<a id="recovery10"></a>
#### Recovery10 — Beet Cherry Recharge / Recarga de Beterraba com Cereja

**Problemas:** macros fora de ±10% (carboidrato, kcal).

**Justificativa:** Só os macros mudam.

**ANTES** · declarado P16 C27 G3 · 199 kcal · recalculado P17,4 C39,4 G3,0 · 257 kcal · volume 288 ml (xícara cheia 298 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1/2 cup Cooked beet | 1/2 xícara Beterraba cozida |
| 2 tbsp Unsweetened tart cherry concentrate | 2 colher(es) de sopa Concentrado de cereja ácida sem açúcar |
| 150g Greek yogurt | 150g Iogurte grego |

1. Add the cooked beet and unsweetened tart cherry concentrate to the BLENDi cup.<br>Adicione beterraba cozida e concentrado de cereja ácida sem açúcar ao copo do BLENDi.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

**DEPOIS** · declarar **P17 C39 G3 · 257 kcal** · volume **288 ml** no leitor novo (xícara cheia 298 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1/2 cup Cooked beet | 1/2 xícara Beterraba cozida | 85,0 | 1,4 | 8,5 | 0,2 | 37 | U 11081 Beets, cooked |
| 2 tbsp Unsweetened tart cherry concentrate | 2 colher(es) de sopa Concentrado de cereja ácida sem açúcar | 30,0 | 1,0 | 25,0 | 0,0 | 110 | FDC 2286580 Tart cherry concentrate (Cherry Bay), 1 oz = 30 ml |
| 150g Greek yogurt | 150g Iogurte grego | 150,0 | 14,9 | 5,9 | 2,9 | 110 | U 01287 Yogurt, Greek, plain, lowfat (referência única do "Iogurte grego") |
| **Total** | | | **17,4** | **39,4** | **3,0** | **257** | 4/4/9: 254 kcal |

1. Add the cooked beet and unsweetened tart cherry concentrate to the cup.<br>Adicione beterraba cozida e concentrado de cereja ácida sem açúcar ao copo.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

<a id="recovery11"></a>
#### Recovery11 — Papaya Protein Soothe / Mamão Proteico Calmante

**Problemas:** volume acima de 400 ml.

**Justificativa:** Água de coco de 250 para 220 ml.

**ANTES** · declarado P25 C28 G2 · 230 kcal · recalculado P25,0 C27,4 G2,4 · 224 kcal · volume 425 ml (xícara cheia 517 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 scoop Whey protein | 1 dose Whey protein |
| 1 cup Papaya | 1 xícara Mamão |
| 250ml Coconut water | 250ml Água de coco |

1. Add the whey protein and papaya to the BLENDi cup.<br>Adicione whey protein e mamão ao copo do BLENDi.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

**DEPOIS** · declarar **P25 C26 G2 · 218 kcal** · volume **395 ml** no leitor novo (xícara cheia 487 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop Whey protein | 1 dose Whey protein | 30,0 | 22,5 | 2,4 | 1,5 | 114 | B: Whey protein concentrate |
| 1 cup Papaya | 1 xícara Mamão | 145,0 | 0,7 | 15,7 | 0,4 | 62 | U 09226 Papayas |
| 220ml Coconut water | 220ml Água de coco | 220,0 | 1,6 | 8,2 | 0,4 | 42 | U 12119 Coconut water |
| **Total** | | | **24,8** | **26,3** | **2,3** | **218** | 4/4/9: 225 kcal |

1. Add the whey protein and papaya to the cup.<br>Adicione whey protein e mamão ao copo.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

<a id="recovery14"></a>
#### Recovery14 — Ginger Orange Revive / Gengibre com Laranja

**Problemas:** Recovery sem opção vegana.

**Justificativa:** Proteína vegetal + bebida de soja no lugar do iogurte grego: vegana, sem laticínios, com mais proteína (16 → 28 g).

**ANTES** · declarado P16 C21 G3 · 175 kcal · recalculado P16,2 C21,7 G3,1 · 173 kcal · volume 286 ml (xícara cheia 286 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 tsp grated Fresh ginger | 1 colher de chá ralada Gengibre fresco |
| 1 medium Orange | 1 unidade média Laranja |
| 150g Greek yogurt | 150g Iogurte grego |

1. Add the fresh ginger and orange to the BLENDi cup.<br>Adicione gengibre fresco e laranja ao copo do BLENDi.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

**DEPOIS** · declarar **P28 C22 G5 · 242 kcal** · volume **366 ml** no leitor novo (xícara cheia 366 ml) · contains **— (vegana)**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 tsp grated Fresh ginger | 1 colher de chá ralada Gengibre fresco | 2,0 | 0,0 | 0,4 | 0,0 | 2 | U 11216 Ginger root |
| 1 medium Orange | 1 unidade média Laranja | 131,0 | 1,2 | 15,4 | 0,2 | 62 | U 09200 Oranges |
| 1 scoop Plant protein powder | 1 dose Proteína vegetal em pó | 30,0 | 21,0 | 2,7 | 1,8 | 112 | B: Plant protein powder |
| 200ml Unsweetened soy milk | 200ml Bebida de soja sem açúcar | 200,0 | 5,7 | 3,5 | 3,2 | 66 | U 16222 Soymilk, unsweetened |
| **Total** | | | **28,0** | **21,9** | **5,2** | **242** | 4/4/9: 246 kcal |

1. Add the fresh ginger, orange and plant protein powder to the cup.<br>Adicione gengibre fresco, laranja e proteína vegetal em pó ao copo.
2. Add the unsweetened soy milk and close the lid.<br>Acrescente bebida de soja sem açúcar e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

<a id="recovery15"></a>
#### Recovery15 — Berry Protein Recovery / Recuperação Proteica com Frutas Vermelhas

**Problemas:** volume acima de 400 ml.

**Justificativa:** Água de coco de 250 para 220 ml.

**ANTES** · declarado P26 C27 G2 · 230 kcal · recalculado P25,7 C27,2 G2,6 · 227 kcal · volume 422 ml (xícara cheia 517 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 scoop Whey protein | 1 dose Whey protein |
| 1 cup Mixed berries | 1 xícara Mix de frutas vermelhas |
| 250ml Coconut water | 250ml Água de coco |

1. Add the whey protein and mixed berries to the BLENDi cup.<br>Adicione whey protein e mix de frutas vermelhas ao copo do BLENDi.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

**DEPOIS** · declarar **P26 C26 G3 · 221 kcal** · volume **392 ml** no leitor novo (xícara cheia 487 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop Whey protein | 1 dose Whey protein | 30,0 | 22,5 | 2,4 | 1,5 | 114 | B: Whey protein concentrate |
| 1 cup Mixed berries | 1 xícara Mix de frutas vermelhas | 142,0 | 1,4 | 15,5 | 0,6 | 65 | média de morango, mirtilo, framboesa e amora (mesmas fontes) |
| 220ml Coconut water | 220ml Água de coco | 220,0 | 1,6 | 8,2 | 0,4 | 42 | U 12119 Coconut water |
| **Total** | | | **25,5** | **26,1** | **2,6** | **221** | 4/4/9: 229 kcal |

1. Add the whey protein and mixed berries to the cup.<br>Adicione whey protein e mix de frutas vermelhas ao copo.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

<a id="recovery16"></a>
#### Recovery16 — Golden Pineapple Protein / Proteína Dourada com Abacaxi

**Problemas:** sem base (vira pasta); Recovery sem opção vegana.

**Justificativa:** Ganha 190 ml de água de coco como base e proteína vegetal no lugar do whey.

**ANTES** · declarado P25 C26 G2 · 222 kcal · recalculado P23,7 C26,1 G1,8 · 206 kcal · volume 200 ml (xícara cheia 272 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 tsp Turmeric | 1 colher de chá Cúrcuma |
| 1 cup Pineapple | 1 xícara Abacaxi |
| 1 scoop Whey protein | 1 dose Whey protein |

1. Add the turmeric and pineapple to the BLENDi cup.<br>Adicione cúrcuma e abacaxi ao copo do BLENDi.
2. Add the whey protein and close the lid.<br>Acrescente whey protein e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

**DEPOIS** · declarar **P24 C33 G2 · 240 kcal** · volume **390 ml** no leitor novo (xícara cheia 462 ml) · contains **— (vegana)**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 tsp Turmeric | 1 colher de chá Cúrcuma | 3,0 | 0,3 | 2,0 | 0,1 | 9 | U 02043 Turmeric, ground |
| 1 cup Pineapple | 1 xícara Abacaxi | 165,0 | 0,9 | 21,6 | 0,2 | 82 | U 09266 Pineapple |
| 1 scoop Plant protein powder | 1 dose Proteína vegetal em pó | 30,0 | 21,0 | 2,7 | 1,8 | 112 | B: Plant protein powder |
| 190ml Coconut water | 190ml Água de coco | 190,0 | 1,4 | 7,0 | 0,4 | 36 | U 12119 Coconut water |
| **Total** | | | **23,5** | **33,4** | **2,5** | **240** | 4/4/9: 250 kcal |

1. Add the turmeric, pineapple and plant protein powder to the cup.<br>Adicione cúrcuma, abacaxi e proteína vegetal em pó ao copo.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

<a id="recovery17"></a>
#### Recovery17 — Hemp Cherry Recovery / Cânhamo com Cereja

**Problemas:** macros fora de ±10% (carboidrato, kcal).

**Justificativa:** Só os macros mudam.

**ANTES** · declarado P18 C21 G7 · 219 kcal · recalculado P19,1 C31,8 G7,8 · 275 kcal · volume 184 ml (xícara cheia 194 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 tbsp Hemp seeds | 1 colher(es) de sopa Semente de cânhamo |
| 2 tbsp Unsweetened tart cherry concentrate | 2 colher(es) de sopa Concentrado de cereja ácida sem açúcar |
| 150g Greek yogurt | 150g Iogurte grego |

1. Add the hemp seeds and unsweetened tart cherry concentrate to the BLENDi cup.<br>Adicione semente de cânhamo e concentrado de cereja ácida sem açúcar ao copo do BLENDi.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

**DEPOIS** · declarar **P19 C32 G8 · 275 kcal** · volume **184 ml** no leitor novo (xícara cheia 194 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 tbsp Hemp seeds | 1 colher(es) de sopa Semente de cânhamo | 10,0 | 3,2 | 0,9 | 4,9 | 55 | U 12012 Hemp seed, hulled |
| 2 tbsp Unsweetened tart cherry concentrate | 2 colher(es) de sopa Concentrado de cereja ácida sem açúcar | 30,0 | 1,0 | 25,0 | 0,0 | 110 | FDC 2286580 Tart cherry concentrate (Cherry Bay), 1 oz = 30 ml |
| 150g Greek yogurt | 150g Iogurte grego | 150,0 | 14,9 | 5,9 | 2,9 | 110 | U 01287 Yogurt, Greek, plain, lowfat (referência única do "Iogurte grego") |
| **Total** | | | **19,1** | **31,8** | **7,8** | **275** | 4/4/9: 273 kcal |

1. Add the hemp seeds and unsweetened tart cherry concentrate to the cup.<br>Adicione semente de cânhamo e concentrado de cereja ácida sem açúcar ao copo.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

<a id="recovery18"></a>
#### Recovery18 — Kiwi Protein Refresh / Kiwi Proteico Refrescante

**Problemas:** volume acima de 400 ml.

**Justificativa:** Água de coco de 250 para 230 ml.

**ANTES** · declarado P26 C32 G2 · 250 kcal · recalculado P25,9 C31,9 G2,7 · 246 kcal · volume 418 ml (xícara cheia 418 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1 scoop Whey protein | 1 dose Whey protein |
| 2 Kiwi | 2 Kiwi |
| 250ml Coconut water | 250ml Água de coco |

1. Add the whey protein and kiwi to the BLENDi cup.<br>Adicione whey protein e kiwi ao copo do BLENDi.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

**DEPOIS** · declarar **P26 C31 G3 · 242 kcal** · volume **398 ml** no leitor novo (xícara cheia 398 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop Whey protein | 1 dose Whey protein | 30,0 | 22,5 | 2,4 | 1,5 | 114 | B: Whey protein concentrate |
| 2 Kiwi | 2 Kiwi | 138,0 | 1,6 | 20,2 | 0,7 | 84 | U 09148 Kiwifruit, green |
| 230ml Coconut water | 230ml Água de coco | 230,0 | 1,7 | 8,5 | 0,5 | 44 | U 12119 Coconut water |
| **Total** | | | **25,7** | **31,2** | **2,7** | **242** | 4/4/9: 252 kcal |

1. Add the whey protein and kiwi to the cup.<br>Adicione whey protein e kiwi ao copo.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

<a id="recovery19"></a>
#### Recovery19 — Beet Orange Recharge / Recarga de Beterraba com Laranja → Strawberry Protein Recovery / Recuperação Proteica com Morango

**Problemas:** repetida (= Wellness14).

**Justificativa:** Receita nova no padrão Recovery (proteína + fruta + água de coco). A beterraba com laranja fica só no Wellness14.

**ANTES** · declarado P17 C28 G3 · 207 kcal · recalculado P17,6 C29,8 G3,2 · 208 kcal · volume 399 ml (xícara cheia 399 ml) · contains dairy

| en | pt-BR |
|---|---|
| 1/2 cup Cooked beet | 1/2 xícara Beterraba cozida |
| 1 medium Orange | 1 unidade média Laranja |
| 150g Greek yogurt | 150g Iogurte grego |

1. Add the cooked beet and orange to the BLENDi cup.<br>Adicione beterraba cozida e laranja ao copo do BLENDi.
2. Add the greek yogurt and close the lid.<br>Acrescente iogurte grego e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

**DEPOIS** · declarar **P25 C22 G2 · 201 kcal** · volume **382 ml** no leitor novo (xícara cheia 467 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop Whey protein | 1 dose Whey protein | 30,0 | 22,5 | 2,4 | 1,5 | 114 | B: Whey protein concentrate |
| 1 cup Strawberries | 1 xícara Morango | 152,0 | 1,1 | 11,7 | 0,5 | 49 | B: Strawberry |
| 200ml Coconut water | 200ml Água de coco | 200,0 | 1,4 | 7,4 | 0,4 | 38 | U 12119 Coconut water |
| **Total** | | | **25,0** | **21,5** | **2,4** | **201** | 4/4/9: 207 kcal |

1. Add the whey protein and strawberries to the cup.<br>Adicione whey protein e morango ao copo.
2. Add the coconut water and close the lid.<br>Acrescente água de coco e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your recovery blend.<br>Sirva imediatamente e aproveite seu blend de recuperação.

### Weight Loss

<a id="weightloss01"></a>
#### WeightLoss01 — Raspberry Whey Shake / Shake de Whey com Framboesa

**Problemas:** congelado; leite com tipo (skim).

**Justificativa:** Framboesa fresca; "Skim milk" vira "Milk".

**ANTES** · declarado P34 C26 G2 · 244 kcal · recalculado P33,8 C26,1 G1,5 · 244 kcal · volume 355 ml (xícara cheia 355 ml) · contains dairy, animal

| en | pt-BR |
|---|---|
| 1 scoop (30g) Whey protein isolate | 1 dose (30g) Whey protein isolado |
| 125g Frozen raspberries | 125g Framboesas congeladas |
| 200ml Skim milk | 200ml Leite desnatado |

1. Add the whey protein isolate and frozen raspberries to the BLENDi cup.<br>Adicione whey protein isolado e framboesas congeladas ao copo do BLENDi.
2. Add the skim milk and close the lid.<br>Acrescente leite desnatado e feche a tampa.
3. Pulse 8 times to break down the frozen pieces, then blend on high for 15 seconds until smooth.<br>Pulse 8 vezes para quebrar os pedaços congelados, depois bata em velocidade alta por 15 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

**DEPOIS** · declarar **P34 C26 G5 · 276 kcal** · volume **355 ml** no leitor novo (xícara cheia 355 ml) · contains **dairy, animal**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop (30g) Whey protein isolate | 1 dose (30g) Whey protein isolado | 30,0 | 25,5 | 1,2 | 0,3 | 111 | B: Whey protein isolate |
| 125g Raspberries | 125g Framboesas | 125,0 | 1,5 | 14,9 | 0,8 | 65 | U 09302 Raspberries |
| 200ml Milk | 200ml Leite | 200,0 | 6,6 | 9,6 | 4,0 | 100 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **33,6** | **25,7** | **5,1** | **276** | 4/4/9: 283 kcal |

1. Add the whey protein isolate and raspberries to the cup.<br>Adicione whey protein isolado e framboesas ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

Regras do WeightLoss (CP-1.1.9): 276 kcal (180-320), proteína 49% das kcal (≥ 25%), fibra 8,1 g (≥ 1,5), sem gelo e sem açúcar adicionado.

<a id="weightloss02"></a>
#### WeightLoss02 — Strawberry Plant Protein / Proteína Vegetal com Morango

**Problemas:** congelado.

**Justificativa:** Morango fresco.

**ANTES** · declarado P28 C18 G5 · 227 kcal · recalculado P27,8 C17,7 G5,5 · 226 kcal · volume 380 ml (xícara cheia 380 ml) · contains — (vegana)

| en | pt-BR |
|---|---|
| 1 scoop (30g) Plant protein powder | 1 dose (30g) Proteína vegetal em pó |
| 150g Frozen strawberries | 150g Morangos congelados |
| 200ml Unsweetened soy milk | 200ml Bebida de soja sem açúcar |

1. Add the plant protein powder and frozen strawberries to the BLENDi cup.<br>Adicione proteína vegetal em pó e morangos congelados ao copo do BLENDi.
2. Add the unsweetened soy milk and close the lid.<br>Acrescente bebida de soja sem açúcar e feche a tampa.
3. Pulse 8 times to break down the frozen pieces, then blend on high for 15 seconds until smooth.<br>Pulse 8 vezes para quebrar os pedaços congelados, depois bata em velocidade alta por 15 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

**DEPOIS** · declarar **P28 C18 G5 · 227 kcal** · volume **380 ml** no leitor novo (xícara cheia 380 ml) · contains **— (vegana)**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop (30g) Plant protein powder | 1 dose (30g) Proteína vegetal em pó | 30,0 | 21,0 | 2,7 | 1,8 | 112 | B: Plant protein powder |
| 150g Strawberries | 150g Morangos | 150,0 | 1,1 | 11,6 | 0,5 | 48 | B: Strawberry |
| 200ml Unsweetened soy milk | 200ml Bebida de soja sem açúcar | 200,0 | 5,7 | 3,5 | 3,2 | 66 | U 16222 Soymilk, unsweetened |
| **Total** | | | **27,8** | **17,7** | **5,5** | **226** | 4/4/9: 231 kcal |

1. Add the plant protein powder and strawberries to the cup.<br>Adicione proteína vegetal em pó e morangos ao copo.
2. Add the unsweetened soy milk and close the lid.<br>Acrescente bebida de soja sem açúcar e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

Regras do WeightLoss (CP-1.1.9): 227 kcal (180-320), proteína 49% das kcal (≥ 25%), fibra 4,0 g (≥ 1,5), sem gelo e sem açúcar adicionado.

<a id="weightloss03"></a>
#### WeightLoss03 — Blueberry Chia Yogurt / Iogurte com Mirtilo e Chia

**Problemas:** congelado.

**Justificativa:** Mirtilo fresco.

**ANTES** · declarado P23 C27 G5 · 233 kcal · recalculado P22,7 C26,8 G4,8 · 233 kcal · volume 312 ml (xícara cheia 312 ml) · contains dairy

| en | pt-BR |
|---|---|
| 200g Nonfat Greek yogurt | 200g Iogurte grego desnatado |
| 100g Frozen blueberries | 100g Mirtilos congelados |
| 1 tbsp (12g) Chia seeds | 1 colher de sopa (12g) Semente de chia |

1. Add the nonfat Greek yogurt and frozen blueberries to the BLENDi cup.<br>Adicione iogurte grego desnatado e mirtilos congelados ao copo do BLENDi.
2. Add the chia seeds and close the lid.<br>Acrescente semente de chia e feche a tampa.
3. Pulse 8 times to break down the frozen pieces, then blend on high for 15 seconds until smooth.<br>Pulse 8 vezes para quebrar os pedaços congelados, depois bata em velocidade alta por 15 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

**DEPOIS** · declarar **P23 C27 G5 · 233 kcal** · volume **312 ml** no leitor novo (xícara cheia 312 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 200g Nonfat Greek yogurt | 200g Iogurte grego desnatado | 200,0 | 20,0 | 7,2 | 0,8 | 118 | B: Nonfat Greek yogurt |
| 100g Blueberries | 100g Mirtilos | 100,0 | 0,7 | 14,5 | 0,3 | 57 | B: Blueberry |
| 1 tbsp (12g) Chia seeds | 1 colher de sopa (12g) Semente de chia | 12,0 | 2,0 | 5,1 | 3,7 | 58 | U 12006 Chia seeds |
| **Total** | | | **22,7** | **26,8** | **4,8** | **233** | 4/4/9: 241 kcal |

1. Add the nonfat greek yogurt and blueberries to the cup.<br>Adicione iogurte grego desnatado e mirtilos ao copo.
2. Add the chia seeds and close the lid.<br>Acrescente semente de chia e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

Regras do WeightLoss (CP-1.1.9): 233 kcal (180-320), proteína 39% das kcal (≥ 25%), fibra 6,5 g (≥ 1,5), sem gelo e sem açúcar adicionado.

<a id="weightloss05"></a>
#### WeightLoss05 — Peach Cottage Blend / Blend de Cottage com Pêssego

**Problemas:** congelado; leite com tipo (skim).

**Justificativa:** Pêssego fresco; "Milk".

**ANTES** · declarado P23 C23 G2 · 201 kcal · recalculado P23,3 C23,4 G2,1 · 200 kcal · volume 400 ml (xícara cheia 400 ml) · contains dairy

| en | pt-BR |
|---|---|
| 150g Low-fat cottage cheese | 150g Queijo cottage light |
| 150g Frozen peach slices | 150g Fatias de pêssego congelado |
| 100ml Skim milk | 100ml Leite desnatado |

1. Add the low-fat cottage cheese and frozen peach slices to the BLENDi cup.<br>Adicione queijo cottage light e fatias de pêssego congelado ao copo do BLENDi.
2. Add the skim milk and close the lid.<br>Acrescente leite desnatado e feche a tampa.
3. Pulse 8 times to break down the frozen pieces, then blend on high for 15 seconds until smooth.<br>Pulse 8 vezes para quebrar os pedaços congelados, depois bata em velocidade alta por 15 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

**DEPOIS** · declarar **P23 C23 G4 · 217 kcal** · volume **400 ml** no leitor novo (xícara cheia 400 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 150g Low-fat cottage cheese | 150g Queijo cottage light | 150,0 | 18,6 | 4,1 | 1,5 | 108 | U 01016 Cottage cheese, lowfat 1% |
| 150g Peach slices | 150g Fatias de pêssego | 150,0 | 1,4 | 14,3 | 0,4 | 58 | U 09236 Peaches |
| 100ml Milk | 100ml Leite | 100,0 | 3,3 | 4,8 | 2,0 | 50 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **23,2** | **23,2** | **3,9** | **216** | 4/4/9: 221 kcal |

1. Add the low-fat cottage cheese and peach slices to the cup.<br>Adicione queijo cottage light e fatias de pêssego ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

Regras do WeightLoss (CP-1.1.9): 217 kcal (180-320), proteína 42% das kcal (≥ 25%), fibra 2,2 g (≥ 1,5), sem gelo e sem açúcar adicionado.

<a id="weightloss07"></a>
#### WeightLoss07 — Pineapple Whey Refresher / Refresco de Whey com Abacaxi

**Problemas:** congelado.

**Justificativa:** Abacaxi fresco.

**ANTES** · declarado P26 C21 G0 · 186 kcal · recalculado P26,3 C20,9 G0,5 · 186 kcal · volume 400 ml (xícara cheia 400 ml) · contains dairy, animal

| en | pt-BR |
|---|---|
| 1 scoop (30g) Whey protein isolate | 1 dose (30g) Whey protein isolado |
| 150g Frozen pineapple chunks | 150g Pedaços de abacaxi congelado |
| 220ml Water | 220ml Água |

1. Add the whey protein isolate and frozen pineapple chunks to the BLENDi cup.<br>Adicione whey protein isolado e pedaços de abacaxi congelado ao copo do BLENDi.
2. Add the water and close the lid.<br>Acrescente água e feche a tampa.
3. Pulse 8 times to break down the frozen pieces, then blend on high for 15 seconds until smooth.<br>Pulse 8 vezes para quebrar os pedaços congelados, depois bata em velocidade alta por 15 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

**DEPOIS** · declarar **P26 C21 G0 · 186 kcal** · volume **400 ml** no leitor novo (xícara cheia 400 ml) · contains **dairy, animal**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop (30g) Whey protein isolate | 1 dose (30g) Whey protein isolado | 30,0 | 25,5 | 1,2 | 0,3 | 111 | B: Whey protein isolate |
| 150g Pineapple chunks | 150g Pedaços de abacaxi | 150,0 | 0,8 | 19,7 | 0,2 | 75 | U 09266 Pineapple |
| 220ml Water | 220ml Água | 220,0 | 0,0 | 0,0 | 0,0 | 0 | - |
| **Total** | | | **26,3** | **20,9** | **0,5** | **186** | 4/4/9: 193 kcal |

1. Add the whey protein isolate and pineapple chunks to the cup.<br>Adicione whey protein isolado e pedaços de abacaxi ao copo.
2. Add the water and close the lid.<br>Acrescente água e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

Regras do WeightLoss (CP-1.1.9): 186 kcal (180-320), proteína 56% das kcal (≥ 25%), fibra 2,1 g (≥ 1,5), sem gelo e sem açúcar adicionado.

<a id="weightloss08"></a>
#### WeightLoss08 — Strawberry Oat Yogurt / Iogurte com Morango e Aveia

**Problemas:** congelado.

**Justificativa:** Morango fresco.

**ANTES** · declarado P19 C31 G2 · 212 kcal · recalculado P18,8 C30,6 G2,4 · 212 kcal · volume 320 ml (xícara cheia 320 ml) · contains dairy

| en | pt-BR |
|---|---|
| 150g Nonfat Greek yogurt | 150g Iogurte grego desnatado |
| 150g Frozen strawberries | 150g Morangos congelados |
| 20g Rolled oats | 20g Aveia em flocos |

1. Add the nonfat Greek yogurt and frozen strawberries to the BLENDi cup.<br>Adicione iogurte grego desnatado e morangos congelados ao copo do BLENDi.
2. Add the rolled oats and close the lid.<br>Acrescente aveia em flocos e feche a tampa.
3. Pulse 8 times to break down the frozen pieces, then blend on high for 15 seconds until smooth.<br>Pulse 8 vezes para quebrar os pedaços congelados, depois bata em velocidade alta por 15 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

**DEPOIS** · declarar **P19 C31 G2 · 212 kcal** · volume **320 ml** no leitor novo (xícara cheia 320 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 150g Nonfat Greek yogurt | 150g Iogurte grego desnatado | 150,0 | 15,0 | 5,4 | 0,6 | 88 | B: Nonfat Greek yogurt |
| 150g Strawberries | 150g Morangos | 150,0 | 1,1 | 11,6 | 0,5 | 48 | B: Strawberry |
| 20g Rolled oats | 20g Aveia em flocos | 20,0 | 2,7 | 13,6 | 1,3 | 76 | B: Rolled oats |
| **Total** | | | **18,8** | **30,6** | **2,4** | **212** | 4/4/9: 218 kcal |

1. Add the nonfat greek yogurt and strawberries to the cup.<br>Adicione iogurte grego desnatado e morangos ao copo.
2. Add the rolled oats and close the lid.<br>Acrescente aveia em flocos e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

Regras do WeightLoss (CP-1.1.9): 212 kcal (180-320), proteína 36% das kcal (≥ 25%), fibra 5,0 g (≥ 1,5), sem gelo e sem açúcar adicionado.

<a id="weightloss09"></a>
#### WeightLoss09 — Raspberry Egg White Shake / Shake de Clara com Framboesa

**Problemas:** congelado.

**Justificativa:** Framboesa fresca.

**ANTES** · declarado P28 C30 G4 · 271 kcal · recalculado P28,3 C30,4 G4,4 · 270 kcal · volume 375 ml (xícara cheia 375 ml) · contains animal

| en | pt-BR |
|---|---|
| 1 scoop (30g) Egg white protein powder | 1 dose (30g) Proteína de clara de ovo em pó |
| 125g Frozen raspberries | 125g Framboesas congeladas |
| 220ml Unsweetened oat milk | 220ml Bebida de aveia sem açúcar |

1. Add the egg white protein powder and frozen raspberries to the BLENDi cup.<br>Adicione proteína de clara de ovo em pó e framboesas congeladas ao copo do BLENDi.
2. Add the unsweetened oat milk and close the lid.<br>Acrescente bebida de aveia sem açúcar e feche a tampa.
3. Pulse 8 times to break down the frozen pieces, then blend on high for 15 seconds until smooth.<br>Pulse 8 vezes para quebrar os pedaços congelados, depois bata em velocidade alta por 15 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

**DEPOIS** · declarar **P28 C30 G4 · 271 kcal** · volume **375 ml** no leitor novo (xícara cheia 375 ml) · contains **animal**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop (30g) Egg white protein powder | 1 dose (30g) Proteína de clara de ovo em pó | 30,0 | 24,6 | 1,2 | 0,3 | 106 | B: Egg white protein powder |
| 125g Raspberries | 125g Framboesas | 125,0 | 1,5 | 14,9 | 0,8 | 65 | U 09302 Raspberries |
| 220ml Unsweetened oat milk | 220ml Bebida de aveia sem açúcar | 220,0 | 2,2 | 14,3 | 3,3 | 99 | B: Oat milk |
| **Total** | | | **28,3** | **30,4** | **4,4** | **270** | 4/4/9: 275 kcal |

1. Add the egg white protein powder and raspberries to the cup.<br>Adicione proteína de clara de ovo em pó e framboesas ao copo.
2. Add the unsweetened oat milk and close the lid.<br>Acrescente bebida de aveia sem açúcar e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

Regras do WeightLoss (CP-1.1.9): 271 kcal (180-320), proteína 41% das kcal (≥ 25%), fibra 8,1 g (≥ 1,5), sem gelo e sem açúcar adicionado.

<a id="weightloss10"></a>
#### WeightLoss10 — Cherry Almond Whey / Whey com Cereja e Amêndoa

**Problemas:** congelado.

**Justificativa:** Cereja fresca (sem caroço).

**ANTES** · declarado P28 C21 G4 · 219 kcal · recalculado P28,0 C21,2 G3,5 · 219 kcal · volume 400 ml (xícara cheia 400 ml) · contains dairy, animal, nuts

| en | pt-BR |
|---|---|
| 1 scoop (30g) Whey protein isolate | 1 dose (30g) Whey protein isolado |
| 120g Frozen cherries | 120g Cerejas congeladas |
| 250ml Unsweetened almond milk | 250ml Leite de amêndoas sem açúcar |

1. Add the whey protein isolate and frozen cherries to the BLENDi cup.<br>Adicione whey protein isolado e cerejas congeladas ao copo do BLENDi.
2. Add the unsweetened almond milk and close the lid.<br>Acrescente leite de amêndoas sem açúcar e feche a tampa.
3. Pulse 8 times to break down the frozen pieces, then blend on high for 15 seconds until smooth.<br>Pulse 8 vezes para quebrar os pedaços congelados, depois bata em velocidade alta por 15 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

**DEPOIS** · declarar **P28 C21 G4 · 219 kcal** · volume **400 ml** no leitor novo (xícara cheia 400 ml) · contains **dairy, animal, nuts**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop (30g) Whey protein isolate | 1 dose (30g) Whey protein isolado | 30,0 | 25,5 | 1,2 | 0,3 | 111 | B: Whey protein isolate |
| 120g Cherries | 120g Cerejas | 120,0 | 1,3 | 19,2 | 0,2 | 76 | U 09070 Cherries, sweet |
| 250ml Unsweetened almond milk | 250ml Leite de amêndoas sem açúcar | 250,0 | 1,2 | 0,8 | 3,0 | 32 | B: Unsweetened almond milk |
| **Total** | | | **28,0** | **21,2** | **3,5** | **219** | 4/4/9: 229 kcal |

1. Add the whey protein isolate and cherries to the cup.<br>Adicione whey protein isolado e cerejas ao copo.
2. Add the unsweetened almond milk and close the lid.<br>Acrescente leite de amêndoas sem açúcar e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

Regras do WeightLoss (CP-1.1.9): 219 kcal (180-320), proteína 51% das kcal (≥ 25%), fibra 2,5 g (≥ 1,5), sem gelo e sem açúcar adicionado.

<a id="weightloss11"></a>
#### WeightLoss11 — Pumpkin Yogurt Blend / Blend de Iogurte com Abóbora

**Problemas:** leite com tipo (skim).

**Justificativa:** "Skim milk" vira "Milk".

**ANTES** · declarado P25 C20 G1 · 186 kcal · recalculado P24,5 C20,3 G1,3 · 186 kcal · volume 400 ml (xícara cheia 400 ml) · contains dairy

| en | pt-BR |
|---|---|
| 200g Nonfat Greek yogurt | 200g Iogurte grego desnatado |
| 100g Pumpkin puree | 100g Purê de abóbora |
| 100ml Skim milk | 100ml Leite desnatado |

1. Add the nonfat Greek yogurt and pumpkin puree to the BLENDi cup.<br>Adicione iogurte grego desnatado e purê de abóbora ao copo do BLENDi.
2. Add the skim milk and close the lid.<br>Acrescente leite desnatado e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

**DEPOIS** · declarar **P24 C20 G3 · 202 kcal** · volume **400 ml** no leitor novo (xícara cheia 400 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 200g Nonfat Greek yogurt | 200g Iogurte grego desnatado | 200,0 | 20,0 | 7,2 | 0,8 | 118 | B: Nonfat Greek yogurt |
| 100g Pumpkin puree | 100g Purê de abóbora | 100,0 | 1,1 | 8,1 | 0,3 | 34 | U 11424 Pumpkin, canned |
| 100ml Milk | 100ml Leite | 100,0 | 3,3 | 4,8 | 2,0 | 50 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **24,4** | **20,1** | **3,1** | **202** | 4/4/9: 206 kcal |

1. Add the nonfat greek yogurt and pumpkin puree to the cup.<br>Adicione iogurte grego desnatado e purê de abóbora ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

Regras do WeightLoss (CP-1.1.9): 202 kcal (180-320), proteína 48% das kcal (≥ 25%), fibra 2,9 g (≥ 1,5), sem gelo e sem açúcar adicionado.

<a id="weightloss12"></a>
#### WeightLoss12 — Blueberry Tofu Smoothie / Smoothie de Tofu com Mirtilo

**Problemas:** congelado.

**Justificativa:** Mirtilo fresco.

**ANTES** · declarado P17 C21 G7 · 214 kcal · recalculado P17,4 C21,0 G7,3 · 214 kcal · volume 400 ml (xícara cheia 400 ml) · contains — (vegana)

| en | pt-BR |
|---|---|
| 200g Silken tofu | 200g Tofu macio |
| 100g Frozen blueberries | 100g Mirtilos congelados |
| 100ml Unsweetened soy milk | 100ml Bebida de soja sem açúcar |

1. Add the silken tofu and frozen blueberries to the BLENDi cup.<br>Adicione tofu macio e mirtilos congelados ao copo do BLENDi.
2. Add the unsweetened soy milk and close the lid.<br>Acrescente bebida de soja sem açúcar e feche a tampa.
3. Pulse 8 times to break down the frozen pieces, then blend on high for 15 seconds until smooth.<br>Pulse 8 vezes para quebrar os pedaços congelados, depois bata em velocidade alta por 15 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

**DEPOIS** · declarar **P17 C21 G7 · 214 kcal** · volume **400 ml** no leitor novo (xícara cheia 400 ml) · contains **— (vegana)**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 200g Silken tofu | 200g Tofu macio | 200,0 | 13,8 | 4,8 | 5,4 | 124 | U 16162 Tofu, silken, firm |
| 100g Blueberries | 100g Mirtilos | 100,0 | 0,7 | 14,5 | 0,3 | 57 | B: Blueberry |
| 100ml Unsweetened soy milk | 100ml Bebida de soja sem açúcar | 100,0 | 2,9 | 1,7 | 1,6 | 33 | U 16222 Soymilk, unsweetened |
| **Total** | | | **17,4** | **21,0** | **7,3** | **214** | 4/4/9: 219 kcal |

1. Add the silken tofu and blueberries to the cup.<br>Adicione tofu macio e mirtilos ao copo.
2. Add the unsweetened soy milk and close the lid.<br>Acrescente bebida de soja sem açúcar e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

Regras do WeightLoss (CP-1.1.9): 214 kcal (180-320), proteína 32% das kcal (≥ 25%), fibra 3,1 g (≥ 1,5), sem gelo e sem açúcar adicionado.

<a id="weightloss13"></a>
#### WeightLoss13 — Blackberry Plant Shake / Shake Vegetal de Amora

**Problemas:** congelado.

**Justificativa:** Amora fresca.

**ANTES** · declarado P25 C30 G6 · 277 kcal · recalculado P25,2 C30,5 G6,1 · 277 kcal · volume 400 ml (xícara cheia 400 ml) · contains — (vegana)

| en | pt-BR |
|---|---|
| 1 scoop (30g) Plant protein powder | 1 dose (30g) Proteína vegetal em pó |
| 120g Frozen blackberries | 120g Amoras congeladas |
| 250ml Unsweetened oat milk | 250ml Bebida de aveia sem açúcar |

1. Add the plant protein powder and frozen blackberries to the BLENDi cup.<br>Adicione proteína vegetal em pó e amoras congeladas ao copo do BLENDi.
2. Add the unsweetened oat milk and close the lid.<br>Acrescente bebida de aveia sem açúcar e feche a tampa.
3. Pulse 8 times to break down the frozen pieces, then blend on high for 15 seconds until smooth.<br>Pulse 8 vezes para quebrar os pedaços congelados, depois bata em velocidade alta por 15 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

**DEPOIS** · declarar **P25 C30 G6 · 277 kcal** · volume **400 ml** no leitor novo (xícara cheia 400 ml) · contains **— (vegana)**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop (30g) Plant protein powder | 1 dose (30g) Proteína vegetal em pó | 30,0 | 21,0 | 2,7 | 1,8 | 112 | B: Plant protein powder |
| 120g Blackberries | 120g Amoras | 120,0 | 1,7 | 11,5 | 0,6 | 52 | U 09042 Blackberries |
| 250ml Unsweetened oat milk | 250ml Bebida de aveia sem açúcar | 250,0 | 2,5 | 16,2 | 3,8 | 112 | B: Oat milk |
| **Total** | | | **25,2** | **30,5** | **6,1** | **277** | 4/4/9: 278 kcal |

1. Add the plant protein powder and blackberries to the cup.<br>Adicione proteína vegetal em pó e amoras ao copo.
2. Add the unsweetened oat milk and close the lid.<br>Acrescente bebida de aveia sem açúcar e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

Regras do WeightLoss (CP-1.1.9): 277 kcal (180-320), proteína 36% das kcal (≥ 25%), fibra 6,4 g (≥ 1,5), sem gelo e sem açúcar adicionado.

<a id="weightloss14"></a>
#### WeightLoss14 — Pear Whey Smoothie / Smoothie de Whey com Pera

**Problemas:** pera inteira.

**Justificativa:** Só o passo de cortar a pera.

**ANTES** · declarado P27 C25 G3 · 225 kcal · recalculado P27,1 C24,7 G3,2 · 225 kcal · volume 400 ml (xícara cheia 400 ml) · contains dairy, animal, nuts

| en | pt-BR |
|---|---|
| 1 scoop (30g) Whey protein isolate | 1 dose (30g) Whey protein isolado |
| 1 medium (150g) Pear | 1 unidade média (150g) Pera |
| 220ml Unsweetened almond milk | 220ml Leite de amêndoas sem açúcar |

1. Add the whey protein isolate and pear to the BLENDi cup.<br>Adicione whey protein isolado e pera ao copo do BLENDi.
2. Add the unsweetened almond milk and close the lid.<br>Acrescente leite de amêndoas sem açúcar e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

**DEPOIS** · declarar **P27 C25 G3 · 225 kcal** · volume **400 ml** no leitor novo (xícara cheia 400 ml) · contains **dairy, animal, nuts**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop (30g) Whey protein isolate | 1 dose (30g) Whey protein isolado | 30,0 | 25,5 | 1,2 | 0,3 | 111 | B: Whey protein isolate |
| 1 medium (150g) Pear | 1 unidade média (150g) Pera | 150,0 | 0,5 | 22,8 | 0,2 | 86 | U 09252 Pears |
| 220ml Unsweetened almond milk | 220ml Leite de amêndoas sem açúcar | 220,0 | 1,1 | 0,7 | 2,6 | 29 | B: Unsweetened almond milk |
| **Total** | | | **27,1** | **24,7** | **3,2** | **225** | 4/4/9: 236 kcal |

1. Cut the pear into small pieces, without the core. Add the whey protein isolate and pear to the cup.<br>Corte a pera em pedaços pequenos, sem o miolo. Adicione whey protein isolado e pera ao copo.
2. Add the unsweetened almond milk and close the lid.<br>Acrescente leite de amêndoas sem açúcar e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

Regras do WeightLoss (CP-1.1.9): 225 kcal (180-320), proteína 48% das kcal (≥ 25%), fibra 4,7 g (≥ 1,5), sem gelo e sem açúcar adicionado.

<a id="weightloss16"></a>
#### WeightLoss16 — Banana Plant Protein / Proteína Vegetal com Banana

**Problemas:** congelado.

**Justificativa:** Banana fresca.

**ANTES** · declarado P22 C26 G2 · 202 kcal · recalculado P22,1 C25,7 G2,1 · 202 kcal · volume 380 ml (xícara cheia 380 ml) · contains — (vegana)

| en | pt-BR |
|---|---|
| 1 scoop (30g) Plant protein powder | 1 dose (30g) Proteína vegetal em pó |
| 100g Frozen banana | 100g Banana congelada |
| 250ml Water | 250ml Água |

1. Add the plant protein powder and frozen banana to the BLENDi cup.<br>Adicione proteína vegetal em pó e banana congelada ao copo do BLENDi.
2. Add the water and close the lid.<br>Acrescente água e feche a tampa.
3. Pulse 8 times to break down the frozen pieces, then blend on high for 15 seconds until smooth.<br>Pulse 8 vezes para quebrar os pedaços congelados, depois bata em velocidade alta por 15 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

**DEPOIS** · declarar **P22 C26 G2 · 202 kcal** · volume **380 ml** no leitor novo (xícara cheia 380 ml) · contains **— (vegana)**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 1 scoop (30g) Plant protein powder | 1 dose (30g) Proteína vegetal em pó | 30,0 | 21,0 | 2,7 | 1,8 | 112 | B: Plant protein powder |
| 100g Banana | 100g Banana | 100,0 | 1,1 | 23,0 | 0,3 | 89 | B: Ripe banana (fibra U 09040) |
| 250ml Water | 250ml Água | 250,0 | 0,0 | 0,0 | 0,0 | 0 | - |
| **Total** | | | **22,1** | **25,7** | **2,1** | **202** | 4/4/9: 210 kcal |

1. Add the plant protein powder and banana to the cup.<br>Adicione proteína vegetal em pó e banana ao copo.
2. Add the water and close the lid.<br>Acrescente água e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

Regras do WeightLoss (CP-1.1.9): 202 kcal (180-320), proteína 44% das kcal (≥ 25%), fibra 2,6 g (≥ 1,5), sem gelo e sem açúcar adicionado.

<a id="weightloss17"></a>
#### WeightLoss17 — Green Tofu Pineapple / Tofu Verde com Abacaxi

**Problemas:** congelado.

**Justificativa:** Abacaxi fresco.

**ANTES** · declarado P14 C25 G5 · 194 kcal · recalculado P14,1 C25,1 G5,2 · 194 kcal · volume 360 ml (xícara cheia 360 ml) · contains — (vegana)

| en | pt-BR |
|---|---|
| 180g Silken tofu | 180g Tofu macio |
| 150g Frozen pineapple chunks | 150g Pedaços de abacaxi congelado |
| 1 handful (30g) Spinach | 1 punhado (30g) Espinafre |

1. Add the silken tofu and frozen pineapple chunks to the BLENDi cup.<br>Adicione tofu macio e pedaços de abacaxi congelado ao copo do BLENDi.
2. Add the spinach and close the lid.<br>Acrescente espinafre e feche a tampa.
3. Pulse 8 times to break down the frozen pieces, then blend on high for 15 seconds until smooth.<br>Pulse 8 vezes para quebrar os pedaços congelados, depois bata em velocidade alta por 15 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

**DEPOIS** · declarar **P14 C25 G5 · 194 kcal** · volume **360 ml** no leitor novo (xícara cheia 360 ml) · contains **— (vegana)**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 180g Silken tofu | 180g Tofu macio | 180,0 | 12,4 | 4,3 | 4,9 | 112 | U 16162 Tofu, silken, firm |
| 150g Pineapple chunks | 150g Pedaços de abacaxi | 150,0 | 0,8 | 19,7 | 0,2 | 75 | U 09266 Pineapple |
| 1 handful (30g) Spinach | 1 punhado (30g) Espinafre | 30,0 | 0,9 | 1,1 | 0,1 | 7 | B: Raw spinach |
| **Total** | | | **14,1** | **25,1** | **5,2** | **194** | 4/4/9: 203 kcal |

1. Add the silken tofu and pineapple chunks to the cup.<br>Adicione tofu macio e pedaços de abacaxi ao copo.
2. Add the spinach and close the lid.<br>Acrescente espinafre e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

Regras do WeightLoss (CP-1.1.9): 194 kcal (180-320), proteína 29% das kcal (≥ 25%), fibra 2,9 g (≥ 1,5), sem gelo e sem açúcar adicionado.

<a id="weightloss18"></a>
#### WeightLoss18 — Cherry Yogurt Blend / Blend de Iogurte com Cereja

**Problemas:** congelado; leite com tipo (skim).

**Justificativa:** Cereja fresca; "Milk".

**ANTES** · declarado P24 C28 G1 · 215 kcal · recalculado P24,5 C28,2 G1,2 · 215 kcal · volume 400 ml (xícara cheia 400 ml) · contains dairy

| en | pt-BR |
|---|---|
| 200g Nonfat Greek yogurt | 200g Iogurte grego desnatado |
| 100g Frozen cherries | 100g Cerejas congeladas |
| 100ml Skim milk | 100ml Leite desnatado |

1. Add the nonfat Greek yogurt and frozen cherries to the BLENDi cup.<br>Adicione iogurte grego desnatado e cerejas congeladas ao copo do BLENDi.
2. Add the skim milk and close the lid.<br>Acrescente leite desnatado e feche a tampa.
3. Pulse 8 times to break down the frozen pieces, then blend on high for 15 seconds until smooth.<br>Pulse 8 vezes para quebrar os pedaços congelados, depois bata em velocidade alta por 15 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

**DEPOIS** · declarar **P24 C28 G3 · 231 kcal** · volume **400 ml** no leitor novo (xícara cheia 400 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 200g Nonfat Greek yogurt | 200g Iogurte grego desnatado | 200,0 | 20,0 | 7,2 | 0,8 | 118 | B: Nonfat Greek yogurt |
| 100g Cherries | 100g Cerejas | 100,0 | 1,1 | 16,0 | 0,2 | 63 | U 09070 Cherries, sweet |
| 100ml Milk | 100ml Leite | 100,0 | 3,3 | 4,8 | 2,0 | 50 | U 01079 Milk, reduced fat, 2% (referência única do "Leite") |
| **Total** | | | **24,4** | **28,0** | **3,0** | **231** | 4/4/9: 236 kcal |

1. Add the nonfat greek yogurt and cherries to the cup.<br>Adicione iogurte grego desnatado e cerejas ao copo.
2. Add the milk and close the lid.<br>Acrescente leite e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

Regras do WeightLoss (CP-1.1.9): 231 kcal (180-320), proteína 42% das kcal (≥ 25%), fibra 2,1 g (≥ 1,5), sem gelo e sem açúcar adicionado.

<a id="weightloss19"></a>
#### WeightLoss19 — Mango Cottage Blend / Blend de Cottage com Manga

**Problemas:** congelado.

**Justificativa:** Manga fresca.

**ANTES** · declarado P20 C22 G4 · 197 kcal · recalculado P20,2 C22,5 G3,6 · 197 kcal · volume 400 ml (xícara cheia 400 ml) · contains dairy, nuts

| en | pt-BR |
|---|---|
| 150g Low-fat cottage cheese | 150g Queijo cottage light |
| 120g Frozen mango chunks | 120g Pedaços de manga congelada |
| 130ml Unsweetened almond milk | 130ml Leite de amêndoas sem açúcar |

1. Add the low-fat cottage cheese and frozen mango chunks to the BLENDi cup.<br>Adicione queijo cottage light e pedaços de manga congelada ao copo do BLENDi.
2. Add the unsweetened almond milk and close the lid.<br>Acrescente leite de amêndoas sem açúcar e feche a tampa.
3. Pulse 8 times to break down the frozen pieces, then blend on high for 15 seconds until smooth.<br>Pulse 8 vezes para quebrar os pedaços congelados, depois bata em velocidade alta por 15 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

**DEPOIS** · declarar **P20 C22 G4 · 197 kcal** · volume **400 ml** no leitor novo (xícara cheia 400 ml) · contains **dairy, nuts**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 150g Low-fat cottage cheese | 150g Queijo cottage light | 150,0 | 18,6 | 4,1 | 1,5 | 108 | U 01016 Cottage cheese, lowfat 1% |
| 120g Mango chunks | 120g Pedaços de manga | 120,0 | 1,0 | 18,0 | 0,5 | 72 | B: Mango |
| 130ml Unsweetened almond milk | 130ml Leite de amêndoas sem açúcar | 130,0 | 0,7 | 0,4 | 1,6 | 17 | B: Unsweetened almond milk |
| **Total** | | | **20,2** | **22,5** | **3,6** | **197** | 4/4/9: 203 kcal |

1. Add the low-fat cottage cheese and mango chunks to the cup.<br>Adicione queijo cottage light e pedaços de manga ao copo.
2. Add the unsweetened almond milk and close the lid.<br>Acrescente leite de amêndoas sem açúcar e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

Regras do WeightLoss (CP-1.1.9): 197 kcal (180-320), proteína 41% das kcal (≥ 25%), fibra 1,9 g (≥ 1,5), sem gelo e sem açúcar adicionado.

<a id="weightloss20"></a>
#### WeightLoss20 — Peach Flax Yogurt / Iogurte com Pêssego e Linhaça

**Problemas:** congelado.

**Justificativa:** Pêssego fresco.

**ANTES** · declarado P20 C23 G5 · 212 kcal · recalculado P20,2 C23,3 G5,3 · 212 kcal · volume 330 ml (xícara cheia 330 ml) · contains dairy

| en | pt-BR |
|---|---|
| 170g Nonfat Greek yogurt | 170g Iogurte grego desnatado |
| 150g Frozen peach slices | 150g Fatias de pêssego congelado |
| 1 tbsp (10g) Ground flaxseed | 1 colher de sopa (10g) Linhaça moída |

1. Add the nonfat Greek yogurt and frozen peach slices to the BLENDi cup.<br>Adicione iogurte grego desnatado e fatias de pêssego congelado ao copo do BLENDi.
2. Add the ground flaxseed and close the lid.<br>Acrescente linhaça moída e feche a tampa.
3. Pulse 8 times to break down the frozen pieces, then blend on high for 15 seconds until smooth.<br>Pulse 8 vezes para quebrar os pedaços congelados, depois bata em velocidade alta por 15 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

**DEPOIS** · declarar **P20 C23 G5 · 212 kcal** · volume **330 ml** no leitor novo (xícara cheia 330 ml) · contains **dairy**

| en | pt-BR | g/ml | P | C | G | kcal | Referência |
|---|---|---|---|---|---|---|---|
| 170g Nonfat Greek yogurt | 170g Iogurte grego desnatado | 170,0 | 17,0 | 6,1 | 0,7 | 100 | B: Nonfat Greek yogurt |
| 150g Peach slices | 150g Fatias de pêssego | 150,0 | 1,4 | 14,3 | 0,4 | 58 | U 09236 Peaches |
| 1 tbsp (10g) Ground flaxseed | 1 colher de sopa (10g) Linhaça moída | 10,0 | 1,8 | 2,9 | 4,2 | 53 | U 12220 Flaxseed |
| **Total** | | | **20,2** | **23,3** | **5,3** | **212** | 4/4/9: 221 kcal |

1. Add the nonfat greek yogurt and peach slices to the cup.<br>Adicione iogurte grego desnatado e fatias de pêssego ao copo.
2. Add the ground flaxseed and close the lid.<br>Acrescente linhaça moída e feche a tampa.
3. Blend on high for 25-30 seconds until smooth.<br>Bata em velocidade alta por 25-30 segundos até ficar homogêneo.
4. Serve immediately and enjoy your blend.<br>Sirva imediatamente e aproveite seu blend.

Regras do WeightLoss (CP-1.1.9): 212 kcal (180-320), proteína 38% das kcal (≥ 25%), fibra 5,0 g (≥ 1,5), sem gelo e sem açúcar adicionado.

## Anexo — Medição das 100 receitas (Tarefa 2, ANTES)

Volume pelo leitor novo (e pelo antigo, para comparar). Os macros recalculados seguem as fontes do Resumo. "Fora ±10%" lista o que passa de 10% da soma (com uma folga de 2 g para proteína, carboidrato e gordura). Dieta é a marcação `contains` atual.

| id | Vol. novo | Vol. antigo | Xícara cheia | Declarado P/C/G/kcal | Recalculado P/C/G/kcal | Δ kcal | Fora ±10% | Congelado | Sem base | Duro cru | Repetida | contains |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Muscle01 | 398 | 250 | 398 | 38/26/18/420 | 25,0/30,3/4,9/252 | +67% | P, C, G, kcal | não | não | não | não | dairy, nuts |
| Muscle02 | 346 | 316 | 345 | 38/21/19/407 | 36,1/20,0/20,3/391 | +4% | — | não | não | não | não | dairy, nuts |
| Muscle03 | **407** | 407 | 501 | 26/42/6/326 | 26,4/42,6/5,4/312 | +5% | — | não | não | não | não | dairy, animal, added_sugar |
| Muscle04 | 395 | 365 | 467 | 26/28/10/306 | 25,4/26,0/13,7/316 | -3% | G | não | não | não | não | dairy |
| Muscle05 | 372 | 372 | 370 | 21/47/30/542 | 21,7/47,6/31,2/531 | +2% | — | não | não | não | não | dairy, nuts |
| Muscle06 | 380 | 380 | 451 | 23/49/5/333 | 22,3/51,5/5,2/325 | +3% | — | não | não | não | não | dairy, animal, added_sugar |
| Muscle07 | 153 | 5 | 163 | 26/34/3/267 | 24,9/32,7/2,6/231 | +15% | kcal | não | sim | não | não | dairy |
| Muscle08 | **542** | 542 | 637 | 12/34/7/247 | 14,3/35,4/8,4/271 | -9% | P | sim | não | não | não | — |
| Muscle09 | 310 | 280 | 310 | 36/35/6/338 | 35,0/35,3/5,9/333 | +2% | — | não | não | não | não | dairy |
| Muscle10 | 244 | 244 | 244 | 22/35/7/291 | 22,0/33,3/7,5/284 | +2% | — | não | não | não | não | dairy, animal, nuts, added_sugar |
| Muscle11 | 330 | 250 | 330 | 33/19/12/316 | 31,9/19,1/11,5/299 | +6% | — | não | não | não | não | dairy |
| Muscle12 | 400 | 282 | 398 | 19/43/20/428 | 17,3/45,5/25,4/446 | -4% | G | não | não | não | não | dairy, nuts |
| Muscle13 | 398 | 280 | 398 | 8/45/11/311 | 10,1/45,1/13,9/328 | -5% | P, G | sim | não | não | não | — |
| Muscle14 | 328 | 250 | 328 | 33/47/10/410 | 31,4/50,4/10,6/399 | +3% | — | não | não | não | não | dairy |
| Muscle15 | 330 | 330 | 401 | 18/29/5/233 | 16,9/30,0/7,0/239 | -3% | G | não | não | não | não | dairy |
| Muscle16 | 296 | 266 | 295 | 28/23/13/321 | 28,4/21,7/14,1/325 | -1% | — | não | não | não | não | dairy, nuts |
| Muscle17 | 375 | 375 | 451 | 23/38/8/316 | 23,2/37,7/8,2/303 | +4% | — | sim | não | não | não | dairy |
| Muscle18 | 310 | 280 | 310 | 36/35/11/383 | 34,5/34,8/12,4/380 | +1% | — | não | não | não | não | dairy |
| Muscle19 | 164 | 16 | 163 | 25/34/10/326 | 26,3/33,0/10,2/312 | +5% | — | não | sim | não | não | nuts |
| Muscle20 | 220 | 220 | 230 | 21/28/5/241 | 21,0/28,2/4,6/222 | +8% | — | não | não | não | não | dairy, animal, added_sugar |
| Wellness01 | **412** | 200 | 397 | 18/24/10/260 | 21,5/31,7/4,3/250 | +4% | P, C, G | não | não | maçã | não | dairy |
| Wellness02 | 358 | 150 | 358 | 16/35/3/231 | 16,4/34,3/3,6/221 | +4% | — | não | não | couve, pera | não | dairy |
| Wellness03 | **433** | 433 | 505 | 16/30/3/211 | 16,2/29,4/3,1/200 | +6% | — | não | não | não | não | dairy |
| Wellness04 | 395 | 365 | 467 | 9/35/6/230 | 9,8/35,4/2,8/192 | +20% | G, kcal | não | não | não | não | dairy |
| Wellness05 | **420** | 420 | 505 | 17/24/4/200 | 17,4/26,1/3,5/196 | +2% | — | não | não | não | não | dairy |
| Wellness06 | 342 | 150 | 342 | 16/27/3/199 | 16,7/27,1/3,2/196 | +1% | — | não | não | cenoura crua | Energy18 | dairy |
| Wellness07 | 368 | 200 | 368 | 9/30/6/210 | 10,0/30,9/2,9/177 | +19% | G, kcal | não | não | não | não | dairy |
| Wellness08 | 400 | 218 | 385 | 7/29/3/171 | 8,0/27,0/3,1/167 | +3% | — | não | não | maçã | não | — |
| Wellness09 | 328 | 298 | 417 | 17/29/4/220 | 16,8/28,7/3,8/204 | +8% | — | não | não | couve | não | dairy |
| Wellness10 | **452** | 452 | 537 | 11/22/2/150 | 12,3/22,8/2,5/157 | -4% | — | não | não | não | não | dairy |
| Wellness11 | 325 | 295 | 417 | 16/23/3/183 | 16,5/22,7/3,4/179 | +2% | — | não | não | não | não | dairy |
| Wellness12 | **422** | 200 | 407 | 8/35/5/217 | 8,6/33,5/2,4/188 | +15% | G, kcal | não | não | aipo, maçã | não | dairy |
| Wellness13 | 326 | 265 | 398 | 8/33/3/191 | 8,8/33,0/3,5/186 | +3% | — | não | não | cenoura crua | não | — |
| Wellness14 | 399 | 268 | 399 | 17/28/3/207 | 17,6/29,8/3,2/208 | -1% | — | não | não | não | Recovery19 | dairy |
| Wellness15 | 308 | 100 | 308 | 12/31/2/190 | 12,0/32,9/2,6/189 | +0% | — | não | não | pera | não | dairy |
| Wellness16 | **406** | 268 | 406 | 16/28/4/212 | 16,8/28,0/3,7/201 | +5% | — | não | não | não | não | dairy |
| Wellness17 | 395 | 365 | 467 | 9/33/5/213 | 9,3/32,5/2,7/179 | +19% | G, kcal | não | não | couve | não | dairy |
| Wellness18 | **420** | 420 | 505 | 16/19/4/176 | 16,3/19,5/3,4/166 | +6% | — | não | não | não | não | dairy |
| Wellness19 | 305 | 305 | 401 | 18/27/6/234 | 17,6/26,7/6,9/230 | +2% | — | não | não | não | não | dairy |
| Wellness20 | 376 | 315 | 448 | 16/34/3/227 | 16,4/33,4/3,2/217 | +5% | — | não | não | cenoura crua | não | dairy |
| Energy01 | **455** | 455 | 527 | 16/42/12/340 | 8,0/52,7/6,3/283 | +20% | P, C, G, kcal | não | não | não | não | nuts |
| Energy02 | **416** | 250 | 416 | 10/71/3/351 | 10,6/75,6/2,9/343 | +2% | — | não | não | não | não | dairy |
| Energy03 | 285 | 285 | 295 | 13/35/10/282 | 13,1/35,5/11,7/279 | +1% | — | não | não | não | não | dairy |
| Energy04 | 370 | 252 | 373 | 9/40/3/223 | 10,7/40,6/2,8/215 | +4% | — | não | não | não | não | dairy |
| Energy05 | **445** | 445 | 517 | 5/51/2/242 | 6,7/51,3/2,6/244 | -1% | — | não | não | não | não | — |
| Energy06 | 362 | 290 | 362 | 14/87/4/440 | 15,1/93,7/5,1/456 | -4% | — | não | não | não | não | dairy |
| Energy07 | 398 | 250 | 398 | 9/39/3/219 | 9,8/40,1/2,8/213 | +3% | — | não | não | não | não | dairy |
| Energy08 | **420** | 420 | 492 | 9/39/3/219 | 10,7/41,2/3,1/224 | -2% | — | não | não | não | não | dairy |
| Energy09 | **412** | 294 | 412 | 12/54/13/381 | 12,4/51,5/14,9/369 | +3% | — | não | não | não | não | dairy, nuts |
| Energy10 | **455** | 455 | 527 | 8/65/5/337 | 8,8/65,1/6,5/347 | -3% | — | não | não | não | não | — |
| Energy11 | 373 | 255 | 383 | 10/43/6/266 | 11,1/43,3/7,8/273 | -3% | — | não | não | não | não | dairy |
| Energy12 | **463** | 415 | 535 | 10/69/3/343 | 10,6/73,2/3,2/337 | +2% | — | não | não | não | não | dairy |
| Energy13 | **417** | 417 | 492 | 9/35/3/203 | 10,3/35,1/2,6/192 | +5% | — | não | não | não | não | dairy |
| Energy14 | 295 | 295 | 295 | 5/53/4/268 | 6,6/53,9/5,7/290 | -8% | — | não | não | não | não | animal, added_sugar |
| Energy15 | 384 | 266 | 383 | 6/46/11/307 | 7,8/46,6/12,1/312 | -1% | — | não | não | não | não | nuts |
| Energy16 | **443** | 395 | 535 | 9/60/3/303 | 10,0/64,1/2,9/300 | +1% | — | não | não | não | não | dairy |
| Energy17 | 285 | 255 | 295 | 9/15/9/177 | 9,1/15,6/9,8/168 | +6% | — | não | não | não | não | dairy |
| Energy18 | 342 | 150 | 342 | 16/27/3/199 | 16,7/27,1/3,2/196 | +1% | — | não | não | cenoura crua | Wellness06 | dairy |
| Energy19 | 93 | 45 | 103 | 7/62/3/303 | 7,3/66,3/3,4/297 | +2% | — | não | sim | não | não | — |
| Energy20 | **430** | 430 | 501 | 9/36/4/216 | 9,7/35,4/6,1/223 | -3% | G | não | não | não | não | dairy |
| Recovery01 | **445** | 415 | 517 | 24/20/13/290 | 25,2/33,3/2,2/244 | +19% | C, G, kcal | não | não | não | não | dairy |
| Recovery02 | **419** | 419 | 430 | 21/35/6/278 | 22,9/45,9/6,8/346 | -20% | C, kcal | não | não | não | não | dairy |
| Recovery03 | 320 | 320 | 392 | 16/29/3/207 | 16,1/29,6/3,2/201 | +3% | — | não | não | não | não | dairy |
| Recovery04 | 299 | 269 | 310 | 24/26/2/218 | 25,3/36,7/2,0/272 | -20% | C, kcal | não | não | não | não | dairy |
| Recovery05 | 320 | 320 | 392 | 16/31/4/224 | 16,3/31,0/3,6/210 | +7% | — | não | não | não | não | dairy |
| Recovery06 | 278 | 278 | 283 | 17/28/6/234 | 17,1/26,5/6,9/232 | +1% | — | não | não | não | não | dairy |
| Recovery07 | 398 | 250 | 398 | 26/39/2/278 | 25,6/38,8/2,4/267 | +4% | — | não | não | não | não | dairy |
| Recovery08 | 320 | 320 | 392 | 16/28/3/203 | 15,9/27,9/3,1/194 | +5% | — | não | não | não | não | dairy |
| Recovery09 | **428** | 398 | 517 | 26/33/2/254 | 25,3/33,1/2,4/246 | +3% | — | não | não | não | não | dairy |
| Recovery10 | 288 | 288 | 298 | 16/27/3/199 | 17,4/39,4/3,0/257 | -23% | C, kcal | não | não | não | não | dairy |
| Recovery11 | **425** | 395 | 517 | 25/28/2/230 | 25,0/27,4/2,4/224 | +3% | — | não | não | não | não | dairy |
| Recovery12 | 273 | 155 | 273 | 16/34/3/227 | 16,5/35,1/3,3/224 | +1% | — | não | não | não | não | dairy |
| Recovery13 | 348 | 318 | 348 | 25/27/2/226 | 24,1/25,4/2,2/216 | +5% | — | não | não | não | não | dairy |
| Recovery14 | 286 | 155 | 286 | 16/21/3/175 | 16,2/21,7/3,1/173 | +1% | — | não | não | não | não | dairy |
| Recovery15 | **422** | 392 | 517 | 26/27/2/230 | 25,7/27,2/2,6/227 | +1% | — | não | não | não | não | dairy |
| Recovery16 | 200 | 170 | 272 | 25/26/2/222 | 23,7/26,1/1,8/206 | +8% | — | não | sim | não | não | dairy |
| Recovery17 | 184 | 184 | 194 | 18/21/7/219 | 19,1/31,8/7,8/275 | -20% | C, kcal | não | não | não | não | dairy |
| Recovery18 | **418** | 250 | 418 | 26/32/2/250 | 25,9/31,9/2,7/246 | +2% | — | não | não | não | não | dairy |
| Recovery19 | 399 | 268 | 399 | 17/28/3/207 | 17,6/29,8/3,2/208 | -1% | — | não | não | não | Wellness14 | dairy |
| Recovery20 | 273 | 273 | 273 | 15/23/3/179 | 15,1/21,8/3,2/175 | +2% | — | não | não | não | não | dairy |
| WeightLoss01 | 355 | 355 | 355 | 34/26/2/244 | 33,8/26,1/1,5/244 | +0% | — | sim | não | não | não | dairy, animal |
| WeightLoss02 | 380 | 380 | 380 | 28/18/5/227 | 27,8/17,7/5,5/226 | +0% | — | sim | não | não | não | — |
| WeightLoss03 | 312 | 312 | 312 | 23/27/5/233 | 22,7/26,8/4,8/233 | -0% | — | sim | não | não | não | dairy |
| WeightLoss04 | 290 | 290 | 290 | 30/13/7/218 | 30,1/12,8/7,2/218 | +0% | — | não | não | não | não | — |
| WeightLoss05 | 400 | 400 | 400 | 23/23/2/201 | 23,3/23,4/2,1/200 | +0% | — | sim | não | não | não | dairy |
| WeightLoss06 | 400 | 400 | 400 | 23/23/3/198 | 22,6/23,2/2,5/198 | +0% | — | não | não | não | não | — |
| WeightLoss07 | 400 | 400 | 400 | 26/21/0/186 | 26,3/20,9/0,5/186 | +0% | — | sim | não | não | não | dairy, animal |
| WeightLoss08 | 320 | 320 | 320 | 19/31/2/212 | 18,8/30,6/2,4/212 | -0% | — | sim | não | não | não | dairy |
| WeightLoss09 | 375 | 375 | 375 | 28/30/4/271 | 28,3/30,4/4,4/270 | +0% | — | sim | não | não | não | animal |
| WeightLoss10 | 400 | 400 | 400 | 28/21/4/219 | 28,0/21,2/3,5/219 | -0% | — | sim | não | não | não | dairy, animal, nuts |
| WeightLoss11 | 400 | 400 | 400 | 25/20/1/186 | 24,5/20,3/1,3/186 | +0% | — | não | não | não | não | dairy |
| WeightLoss12 | 400 | 400 | 400 | 17/21/7/214 | 17,4/21,0/7,3/214 | +0% | — | sim | não | não | não | — |
| WeightLoss13 | 400 | 400 | 400 | 25/30/6/277 | 25,2/30,5/6,1/277 | +0% | — | sim | não | não | não | — |
| WeightLoss14 | 400 | 400 | 400 | 27/25/3/225 | 27,1/24,7/3,2/225 | -0% | — | não | não | pera | não | dairy, animal, nuts |
| WeightLoss15 | 400 | 400 | 400 | 24/13/5/186 | 23,6/13,2/5,1/186 | +0% | — | não | não | não | não | nuts |
| WeightLoss16 | 380 | 380 | 380 | 22/26/2/202 | 22,1/25,7/2,1/202 | +0% | — | sim | não | não | não | — |
| WeightLoss17 | 360 | 360 | 360 | 14/25/5/194 | 14,1/25,1/5,2/194 | +0% | — | sim | não | não | não | — |
| WeightLoss18 | 400 | 400 | 400 | 24/28/1/215 | 24,5/28,2/1,2/215 | +0% | — | sim | não | não | não | dairy |
| WeightLoss19 | 400 | 400 | 400 | 20/22/4/197 | 20,2/22,5/3,6/197 | +0% | — | sim | não | não | não | dairy, nuts |
| WeightLoss20 | 330 | 330 | 330 | 20/23/5/212 | 20,2/23,3/5,3/212 | -0% | — | sim | não | não | não | dairy |

