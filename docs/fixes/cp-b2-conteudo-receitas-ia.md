# CP-B2: conteúdo das receitas da IA (Pulse AI e Pantry Scanner)

**Contexto.** A auditoria de 2026-11-16 ([relatório](../../Claude-outputs/auditoria-receitas-ia-2026-11-16.md); dados em `.audit/receitas-ia-2026-11-16.json`, fora do git) e o [CP-B1](cp-b1-confiabilidade-ia-pantry-pulse-ai.md) resolveram a confiabilidade. Este CP trata do **conteúdo** das receitas, em todos os goals. Problemas do lote 1:

1. **Tamanho.** A IA mirava nas metas diárias e estourava o copo: 15 novas tentativas por limite em 32 pedidos, e um 422 no Lite. Quando corrigia, exagerava (104 e 107 kcal no Lite), e a restrição vazava para o nome: 7 títulos com "Compact"/"Compacto".
2. **Idioma.** Receitas pt-BR com ingredientes em inglês e "fluid ounces" no meio do texto. No Pantry, a visão devolvia os nomes em inglês.
3. **Unidades imperiais com decimais** ("0.33 cup", "0.2 oz").
4. **Passos incoerentes:** gelo ou congelado que não estava na receita, `pulseCount` sem congelado, "invert the BLENDi Lite", limite de volume e potência do motor no texto.
5. **Pouca variedade:** leite de amêndoas em 22 de 29 receitas; no Pantry, as 2 receitas quase iguais.
6. **Fruta congelada no Lite:** o Jon confirmou que não pode; o validador permitia de propósito.
7. **Pantry sem líquido na foto:** receitas grossas demais.

**Decisões do Gabriel:**
- o único limite físico é o volume do copo;
- macros e calorias seguem o pedido, desde que caibam;
- sem pedido de tamanho, a receita tem pelo menos ~250 ml e ~180 kcal;
- pedido que não cabe gera a receita mais próxima, com alerta explícito no card;
- inverter o copo só no Steel;
- tudo no idioma da pessoa;
- no Pantry, água é sempre permitida e é o único extra, com aviso no card.

**Resultado:**
- typecheck e lint limpos nos 3 workspaces;
- API **792 → 881** testes e mobile **854 → 862**, todos passando;
- no teste ao vivo (lote 4, com verificação no lote 5), quase todos os problemas do lote 1 caíram a zero. **Fica em aberto:** novas tentativas por volume em contas imperiais. Ver [a seção do teste ao vivo](#teste-ao-vivo-lotes-4-e-5).

---

## Tarefa 1: volume como único limite físico

O teto de proteína por modelo (`maxProteinGrams` 35/45/55 g) saiu de todo o código. O volume ficou como estava (Lite 400 ml, Pro+ 400 ml, Steel 600 ml), com a mesma nova tentativa e o mesmo `422` como proteção final.

| Lugar | Mudança |
|---|---|
| [blenderLimits.ts](../../packages/shared/src/blenderLimits.ts) | `maxProteinGrams` saiu do tipo `BlenderLimit` e dos valores. Nada legítimo dependia dele. |
| [promptBuilder.service.ts](../../apps/api/src/services/promptBuilder.service.ts) | Saiu a linha "Total protein in this recipe must not exceed …g". O guardrail final diz que o volume é o único limite físico. O texto do `gain` passou a citar só o volume. |
| [blenderGuardrail.utils.ts](../../apps/api/src/utils/blenderGuardrail.utils.ts) | Saíram `validateProteinGuardrail`, `buildProteinGuardrailRetryMessage`, o tipo `ProteinGuardrailDiscrepancy` e o campo `protein` da violação. `validateBlenderLimits` só olha o volume, e o log só traz `volumeMl`/`maxVolumeMl`. |
| [pulseAi.controller.ts](../../apps/api/src/controllers/pulseAi.controller.ts), [pantryScanner.controller.ts](../../apps/api/src/controllers/pantryScanner.controller.ts) | Só comentários: a lógica já chamava `validateBlenderLimits`. |
| [homeRecipeCompatibility.ts](../../packages/shared/src/utils/homeRecipeCompatibility.ts) | Saiu `fitsBlenderProteinLimit`. `isHomeRecipeAllowed` só confere dieta e gelo. |
| [dailyRecipeSelection.ts](../../apps/mobile/src/components/home/dailyRecipeSelection.ts) | Só o comentário (o filtro vinha do shared). O resto da Home não mudou. |
| Testes | [recipeVolume.utils.test.ts](../../apps/api/src/utils/recipeVolume.utils.test.ts), [homeRecipeMarkings.test.ts](../../apps/api/src/utils/homeRecipeMarkings.test.ts), [pulseAi.blenderLimits.test.ts](../../apps/api/src/controllers/pulseAi.blenderLimits.test.ts), [pulseAi.controller.test.ts](../../apps/api/src/controllers/pulseAi.controller.test.ts), [pantryScanner.blenderLimits.test.ts](../../apps/api/src/controllers/pantryScanner.blenderLimits.test.ts), [pantryScanner.reliability.test.ts](../../apps/api/src/controllers/pantryScanner.reliability.test.ts), [dailyRecipeSelection.test.tsx](../../apps/mobile/src/components/home/dailyRecipeSelection.test.tsx). |
| Documentação | [endpoints.md](../api/endpoints.md) (Pulse AI 9a/9c, Pantry passo 9, códigos 422, opções de modelo), [architecture.md](../architecture.md), [INVENTARIO-FUNCIONALIDADES.md](../INVENTARIO-FUNCIONALIDADES.md). Os docs de CPs anteriores ficaram como registro histórico. |

**Outros tetos de macro por receita:** procurei nos 3 workspaces e não há nenhum.
- Os `.max()` restantes nos schemas são de texto, duração, avaliação e tamanho de lista.
- O intervalo de 180–320 kcal das receitas WeightLoss da Home é só teste dos dados fixos.
- Os limites das metas diárias não mudaram.

## Tarefa 2: tamanho certo e pedido explícito

Constantes únicas em [recipeContent.ts](../../packages/shared/src/recipeContent.ts):
- `RECIPE_MIN_SERVING_ML` = 250;
- `RECIPE_MIN_SERVING_KCAL` = 180;
- `RECIPE_CAPACITY_NOTICE_MAX_LENGTH` = 240;
- `RECIPE_TITLE_SIZE_WORDS`.

**Prompt** (seção nova "Serving size (volume budget)", antes das regras de macros; os dois últimos itens da lista e as regras imperiais da Tarefa 3 vieram do lote 4 ao vivo):
- O copo é dado de antemão como orçamento de volume, em ml ou em fl oz conforme a conta, e a receita é **uma** porção.
- As metas diárias são contexto, nunca o alvo de um copo só. Saíram a regra "25% a 40% da proteína diária" e "Calibrate the recipe macros so the suggestion fits the user daily targets".
- Sem pedido de tamanho ou de valor, a porção tem pelo menos 250 ml (8.5 fl oz) e 180 kcal. Pedido de algo leve vale o pedido.
- Pedido com valor de qualquer macro ou de kcal é atendido, com os macros calculados dos ingredientes, desde que caiba. Não há limite além do volume.
- Pedido que não cabe gera a receita mais próxima e o `capacityNotice` preenchido, com exemplo no idioma da conta. O campo só é preenchido quando o pedido foi de fato reduzido.
- No Pantry não há texto livre: ficam o orçamento e a porção mínima, e o `capacityNotice` é omitido.
- Títulos: proibidas as palavras de `RECIPE_TITLE_SIZE_WORDS`.
- Pedido que não cabe: a receita mais próxima usa ~90% do copo, com os ingredientes mais densos.
- Ingredientes de poucas calorias: chegar à porção mínima com mais quantidade, nunca com porção menor.

**Campo `capacityNotice`** (em [schemas/pulseAi.ts](../../packages/shared/src/schemas/pulseAi.ts)):
- opcional, string, com `trim`, máximo de 240 caracteres;
- texto vazio conta como ausente e não invalida a receita.

[aiRecipePayload.utils.ts](../../apps/api/src/utils/aiRecipePayload.utils.ts) prepara o payload da IA antes do schema. Um aviso acima de 240 caracteres é cortado no último espaço, com "…", em vez de custar uma nova tentativa.

Por onde o campo passa:
- **Cache e conversa:** gravam a receita inteira (`Mixed`). Testado.
- **Desbloqueio de prévia:** devolve a receita inteira.
- **Prévia bloqueada:** `toPulseAiRecipePreview` só leva os macros. Testado.
- **Favoritos:** guardam os campos de sempre e não guardam o aviso, que fala de um pedido específico. Favoritar uma receita com aviso continua válido (testado).

**Nova tentativa por volume:** pede para manter o título (ou ajustá-lo sem palavras de tamanho) e a ideia da receita, reduzir as quantidades mirando ~90% do limite (não muito abaixo) e preencher o `capacityNotice` se o pedido deixar de ser atendido. No imperial, pede para pesar pó e sólidos densos em oz.

**App:** `RecipeCapacityNotice` no topo do [RecipeCard](../../apps/mobile/src/components/pulseAi/RecipeCard.tsx). O card do Pantry é o mesmo componente.
- Âmbar de aviso (`colors.overlay.warning`), ícone `warning-outline`, título "Ajustada para caber no copo" e o texto.
- `accessible` com `accessibilityRole="alert"` e rótulo "título. texto".
- Chave `pulseAi.capacityNoticeTitle` em en e pt-BR.

## Tarefa 3: idioma e unidades

**Prompt** (seção nova "Language of the recipe"):
- Todo texto visível no idioma da conta, sem mistura: título, nomes, quantidades com as palavras de unidade, `blendInstruction`, passos, dica e aviso.
- A tabela de referência e os exemplos em inglês servem só de dado.
- Em pt-BR, há exemplos de nomes traduzidos, filtrados pela dieta.

**Unidades:**
- **Métrico:** g e ml.
- **Imperial:** cup/tbsp/tsp/fl oz/oz com frações comuns (1/4, 1/3, 1/2, 2/3, 3/4, 1 1/2), nunca decimais.
- **Imperial, conta do volume** (depois do lote 4): xícara e colher contam pelo volume medido, mesmo para pó ou sólido, e o peso conta 1 oz = 1 fl oz. Pó e sólidos densos devem ser pesados em oz. Antes, a IA media o whey em xícaras e o backend contava a xícara como volume.
- **pt-BR imperial:** xícara, colher de sopa e colher de chá. Para fluid ounce, **escolhi "fl oz"** (e "oz"), em vez de "onça fluida": é a abreviação impressa em embalagens e copos medidores, curta e igual nos dois idiomas. "onça fluida" também é lida pelo backend.
- Os exemplos de unidade usam aveia e água de coco, compatíveis com todas as dietas. Antes usavam "almond milk" ou "water".

**Visão do Pantry:** `buildPantryAnalysisPrompt(locale)` pede os nomes no idioma da conta. Em pt-BR, com exemplos e "mesmo quando o rótulo está em outro idioma".

**Validador de dieta com nomes pt-BR:** confere bem laticínios (leite, iogurte, queijo, requeijão, kefir, nata, ricota, coalhada, leite condensado…), castanhas (amendoim, caju, castanha-do-pará, nozes, avelã, granola, paçoca, Nutella…), itens veganos (mel, ovo, colágeno, gelatina, proteína em pó sem origem vegetal) e açúcar (mascavo, adoçante, xarope, melado, achocolatado, rapadura). Há teste para isso. As alternativas vegetais (leite de aveia ou de coco, iogurte de coco) passam.

**Lacuna, sem mudar a regra:** em `no_added_sugar` não barram "geleia", "néctar de pêssego", "suco de caixinha" e "iogurte de morango" (iogurte saborizado). A lacuna é igual em inglês ("jam", "peach nectar", "strawberry yogurt"), então já existia e não foi aberta pelo idioma.

**Leitor de quantidades** ([recipeVolume.utils.ts](../../apps/api/src/utils/recipeVolume.utils.ts)): o teste novo achou 3 lacunas, todas corrigidas e cobertas por 23 casos.
1. **Bug:** "onça fluida" e "onças" nunca eram lidas. A normalização tira o acento ("onça" vira "onca"), mas a regex esperava "ç".
2. "1/4 de xícara": o "de" entre o número e a unidade não era aceito.
3. "1/2 colher (sopa)": o tipo entre parênteses era descartado, e a colher contava como de chá.

## Tarefa 4: passos coerentes

**Prompt** (seção nova "Steps and blend instruction"):
- passos e `blendInstruction` só citam ingredientes da receita;
- `pulseCount` só em passo com gelo ou congelado que esteja na receita;
- nada de limite de volume, motor ou potência no texto;
- inverter o copo só no Steel ("You may tell the user to invert the cup"); no Lite e no Pro+ é proibido, também no guardrail final;
- revisar a ortografia.

Saiu "Personalize the blendInstruction for the user hardware", que puxava a potência para o texto.

**Checagem objetiva no backend** ([recipeSteps.utils.ts](../../apps/api/src/utils/recipeSteps.utils.ts)), sem nova tentativa, antes de entregar (Pulse AI e cada receita do Pantry):
- **`pulseCount`:** se nenhum ingrediente é gelo ou congelado (pelas mesmas regras do Lite, com negação), o `pulseCount` sai de todos os passos. Log `pulseCount removed from steps without ice or frozen ingredients` com a contagem.
- **Inverter fora do Steel:** registrado no log `recipe mentions inverting the cup outside the Steel`, só com campo e índice, sem texto. A receita não muda.

## Tarefa 5: Lite sem nada congelado

- **Prompt do Lite:** proíbe gelo e qualquer congelado (fruta congelada, polpa de açaí congelada, qualquer coisa do freezer) e proíbe sugerir congelado no lugar do gelo. Aparece na orientação de hardware e no guardrail final.
- **Validador** ([recipeRestrictions.utils.ts](../../apps/api/src/utils/recipeRestrictions.utils.ts)): `LITE_NO_ICE_RESTRICTION` (o id `lite_no_ice` ficou o mesmo) ganhou termos de congelado: `frozen` e `freeze` em en; `congelado(a)(s)`, `congele` e `congelar` em pt.
  - A negação aceita 1 palavra entre ela e o adjetivo ("sem fruta congelada", "não use frutas congeladas").
  - Decisões mantidas: sorvete não é gelo, "iced coffee" e "gelado" não são gelo, a `blendInstruction` usa negação por frase, "descongelado", "congelador" e "freezer" não casam.
  - Mesma nova tentativa e mesmo bloqueio de hoje. A mensagem da nova tentativa diz "no ice and no frozen ingredients".
- O comentário "Só gelo: fruta congelada continua permitida" virou o histórico com a decisão do Jon.
- **Receitas da Home:** não mudaram (CP-A). O teste de marcação passou a comparar `ice` só com termos de gelo (`isIceTerm`).
  - **Para o CP-A:** pelo validador novo, **18 receitas da Home seriam barradas no Lite** por congelado (Muscle 3, WeightLoss 15). Hoje a Home continua mostrando todas.
- **Ponto aberto:** sorvete continua permitido no Lite pela decisão antiga ("sorvete não é gelo"). Se "nada congelado" também vale para sorvete, é uma linha nas regras.

## Tarefa 6: variedade

- **Seção "Variety"** no prompt:
  - leite de amêndoas não é base padrão;
  - bases variadas (água, leite, leites vegetais, água de coco, iogurte, kefir) e fontes de proteína variadas, filtradas pela dieta;
  - nada de cair em "proteína + banana + aveia" ou "morango + espinafre".
  - Com `nut_free`, o texto nem cita amêndoas (achado PI-J1).
- **Pulse AI:** os últimos 5 blends (BlendLog) já iam no prompt. O controller os busca e o `buildPulseAiPrompt` os recebe, como confirmado no teste. A instrução ficou mais forte: não repetir nenhum deles nem a mesma base com os mesmos ingredientes principais, e não repetir receita já sugerida na conversa.
- **Pantry:** as 2 receitas precisam diferir na base, no sabor ou na textura. Trocar só uma fruta não conta.

## Tarefa 7: Pantry, água sempre permitida

- **Prompt:** "use os ingredientes da lista, mais água". Água pode ser a base quando não há líquido ou a receita ficaria grossa, e é o único extra. A dica pode sugerir trocar por leite ou bebida vegetal "se você tiver" (compatível com a dieta). Qualquer outro ingrediente fora da foto continua proibido, como antes.
- **Backend** ([recipeWater.utils.ts](../../apps/api/src/utils/recipeWater.utils.ts)): `usesWaterNotInPhoto: true` quando a receita usa água pura e nenhum ingrediente detectado era água.
  - Água de coco, tônica, kefir de água e melancia não contam.
  - O valor vindo da IA é descartado.
  - Campo opcional no schema do shared.
- **App:** linha curta abaixo dos ingredientes ("Inclui água, que não aparecia na foto."), chave `pulseAi.waterNotInPhoto` em en e pt-BR.

## Tarefa 8: achados baixos do CP-B1

- **Pulse AI no app:** `ECONNABORTED` vira `errors.network.timeout`, como no Pantry ([pulseAi.service.ts](../../apps/mobile/src/services/pulseAi.service.ts)). Os códigos da API continuam mapeados como antes. Testado.
- **Log `[pantryScanner] analyze request`:** sem o `userId`.

## Tarefa 9: testes

**Novos:**
- [promptBuilder.cpB2.test.ts](../../apps/api/src/services/promptBuilder.cpB2.test.ts): orçamento de volume nos 3 modelos, em métrico e imperial, sem linha de proteína; porção mínima; pedido explícito; `capacityNotice`; palavras de tamanho; idioma e unidades (en, pt-BR, imperial pt-BR); inverter só no Steel; Lite sem congelado; variedade e histórico; água e receitas diferentes no Pantry; visão no idioma da conta.
- [recipeContent.cpB2.test.ts](../../apps/api/src/utils/recipeContent.cpB2.test.ts): checagem de passos, água fora da foto, schema e saneamento do aviso, prévia sem aviso, favorito válido e dieta com nomes pt-BR.
- Casos novos nos testes de controller:
  - receita de 70 g de proteína no Lite entregue sem nova tentativa, nos 3 modelos;
  - aviso na resposta, no cache e na conversa;
  - `pulseCount` removido;
  - `usesWaterNotInPhoto` marcado na resposta do Pantry.
- Leitor de quantidades com frações e unidades pt-BR.
- Validador: congelado barrado no Lite (en e pt-BR, ingrediente e passo) e permitido no Pro+ e no Steel.
- [RecipeCard.capacityNotice.test.tsx](../../apps/mobile/src/components/pulseAi/RecipeCard.capacityNotice.test.tsx): alerta no topo, acessível, ausente sem campo e na prévia bloqueada; linha da água.
- Timeout do Pulse AI em [aiRequestTimeouts.test.ts](../../apps/mobile/src/services/aiRequestTimeouts.test.ts).

**Expectativas alteradas, e por quê:**

| Teste | Antes | Agora | Motivo |
|---|---|---|---|
| `recipeVolume.utils.test.ts` › BLENDER_LIMITS | `{ maxVolumeMl, maxVolumeOz, maxProteinGrams }` | sem `maxProteinGrams` | teto de proteína removido |
| `recipeVolume.utils.test.ts` › validateBlenderLimits | proteína 35,5 g barrava; violação com `protein` | só volume; 70 g dentro do volume passa; mensagem pede o título e o aviso | idem |
| `pulseAi.blenderLimits.test.ts` | 4 casos de nova tentativa e 422 por proteína | 70 g passa sem nova tentativa nos 3 modelos; casos de volume mantidos; cache com 70 g servido | idem |
| `pulseAi.blenderLimits.test.ts`, `pulseAi.controller.test.ts` (receita base) | "Frozen strawberries" no Lite | "Strawberries" | Lite sem congelado |
| `pulseAi.controller.test.ts` › ordem das validações | 1º retry por proteína (Lite) | 1º retry por volume (Pro+) | teto removido |
| `pantryScanner.blenderLimits.test.ts`, `pantryScanner.reliability.test.ts` | `heavy` = 40 g de proteína | `heavy` = acima do volume | idem |
| `pantryScanner.controller.test.ts` › Lite | "Frozen banana" entregue no Lite | refeita pela nova tentativa ("Fresh") | Lite sem congelado |
| `recipeRestrictions.utils.test.ts` › gelo no Lite | "Frozen banana", "Banana congelada" etc. permitidos; texto ao vivo com "utiliza frutas congeladas" passava | barrados; o texto ao vivo é violação; explicações sem sugerir congelado continuam passando | decisão do Jon |
| `homeRecipeMarkings.test.ts` | proteína ≤ 35 g; Lite compatível com tudo da WeightLoss; `ice` = qualquer violação do Lite | sem proteína; açúcar no Pro+ e gelo por `isIceTerm`; `ice` = só termos de gelo | teto removido; congelado da Home é do CP-A |
| `dailyRecipeSelection.test.tsx` | Lite perde Muscle 01/02/09/18 | Lite com as 20 | idem |
| `pulseAi.blenderLimits.test.ts`, `recipeVolume.utils.test.ts` › mensagem da nova tentativa | não citava "protein" | não cita limite de proteína; cita "about 90% of the limit (around 360ml)" e "protein powder" (como medir) | ajuste depois do lote 4 |
| `promptBuilder.service.test.ts` | exemplo "90g oats, 240ml almond milk" / "… water" | "40g rolled oats, 200ml coconut water" | variedade; sem almond milk como exemplo |

---

## Teste ao vivo (lotes 4 e 5)

**Método:** o mesmo da auditoria.
- API local, banco `test` do Atlas (o roteiro aborta se não for `test`) e Gemini real (`gemini-3.5-flash-lite`).
- Contas descartáveis `audit-pNN{d,e}-…@test.blendi.local`, cadastradas em fases de 5.
- `DELETE /pulse-ai/cache` antes de cada pedido, 503 repetido uma vez depois de 65 s.
- O roteiro fica fora do repositório.
- Os itens estão em `.audit/receitas-ia-2026-11-16.json`, com `batch: 4` (itens 73–119) e `batch: 5` (itens 120–140).
- **Limpeza:** todas as contas foram apagadas por `DELETE /users/me`. Na conferência no Mongo ficaram 0 contas `audit-*`, 0 documentos ligados e 0 prévias.

**O que rodou:**
- **Lote 4:** os 16 perfis do lote 1 (inclusive a gêmea p05/p16), os mesmos 32 pedidos (2 por conta, na mesma conversa), 5 pedidos novos com valor explícito e os 10 scans do Pantry.
- **Lote 5:** verificação de um ajuste feito a partir do lote 4 (ver abaixo). Rodaram os 12 pedidos das 6 contas imperiais, os 5 pedidos explícitos e 4 scans (S02, S04, S06, S07).

**Ajuste depois do lote 4:**
- **Imperial:** xícara e colher contam pelo volume medido, e pó ou sólido denso é pesado em oz. Antes, a IA media o whey em xícaras e o backend contava a xícara como volume.
- **Nova tentativa:** mira ~90% do copo.
- **Porção mínima:** atingida com quantidade maior, nunca com porção menor.
- **Pantry:** exemplos concretos de receitas diferentes.

### Pulse AI: lote 1 × lote 4

| | Lote 1 | Lote 4 | Lote 5 (subconjunto) |
|---|---|---|---|
| Pedidos / status final | 32: 29×200, 1×422, 2×503 | 37: **37×200** | 17: 17×200 |
| Novas tentativas por volume (pedidos com nova tentativa) | 13 (11 pedidos) | 12 (12 pedidos) | 10 (10 pedidos) |
| … contas métricas | 4 de 20 pedidos | **3 de 23** | 0 de 3 |
| … contas imperiais | 7 de 12 pedidos | 9 de 14 | **10 de 14** (em aberto, ver abaixo) |
| Novas tentativas por dieta | 1 | 0 | 0 |
| Novas tentativas por proteína | (contadas no limite) | 0 (não existem mais) | 0 |
| Abaixo de 250 ml ou 180 kcal sem pedido de algo leve | 6 de 29 | **3 de 37** (151, 142, 178 kcal) | 1 de 17 (139 kcal) |
| Títulos com palavra de tamanho | 7 | **0** | 0 |
| Receitas pt-BR com ingrediente ou unidade em inglês | 5 de 13 | **0 de 19** | 1 de 8 ("2 scoops", vindo do exemplo do prompt; o exemplo foi trocado) |
| Decimais no imperial | 13 receitas (0.33 cup, 0.2 oz…) | **0** | 0 |
| Leite de amêndoas | 22 de 29 | **2 de 37** | 0 de 17 |
| Congelado no Lite | 0 | 0 | 0 |
| Passo cita gelo ou congelado fora da receita | 3 (itens 9, 12, 28) | **0** | 0 |
| `pulseCount` sem gelo ou congelado | 5 | **0** (o backend não precisou remover nenhum) | 0 |
| Inverter fora do Steel | 1 (item 3) | **0** (1 no Steel, permitido) | 0 |
| Potência ou limite do copo no texto | vários ("motor de 70W", "120W") | **0** | 0 |

Bases líquidas no lote 4:
- leite de aveia 12;
- água 9;
- leite desnatado 7;
- água de coco 4;
- leite integral 3;
- leite de amêndoas 2.

No lote 1 eram 22 de leite de amêndoas.

### Pedidos com valor explícito

| Pedido | Modelo/unidade | Lote 4 | Lote 5 |
|---|---|---|---|
| "receita com 400 kcal" | Lite, métrico | 401 kcal, sem aviso ✓ | 397 kcal, sem aviso ✓ |
| "receita com 400 kcal" | Steel, métrico | 369 kcal (−8%), sem aviso ✓ | 427 kcal (+7%), sem aviso ✓ |
| "shake com 70 g de proteína" | Lite, imperial | **37,1 g com aviso** ✗: cabia, mas a IA mediu o whey em xícaras | 68 g, ainda com aviso ✗ (quase; o aviso não deveria aparecer) |
| "shake com 900 kcal" (não cabe) | Lite, imperial | 425 kcal com aviso ✓ (aviso certo; valor longe do máximo possível) | 475 kcal com aviso ✓ (melhorou; ainda ~300 ml) |
| "pouco carboidrato, até 15 g" | Pro+, métrico | 14,8 g, sem aviso ✓ | 10,4 g, sem aviso ✓ |

O `capacityNotice` apareceu só nos pedidos de 70 g e 900 kcal (2 de 37 e 2 de 17). Nunca apareceu em pedido sem valor. Nos dois lotes, no de 70 g ele apareceu sem precisar.

### Pantry: lote 1 × lote 3 × lote 4

| | Lote 1 | Lote 3 (CP-B1) | Lote 4 | Lote 5 (4 scans) |
|---|---|---|---|---|
| Scans com receita | 2 de 10 | 8 de 10 | **8 de 10** (S03: IA devolveu vazio para dairy_free + sem açúcar; S08: 503 da visão) | 3 de 4 (S02: 503 da visão) |
| Receitas | 4 | 14 | 16 | 6 |
| Novas tentativas | volume 2, dieta 2 | volume 2, dieta 1 | volume 4 | volume 2 |
| Nomes detectados no idioma da conta | — | inglês em contas pt-BR ("rolled oats") | **pt-BR nas contas pt-BR** | idem |
| Receitas com água fora da foto | — | 0 | **11 de 16**, todas marcadas | 6 de 6, todas marcadas |
| Pares de receitas parecidos (só troca de fruta ou de um item) | 2 de 2 | 5–6 de 6 | **3 de 8** (S04, S09, S10) | **0 de 3** |
| Abaixo de 250 ml ou 180 kcal | 4 de 4 | 9 de 14 | 8 de 16 | 6 de 6 (87–175 kcal) |

A água foi marcada certo em todos os casos: nenhuma foto tinha água detectada, e as receitas sem água não foram marcadas. No S01 (p02, sem laticínios), a água entrou no lugar do leite integral da foto, como esperado.

### O que ficou em aberto

1. **Novas tentativas por volume no imperial.**
   - **O que se vê:**
     - O métrico melhorou (4 de 20 → 3 de 23 → 0 de 3).
     - No imperial, a primeira tentativa ainda soma xícaras acima de 13.5 fl oz (490–860 ml no estimador).
     - Depois da nova tentativa, a receita fica em ~300 ml e algumas abaixo de 180 kcal.
     - O ajuste do lote 5 resolveu a parte do pó (70 g → 68 g), mas não a contagem das xícaras.
   - **Opções, que dependem de uma decisão sua:**
     - **(a) Prompt:** dar o orçamento também em xícaras ("13.5 fl oz, about 1 2/3 cups") e pedir a soma das xícaras antes de responder. Barato, precisa de nova rodada ao vivo.
     - **(b) Backend:** contar fruta e folhas medidas em xícara por um peso típico, e não pelo volume da xícara (hoje "1 cup spinach" conta 236 ml). Muda a regra de bloqueio.
2. **Pantry com poucas kcal.** A água deu líquido às receitas, mas também as deixou leves (lote 5: 87–175 kcal). As fotos S06/S07 (frutas, verduras, sem proteína) limitam, e a IA não seguiu a porção mínima.
3. **Pedido de 70 g no imperial:** o aviso aparece mesmo quando a receita chega perto do pedido.
