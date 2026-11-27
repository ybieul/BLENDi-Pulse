# CP-B7 + B7a: Pantry Scanner em duas etapas (ler → confirmar → gerar) e lote 13

**Ponto de partida:** até aqui, `POST /pantry-scanner/analyze` fazia tudo numa chamada só: lia a foto, contava o scan e gerava as receitas. Na tela de confirmação, desmarcar ou adicionar um ingrediente não mudava nada, porque as receitas já tinham vindo.

**Nome nos comentários do código:** o trabalho foi feito com o rótulo provisório "CP-B5.4"; desde o CP-B7b os comentários e os nomes dos testes usam "CP-B7" (só o arquivo `pantryScanner.cpB54.test.ts` manteve o nome; no CP-L1 ele virou `pantryScanner.twoStep.test.ts`). O CP-B7a é a correção feita antes do commit (bebidas na leitura e item adicionado em qualquer idioma).

**Decisões do Gabriel (23/11):**
- duas etapas: ler a foto (não conta scan) e gerar (conta);
- desmarcado nunca entra; marcado = disponível; adicionado à mão = pedido explícito, obrigatório em todas as receitas, fura a dieta com aviso; se não couber no copo, a receita mais próxima com `capacityNotice`;
- sem líquido na foto, a tela pergunta com botões; campo opcional "Algum pedido?" com as regras do Pulse AI;
- álcool: bebida lida da foto vem desmarcada e com rótulo; só 21+ marca; menor/"Não" vê o item desativado; sem idade, marcar abre a mesma pergunta de idade do Pulse AI;
- limite de leituras: free ligado aos scans; Pro sem limite diário prático, só proteção contra robô;
- (durante o trabalho) cada leitura gera uma vez só e a geração devolve um readId novo com o mesmo vencimento; o free tem um teto fixo de 12 leituras por ciclo;
- (CP-B7a) a leitura da foto passa a listar bebidas; item adicionado em outro idioma vai entre parênteses e, se ainda faltar, aparece um aviso no card.

**Sem mudança:** regras do Pulse AI, limites de volume, leitor de volume, gelo/congelado, receitas da Home, chave, provedor e modelo da IA. Nenhuma imagem guardada; os logs novos têm só contagens e enums.

## O fluxo novo

```text
foto → POST /pantry-scanner/read ("Lendo a foto...")      não conta scan; conta leitura
     → confirmação (marcar, adicionar, líquido, pedido)
     → POST /pantry-scanner/generate ("Gerando receitas...")   conta o scan (ou a prévia do free)
     → receitas → "Editar ingredientes" → generate de novo (novo scan, sem nova foto)
```

`GET /pantry-scanner/previews/:id` não mudou. `POST /pantry-scanner/analyze` saiu: nada mais no app nem na API chama essa rota.

## Tarefa 1: `POST /pantry-scanner/read`

- Mesma validação da imagem de antes (schema, magic bytes, tamanho). A rota usa o parser de 4 MB no lugar do `/analyze`.
- Faz só a visão (`callVisionAi` + `parsePantryVisionAnalysis`). Não conta scan, não gera receita, não dá XP.
- Guarda em `pantry_reads` (modelo `PantryRead`): `userId`, `ingredients` (`name`, `estimatedQuantity`, `confidence`, `isAlcoholic`), `hasLiquid`, `consumedAt`, `expiresAt`. O índice TTL apaga no vencimento (`PANTRY_READ_TTL_MS` = 30 min). Não existe campo para a imagem (teste do schema).
- Resposta: `readId`, `readExpiresAt`, `ingredients`, `hasLiquid`, `noFoodDetected`, `noUsableIngredients?`, `analysisNotes?`, `alcoholAge` (`of-age`/`under-age`/`unknown`), `nextGenerationIsPreview`, `scansUsed`, `scansLimit`, `resetDate`. Sem comida ou sem ingrediente usável: `200` como hoje, sem `readId`.
- `isAlcoholic` vem do código (`findAlcoholMentions`, a lista do validador), nunca da IA. Falsos amigos: ginger beer, root beer, "cerveja sem álcool", "cerveja 0,0", essência de rum e vinagre de vinho não são álcool.
- `hasLiquid` também vem do código (`pantryRequest.utils.ts`), com uma lista curta de bases de blend e a mesma normalização do validador: água, leite e leites vegetais, suco, kefir, "bebida" (vegetal), água de coco. **Não contam:** iogurte, leite condensado/em pó, chocolate ao leite, doce de leite, destilados e (CP-B7a) bebidas com gás: água tônica, refrigerante, ginger beer, cerveja sem álcool. Motivo: não são base de blend; com uma foto só dessas bebidas, a tela pergunta qual líquido a pessoa tem.

**Limites de leitura** (constantes únicas em `packages/shared/src/schemas/pantryScanner.ts`; reserva atômica no filtro do `findOneAndUpdate`, antes da visão):

| Plano | Regra | Resposta |
|---|---|---|
| Free | teto fixo de `(3 scans + 1 prévia) × PANTRY_READS_PER_SCAN (3)` = 12 por ciclo (`pantryReadCount`, zera em `resetScanCycleIfNeeded`), e nenhuma leitura sem scan nem prévia restante | `429 scanner/read-limit-reached` + `resetDate` |
| Pro | no máximo 10 em 10 min (`pantryReadRecent`, últimos 10 horários) | `429 scanner/read-rate-limited` ("Aguarde um momento") |
| Pro | teto de segurança de 100 por dia, no fuso da conta (`pantryReadDayCount`) | `429 scanner/read-daily-limit` |

A conta "(scans restantes + prévia restante) × 3", refeita a cada leitura, bloquearia quem ainda tem scan (6 leituras e 2 gerações deixam 1 scan + prévia → limite 6, já usado). Por isso o Gabriel decidiu pelo teto fixo. Falha do provedor devolve a leitura; leitura sem comida conta (a chamada foi paga).

## Tarefa 2: `POST /pantry-scanner/generate`

**Corpo** (schema estrito, `pantryGenerateSchema`): `readId`; `selected` (só nomes da leitura); `added` (≤ 10 itens de ≤ 40 caracteres); `liquid?` (`water`/`milk`/`plant_milk`/`none`); `request?` (≤ 500, o limite do Pulse AI). Pelo menos um item em `selected` ou `added`.

**Leitura:** dono, validade e "ainda não usada" estão no filtro. Para qualquer falha (outro usuário, vencida, já usada, id inválido), a resposta é a mesma `410 scanner/read-expired`. A leitura é consumida de forma atômica antes do scan. Na entrega, a resposta traz um `readId` novo, com os mesmos ingredientes e o mesmo vencimento. Em qualquer saída sem receita, a leitura volta e o mesmo id continua valendo.

**Scan:** as regras de hoje — incremento/limite atômicos, devolução em falha, XP e missão só na entrega, prévia bloqueada do free (`runPantryPreviewScan` agora nesta etapa, mostrando ingredientes marcados + adicionados e só os macros).

**Prompt** (`buildPantryRecipePrompt`; sem escolhas, o texto é idêntico ao de antes):
- *Available ingredients* = só os marcados. O desmarcado nem vai ao prompt.
- `added` e `request` vão na mensagem do usuário, como JSON ("dado digitado pela pessoa"). A seção "User choices" no system prompt traz as regras do pedido explícito do Pulse AI: limites físicos > pedido > dieta > metas e variedade; adicionados em todas as receitas; quantidades, sabores, kcal e macros; receita mais próxima + `capacityNotice` quando não cabe. A dieta ganha a exceção do item pedido.
- CP-B7a: quando o nome na receita é diferente do digitado (outro idioma ou outro nome), a IA põe o nome digitado entre parênteses, por exemplo "Pasta de amendoim (peanut butter)".
- Líquido: `water` ou sem escolha = o texto de antes (água sempre disponível). `milk`/`plant_milk` entram na lista como disponíveis e a água sai. `none` = sem nenhum líquido, receita cremosa.

**Conferências por receita** (na ordem):
1. **Escolhas da pessoa** (nova): cada adicionado aparece num ingrediente (mesma normalização do validador, singular/plural; o nome digitado entre parênteses conta), nenhum desmarcado entra, sem água com "Sem líquido". Qualquer falha gera uma nova tentativa pelo caminho de sempre. Se depois dela ainda houver desmarcado, a receita cai; se todas caírem, `422 scanner/selection-unmet`.
2. Volume, com `keepExplicitRequest` quando há adicionados ou pedido.
3. Macros.
4. Dieta/gelo/álcool com `explicitRequest` = adicionados + pedido, o que gera `dietOverrideIngredients`.
5. Volume de novo e as escolhas de novo. **CP-B7a:** item adicionado que ainda falta não bloqueia: a receita sai com `missingRequestedIngredients` (campo novo, só o backend preenche, o valor da IA é descartado). O card mostra "Não conseguimos incluir: X" / "We couldn't include: X" (é o mesmo `RecipeCard` do Pulse AI). Antes do CP-B7a, a receita saía em silêncio.
6. Passos; `usesWaterNotInPhoto` só quando a pessoa não escolheu o líquido (ou escolheu "Sem líquido" e a água ficou). Com líquido escolhido, o campo sai.

**Álcool (só na geração):**
- Decisão = `detectAlcoholRequest(request)` = `yes` **ou** item alcoólico marcado/adicionado. Pedido só com nome de drink ambíguo (`ai`) conta como sem álcool, porque o Pantry não tem o campo da IA.
- Sem idade e com álcool: `428 scanner/age-confirmation-required` **antes** de contar scan e de chamar a IA. O app abre a mesma folha do Pulse AI, chama `POST /pulse-ai/age-confirmation` e reenvia.
- Menor ou "Não" com item alcoólico marcado: `403 scanner/alcohol-not-allowed` (o app já desativa o item). Álcool só adicionado ou pedido: receita sem álcool com `alcoholFreeVersion`.
- 21+: dose normal, teto de 28 g e `alcoholGrams` a 7 kcal/g. Garrafa marcada = pelo menos uma receita; adicionado ou pedido = todas.
- A rede `no_alcohol`/`alcohol_limit` passa a valer no Pantry.

**Reaproveitamento sem segunda lógica:** `withRequestNotices` (avisos do card) foi para `utils/recipeNotices.utils.ts` e `resolveAlcoholAge` para `utils/alcoholAge.utils.ts`, usados pelos dois controllers. O controller do Pulse AI reexporta `resolveAlcoholAge`; o comportamento é o mesmo.

**Teto de tempo:** `pantryScannerRead` 30 s (app 45 s) e `pantryScannerGenerate` 85 s (app 100 s), no lugar de `pantryScannerAnalyze`.

## Tarefa 3: app (`PantryScannerScreen`)

- Etapas `reading` e `generating` com "Lendo a foto..." / "Gerando receitas...".
- Confirmação:
  - marcar e desmarcar; adicionar à mão (campo + botão "Adicionar"; aparece "Você adicionou" com botão de remover). Se o nome digitado já for um item da leitura, só marca;
  - item alcoólico com rótulo "Bebida alcoólica", desmarcado por padrão; desativado para menor/"Não"; sem idade, marcar abre a `AgeConfirmationSheet`;
  - sem líquido na foto: "Qual líquido você tem?" com Água / Leite / Bebida vegetal / Sem líquido (receita cremosa), obrigatório antes de gerar;
  - "Algum pedido?" com exemplo no placeholder;
  - abaixo do botão: "Usa 1 dos seus N scans restantes" (free), o aviso da prévia ou nada (Pro).
- Receitas: "Editar ingredientes" volta à confirmação com o aviso "Gerar de novo conta um novo scan. Não precisa tirar outra foto." Leitura vencida (no aparelho ou `410`): aviso e volta para a câmera.
- Mensagens próprias para os limites de leitura (free sem leituras + Upgrade; Pro "Aguarde um momento"; teto diário).
- Card: os avisos de dieta, de sem álcool, a pílula de álcool junto dos macros e (CP-B7a) "Não conseguimos incluir: X" vêm do `RecipeCard`.
- Textos em `en.json` e `pt-BR.json`, chaves válidas pelo `t()` estrito, sem cast; rótulos e estados de acessibilidade (checkbox, radio, desativado).

## CP-B7a: bebidas na leitura da foto

No lote 13 (2ª rodada), as fotos 3 e 4 não trouxeram rum, cachaça, cerveja, ginger beer nem a cerveja 0,0. O prompt de visão pedia só ingredientes de blend e citava como bebidas apenas "juices and sports drinks". A regra "bebida alcoólica lida da foto aparece desmarcada e com rótulo" nunca acontecia.

O prompt de visão ganhou três linhas na lista do que incluir:
- `alcoholic beverages (spirits, wine, beer, liqueur), including closed bottles and cans`;
- `mixers and other drinks (ginger beer, tonic water, soda, non-alcoholic beer)`;
- `for drinks, use the name on the label when it is readable`.

O resto do prompt não mudou, e o formato do JSON continua o mesmo: a visão não decide o que é álcool.

## Testes

API: 1242 (eram 1202 antes do CP-B7). Mobile: 961 (eram 958). Typecheck nos 3 workspaces e lint limpos.

**Novos:**
- `pantryScanner.twoStep.test.ts` (33):
  - leitura: não conta scan, guarda sem imagem, TTL, `isAlcoholic` pela lista, limites free (12, sem scan nem prévia, ciclo novo) e Pro (10/10 min, janela, 100/dia, dia novo, devolução em falha);
  - geração: readId de outro usuário/vencido/consumido, `selected` fora da leitura, scan contado e devolvido, readId novo, prévia do free, desmarcado nunca entra (nova tentativa e descarte), adicionado em todas, adicionado fora da dieta com aviso, pedido com macro, `liquid` none/water/milk, volume com `capacityNotice`;
  - álcool: 21+ com garrafa e `alcoholGrams`, teto de 28 g, menor `403`, "Não" + pedido → sem álcool com aviso, sem idade `428` sem scan nem IA, rede `no_alcohol`;
  - CP-B7a: "peanut butter" numa conta pt-BR com parênteses passa sem nova tentativa; en; sem o item → nova tentativa → aviso; valor da IA descartado.
- `PantryRead.test.ts` (2): índice TTL e schema sem imagem.
- `pantryRequest.utils.test.ts` (5): lista de álcool com falsos amigos (inclusive 0,0, água tônica, refrigerante), líquido, conferência por palavras, desmarcado × permitido, linhas novas do prompt de visão.
- Mobile: `PantryScannerScreen.test.tsx` reescrito (23 casos: fluxo completo, desmarcar/adicionar no pedido, líquido obrigatório, álcool desativado para menor, folha de idade ao marcar e no `428`, aviso de scan, voltar e gerar de novo, leitura vencida, limites de leitura) e `RecipeCard.missingRequest.test.tsx` (3).

**Expectativas alteradas (testes que já existiam):**
- `pantryScanner.controller.test.ts`, `pantryScanner.blenderLimits.test.ts`, `pantryScanner.reliability.test.ts` e `pantryScannerPreview.controller.test.ts` passam pelo helper `pantryScannerTestFakes.ts` (leitura + geração com tudo marcado, o equivalente ao antigo `/analyze`).
- "geração vazia": a resposta traz também `readId` e `readExpiresAt`.
- Prévia: "5º scan" agora para na leitura com `scanner/read-limit-reached` (era `scanner/monthly-limit-reached`). O reset do ciclo zera também `pantryReadCount`. Na corrida, a visão é chamada 2 vezes (as duas leituras); a trava da prévia ficou na geração e continua saindo 1 prévia e 1 erro 429.
- Mobile:
  - "dieta não atendida" deixa a pessoa na confirmação (antes voltava para a câmera);
  - no teste da prévia bloqueada, o "5º scan" virou o limite de leitura;
  - os testes de serviço chamam `generatePantryRecipes`;
  - o teste de timeout tem leitura e geração separadas.
- CP-B7a: "adicionado = obrigatório" e "adicionado que persiste ausente" agora conferem `missingRequestedIngredients` (antes a receita saía sem aviso).

## Lote 13 (ao vivo)

Método da auditoria:
- API local (`NODE_ENV=development`) ligada ao Atlas, banco `test`, com o Gemini real (`gemini-3.5-flash-lite`, a mesma chave de produção no plano gratuito);
- contas descartáveis `cpb54-*`/`cpb7-*@test.blendi.local`, apagadas no fim;
- fotos `Claude-outputs/geladeira1..4.jpeg`;
- intervalo de ~4,5 s entre chamadas; as chamadas ao Gemini foram contadas por um script de pré-carga fora do repositório, que só conta as requisições e corta no teto (sem conteúdo).

| Rodada | Chamadas | Resultado |
|---|---:|---|
| 1ª | 21 | Muitos `503 high demand`; parou na leitura da foto 3 |
| 2ª | 36 | Idem; revelou o problema das bebidas na leitura (CP-B7a) |
| 3ª (depois do CP-B7a) | 8 | 3 gerações com 503 seguidas → parada automática |
| 4ª (logo depois) | 8 | Leitura da geladeira 1 ok; 1ª geração estourou os 30 s da chamada e as seguintes voltaram `503 high demand` → parada automática |
| 5ª | 19 | Geladeira 1 completa (desmarcar, 2 adicionados, "30 g de proteína") e as garrafas na leitura; a geração 21+ com rum voltou 503 |
| 6ª (só C e D) | 11 | Garrafas, cerveja 0,0, `428` e `403` confirmados; a geração 21+ com rum voltou 503 duas vezes |
| 7ª (só 21+ com rum) | 6 | A leitura voltou 503 duas vezes → parada |
| 8ª (só 21+ com rum) | 7 | Leitura ok (garrafas de novo corretas); a geração voltou 503 e, na nova tentativa, estourou os 30 s da chamada |
| 9ª (só 21+ com rum) | 4 | Leitura ok (2 chamadas, garrafas corretas de novo); a geração recebeu `503 high demand` nas 2 chamadas seguintes e as próximas foram cortadas pelo teto antes de sair |
| 10ª (24/11, só 21+ com rum, +10 chamadas liberadas pelo Gabriel) | 3 | Leitura ok; a geração recebeu um 503 e passou na nova tentativa do provedor |
| **Total** | **123** (120 do teto + 3 das 10 extras) | |

**Confirmado ao vivo:**

| Caso | Enviado | Recebido |
|---|---|---|
| Leitura da geladeira 1 | foto | 8 itens (banana, morango, iogurte grego, leite de amêndoas, leite integral, espinafre, limão, kiwi), `hasLiquid: true`. Não contou scan |
| Leitura da geladeira 2 | foto sem líquido | 8 itens, `hasLiquid: false` |
| "Sem líquido" (vegana, Pro) | 8 marcados, `liquid: none` | 2 receitas cremosas, sem água (manga + abacate + banana + chia; banana + pasta de amendoim + cacau + aveia + tâmaras). 1 scan contado, readId novo |
| Vegana adicionando whey | `added: ["whey"]`, `liquid: water` | Whey nas 2 receitas ("Whey — 30 g"), `dietOverrideIngredients: ["Whey"]` nas duas, sem marca de água fora da foto. 1 scan |
| 503 na geração | — | Scan devolvido (`scanCount` 0) e o mesmo readId gerou depois. Leitura com 503 não foi contada |
| Leitura guardada | — | Campos `_id`, `userId`, `ingredients`, `hasLiquid`, `consumedAt`, `expiresAt`, `createdAt`, `__v`; sem imagem |
| Leituras das geladeiras 3 e 4 **antes do CP-B7a** | — | Nenhuma bebida listada (motivo do CP-B7a) |
| A1 desmarcar um item (grátis, pt-BR) | 8 marcados, "Leite integral" desmarcado | 2 receitas (banana + iogurte grego + leite de amêndoas; kiwi + espinafre + limão + leite de amêndoas). **Leite integral ausente nas duas.** 1 scan (1/3), readId novo. 1 chamada |
| A2 adicionar 2 itens (um em inglês) | `added: ["peanut butter", "canela"]` | Os dois nas 2 receitas: "**Pasta de amendoim (peanut butter)** — 30 g / 25 g" e "Canela — 3 g / 2 g". Sem nova tentativa de escolha, sem aviso de item faltando. A 2ª receita usou água (`usesWaterNotInPhoto`, sem líquido escolhido, como antes). 2 scans. 5 chamadas (2 delas 503 do provedor) |
| A3 "com 30 g de proteína" | pedido, tudo marcado | **1 receita** (a outra caiu: a nova tentativa por volume falhou no provedor) com **19,8 g de proteína** e sem `capacityNotice`. 3 scans. 7 chamadas. Ver *Achados* |
| C0 leitura da geladeira 3 **depois do CP-B7a** (21+) | foto | Rum branco ✔ alcoólico, Cachaça ✔, Cerveja ✔; Ginger beer ✘ (não alcoólico); `hasLiquid: true` (leite de coco). 2 leituras, mesmo resultado |
| C2 leitura da geladeira 4 | foto | "Cerveja sem álcool" lida e **não alcoólica**; proteína em pó, bebida de aveia, mel, mamão, bagas congeladas |
| D0 leitura da geladeira 3 (sem idade) | foto | Rum branco ✔, Cachaça ✔, Cerveja ✔; "Cerveja de gengibre" ✘ (falso amigo) |
| D1 sem idade marca o rum | `selected` com "Rum branco" | **`428 scanner/age-confirmation-required`**, `scanCount` 0 → 0, **0 chamadas** à IA |
| C1 21+ marca o rum (Pro, pt-BR) | abacaxi, morango, limão, hortelã, leite de coco e "Rum branco" marcados | 2 receitas: "Vitamina Tropical de Abacaxi com Coco" (sem álcool) e "Smoothie Refrescante de Morango com Rum" com **Rum branco — 50 ml** e **`alcoholGrams: 16`** (50 ml a 40% ≈ 16 g; 1×4 + 16×4 + 0×9 + 16×7 = 180 ≈ 181 kcal). Garrafa marcada = álcool em pelo menos uma receita, como o prompt pede. Sem aviso de sem álcool. 1 scan, readId novo. 2 chamadas (uma 503) |
| D2 "Não" e marca o rum | o mesmo corpo, depois de `isAdult: false` | **`403 scanner/alcohol-not-allowed`**, `scanCount` 0, 0 chamadas (no app o item fica desativado) |

**Todos os casos do lote 13 confirmados ao vivo.** O 21+ com rum passou na 10ª rodada (24/11), depois de 5 tentativas com `503 high demand` ou estouro de 30 s nas rodadas de 23/11; com o provedor estável, a geração com álcool levou 7 s, então os estouros eram da sobrecarga, não do prompt com álcool.

## Achados e riscos que ficam

- **"Com 30 g de proteína" saiu com 19,8 g e sem aviso (A3).** A foto não tinha pó de proteína; o iogurte grego era a maior fonte. A IA não entregou o valor e também não preencheu `capacityNotice`. O backend não confere se um valor pedido de macro foi atingido, nem no Pulse AI (a regra do `capacityNotice` é só do prompt). Fica como decisão: conferir no backend o macro pedido (como já se faz com os itens adicionados) ou aceitar como está.

- **Docs históricos:** os relatórios antigos em `docs/fixes/` e `docs/phase-2/cp2.1-pantry-scanner.md` ainda citam `/analyze`. Eles descrevem o que existia na época e não foram reescritos. Os docs vivos (`architecture.md`, `gemini-costs.md`, `api/endpoints.md`, tabela de eventos do `posthog-analytics.md`) estão no fluxo read → generate.
- **Conferência por palavras:** depende do nome digitado aparecer no ingrediente. Com os parênteses do CP-B7a, o caso de outro idioma fica coberto; quando a IA não segue, a pessoa vê o aviso no card.
- **Nome de drink ambíguo no pedido do Pantry** ("piña colada" sozinho) conta como sem álcool.
- **O Gemini 503 "high demand"** foi o maior obstáculo do lote: o servidor responde certo (scan e leitura devolvidos), mas a pessoa vê "indisponível". O `AI_FALLBACK_MODEL` continua sem valor.

## Arquivos

- Shared: `schemas/pantryScanner.ts` (constantes e schemas de leitura e geração), `schemas/pulseAi.ts` (`PULSE_AI_MESSAGE_MAX` exportado, `missingRequestedIngredients`), `recipeContent.ts` (`RECIPE_MISSING_REQUEST_MAX_ITEMS`), `aiRequestBudget.ts`.
- API:
  - `controllers/pantryScanner.controller.ts`, `routes/pantryScanner.ts`, `index.ts` (parser grande em `/read`);
  - `models/PantryRead.ts` (novo), `models/User.ts` (contadores de leitura);
  - `services/promptBuilder.service.ts` (Pantry: escolhas, líquido, álcool, parênteses), `services/pantryPromptBuilder.service.ts` (bebidas), `services/aiRequestBudget.service.ts` (comentário);
  - `utils/pantryRequest.utils.ts` (novo), `utils/recipeNotices.utils.ts` (novo), `utils/alcoholAge.utils.ts` (novo), `utils/aiRecipePayload.utils.ts`, `controllers/pulseAi.controller.ts` (só importações);
  - testes: `controllers/pantryScanner.twoStep.test.ts`, `controllers/pantryScannerTestFakes.ts`, `models/PantryRead.test.ts`, `utils/pantryRequest.utils.test.ts` e os 4 testes do Pantry migrados.
- Mobile: `screens/PantryScannerScreen.tsx`, `services/pantryScanner.service.ts`, `components/pantryScanner/IngredientCheckItem.tsx`, `components/pulseAi/RecipeCard.tsx`, `locales/en.json`, `locales/pt-BR.json` e os testes citados.
- Docs: `architecture.md`, `gemini-costs.md`, `api/endpoints.md`, `fixes/posthog-analytics.md`, este relatório.
