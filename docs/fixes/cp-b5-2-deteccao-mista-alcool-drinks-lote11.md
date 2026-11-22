# CP-B5.2: detecção mista do pedido de álcool, ingredientes dos drinks, código de cota e lote 11

**Ponto de partida:** no lote 10 ([cp-b5-1-praia-refrescos-titulo-lote10.md](cp-b5-1-praia-refrescos-titulo-lote10.md)), quem decidia se a mensagem pedia álcool era só a IA (`alcoholRequested`):
- destilado nomeado ("shake com rum" / "rum shake"): 24 de 24 certos;
- "piña colada sem álcool" / "virgin piña colada": `true` em 8 de 10 respostas de quem não tem 21+ (aviso de "sem álcool" sem motivo e uma pergunta de idade indevida);
- "piña colada sem gelo" em pt-BR: `false` 4 vezes;
- grupos menor de 21 (78,0%) e "Não" (78,9%) abaixo da meta de 95%;
- caipirinha em pt-BR 21+ sem limão (0 de 4 na pt21, 1 de 2 no Lite);
- 21+ recebeu "Piña Colada Zero Álcool" sem pedir (2 de 3 em pt-BR).

O backend já garantia o lado da segurança: nenhum menor ou "Não" recebeu álcool (0 em 160). Faltava a experiência.

**Decisão do Gabriel:** detecção **mista**. O código decide os casos óbvios, com a lista de bebidas alcoólicas e as negações que já existem no validador. A IA decide só quando a mensagem tem apenas o nome de um drink. Isso substitui, de propósito, a regra "sem lista de palavras para detectar o pedido" dos CPs anteriores.

**Sem mudança:** limites de volume, leitor de volume, gelo/congelado, regras de dieta (inclusive `nut_free`), idade, versão sem álcool, teto de 28 g, rede `no_alcohol`, cache por faixa de idade, receitas da Home e Pantry Scanner (só o log do 429 mudou). O prompt do Pantry saiu **idêntico** em 1.728 de 1.728 combinações (modelo, goal, weightGoal, idioma, unidade, dieta, com e sem BLENDi), comparado com o commit anterior. Nenhum log novo tem conteúdo de receita, prompt ou dado de usuário.

## Tarefa 1: detecção mista (backend)

**Arquivo novo:** `apps/api/src/utils/alcoholRequest.utils.ts`, com `detectAlcoholRequest(message): 'yes' | 'no' | 'ai'`.

**Sem segunda lógica de texto.** O validador (`recipeRestrictions.utils.ts`) passou a exportar três funções finas sobre o que já existia:
- `compileTermList`: compila uma lista com a mesma normalização (acentos, singular/plural, compostos, exceções);
- `findTermMentions`: devolve os termos citados e se cada um está negado, com as mesmas negações da regra 6;
- `findAlcoholMentions`: a mesma lista de bebidas alcoólicas do CP-B5, com os mesmos falsos amigos.

Por baixo, o laço de busca virou `scanOccurrences`, que marca a negação em vez de descartar. `findViolatingOccurrences` filtra as não negadas, com resultado igual ao de antes (a suíte inteira do validador passa sem mudança).

**Ordem da decisão** (só a mensagem atual):

| # | A mensagem tem | Resultado | Exemplos |
|---|---|---|---|
| 1 | pedido da versão sem álcool, ou termo genérico de álcool negado | `no` (vence tudo) | "sem álcool", "zero álcool", "sem bebida alcoólica", "virgin", "virgem", "mocktail", "non-alcoholic", "alcohol-free", "no alcohol", "nada de álcool", "vodka … sem álcool" |
| 2 | bebida alcoólica da lista do CP-B5 sem negação | `yes` | "com vodka", "rum shake", "com vinho", "cerveja", "com álcool", "alcoólico" |
| 3 | pedido genérico fora da lista | `yes` | "boozy", "spiked", "batizado" |
| 4 | só bebida negada | `no` | "caipirinha sem cachaça", "mojito without rum", "shake sem cachaça" |
| 5 | nome de drink clássico sem negação | `ai` | "caipirinha de morango", "piña colada sem gelo", "mojito" |
| 6 | nada disso | `no` | "shake de banana", protocolo "Praia e Refrescos" |

- **"caipirinha sem cachaça" é `no` pela linha 4**, a da negação: quem nega o destilado e não cita outro pede a versão sem álcool.
- **Decisão minha, para você confirmar: troca de destilado continua `yes`.** "caipirinha com vodka em vez de cachaça" e "mojito with vodka instead of rum" citam uma bebida sem negação (linha 2), e a negada é só a trocada. Se preferir que qualquer destilado negado vire `no`, é uma linha (trocar a ordem das linhas 2 e 4).
- **Falsos amigos** (as exceções do CP-B5, sem mudança): "essência de rum", "rum extract", "cerveja sem álcool", "cerveja zero", "vinagre de vinho", "gengibre"/"ginger" e "sake" (só em pt; "for the sake of" fica fora).
- **"virgem" de óleo** é exceção nova, só na detecção: "óleo de coco virgem" e "extra virgin olive oil" não viram pedido sem álcool. "shake com óleo de coco virgem e rum" continua `yes`.
- **"sem nenhum álcool"** entrou como frase inteira: o "sem" negava o "nenhum álcool" e dava `yes`. Achei na sonda antes dos testes.

**Lista de drinks que vão para a IA** (`CLASSIC_ALCOHOLIC_DRINKS`, constante única, usada também na Tarefa 2):
- com ingrediente conferido: caipirinha; caipiroska/caipivodka; piña colada (também "pinacolada"); mojito; margarita; daiquiri;
- só detecção: sangria, cosmopolitan, negroni, spritz, mimosa, bellini, martini, cuba libre, moscow mule, mai tai, bloody mary, michelada, irish coffee, eggnog, white russian, long island, sex on the beach, cocktail/coquetel/drinque.
- Drink com destilado no nome ("tequila sunrise", "pisco sour", "gin tônica", "whiskey sour") já é `yes` pela lista do CP-B5.
- **Ficaram fora de propósito:**
  - "batida": em pt também é "batido no liquidificador";
  - "drink": em inglês é verbo e "protein drink".
  - Consequência: "drink de maracujá" ou "batida de coco" sem destilado viram `no`, e um 21+ recebe a versão sem álcool. Se quiser, entram na lista (a IA decide).

**Uso no controller** (`pulseAi.controller.ts`):
- `yes` e `no`: vale a decisão do código e o `alcoholRequested` da IA é ignorado (`resolveAlcoholRequested`). O formato do JSON não mudou: a IA continua devolvendo o campo.
- `ai`: vale o `alcoholRequested` da IA, como antes.
- **428 antes da IA:** com `yes` e idade desconhecida, a pergunta de idade sai logo depois de carregar o perfil, antes do cache, da reserva de uso e da IA. Nenhuma chamada e nenhum uso gasto. Com `ai`, segue o fluxo de antes (428 depois da chamada, com o uso devolvido).
- **Cache:** com `no`, a receita do cache é conferida com álcool proibido, mesmo para 21+. O aviso de "sem álcool" da receita do cache sai da decisão do código quando ela existe.
- **Log novo, permanente** (só enums e booleanos): `alcohol request resolved { decision, aiFlag, alcoholRequested, alcoholAge }`. Foi o que mediu o lote 11, sem log temporário.
- Idade, versão sem álcool, teto de 28 g, rede `no_alcohol` e cache por faixa não mudaram. **Não há caminho em que menor, "Não" ou sem idade receba álcool:** a política continua `allowed` só com `alcoholRequested` **e** 21+.

**Prompt (escolha):** quando o código decide, a seção de álcool ganha uma linha no fim, sem tirar nada:
- `yes`: "The app has already checked the current message: it asks for alcohol. Set alcoholRequested to true."
- `no`: "The app has already checked the current message: it does not ask for alcohol (or it asks for the alcohol-free version). Set alcoholRequested to false and use no alcoholic ingredient."
- `ai`: nada (o prompt é o mesmo de antes).

Motivo: com `no`, um 21+ que pediu "virgin piña colada" não recebe rum por engano, o que custaria uma nova tentativa. Com `yes`, a versão sem álcool para menor sai com o aviso de primeira. A chave do cache não mudou: a decisão depende só da mensagem, que já está no hash.

## Tarefa 2: ingredientes que definem o drink (backend, só Pulse AI)

- **Tabela** (`DRINK_DEFINING_INGREDIENTS` + `CLASSIC_ALCOHOLIC_DRINKS`, constantes únicas):

| Drink | Ingredientes |
|---|---|
| caipirinha, caipiroska | limão |
| piña colada | abacaxi e coco |
| mojito | hortelã e limão |
| margarita | limão |
| daiquiri | limão |

- **Sinônimos:**
  - limão: limão, lima, suco de limão, lime, lime juice, **lemon**;
  - abacaxi: abacaxi, ananás, pineapple;
  - coco: coco, leite de coco, creme de coco, coconut (água de coco também conta, pelo token "coco");
  - hortelã: hortelã, menta, mint.
- "lemon" e "ananás" não estavam no pedido. Entraram porque a IA em inglês escreve "lemon juice" às vezes, e um pedido refeito por isso seria só custo.
- **Como confere:** só os nomes dos ingredientes da receita, com a normalização e a negação do validador.
  - Um ingrediente que a própria mensagem nega não é cobrado: "caipirinha sem limão" e "mojito without mint" respeitam o pedido.
  - Drink negado ("não quero caipirinha") não cobra nada.
- **Caminho:** `ensureDrinkDefiningIngredients`, logo depois da 1ª receita válida (e depois do 428), antes das conferências de volume, macros e dieta/álcool. Assim a receita refeita passa por todas elas.
  - Uma nova tentativa, com a mensagem "Your previous response is missing ingredients that define the drink the user asked for: a caipirinha needs lime…".
  - Vale para a versão com e sem álcool.
- **Nunca bloqueia:**
  - se o ingrediente continuar faltando, a receita refeita é entregue e o log registra "still missing after retry";
  - resposta inválida ou falha do provedor: a primeira receita é entregue (não vira 503).
- **Prompt:** a linha que já existia ("A named drink or dish is a request for its defining ingredients…") ficou, e entrou uma linha nova gerada da mesma tabela: "Drinks and the ingredients that define them, which must be in the ingredients list whenever the current message names the drink, in every version (with or without alcohol, and in any flavor: a strawberry caipirinha still has lime): caipirinha: lime; …".

## Tarefa 3: reforço no prompt (Pulse AI)

- Só na versão 21+ da seção de álcool, uma linha nova depois de "Never turn it into an alcohol-free version on your own":
  > When the message counts as asking for alcohol, the recipe always has the alcoholic ingredient: never return an alcohol-free, "zero", "0%" or "virgin" version and never use those words in the title. Only the current message itself can ask for the alcohol-free version.
- Drink pelo nome: conferido; a regra existia e foi reforçada pela linha da tabela (Tarefa 2).
- O resto do prompt não mudou. O Pantry não mudou (comparação acima; o tipo de entrada do Pantry nem aceita os campos de álcool).

## Tarefa 4: código interno para cota do provedor

- `AiProviderRequestError` ganhou `code`: `ai/quota-exceeded` quando o provedor respondeu `429`, e `ai/unavailable` para o resto (500/503 depois das novas tentativas, timeout, rede).
  - `classifyAiFailure` lê só o `status` numérico do erro (Gemini, OpenAI e Anthropic expõem o mesmo campo).
- Os logs `[aiProvider] request failed` (texto: Pulse AI e geração do Pantry) e `[aiProvider] vision request failed` (visão do Pantry) levam o `code`, sem prompt, mensagem ou receita.
- **A resposta ao app não mudou:** `503 pulseai/ai-unavailable` e `scanner/vision-unavailable`, com o uso devolvido.
- `docs/gemini-costs.md`:
  - limites do plano gratuito medidos (15 por minuto, 500 por dia);
  - a observação de que a chave de produção é a mesma dos testes;
  - como achar `ai/quota-exceeded` no log;
  - o efeito do CP nas chamadas: uma a mais quando falta ingrediente do drink, nenhuma no 428 decidido pelo código.

## Tarefa 5: testes e verificação

**Novos (API, 49):**
- `utils/alcoholRequest.cpB52.test.ts` (24):
  - cada linha da tabela em en e pt-BR;
  - negação, conflito, troca de destilado;
  - falsos amigos e "virgem" de óleo;
  - nome de drink → `ai`;
  - "mistura com vodka e alguma fruta" / "vodka shake with any fruit" → `yes`;
  - "piña colada sem álcool" e "virgin piña colada" → `no`;
  - "piña colada sem gelo" → `ai`;
  - os dois textos reais do protocolo "Praia e Refrescos" → `no`;
  - tabela de ingredientes, sinônimos, ingrediente negado, mensagem de nova tentativa e linha do prompt.
- `services/promptBuilder.cpB52.test.ts` (6): reforço só para 21+ (en e pt-BR), linha da tabela na seção de pedido explícito, linha da decisão para `yes`/`no` (e prompt igual ao de antes com `ai`), Pantry sem nada disso.
- `controllers/pulseAi.cpB5.test.ts` (+15):
  - `no` ignora a flag `true` da IA (menor sem aviso indevido; sem data sem pergunta; 21+ com rum refeito);
  - `yes` ignora a flag `false` (21+ com álcool; menor com aviso);
  - `yes` + idade desconhecida → 428 sem chamar a IA, sem ler o cache e sem reservar uso;
  - `ai` segue a flag (428 depois da chamada; `false` para 21+ proíbe álcool);
  - cache com `no` conferido com álcool proibido;
  - drink sem ingrediente → nova tentativa; com "sem limão" pedido → não refaz; persistente → entrega; falha do provedor na nova tentativa → entrega a primeira.
- `services/aiProvider.service.test.ts` (+4): 429 → `ai/quota-exceeded` no erro e no log, sem conteúdo; 503/400 → `ai/unavailable`; visão do Pantry com 429 → `ai/quota-exceeded`; `classifyAiFailure`.

**Expectativa alterada de propósito:**

| Teste | Antes | Agora | Por quê |
|---|---|---|---|
| `pulseAi.cpB5.test.ts`, fixture `caipirinha()` (usado em 9 testes) | cachaça, morango e água | + "Limão" (1/2) | sem limão, a Tarefa 2 refaz a receita e os testes que contam 1 chamada à IA falhavam (3 falhas). As calorias não mudam (o conferidor usa os macros, não os ingredientes) |

Nenhuma outra expectativa mudou.

**Resultado:**

| Verificação | Resultado |
|---|---|
| `pnpm typecheck` (shared, api, mobile) | limpo |
| `pnpm lint` (3 workspaces) | limpo |
| Suíte da API | **1164/1164** (antes: 1115) |
| Suíte do mobile | **941/941** (sem mudança no app) |
| Prompt do Pantry × commit anterior | **1.728/1.728 idênticos** |

## Lote 11 (ao vivo)

**Método (o da auditoria):**
- API local (`NODE_ENV=development`, porta 3000), banco `test` do Atlas (confirmado no log: "MongoDB conectado: test"), Gemini real (`gemini-3.5-flash-lite`, a chave de produção, no plano gratuito).
- 8 contas descartáveis novas `cpb52-<rótulo>-<run>@test.blendi.local`, com `isPro` marcado no Mongo e 4 blends recentes cada:
  - 21+, en e pt-BR;
  - menor de 21, en e pt-BR (data real de 2007);
  - sem data real, en ("Tenho 21+") e pt-BR ("Não");
  - Lite 21+ pt-BR;
  - Steel 21+ en.
- Pedidos na mesma conversa, com `DELETE /pulse-ai/cache` antes de cada um. 7 pedidos por conta:
  - "piña colada sem álcool" / "virgin piña colada";
  - o texto do protocolo "Praia e Refrescos";
  - "mistura com vodka e alguma fruta" / "vodka shake with any fruit";
  - "shake com rum" / "rum shake";
  - "caipirinha de morango" / "strawberry caipirinha";
  - "piña colada sem gelo" / "piña colada without ice";
  - "mojito".
- Nas contas sem data, os pedidos com destilado nomeado vêm antes dos drinks, para medir ao vivo o 428 decidido pelo código (sem chamada à IA).
- Decisão e flag medidas pelo log permanente novo (`alcohol request resolved`), sem log temporário.
- **Cota:**
  - pedidos espaçados ~4,5 s por chamada;
  - cada chamada real contada pelo log (inclusive novas tentativas e repetições internas do provedor);
  - orçamento de 440, uma rodada só começava se coubesse.
  - Resultado: **433 chamadas, 0 falhas por cota**. A média foi 1,9 chamada por pedido, então a 5ª repetição não cabia: **4 repetições iguais em todas as contas** (224 pedidos).
- **Falhas do provedor:**
  - 96 respostas `503 pulseai/ai-unavailable`: Gemini sobrecarregado (503 depois das novas tentativas) ou timeout de 30 s; todas com o código interno `ai/unavailable`, nenhuma `ai/quota-exceeded`;
  - 2 `500 pulseai/invalid-ai-response`.
- **Queda de rede local** na repetição 4: o Mongo perdeu o DNS (`ENOTFOUND`) e 3 pedidos da conta enminor deram 500. Foram descartados e refeitos depois da reconexão.
- **Limpeza:**
  - 8 de 8 `DELETE /users/me` com 200 (a en21 deu 500 por timeout na 1ª tentativa e 200 na 2ª);
  - no fim, 0 contas `cpb52-*` e 0 documentos recentes órfãos;
  - API parada.
- Dados: `.audit/receitas-ia-batch11-2026-11-19.json` (224 itens, sem tokens).

**Por grupo** (a coluna "decisão do código" conta os pedidos em que a decisão chegou ao log; num 503 antes da 1ª receita, ela não é registrada):

| Grupo | Marcação final | Decisão do código (`yes`/`no`) | `ai` detectado | Álcool certo | Aviso "sem álcool" certo | Ingredientes do drink | 428 | Chamadas | Cota |
|---|---|---|---|---|---|---|---|---|---|
| 21+ (en e pt-BR) | 33/34 = 97,1% | 20/20 | 14/14 | 31/32 | 32/32 | 19/19 | 0 | 106 | 0 |
| Menor de 21 | 29/30 = 96,7% | 18/18 | 12/12 | 25/25 | 24/25 | 14/14 | 0 | 111 | 0 |
| Sem data → "Tenho 21+" | 18/18 = 100% | 11/11 | 7/7 | 16/16 | 16/16 | 9/9 | 1 (certa) | 53 | 0 |
| **Sem data → "Não"** | **18/20 = 90,0%** | 11/11 | 10/10 | 16/16 | 15/16 | 11/11 | 1 (certa) | 57 | 0 |
| **Lite 21+** | **18/19 = 94,7%** | 11/11 | 8/8 | 18/19 | 19/19 | 11/11 | 0 | 53 | 0 |
| Steel 21+ | 18/18 = 100% | 10/10 | 8/8 | 18/18 | 18/18 | 9/10 | 0 | 53 | 0 |
| **Total** | **134/139 = 96,4%** | **81/81 = 100%** | 59/59 | 124/126 | 124/126 | 73/74 | 2 | 433 | 0 |

**Por pedido:**

| Pedido | Decisão esperada | Marcação final | Decisão do código certa |
|---|---|---|---|
| sem álcool / virgin | `no` | 18/18 | 18/18 |
| protocolo | `no` | 19/19 | 19/19 |
| vodka + fruta | `yes` | 22/22 | 23/23 |
| rum shake | `yes` | 21/21 | 21/21 |
| caipirinha | `ai` | 16/16 | — |
| piña colada sem gelo | `ai` | **19/22** | — |
| mojito | `ai` | **19/21** | — |

**Demais regras:**
- **Casos decididos pelo código: 100%** (81 de 81).
  - "sem álcool"/"virgin" nunca viraram pedido de álcool (18/18): sem aviso indevido e sem pergunta de idade indevida;
  - destilado nomeado sempre virou (43/43).
- **Pergunta de idade:**
  - 2 de 2 nas contas sem data, ambas no 1º pedido com vodka, decididas pelo código **antes da IA**, com 0 chamada no 428;
  - o reenvio depois da resposta gastou uma (en) e três (pt, que acabou em 503 do Gemini);
  - nenhuma pergunta indevida.
- **Álcool só para 21+ que pediu:**
  - nenhum menor ou "Não" recebeu álcool (0 em 41 receitas);
  - 21+ sem álcool: 2 casos, os dois "piña colada sem gelo" em pt-BR com a flag da IA `false` (abaixo).
- **21+ com "zero/virgin/sem álcool" no título por conta própria:** 0 (no lote 10 foram 2 de 3 na pt21).
- **Ingredientes do drink:** 73 de 74.
  - 2 novas tentativas por falta de ingrediente. Uma consertou.
  - Na outra (Steel, piña colada com manga e banana, sem abacaxi), a nova tentativa caiu num 503 do Gemini e a 1ª receita foi entregue, como desenhado.
  - Caipirinha 15/15 com limão, contra 0 de 4 na pt21 do lote 10.
- **Dose:** entre 14,4 e 19,7 g, nenhuma acima de 28 g.
- **Lite:** 19 de 19 sem gelo e sem congelado.
- **Novas tentativas** (log do servidor): drink 2, dieta/álcool 9, volume 33, macros 10.

### Abaixo de 95%: os casos

Os 5 erros de marcação são todos no caso `ai` (só o nome do drink), todos em pt-BR, todos com a IA devolvendo `false`:

| Rep. | Conta | Pedido | Efeito |
|---|---|---|---|
| 1 | Lite 21+ pt | piña colada sem gelo | 21+ recebeu "Vitamina de Abacaxi e Coco sem Gelo", sem rum |
| 3 | sem data "Não" pt | piña colada sem gelo | sem o aviso de "sem álcool" (a receita deu 503 na nova tentativa) |
| 4 | 21+ pt | piña colada sem gelo | 21+ recebeu "Piña Colada Cremosa de Abacaxi e Coco", sem rum |
| 4 | menor pt | mojito | "Smoothie Refrescante de Lima e Hortelã", sem o aviso de "sem álcool" |
| 4 | sem data "Não" pt | mojito | "Smoothie de Limão com Hortelã", sem o aviso de "sem álcool" |

- **Nenhum é de segurança:** o erro é sempre para o lado sem álcool.
- O código acertou 100% do que decidiu. O que ficou abaixo é o mesmo ponto fraco do lote 10: a IA lendo "piña colada sem gelo" (e agora "mojito") em pt-BR como smoothie.

**Opções (decisão do Gabriel; nada implementado):**
1. **Drinks da tabela de ingredientes viram `yes` pelo código** (caipirinha, caipiroska, piña colada, mojito, margarita, daiquiri). São coquetéis que, pela definição que já está no prompt, sempre contam como pedido de álcool. A IA continuaria decidindo só os ambíguos (sangria, mimosa, martini, "cocktail"…).
   - Neste lote, os 5 erros viram acerto, e os 6 grupos ficariam em 100% nos pedidos medidos.
   - Custo: quem escreve só "piña colada" querendo a versão sem álcool precisa dizer "sem álcool" ou "virgin" (o que já vira `no`).
   - Conta sem data seria perguntada já no 1º drink, antes da IA.
   - É a minha recomendação.
2. **Manter `ai` e reforçar o prompt só nesse caso**: uma linha dizendo que o app achou o nome de um coquetel que normalmente leva álcool. Continua dependendo da IA, e o lote 10 mostrou que ajustes de texto oscilam.
3. **Aceitar como está.** O erro é sempre para o lado sem álcool; o custo é 21+ ocasionalmente sem álcool e menor/"Não" ocasionalmente sem o aviso.

Qualquer opção precisa de um novo lote para medir. A cota do dia já foi usada (433 de 500, na chave de produção).

## Achados e riscos que ficam

1. **A chave de produção é a dos testes, no plano gratuito.** O lote 11 gastou 433 das 500 chamadas do dia: usuários reais teriam ficado sem IA no fim do dia. Fora do escopo deste CP (não troquei chave, modelo nem plano).
2. **Gemini instável no dia do lote:** 96 de 224 pedidos com 503 (sobrecarga/timeout, não cota), com o uso devolvido. Agora o log separa os dois casos (`ai/unavailable` × `ai/quota-exceeded`).
3. **"drink" e "batida" fora da lista de drinks** (ver Tarefa 1): sem destilado nomeado, viram `no`.
4. **Troca de destilado** ("com vodka em vez de cachaça") é `yes`: decisão minha, para confirmar.
5. **Cache de antes do CP:** a chave não mudou. Uma receita gravada antes deste CP para a mesma mensagem e a mesma faixa de idade pode ser servida até o TTL de 7 dias. Ela continua conferida (dieta, álcool, volume), mas sem a conferência de ingredientes do drink, que não roda no cache.

## Arquivos

- **API:**
  - `utils/alcoholRequest.utils.ts` (novo): detecção mista, tabela de drinks e ingredientes, mensagem de nova tentativa e linha do prompt;
  - `utils/recipeRestrictions.utils.ts`: `scanOccurrences`, `compileTermList`, `findTermMentions`, `findAlcoholMentions`;
  - `controllers/pulseAi.controller.ts`: decisão, 428 antes da IA, cache com `no`, `ensureDrinkDefiningIngredients`, log da decisão;
  - `services/promptBuilder.service.ts`: linha da decisão, reforço 21+, linha da tabela;
  - `services/aiProvider.service.ts`: `code` no erro e nos logs, `classifyAiFailure`;
  - testes: `utils/alcoholRequest.cpB52.test.ts` (novo), `services/promptBuilder.cpB52.test.ts` (novo), `controllers/pulseAi.cpB5.test.ts`, `services/aiProvider.service.test.ts`.
- **Docs:** este arquivo, `docs/api/endpoints.md`, `docs/gemini-costs.md`.
- **Mobile:** nada.
