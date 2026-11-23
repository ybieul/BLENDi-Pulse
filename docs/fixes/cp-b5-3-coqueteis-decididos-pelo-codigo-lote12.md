# CP-B5.3: coquetéis decididos pelo código, nomes ambíguos com a IA, tabela de ingredientes ampliada e lote 12

**Ponto de partida:** o CP-B5.2 ([cp-b5-2-deteccao-mista-alcool-drinks-lote11.md](cp-b5-2-deteccao-mista-alcool-drinks-lote11.md)) foi commitado no `42d0767` (a mensagem do commit saiu errada: "FASE P6 — REDE DE SEGURANÇA CONTRA TELA PRETA"). No lote 11:
- os casos que o código decidiu (`yes`/`no`) acertaram 81 de 81;
- os 5 erros foram todos no caso `ai` (só o nome do drink), em pt-BR, com a IA marcando `false`: "piña colada sem gelo" (3) e "mojito" (2).

**Decisões do Gabriel (23/11):**
- coquetel que sempre leva álcool é decidido pelo código (`yes`). A IA decide só nomes ambíguos;
- troca de destilado ("caipirinha com vodka em vez de cachaça") continua `yes`;
- em pt-BR, "drink" e "batida" podem ser alcoólicos e passam a ir para a IA (`ai`), em vez de `no`. Em inglês, "drink" continua fora ("protein drink", "drink within 30 minutes").

**Sem mudança:** idade, teto de 28 g, rede `no_alcohol`, dieta, limites de volume, gelo/congelado, receitas da Home, Pantry, formato do JSON e o prompt (fora a linha da tabela de ingredientes, gerada da mesma tabela). Nenhum log novo. App mobile sem mudança.

## Tarefa 1: três listas em `alcoholRequest.utils.ts`

A antiga `CLASSIC_ALCOHOLIC_DRINKS` virou três constantes. Todas passam pela normalização e pelas negações do validador (`compileTermList`/`findTermMentions`), sem uma segunda lógica de texto.

**a) `ALWAYS_ALCOHOLIC_COCKTAILS` → `yes`**
- Brasil: caipirinha, caipiroska (também "caipirosca" e "caipivodka"), quentão.
- Clássicos: margarita (inclusive frozen), mojito, daiquiri, piña colada ("pina colada", "pinacolada"), moscow mule, cosmopolitan, martini, espresso martini ("expresso martini"), negroni, mai tai, long island iced tea ("ice tea"), white russian, bloody mary, bellini, aperol spritz, sangria, cuba libre, mint julep, tom collins, gin fizz, sex on the beach, michelada.
- Grafias: acentos, maiúsculas, hífen/espaço ("piña-colada", "moscow-mule") e plural ("margaritas", "mai tais", "bloody marys", "piñas coladas") vêm do validador.

**Nomes de risco (palavra comum, lugar, nome de pessoa ou outra comida).** Ficam em `contextNames` e só contam como o coquetel colados a "drink", "drinque", "cocktail" ou "coquetel" (antes ou depois, com ou sem "de"), ou depois de "frozen". Sozinhos, vão para `ai`. Na dúvida, a IA decide:

| Nome | Risco |
|---|---|
| paloma | nome de pessoa |
| mimosa | planta, nome |
| manhattan | lugar |
| hurricane | furacão |
| painkiller | analgésico ("natural painkiller smoothie") |
| old fashioned | expressão ("old-fashioned milkshake") |
| spritz | biscoito em inglês |
| lemon drop | bala |
| mudslide | "mudslide smoothie" sem álcool, de chocolate |
| sidecar | sidecar de moto |
| long island (sem "iced tea") | lugar |

- Exemplos que contam: "drink de mimosa", "paloma cocktail", "coquetel manhattan", "frozen paloma".
- "frozen" só vale antes do nome: "old fashioned frozen yogurt" não conta.
- **Exceções, nunca contam** (`COCKTAIL_NAME_EXCEPTIONS`): "pizza margarita", "margarita pizza", "pizza de margarita", "old fashioned oats/oatmeal/rolled oats", "spritz cookie/biscuit".
- **"margarita" e "martini" contam sozinhos.** Num app de liquidificador, são quase sempre o drink, e "Martini" também é marca de vermute. **Risco que fica:** um nome de pessoa ("smoothie para a Margarita") dá `yes`. No pior caso, a conta sem idade recebe a pergunta de idade e a de menor recebe a versão sem álcool com aviso.

**b) `AMBIGUOUS_DRINK_NAMES` → `ai`**
- pt-BR: batida, ponche, coquetel, drinque, e "drink" **só quando o pedido está em pt-BR** (`ptBrOnly`);
- en: eggnog, punch, cocktail, irish coffee;
- exceções (comida): "fruit cocktail", "shrimp cocktail".
- **irish coffee** não estava em nenhuma das listas do prompt. Continua com a IA, como no CP-B5.2, porque também é sabor de café/creamer. Se quiser, passa para a lista (a).
- **Efeito conhecido:** "batida" como particípio ("vitamina bem batida") também vai para a IA. Nunca dá `yes`.

**c) `ALCOHOL_FREE_FAMOUS_DRINKS` → `no`, sem outro sinal de álcool**
- shirley temple, arnold palmer, roy rogers, virgin mary (já era `no` pelo "virgin") e limonada suíça.
- Vencem os nomes ambíguos: "drink shirley temple" dá `no`.
- Perdem para outro sinal: "shirley temple com vodka" dá `yes`.

**Ordem da decisão** (só a mensagem atual):

| # | A mensagem tem | Resultado |
|---|---|---|
| 1 | pedido da versão sem álcool, ou termo genérico de álcool negado | `no` (vence tudo) |
| 2 | bebida alcoólica da lista do CP-B5 sem negação (inclusive troca de destilado) | `yes` |
| 3 | pedido genérico ("boozy", "spiked", "batizado") | `yes` |
| 4 | só bebida negada ("caipirinha sem cachaça", "mojito without rum") | `no` |
| 5 | **coquetel da lista (a)** sem negação | **`yes`** (novo) |
| 6 | **drink famoso sem álcool** | **`no`** (novo) |
| 7 | **nome ambíguo**, ou nome de risco sem contexto | `ai` |
| 8 | nada disso | `no` |

- **A posição do coquetel não é exatamente a linha 2 pedida.** O coquetel fica logo depois da linha 4. Na linha 2, "caipirinha sem cachaça" e "mojito without rum" virariam `yes`, mas desde o CP-B5.2 isso é pedido da versão sem álcool. Para todo o resto, o resultado é o mesmo da linha 2.
- **Com idade desconhecida, o `yes` de coquetel dá `428` antes da IA**, como no destilado nomeado. Não há chamada nem uso reservado.

**Idioma.** `detectAlcoholRequest(message, language)` agora recebe o idioma do pedido (`language` da requisição, senão o locale da conta). O controller só calcula esse idioma uma linha antes. O idioma muda duas coisas:
- "drink" só é ambíguo em pt-BR;
- o "no" puro antes do nome do coquetel nega só em inglês ("no mojito, just a banana smoothie" dá `no`). Em pt-BR é contração ("mais hortelã no mojito" dá `yes`).
- Sem idioma informado, a função se comporta como em pt-BR.

## Tarefa 2: ingredientes que definem o drink

`DRINK_DEFINING_INGREDIENTS` foi ampliada só com ingredientes simples e inequívocos, com sinônimos en/pt-BR. Os 4 de antes (lime, pineapple, coconut, mint) não mudaram.

| Ingrediente | Sinônimos |
|---|---|
| lemon | lemon, lemon juice, lime / limão, limão siciliano, lima, suco de limão |
| ginger | ginger ("ginger beer" e "ginger ale" contam) / gengibre |
| cranberry | cranberry / oxicoco |
| grapefruit | grapefruit / toranja |
| tomato | tomato / tomate |
| coffee | coffee, espresso, cold brew / café, expresso ("licor de café" e "coffee liqueur" contam) |
| milk (label "milk or cream") | milk, cream, half and half / leite, creme, creme de leite, nata |
| orange | orange / laranja |
| peach | peach / pêssego |

| Drink | Ingredientes |
|---|---|
| caipirinha, caipiroska, margarita, daiquiri, mai tai | lime |
| piña colada | pineapple e coconut |
| mojito | mint e lime |
| quentão | ginger |
| moscow mule | lime e ginger |
| cosmopolitan | cranberry e lime |
| paloma | grapefruit |
| mint julep | mint |
| tom collins, lemon drop | lemon |
| bloody mary | tomato |
| white russian, mudslide | coffee e milk or cream |
| espresso martini | coffee |
| mimosa | orange |
| bellini | peach |

- **Sangria ficou fora:** "fruta (qualquer)" não cabe numa lista simples de sinônimos.
- **Regras de antes, iguais:**
  - só nova tentativa, nunca bloqueia;
  - ingrediente negado na mensagem ("moscow mule sem gengibre") não é cobrado;
  - versão sem álcool também é cobrada ("virgin moscow mule" precisa de gengibre);
  - coquetel negado não é cobrado.
- **Nome de risco só é cobrado quando contou:** "drink de mimosa" cobra laranja; "mimosa" sozinha não cobra nada.
- **A linha do prompt continua gerada da mesma tabela,** com os 6 drinks do CP-B5.2 primeiro e na mesma ordem.

## Tarefa 3: testes

- **`utils/alcoholRequest.cpB53.test.ts` (novo, 30 testes):**
  - cada coquetel seguro dá `yes` em pt-BR e en, sozinho, com sabor e com "sem gelo"/"without ice";
  - cada nome de risco dá `yes` com contexto e `ai` sozinho;
  - grafias e plurais;
  - versão sem álcool vence: "virgin mojito", "mojito sem álcool", "piña colada sem álcool", "mocktail de moscow mule" dão `no`;
  - ambíguos dão `ai` ("drink de morango", "batida de coco", "eggnog", "ponche de frutas");
  - com destilado dão `yes` ("drink de morango com vodka", "batida de coco com cachaça");
  - drinks famosos sem álcool dão `no`;
  - falsos positivos não dão `yes`:
    - `ai`: "smoothie para levar a Manhattan", "smoothie pós-treino da Paloma", "a natural painkiller smoothie", "hurricane season smoothie", "old-fashioned milkshake", "mudslide smoothie";
    - `no`: "shake de pizza margarita", "old fashioned oats smoothie", "spritz cookies shake", "protein drink", "drink within 30 minutes", "fruit cocktail smoothie";
  - protocolo "Praia e Refrescos" continua `no`;
  - tabela completa de ingredientes, cobrança de cada drink, sinônimos, ingrediente negado e linha do prompt.
- **`controllers/pulseAi.cpB5.test.ts`, +3 testes:**
  - "piña colada sem gelo" com idade desconhecida dá `428` antes da IA (0 chamada, 0 uso);
  - "mojito" para 21+ libera álcool mesmo com a flag `false` da IA;
  - para menor, a versão sem álcool sai com aviso.

**Expectativas alteradas (por decisão, não por regressão):**

| Arquivo | Antes | Agora | Por quê |
|---|---|---|---|
| `alcoholRequest.cpB52.test.ts`, bloco "só o nome do drink" (10 mensagens) | `ai` | `yes` | coquetel decidido pelo código |
| `alcoholRequest.cpB52.test.ts`, teste da tabela | tabela inteira | só os 6 primeiros | a tabela completa está no teste novo |
| `pulseAi.cpB5.test.ts`: "sem data real e sem resposta" e os dois testes "`ai` segue a flag da IA" | "piña colada sem gelo" | "batida de coco" | a piña colada virou `yes`; o fluxo depois da IA continua testado com um nome ambíguo |

**Resultados:**

| Checagem | Resultado |
|---|---|
| Typecheck (shared, api, mobile) | limpo |
| Lint (shared, api, mobile) | limpo |
| Suíte da API | **1197/1197** |
| Suíte do mobile | **941/941** (sem mudança no app) |

## Lote 12 (ao vivo)

**Método (o da auditoria):**
- API local (`NODE_ENV=development`, porta 3000), banco `test` do Atlas (confirmado no log: "MongoDB conectado: test"), Gemini real (`gemini-3.5-flash-lite`, a chave de produção, no plano gratuito).
- 4 contas descartáveis `cpb53-<rótulo>-<run>@test.blendi.local`, com `isPro` marcado no Mongo e 4 blends recentes cada: 21+ pt-BR, 21+ en, menor pt-BR (data real de 2007) e Lite 21+ pt-BR.
- 1 vez cada pedido, com `DELETE /pulse-ai/cache` antes:
  - pt-BR: "piña colada sem gelo", "mojito", "caipirinha de morango", "drink de morango com vodka", "batida de coco";
  - en: "moscow mule", "strawberry margarita", "espresso martini", "mai tai", "shirley temple".
- **Cota:**
  - teto de 90 chamadas, com o roteiro parando antes de um pedido a partir de 82;
  - cada chamada real contada pelo log (inclusive as repetições internas do provedor);
  - espaçamento de 4,5 s na 1ª rodada e 6 s nas refeitas.
- **Gemini sobrecarregado:**
  - 1ª rodada: 11 de 20 pedidos com `503 pulseai/ai-unavailable` (30 repetições internas por `503` e 1 `429` de limite por minuto; nenhuma cota diária);
  - os pedidos com 503 foram refeitos 2 vezes, com 2 a 2,5 min de pausa;
  - **Resultado: 82 chamadas, 16 de 20 pedidos concluídos.** Os 4 restantes (mai tai e shirley temple na en 21+, caipirinha no menor, drink com vodka no Lite) caíram em 503 até o teto.
- **Limpeza:**
  - 4 de 4 `DELETE /users/me` com 200;
  - 0 contas `cpb53-*` no Mongo;
  - API parada.

**Resultado por pedido:**

| Conta | Pedido | Decisão do código × esperado | Flag da IA | Álcool entregue × esperado | Aviso "sem álcool" | Ingredientes do drink | Chamadas |
|---|---|---|---|---|---|---|---|
| pt 21+ | piña colada sem gelo | yes ✓ | true | 16 g ✓ | — | abacaxi, leite de coco ✓ | 2 |
| pt 21+ | mojito | yes ✓ | true | 15,8 g ✓ | — | hortelã, limão ✓ | 1 |
| pt 21+ | caipirinha de morango | yes ✓ | true | 16,5 g ✓ | — | limão ✓ | 3 |
| pt 21+ | drink de morango com vodka | yes ✓ | true | 16 g ✓ | — | — | 1 |
| pt 21+ | batida de coco | ai ✓ | true | 15,8 g (decisão da IA) | — | — | 2 |
| en 21+ | moscow mule | yes ✓ | true | 16 g ✓ | — | lime, ginger beer ✓ | 1 |
| en 21+ | strawberry margarita | yes ✓ | true | 22,3 g ✓ | — | lime ✓ | 3 |
| en 21+ | espresso martini | yes ✓ | true | 24,8 g ✓ | — | espresso ✓ | 3 |
| en 21+ | mai tai | yes (pelos testes) | — | 503 | — | — | — |
| en 21+ | shirley temple | no (pelos testes) | — | 503 | — | — | — |
| menor pt | piña colada sem gelo | yes ✓ | true | sem álcool ✓ | sim ✓ | abacaxi, leite de coco ✓ | 3 |
| menor pt | mojito | yes ✓ | true | sem álcool ✓ | sim ✓ | hortelã, limão ✓ | 1 |
| menor pt | caipirinha de morango | yes (pelos testes) | — | 503 | — | — | — |
| menor pt | drink de morango com vodka | yes ✓ | true | sem álcool ✓ | sim ✓ | — | 3 |
| menor pt | batida de coco | ai ✓ | false | sem álcool ✓ | não (a IA disse false) | — | 1 |
| Lite pt 21+ | piña colada sem gelo | yes ✓ | true | 16 g ✓ | — | abacaxi, leite de coco ✓ | 1 |
| Lite pt 21+ | mojito | yes ✓ | true | 16 g ✓ | — | hortelã, limão ✓ | 2 |
| Lite pt 21+ | caipirinha de morango | yes ✓ | true | 15,8 g ✓ | — | limão ✓ | 2 |
| Lite pt 21+ | drink de morango com vodka | yes (pelos testes) | — | 503 | — | — | — |
| Lite pt 21+ | batida de coco | ai ✓ | false | sem álcool (decisão da IA) | — | — | 3 |

**Resumo:**
- **Decisão do código: 16 de 16 certas** (13 `yes`, 3 `ai`). Os 4 pedidos com 503 também têm a decisão esperada pelo código, conferida nos testes, mas não tiveram receita ao vivo.
- **Álcool:** todo 21+ que pediu coquetel ou destilado recebeu álcool (10 de 10, entre 15,8 e 24,8 g, nenhuma acima de 28 g). O menor não recebeu álcool (0 de 4).
- **Aviso "sem álcool" no menor:** 3 de 3 nos `yes`. Na "batida de coco" (`ai`), a IA marcou `false`, então não houve aviso, como desenhado.
- **"batida de coco" para 21+:** a IA marcou `true` na pt 21+ (cachaça) e `false` no Lite (sem álcool). Para nome ambíguo, é a IA que decide.
- **Ingredientes do drink:** 11 de 11 completos de primeira. Nenhuma nova tentativa por falta de ingrediente.
- **Lite:** 4 de 4 sem gelo e sem congelado pelo validador ("água com gás bem gelada" é bebida gelada, não gelo).
- **Novas tentativas** (log do servidor): macros 3, drink 0.
- Os 5 erros do lote 11 ("piña colada sem gelo" e "mojito" em pt-BR, com a IA marcando `false`) não se repetem: agora o código decide `yes` e a flag da IA é ignorada.

## Achados e riscos que ficam

1. **"ginger beer" e "root beer" contavam como álcool: corrigido no CP-B5.3a** (abaixo). A tabela de ingredientes aceitava "ginger beer" como o gengibre do moscow mule, mas a rede `no_alcohol` barrava o mesmo ingrediente (token "beer"). O moscow mule de um menor ou um "virgin moscow mule" podia ser refeito e terminar em `422`.
2. **Chave de produção no plano gratuito:** com o Gemini sobrecarregado, cerca de metade das 82 chamadas do lote foi gasta em `503`; um pedido que falha custa ~3 chamadas.
3. **"margarita" como nome de pessoa** dá `yes` (ver Tarefa 1).
4. **"irish coffee"** continua com a IA (ver Tarefa 1); para confirmar.
5. **Cache de antes do CP:** a chave não mudou. Uma receita gravada antes para a mesma mensagem e faixa de idade pode ser servida até o TTL de 7 dias, ainda conferida (dieta, álcool, volume), mas sem a conferência de ingredientes do drink.

## CP-B5.3a: refrigerantes com "beer" no nome (antes do commit)

**Achado:**
- `findAlcoholMentions("120 ml ginger beer")` e `("100 ml root beer")` davam `beer`;
- `detectAlcoholRequest("shake de root beer", "pt-BR")` dava `yes`.

**Correção:** "ginger beer", "root beer", "birch beer" e "cerveja de gengibre" entraram nos falsos amigos da lista de bebidas alcoólicas (`ALCOHOL_RULES.exceptions` em `recipeRestrictions.utils.ts`), junto de "cerveja sem álcool", "essência de rum" e "vinagre de vinho".
- **Uma lista só, dois usos:** a mesma exceção vale para a rede `no_alcohol`/`alcohol_limit` da receita e para `detectAlcoholRequest` na mensagem.
- **Plurais e hífen** vêm da normalização que já existia ("Ginger-Beers").
- **"ginger ale"** já não contava (o token é "ale"). Agora há teste.
- **"beer", "cerveja" e "craft beer" sozinhos continuam álcool.** "ginger beer com vodka" continua `yes` pela vodka.
- **Decisão minha: "cerveja de gengibre" também é exceção.** É a tradução literal de ginger beer, o refrigerante, e ficaria incoerente tratá-la diferente da forma em inglês. Uma ginger beer alcoólica existe nas duas línguas, e a pessoa pode pedir o destilado ou "com álcool" (dá `yes`).
- **Nada mais mudou:** lista de bebidas, idade, tabela de drinks e prompt continuam iguais.

**Testes** (nenhuma expectativa existente mudou):
- `utils/alcoholRequest.cpB53.test.ts`, +4:
  - `findAlcoholMentions` vazio para ginger/root/birch beer, "cerveja de gengibre" e "ginger ale"; álcool para "beer", "cerveja" e "craft beer";
  - `detectAlcoholRequest`: `no` para "shake de root beer", "root beer float shake", "shake de cerveja de gengibre" e "ginger beer smoothie"; `yes` para "moscow mule", "ginger beer com vodka", "ginger beer with rum", "shake de cerveja" e "beer shake";
  - validador com álcool proibido: receita com "Ginger beer" ou "root beer" passa; receita com "Cerveja" continua barrada.
- `controllers/pulseAi.cpB5.test.ts`, +1: o menor pede "moscow mule" e a receita com limão + ginger beer sai de primeira, com aviso de "sem álcool" e 1 chamada à IA. **Sem a correção, este teste falha** (conferi removendo a exceção).

**Resultados:**
- typecheck nos 3 workspaces: limpo;
- lint: limpo;
- suíte da API: **1202/1202**.

Sem lote ao vivo.

## Arquivos

- **API:**
  - `utils/alcoholRequest.utils.ts`: `ALWAYS_ALCOHOLIC_COCKTAILS`, `AMBIGUOUS_DRINK_NAMES`, `ALCOHOL_FREE_FAMOUS_DRINKS`, exceções e contexto dos nomes de risco, tabela de ingredientes ampliada, `detectAlcoholRequest(message, language)`, `findMissingDrinkIngredients(message, ingredients, language)`;
  - `controllers/pulseAi.controller.ts`: idioma calculado antes da detecção e repassado à conferência de ingredientes;
  - `utils/recipeRestrictions.utils.ts` (CP-B5.3a): ginger/root/birch beer e "cerveja de gengibre" como exceção da lista de bebidas alcoólicas;
  - testes: `utils/alcoholRequest.cpB53.test.ts` (novo), `utils/alcoholRequest.cpB52.test.ts`, `controllers/pulseAi.cpB5.test.ts`.
- **Docs:** este arquivo, `docs/api/endpoints.md`, `docs/gemini-costs.md`, nota de atualização no `cp-b5-2-deteccao-mista-alcool-drinks-lote11.md`.
- **Mobile:** nada.
