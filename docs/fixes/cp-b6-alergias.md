# CP-B6: alergias (cadastro, Pulse AI, Pantry, Home e telas)

**Ponto de partida:** até o CP-B6 o app só tinha preferências de dieta (`dairy_free`, `vegan`, `nut_free`, `no_added_sugar`), que o pedido explícito da mensagem pode furar (CP-B5). A tela de dieta avisava "são preferências, não uma garantia para alergias", mas quem tinha alergia não tinha onde cadastrar.

**Objetivo:** quem tem alergia fica protegido desde a primeira receita, em todo o app. Quem quer o alérgeno para outra pessoa consegue, com dois passos conscientes: nomear e confirmar.

**Decisões do Gabriel (24/11):**
- Botões prontos: amendoim, castanhas, leite, lactose, soja, trigo/glúten, gergelim, ovo. Campo livre para outros itens (até 10).
- Alergia só é furada por pedido explícito **na mensagem atual** que nomeia o alérgeno, e **sempre** com confirmação na hora. A confirmação não é gravada (cada pedido pode ser para outra pessoa) e não gasta mensagem nem scan. O card mostra aviso forte.
- Alérgeno não nomeado (ex.: "shake de paçoca") → receita **sem** o alérgeno, com sugestão e botão para pedir com ele (passando pela confirmação). Nunca um beco sem saída.
- Mensagens anteriores e histórico nunca liberam alergia.
- Coco não entra em castanhas. Aveia não é bloqueada por trigo/glúten, mas a receita mostra "Use aveia certificada sem glúten".
- No Pantry, a confirmação aparece na hora de marcar um alérgeno lido da foto.
- Quem marcou "sem oleaginosas" recebe um convite único para cadastrar como alergia; a preferência continua como está.

**Sem mudança:** limites e leitor de volume, gelo/congelado, álcool e idade, regras de dieta (`nut_free` continua furável), chave/provedor/modelo da IA.

## Modelo e cadastro

- **Campo novo no usuário:** `allergies: { common: AllergyCode[], custom: string[] }` (`apps/api/src/models/User.ts`). Sem default: conta antiga sem o campo lê como "sem alergia", sem migração.
- **Constante única:** `ALLERGY_CODE_VALUES` = `peanut`, `tree_nuts`, `milk`, `lactose`, `soy`, `wheat_gluten`, `sesame`, `egg` (`packages/shared/src/schemas/allergies.ts`).
- **Schema estrito** (`userAllergiesSchema`), editado pelo `PATCH /users/me`, que substitui o campo inteiro:
  - `common`: códigos válidos, sem repetir, gravados na ordem fixa;
  - `custom`: até 10 itens (teto conferido antes da validação item a item, achado D03 do CP-1.1.1a), até 40 caracteres depois de limpar. Caracteres de controle e de direção, tags inteiras e `<`/`>` viram espaço; vazio depois de limpar é recusado;
  - repetidos pela normalização (acento, maiúscula, plural: `Kiwi` × `kiwis`) saem, fica o primeiro.
- **Leitura:** `GET /users/me` (e `PATCH`, Google exchange) devolve `allergies` e `allergyInviteDismissed`.
- **Convite único:** `allergyInviteDismissed: true` no `PATCH` grava `allergyInviteDismissedAt`; só `true` é aceito.
- **Dado de saúde:**
  - nada de alergia vai para log: a violação aparece como `restriction: "allergy"` + campo, sem o termo; os logs do 428 não dizem qual alérgeno;
  - não existe evento de analytics de perfil, então nenhum foi criado;
  - na chave do cache da IA, a alergia entra só como hash;
  - sai com a conta: o campo é do documento `users`, e o teste do CP-B8a (`user.deleteAccount.test.ts`) continua passando.

## Famílias de alérgenos (`apps/api/src/utils/allergyFamilies.utils.ts`)

Constante única, no formato do validador (`recipeRestrictions.utils.ts`): mesmos acentos, singular/plural, compostos, exceções, qualificadores, frases permitidas e negação ("sem amendoim", "peanut-free" não contam). Nenhuma lógica de texto nova: a normalização passou para o shared (`packages/shared/src/utils/textMatching.ts`) e o validador importa de lá.

| Código | Bloqueia | Não bloqueia (de propósito) |
|---|---|---|
| `milk` (proteína do leite) | leite (inclusive sem lactose), leite em pó/condensado, creme de leite, whey (qualquer), caseína, soro de leite, iogurte, skyr, coalhada, kefir, queijos (todos), requeijão, ricota, cottage, cream cheese, mascarpone, manteiga, ghee, nata, chantilly, cream, sorvete/gelato, proteína em pó sem origem declarada; pratos: doce de leite, brigadeiro, milkshake | bebidas vegetais (leite de aveia/amêndoas/coco/soja/arroz), manteiga de cacau, pasta/manteiga de amendoim, creme de coco, kefir de água, sorvete vegano, proteína vegetal ou de clara/colágeno |
| `lactose` | leite, leite em pó/condensado, iogurte, coalhada, kefir, sorvete, creme de leite, cream, nata, chantilly, ricota, cottage, cream cheese, requeijão, mascarpone, queijo minas/fresco, queijo sem tipo, whey concentrado/sem tipo, lactose; pratos: doce de leite, brigadeiro, milkshake | tudo que diz "sem lactose"/"zero lactose"/"lactose-free"/"deslactosado" (até 3 palavras de distância, sem atravessar "e"/"com"), whey isolado, queijos curados (parmesão, grana padano, pecorino, "curado", "maturado", "aged"), manteiga, ghee |
| `peanut` | amendoim/peanut (pasta, manteiga, óleo, farinha), groundnut, oleaginosas, mixed nuts, nut butter sem tipo, trail mix; pratos: paçoca, pé de moleque; granola comum (só bloqueia) | "nuts" genérico em inglês (seria castanhas) |
| `tree_nuts` | amêndoa, castanha (qualquer), noz, noz-pecã, avelã, pistache, macadâmia, baru, pinoli/pine nut, chestnut, nut/nuts (en), oleaginosa, trail mix e leites/pastas delas; pratos: creme de avelã/Nutella/gianduia, pesto, marzipã, praliné; granola comum (só bloqueia) | coco (leite, creme, água, ralado, "noz-de-coco"), noz-moscada/nutmeg, caju a fruta (suco/polpa), castanha-d'água/water chestnut, amendoim |
| `soy` | soja/soy/soya/soybean, leite/bebida/proteína de soja, tofu, edamame, missô/miso, tempeh, shoyu, lecitina de soja | — |
| `wheat_gluten` | trigo/wheat (farinha, farelo, gérmen, fibra), cevada, centeio, malte/maltado, espelta, sêmola, cuscuz marroquino, couscous, bulgur, seitan, triticale, kamut, farina, glúten como ingrediente, farinha/flour sem tipo, farinha láctea; pratos/produtos: pão, biscoito/bolacha/cookie/cracker/wafer, brownie, cheesecake, cereal matinal, corn flakes/flocos de milho/sucrilhos, muesli, Ovomaltine; granola comum (só bloqueia) | **aveia** (flocos, farelo, farinha, leite de aveia: só o aviso), farinha de arroz/milho/mandioca/coco/amêndoa/grão-de-bico..., trigo sarraceno/buckwheat, pão de queijo, "sem glúten"/"gluten-free" |
| `sesame` | gergelim/sesame (semente, óleo), gomásio; pratos: tahine/tahini, halva | — |
| `egg` | ovo/egg, clara/egg white, gema/yolk, albumina/albumin, maionese/mayo; pratos: gemada/eggnog, merengue/meringue | eggplant, colágeno |

**Decisões tomadas aqui (reportadas ao Gabriel):**
- "Castanha" sozinha bloqueia castanhas: no Brasil é o nome genérico.
- Para a alergia a amendoim, "nuts" genérico não bloqueia, mas "mixed nuts", "nut butter" e "oleaginosas" sim (costumam ter amendoim).
- Granola comum bloqueia amendoim, castanhas e trigo/glúten, salvo quando o nome diz que não leva ("granola sem glúten", "nut-free granola", "granola sem amendoim"). Ela não nomeia nem implica alergia: não pede confirmação nem gera sugestão; a IA troca na nova tentativa.
- Cereal matinal, corn flakes e muesli bloqueiam trigo/glúten (malte/trigo na maioria das marcas), salvo "sem glúten".
- Leite: proteína em pó sem origem declarada conta como leite, como na regra vegana (pode ser whey ou caseína). Clara, colágeno e carne contam como origem declarada.
- **Chocolate** (correção antes do commit): bloqueia leite e lactose, na dúvida, como a proteína em pó sem origem declarada. Ver a seção "Chocolate" abaixo.

### Chocolate (correção antes do commit)

Sonda direta com alergia a leite: "Chocolate", "Chocolate em pó" e "Achocolatado" não eram barrados, e num shake "sabor chocolate" a IA podia escrever só "Chocolate". Chocolate comum e achocolatado quase sempre levam leite.

- **Bloqueiam leite e lactose** (`MILK_CHOCOLATE_TERMS`):
  - chocolate sem tipo, em pó/powder, ao leite/milk chocolate, branco/white, meio amargo/semisweet;
  - gotas/chips, calda/syrup, achocolatado, hot chocolate/hot cocoa mix, chocolate/cocoa drink mix, cocoa mix;
  - Nescau, Toddy, Nesquik, bombom/bonbon, trufa/truffle, ganache.
- **Não bloqueiam:** cacau, cacau em pó, cacao, cocoa (powder), nibs de cacau, chocolate amargo, dark chocolate, chocolate com 70% ou mais (70–100), chocolate vegano/vegan, chocolate sem leite, dairy-free/non-dairy/plant-based chocolate, unsweetened chocolate (100%, de culinária). Na **lactose**, também "sem lactose"/"lactose-free"; no **leite**, "sem lactose" continua bloqueando.
- **Decisão:** chocolate meio amargo (semisweet/bittersweet) **bloqueia**, porque muitas marcas levam leite. A frase que libera precisa vir **colada** ao "chocolate": "chocolate meio amargo" não é liberado pelo "amargo", e "chocolate em pó 100% cacau" bloqueia (a IA deve escrever "Cacau em pó").
- **Só bloqueia, como a granola:**
  - não nomeia o alérgeno nem pede confirmação;
  - não entra na tabela de pratos, então não gera sugestão;
  - não é conferido no título ("Shake de chocolate" passa);
  - não tira o sabor da conferência do CP-B8: "sabor chocolate" continua cobrado e é atendido por cacau ou chocolate amargo (`requestList` da restrição é a família sem o chocolate).
- Quem **nomeia** "chocolate ao leite", "milk chocolate" ou "leite" cai na confirmação (regra de sempre).
- **Prompt:** só com alergia a leite ou lactose ainda proibida, uma linha a mais na seção de alergias: sabor chocolate vem de cacau em pó, nibs ou chocolate amargo (70%+), nomeados assim. Sem alergia, ou com outras alergias, o prompt não muda.
- **Home:** remarcação das 100 receitas pelas famílias, sem nenhuma mudança (as receitas usam cacau). As contagens de leite e lactose por goal são as mesmas da tabela abaixo.
- **Preferências** `vegan` e `dairy_free`: no CP-B6a não mudaram; o Gabriel decidiu aplicar a mesma lista a elas (ver CP-B6b abaixo).

### CP-B6b: chocolate nas preferências vegan e dairy_free

**Decisão do Gabriel (24/11):** aplicar às preferências a mesma lista de chocolate do CP-B6a.

- **Lista única, sem duplicar:** `MILK_CHOCOLATE_TERMS` e `chocolateTerms()` saíram de `allergyFamilies.utils.ts` e foram para o validador (`recipeRestrictions.utils.ts`, exportados). A alergia a leite/lactose e as preferências usam a mesma lista. A lista ganhou "chocolate branco"/"white chocolate" como termos próprios, para poderem ser pedidos pelo nome; para as alergias nada muda, porque o "chocolate" do mesmo nome já barrava.
- **Onde entra:**
  - `dairy_free` passa a usar `DAIRY_FREE_RULES` (= `DAIRY_RULES` + chocolate);
  - `vegan` soma o chocolate às regras dele;
  - `DAIRY_RULES` não mudou: a família da alergia a leite continua a mesma (o chocolate lá só bloqueia, à parte).
- **Barra:** a lista inteira do CP-B6a. **Passa:** cacau, cacau em pó, cacao, cocoa, nibs, chocolate amargo/dark/70%+, chocolate vegano/vegan, sem leite, dairy-free/non-dairy/plant-based, unsweetened. "Sem lactose" **não** libera o chocolate para vegan e dairy_free (o extra de lactose existe só na alergia a lactose).
- **Dieta continua furável** pelo pedido explícito da mensagem atual, com `dietOverrideIngredients` e o aviso de dieta no card. Dois cuidados:
  - "chocolate" sozinho na mensagem ("shake sabor chocolate", "com chocolate") **não** é pedido explícito de chocolate com leite: é sabor, atendido por cacau ou chocolate amargo. Quem quer o chocolate com leite nomeia: "chocolate ao leite"/"milk chocolate" (pela palavra leite/milk, ingrediente coberto pela vizinhança), "chocolate branco", "achocolatado", "Nescau"...;
  - no título, "chocolate" sozinho não pesa ("Shake de chocolate" passa); o chocolate do ingrediente é que é conferido.
- **Prompt:** a mesma linha do CP-B6a ("For a chocolate flavor, use cocoa powder, cacao nibs or dark chocolate (70% cocoa or more)…") aparece na seção de dieta para `vegan` e `dairy_free`, em todas as variantes (chat, Pantry com e sem escolhas). Com alergia a leite/lactose também, ela aparece uma vez só. Sem essas preferências e sem essas alergias, o prompt é idêntico.
- **Pantry:** mesmo validador; conferido em teste (`dairy_free`: "Chocolate" refeito, "Cocoa powder" passa, linha no prompt).
- **Home:** o teste de marcação (`dairy`/`animal`) passou sem mudança: nenhuma das 100 receitas usa chocolate, só cacau. Contagens por goal (iguais às de antes):

| Goal | vegan | dairy_free |
|---|---|---|
| Muscle | 3 | 3 |
| Wellness | 2 | 2 |
| Energy | 6 | 7 |
| Recovery | 4 | 4 |
| WeightLoss | 8 | 9 |

- **Sem mudança:** `nut_free`, `no_added_sugar`, as famílias de alergia e o prompt de quem não tem essas preferências.
- **Testes:**
  - `recipeRestrictions.cpB6b.test.ts`: cada termo barrado/liberado em vegan e dairy_free, en e pt-BR; "sem lactose" não libera; mesma lista da alergia a leite; nut_free/no_added_sugar/sem dieta inalterados; "sabor chocolate" não fura; "chocolate ao leite", "milk chocolate", "chocolate branco" e "achocolatado" furam com `dietOverrideIngredientIndexes`; título; alergia a lactose inalterada; contagem da Home;
  - Pulse AI: vegano "sabor chocolate" com "Chocolate" → nova tentativa, "Cacau em pó" passa; "com chocolate ao leite" entra com aviso de dieta; linha uma vez só com alergia a leite; sem as preferências, sem linha e "Chocolate" passa;
  - Pantry: o caso acima;
  - prompt: vegan/dairy_free com a linha, nut_free/no_added_sugar sem, sem dieta igual.
  - **Expectativa alterada:** no teste do CP-B6a (`allergyFamilies.utils.test.ts`), o caso "as preferências vegan e dairy_free não mudam" virou "sem alergia nem preferência, nada muda" (nut_free/no_added_sugar), por decisão do CP-B6b.

**Campo livre:** cada item vira o grupo do vocabulário do CP-B8a quando o item **inteiro** é um alimento conhecido (`foodGroupTermsForItem`, `requestedFoods.utils.ts`). Exemplos:
- "kiwi" bloqueia kiwi/kiwis/kiwifruit;
- "morango" bloqueia strawberries;
- "caju" (a fruta) não bloqueia castanha de caju.

Só entram os termos de pedido do grupo, não os "atendido por", para não bloquear demais. Fora do vocabulário, vale o próprio texto normalizado: "camarão" bloqueia "camarões".

### Nomear × implicar

- **Nomeia:** termo da família, sem negação, fora de um nome de prato. Pede confirmação.
- **Implica:** prato ou produto da tabela `ALLERGEN_DISHES` que normalmente leva o alérgeno. A receita sai sem ele e com sugestão. Os nomes de prato ficam mascarados na busca de "nomear": "doce de leite" não nomeia "leite", "creme de avelã" não nomeia "avelã".

| Prato/produto | Alérgenos |
|---|---|
| paçoca, pé de moleque | amendoim |
| creme de avelã, Nutella, hazelnut spread, gianduia | castanhas, leite |
| pesto | castanhas, leite |
| marzipã, praliné | castanhas |
| tahine/tahini, halva | gergelim |
| doce de leite/dulce de leche, brigadeiro, milkshake | leite, lactose |
| gemada/eggnog, merengue | ovo |
| Ovomaltine/Ovaltine | trigo/glúten, leite, lactose |
| biscoito/bolacha/cookie/cracker/wafer, pão (não pão de queijo) | trigo/glúten |
| brownie | trigo/glúten, ovo, leite |
| cheesecake | leite, lactose, ovo, trigo/glúten |
| cereal matinal, corn flakes, flocos de milho, sucrilhos, muesli | trigo/glúten |

Os pratos também entram na família de cada alérgeno: a receita não pode trazê-los sem confirmação.

**Sem sugestão quando:** o alérgeno foi nomeado (vai para a confirmação), foi negado ("paçoca sem amendoim"), foi recusado na folha, ou não está cadastrado.

### Validador

- Cada alergia cadastrada é uma restrição a mais (`options.allergies` de `validateRecipeRestrictions`).
- É conferida em: ingredientes, passos, `blendInstruction` (negação por frase) e dica (negação por frase: a dica não pode sugerir o alérgeno).
- No título, só os termos que **nomeiam** o alérgeno são conferidos: "Shake sabor paçoca" passa na versão sem amendoim, como "Caipirinha" na versão sem álcool.
- O `explicitRequest` nunca libera alergia. Só `overridden` (a confirmação da requisição) libera, e só o alérgeno confirmado.
- O resultado devolve `allergyOverrideKeys` (alérgenos confirmados que de fato estão num ingrediente).

## Pulse AI (`POST /pulse-ai/chat`)

1. **Antes de tudo** (antes da idade, do cache, da reserva de uso e da IA), `resolveAllergyRequest` lê só a mensagem atual:
   - nomeia alérgeno cadastrado sem resposta na folha → `428 pulseai/allergy-confirmation-required` com `data.allergens`. Nada é gasto, cacheado nem gravado na conversa;
   - `allergyOverride` no corpo → aceito só o que a mensagem nomeia **e** está cadastrado; o resto é ignorado;
   - `allergyDeclined` → receita sem o alérgeno e sem sugestão.
2. **Prompt:**
   - seção "Allergies (mandatory, stricter than the dietary restrictions and than the explicit request)", com as alergias como dado entre aspas e "nada libera, só a confirmação do app";
   - linhas de confirmado (só nesta requisição), recusado e prato implícito; "aveia é permitida" com trigo/glúten;
   - os exemplos fixos do prompt saem pela dieta **e** pelas alergias (tabela de nutrição, variedade, hardware, objetivo de peso, exemplos de nome em pt-BR, "1 tbsp of peanut butter" → "1 tbsp of chia seeds", "Pasta de amendoim (peanut butter)" → "Morango (strawberry)" no Pantry);
   - sem alergia, o prompt é o mesmo de antes, byte a byte.
3. **Validador com as alergias:** violação → nova tentativa → `422 pulseai/dietary-restriction-unmet` (caminho existente, uso devolvido).
4. **Conferência do CP-B8:** alérgeno pedido e não confirmado (recusado ou implícito) não é cobrado; confirmado é cobrado normalmente.
5. **Sugestões de valor pedido** (`unmetTargets` e dicas da nova tentativa): com alergia a leite ou lactose, nada de whey ou iogurte; com amendoim ou castanhas, nada de pasta de amendoim ou castanhas.
6. **Cache:** a chave ganha `:allergy-<sha256>` (alergias + confirmados + recusados) só quando há alergia; quem não tem alergia mantém a chave. A receita do cache passa pelas alergias de agora. A deduplicação de duplo toque também separa por resposta da folha.
7. **Campos só do backend** (o que vier da IA é descartado em `prepareAiRecipePayload`):
   - `allergyOverride { common, custom }` → aviso forte;
   - `allergySuggestion { dish, allergens }` → sugestão com botão;
   - `glutenFreeOatsNotice` → "Use aveia certificada sem glúten".

**App:**
- O 428 abre a folha `AllergyConfirmationSheet`: "Você cadastrou alergia a X. Essa receita vai levar X. Continuar?", com "Sim, incluir" / "Não, fazer sem".
- A resposta reenvia o **mesmo** pedido, sem repetir o balão. Se depois vier o 428 de idade, o reenvio da idade leva a mesma resposta de alergia.
- Fechar a folha não envia nada.
- O botão "Quero com X" do card manda o pedido anterior + " (com X)". O alérgeno passa a estar nomeado e cai na folha.

## Pantry (`/pantry-scanner/read`, `/generate`, `/allergy-check`)

- **Leitura:** item que bate com alergia cadastrada vem com `isAllergen: true` + `allergens`, calculados com as alergias de agora. No app: rótulo "⚠️ Alergia" (vermelho, também no leitor de tela), **desmarcado**, no grupo em que estiver (principal ou "Outros itens").
- **Marcar** um item com alergia abre a folha na hora. "Sim" marca e guarda a confirmação daquela leitura; "Não" deixa desmarcado.
- **Adicionar à mão:** o app consulta `POST /pantry-scanner/allergy-check` (mesmas famílias, sem IA, sem scan), só quando a pessoa tem alergia cadastrada. Alérgeno → folha antes de entrar na lista. Falha de rede → adiciona, e a geração pergunta.
- **"Algum pedido?":** conferido **ao tocar em Gerar**. O backend responde `428 scanner/allergy-confirmation-required`, a folha abre e a geração vai de novo com a resposta (confirmado ou recusado). Se ainda pedir depois de responder, mostra o erro, sem laço.
- **Geração:**
  - o backend aceita só alérgenos vindos de item marcado, adicionado ou do pedido, e cadastrados;
  - sem confirmação → 428 antes de consumir a leitura, contar scan ou chamar a IA;
  - mesmo prompt, validador (item desmarcado com alérgeno fica proibido duas vezes), avisos e sugestão do Pulse AI;
  - no card do Pantry, a sugestão aparece sem botão;
  - todas as receitas descartadas → `422 scanner/dietary-restriction-unmet`, scan devolvido.
- A confirmação vale só para aquela leitura e zera em leitura nova ou "Escanear novamente".

## Home

- `HOME_RECIPE_CONTENT_VALUES` ganhou uma marcação por código (`peanut`, `tree_nuts`, `milk`, `lactose`, `soy`, `wheat_gluten`, `sesame`, `egg`).
- `nuts` continua sendo a marcação do `nut_free`, sem mudança. A decisão foi **separar**, não derivar, porque as regras diferem: granola sem amendoim é peanut-free, mas não nut-free.
- As 100 receitas foram remarcadas pelo próprio validador (`allergyFamilies`), com resultado igual em en e em pt-BR. O teste de marcação (`homeRecipeMarkings.test.ts`) passou a derivar e conferir as novas marcações.
- **Filtro:**
  - alergia comum pela marcação (`ALLERGY_FORBIDDEN_CONTENTS`);
  - item livre pelos nomes dos ingredientes em en e pt-BR, com a normalização do shared (`namesMentionAllergyItem`). Falha segura: com item livre e sem os nomes, a receita não aparece;
  - mesma seleção, rotação e fallback da dieta.
- Uma correção no caminho: "Egg white protein powder" contava como leite (proteína em pó sem origem declarada). Clara, colágeno e carne agora contam como origem declarada.

**Receitas compatíveis por goal e alergia comum** (travado no teste). Nenhum goal fica sem receita; o fallback não é acionado.

| Goal | Amendoim | Castanhas | Leite | Lactose | Soja | Trigo/glúten | Gergelim | Ovo |
|---|---|---|---|---|---|---|---|---|
| Muscle | 16 | 17 | 3 | 3 | 18 | 19 | 20 | 20 |
| Wellness | 20 | 20 | 2 | 2 | 18 | 20 | 20 | 20 |
| Energy | 18 | 18 | 7 | 7 | 19 | 19 | 20 | 20 |
| Recovery | 20 | 20 | 4 | 4 | 19 | 20 | 20 | 20 |
| WeightLoss | 20 | 16 | 9 | 12 | 16 | 20 | 20 | 19 |

Com alergia a leite, Wellness tem só 2 receitas: a rotação vai repetir. Fica para quando a Home ganhar receitas novas.

## Telas e textos

- **Onboarding** (`OnboardingDietScreen`): abaixo da dieta, a seção opcional "Você tem alguma alergia?" (`AllergiesPicker`: 8 botões + campo livre + texto de honestidade). Pular = não marcar nada. O `PATCH` final (`OnboardingMacrosScreen`) leva `allergies` só quando há alguma.
- **Perfil:**
  - linha "Alergias" no Me (resumo "Nenhuma"/"N itens");
  - tela própria `AllergiesScreen`, no padrão da "Minhas metas": voltar, "Salvar" no rodapé, `PATCH` só com `allergies`, duplo toque barrado, aviso ao sair sem salvar.
- **Texto de honestidade** (sempre visível no seletor e no "Como usar"): "O app confere pelo nome do ingrediente. Ele não sabe o que há dentro de produtos industrializados (whey saborizado, granola, proteína vegetal) nem se houve contaminação cruzada. Sempre confira os rótulos." (en e pt-BR).
- **Convite único** no Me, para quem tem `nut_free` e nenhuma alergia: "Isso é alergia? Cadastre em Alergias para mais proteção", com botão para a tela.
  - Fechar grava no usuário (`allergyInviteDismissed`) e o convite não volta.
  - Se o `PATCH` falhar, fica escondido na sessão (fallback seguro: o convite é só um atalho).
  - A preferência `nut_free` não muda nem vira alergia.
- **"Como usar" do Pulse AI:** nova seção "Alergias" (como cadastrar, como a proteção funciona, como pedir para outra pessoa: nomear + confirmar, prato implícito, honestidade). Sem exemplo tocável com alérgeno, e os exemplos que citam uma alergia da pessoa somem: pasta de amendoim para amendoim, whey para leite/lactose.
- **"Como usar" do Pantry:** botão no cabeçalho da tela de ingredientes, na mesma moldura do Pulse AI (`HowToUseSheetFrame`). Explica foto, marcar/desmarcar, "Outros itens na foto", adicionados obrigatórios, "Algum pedido?" (3 exemplos que **preenchem** o campo: "Com 30 g de proteína", "Sabor chocolate", "Algo leve, até 250 kcal"), líquido, bebida alcoólica, alergias e "gerar conta 1 scan".
- **Card da receita (`RecipeCard`):**
  - aviso forte vermelho, lido como alerta: "⚠️ Contém amendoim, item que você cadastrou como alergia." / "⚠️ Contains peanut, which you listed as an allergy.";
  - sugestão "<Prato> leva <X>, que você cadastrou como alergia. Fiz sem <X>. Quer com <X>?" + botão "Quero com X";
  - "Use aveia certificada sem glúten".
- Todos os textos em `en.json` e `pt-BR.json`, chaves válidas pela checagem estrita do `t()`, sem cast; botões com rótulo, estado e alvo de 44 pt.

## Problemas relacionados encontrados e corrigidos

- O texto fixo do prompt oferecia pasta de amendoim, whey, leite e iogurte como exemplo para todo mundo (o mesmo vazamento do achado PI-J1). Agora saem para quem tem a alergia.
- As sugestões de valor pedido não atingido (Pantry) e as dicas da nova tentativa podiam sugerir pasta de amendoim ou whey a quem é alérgico.
- A dica da receita não era conferida pela dieta. Pela alergia passa a ser.
- No "Como usar" do Pulse AI, exemplos com o alérgeno da pessoa deixam de aparecer.
- A frase liberadora ("sem lactose", "sem glúten") agora pode estar até 3 palavras depois do termo, só nas famílias de alergia. As regras de dieta não mudaram.

## Riscos que ficam (fora do escopo)

- Favoritos, histórico de conversas, Modo Passo a Passo e prévias desbloqueadas gerados **antes** do cadastro da alergia não são reconferidos.
- Item livre com nome de categoria ("frutos do mar") não pega "camarão". O texto de honestidade cobre isso; o ideal é um grupo de categorias no vocabulário.
- Escrever "leite" no campo livre (em vez do botão) bloqueia também as bebidas vegetais. Erra para o lado seguro.
- O teste ao vivo com o Gemini fica para o lote final (chave paga): medir quantas receitas precisam de nova tentativa por alergia e se o título com o nome do prato sai bem.

## Testes

**API, 1320 → 1566** (12 do CP-B6a, 19 do CP-B6b):
- `allergyFamilies.utils.test.ts`: cada código em en e pt-BR; leite × lactose; bebidas vegetais; coco e noz-moscada; aveia + aviso; campo livre (vocabulário e fallback); nomear × implicar; tabela de pratos; resolução do pedido; chave do cache; log sem o termo.
- `pulseAi.cpB6.test.ts`:
  - 428 sem IA, uso, cache ou turno; confirmação não gravada;
  - confirmação de item não citado ou não cadastrado ignorada; "sem amendoim" não pede confirmação; "Não, fazer sem";
  - campo livre; paçoca + sugestão; título;
  - IA que põe alérgeno sem pedido → 422; histórico não libera; dica; `nut_free` continua furável;
  - aveia; campos da IA descartados; cache separado; cache antigo refeito; logs sem alergia.
- `pantryScanner.cpB6.test.ts`: `isAllergen` na leitura; 428 sem scan e com a leitura ainda válida; adicionado; pedido recusado; confirmação fora das fontes ignorada; desmarcado com alérgeno; prato implícito; prompt; `/allergy-check`.
- `user.allergies.test.ts`: schema (limites, duplicados, texto limpo, estrito, payload gigante); `PATCH`/`GET`; convite; `nut_free` não vira alergia; erro sem gravar; nada em log.
- `promptBuilder.cpB6.test.ts`: sem alergia, prompt idêntico; dado entre aspas; exemplos sem alérgeno; confirmado/recusado/implícito; aveia; Pantry.
- Chocolate: cada termo bloqueado e liberado com alergia a leite e a lactose (en e pt-BR); "sem lactose" só na lactose; sem confirmação nem sugestão; título; sem alergia e `vegan`/`dairy_free` inalterados; Pulse AI "shake sabor chocolate" ("Chocolate" → nova tentativa, "Cacau em pó" passa; o sabor continua cobrado; sem alergia, sem nova tentativa); prompt com a linha só para leite/lactose.
- `homeRecipeMarkings.test.ts`: marcações novas pelas famílias em en e pt-BR; contagem por goal; campo livre.

**Mobile, 970 → 1014:**
- `PulseAIScreen.cpB6`: folha, confirmar/recusar, não guarda, fechar, "Quero com X", "Como usar".
- `PantryScannerScreen.cpB6`: rótulo, marcar/"Não"/"Sim", adicionar, sem alergia sem consulta, pedido recusado, "Como usar" com exemplos que preenchem.
- `RecipeCard.allergies`, `AllergiesPicker`, `AllergiesScreen`, `MeScreen.allergies` (linha e convite), `OnboardingDietScreen.allergies`, `dailyRecipeSelection.allergies` e o `PATCH` final em `OnboardingMacrosScreen`.

**Expectativas existentes alteradas:**
- `MeScreen.test.tsx`: o card passou de 6 para 7 linhas ("Alergias" depois de "Minhas metas").
- `PantryScannerScreen.test.tsx` e `.lockedPreview.test.tsx`: só o mock de `react-native-safe-area-context` ganhou `useSafeAreaInsets` (as folhas novas usam).
- `recipeRestrictions.utils.test.ts`: só o tipo de retorno de um helper (`RecipeRestriction | 'allergy'`).

**Verificação:** typecheck nos 3 workspaces, lint, suíte da API (1566/1566) e suíte do mobile (1014/1014), todos limpos. Sem teste ao vivo com o Gemini.
