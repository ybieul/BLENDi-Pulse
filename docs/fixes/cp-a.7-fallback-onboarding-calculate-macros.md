# CP-A.7 — Correção temporária: liberar o onboarding mobile no cálculo de macros

**Data:** 2026-10-20
**Base:** [cp-a.6-calculatemacrosschema-e-teste-real-google.md](cp-a.6-calculatemacrosschema-e-teste-real-google.md) (achado vivo hoje: `POST /users/calculate-macros` rejeita com 400 o payload exato que `OnboardingBodyScreen.tsx` envia).
**Escopo:** só o fallback descrito abaixo, dentro de `calculateMacros` (`apps/api/src/controllers/user.controller.ts`). Nenhuma tela, campo ou arquivo do app mobile foi alterado — isso é CP-B, fora de escopo. Nenhum outro campo de `calculateMacrosSchema` teve seu comportamento alterado. Nenhuma documentação pré-existente (CP-A.3, CP-A.4, CP-A.5, CP-A.6, consolidado) foi tocada.
**Método:** subi o servidor de dev (`pnpm --filter @blendi/shared build` + `pnpm dev` em `apps/api`, porta 3000) conectado ao MongoDB Atlas real (banco `test`). Antes de escrever o script de teste, fiz uma chamada manual via `curl` a `POST /auth/register` só para confirmar os campos obrigatórios de `registerSchema` — essa chamada criou uma conta descartável (`cp-a7-verify-macros-1792541187@test.blendi.local`) que não fazia parte do teste real e foi esquecida na primeira limpeza. Ela só foi detectada porque a verificação independente (seção 2.4) rodou em processo separado, sem reaproveitar nenhum estado do script principal, e reportou 1 remanescente em vez de 0 — removida manualmente e reconfirmado 0 depois. O script de teste real (`cpa7-verify-fallback-tmp.ts`, criado em `apps/api/`, fora de `src/`) criou e removeu sua própria conta (`cp-a7-verify-macros-<timestamp>@test.blendi.local`). Ao final, servidor de dev encerrado (`lsof -i :3000` vazio) e todos os scripts temporários (`cpa7-verify-fallback-tmp.ts`, `cpa7-cleanup-verify-tmp.ts`, `cpa7-find-leftover-tmp.ts`, `cpa7-delete-leftover-tmp.ts`) apagados.
Uma segunda passada de revisão (depois da primeira versão deste documento) apontou 2 citações de linha/atribuição imprecisas (corrigidas nas seções 1.2 e 1.3) e 1 lacuna real de cobertura — o caso misto nunca tinha sido testado (corrigido na seção 2.5, nova). Pra fechar essa lacuna, o servidor de dev foi religado (mesmo comando, mesma porta, mesmo banco) e um novo script temporário (`cpa7-mixed-case-tmp.ts`, também fora de `src/`) criou e removeu sua própria conta (`cp-a7-verify-mixed-<timestamp>@test.blendi.local`), com confirmação independente de limpeza em processo separado (`cpa7-mixed-cleanup-verify-tmp.ts`). Ambos apagados ao final, servidor encerrado de novo. `git status` confirmado idêntico ao estado inicial desta conversa, nas duas passadas, mudando só `apps/api/src/controllers/user.controller.ts` (já modificado antes desta tarefa) e os arquivos novos de documentação.

---

## Tarefa 1 — fallback para `birthDate`/`biologicalSex`/`weightGoal`

### 1.1 — Como o endpoint acessa o usuário autenticado

`req.user`, populado pelo middleware `authenticate`, contém **só o payload do JWT** — não o perfil. Citação literal (`apps/api/src/middlewares/authenticate.ts:8-9`):

```ts
// Após executado com sucesso, `req.user` contém o payload decodificado:
//   { sub: userId, email, iat, exp }
```

Confirmado pelo próprio corpo do middleware (`authenticate.ts:32-33`): `const payload = verifyAccessToken(token); req.user = payload;` — nunca um `UserModel.findById()`. O padrão já usado em outros handlers do mesmo controller para obter o perfil (ex.: `getMe`, `user.controller.ts:191-197`, e `getWeightHistory`, `user.controller.ts:1050-1057`) é buscar por `req.user.sub` via `UserModel.findById(userId).select({...}).lean()`. Era, portanto, necessário buscar o usuário no banco antes de montar o fallback — reaproveitando esse mesmo padrão.

### 1.2 — Fallback implementado

Código final, citação literal (`apps/api/src/controllers/user.controller.ts:1083-1140` — até o fechamento do `if (!parsed.success) {...}`; o restante da função, inalterado por esta tarefa, está elidido abaixo):

```ts
export async function calculateMacros(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Stopgap até o CP-B coletar birthDate/biologicalSex/weightGoal numa
    // tela própria do onboarding mobile (ver
    // docs/fixes/cp-a.7-fallback-onboarding-calculate-macros.md). Hoje
    // OnboardingBodyScreen não envia esses 3 campos, e os 3 são obrigatórios
    // em calculateMacrosSchema — sem este fallback, toda chamada real do
    // mobile recebe 400. Um valor realmente enviado no corpo (mesmo
    // diferente do salvo) sempre prevalece; o perfil salvo só entra quando o
    // campo vem undefined.
    const needsProfileFallback =
      req.body?.birthDate === undefined ||
      req.body?.biologicalSex === undefined ||
      req.body?.weightGoal === undefined;

    let body: unknown = req.body;

    if (needsProfileFallback) {
      const userId = req.user?.sub;
      if (!userId) {
        sendUnauthorized(res);
        return;
      }

      const user = await UserModel.findById(userId)
        .select({ birthDate: 1, biologicalSex: 1, weightGoal: 1 })
        .lean();

      if (!user) {
        sendErrorResponse(res, {
          statusCode: 404,
          code: 'resource/not-found',
          message: 'User not found.',
        });
        return;
      }

      body = {
        ...req.body,
        birthDate:
          req.body?.birthDate !== undefined
            ? req.body.birthDate
            : user.birthDate.toISOString().slice(0, 10),
        biologicalSex:
          req.body?.biologicalSex !== undefined ? req.body.biologicalSex : user.biologicalSex,
        weightGoal: req.body?.weightGoal !== undefined ? req.body.weightGoal : user.weightGoal,
      };
    }

    const parsed = calculateMacrosSchema.safeParse(body);
    if (!parsed.success) {
      sendValidationError(res, parsed.error);
      return;
    }
    // ... resto da função (cálculo) inalterado
```

Pontos confirmados por leitura literal do próprio código:

- **Checagem é por campo, estritamente `undefined`** (`!== undefined` / `=== undefined`, nunca `??` nem checagem de falsy) — exatamente como pedido: um valor enviado (mesmo diferente do salvo) nunca é sobrescrito, e um campo omitido (ausente no JSON, chega como `undefined`) é que aciona o fallback.
- **Só os 3 campos citados são tocados.** `weight`, `height`, `targetWeight`, `activityLevel`, `goal` e `unitSystem` continuam exatamente como chegaram em `req.body` — o spread `...req.body` preserva tudo, e só `birthDate`/`biologicalSex`/`weightGoal` são sobrescritos condicionalmente.
- **Busca ao banco é condicional** (`if (needsProfileFallback)`) — se o corpo já trouxer os 3 campos (caso futuro do CP-B, ou os testes da Tarefa 2.2 abaixo), nenhuma consulta ao `UserModel` é feita e o comportamento é idêntico ao pré-CP-A.7, byte a byte.

**Formato — `birthDate` Date → string, confirmado por teste real:** o documento Mongoose guarda `birthDate` como `Date` (`apps/api/src/models/User.ts:602-604`: `birthDate: { type: Date, required: [true, 'errors.validation.required'], ... }`), enquanto `calculateMacrosSchema.birthDate` (via `birthDateSchema`, `packages/shared/src/schemas/user.ts:116-129`) espera uma `string` no formato `YYYY-MM-DD` (`.date()` do Zod) antes de transformar em `Date` internamente. A serialização usada, `user.birthDate.toISOString().slice(0, 10)`, segue o mesmo padrão já estabelecido em 4 outros pontos do backend/mobile para chaves de data (`apps/api/src/controllers/hydration.controller.ts:137`, `blendLog.controller.ts:143`, `supplementLog.controller.ts:106`, `apps/mobile/src/screens/TrackScreen.tsx:92`). A prova de que o formato está correto **não é suposição** — vem do Teste A da Tarefa 2.1 abaixo: se a serialização estivesse errada (ex.: formato inválido, ou um offset de fuso jogando a data para o dia seguinte/anterior e estourando a faixa de idade plausível de `birthDateSchema`, 13-120 anos), a resposta real teria sido `400` com erro em `birthDate` — e a resposta real foi `200`, com os valores de idade/sexo corretos refletidos no BMR calculado (ver 2.1).

### 1.3 — Nenhuma escrita no banco

O enunciado desta tarefa já descreve este endpoint, de forma geral, como "o endpoint que só calcula macros sem salvar o perfil" — essa frase é do próprio enunciado, não uma citação do CP-A.6 (busquei `"stateless"` e `"salvar o perfil"` no arquivo real de `cp-a.6-calculatemacrosschema-e-teste-real-google.md`: zero ocorrências das duas). O comentário entre aspas que de fato é citação literal de código é outro: *"calculateMacros é stateless — não lê o perfil do usuário"*, que estava em `user.controller.ts` antes desta correção (lido diretamente do arquivo, não do CP-A.6). A única chamada ao `UserModel` adicionada por esta tarefa é `UserModel.findById(userId).select({...}).lean()` — uma leitura (`findById` + `.lean()`, sem `.save()`/`.create()`/`.findByIdAndUpdate()`/`.updateOne()` em nenhum ponto da função). Confirmado também pela leitura da função completa (`user.controller.ts:1083-1182`, incluindo a parte não citada acima): depois do `safeParse`, o resto do corpo só faz cálculo em memória (`calculateMacroTargets`, `calculateWeightTargetEta`) e `res.status(200).json(...)` — nenhuma chamada de escrita existe na função, antes ou depois desta correção. Isso é confirmado experimentalmente na Tarefa 2.3 abaixo (perfil salvo idêntico antes e depois das duas chamadas de teste).

Como o comentário antigo ("stateless — não lê o perfil do usuário") ficaria impreciso com o fallback condicional, foi atualizado para refletir que a leitura (quando ocorre) nunca afeta a previsão de prazo de peso (`weightTargetEta`, que continua dependendo só de `targetWeight` vir no payload) — não é uma mudança de comportamento, só a correção de uma afirmação que deixaria de ser verdadeira.

**Typecheck:** `pnpm --filter @blendi/shared build` + `pnpm --filter @blendi/api typecheck` → limpo, sem erros, depois desta alteração.

---

## Tarefa 2 — Testes reais

### 2.1 — Payload exato do mobile, sem os 3 campos → 200

Conta de teste real criada via `POST /auth/register` (fluxo completo, placeholders do CP-A.4 aplicados na criação). Perfil salvo imediatamente após o registro, lido direto do banco:

```
BEFORE_PROFILE: {"weightGoal":"maintain","birthDate":"1996-10-20T23:08:28.423Z","biologicalSex":"male"}
```

Requisição real, reproduzindo **byte a byte** o payload citado em CP-A.6 (`OnboardingBodyScreen.tsx:146-155`):

```
POST /users/calculate-macros
Authorization: Bearer <token real>
{"weight":70,"height":175,"activityLevel":"moderatelyActive","goal":"Wellness","unitSystem":"metric"}
```

Resposta real:

```
HTTP_STATUS: 200
{"success":true,"data":{"imc":22.9,"imcUnit":"kg/m²","imcClassification":"normal",
 "dailyCalorieTarget":2556,"dailyProteinTarget":112,"dailyCarbTarget":335,
 "dailyFatTarget":85,"bmr":1649,"tdee":2556}}
```

**Confirmado — 200, não mais 400.** Os valores batem com os placeholders salvos usados como fallback: idade derivada de `birthDate` (`1996-10-20` → 30 anos completos na data do teste, 2026-10-20/21), `biologicalSex: 'male'` (constante de sexo +5 na fórmula de BMR, `apps/api/src/utils/macroCalculation.utils.ts:170`) e `weightGoal: 'maintain'` (sem ajuste calórico). Conferência manual da fórmula (`macroCalculation.utils.ts:171-173`): `bmr = 10×70 + 6.25×175 − 5×30 + 5 = 1648.75` → arredondado `1649` (bate); `tdee = round(1648.75 × 1.55) = 2556` (bate, `moderatelyActive` = multiplicador 1.55); `dailyCalorieTarget = tdee + 0 (maintain) = 2556` (bate). Os 3 valores de fallback (idade, sexo, goal) estão todos refletidos corretamente no cálculo real.

### 2.2 — Segunda requisição com os 3 campos explícitos e diferentes dos salvos

Mesma conta, mesmo `weight`/`height`/`activityLevel`/`goal`/`unitSystem`, agora enviando `birthDate`/`biologicalSex`/`weightGoal` reais e deliberadamente diferentes dos placeholders (`male`/`maintain`/~30 anos):

```
POST /users/calculate-macros
Authorization: Bearer <token real>
{"weight":70,"height":175,"activityLevel":"moderatelyActive","goal":"Wellness","unitSystem":"metric",
 "birthDate":"2000-05-15","biologicalSex":"female","weightGoal":"lose"}
```

Resposta real:

```
HTTP_STATUS: 200
{"success":true,"data":{"imc":22.9,"imcUnit":"kg/m²","imcClassification":"normal",
 "dailyCalorieTarget":1829,"dailyProteinTarget":112,"dailyCarbTarget":208,
 "dailyFatTarget":61,"bmr":1503,"tdee":2329}}
```

**Confirmado — usou os valores enviados, não os salvos.** `imc` idêntico ao Teste A (22.9, correto — `imc` só depende de `weight`/`height`, inalterados), mas `bmr`/`tdee`/`dailyCalorieTarget` mudaram exatamente como a fórmula prevê para os novos valores: idade 26 (`2000-05-15` → aniversário já passado em 2026), `biologicalSex: 'female'` (constante −161) e `weightGoal: 'lose'` (déficit calórico). Conferência manual: `bmr = 700 + 1093.75 − 130 − 161 = 1502.75` → `1503` (bate); `tdee = round(1502.75 × 1.55) = 2329` (bate); `dailyCalorieTarget = 2329 − 500 = 1829` (bate, déficit de "lose" = 500 kcal, mesma constante de `WEIGHT_GOAL_CALORIE_ADJUSTMENTS` já validada em CPs anteriores desta linha). Se o fallback tivesse se sobreposto indevidamente aos valores enviados, o resultado teria sido idêntico ao Teste A — não foi.

### 2.3 — Perfil salvo inalterado depois das duas chamadas

Documento da conta de teste, lido direto do banco **depois** das duas chamadas acima:

```
AFTER_PROFILE: {"weightGoal":"maintain","birthDate":"1996-10-20T23:08:28.423Z","biologicalSex":"male"}
PROFILE_UNCHANGED: true
```

Idêntico, campo a campo, ao `BEFORE_PROFILE` da 2.1 — nenhuma das duas chamadas a `calculate-macros` (nem a que usou o fallback, nem a que enviou valores explícitos diferentes) escreveu qualquer coisa no documento do usuário. Consistente com a leitura de código da Tarefa 1.3: a função só lê (`findById().lean()`), nunca escreve.

### 2.4 — Limpeza e confirmação independente

Conta de teste principal removida dentro do próprio script (`DELETE_RESULT: {"acknowledged":true,"deletedCount":1}`). Confirmação independente, em **processo separado** (sem reaproveitar nenhuma variável/conexão do script de teste): a primeira rodada reportou `REMAINING_CPA7_ACCOUNTS: 1` — não 0. Investigação imediata (consulta extra, mesmo processo independente) identificou a causa: a conta criada pela chamada manual de `curl` usada em 1.1/1.2 para inspecionar `registerSchema` (`cp-a7-verify-macros-1792541187@test.blendi.local`), nunca removida porque não fazia parte do script de teste. Removida manualmente (`DELETE_RESULT: {"acknowledged":true,"deletedCount":1}`), e a mesma verificação independente, rodada de novo em outro processo, confirmou:

```
REMAINING_CPA7_ACCOUNTS: 0
```

Scripts temporários (`cpa7-verify-fallback-tmp.ts`, `cpa7-cleanup-verify-tmp.ts`, `cpa7-find-leftover-tmp.ts`, `cpa7-delete-leftover-tmp.ts`) apagados. Servidor de dev encerrado (`lsof -i :3000` vazio). `git status` final:

```
 M apps/api/src/controllers/auth.controller.ts
 M apps/api/src/controllers/google.controller.ts
 M apps/api/src/controllers/user.controller.ts
 M apps/api/src/models/User.ts
 M apps/api/src/routes/users.ts
 M docs/README.md
 M packages/shared/src/schemas/user.ts
?? apps/api/src/utils/accountDefaults.utils.ts
?? apps/api/src/utils/macroCalculation.utils.ts
?? cp-a-macros.md
?? cp-a1-macros.md
?? diagnostico-macros.md
?? docs/fixes/
```

Idêntico ao estado inicial desta conversa — a única mudança de código real é a já citada em `apps/api/src/controllers/user.controller.ts` (arquivo que já estava listado como modificado antes desta tarefa, por trabalho anterior da linha CP-A); nenhum arquivo temporário remanescente.

### 2.5 — Caso misto: só `weightGoal` enviado, `birthDate`/`biologicalSex` ausentes

Os testes 2.1 e 2.2 cobrem só os dois extremos (os 3 campos ausentes, ou os 3 presentes). Para fechar a lacuna, uma nova conta de teste real (`cp-a7-verify-mixed-<timestamp>@test.blendi.local`, mesmo fluxo de registro) foi usada em duas chamadas:

**Baseline** — réplica do Teste A (2.1), os 3 campos ausentes:

```
POST /users/calculate-macros
{"weight":70,"height":175,"activityLevel":"moderatelyActive","goal":"Wellness","unitSystem":"metric"}

HTTP_STATUS: 200
{"success":true,"data":{"imc":22.9,"dailyCalorieTarget":2556,"dailyProteinTarget":112,
 "dailyCarbTarget":335,"dailyFatTarget":85,"bmr":1649,"tdee":2556}}
```

**Caso misto** — mesma conta, só `weightGoal` enviado explicitamente (`'gain'`, diferente do salvo `'maintain'`); `birthDate` e `biologicalSex` continuam ausentes:

```
POST /users/calculate-macros
{"weight":70,"height":175,"activityLevel":"moderatelyActive","goal":"Wellness","unitSystem":"metric",
 "weightGoal":"gain"}

HTTP_STATUS: 200
{"success":true,"data":{"imc":22.9,"dailyCalorieTarget":2856,"dailyProteinTarget":112,
 "dailyCarbTarget":388,"dailyFatTarget":95,"bmr":1649,"tdee":2556}}
```

**Confirmado — os dois ternários independentes se comportam corretamente ao mesmo tempo, na mesma requisição.** `bmr`/`tdee` do caso misto (`1649`/`2556`) são **idênticos** ao baseline — prova de que `birthDate`/`biologicalSex`, ausentes nos dois, caíram no mesmo fallback (perfil salvo: `male`, ~30 anos) nas duas chamadas. `dailyCalorieTarget` subiu de `2556` para `2856` — exatamente `+300`, a constante de `WEIGHT_GOAL_CALORIE_ADJUSTMENTS.gain` (`apps/api/src/utils/macroCalculation.utils.ts:33-37`) — prova de que o `weightGoal: 'gain'` enviado explicitamente prevaleceu sobre o `'maintain'` salvo, mesmo com os outros 2 campos vindo do fallback na mesma chamada. Perfil lido direto do banco depois das duas chamadas continua idêntico ao de antes (`PROFILE_UNCHANGED: true`). Conta de teste removida ao final; confirmação independente, em processo separado, de 0 remanescentes (`REMAINING_CPA7_MIXED_ACCOUNTS: 0`).

---

## Veredito

| Critério de aceite | Resultado |
|---|---|
| Payload real do mobile (sem `birthDate`/`biologicalSex`/`weightGoal`) passa a retornar 200 | **Confirmado** — Teste A (2.1), `HTTP_STATUS: 200`, macros calculadas a partir do perfil salvo (fallback), valores conferidos manualmente contra a fórmula real |
| Envio com os 3 campos preenchidos continua usando os valores enviados, não os salvos | **Confirmado** — Teste B (2.2), `HTTP_STATUS: 200`, `bmr`/`tdee`/`dailyCalorieTarget` mudaram exatamente como a fórmula prevê para os novos valores, diferentes do fallback |
| Perfil salvo do usuário não é alterado por nenhuma chamada a este endpoint | **Confirmado** — 2.3, documento idêntico antes/depois das duas chamadas |
| Conta de teste removida, 0 remanescentes por consulta independente | **Confirmado** — 2.4, após corrigir um descuido de limpeza (conta de uma chamada manual de inspeção do schema, fora do script de teste) detectado justamente pela própria verificação independente |
| Caso misto (só 1 dos 3 campos enviado, os outros 2 ausentes na mesma requisição) se comporta corretamente | **Confirmado** — 2.5, `HTTP_STATUS: 200`, `bmr`/`tdee` idênticos ao baseline (fallback de `birthDate`/`biologicalSex` aplicado) e `dailyCalorieTarget` refletindo só o `weightGoal` enviado (+300, constante de `gain`) |

---

## Resumo

**O que foi corrigido:** `POST /users/calculate-macros` agora aceita o payload real que o onboarding mobile (`OnboardingBodyScreen.tsx`) envia hoje. Quando `birthDate`, `biologicalSex` ou `weightGoal` não vêm no corpo, o endpoint usa o valor já salvo no perfil do usuário autenticado como fallback — sem gravar nada no documento, e sem nunca sobrescrever um valor que a requisição realmente tenha enviado. O fluxo cadastro → onboarding de corpo deixa de estar estruturalmente quebrado: o usuário agora recebe macros calculadas de verdade (ainda que com idade/sexo/objetivo placeholder, quando o onboarding não os coletou), em vez de cair sempre em "Pular por agora".

**O que continua pendente para o CP-B:** este fallback é um stopgap, não a solução definitiva. Enquanto `OnboardingBodyScreen` não tiver uma tela própria para coletar `birthDate`, `biologicalSex` e `weightGoal` de verdade, todo usuário que passar por esse fluxo terá suas macros calculadas com os placeholders do CP-A.4 (30 anos, `male`, `maintain`) em vez dos seus dados reais — o mesmo tradeoff de precisão já aceito na criação de conta, agora só estendido para não quebrar o cálculo também. O CP-B precisa construir essa coleta real no onboarding mobile; nenhuma tela, campo ou lógica de UI foi tocada por esta tarefa.
