# CP-B1 — Confiabilidade e disponibilidade da IA (Pantry Scanner e Pulse AI)

**Contexto:** a auditoria de receitas da IA de 2026-11-16 ([relatório](../../Claude-outputs/auditoria-receitas-ia-2026-11-16.md); dados em `.audit/receitas-ia-2026-11-16.json`, fora do git) mostrou dois problemas:

- o **Pantry Scanner entregou receita em só 4 de 20 scans**;
- o **Gemini de dev deu 503** ("This model is currently experiencing high demand") em 14 de 53 tentativas do Pulse AI.

As causas foram conferidas no código antes da correção:

1. **Falha da IA virava "sem receitas".** No Pantry, `generatePantryRecipes` capturava a exceção da chamada de geração e devolvia lista vazia. O controller respondia `200` com `recipes: []`, e o app dizia "não conseguimos montar receitas com esses ingredientes" quando a IA estava fora. No Pulse AI, a mesma falha já respondia `503`.
2. **Resposta inválida sumia sem log.** `parsePantryRecipes` devolvia `[]` sem log e sem nova tentativa quando a resposta não era JSON válido ou não batia com o schema. Além disso, o prompt mandava devolver array vazio se não desse para fazer **exatamente 2** receitas, e o schema exigia exatamente 2. Uma receita boa se perdia porque a outra não saía.
3. **A nova tentativa por receita nunca funcionava** (bug; na auditoria, 7 de 7 descartadas). O system prompt do Pantry exige um array JSON. A nova tentativa injetava uma receita como turno da IA e pedia a correção. A mensagem de dieta chega a pedir *"a single JSON object"*. A resposta era lida por um parser que só aceitava objeto, então quando a IA seguia o system prompt e respondia em array, a receita era descartada. **Reproduzido em teste:** o teste novo, rodado contra o controller anterior, entrega só a receita que não precisou de nova tentativa.
4. **Sobrecarga do Gemini:** só havia 1 nova tentativa em 503, depois de 1 s.
5. **Timeout do app:** o axios do app tem timeout global de 10 s, e o Pulse AI e o Pantry usavam esse valor. Na auditoria, vários pedidos levaram de 10 a 25 s. No app, isso dava "tempo esgotado" na tela enquanto o servidor seguia: concluía, descontava uso/scan, dava XP e gravava a conversa.

A qualidade do conteúdo das receitas (regras do prompt) fica para o CP-B2. Aqui o prompt só mudou na contagem de receitas do Pantry e no formato pedido na nova tentativa.

**Resultado:**

- typecheck e lint limpos nos 3 workspaces;
- API **764 → 792** testes, mobile **848 → 854**, todos passando;
- no teste ao vivo, o Pantry entregou receita em **8 de 10** scans, contra 4 de 20 na auditoria.

---

## Tarefa 1 — Pantry: falha do provedor é "IA indisponível"

- Qualquer exceção da chamada de geração (inclusive da nova tentativa por formato, Tarefa 2) responde `503 scanner/vision-unavailable`. É o código que o app já traduz como "temporariamente indisponível".
  - No fluxo normal, o scan é devolvido (`scanCount − 1`), sem XP e sem progresso de missão.
  - Na prévia bloqueada (CP-1.1.4b), a prévia do ciclo é devolvida.
- `generatePantryRecipes` agora devolve `{ kind: 'aiUnavailable' }` ou `{ kind: 'generated', … }`, e o controller decide a resposta pelo `kind`.
- Geração que respondeu e não sobrou receita por motivo legítimo continua com as respostas de hoje:
  - todas descartadas por dieta/gelo → `422 scanner/dietary-restriction-unmet`;
  - todas descartadas pelo limite físico → `422 scanner/blender-limit-unmet`;
  - array vazio devolvido pela IA → `200` sem receitas.
- O envio do 503 foi centralizado em `sendPantryAiUnavailable` (constante `AI_UNAVAILABLE_CODE`). É usado pela falha da visão, pela falha da geração e por "todas perdidas porque a nova tentativa falhou no provedor" (CP-1.1.9).
- O log de falha da geração não traz mais o `userId`.

## Tarefa 2 — Pantry: resposta inválida ou vazia

**Motivo do resultado.** `parsePantryRecipes` devolve um destes resultados:

| `reason` | Quando | O que acontece |
|---|---|---|
| `ok` | pelo menos 1 receita válida | segue para as conferências (limite, macros, dieta) |
| `invalid-json` | `JSON.parse` falhou | 1 nova tentativa |
| `invalid-schema` | nenhuma receita válida, formato desconhecido ou mais de 2 receitas | 1 nova tentativa |
| `empty` | a IA devolveu `[]` (ou `{ "recipes": [] }`) | `200` sem receitas, scan devolvido (como hoje) |

**Log** (`[pantryScanner] recipe generation parsed` ou `… parsed with issues`):

- campos: `attempt`, `reason`, `responseLength`, `recipeCount`/`invalidCount` (quando `ok`) e `issuePath`;
- `issuePath` é o caminho e o código do 1º erro do Zod, como `1.macros (invalid_type)` ou `root (too_big)`;
- nunca registra o conteúdo da resposta, da receita ou dados do usuário (há teste para isso).

**Nova tentativa por formato.** Segue o mesmo padrão do Pulse AI: a conversa original mais `INVALID_JSON_RETRY_INSTRUCTION` como turno do usuário, uma vez.

- A instrução saiu de `pulseAi.controller.ts` para [aiResponseRetry.utils.ts](../../apps/api/src/utils/aiResponseRetry.utils.ts) e os dois controllers a importam.
- Se continuar inválida, o Pantry responde como IA indisponível (Tarefa 1). O Pulse AI continua com `500 pulseai/invalid-ai-response`, como antes.

**Receita por receita.** Cada item do array é validado sozinho. Se uma receita vem fora do schema e a outra está boa, a boa é entregue sem nova tentativa, e a descartada fica no log (`invalidCount`, `issuePath`). Formatos aceitos:

- o array direto (formato do prompt);
- o envelope `{ "recipes": [...] }`;
- uma receita solta em objeto.

**Prompt: pedir 2 e aceitar 1.** Por decisão do Gabriel, as três menções de "exatamente 2" do Pantry foram ajustadas, só na contagem ([promptBuilder.service.ts](../../apps/api/src/services/promptBuilder.service.ts)). Nenhuma outra regra mudou.

| Onde | Antes | Depois |
|---|---|---|
| Comportamento | `Generate exactly 2 distinct blend or smoothie recipes.` | `Generate 2 distinct blend or smoothie recipes. If the available ingredients only allow 1 valid recipe, generate 1.` |
| Sem dieta | `If you cannot produce exactly 2 valid recipes using only the available ingredients, return an empty JSON array.` | `If you can produce only 1 valid recipe using only the available ingredients, return an array with that 1 recipe. Return an empty JSON array only when not even 1 valid recipe can be made.` |
| Com dieta | `Return an empty JSON array only when fewer than 2 distinct recipes can be made from the compliant ingredients alone.` | `If the compliant ingredients only allow 1 valid recipe, return an array with that 1 recipe. Return an empty JSON array only when not even 1 recipe can be made from the compliant ingredients alone.` |
| Formato (modo `recipe-array`, só o Pantry) | `Return exactly ${recipeCount} recipe objects in the array.` | `Return ${recipeCount} recipe objects in the array, or 1 when the available ingredients only allow 1 valid recipe.` |
| Mensagem do usuário | `Generate exactly 2 distinct blend recipes using only the available ingredients list. …` | `Generate 2 distinct blend recipes (or 1 if the available ingredients only allow 1) using only the available ingredients list. …` |

O schema de leitura aceita de 1 a `PANTRY_RECIPE_COUNT` (2) receitas. Os schemas de resposta do `packages/shared` já aceitavam 1, e o app já mostrava 1.

## Tarefa 3 — Pantry: nova tentativa por receita que funciona

**Correção:**

- O pedido de correção (limite do copo, macros e dieta) agora termina com `PANTRY_SINGLE_RECIPE_RETRY_FORMAT_INSTRUCTION`: *"Return only this one corrected recipe, as a JSON array containing exactly 1 recipe object with the same structure."* A conversa é montada por `buildPantryRecipeRetryMessages`.
- O parser `parsePantryRecipe` aceita **objeto ou array com exatamente 1 receita**. Um array de 2 ou mais é descartado com motivo no log (`root (array of 2)`).
- Os descartes da nova tentativa registram `reason`, `responseLength` e `issuePath`, sem conteúdo.

**Por que assim:**

- É a mudança mais simples que funciona nos dois sentidos: a IA pode seguir o system prompt (array) ou a mensagem de dieta (*"a single JSON object"*).
- O texto de `buildRecipeRestrictionRetryMessage` não mudou, porque é compartilhado com o Pulse AI e faz parte das regras de dieta.
- A **nova tentativa de macros** tinha o mesmo bug. Ela não descarta a receita, mas perdia a correção sem log. Recebeu a mesma correção.

**Pulse AI:** não tem o problema. O system prompt pede um objeto, a mensagem de dieta pede um objeto e `parsePulseAiRecipe` lê um objeto. Na auditoria, as novas tentativas do Pulse AI funcionaram.

## Tarefa 4 — Sobrecarga do Gemini

Em [aiProvider.service.ts](../../apps/api/src/services/aiProvider.service.ts), `generateGoogleContent` vale para texto e visão:

| Constante | Valor | Papel |
|---|---|---|
| `GOOGLE_TRANSIENT_MAX_ATTEMPTS` | 3 | tentativas no total no modelo principal |
| `GOOGLE_TRANSIENT_RETRY_BASE_DELAYS_MS` | 1000, 3000 | espera antes da 2ª e da 3ª tentativa |
| `GOOGLE_TRANSIENT_RETRY_JITTER_RATIO` | 0,25 | aleatório de ±25% em cada espera |
| `GOOGLE_TRANSIENT_STATUS_CODES` | 500, 503 | repetidos no mesmo modelo |
| `GOOGLE_FALLBACK_STATUS_CODES` | 429, 500, 503 | levam ao modelo reserva, se houver |
| `AI_MIN_ATTEMPT_BUDGET_MS` | 5000 | uma tentativa (com a espera antes dela) só começa se sobrar pelo menos isto na janela |

**Quais erros e por quê:**

- **503 e 500** são os erros que a documentação do Gemini manda repetir.
- **429** (cota) não é repetido no mesmo modelo. A cota é por minuto/dia e o `retryDelay` que o Google devolve costuma ser de dezenas de segundos, maior que a janela. Como a cota é por modelo, o 429 leva ao modelo reserva.
- **400/404** e outros erros falham na hora.

**Janela de tempo.** Todas as tentativas (e a reserva) usam o mesmo `AbortController` e a mesma janela da chamada:

- texto: 30 s (`AI_PROVIDER_TIMEOUT_MS`);
- visão: 45 s (`VISION_PROVIDER_TIMEOUT_MS`);
- ou menos, se o orçamento da requisição estiver no fim (Tarefa 5).

As novas tentativas não aumentam o tempo máximo de uma chamada.

**Modelo reserva:** `AI_FALLBACK_MODEL` ([env.ts](../../apps/api/src/config/env.ts), [.env.example](../../apps/api/.env.example)).

- É opcional e não tem valor padrão. Não está definido no `.env`; quem escolhe o modelo é o Gabriel.
- Definido e diferente de `AI_MODEL`: depois de esgotar o principal com 429/500/503, faz 1 tentativa no reserva, se ainda couber na janela. A resposta sai com `fromFallback: true` e `model` = o reserva.
- Usa o mesmo provider e a mesma chave do texto. Só vale para `AI_PROVIDER=google` e **não é usado na visão**.
- Ausente: nada muda.

**Logs** (só modelo, número da tentativa, status, espera e tempo restante; nunca prompt nem dado do usuário):

- `[aiProvider] google transient error, retrying`;
- `google retry skipped, not enough time left`;
- `google succeeded after retry`;
- `google primary model unavailable, trying fallback model`.

`aiProviderTiming` (relógio, espera e sorteio) é exportado só para os testes substituírem.

## Tarefa 5 — Teto de tempo por requisição e timeout do app

**Pior caso sem teto** (cada chamada de texto com até 30 s, visão 45 s, já contando as novas tentativas da Tarefa 4 dentro da janela):

| Endpoint | Soma | Pior caso |
|---|---|---|
| `POST /pulse-ai/chat` | geração + formato + limite + macros + dieta = 5 × 30 s | **150 s** |
| `POST /pantry-scanner/analyze` | visão 45 + geração 30 + formato 30 + por receita, em paralelo, limite + macros + dieta 3 × 30 | **195 s** (165 s antes da nova tentativa por formato) |

Os dois passam do limite pedido (~60 s e ~90 s). Por isso entrou um **orçamento total por requisição** no servidor, com fonte única em [aiRequestBudget.ts](../../packages/shared/src/aiRequestBudget.ts):

| Constante | Pulse AI | Pantry |
|---|---|---|
| `AI_REQUEST_BUDGET_MS` (servidor) | 55 s | 85 s |
| `AI_CLIENT_TIMEOUT_MARGIN_MS` (folga do app) | 15 s | 15 s |
| `AI_CLIENT_TIMEOUT_MS` (app) | **70 s** | **100 s** |

**Como funciona** ([aiRequestBudget.service.ts](../../apps/api/src/services/aiRequestBudget.service.ts)):

- O controller abre o orçamento uma vez com `runWithAiRequestBudget`. No Pulse AI isso acontece em volta de `runPulseAiChat`; no Pantry, `analyzePantry` embrulha `analyzePantryWithinBudget`.
- O prazo fica num `AsyncLocalStorage`. Isso evita passar o prazo por todas as funções de nova tentativa, e o `Promise.all` do Pantry mantém o contexto.
- Cada `callAi`/`callVisionAi` usa `min(timeout da chamada, tempo restante)`. Com menos de 5 s restantes, a chamada nem começa e lança.
- Quem chama trata isso como falha do provedor: `503` com uso/scan/prévia devolvidos, pelos caminhos que já existiam. Na nova tentativa de macros, que nunca bloqueia, a receita segue com `macrosValidated: false`.
- Fora de um orçamento (outras rotas, scripts), nada muda.

**App:**

- [pulseAi.service.ts](../../apps/mobile/src/services/pulseAi.service.ts) (`sendMessage`) e [pantryScanner.service.ts](../../apps/mobile/src/services/pantryScanner.service.ts) (`analyzePantry`) passam `{ timeout: AI_CLIENT_TIMEOUT_MS.* }` por requisição.
- A instância compartilhada continua com `DEFAULT_API_TIMEOUT_MS = 10_000` ([api.ts](../../apps/mobile/src/config/api.ts)) para todas as outras rotas.

**Telas em esperas longas** (conferido, nada mudou):

- Pantry: as 3 mensagens de análise trocam a cada 6 s e param na última, e o spinner continua até a resposta.
- Pulse AI: o skeleton fica no fim da lista e o aviso "Isso está demorando mais que o habitual…" aparece depois de 8 s e permanece.

## Tarefa 6 — Testes e verificação

**Testes novos**

- [pantryScanner.reliability.test.ts](../../apps/api/src/controllers/pantryScanner.reliability.test.ts), 13 testes:
  - JSON inválido → nova tentativa no padrão do Pulse AI → sucesso;
  - inválido duas vezes (schema, depois JSON) → `503`, scan devolvido, sem XP, com `issuePath` no log;
  - array vazio → `200` vazio com `reason: 'empty'`, sem nova tentativa;
  - 1 receita válida → `200` com 1;
  - uma válida e outra fora do schema → a válida é entregue;
  - mais de 2 receitas → nova tentativa;
  - a geração roda dentro do orçamento de 85 s;
  - novas tentativas por limite e por dieta respondidas em array e em objeto → aceitas, com o formato pedido na mensagem;
  - nova tentativa com array de 2 → descartada com motivo;
  - nenhum log com título, ingrediente ou texto da receita.
- [aiProvider.service.test.ts](../../apps/api/src/services/aiProvider.service.test.ts), 15 testes. SDK do Google e env mockados; relógio falso.
  - Tentativas: 503 → sucesso na 2ª; 503 três vezes → erro com esperas de 1 s e 3 s; espera aleatória de ±25%; 429 e 400 não repetidos.
  - Modelo reserva:
    - usado e marcado depois de esgotar o principal;
    - 429 vai direto para a reserva;
    - 400 não usa a reserva;
    - reserva não definida → nada muda;
    - a visão nunca usa a reserva.
  - Logs sem prompt.
  - Orçamento:
    - a nova tentativa é pulada sem tempo;
    - a chamada não começa com orçamento esgotado;
    - sem orçamento, vale a janela padrão;
    - a reserva só roda se couber.
- [aiRequestTimeouts.test.ts](../../apps/mobile/src/services/aiRequestTimeouts.test.ts), 6 testes:
  - os timeouts do app passam do teto do servidor;
  - Pulse AI e Pantry usam o timeout próprio;
  - `getUsage` usa o padrão;
  - `ECONNABORTED` no Pantry vira a mensagem de timeout;
  - a instância compartilhada continua com 10 s.

**Bug da Tarefa 3 reproduzido:** os testes "respondida em array" foram rodados contra o controller do commit anterior e falharam (só a receita sem nova tentativa é entregue).

**Testes existentes com expectativa alterada** (comportamento mudado de propósito neste CP):

- `pantryScanner.controller.test.ts` — "falha da IA na geração": de `200` sem receitas para `503 scanner/vision-unavailable`, ainda com scan devolvido e sem XP.
- `pantryScannerPreview.controller.test.ts` — "falha da IA na geração": de `200` sem receitas para `503`, ainda com a prévia devolvida.
- `promptBuilder.service.test.ts` — o texto de "exactly 2" do Pantry virou o texto novo (com e sem dieta).

**Armadilha de teste:** a API roda como CommonJS. `mock.module('@google/generative-ai')` resolve a entrada ESM (`dist/index.mjs`), enquanto o aiProvider carrega a CJS (`dist/index.js`), e o mock não pegava: o teste chamava o Gemini de verdade. O teste mocka o arquivo resolvido por `createRequire(__filename).resolve(...)`.

**Verificação:** `pnpm typecheck` (shared, api, mobile), `pnpm lint` (3 workspaces), API 792/792 e mobile 854/854.

## Teste ao vivo (lote 3 da auditoria)

**Método:** o mesmo da auditoria.

- API local com `NODE_ENV=development`, banco `test` do Atlas e Gemini real (`gemini-3.5-flash-lite`, texto e visão), sem `AI_FALLBACK_MODEL`.
- 10 contas descartáveis `audit-pNNc-…@test.blendi.local`, com os mesmos perfis e as mesmas 10 fotos do Pantry dos lotes 1–2.
- 10 scans do Pantry e 10 pedidos do Pulse AI (o 1º pedido do lote 1 de cada perfil).
- Ritmo de ≥ 6 s entre pedidos e ≤ 14 chamadas de IA por 62 s; 503 repetido uma vez depois de 65 s.
- O roteiro ficou fora do repo.
- Na limpeza ficaram 0 contas `audit-*`, 0 documentos ligados e 0 prévias.
- Os resultados estão no `.audit` como `batch: 3` (itens 53–72), com campos novos em `generation` e em cada tentativa (`appTimeoutMs`, `exceededAppTimeout`).

| | Auditoria (lotes 1–2) | Lote 3 |
|---|---|---|
| Scans do Pantry com receita | 4 de 20 (7 receitas) | **8 de 10 (14 receitas)** |
| Novas tentativas por limite/dieta | 7 de 7 descartadas (Pantry) | **7 de 7 lidas e dentro da regra** (Pantry: 2 limite + 1 dieta; Pulse AI: 4 limite) |
| Pulse AI entregue | — | **10 de 10** |

A nova tentativa por dieta do item 57 foi lida e passou na dieta, mas a receita caiu depois na conferência final do limite do copo (`blender limit exceeded after later retries`). Isso é a regra do CP-1.1.9, não um descarte por formato.

**Motivos de leitura registrados no Pantry:**

- `ok`: 8. Em um deles (item 54), a IA mandou 2 receitas e uma veio com `steps.1.pulseCount` inválido; a leitura receita por receita salvou a outra;
- `empty`: 2 (fotos S03 e S06; a IA devolveu array vazio, e a resposta foi `200` sem receitas com o scan devolvido);
- `invalid-json`: 3. Duas novas tentativas por formato deram certo; a terceira caiu em 503 na própria nova tentativa.

**Sobrecarga:**

- 33 novas tentativas por 503 no Gemini; 18 chamadas deram certo depois delas.
- 4 scans do Pantry e 1 pedido do Pulse AI esgotaram as 3 tentativas. Os 4 do Pantry foram na **geração**, com a visão já respondida. Todos responderam `503` corretamente; antes, esses scans do Pantry virariam "200 sem receitas".
- Todos deram certo na repetição depois de 65 s.

**Tempos no cliente:**

| | Média | Máximo | Passou do timeout novo |
|---|---|---|---|
| Pantry (14 tentativas) | 11,8 s | 23,4 s | nenhuma (100 s) |
| Pulse AI (11 tentativas) | 7,2 s | 11,6 s | nenhuma (70 s) |

Com o timeout antigo de 10 s, 8 das 14 tentativas do Pantry e 1 das 11 do Pulse AI teriam dado "tempo esgotado" no app.

## Fora do escopo (anotado, sem mudar)

- **Pulse AI no app:** `toPulseAiServiceError` não traduz o `ECONNABORTED` (tempo esgotado) para `errors.network.timeout`; mostra o erro genérico. O Pantry já traduz.
- **Log do Pantry:** o log `[pantryScanner] analyze request`, que já existia, ainda registra o `userId`.
- **Qualidade do conteúdo das receitas:** fica para o CP-B2.
