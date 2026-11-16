# Auditoria de receitas da IA: lote real (16/11/2026)

**Objetivo:** gerar um lote real de receitas do Pulse AI e do Pantry Scanner, com o Gemini de verdade, para análise de qualidade feita depois. Este documento descreve **o que foi gerado e como**. Ele não avalia a qualidade das receitas.

**Arquivo de dados:** `.audit/receitas-ia-2026-11-16.json`, na raiz do repositório. Ele está no `.git/info/exclude` e não é versionado. Cada item traz o perfil completo, o pedido, o status, a resposta inteira da API e o log da API daquele pedido.

**Três lotes no mesmo arquivo**, separados pelo campo `batch`:
- **Lote 1** (itens 1–42): Pulse AI e Pantry. O resumo logo abaixo é deste lote.
- **Lote 2** (itens 43–52): só Pantry, rodado de novo porque o lote 1 trouxe poucas receitas do Pantry. Ver [Lote 2](#lote-2-só-pantry-itens-4352).
- **Lote 3** (itens 53–72): Pantry e Pulse AI **depois das correções do CP-B1** ([docs/fixes/cp-b1-confiabilidade-ia-pantry-pulse-ai.md](../docs/fixes/cp-b1-confiabilidade-ia-pantry-pulse-ai.md)). Ver [Lote 3](#lote-3-depois-do-cp-b1-itens-5372).

O `meta.summaryByBatch` do JSON traz o resumo de cada lote.

## Resumo

| | Total | Pulse AI | Pantry |
|---|---|---|---|
| Itens | **42** | 32 | 10 |
| 200 | 36 | 29 | 7 (só **2** com receitas, ver [achado 1](#achado-1--pantry-responde-200-sem-receitas-quando-a-geração-falha-no-provedor)) |
| 422 | 3 | 1 `pulseai/blender-limit-unmet` | 1 `scanner/blender-limit-unmet`, 1 `scanner/dietary-restriction-unmet` |
| 503 (depois de repetir) | 3 | 2 `pulseai/ai-unavailable` | 1 `scanner/vision-unavailable` |
| Tentativas | 53 | | |
| Tentativas com 503 | 14 | | |
| Do cache | 0 | | |

**Receitas efetivamente entregues:** 29 do Pulse AI e 4 do Pantry (2 scans × 2 receitas).

**Novas tentativas, contando todas as tentativas** (lidas do log da API):

| Motivo | Pulse AI | Pantry | Total |
|---|---|---|---|
| Limite do copo | 13 (10 terminaram em 200, 1 em 422, 2 em 503) | 2 (as 2 do item 34, 422) | **15** |
| Dieta | 1 (terminou em 503) | 2 (as 2 do item 35, 422) | **3** |
| Macros | 0 | 0 | **0** |
| JSON inválido (inferido) | 0 | 0 | **0** |

Itens com pelo menos uma nova tentativa: 14.

**De onde vieram os 503:** todos os que foram conferidos no log vieram de sobrecarga do lado do Google, com a mensagem `[503 Service Unavailable] This model is currently experiencing high demand`. Não foi a cota de 15 req/min: o roteiro nunca passou de 14 chamadas por 62 s. Três desses 503 do Pulse AI ocorreram **dentro da nova tentativa**:
- 2 vezes em `blender limit retry failed`;
- 1 vez em `recipe restriction retry failed`.

Nos três, a resposta foi 503 `pulseai/ai-unavailable`, como define o CP-1.1.9.

## Método

- **Alvo:** API local (`pnpm exec tsx src/index.ts`, `NODE_ENV=development`, porta 3000), ligada ao banco `test` do Atlas. Gemini real: `gemini-3.5-flash-lite` para texto e visão. O roteiro abortaria se o banco não fosse `test`, tanto na conexão própria quanto na linha de log da API. Nada foi feito em produção.
- **Contas:** 16 descartáveis (`audit-pNN-<run>@test.blendi.local`), criadas por `POST /auth/register`.
  - O corpo foi preenchido por `PATCH /users/me` com `completingBodyOnboarding: true`, e as metas foram recalculadas pelo servidor. O perfil registrado em cada item é o `GET /users/me` depois disso.
  - `isPro` foi marcado direto no Mongo, só nessas contas.
- **Limite de 5 cadastros por hora:** 4 fases de cadastro (5 + 5 + 5 + 1), com a API reiniciada entre elas.
- **Pulse AI:** 2 pedidos por conta, no idioma da conta. Foi feita uma rodada com o 1º pedido de todas as contas e depois outra com o 2º.
  - O 2º pedido segue **na mesma conversa** do 1º, como no app, e leva o 1º turno como histórico. O campo é `conversationTurn`.
  - `DELETE /pulse-ai/cache` antes de cada pedido.
- **Pantry:** 10 fotos geradas para o teste (SVG → PNG por `qlmanage` → JPEG por `sips`, 1024×1024, cerca de 60 KB). São prateleiras de despensa ou geladeira com os itens desenhados e rotulados.
- **Ritmo:**
  - pelo menos 6 s entre pedidos;
  - no máximo cerca de 14 chamadas de IA em 62 s, contando as novas tentativas a partir do log;
  - cada 503 foi repetido **uma vez**, depois de 65 s, e as duas tentativas ficam em `attempts`.
- **Metadados de geração** (`attempts[].generation`), extraídos do trecho de log da API de cada pedido:
  - número de chamadas de texto e de visão;
  - falhas do provedor;
  - novas tentativas com motivo e detalhe;
  - desfechos das novas tentativas;
  - tempo no servidor.
  - A nova tentativa por JSON inválido não é logada pela API e foi **inferida**: chamadas a mais sem motivo no log.
- **Segredos:** token, senha, chaves e URI foram apagados do arquivo. Depois disso, o arquivo foi conferido: não há JWT, `Bearer`, chave do Google, URI do Mongo nem senha.

## Perfis (16 contas)

Peso em kg e altura em cm (o app grava em métrico mesmo com `unitSystem` imperial). As metas são diárias, calculadas pelo servidor.

| Conta | Modelo | Goal | weightGoal | Dieta | Idioma | Unidade | Corpo | Proteína | Carbo | kcal |
|---|---|---|---|---|---|---|---|---|---|---|
| p01 | Lite | Muscle | gain | — | en | metric | 75 kg · 180 cm · 28 anos · M · veryActive | 150 g | 428 g | 3302 |
| p02 | Lite | Wellness | maintain | dairy_free | pt-BR | metric | 62 kg · 165 cm · 35 anos · F · lightlyActive | 99 g | 217 g | 1808 |
| p03 | Lite | Energy | lose | vegan | en | imperial | 70 kg · 168 cm · 30 anos · F · moderatelyActive | 126 g | 177 g | 1730 |
| p04 | Lite | Recovery | maintain | — | pt-BR | imperial | 85 kg · 178 cm · 45 anos · M · moderatelyActive | 187 g | 286 g | 2701 |
| p05 | Lite | WeightLoss | lose | no_added_sugar | en | metric | 88 kg · 163 cm · 40 anos · F · sedentary | 176 g | 59 g | 1345 |
| p06 | ProPlus | Muscle | maintain | nut_free | pt-BR | metric | 82 kg · 183 cm · 24 anos · M · extremelyActive | 164 g | 451 g | 3513 |
| p07 | ProPlus | Wellness | gain | — | en | imperial | 52 kg · 160 cm · 22 anos · F · lightlyActive | 83 g | 270 g | 2017 |
| p08 | ProPlus | Energy | maintain | vegan + nut_free | pt-BR | metric | 70 kg · 175 cm · 33 anos · M · moderatelyActive | 126 g | 317 g | 2532 |
| p09 | ProPlus | Recovery | gain | dairy_free | en | metric | 78 kg · 176 cm · 38 anos · M · veryActive | 172 g | 392 g | 3224 |
| p10 | ProPlus | WeightLoss | lose | — | pt-BR | imperial | 102 kg · 174 cm · 50 anos · M · sedentary | 204 g | 100 g | 1735 |
| p11 | Steel | Muscle | lose | dairy_free + no_added_sugar | en | imperial | 95 kg · 188 cm · 31 anos · M · veryActive | 190 g | 319 g | 2907 |
| p12 | Steel | Wellness | lose | — | pt-BR | metric | 74 kg · 160 cm · 55 anos · F · lightlyActive | 118 g | 108 g | 1293 |
| p13 | Steel | Energy | gain | — | en | metric | 64 kg · 177 cm · 19 anos · M · veryActive | 115 g | 437 g | 3157 |
| p14 | Steel | Recovery | lose | nut_free | en | imperial | 68 kg · 170 cm · 42 anos · F · veryActive | 150 g | 177 g | 1866 |
| p15 | Steel | WeightLoss | lose | vegan | pt-BR | metric | 80 kg · 166 cm · 29 anos · F · lightlyActive | 160 g | 121 g | 1606 |
| p16 | Lite | WeightLoss | lose | no_added_sugar | en | metric | 88 kg · 163 cm · 40 anos · F · sedentary | 176 g | 59 g | 1345 |

**Cobertura:**
- 3 modelos (Lite, Pro+ e Steel, 5 contas cada, mais a gêmea);
- 5 goals, com `WeightLoss` sempre em `lose` e os outros alternando entre `lose`, `maintain` e `gain`;
- sem dieta, cada uma das 4 dietas, `vegan + nut_free` e `dairy_free + no_added_sugar`;
- en (8 contas) e pt-BR (8 contas);
- metric (10 contas) e imperial (6 contas).

**Gêmea:** a p16 tem o mesmo perfil e os mesmos 2 pedidos da p05.

Limites do copo vigentes:

| Modelo | Volume | Proteína |
|---|---|---|
| Lite | 400 ml (13,5 oz) | 35 g |
| Pro+ | 400 ml (13,5 oz) | 45 g |
| Steel | 600 ml (20,2 oz) | 55 g |

## Itens

P = proteína, C = carboidrato, G = gordura (em g). "Validado" é o `macrosValidated`. O tempo é o do servidor, na última tentativa. Para a receita inteira (ingredientes, quantidades, passos, dica), veja o JSON.

### Pulse AI

| # | Conta | Pedido (turno) | Status | Tentativas | Novas tentativas | Tempo | Receita |
|---|---|---|---|---|---|---|---|
| 1 | p01 | "post-workout shake" (1) | 422 `pulseai/blender-limit-unmet` | 1 | limite do copo ×1 | 4922 ms | — |
| 2 | p02 | "smoothie de café da manhã com banana e aveia" (1) | 200 | 1 | — | 8451 ms | Smoothie Matinal de Banana e Aveia: P 27,6 · C 53 · G 6,3 · 381 kcal · validado |
| 3 | p03 | "green smoothie" (1) | 200 | 2 (1×503) | limite do copo ×1 | 5668 ms | Compact Green Energy Boost: P 11,8 · C 11,9 · G 1,2 · 107 kcal · validado |
| 4 | p04 | "recuperação depois de uma corrida longa" (1) | 200 | 2 (1×503) | limite do copo ×1 | 7046 ms | Shake Leve de Recuperação: P 28,3 · C 37,5 · G 2,6 · 284 kcal · validado |
| 5 | p05 | "I want to lose weight, something filling" (1) | 200 | 1 | — | 4247 ms | Berry Spinach Lean Protein Smoothie: P 26,6 · C 12,3 · G 1,4 · 169 kcal · validado |
| 6 | p06 | "shake pós-treino" (1) | 200 | 1 | — | 4180 ms | Shake Pós-Treino Construtor: P 44 · C 76,6 · G 4,8 · 535,2 kcal · validado |
| 7 | p07 | "breakfast smoothie with banana and oats" (1) | 200 | 1 | — | 5730 ms | Oats and Banana Morning Energy Smoothie: P 11,8 · C 63,8 · G 13,9 · 418,9 kcal · validado |
| 8 | p08 | "smoothie verde" (1) | 200 | 2 (1×503) | — | 3958 ms | Smoothie Verde Energético: P 33,3 · C 69,8 · G 6,3 · 468 kcal · validado |
| 9 | p09 | "recovery after a long run" (1) | 200 | 1 | limite do copo ×1 | 25021 ms | Compact Recovery Berry Oats Shake: P 27,8 · C 51,5 · G 4,6 · 350 kcal · validado |
| 10 | p10 | "quero emagrecer, algo que dê saciedade" (1) | 503 `pulseai/ai-unavailable` | 2 (2×503) | — | 4560 ms | — |
| 11 | p11 | "coffee smoothie" (1) | 200 | 2 (1×503) | — | 3591 ms | Cold Brew Coffee Muscle Shake: P 36,3 · C 57 · G 6 · 427 kcal · validado |
| 12 | p12 | "algo leve pra tarde" (1) | 200 | 1 | — | 4344 ms | Vitamina Leve de Morango: P 27 · C 13,5 · G 1,1 · 172 kcal · validado |
| 13 | p13 | "something light for the afternoon" (1) | 200 | 2 (1×503) | — | 3975 ms | Afternoon Energy Oats & Berry Blend: P 37,3 · C 46,1 · G 12,1 · 441,5 kcal · validado |
| 14 | p14 | "recovery after a long run" (1) | 200 | 2 (1×503) | limite do copo ×1 | 8537 ms | Compact Recovery Berry Shake: P 33,2 · C 25,4 · G 2,1 · 259 kcal · validado |
| 15 | p15 | "quero emagrecer, algo que dê saciedade" (1) | 200 | 1 | — | 4718 ms | Shake Verde Proteico Sacietógeno: P 34,1 · C 24,6 · G 5,7 · 289 kcal · validado |
| 16 | p16 | "I want to lose weight, something filling" (1) | 200 | 1 | — | 3632 ms | Berry Spinach Lean Protein Smoothie: P 26,6 · C 12,3 · G 1,4 · 169 kcal · validado |
| 17 | p01 | "high protein, chocolate" (2) | 503 `pulseai/ai-unavailable` | 2 (2×503) | — | 6646 ms | — |
| 18 | p02 | "algo leve pra tarde" (2) | 200 | 1 | — | 3803 ms | Smoothie Leve de Frutas Vermelhas: P 15,6 · C 21 · G 2,7 · 172 kcal · validado |
| 19 | p03 | "mango" (2) | 200 | 1 | limite do copo ×1 | 7304 ms | Compact Mango Green Energy Shake: P 10,5 · C 13,6 · G 1,3 · 104 kcal · validado |
| 20 | p04 | "smoothie de café" (2) | 200 | 1 | limite do copo ×1 | 4939 ms | Smoothie de Café e Recuperação: P 23,1 · C 41,2 · G 5,5 · 298 kcal · validado |
| 21 | p05 | "strawberry" (2) | 200 | 1 | — | 4055 ms | Berry Spinach Lean Protein Smoothie: P 28,1 · C 12 · G 1 · 169 kcal · validado |
| 22 | p06 | "bastante proteína, sabor chocolate" (2) | 200 | 1 | — | 6226 ms | Shake Pós-Treino Chocolate e Aveia: P 42 · C 76,5 · G 5,4 · 527,6 kcal · validado |
| 23 | p07 | "something sweet but healthy" (2) | 200 | 1 | — | 4118 ms | Honey Banana Oat Wellness Smoothie: P 27,5 · C 76,5 · G 5,4 · 483 kcal · validado |
| 24 | p08 | "manga" (2) | 200 | 1 | limite do copo ×1 | 5281 ms | Smoothie Verde Compacto de Manga: P 26,08 · C 54,34 · G 3,06 · 351 kcal · validado |
| 25 | p09 | "peanut butter banana" (2) | 200 | 1 | — | 3713 ms | Compact Recovery Peanut Banana Shake: P 40,85 · C 64,9 · G 15,35 · 562,65 kcal · validado |
| 26 | p10 | "morango" (2) | 200 | 2 (1×503) | limite do copo ×1 | 6507 ms | Shake Leve de Morango: P 33,2 · C 10,4 · G 0,8 · 180 kcal · validado |
| 27 | p11 | "post-workout shake" (2) | 200 | 1 | limite do copo ×1 | 5333 ms | Compact Post-Workout Coffee Shake: P 29,3 · C 41,6 · G 2,6 · 307 kcal · validado |
| 28 | p12 | "smoothie de frutas vermelhas" (2) | 200 | 1 | — | 4665 ms | Smoothie Leve de Frutas Vermelhas: P 27 · C 15,6 · G 1 · 178,6 kcal · validado |
| 29 | p13 | "pre-workout energy boost" (2) | 200 | 2 (1×503) | — | 5833 ms | Pre-Workout Energy Berry Oats Shake: P 37,05 · C 95,8 · G 4,93 · 580 kcal · validado |
| 30 | p14 | "high protein, vanilla" (2) | 200 | 1 | — | 4032 ms | Vanilla Berry Recovery Shake: P 44,5 · C 44 · G 2,6 · 380 kcal · validado |
| 31 | p15 | "smoothie de chocolate com pasta de amendoim" (2) | 200 | 1 | — | 4322 ms | Smoothie Proteico de Chocolate e Amendoim: P 40,3 · C 26,6 · G 17,6 · 427 kcal · validado |
| 32 | p16 | "strawberry" (2) | 200 | 1 | limite do copo ×1 | 7377 ms | Strawberry Spinach Lean Protein Smoothie: P 32,3 · C 10,5 · G 1,3 · 186 kcal · validado |

O número de novas tentativas é o da última tentativa do item. As novas tentativas de tentativas que terminaram em 503 entram no total do [resumo](#resumo), não nesta coluna.

### Pantry Scanner

| # | Conta | Foto (itens rotulados) | Status | Tentativas | Novas tentativas | Tempo | Receitas |
|---|---|---|---|---|---|---|---|
| 33 | p02 | S01: banana, morango, leite integral, aveia, pasta de amendoim | 200 | 1 | — | 6651 ms | **0** (geração com 503) |
| 34 | p03 | S02: espinafre, banana, leite de amêndoas, chia, manga congelada | 422 `scanner/blender-limit-unmet` | 1 | limite do copo ×2 | 12734 ms | — |
| 35 | p11 | S03: café cold brew, cacau, whey baunilha, leite integral, banana | 422 `scanner/dietary-restriction-unmet` | 1 | dieta ×2 | 11934 ms | — |
| 36 | p05 | S04: iogurte grego, mirtilo, mel, aveia, framboesa | 200 | 1 | — | 7407 ms | Blueberry Oat Smoothie (P 18,2 · 234 kcal); Raspberry Oat Energy Blend (P 18,2 · 229 kcal) |
| 37 | p08 | S05: frutas vermelhas congeladas, leite de aveia, proteína de ervilha, pasta de amendoim | 200 | 1 | — | 9349 ms | **0** (geração com 503) |
| 38 | p10 | S06: manga, abacaxi, leite de coco, espinafre, limão | 200 | 1 | — | 6514 ms | **0** (sem falha no log) |
| 39 | p12 | S07: maçã, couve, pepino, gengibre, limão-siciliano, iogurte natural | 200 | 1 | — | 6804 ms | **0** (geração com 503) |
| 40 | p15 | S08: abacate, cacau, banana, tâmara, leite de amêndoas | 503 `scanner/vision-unavailable` | 2 (2×503) | — | 4557 ms | — |
| 41 | p06 | S09: leite integral, whey chocolate, pasta de amendoim, aveia, canela | 200 | 1 | — | 21677 ms | **0** (geração com 503) |
| 42 | p07 | S10: morango, kiwi, suco de laranja, iogurte natural | 200 | 1 | — | 7893 ms | Strawberry Yogurt Rush (P 5,2 · 158 kcal); Kiwi Citrus Glow (P 5,8 · 168 kcal) |

Os ingredientes que a visão detectou e as `analysisNotes` estão em `response.data` de cada item, inclusive nos que vieram com 0 receitas.

Desfecho das novas tentativas no Pantry, segundo o log:
- **Item 34:** as 2 novas tentativas por limite do copo voltaram com receita inválida e foram descartadas (`blender limit retry returned an invalid recipe, discarding`).
- **Item 35:** as 2 novas tentativas por dieta voltaram com receita inválida e foram descartadas (`recipe restriction retry returned an invalid recipe, discarding`).

## Lote 2: só Pantry (itens 43–52)

**Como foi:**
- **Contas:** 10 novas (`audit-pNNb-<run>@test.blendi.local`), com os mesmos perfis do Pantry do lote 1. O campo `account.sameProfileAs` aponta a conta original.
- **Fotos e regras:** as mesmas do lote 1.
- **Regra nova de repetição:** além do 503, a API também era chamada de novo, uma vez, quando a resposta vinha **200 com `recipes` vazio e o log mostrava falha na geração**. Esses casos estão marcados com `attempts[0].retriedBecause = "200-recipes-empty-generation-failed"`.

**Resultado:**

| | Lote 2 |
|---|---|
| Itens | 10 |
| Status final | 9 × 200, 1 × 422 `scanner/dietary-restriction-unmet` |
| Tentativas | 17 |
| Repetidos | 7: 6 por 200 vazio com falha na geração, 1 por 503 da visão |
| 200 sem receitas | **7** |
| Scans com receitas | **2** (3 receitas) |
| Novas tentativas | dieta ×2, limite do copo ×1 |

| # | Conta | Foto | 1ª tentativa | 2ª tentativa | Receitas |
|---|---|---|---|---|---|
| 43 | p02b | S01 | 200 vazio, geração falhou (503) | 422 `scanner/dietary-restriction-unmet` (dieta ×2; as 2 novas tentativas voltaram inválidas) | — |
| 44 | p03b | S02 | 200 vazio, geração falhou (503) | 200 vazio, geração falhou (503) | 0 |
| 45 | p11b | S03 | 200 vazio, geração falhou (503) | 200 vazio, **sem falha no log** | 0 |
| 46 | p05b | S04 | 503 `scanner/vision-unavailable` | 200 | Blueberry Oat Satiety Boost (P 14,9 · C 41,5 · G 3 · 251,6 kcal); Raspberry Oat Light Blend (P 14,9 · C 40,5 · G 3 · 247,6 kcal) |
| 47 | p08b | S05 | 200 vazio, **sem falha no log** | — | 0 |
| 48 | p10b | S06 | 200 vazio, **sem falha no log** | — | 0 |
| 49 | p12b | S07 | 200 vazio, geração falhou (503) | 200 vazio, geração falhou (503) | 0 |
| 50 | p15b | S08 | 200 vazio, **sem falha no log** | — | 0 |
| 51 | p06b | S09 | 200 vazio, geração falhou (503) | 200 com 1 receita (limite do copo ×1; a nova tentativa voltou inválida e 1 das 2 receitas foi descartada) | Vitamina Energética de Aveia e Chocolate (P 43,8 · C 46 · G 12,3 · 483 kcal) |
| 52 | p07b | S10 | 200 vazio, geração falhou (503) | 200 vazio, geração falhou (503) | 0 |

**Pantry nos dois lotes:** 20 scans, 4 com receitas (itens 36, 42, 46 e 51), 7 receitas no total.

## Lote 3: depois do CP-B1 (itens 53–72)

Rodado depois das correções do CP-B1, que atacaram os achados 1 e 2 deste documento ([docs/fixes/cp-b1-confiabilidade-ia-pantry-pulse-ai.md](../docs/fixes/cp-b1-confiabilidade-ia-pantry-pulse-ai.md)):

- falha da IA no Pantry vira 503;
- motivo de cada leitura no log;
- 1 nova tentativa por formato;
- novas tentativas por receita aceitas em objeto ou array;
- prompt pedindo 2 receitas e aceitando 1;
- até 3 tentativas em 503 do Gemini;
- teto de tempo por requisição.

**Como foi:**
- **Contas:** 10 novas (`audit-pNNc-<run>@test.blendi.local`), com os mesmos perfis do Pantry dos lotes 1–2 (`account.sameProfileAs`).
- **Pantry:** 10 scans com as mesmas fotos.
- **Pulse AI:** 10 pedidos, o 1º pedido do lote 1 de cada um desses perfis, com `DELETE /pulse-ai/cache` antes de cada um.
- **Regras:** mesmo ritmo e mesma repetição de 503 depois de 65 s. Sem `AI_FALLBACK_MODEL`.
- **Campos novos no JSON:**
  - em `generation`: `parseReasons`, `invalidFormatRetries`, `recipeRetriesAccepted`/`recipeRetriesDiscarded`, `googleTransientRetries`, `googleRetriesSkipped`, `googleSucceededAfterRetry`, `fallbackUsed`;
  - em cada tentativa: `appTimeoutMs` e `exceededAppTimeout` (timeouts novos do app: 70 s Pulse AI, 100 s Pantry).

**Resultado:**

| | Lotes 1–2 (Pantry) | Lote 3 Pantry | Lote 3 Pulse AI |
|---|---|---|---|
| Itens | 20 | 10 | 10 |
| Status final | 16 × 200, 3 × 422, 1 × 503 | **10 × 200** | **10 × 200** |
| Scans/pedidos com receita | **4** (7 receitas) | **8** (14 receitas) | **10** |
| 200 sem receitas | 12 (maioria por falha escondida da IA) | 2 (`reason: empty`: a IA devolveu `[]`) | — |
| 1ª tentativa com 503 | — | 4 (todas na geração, com a visão já respondida) | 1 |
| Novas tentativas por limite/dieta | descartadas por erro de formato | 2 limite + 1 dieta, todas lidas e dentro da regra (a de dieta, item 57, caiu depois na conferência final do limite do copo) | 4 limite, todas aceitas |
| Nova tentativa por formato | não existia | 3 respostas `invalid-json`: 2 resolvidas, 1 caiu em 503 | — |
| Tempo no cliente (média / máx.) | — | 11,8 s / 23,4 s | 7,2 s / 11,6 s |
| Passou do timeout novo do app | — | 0 (100 s) | 0 (70 s) |

- **503 do Gemini:** 33 repetições dentro da mesma chamada. 18 chamadas deram certo depois de repetir. Nenhuma repetição foi pulada por falta de tempo.
- **Timeout antigo de 10 s:** 8 das 14 tentativas do Pantry e 1 das 11 do Pulse AI teriam dado "tempo esgotado" no app.
- **Os 5 primeiros 503** (4 do Pantry, 1 do Pulse AI) esgotaram as 3 tentativas com `high demand`. Responderam 503 com o scan ou a mensagem devolvidos, e todos deram certo na repetição depois de 65 s. Antes do CP-B1, os 4 do Pantry teriam virado "200 sem receitas" (achado 1).

**Pantry**

| # | Conta | Foto | 1ª tentativa | 2ª tentativa | Receitas |
|---|---|---|---|---|---|
| 53 | p02c | S01 | 200 com 2 receitas — formato ×1 (ok), 503 do Gemini repetido ×3; 18,4 s | — | Vitamina Cremosa de Banana e Aveia (P 10,9 · C 57,5 · G 10,4 · 366,8 kcal); Smoothie Antioxidante de Morango e Aveia (P 6,9 · C 29,5 · G 6,3 · 204,7 kcal) |
| 54 | p03c | S02 | 200 com 1 receita (a IA mandou 2; uma com `steps.1.pulseCount` inválido, descartada na leitura) — limite do copo ×1, 503 do Gemini repetido ×2; 13,5 s | — | Mini Green Mango Power Blend (P 2,3 · C 18,4 · G 2,3 · 92,5 kcal) |
| 55 | p11c | S03 | 200 vazio (`reason: empty`); 5,3 s | — | 0 |
| 56 | p05c | S04 | 503 `scanner/vision-unavailable` (geração: 3 tentativas com 503) | 200 com 2 receitas — 503 do Gemini repetido ×3; 13,6 s | Berry Oat Weight Loss Blend (P 18,3 · C 24,3 · G 2,3 · 192,3 kcal); Raspberry Yogurt Fiber Shield (P 17,8 · C 22,1 · G 2 · 173,2 kcal) |
| 57 | p08c | S05 | 503 `scanner/vision-unavailable` (geração voltou JSON inválido; a nova tentativa por formato levou 503 nas 3 tentativas) | 200 com 1 receita — formato ×1 (ok), dieta ×1 (lida e dentro da dieta, mas descartada na conferência final do limite do copo), 503 do Gemini repetido ×4; 23,4 s | Vitamina Energética de Frutas Vermelhas e Aveia (P 24,5 · C 42,1 · G 4,1 · 298,5 kcal) |
| 58 | p10c | S06 | 200 vazio (`reason: empty`) — 503 do Gemini repetido ×1; 6,2 s | — | 0 |
| 59 | p12c | S07 | 503 `scanner/vision-unavailable` (geração: 3 tentativas com 503) | 200 com 2 receitas — 503 do Gemini repetido ×1; 9,8 s | Smoothie Verde Detox Refrescante (P 5,4 · C 24,2 · G 0,5 · 118 kcal); Vitamina Antioxidante de Maçã e Iogurte (P 6,8 · C 29,5 · G 0,6 · 145 kcal) |
| 60 | p15c | S08 | 503 `scanner/vision-unavailable` (geração: 3 tentativas com 503) | 200 com 2 receitas; 5,3 s | Vitamina Cremosa de Cacau e Banana (P 3,7 · C 52,8 · G 3,9 · 251 kcal); Smoothie Proteico de Abacate e Cacau (P 3,2 · C 33,7 · G 14,8 · 269 kcal) |
| 61 | p06c | S09 | 200 com 2 receitas — limite do copo ×1; 6,5 s | — | Vitamina Proteica de Aveia e Chocolate (P 41,2 · C 47,5 · G 13,3 · 486,3 kcal); Shake Energético de Aveia e Canela (P 35,8 · C 44,4 · G 12,6 · 435,8 kcal) |
| 62 | p07c | S10 | 200 com 2 receitas — 503 do Gemini repetido ×1; 7,9 s | — | Strawberry Kiwi Refresher (P 2,5 · C 44,5 · G 0,9 · 178 kcal); Creamy Kiwi Yogurt Boost (P 5,4 · C 33,2 · G 2,1 · 158 kcal) |

**Pulse AI**

| # | Conta | Pedido | 1ª tentativa | 2ª tentativa | Receitas |
|---|---|---|---|---|---|
| 63 | p02c | "smoothie de café da manhã com banana e aveia" | 200; 4,1 s | — | Smoothie Energético de Banana e Aveia (P 26,2 · C 53,7 · G 4,9 · 358,5 kcal) |
| 64 | p03c | "green smoothie" | 200 — limite do copo ×1; 5,5 s | — | BLENDi Lite Compact Green Boost (P 10,3 · C 16,8 · G 2,1 · 125 kcal) |
| 65 | p11c | "coffee smoothie" | 200 — limite do copo ×1, 503 do Gemini repetido ×2; 11,6 s | — | Compact Coffee Muscle Shake (P 29,1 · C 32,1 · G 3,1 · 274 kcal) |
| 66 | p05c | "I want to lose weight, something filling" | 200 — limite do copo ×1; 6,9 s | — | Berry Spinach Lean Shake (P 12,7 · C 17,2 · G 0,8 · 128 kcal) |
| 67 | p08c | "smoothie verde" | 503 `pulseai/ai-unavailable` (3 tentativas com 503) | 200; 4,6 s | Smoothie Verde Energético (P 33,3 · C 66,5 · G 6,1 · 460 kcal) |
| 68 | p10c | "quero emagrecer, algo que dê saciedade" | 200 — 503 do Gemini repetido ×1; 8,6 s | — | Shake Verde Proteico Saciedade (P 39,7 · C 11 · G 2,1 · 221,7 kcal) |
| 69 | p12c | "algo leve pra tarde" | 200 — 503 do Gemini repetido ×1; 7,3 s | — | Smoothie Verde Refrescante (P 27 · C 9,35 · G 0,81 · 154 kcal) |
| 70 | p15c | "quero emagrecer, algo que dê saciedade" | 200; 5,0 s | — | Shake Verde Saciedade Extrema (P 37,6 · C 33,7 · G 5 · 333 kcal) |
| 71 | p06c | "shake pós-treino" | 200 — limite do copo ×1, 503 do Gemini repetido ×1; 8,6 s | — | Shake Pós-Treino Compacto (P 38 · C 59,5 · G 3,9 · 420,3 kcal) |
| 72 | p07c | "breakfast smoothie with banana and oats" | 200 — 503 do Gemini repetido ×1; 7,6 s | — | Oat and Banana Wellness Breakfast Shake (P 28,5 · C 58,2 · G 3,8 · 382 kcal) |

**Pantry nos três lotes:** 30 scans, 12 com receitas (21 receitas). Antes do CP-B1: 4 de 20; depois: 8 de 10.

## Achados de execução (registrados nos lotes 1–2; achados 1 e 2 corrigidos no CP-B1)

### Achado 1: Pantry responde 200 sem receitas quando a geração falha no provedor

Nos itens 33, 37, 39 e 41, a visão funcionou e detectou os ingredientes. A chamada de **geração das receitas** levou 503 do Gemini (`high demand`). O log mostra `[aiProvider] request failed` e depois `[pantryScanner] recipe generation failed`.

A API respondeu **200 com `recipes: []`** e `scansUsed` devolvido, em vez de 503 `scanner/vision-unavailable`.

Como a resposta foi 200, a regra do lote ("503: esperar e repetir uma vez") não se aplicou. Esses itens não foram repetidos, para não contornar o roteiro sem decisão. É a principal razão de o Pantry ter rendido só 2 scans com receitas.

No código, `generatePantryRecipes` captura o erro da chamada principal e devolve uma lista vazia. Com `recipes.length === 0`, o controller cai em `sendNoRecipesGenerated`, que responde 200.

No lote 2, o mesmo comportamento apareceu em 9 das 17 tentativas: 7 primeiras tentativas e 2 repetições. Só 1 dos 6 itens repetidos por esse motivo voltou com receita (item 51).

**Corrigido no CP-B1:** falha do provedor na geração responde `503 scanner/vision-unavailable`, com o scan devolvido. No lote 3, os 4 casos responderam assim.

### Achado 2: 0 receitas sem nenhuma falha no log (itens 38, 47, 48, 50 e 2ª tentativa do 45)

Nesses casos, a visão e a geração completaram sem erro no log (1 chamada de cada), mas nenhuma receita sobrou. Também não há log de descarte.

**Causa provável, pelo código:** `parsePantryRecipes` ([pantryScanner.controller.ts:271](../apps/api/src/controllers/pantryScanner.controller.ts#L271)) devolve `[]` **sem logar nada** quando a resposta da geração não é JSON válido ou não bate com o schema (lista de receitas, direta ou dentro de `{ recipes }`). Com a lista vazia, o fluxo cai no mesmo 200 sem receitas do achado 1.

O mesmo tipo de descarte aparece nas novas tentativas: "retry returned an invalid recipe, discarding", nos itens 34, 35, 43 e 51.

A resposta bruta do Gemini não é logada, então o arquivo não mostra o que veio. Também não há nova tentativa por JSON inválido no Pantry, diferente do Pulse AI.

**Corrigido no CP-B1:** foram duas causas.
- **Leitura da geração:** cada leitura registra o motivo (`ok`, `invalid-json`, `invalid-schema` com o caminho do erro, `empty`), e JSON ou schema inválido ganha 1 nova tentativa.
- **Novas tentativas por receita:** o descarte das novas tentativas ("retry returned an invalid recipe") vinha de um bug de formato. O system prompt do Pantry pede array, e a resposta só era lida como objeto. Agora a resposta em array também é aceita.

No lote 3, os dois scans sem receita foram `reason: empty`: a IA devolveu `[]` de propósito.

### Achado 3: gêmeas p05/p16

- **1º pedido** ("I want to lose weight, something filling"): as duas contas receberam a mesma receita. Título, proteína, carboidrato, gordura e kcal são iguais (itens 5 e 16), e as duas vieram com `fromCache: false`. A chave do cache inclui o usuário.
- **2º pedido** ("strawberry"): as receitas diferem. O item 21 repete o título do 1º turno da p05, e o item 32 é "Strawberry Spinach Lean Protein Smoothie", com uma nova tentativa por limite do copo.

## Limpeza

- `DELETE /users/me` nas 16 contas do lote 1 e nas 10 do lote 2, todas com 200. A conferência abaixo foi feita ao fim de cada lote.
- No Mongo:
  - 0 contas `audit-*`;
  - 0 documentos com o `userId` delas em qualquer coleção (todas as coleções do banco `test` foram varridas);
  - 0 `locked_previews` delas.
- API local desligada.
- O arquivo de estado do roteiro (com tokens) foi apagado. O roteiro, as fotos e o log bruto ficaram no scratchpad da sessão, fora do repositório.
- **Lote 3:** `DELETE /users/me` nas 10 contas, todas com 200. A conferência no Mongo deu 0 contas `audit-*`, 0 documentos ligados e 0 `locked_previews`.
- O código do repositório não foi alterado nos lotes 1–2 (o lote 3 rodou depois das mudanças do CP-B1). Mudaram só:
  - a pasta `.audit/`, que não é versionada;
  - uma linha no `.git/info/exclude`;
  - este documento.

## Limitações

- **Pantry:** nos lotes 1–2, só 4 dos 20 scans trouxeram receitas (7 receitas), por causa dos achados 1 e 2. O lote 3, depois do CP-B1, trouxe 8 de 10 (14 receitas). A amostra do Pantry é pequena para analisar qualidade. Durante os dois lotes, o Gemini de dev estava com sobrecarga frequente (`high demand`).
- **Pulse AI:** 3 dos 32 pedidos ficaram sem receita: 2 terminaram em 503 depois de repetir, e o item 1 foi barrado (422 `pulseai/blender-limit-unmet`).
- **Fotos sintéticas**, com desenhos simples e rótulos legíveis. A visão leu os rótulos, mas não há como medir aqui o que ela faria com uma foto real.
- **2º pedido de cada conta:** leva o 1º turno como histórico, então não é independente do 1º.
- **Nova tentativa por JSON inválido:** só pode ser inferida (a API não loga o motivo). Neste lote não houve chamada a mais sem motivo.
