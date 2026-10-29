# CP-AUDIT.8 — Correção dos achados da Tarefa 4 (CP-AUDIT.7)

**Escopo:** correção dos 4 achados de documentação + 1 inconsistência de código listados no relatório da CP-AUDIT.7 (`cp-audit.7-documentacao-inventario-endpoints-architecture.md`). Os achados #5 (gemini-costs.md) e #6 (README.md) do mesmo relatório foram decididos junto com o usuário antes de implementar; o #6 foi pulado por decisão explícita.
**Método:** mesmo de sempre — cada afirmação nova confirmada contra o código real antes de escrever.

---

## Tarefa A — `docs/api/endpoints.md`, `POST /users/calculate-macros`

Removida a frase de "idade fixa 30". Adicionados `birthDate`/`biologicalSex`/`weightGoal` (obrigatórios) e `targetWeight` (opcional) à tabela de request — confirmados em `calculateMacrosSchema`. Adicionados `dailyFatTarget` e a nota condicional de `weightTargetEta` à resposta. Corrigida também a lista de `activityLevel` (faltava `extremelyActive`).

## Tarefa B — `docs/api/endpoints.md`, `GET /users/me`

Reescrito o exemplo de resposta com todos os campos reais de `getMe` (`apps/api/src/controllers/user.controller.ts:190-267`, lido até o fim da função desta vez): `weightGoal`, `weight`, `height`, `targetWeight`, `activityLevel`, `birthDate`, `biologicalSex`, `hasRealBodyProfile`, `hasProfilePhoto`, `profilePhotoUpdatedAt`, `pushToken`, `notificationPreferences` (shape confirmado via `normalizeNotificationPreferences`/`DEFAULT_NOTIFICATION_PREFERENCES`), `dailyPulseTime` (shape confirmado via `normalizeDailyPulseTime`/`DEFAULT_DAILY_PULSE_TIME`), `dailyFatTarget`, os 4 campos de assinatura + `revenueCatCustomerId`, `totalXP`, `lastLevelUp`, `currentLevel`, `levelProgress`.

## Tarefa C — `docs/api/endpoints.md`, `POST /auth/login`

Confirmei lendo a função `login` completa (`auth.controller.ts:193-264`) que a resposta real já é idêntica à de `register`. Atualizado o exemplo para incluir `unitSystem`/`dailyCarbTarget`/`dailyFatTarget`/`longestStreak`, com uma nota explícita de que as duas rotas compartilham a mesma forma de objeto.

## Tarefa D — `packages/shared/src/schemas/auth.ts` (código)

Decisão do usuário: unificar. `registerSchema.dailyProteinTarget`/`dailyCalorieTarget` agora importam e reusam as mesmas constantes de `updateUserSchema` (`DAILY_PROTEIN_TARGET_VALIDATION_MIN/MAX`, `DAILY_CALORIE_TARGET_MIN/MAX`, de `./user.ts`) em vez de números duplicados e mais estreitos. Sem import circular (confirmado: `user.ts` não importa de `auth.ts`). Verificação: nenhum teste exercitava os limites antigos; `pnpm typecheck` limpo em `packages/shared`, `apps/api` e `apps/mobile`; suíte de testes do backend (`pnpm test` em `apps/api`) com 39/39 passando.

## Tarefa D2 — `docs/api/endpoints.md`, `POST /auth/register` (consequência de D)

Tabela de request atualizada: `dailyProteinTarget` e `dailyCalorieTarget` agora documentam as novas faixas reais (10-800 / 300-15000).

## Tarefa E — `docs/api/endpoints.md`, `PATCH /users/me` (independente de D)

Corrigidas as faixas já existentes de `updateUserSchema` que o doc ainda documentava com os números antigos: `dailyProteinTarget` (10-800), `dailyCarbTarget` (0-1500), `dailyCalorieTarget` (300-15000).

## Tarefa F — `docs/gemini-costs.md`

Decisão do usuário: pesquisar o preço atual antes de escrever (achado adicional durante o planejamento — o modelo recomendado no doc, `gemini-2.5-flash-lite`, estava desatualizado frente ao `.env.example`, que indica esse modelo descontinuado e `gemini-3.5-flash-lite` como o validado hoje).

- Pesquisei o preço oficial atual (`ai.google.dev/gemini-api/docs/pricing`, página atualizada por Google em 2026-10-27): input $0,30/1M tokens, output $2,50/1M tokens (inclui thinking), cache de contexto $0,03/1M + $1,00/1M/hora de armazenamento. Imagem/vídeo é cobrado na mesma taxa do texto (sem tarifa de visão separada).
- Atualizado o modelo recomendado e todas as tabelas/cálculos existentes (medidos novamente com as novas taxas, mesmos tokens de entrada/saída já medidos antes).
- Adicionada a seção "Pantry Scanner (Vision) cost", cobrindo o pipeline real de 2 chamadas: (1) detecção de ingredientes (chamada de visão, sempre acontece, sem cache, sem retry) — estimativa concreta usando o prompt real medido (~520 tokens) + estimativa de tokens de imagem (regra de tiles documentada pelo Google, ~1032 tokens para uma foto redimensionada a 1024px) + teto real de saída (`DEFAULT_VISION_MAX_TOKENS = 1000`); (2) geração de receitas (chamada de texto, só quando há ingrediente utilizável, com até 4 chamadas extras de guardrail) — descrita qualitativamente com os tetos reais do código (`PANTRY_RECIPE_MAX_TOKENS = 7000`, retries de 2000 cada), sem fabricar uma tabela de pior caso de falsa precisão dado o número de combinações possíveis.
- Corrigida também uma frase que ficou estruturalmente incorreta ao adicionar a seção de visão: "No multimodal image... input" — era verdade só para o caminho do Pulse AI chat, não mais para o app como um todo.
- Corrigidos links relativos markdown que já estavam quebrados no arquivo original (apontavam para `apps/...` sem o prefixo `../`, incorreto a partir de `docs/`).

## Tarefa G — pulada (decisão do usuário)

`docs/README.md` ("External Services Status"/"Open Questions") não foi tocado — fica só registrado no relatório da CP-AUDIT.7.

---

## Status do controle de versão

Alterados nesta correção:
- `docs/api/endpoints.md`
- `docs/gemini-costs.md`
- `packages/shared/src/schemas/auth.ts` (único arquivo de código alterado, por decisão explícita do usuário na Tarefa D)
- `docs/fixes/cp-audit.8-correcao-achados-tarefa4.md` (este relatório)

Verificação: `pnpm typecheck` limpo em `packages/shared`/`apps/api`/`apps/mobile`; `pnpm test` em `apps/api` com 39/39 testes passando.
