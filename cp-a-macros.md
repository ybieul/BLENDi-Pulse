# CP-A — Relatório de Implementação: Correção de dados e fórmula de macros

**Data:** 2026-10-14
**Base:** `diagnostico-macros.md` (idade/sexo sempre fixos, ajuste calórico amarrado ao objetivo errado, nenhum recálculo pós-onboarding)
**Escopo implementado:** as 6 tarefas do prompt — schema/modelo, correção da fórmula, recálculo centralizado em `updateMe`, matriz de testes numéricos, teste de integração real, achados fora do escopo.
**Método:** cada tarefa foi lida e analisada contra o código real antes de implementar, implementada, e validada com testes reais sempre que tecnicamente possível — `tsc --noEmit` em todo passo, mais uma matriz numérica e um teste de integração contra o servidor rodando de verdade (não só leitura de código).

---

## Tarefa 1 — Schema (Zod) e modelo (Mongoose)

**O que foi feito:** adicionados `birthDate`, `biologicalSex`, `weightGoal` como campos obrigatórios em `calculateMacrosSchema`, `updateUserSchema` e no modelo Mongoose do usuário — mais um 4º campo, `activityLevel`, que não estava na lista original do prompt mas se mostrou necessário (ver "Desvio 1" abaixo).

**Como foi feito:**
- `packages/shared/src/schemas/user.ts:24-25` — `biologicalSexValues = ['male', 'female']`, `weightGoalValues = ['lose', 'maintain', 'gain']`.
- `packages/shared/src/schemas/user.ts:26-42` (aprox.) — `birthDateSchema`, usando `z.string().date().transform()`, **não** `z.date()`/`z.coerce.date()`. Testei os três manualmente contra o zod 3.24.1 instalado antes de decidir: `z.date()` exige um objeto `Date` já desserializado (nunca chega assim via JSON — quebraria todo request HTTP real); `z.coerce.date()` aceita `null`/`boolean`/`number` e os converte silenciosamente em datas bogus (`null` → 1970-01-01, sem erro nenhum) e usa a string hardcoded `"Invalid date"` em vez de uma chave i18n pra string malformada — violaria a regra do próprio arquivo ("Mensagens de erro são CHAVES de i18n"). A abordagem escolhida rejeita corretamente `null`/boolean/number/string vazia/datetime completo/datas impossíveis (ex.: `2024-02-30`), sempre com chave i18n.
- `calculateMacrosSchema` e `updateUserSchema` — adicionados `birthDate`, `biologicalSex`, `weightGoal`, `activityLevel` (este último movido de um enum inline duplicado pra uma constante `activityLevelValues` compartilhada). Confirmei que `weight`/`height` já existiam em `updateUserSchema` — nenhuma mudança necessária aí.
- `apps/api/src/models/User.ts` — tipos `BiologicalSex`, `WeightGoal`, `ActivityLevel` (linhas 11-13); campos correspondentes em `IUser` e no schema Mongoose, todos `required: [true, 'errors.validation.required']`, sem `default`.
- Rebuildei `packages/shared` (`npm run build`) — o pacote resolve via `dist/`, não `src/`.

**Validação real:** `tsc --noEmit` limpo nos três pacotes (`packages/shared`, `apps/api`, `apps/mobile`) depois de cada rodada de mudança.

**Desvio 1 (confirmado com você antes de implementar):** `activityLevel` nunca tinha sido persistido no modelo — só existia como input transitório de `calculateMacrosSchema`, descartado depois do onboarding. Isso bloqueava a Tarefa 3: um PATCH só com `weightGoal` não teria de onde ler o nível de atividade atual. Você confirmou persistir `activityLevel` como campo obrigatório também, mesmo tratamento sem fallback dos outros 3.

**Desvio 2 (confirmado com você antes de implementar):** tornar os 4 campos obrigatórios sem fallback quebra `POST /auth/register` (`apps/api/src/controllers/auth.controller.ts:98-108`) e `POST /auth/google` (`apps/api/src/controllers/google.controller.ts:178`) imediatamente — nenhum dos dois envia esses campos hoje. Você confirmou que sim, mesmo assim, já que a tela que os coletaria é outro CP. Detalhado na Tarefa 6.

---

## Tarefa 2 — Fórmula real em `calculateMacros`

**O que foi feito:** `ASSUMED_AGE` removido. Idade real derivada de `birthDate` + data do servidor. Constante de sexo bifurcada. Ajuste calórico migrado de `goal` para `weightGoal`.

**Como foi feito:**
- Criei `apps/api/src/utils/macroCalculation.utils.ts` — único lugar que contém a fórmula agora. Exporta `calculateAge(birthDate, now)` e `calculateMacroTargets(input, now)`.
- `calculateAge`: `age = now.getUTCFullYear() - birthDate.getUTCFullYear()`, decrementado em 1 se o aniversário deste ano ainda não chegou (mês/dia em UTC, evita qualquer sensibilidade ao timezone do processo Node).
- `basalMetabolism` agora usa `biologicalSex === 'male' ? 5 : -161` em vez do `ASSUMED_AGE`/`+5` fixos.
- Novo `WEIGHT_GOAL_CALORIE_ADJUSTMENTS = { lose: -500, maintain: 0, gain: 300 }`, indexado por `weightGoal`. `PROTEIN_MULTIPLIERS` continua indexado por `goal`, intocado.
- `apps/api/src/controllers/user.controller.ts` — `calculateMacros` agora só faz a conversão de unidade (inalterada) e chama `calculateMacroTargets()`; removido o `roundToOneDecimal` órfão (seu único uso era ali).
- Nada mais foi tocado: multiplicador de atividade, % de gordura (30%), carboidrato por resto — byte-a-byte iguais a antes.

**Validação real:** smoke test via `tsx` importando a função real (não uma cópia) — caso idêntico ao diagnóstico original (homem, 30 anos exatos, 70kg/175cm, `moderatelyActive`, `Wellness`, `maintain`) reproduziu exatamente `dailyCalorieTarget=2556, dailyProteinTarget=112, dailyCarbTarget=335`; o mesmo caso para uma mulher real de 45 anos retornou `dailyCalorieTarget=2182` — confirma que a correção de sexo/idade está mudando o resultado na direção certa, sem quebrar o que já estava certo. `tsc --noEmit` limpo.

---

## Tarefa 3 — Recálculo centralizado em `updateMe`

**O que foi feito:** `apps/api/src/controllers/user.controller.ts:759-918` (`updateMe`) agora recalcula e regrava `dailyProteinTarget`/`dailyCalorieTarget`/`dailyCarbTarget` sempre que `weight`, `height`, `activityLevel`, `weightGoal`, `birthDate` ou `biologicalSex` vierem no body do PATCH, em qualquer combinação.

**Como foi feito:**
- `shouldRecalculateMacroTargets` (linhas 811-823) — `true` se qualquer um dos 6 campos-gatilho vier no body. `goal` deliberadamente não é gatilho (só afeta proteína — ver Tarefa 6).
- Se algum gatilho disparar, busco o usuário atual (`findById`) e faço merge `campoNovo ?? currentUser.campoAtual` para os 7 insumos do cálculo (inclusive `goal`, que não é gatilho mas ainda é insumo da proteína) — assim um PATCH só com `{ weightGoal: 'lose' }` recalcula corretamente usando peso/altura/atividade/sexo/idade/goal já salvos.
- Se `weight`/`height` ainda forem `undefined` depois do merge (perfil sem dados corporais), pulo o recálculo e só aplico os campos que vieram no body — decisão minha, documentada no código e aqui, necessária porque `weight`/`height` continuam opcionais.
- O valor recalculado sobrescreve qualquer `dailyProteinTarget`/`dailyCalorieTarget`/`dailyCarbTarget` manual enviado no mesmo body — a precedência pedida no prompt, aplicada depois da montagem inicial do objeto `updates`.
- Resposta do endpoint passou a incluir `weightGoal`, `activityLevel`, `birthDate`, `biologicalSex` — mesma convenção já usada no arquivo (todo campo aceito no PATCH também é devolvido).

**Validação real:** ver Tarefa 5 — a validação de verdade desta tarefa é o teste de integração contra o servidor rodando, não só `tsc`.

---

## Tarefa 4 — Matriz de testes numéricos

**O que foi feito:** script isolado (`/private/tmp/.../scratchpad/tarefa4_matriz_numerica.ts`, fora do repositório, nada alterado no projeto), importando `calculateAge`/`calculateMacroTargets` reais via `tsx`.

**Cobertura:**
- 4 datas de nascimento reais: `1990-05-20` (aniversário já passou, idade 36), `1990-12-25` (ainda não chegou, idade 35), `2000-10-14` (é hoje, idade 26), `1965-02-28` (já passou, idade 61) — verificadas à mão antes de rodar.
- 2 sexos × 3 `weightGoal` × 2 combinações de peso/altura (70kg/175cm/moderatelyActive/Wellness e 58kg/162cm/veryActive/Muscle) = **48 combinações**.
- Cada caso comparado contra uma fórmula de referência implementada de forma **independente** no mesmo script — inclusive um algoritmo de idade diferente do real (conta meses totais e divide por 12, em vez de diferença de anos com decremento condicional).

**Resultado: 48/48 passaram, 0 falhas.**

**Teste dedicado de idade ao longo do tempo:** mesmo `birthDate` (1996-06-15), chamado com `now=2026-10-14` (idade 30, `dailyCalorieTarget=1979`) e `now=2027-10-14` (idade 31, `dailyCalorieTarget=1973`) — a idade avançou exatamente 1 ano e a meta caiu de acordo, sem nenhum valor de idade lido/escrito em lugar nenhum — só os dois argumentos (`birthDate`, `now`) da função pura mudaram entre as chamadas.

---

## Tarefa 5 — Teste de integração real

**O que foi feito:** subi o servidor de dev (`npm run dev`, porta 3000, conectado ao MongoDB Atlas `test` real) e rodei um script (`/private/tmp/.../scratchpad/tarefa5_integracao_real.ts`) que cria 1 conta de teste descartável direto via Mongoose (contornando `POST /auth/register`, quebrado de propósito — ver Tarefa 6), gera um access token do mesmo jeito que `generateAccessToken` já faz em `auth.controller.ts`, e faz chamadas HTTP reais contra o servidor.

### (a) POST /users/calculate-macros

Request: `{ weight: 80, height: 180, birthDate: '1986-10-10', biologicalSex: 'male', activityLevel: 'sedentary', goal: 'Wellness', weightGoal: 'lose', unitSystem: 'metric' }`.

Calculado à mão (idade 40 — aniversário 10/out já passou em 14/out/2026): BMR=10×80+6,25×180−5×40+5=1730; TDEE=round(1730×1,2)=2076; calorias=round(2076−500)=1576; proteína=round(80×1,6)=128; gordura=1576×0,3=472,8; carbo=round((1576−512−472,8)/4)=148; IMC=round(80/1,8²,1 casa)=24,7 (normal).

**Resposta real da API:** `{ imc: 24.7, imcUnit: 'kg/m²', imcClassification: 'normal', dailyCalorieTarget: 1576, dailyProteinTarget: 128, dailyCarbTarget: 148, tdee: 2076 }` — **idêntica**, campo a campo, ao cálculo manual.

### (b) PATCH /users/me — recálculo automático

| Passo | Body do PATCH | Antes (protein/cal/carb) | Depois (protein/cal/carb) |
|---|---|---|---|
| Estado inicial (seed da conta de teste) | — | — | 100 / 2000 / 200 |
| b.1 — só `weight` (70→90) | `{ weight: 90 }` | 100 / 2000 / 200 | 144 / 2183 / 238 |
| b.2 — só `activityLevel` (sedentary→veryActive) | `{ activityLevel: 'veryActive' }` | 144 / 2183 / 238 | 144 / 3137 / 405 |
| b.3 — só `weightGoal` (maintain→gain) | `{ weightGoal: 'gain' }` | 144 / 3137 / 405 | 144 / 3437 / 457 |
| b.4 — **os 3 juntos** (`weight`, `activityLevel`, `weightGoal`) | `{ weight: 100, activityLevel: 'lightlyActive', weightGoal: 'lose' }` | 144 / 3437 / 457 | **160 / 2138 / 214** |

Verifiquei b.2 e b.3 à mão além do script (reproduzido no relatório para auditoria):
- b.2: BMR=10×90+6,25×175−5×36+5=1818,75; TDEE(veryActive=1,725)=round(1818,75×1,725)=3137; calorias=3137+0(maintain)=3137; proteína=round(90×1,6)=144; carbo=round((3137−576−941,1)/4)=405. **Bate exatamente com a resposta real.**
- b.3: mesmo BMR/TDEE de b.2; calorias=round(3137+300)=3437; carbo=round((3437−576−1031,1)/4)=457. **Bate exatamente.**
- b.4 (combinado): BMR=10×100+6,25×175−5×36+5=1918,75 (idade 36, inalterada); TDEE(lightlyActive=1,375)=round(1918,75×1,375)=2638; calorias=round(2638−500)=2138; proteína=round(100×1,6)=160; carbo=round((2138−640−641,4)/4)=214. **Bate exatamente, campo a campo, com a resposta real da API.**

Cada passo confirma: as 3 metas mudam sozinhas a cada PATCH, **sem nenhuma chamada a `/users/calculate-macros`** — exatamente o cenário que `diagnostico-macros.md` (Tarefa 8) provou estar quebrado.

### (c) PATCH sem campo-gatilho — não recalcula

`PATCH { preferredLanguage: 'pt-BR' }` depois do passo b.4: antes `160 / 2138 / 214`, depois `160 / 2138 / 214` — **idêntico**. Confirma que um campo fora da lista de gatilhos não dispara recálculo nenhum.

### Conta de teste

Criada como `macro-integration-test-<timestamp>@blendi-test.dev`. **Removida ao final do script** (`deletedCount: 1`) — confirmado de forma independente logo depois, com uma segunda consulta (`UserModel.countDocuments({ email: /@blendi-test\.dev$/ })` → `0` remanescentes). O servidor de dev que subi para o teste foi encerrado ao final; não toquei em nenhum outro processo de dev já rodando na máquina.

---

## Tarefa 6 — Achados fora do escopo

1. **`POST /auth/register` e `POST /auth/google` estão quebrados a partir de agora** (`auth.controller.ts:98-108`, `google.controller.ts:178`) — `UserModel.create()` não envia `birthDate`/`biologicalSex`/`weightGoal`/`activityLevel`, agora obrigatórios sem fallback. Toda tentativa de criar conta nova por esses dois caminhos vai falhar com `ValidationError` do Mongoose até um CP futuro (onboarding/perfil mobile) coletar esses dados. **Confirmado e aceito por você antes de implementar a Tarefa 1** — registrando aqui formalmente, como pedido.
2. **`POST /users/calculate-macros` também quebrou para o único caller real hoje.** `OnboardingBodyScreen.tsx` (mobile, fora do escopo deste CP) envia `{ weight, height, activityLevel, goal, unitSystem }` — sem `birthDate`/`biologicalSex`/`weightGoal`. Com o schema agora exigindo os 3, **a etapa de onboarding que faz exatamente o cálculo que este CP corrigiu vai começar a falhar com 400** assim que esta mudança for publicada, até a tela mobile (outro CP) passar a enviá-los. Isso não tinha sido mencionado explicitamente no prompt — acho que vale sua atenção antes de publicar, já que é o fluxo mais visível do app.
3. **Trocar só `goal` (sem nenhum gatilho) ainda deixa `dailyProteinTarget` desatualizado.** `goal` alimenta `PROTEIN_MULTIPLIERS` mas não é gatilho de recálculo, por decisão explícita do prompt ("Só o ajuste calórico migra de goal para o novo weightGoal"). Documentando a consequência: se um usuário só editar `goal` via `PATCH /users/me { goal: 'Muscle' }`, a proteína continua calculada com o multiplicador do `goal` antigo até outro campo-gatilho disparar um recálculo.
4. **Um PATCH de recálculo pode falhar com pesos/objetivos extremos.** Os limites de `dailyProteinTarget` (10–400g) e `dailyCalorieTarget` (500–10.000kcal) no Mongoose são herdados do sistema original, não deste CP — mas agora que o valor é recalculado automaticamente (não só digitado manualmente por um usuário razoável), um caso como `weight=300` (limite legal do próprio schema) + `goal='Recovery'` (2,2 g/kg) produz `dailyProteinTarget=660g`, acima do máximo de 400g. Nesse cenário, o `findByIdAndUpdate` com `runValidators: true` rejeitaria a atualização inteira (inclusive os outros campos do mesmo PATCH) com uma `ValidationError` não tratada especificamente — cai no `catch` genérico (`next(err)`). Não implementei nenhum tratamento pra isso (não foi pedido), só registrando o caso.
5. **`z.string().date()` rejeita datetime completo.** Se algum client (ou um teste futuro) enviar `birthDate` como `"1990-05-15T00:00:00.000Z"` em vez de `"1990-05-15"`, a validação falha com `errors.validation.invalid_option` — intencional (ver Tarefa 1), mas vale documentar pra quem for construir a tela de edição.
6. Os achados já listados no diagnóstico original e explicitamente fora do escopo deste CP (`dailyFatTarget` morto, nível "extremamente ativo" ausente, falta de guardrail em edição manual de protein/calories, `unitSystem` imperial morto no backend, constante `POUNDS_PER_KILOGRAM` duplicada, `GOAL_CONFIG` hardcoded do onboarding mobile) continuam exatamente como estavam — não foram tocados, conforme pedido.

---

## Resumo

Todas as 6 tarefas implementadas e validadas. `tsc --noEmit` limpo em `packages/shared`, `apps/api` e `apps/mobile`. Matriz de 48 casos numéricos: 0 falhas. Teste de integração real contra o servidor: 6/6 verificações passaram (1 cálculo direto + 4 recálculos isolados/combinado + 1 confirmação de não-recálculo), com números before/depois reportados e 3 deles conferidos à mão linha a linha. Nenhum build, `eas`, commit ou deploy foi executado. Conta de teste criada e removida, confirmada com 0 remanescentes.

**Atenção antes de publicar:** os achados 1 e 2 da Tarefa 6 significam que, no estado atual, **nem o registro de conta nem o onboarding de corpo funcionam mais** até o próximo CP (mobile) alimentar os campos novos. Isso foi uma decisão sua, explícita, tomada antes da implementação — só reforçando aqui porque afeta o fluxo principal do app, não só casos de borda.
