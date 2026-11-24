# CP-B8 (+ CP-B8a): nada pedido some em silêncio (Pulse AI e Pantry) e lote 14

**Nome:** este trabalho foi feito como "CP-B7b"; para o projeto é o **CP-B8**. Os comentários do código novo usam "CP-B7" (CP-B8) e "CP-B8a" (a correção abaixo).

**Ponto de partida (CP-B7 + B7a):** a leitura da foto descartava sozinha o que não servia para shake (queijo, picles, comida pronta). No Pulse AI, o ingrediente pedido na mensagem era obrigatório só pelo prompt. Valores pedidos ("30 g de proteína", "400 kcal") também: no lote 13, "com 30 g de proteína" saiu com 19,8 g e sem aviso.

**Decisões do Gabriel (24/11):** a leitura lista tudo que é alimento ou bebida, e o que não serve vai para "Outros itens na foto", desmarcado. Valores pedidos com tolerância de 10%, uma nova tentativa e depois aviso. Ingrediente pedido também conferido no Pulse AI.

**Sem mudança:** limites e leitor de volume, gelo/congelado, regras de álcool e idade, dieta furável, receitas da Home, chave/provedor/modelo da IA.

## Tarefa 1: leitura completa da foto

- **Prompt de visão:** lista todo alimento e bebida visível, com `blendSuitable`. É `false` para carne ou peixe crus, frios, comida pronta, condimentos (ketchup, mostarda, maionese), picles e temperos salgados. Remédios, limpeza, utensílios e não-comida continuam fora.
- `blendSuitable` ausente ou fora do formato vale `true`: na resposta da visão, no `PantryRead` antigo e no schema compartilhado (opcional, para app novo com API antiga).
- Bebida alcoólica fica sempre no grupo principal (`blendSuitable: true`, desmarcada, com rótulo). `isAlcoholic` continua pelo código.
- `hasLiquid` olha só os itens `blendSuitable`.
- Uma leitura com **só** "Outros itens" agora gera `readId`: a pessoa vê o que foi lido, pode marcar ou adicionar. Antes, uma foto assim voltava como "nenhum ingrediente utilizável".
- O teto de saída da visão subiu de 1000 para 2500 tokens (`PANTRY_VISION_MAX_TOKENS`), porque uma lista longa cortaria o JSON. Só a saída usada é cobrada.
- **App:**
  - a lista principal ficou como era;
  - abaixo dela, o grupo "Outros itens na foto (N)" / "Other items in the photo (N)", recolhido, com os itens desmarcados e marcáveis. O cabeçalho é um botão com `expanded` e dica de acessibilidade;
  - digitar o nome de um desses itens marca o item e abre o grupo.
- Item de "Outros itens" só entra se a pessoa marcar. Desmarcado, ele fica fora do prompt e cai na conferência de "desmarcado nunca entra".

## Tarefa 2: alimento pedido (Pulse AI e "Algum pedido?" do Pantry)

**Módulo único:** `utils/requestedFoods.utils.ts`.

**Vocabulário en/pt-BR**, montado de tabelas que já existiam:
- `TYPICAL_INGREDIENT_WEIGHTS`, `UNIT_INGREDIENT_WEIGHTS`, `DRINK_DEFINING_INGREDIENTS`;
- as listas de oleaginosas, veganos e açúcar do validador;
- uma lista curta de itens comuns que não estavam em nenhuma tabela: canela, açaí, maracujá, melão, goiaba, beterraba, pepino, abóbora, cúrcuma, tofu, água e gelo.

A normalização é a do validador: acentos, plural, compostos, exceções e negação. O validador ganhou só dois exports (a posição de cada ocorrência, para não cobrar "amendoim" dentro de "pasta de amendoim") e `normalizeForMatching`.

**Não conta como pedido:**
- alimento negado ("sem banana", "no banana", "em vez de leite");
- categoria genérica ("alguma fruta", "verduras", "castanhas", "folhas verdes");
- "proteína"/"protein" sozinha (é nutriente);
- "café da manhã", "couve-flor", "noz-moscada";
- item do histórico.

**Decidido aqui:**
- **"Frutas vermelhas"/"berries"** vale como uma fruta vermelha qualquer: morango, mirtilo, framboesa, amora, cereja ou cranberry.
- **Mapa de sabor:** baunilha → extrato ou proteína sabor baunilha; chocolate → cacau, cacao, nibs ou achocolatado; café → café ou espresso.
- **"Whey"** é um pedido específico (proteína vegetal não atende). "Proteína em pó", "proteína vegetal" e "caseína" são atendidos por qualquer proteína.
- **"Date"** em inglês não conta como pedido (é também "encontro"); "tâmara" e "medjool" contam.

**Não é cobrado:**
- gelo no Lite;
- bebida alcoólica quando o álcool não é permitido ("piña colada com rum" para menor: vale a versão sem álcool). Para 21+, o destilado pedido é cobrado.

**Conferência:** pelo nome dos ingredientes, no grupo do vocabulário. Outro idioma conta, e o nome digitado entre parênteses também.

**Faltou:** até `REQUESTED_ITEM_MAX_RETRIES` = 2 novas tentativas, pelo caminho de sempre. Se ainda faltar, a receita sai com `missingRequestedIngredients` (o termo como a pessoa escreveu). Nunca bloqueia: resposta inválida ou falha do provedor entrega a última receita.

**Pantry:**
- itens adicionados à mão também passam a ter 2 novas tentativas (eram 1);
- alimentos citados no "Algum pedido?" são cobrados como os adicionados;
- um alimento pedido que a pessoa desmarcou é permitido (o pedido vence), mesmo em outro idioma ("iogurte" pedido × "Greek yogurt").

**Receita com `capacityNotice`** (a IA ajustou ao copo): o item não é cobrado, nem com nova tentativa nem com aviso. Vale nos dois recursos e também para os adicionados do Pantry; antes do CP-B7b eles eram cobrados mesmo com o aviso do copo.

**Cache do Pulse AI:** a receita servida do cache passa pela mesma conferência final, sem nova tentativa.

## Tarefa 3: valores pedidos

**Módulo único:** `utils/requestedTargets.utils.ts`.

**Leitura:** proteína, carboidrato, gordura (g) e kcal/calorias, en e pt-BR, inteiro ou decimal com vírgula ou ponto.

| Tipo | Exemplos |
|---|---|
| Exato | "30 g de proteína", "protein 30 g", "400 calorias", "50g carbs", "carbo", "carboidratos" |
| Mínimo | "pelo menos", "no mínimo", "at least", "30 g ou mais", "+", "mais de" |
| Máximo | "até", "no máximo", "at most", "under", "menos de", "up to", "ou menos" |
| Faixa | "entre 20 e 30 g", "20-30 g", "de 20 a 30 g", "between … and …" |

"30 g de proteína em pó" e "30g protein powder" são quantidade de ingrediente, não valor pedido.

**Conferência:** contra os macros declarados, com `TARGET_TOLERANCE_PERCENT` = 10. Exato ±10%; mínimo ≥ 90%; máximo ≤ 110%; faixa [90% do mínimo, 110% do máximo].

**Não bateu:** 1 nova tentativa (`REQUESTED_TARGET_MAX_RETRIES`), com o valor pedido × entregue e dicas por nutriente e direção. A dica respeita a dieta (vegano/sem lactose → proteína vegetal; sem oleaginosas → sem pasta de amendoim). No Pantry, a dica pede para usar só os disponíveis.

**Persistiu:** a receita sai com `unmetTargets: [{ nutrient, kind, requested, requestedMax?, delivered, suggestion? }]`, preenchido só pelo backend (o valor da IA é descartado). O card mostra:
- "Chegamos a 19,8 g de proteína (você pediu 30 g)." / "We reached 19.8 g of protein (you asked for 30 g).";
- as variantes "pelo menos", "no máximo" e "entre … e …".

**Pantry:** quando o valor ficou abaixo do pedido, entra "Adicionar X ajudaria.":

| Nutriente | Sugestão | Com restrição |
|---|---|---|
| Proteína | whey ou proteína em pó | proteína vegetal em pó (vegano ou sem lactose) |
| Carboidrato | aveia ou banana | — |
| Gordura | pasta de amendoim | abacate ou chia (sem oleaginosas) |
| kcal | aveia ou pasta de amendoim | aveia ou banana (sem oleaginosas) |

Acima do pedido, sem sugestão.

**Com `capacityNotice`:** não há nova tentativa nem `unmetTargets`. Fica só o aviso do copo (é ele que explica o motivo).

## Tarefa 3B: evento de log

`[requestCheck] requested item unmet` → `{ event: 'requested_item_unmet', origin: 'pulse_ai'|'pantry', type: 'ingredient', count, attempts, provider, model }`.

`[requestCheck] requested target unmet` → um por nutriente: `{ event: 'requested_target_unmet', origin, type: 'target', nutrient, count, attempts, provider, model }`.

Só códigos e contagens: nunca o nome do item, a mensagem, a receita ou dados do usuário (testado). Cada receita do Pantry é conferida e registrada sozinha. Como achar no log: [gemini-costs.md](../gemini-costs.md).

## Tarefa 4

"CP-B5.4" → "CP-B7" em todos os comentários e nomes de `describe` (API, app, shared). O arquivo `pantryScanner.cpB54.test.ts` manteve o nome.

## Testes

API: 1301 (eram 1242). App: 970 (eram 961). Typecheck nos 3 workspaces e lint limpos.

**Novos:**
- `utils/requestedTargets.utils.test.ts` (14): formatos exato/mínimo/máximo/faixa, vírgula e ponto, en e pt-BR, "em pó", ±10%, sugestão pela dieta.
- `utils/requestedFoods.utils.test.ts` (11): negação, categoria, frutas vermelhas, sabor, falsos amigos, parênteses, gelo no Lite, álcool.
- `controllers/pulseAi.cpB7.test.ts` (20):
  - alimentos: banana faltando → 2 novas tentativas → aviso + evento sem o nome; banana na 2ª nova tentativa → sem aviso; com banana; "sem banana"; baunilha com extrato; chocolate com cacau; histórico; piña colada para menor; rum para 21+; gelo no Lite; en com parênteses; "no banana" e falha do provedor; valor da IA descartado; cache;
  - valores: 27,5 passa; 19,8 → nova tentativa → aviso + evento; nova tentativa acerta; `capacityNotice` sem duplicar; máximo; mínimo en.
- `controllers/pantryScanner.cpB7.test.ts` (12):
  - leitura: `blendSuitable` na resposta e na leitura guardada; ausente/fora do formato = true; álcool no grupo principal; prompt e teto de tokens; "Outros itens" fora do `hasLiquid`; leitura só com "Outros itens"; "Outros itens" fora do prompt se desmarcado e dentro se marcado;
  - pedido: 30 g → aviso com sugestão whey; vegana → proteína vegetal; 27,5 passa; `capacityNotice`; alimento do pedido com 2 novas tentativas; pedido × desmarcado em outro idioma.
- `models/PantryRead.test.ts` (+1) e `utils/pantryRequest.utils.test.ts` (+1): campo opcional, ausente = true.
- App: `RecipeCard.unmetTargets.test.tsx` (5) e `PantryScannerScreen.test.tsx` (+4: grupo recolhido e acessível, desmarcado e fora do pedido; marcar entra; digitar abre e marca; sem grupo).

**Expectativas alteradas:**
- `pantryScanner.cpB54.test.ts`: "adicionado = obrigatório em TODAS", "adicionado que persiste ausente" e "sem parênteses e sem o item" agora esperam **2** novas tentativas (eram 1).
- `pulseAi.cpB5.test.ts`: em "drink sem pedido de drink na mensagem" ("um shake de morango"), a receita falsa ganhou morango. Sem ele, a conferência nova faria uma nova tentativa; o que o teste confere (nenhum drink cobrado) não mudou.

## Lote 14 (ao vivo)

**Método da auditoria:**
- API local (`NODE_ENV=development`), banco `test` do Atlas, Gemini real (`gemini-3.5-flash-lite`);
- 3 contas descartáveis `cpb7l14-*@test.blendi.local`;
- fotos 1 e 4 reduzidas a 1024 px como no app;
- contador de chamadas por pré-carga fora do repositório (só conta, teto 40);
- ~4,5 s entre chamadas, parada automática depois de 3 respostas 503 seguidas.

**Resultado: parou por sobrecarga do Gemini.** O log mostrou `503 This model is currently experiencing high demand` (`ai/unavailable`, não cota). 14 chamadas ao Gemini.

| Caso | Resultado | Chamadas |
|---|---|---:|
| P1 leitura da foto 1 | 503 (3 tentativas do provedor), leitura devolvida | 3 |
| P2 leitura da foto 4 | Grupo principal: bagas congeladas, proteína em pó, bebida de aveia, mel, cottage, mirtilos, cerveja sem álcool (não alcoólica), mamão, tomates. "Outros itens": molho, geleia, ketchup. `hasLiquid: true` | 1 |
| P3 "com 30 g de proteína" (foto 1) | Não rodou (a leitura da foto 1 falhou) | 0 |
| "shake com banana e morango" | 1ª receita gerada; a nova tentativa por volume recebeu 503 → `503 pulseai/ai-unavailable`, uso devolvido | 4 |
| "shake com 30 g de proteína" | 503 na geração | 3 |
| "shake com no máximo 250 kcal" | 503 na geração → parada automática | 3 |
| "shake sabor baunilha", conta com banana no histórico | Não rodaram (parada) | 0 |

**Limpeza:**
- as 3 contas foram apagadas pelo `DELETE /users/me`, e o Mongo ficou com 0 usuários `cpb7*`;
- 1 leitura órfã em `pantry_reads`, sem imagem, foi apagada à mão (ver *Achados*).

**Ainda não confirmado ao vivo:** conferência de alimento e de valor no Pulse AI, aviso com sugestão no Pantry. Os testes automatizados cobrem esses caminhos. Sobram 26 chamadas do teto para repetir o lote com o provedor estável.

## Achados e riscos que ficam

- **`DELETE /users/me` não apaga `pantry_reads`.** A leitura (nomes de ingredientes, sem imagem) só some pelo TTL de 30 min. Não foi mudado (fora do escopo).
- **Geleia em "Outros itens":** na foto 4, a visão marcou geleia como não-blend. O item continua visível e marcável; a fronteira é decisão da IA.
- **Leitura só com "Outros itens"** passou a abrir a confirmação, em vez de "nenhum ingrediente utilizável".
- **O vocabulário é finito:** um alimento fora dele (por exemplo "jabuticaba") não é cobrado e fica só com o prompt.
- **`capacityNotice` cancela a cobrança** de item e valor, mesmo quando o aviso do copo é sobre outra coisa.
- **Mais chamadas por receita** no pior caso: até 2 + 1 a mais. O teto de tempo de IA da requisição continua o mesmo.

---

# CP-B8a: correção antes do commit

**Achados que motivaram:** o `capacityNotice` vinha da IA sem conferência e, preenchido, pulava as conferências do CP-B8. O `DELETE /users/me` não apagava `pantry_reads`. O vocabulário de alimentos era curto ("jabuticaba" não era cobrada).

## Tarefa 1: `capacityNotice` só vale perto do limite

**Função única:** `checkCapacityNotice` (`utils/recipeNotices.utils.ts`). Ela usa o mesmo leitor de volume (`estimateRecipeVolumeMl`) e o limite do copo do modelo (`BLENDER_LIMITS`; contas "other"/"none" gravam `blendiModel` Lite).

**Constantes únicas:**
- `CAPACITY_NOTICE_MIN_VOLUME_PERCENT` = 85;
- `CAPACITY_NOTICE_MIN_VOLUME_PERCENT_WITH_UNMEASURED` = 75.

**Regra para itens sem medida (decidida aqui):** o leitor conta 0 para eles, então o volume real é maior que o medido. Com pelo menos um item sem medida, o patamar cai para 75%. Abaixo de 75%, o aviso cai mesmo com item sem medida: o item sem medida nunca justifica o aviso sozinho. Assim a IA não consegue escapar com um "a gosto" numa receita pela metade.

**Aviso legítimo:** fica como no CP-B8 (não cobra item nem valor; fica só o aviso do copo).

**Aviso não legítimo:**
- é descartado e não chega ao app;
- alimento pedido, valor pedido e itens adicionados do Pantry são cobrados com as novas tentativas e os avisos do CP-B8;
- vale no Pulse AI, no Pantry (cada receita) e na receita do cache;
- o descarte é aplicado na conferência final (`applyRequestCheckNotices`), que roda sempre, mesmo sem pedido;
- evento de log: `[requestCheck] capacity notice discarded` → `{ event: 'capacity_notice_discarded', origin, volumePercent, unmeasured, provider, model }`, sem conteúdo (testado).

## Tarefa 2: apagar a conta apaga tudo

`DELETE /users/me` passa a apagar `pantry_reads` (por `userId`) e `otps` (códigos de verificação pendentes, ligados pelo **e-mail**). O e-mail é lido dentro da mesma transação.

**Por que o Otp entrou sem perguntar:** um código de uma conta apagada não tem uso legítimo, e poderia valer para quem recadastrasse o mesmo e-mail nos minutos seguintes.

| Coleção (modelo) | Liga ao usuário por | Apagada antes | Apagada agora |
|---|---|---|---|
| `users` (User) | `_id` | sim | sim |
| `blend_logs` (BlendLog) | `userId` | sim | sim |
| `conversations` (Conversation) | `userId` | sim | sim |
| `favorites` (Favorite) | `userId` | sim | sim |
| `hydration_logs` (HydrationLog) | `userId` | sim | sim |
| `notification_logs` (NotificationLog) | `userId` | sim | sim |
| `shopping_lists` (ShoppingList) | `userId` | sim | sim |
| `supplement_logs` (SupplementLog) | `userId` | sim | sim |
| `user_photos` (UserPhoto) | `userId` | sim | sim |
| `weekly_reports` (WeeklyReport) | `userId` | sim | sim |
| `xp_logs` (XPLog) | `userId` | sim | sim |
| `daily_missions` (DailyMission) | `userId` | sim | sim |
| `googleauthcodes` (GoogleAuthCode) | `userId` | sim | sim |
| `locked_previews` (LockedPreview) | `userId` | sim | sim |
| `ai_cache` (AiCache, cache da IA) | `userId` | sim (`invalidateUserCache`) | sim |
| `pantry_reads` (PantryRead) | `userId` | **não** (só TTL de 30 min) | **sim** |
| `otps` (Otp) | `email` | **não** (só TTL) | **sim** |

**Ficam no próprio documento `users`** (saem com ele): tokens de push, suplementos, preferências, `appleRefreshToken` (a Apple é revogada antes, como já era).

**Fora do nosso banco** (não mudou): RevenueCat e PostHog.

**Provas:**
- **Teste automatizado:** `user.deleteAccount.test.ts` registra todos os modelos do diretório `models/` e exige que **cada** modelo com `userId` seja apagado pelo `userId`, e o Otp pelo e-mail. Um modelo novo esquecido quebra o teste: tirando a linha do `PantryRead`, ele falha com "PantryRead não é apagado pelo userId".
- **Prova real no banco `test`:** uma conta descartável recebeu 1 documento em cada uma das 17 coleções. Depois do `DELETE /users/me` (200), ficaram **0 em todas**.

## Tarefa 3: vocabulário ampliado

Foram 86 grupos novos (199 termos en e pt-BR) em `EXTRA_FOOD_GROUPS`, uma constante única em `requestedFoods.utils.ts`:

| Tipo | Itens |
|---|---|
| Frutas | jabuticaba, caju (a fruta), acerola, cupuaçu, pitaya, carambola, figo, caqui, lichia, graviola, ameixa, nectarina, damasco, romã, tangerina/mexerica/bergamota, jaca, groselha, uva-passa, goji, physalis, tamarindo, pitanga, umbu, nêspera, marmelo, ruibarbo, banana-da-terra |
| Verduras, legumes, ervas, chás | abobrinha, batata-doce, mandioquinha, inhame, brócolis, couve-flor, agrião, repolho, acelga, chuchu, salsinha, coentro, manjericão, erva-doce, alho, pimenta-caiena, chá verde, hibisco, erva-mate, guaraná, kombucha |
| Grãos | quinoa, farelo de aveia, amaranto, tapioca, psyllium, flocos de milho, muesli, gérmen de trigo |
| Sementes e oleaginosas | semente de abóbora, gergelim/tahine, girassol, cânhamo, noz-pecã, baru |
| Laticínios e similares | leite condensado, leite em pó, sorvete, frozen yogurt (segue a regra do gelo no Lite), soja, chantilly, leite fermentado |
| Outros | doce de leite, melado, rapadura, açúcar mascavo, açúcar de coco, xilitol, eritritol, caramelo, noz-moscada, cardamomo, cravo-da-índia, maca peruana, spirulina, creatina, geleia, creme de avelã, paçoca |

Grupos que já existiam ganharam termos: queijo (cream cheese, mascarpone), iogurte (coalhada) e cacau (nibs). O que já estava nas tabelas não foi repetido: pêssego, toranja, melancia, uva, kiwi, mamão, cenoura, couve, rúcula, alface, aipo, granola, linhaça, castanhas, amêndoa, nozes, avelã, macadâmia, kefir, ricota, leite de coco, tâmara, matcha, gengibre, hortelã.

**Conferência mais precisa** (exceção por grupo, `notSatisfiedBy`):

| Pedido | Na receita | Atende? |
|---|---|---|
| caju | "Castanha de caju" | não |
| uva | "Uva-passa" | não |
| leite | "Leite condensado", "Leite em pó" | não |
| leite | "Leite de aveia" | sim |
| couve | "Couve-flor" | não |
| maçã | "Maca peruana" | não |
| nozes | "Noz-moscada", "Noz-pecã" | não |
| abóbora | "Semente de abóbora" | não |

**Deixados fora por risco de falso amigo:**
- "salsa" (molho/dança; vale "salsinha");
- "cará" ("cara, faz um shake");
- "panela";
- "cravo" sozinho (flor);
- "batata" sozinha, "cebola", "pimenta" genérica, "corn" sozinho;
- "jelly" (gelatina em en-US);
- marcas (Nescau, Ovomaltine, Ninho).

**Avaliados e mantidos:** "manga" (num app de shake é fruta), "lima" (já existia), "figo", "pera", "uva", "romã"/"roma" (pode ser a cidade, risco pequeno), "mandarin" (também é o idioma, risco pequeno). "Date" segue fora (só "tâmara"/"medjool").

## Tarefa 4: verificação

Typecheck nos 3 workspaces e lint limpos. API **1320/1320** (eram 1301). App **970/970** (sem mudança).

**Novos:**
- `recipeNotices.capacity.test.ts` (5);
- `user.deleteAccount.test.ts` (1, sobre o registro inteiro de modelos);
- `pulseAi.cpB7.test.ts` +6: banana com aviso e volume 50% → descartado, nova tentativa, banana cobrada; aviso ilegítimo na entrega → descartado e evento; 95% → mantido, nada cobrado; 30 g pedidos com 19,8 e volume 60% → descartado, `unmetTargets`; 900 kcal no Lite com 98% → mantido; cache;
- `pantryScanner.cpB7.test.ts` +2: adicionado faltando com volume 50%; 30 g de proteína com volume 60%;
- `requestedFoods.utils.test.ts` +5: amostra en e pt-BR, plural e acento ("jabuticabas", "acerolas", "castanhas-do-pará", "uvas-passas"), falsos amigos, conferência com o parecido, frozen yogurt no Lite.

**Expectativas alteradas (testes do próprio CP-B8):**
- "não duplica com o capacityNotice" (Pulse AI) e "com capacityNotice não duplica" (Pantry): as receitas falsas tinham volume de 60–80 ml. Agora têm 95% do copo, senão o aviso cai, como pedido.
- "falsos amigos" em `requestedFoods.utils.test.ts`: "couve-flor" e "noz-moscada" eram `[]`. Agora são itens próprios (`cauliflower`, `nutmeg`); continuam não contando como couve e noz.

## Tarefa 5: lote 14b (ao vivo)

**Antes do Gemini:** a prova real do DELETE descrita na Tarefa 2.

**Gemini:**

| Tentativa | Resultado | Chamadas |
|---|---|---:|
| 1ª: primeiro pedido "shake com banana e morango" | `503 This model is currently experiencing high demand` (`ai/unavailable`, não cota) → parada | 3 |
| 2ª: ~20 min depois, o mesmo pedido | 503 de novo → parada | 3 |

Os demais casos não rodaram: 30 g de proteína, máximo 250 kcal, baunilha com banana no histórico, jabuticaba, Pantry foto 1 com "com 30 g de proteína".

**Total do teto:** 14 chamadas no lote 14 + 6 agora = **20 de 40; restam 20**. Contas `cpb8a-*` apagadas pelo `DELETE /users/me`: 0 usuários `cpb*` no banco e 0 leituras órfãs (agora o DELETE apaga as leituras).

**Ainda não confirmado ao vivo:** todo o comportamento do CP-B8/CP-B8a que depende do Gemini. Está coberto só pelos testes automatizados.

