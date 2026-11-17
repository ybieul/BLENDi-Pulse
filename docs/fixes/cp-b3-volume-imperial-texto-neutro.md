# CP-B3: volume igual no métrico e no imperial, texto neutro sem BLENDi, vírgula em pt-BR

**Contexto.** O [CP-B2](cp-b2-conteudo-receitas-ia.md) deixou três pontos:

1. **Novas tentativas por volume no imperial.** No teste ao vivo, o métrico caiu para 3 de 23 pedidos com nova tentativa; o imperial ficou em 9-10 de 14. Causa: o leitor de volume (`apps/api/src/utils/recipeVolume.utils.ts`) contava "30 g de espinafre" como 30 ml, mas "1 cup spinach" como 236,6 ml, para os mesmos ~30 g de folhas. A mesma receita era barrada só para quem usa o imperial.
2. **Quem não tem BLENDi.** "Other or older model" e "No BLENDi yet" ficam gravados com `blendiModel` 'Lite' (decisão do CP-1.1.1a, mantida). A IA não olhava `blendiOwnership`, e o texto da receita dizia "no seu BLENDi Lite" para quem tem outra marca ou nenhum liquidificador.
3. **Números com ponto em pt-BR.** O `capacityNotice` do pedido de 900 kcal saiu "comporta até 13.5 fl oz" numa conta pt-BR (lote 4, item 108).

**Decisões do Gabriel:**
- imperial: as duas coisas juntas. O prompt dá o limite também em xícaras, e o backend conta fruta, folhas e pó medidos em xícara ou colher pelo peso típico (tabela). O que não está na tabela continua pelo volume da medida;
- quem não tem BLENDi: limites do Lite (400 ml, sem gelo, sem congelado), só o texto fica neutro;
- sorvete continua permitido no Lite;
- Pantry com poucas kcal: aceito.

**Resultado:**
- typecheck e lint limpos nos 3 workspaces;
- API **881 → 930** testes e mobile **862 → 862**, todos passando;
- no teste ao vivo (lote 6), os 12 pedidos imperiais com nova tentativa por volume caíram de 7-8 para **4**, e de 9-10 de 14 para **6 de 14** contando os 2 pedidos explícitos. O excesso que sobra é pequeno (417-445 ml em 3 dos 4 casos, contra 508-1006 ml antes). Contas sem BLENDi: 0 menções a BLENDi/Lite. pt-BR: 0 números com ponto. **Fica em aberto:** o pedido de 70 g de proteína ainda sai com 59 g e aviso, embora caiba no copo.

Nada mudou nos limites de volume, no bloqueio, nas regras de dieta e de gelo/congelado nem nas receitas da Home.

## Tarefa 1: volume pelo peso típico (backend)

O leitor passou a receber o ingrediente inteiro: `estimateIngredientVolumeMl({ name, amount })`, e `estimateRecipeVolumeMl` agora exige `name` em cada item. Quando a quantidade está em xícara, colher de sopa ou colher de chá (en e pt-BR, inteiras, frações, vírgula, como o leitor já lia) e o nome casa com a tabela, o volume conta os gramas típicos (1 g = 1 ml). Colher de sopa = 1/16 da xícara; colher de chá = 1/48.

**Tabela única:** `TYPICAL_INGREDIENT_WEIGHTS` em `apps/api/src/utils/ingredientWeights.utils.ts`. Fonte: USDA FoodData Central (SR Legacy, medida "1 cup"), salvo onde indicado.

| Grupo | Itens (g por xícara) |
|---|---|
| Folhas | espinafre 30, couve 67, alface 47, rúcula 20 |
| Frutas em pedaços | morango 152, mirtilo 148, framboesa 123, amora 144, frutas vermelhas mistas 142 (média das quatro), manga 165, abacaxi 165, mamão 145, banana 150, melancia 152, uva 151, pêssego 154, cereja 154 |
| Aveia | aveia em flocos 81 |
| Pós | proteína/whey 90 (rótulo típico: 1 scoop ≈ 30 g ≈ 1/3 xícara), cacau 86, matcha 96 (rótulo típico: 1 colher de chá ≈ 2 g) |
| Sementes | chia 160 (rótulo típico: 1 colher de sopa ≈ 10 g), linhaça 168 |
| Pastas | amendoim e castanhas 256 (USDA: 2 colheres de sopa = 32 g) |
| Iogurte | iogurte natural 245 |

- **Líquidos ficam fora.** Um nome com termo de líquido (`LIQUID_INGREDIENT_TERMS`: leite, água, suco, café, chá, kefir, bebida, néctar, polpa, purê, xarope…) nunca usa a tabela. Assim, "leite de aveia" não vira aveia e "suco de morango" não vira morango. "Pó"/"powder" anula a regra de líquido ("matcha green tea powder", "leite em pó").
- **Casamento do nome:** reaproveita a normalização do validador de dieta (`recipeRestrictions.utils.ts`): tokens, sem acento, singular/plural. Expus dois helpers pequenos lá (`compilePhrase` e `findPhraseOccurrences`) em vez de criar uma segunda lógica de texto. "Banana congelada", "morangos frescos" e "frozen mixed berries" casam com o item base. "Couve-flor" não casa com couve (`notFollowedBy`).
- **Nome com mais de um item** ("iogurte de morango"): vale o maior peso, o mais perto da conta antiga pela xícara cheia.
- **Sem mudança:** a medida entre parênteses continua prevalecendo ("2 cups (60 g)" = 60 ml), item sem medida continua contando 0, peso e volume diretos (g, ml, oz, fl oz) não mudam.
- **Chamadores:** Pulse AI e Pantry chamam `validateBlenderLimits`, que já passava os ingredientes inteiros. O limite e o bloqueio (422 / receita descartada) não mudaram. O teste de dados da Home não usa o leitor.

Efeito colateral pequeno: pasta de amendoim (256 g) e iogurte (245 g) contam um pouco **mais** que a xícara (236,6 ml), porque o peso típico passa da medida. Em 2 colheres de sopa a diferença é de ~2 ml.

## Tarefa 2: limite também em xícaras (prompt)

Contas imperiais veem o limite em fl oz e em xícaras, arredondado **para baixo** na fração comum (`formatCupsFloor` em `apps/api/src/utils/recipeText.utils.ts`):

| Modelo | ml | xícaras (400 / 236,6 e 600 / 236,6) | en | pt-BR |
|---|---|---|---|---|
| Lite, Pro+ | 400 | 1,69 → 1 2/3 | "13.5 fl oz, about 1 2/3 cups" | "13,5 fl oz, cerca de 1 2/3 xícara" |
| Steel | 600 | 2,54 → 2 1/2 | "20.2 fl oz, about 2 1/2 cups" | "20,2 fl oz, cerca de 2 1/2 xícaras" |

A regra do imperial no prompt trocou "xícara e colher contam a medida cheia, mesmo pó ou sólido" pela regra do peso: "folhas, frutas em pedaços, aveia, pós, sementes, pastas e iogurte em xícara ou colher contam o peso típico (1 xícara de espinafre ≈ 1 oz; 1 xícara de morangos ≈ 5 oz); líquidos e o resto contam a medida cheia". O whey continua pedido em oz. A mensagem de nova tentativa por volume diz o mesmo. Métrico: o texto do limite não mudou.

## Tarefa 3: texto neutro para quem não tem BLENDi

- `PulseAiPromptUserContext` ganhou `blendiOwnership` (opcional; ausente = 'blendi'). Pulse AI e Pantry leem o campo do usuário (`.lean()` sem o campo = 'blendi').
- **'other' e 'none'** recebem prompt sem "BLENDi", "Lite", modelo nem potência:
  - "You are Pulse AI … with deep knowledge of portable blenders";
  - "- Blender: a portable blender (brand and model not specified)" no lugar de "BLENDi model: BLENDi Lite (70W)";
  - copo "of the user's portable blender";
  - cabeçalho "Physical blender guardrails (portable blender)";
  - exemplo de `capacityNotice` "o copo do seu liquidificador portátil comporta até…".

  O prompt também manda não citar marca, modelo nem potência e chamar o aparelho de "your portable blender" / "seu liquidificador portátil". Limites e regras são os do Lite: 400 ml, sem gelo, sem congelado, sem inverter o copo.
- **Mensagens de nova tentativa:** a de gelo/congelado diz "this blender cannot blend ice or anything frozen" para essas contas (para 'blendi', continua "the BLENDi Lite…"). A de volume já era neutra. O contexto vai junto com o prompt (`BuildPulseAiPromptResult.textContext`), sem mudar a assinatura das funções de nova tentativa nos controllers.
- **'blendi' (ou ausente):** prompt idêntico ao de antes, nos textos de aparelho.
- **Cache da IA:** a chave já tinha o `userId`, mas a mesma conta pode trocar de 'other' para 'blendi'. A chave ganhou o sufixo `:generic` para 'other'/'none'; para 'blendi' fica igual (o cache atual continua válido). O hash da mensagem fica na mesma posição (o controller confere `parts[8]`).
- **Prompt da visão do Pantry:** diz "for BLENDi Pulse" (nome do app). Ele só devolve nomes de ingredientes e não gera texto de receita, então não mexi.

### Outros textos que essas contas veem (só reportado, nada mudou)

Nenhum texto fora da IA diz "BLENDi **Lite**" por causa do `blendiModel` 'Lite'. A tela Me (`getModelDisplay`), as medalhas de modelo (só com `blendiOwnership` 'blendi') e o "montando seu plano" do onboarding (`stepModelNeutral`) já olham o `blendiOwnership`. No backend, notificações e relatório semanal não usam o modelo. Mas o **"BLENDi" genérico** aparece para todos:

| Onde | Texto (pt-BR) |
|---|---|
| Home: 100 passos das receitas fixas | "Adicione … ao copo do BLENDi." |
| Pulse AI: subtítulo de boas-vindas dos 5 goals | "… ajustadas ao seu modelo BLENDi." |
| Erros `pulseai_dietary_restriction_unmet` / `scanner_dietary_restriction_unmet` | "… respeite a sua dieta e o seu BLENDi …" |
| Erro `pulseai_blender_limit_unmet` | "Essa receita não coube no seu BLENDi (**proteína** ou volume acima do que o copo comporta)…": além do BLENDi, ainda cita proteína, que deixou de ser limite no CP-B2 |
| Erro `scanner_blender_limit_unmet` | "… caiba no copo do seu BLENDi …" |
| Lembrete de limpeza (`cleanReminder`) | "Hora de limpar seu BLENDi" |

## Tarefa 4: números no formato do idioma

- Os números que o prompt mostra saem com vírgula em pt-BR: limite ("13,5 fl oz"), porção mínima ("8,5 fl oz"), exemplo de `capacityNotice` no imperial ("comporta até 13,5 fl oz"), o "0,2 oz" do exemplo de frações e a mensagem de nova tentativa por volume ("400ml (13,5 fl oz, cerca de 1 2/3 xícara)").
- Regra nova em pt-BR: "Write decimal numbers with a comma … in every text of the recipe (amounts, blendInstruction, steps, tip and capacityNotice): for example "13,5 fl oz", or "1,5 xícara" only when there is no common fraction for the amount. The numeric JSON fields (macros, prepTimeSeconds, pulseCount) stay plain JSON numbers."
- A tabela de referência nutricional (valores por 100 g, em inglês) continua com ponto: é dado de referência, que a IA não copia para o texto.
- O leitor de volume já aceitava vírgula decimal ("1,5 xícara", "1,5 colher de sopa", "0,5 l"). Agora há teste.

## Tarefa 5: testes

| Suíte | Antes | Depois |
|---|---|---|
| API | 881 | **930** (+40 em `utils/recipeContent.cpB3.test.ts`, +6 no `pulseAi.controller.test.ts`, +3 no `pantryScanner.controller.test.ts`) |
| Mobile | 862 | 862 (sem mudança no app) |

Cobertura nova:
- **Leitor de volume:**
  - "1 cup spinach" / "1 xícara de espinafre" = 30 ml; frutas pelo peso; 12 líquidos pela medida;
  - fora da tabela pela medida; parênteses prevalecem;
  - colheres, frações e vírgula; nomes compostos;
  - integridade da tabela (sem líquido; ids únicos).
- **Métrico × imperial:** 8 pares equivalentes com diferença ≤ 10%. A mesma receita verde dá 345 × 343 ml (antes, 591 ml no imperial). O limite e o bloqueio continuam iguais.
- **Prompt:**
  - limite em xícaras (en e pt-BR, Lite/Pro+/Steel) e regra do peso;
  - métrico sem mudança;
  - vírgula em pt-BR (nenhum decimal com ponto fora da tabela nutricional);
  - neutro para 'other' e 'none' (en/pt-BR × métrico/imperial, Pulse AI e Pantry) com os limites do Lite;
  - 'blendi' igual ao ausente.
- **Mensagens de nova tentativa** (vírgula, xícaras, neutra). **Cache:** sufixo só para quem não tem BLENDi.
- **Controllers:**
  - o prompt enviado à IA para 'other'/'none' não tem BLENDi/Lite/W;
  - `generateCacheKey` e `setInCache` recebem `genericBlender`;
  - nova tentativa de gelo neutra;
  - nova tentativa de volume em pt-BR imperial com vírgula;
  - "1 cup spinach + 1/2 cup strawberries + 1 cup oat milk" no Lite sem nova tentativa.

### Expectativas de testes existentes que mudaram

| Teste | Antes | Depois | Por quê |
|---|---|---|---|
| `promptBuilder.cpB2.test.ts`, orçamento de volume (imperial) | "13.5 fl oz" / "20.2 fl oz" | "13.5 fl oz, about 1 2/3 cups" / "20.2 fl oz, about 2 1/2 cups" | Tarefa 2: limite também em xícaras |
| `promptBuilder.cpB2.test.ts`, regra do imperial | xícara/colher contam a medida cheia, "even when it is a powder or a solid" | folhas, frutas, aveia, pós, sementes, pastas e iogurte contam o peso típico; líquidos a medida | Tarefa 1/2: a regra do prompt segue a conta nova do backend |
| `recipeVolume.utils.test.ts`, violação de volume | `{ estimatedVolumeMl, maxVolumeMl, maxVolumeOz }` | mais `model: 'Lite'` | a mensagem de nova tentativa precisa do modelo para dar o limite em xícaras |
| `recipeVolume.utils.test.ts`, fixtures do `estimateRecipeVolumeMl` | `{ amount }` | `{ name: '', amount }` | o leitor agora recebe o ingrediente inteiro (só tipo; valores iguais) |

### Comparação de prompts antes × depois

Mesmo método do CP-1.1.9: matriz de 162 prompts. São 5 combinações de aparelho (Lite/Pro+/Steel com 'blendi', mais Lite 'other' e 'none') × en/pt-BR × métrico/imperial × sem dieta / nut_free+vegan × lose/gain, no Pulse AI e no Pantry, mais os 2 prompts da visão. Gerei antes e depois de mudar o código e comparei linha a linha:

- **Sem nenhuma diferença (26):** todos os prompts en métrico de contas BLENDi e os 2 da visão.
- **pt-BR métrico, BLENDi (24):** só a linha nova da vírgula.
- **Imperial, BLENDi (en e pt-BR):** a regra do imperial (peso típico) e o limite com xícaras no orçamento e no guardrail. Só em pt-BR: vírgula em "13,5 fl oz", "8,5 fl oz", "0,2 oz", no exemplo de `capacityNotice` ("13,5 fl oz") e a linha da vírgula. Só en: o exemplo de `capacityNotice` em fl oz ("holds up to 13.5 fl oz").
- **'other' e 'none' (64, idênticos entre si):**
  - identidade ("Pulse AI … portable blenders");
  - "Blender: a portable blender (brand and model not specified)" no lugar do modelo e dos 70W;
  - copo e cabeçalho do guardrail neutros;
  - exemplo de `capacityNotice` neutro;
  - a linha "Never mention a blender brand, model or motor power…";
  - mais as diferenças de imperial e pt-BR acima.

Nenhum desses 64 prompts tem "BLENDi", "Lite", "Pro+", "Steel" nem potência. A única ocorrência de "wattage" é a proibição que todos já tinham ("never mention … the wattage").

Nenhuma outra diferença.

## Teste ao vivo (lote 6)

API local, banco `test` do Atlas, Gemini real, contas descartáveis apagadas no fim. Verificação no Mongo: 0 contas `audit-*`, 0 documentos ligados. Dados em `.audit/receitas-ia-2026-11-16.json`, `batch` 6 (itens 141-158).

O lote teve 18 pedidos do Pulse AI, todos 200, sem 422:
- os 12 pedidos das 6 contas imperiais do lote 1 (p03, p04, p07, p10, p11, p14, recriadas como pNNf);
- "shake com 70 g de proteína" e "shake com 900 kcal" na p04f (Lite, imperial, pt-BR);
- 4 pedidos de contas novas sem BLENDi: o1f 'other' en métrico, o2f 'other' pt-BR imperial ("smoothie de manga bem gelado"), n1f 'none' en imperial e n2f 'none' pt-BR métrico.

### Novas tentativas por volume no imperial

| | Lote 1 | Lote 4 (CP-B2) | Lote 5 (CP-B2 ajustado) | **Lote 6 (CP-B3)** |
|---|---|---|---|---|
| 12 pedidos regulares das contas imperiais | 7 | 7 | 8 | **4** |
| Os mesmos 12 + 70 g e 900 kcal | — | 9 de 14 | 10 de 14 | **6 de 14** |
| Volume da 1ª resposta nas novas tentativas | — | 508-1006 ml | 427-854 ml | **417-445 ml** (3 de 4; 569 ml na 4ª) |
| Métrico, para comparar | 4 de 20 | 3 de 23 | — | (n2f: 1 de 1, 420 ml) |

Os 4 regulares que ainda passaram (417, 427, 445 e 569 ml) já não são mais a xícara de folhas contada como 236 ml. São receitas que miram o copo cheio e passam um pouco, o mesmo padrão do métrico. Todas couberam na nova tentativa. A taxa no imperial (4 de 12) ficou perto do métrico do lote 1 (4 de 20), mas ainda acima do lote 4 (3 de 23).

### Porção mínima

0 receitas abaixo de 250 ml / 180 kcal sem pedido de algo leve (lote 4: 3 de 37). A menor ficou com 261 ml.

### 70 g de proteína e 900 kcal (Lite imperial, pt-BR)

| Pedido | Lote 4 | Lote 5 | **Lote 6** |
|---|---|---|---|
| 70 g de proteína | 37,1 g + aviso | 68 g + aviso | **59 g + aviso**, 353 ml (1ª resposta: 615 ml) |
| 900 kcal (não cabe) | 425 kcal + aviso | 475 kcal + aviso | **612 kcal + aviso**, 319 ml |

- **900 kcal:** a melhor resposta até aqui, com aviso correto e "13,5 fl oz" com vírgula.
- **70 g:** não foi atendido. A 1ª resposta passou do copo (615 ml) e, na nova tentativa, a IA reduziu também o whey (2 1/2 oz, ~71 g de pó) e pôs aviso. Mas 70 g cabem: 3 oz de whey (85 g) + 1 xícara de leite somam ~320 ml. O aviso é coerente com a receita entregue, só não precisava existir.

### Contas sem BLENDi ('other'/'none')

Os 4 pedidos voltaram com 200, com os limites do Lite: 261-355 ml, sem gelo nem congelado, inclusive no "bem gelado". Nenhum título, ingrediente, passo, instrução, dica ou aviso citou "BLENDi", "Lite", potência ou "watts".

### Números em pt-BR

0 decimais com ponto nos textos das receitas pt-BR (lote 1: 3; lote 4: 1; lote 5: 2). Os 2 avisos saíram com "13,5 fl oz".

### O que ficou em aberto

1. **70 g de proteína no Lite imperial:** a IA ainda reduz a proteína na nova tentativa por volume. Um caminho seria a mensagem de nova tentativa dizer que reduzir o pó de proteína quase não muda o volume e mandar reduzir primeiro fruta e líquido. Não fiz, porque está fora do escopo deste CP.
2. **Textos fora da IA com "BLENDi" genérico** (tabela da Tarefa 3), incluindo o erro `pulseai_blender_limit_unmet`, que ainda cita proteína.
