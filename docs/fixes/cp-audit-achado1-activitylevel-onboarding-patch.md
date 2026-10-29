# CP-AUDIT Achado 1 — `activityLevel` nunca chegava ao backend no fim do onboarding real

**Contexto:** achado nº 1 da "Lista priorizada de achados para CP próprio" em [`cp-audit-completo-backend-frontend-documentacao.md`](cp-audit-completo-backend-frontend-documentacao.md) (Tarefa 7/10), que por sua vez reconfirmou de forma independente um gap já documentado desde o [CP-B](cp-b-coleta-birthdate-biologicalsex-weightgoal-onboarding.md) e investigado (sem fix) no [CP-B.1.1](cp-b.1.1-getme-activitylevel-patch.md).

Na tela `OnboardingBodyScreen` (`apps/mobile/src/screens/onboarding/OnboardingBodyScreen.tsx`), o usuário seleciona o `activityLevel`, que é gravado no `onboarding.store` (`apps/mobile/src/store/onboarding.store.ts`), onde já existia desde a interface `OnboardingState`. A tela seguinte, `OnboardingMacrosScreen`, pré-preenche os campos de macro com os valores calculados e, ao finalizar ("Finish setup"), monta o payload do `PATCH /users/me` em `handleFinish` — mas nunca incluía `activityLevel` nesse payload, mesmo ele já estando disponível no mesmo store usado para ler `weight`/`height`/`birthDate`/`biologicalSex`/`weightGoal`.

No backend, `weightGoal` funciona como campo-gatilho de recálculo (`shouldRecalculateMacroTargets`, `apps/api/src/controllers/user.controller.ts:880-887`): a presença dele no PATCH faz o backend recalcular as 3 metas de macro via TDEE, que depende do `activityLevel`. Como esse campo nunca chegava no request, o backend usava o `activityLevel` já salvo no banco (o placeholder de criação de conta) em vez do que o usuário tinha acabado de selecionar — sobrescrevendo silenciosamente os macros revisados/confirmados na tela.

## TAREFA 1 — Ler `activityLevel` do onboarding store

Adicionada, em `OnboardingMacrosScreen.tsx:109`, a leitura `const activityLevel = useOnboardingStore((state) => state.activityLevel);`, imediatamente após `weightGoal` (linha 108), seguindo exatamente o mesmo padrão de seletor individual já usado nas linhas vizinhas (101-108).

## TAREFA 2 — Incluir o campo no payload do PATCH

Adicionada, em `OnboardingMacrosScreen.tsx:187`, a linha `if (activityLevel !== null) payload['activityLevel'] = activityLevel;`, imediatamente após a linha de `weightGoal` (186), seguindo o mesmo padrão condicional dos outros campos de corpo (só inclui a chave quando o valor não é `null`).

A condição que define `completingBodyOnboarding` (linha 194) e o `canSubmit` não foram tocados — continuam dependendo só dos 5 campos originais (`weight`/`height`/`birthDate`/`biologicalSex`/`weightGoal`), por instrução explícita do prompt. `OnboardingBodyScreen.tsx` e `onboarding.store.ts` também não foram alterados — já estavam corretos.

## Testes reais

Executado contra o Atlas real (ambiente `development`, servidor local `tsx watch` apontando para a mesma `MONGODB_URI` do `.env`), 3 contas descartáveis `cp5-activitylevel-*@example.com`, limpas ao final.

1. **Fluxo real de onboarding de corpo.** `PATCH /users/me` com o payload exato que `handleFinish` monta hoje (`weight: 80`, `height: 180`, `birthDate: "1995-05-20"`, `biologicalSex: "male"`, `weightGoal: "lose"`, `activityLevel: "veryActive"`, `completingBodyOnboarding: true`, mais `dailyProteinTarget/dailyCalorieTarget/dailyCarbTarget` simulando os valores que o usuário viu na tela) → resposta recalculou `dailyCalorieTarget: 2562`. Esse valor bate exatamente com o cálculo manual de Mifflin-St Jeor usando `veryActive` (BMR 1775 × 1.725 − 500 = 2562); se o backend tivesse usado o `activityLevel` antigo (`moderatelyActive`, placeholder da conta), o resultado seria 2251. `GET /users/me` independente (não a resposta do PATCH) confirmou os mesmos valores persistidos (`activityLevel: "veryActive"`, `dailyCalorieTarget: 2562`) — prova de que o recálculo usou o valor novo.
2. **Caminho "Pular por agora".** `PATCH /users/me` só com `blendiModel/goal/dailyProteinTarget/dailyCalorieTarget/dailyCarbTarget/unitSystem` (sem nenhum campo de corpo, replicando o payload que a tela já envia nesse caminho) → `activityLevel` permaneceu no placeholder (`moderatelyActive`), nenhum recálculo ocorreu (os 3 macros voltaram exatamente como enviados), `hasRealBodyProfile` continuou `false`. Comportamento idêntico ao de antes do fix.
3. **Isolamento do `completingBodyOnboarding`.** Confirmado por leitura de código que a condição (linha 194) não foi alterada; reconfirmado ao vivo que o backend só ativa `hasRealBodyProfile` quando o sinal booleano é explicitamente enviado — nunca o deriva por conta própria a partir dos campos presentes.
4. **Limpeza.** As 3 contas de teste foram removidas via `UserModel`/coleção `users` e confirmadas em 0 remanescentes por consulta independente (por `_id` e por padrão de e-mail), em processo separado da remoção. `register`/`updateMe` não escrevem em `Conversation`/`AiCache`/`DailyMission`/`XPLog`, então não havia outras coleções a verificar.
5. **Typecheck:** `pnpm --recursive typecheck` → limpo em `@blendi/shared`, `@blendi/api` e `@blendi/mobile`.
6. **Suíte automatizada existente da API** (`pnpm --filter @blendi/api test`): 39/39 passando, sem regressão.

## Tarefa final em aberto — outros campos-gatilho faltando

Verificado se existe algum outro campo-gatilho reconhecido pelo backend (`shouldRecalculateMacroTargets`, `user.controller.ts:880-887`) que o onboarding store possua mas que `handleFinish` não envie. Os 7 gatilhos reconhecidos são `weight`, `height`, `activityLevel`, `weightGoal`, `birthDate`, `biologicalSex` e `goal`. Com este fix, todos os 7 já são enviados: os 6 condicionais de corpo (incluindo o `activityLevel` corrigido aqui) mais `goal`, que já era enviado incondicionalmente. `targetWeight` também é um campo extraído pelo backend, mas não é gatilho de recálculo e nem existe no onboarding store — irrelevante aqui. **Nenhum outro campo-gatilho faltando foi encontrado.**

## Resumo

2 linhas adicionadas em `apps/mobile/src/screens/onboarding/OnboardingMacrosScreen.tsx` (leitura do store + inclusão condicional no payload). Nenhum outro arquivo alterado — `apps/api` e `packages/shared` não foram tocados (o backend já consumia `activityLevel` corretamente desde o commit `cf652dc6`, confirmado no CP-B.1.1; faltava só o mobile enviar o campo). Testado de ponta a ponta contra o Atlas real nos dois caminhos (corpo completo e skip), com prova empírica de que o recálculo agora usa o `activityLevel` selecionado pelo usuário, não o placeholder antigo. Typecheck limpo, suíte automatizada sem regressão, contas de teste limpas e confirmadas.

**Resolve o achado nº 1 da lista priorizada do CP-AUDIT** (`cp-audit-completo-backend-frontend-documentacao.md`) e encerra a pendência documentada desde o CP-B / investigada no CP-B.1.1.
