# CP-A.6 — Fechamento dos 2 gaps abertos pela verificação CP-A.5

**Data:** 2026-10-20
**Base:** [cp-a.5-verificacao-completa-cpa3-cpa4-achados1e9.md](cp-a.5-verificacao-completa-cpa3-cpa4-achados1e9.md) (pontos 1 e 2 sem veredito possível), [cp-a-macros.md](../../cp-a-macros.md) (achado 2 da Tarefa 6).
**Escopo:** só os 2 pontos abaixo. Nenhum arquivo de código-fonte alterado — schema, controller e arquivo mobile foram só lidos. Nenhuma documentação pré-existente (CP-A.3, CP-A.4, CP-A.5, consolidado) foi tocada.
**Método:** subi o servidor de dev (`pnpm --filter @blendi/shared build` + `pnpm dev` em `apps/api`, porta 3000) conectado ao MongoDB Atlas real (banco `test`). Criei 2 contas de teste descartáveis (`cp-a6-verify-macros-<timestamp>@test.blendi.local`, `cp-a6-verify-google-<timestamp>@test.blendi.local`), removidas ao final via `deleteMany` com o padrão de email — confirmado **0 remanescentes** por `countDocuments` independente, rodado num processo separado depois da remoção. Dois scripts temporários (`cpa6-verify-google-tmp.ts`, `cpa6-cleanup-and-verify-tmp.ts`) foram criados em `apps/api/`, fora de `src/`, só para este teste, e apagados ao final — `git status` confirmado idêntico ao estado inicial desta conversa. Servidor de dev encerrado ao final (confirmado por `lsof -i :3000` vazio).

---

## Tarefa 1 — `calculateMacrosSchema`: campos obrigatórios e impacto real no onboarding mobile

### 1.1 — Definição completa, campo a campo

`packages/shared/src/schemas/user.ts:303-366`, citação literal completa:

```ts
export const calculateMacrosSchema = z.object({
  weight: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .positive('errors.validation.number_range'),

  height: z
    .number({
      required_error: 'errors.validation.required',
      invalid_type_error: 'errors.validation.number_range',
    })
    .positive('errors.validation.number_range'),

  targetWeight: z
    .number({
      invalid_type_error: rangeErrorMessage(20, 300),
    })
    .min(20, rangeErrorMessage(20, 300))
    .max(300, rangeErrorMessage(20, 300))
    .optional(),

  birthDate: birthDateSchema,

  biologicalSex: z.enum(biologicalSexValues, {
    required_error: 'errors.validation.required',
    message: 'errors.validation.invalid_option',
  }),

  activityLevel: z.enum(activityLevelValues, {
    required_error: 'errors.validation.required',
    message: 'errors.validation.invalid_option',
  }),

  goal: z.enum(userGoalValues, {
    required_error: 'errors.validation.required',
    message: 'errors.validation.invalid_option',
  }),

  weightGoal: z.enum(weightGoalValues, {
    required_error: 'errors.validation.required',
    message: 'errors.validation.invalid_option',
  }),

  unitSystem: z.enum(unitSystemValues, {
    required_error: 'errors.validation.required',
    message: 'errors.validation.invalid_option',
  }),
});
```

Campo por campo:

| Campo | Linha | Obrigatório ou `.optional()` |
|---|---|---|
| `weight` | 304-309 | Obrigatório (`required_error` definido, sem `.optional()`) |
| `height` | 311-316 | Obrigatório (idem) |
| `targetWeight` | 332-338 | **`.optional()`** (linha 338) — único campo opcional do schema |
| `birthDate` | 340 | Obrigatório — `birthDateSchema` (`packages/shared/src/schemas/user.ts:116-129`) é `z.string({ required_error: 'errors.validation.required', ... })`, sem `.optional()` em nenhum ponto da cadeia |
| `biologicalSex` | 342-345 | **Obrigatório** — `required_error` definido, sem `.optional()` |
| `activityLevel` | 347-350 | **Obrigatório** — idem |
| `goal` | 352-355 | Obrigatório — idem |
| `weightGoal` | 357-360 | **Obrigatório** — idem |
| `unitSystem` | 362-365 | Obrigatório — idem |

**Confirmado por citação literal:** `targetWeight` é o único campo opcional de `calculateMacrosSchema`. `birthDate`, `biologicalSex`, `weightGoal` e `activityLevel` — os 4 campos que o achado 2 de `cp-a-macros.md` aponta como quebrando o onboarding mobile — são todos obrigatórios (`required_error` presente, nenhum `.optional()` na cadeia), exatamente como o achado afirma. O CP-A.5 citou corretamente que `targetWeight` é opcional, mas nunca verificou os outros 4 — esta tarefa fecha essa lacuna.

Confirmação adicional, pela leitura do controller que consome este schema (`apps/api/src/controllers/user.controller.ts:1089`): `calculateMacrosSchema.safeParse(req.body)` roda direto sobre o corpo recebido, sem nenhuma etapa intermediária de defaults/merge antes da validação — não há nenhum middleware ou lógica que preencha `birthDate`/`biologicalSex`/`weightGoal`/`activityLevel` antes do Zod rodar. A rota (`apps/api/src/routes/users.ts:85`) é `usersRouter.post('/calculate-macros', authenticate, calculateMacros);` — só autenticação, nada mais, antes do controller.

### 1.2 — Requisição real omitindo os 4 campos

Servidor de dev subido (porta 3000, MongoDB Atlas, banco `test`). Conta de teste `cp-a6-verify-macros-1792537543@test.blendi.local` criada via `POST /auth/register` (`HTTP_STATUS:201`) para obter um `accessToken` válido (a rota é autenticada).

**Teste A — body EXATO do que o caller mobile hoje envia** (ver 1.3 abaixo — inclui `activityLevel`, que o mobile de fato manda; omite só `birthDate`/`biologicalSex`/`weightGoal`):

```
POST /users/calculate-macros
Authorization: Bearer <token real>
{"weight":70,"height":175,"activityLevel":"moderatelyActive","goal":"Wellness","unitSystem":"metric"}
```

Resposta real:
```
HTTP_STATUS:400
{"success":false,"code":"validation/invalid-input","message":"Validation failed.",
 "errors":[{"field":"birthDate","message":"errors.validation.required"},
           {"field":"biologicalSex","message":"errors.validation.invalid_option"},
           {"field":"weightGoal","message":"errors.validation.invalid_option"}]}
```

**Teste B — omitindo literalmente os 4 campos citados pela Tarefa 1.2 do prompt** (incluindo `activityLevel`, para cobrir exatamente o que foi pedido, mesmo sabendo pela 1.3 que o mobile real envia `activityLevel`):

```
POST /users/calculate-macros
Authorization: Bearer <token real>
{"weight":70,"height":175,"goal":"Wellness","unitSystem":"metric"}
```

Resposta real:
```
HTTP_STATUS:400
{"success":false,"code":"validation/invalid-input","message":"Validation failed.",
 "errors":[{"field":"birthDate","message":"errors.validation.required"},
           {"field":"biologicalSex","message":"errors.validation.invalid_option"},
           {"field":"activityLevel","message":"errors.validation.invalid_option"},
           {"field":"weightGoal","message":"errors.validation.invalid_option"}]}
```

**Confirmado — rejeição 400 real, agora, com requisições novas contra o servidor real**, não suposição. O Teste A reproduz exatamente o payload que o app mobile envia hoje (confirmado na 1.3) e já falha com os 3 campos que o mobile de fato omite.

### 1.3 — Corpo real enviado pelo caller mobile

Caller localizado: `apps/mobile/src/screens/onboarding/OnboardingBodyScreen.tsx`. Leitura apenas — nenhuma linha alterada.

Corpo real montado e enviado, citação literal de `OnboardingBodyScreen.tsx:146-155`:

```tsx
const response = await api.post<{ success: true; data: CalculateMacrosResponse }>(
  '/users/calculate-macros',
  {
    weight: storageWeight,
    height: storageHeight,
    activityLevel,
    goal,
    unitSystem: 'metric',
  },
);
```

**Confirmado por citação literal:** o caller envia exatamente `weight`, `height`, `activityLevel`, `goal`, `unitSystem` — **5 campos**, nenhum deles `birthDate`, `biologicalSex` ou `weightGoal`. `activityLevel` **está presente** (vem do estado local `activityLevel`, linha 107, com default `'moderatelyActive'`, linha 50) — diferente do que uma leitura apressada do achado 2 de `cp-a-macros.md` poderia sugerir ("sem `birthDate`/`biologicalSex`/`weightGoal`" — o próprio achado já é preciso em listar só esses 3, não `activityLevel`). `birthDate`, `biologicalSex` e `weightGoal` estão genuinamente ausentes — não há nenhuma variável de estado nesta tela que os capture, e nenhuma delas aparece no objeto do `api.post`.

### 1.4 — Diagnóstico: o achado 2 está vivo hoje

Com a evidência das 3 subtarefas acima:

- **1.1** prova que `birthDate`, `biologicalSex` e `weightGoal` são obrigatórios em `calculateMacrosSchema` (sem `.optional()`, com `required_error` definido).
- **1.3** prova que o caller mobile real (`OnboardingBodyScreen.tsx`) não envia nenhum dos 3.
- **1.2** prova, com uma requisição HTTP real contra o servidor real, que esse exato payload (Teste A) é rejeitado com `HTTP_STATUS:400` e os 3 campos citados como erro.

**Diagnóstico: o achado 2 de `cp-a-macros.md` está VIVO HOJE.** Não é uma suposição — é o resultado de uma requisição real, agora, reproduzindo byte a byte o payload que o código mobile real monta. A etapa de onboarding que calcula macros (`OnboardingBodyScreen`) está quebrada em produção: toda chamada a `POST /users/calculate-macros` feita por esse caller retorna `400`, nunca `200`. O `IMC`/macros nunca aparecem na tela — `macrosError` (estado local, `OnboardingBodyScreen.tsx:110`) é acionado em todo `catch` (linha 160-164), e o botão "Calcular macros" nunca habilita (`disabled={result === null}`, linha 468), porque `result` nunca é setado com sucesso. O usuário só consegue avançar pelo link "Pular por agora" (`handleSkip`, linha 228).

Isto não é um achado novo desta verificação — é o achado 2 da Tarefa 6 de `cp-a-macros.md`, nunca resolvido por nenhum CP posterior (CP-A.3 e CP-A.4 corrigiram, respectivamente, o piso de `targetWeight`/edição manual de gordura e o registro de conta — nenhum dos dois tocou em `calculateMacrosSchema` nos campos `birthDate`/`biologicalSex`/`weightGoal`, nem no código mobile). O CP-A.5 já havia sinalizado isso como "achado relacionado, não investigado" — esta tarefa converte essa suspeita em confirmação com evidência real.

---

## Tarefa 2 — Teste real do caminho Google, sem reconstrução manual

### 2.1 — Chamada real que busca/valida os dados do Google

Função exportada real que trata o "Caso 3: primeiro acesso via Google": `handleGoogleCallback`, `apps/api/src/controllers/google.controller.ts:100-245`.

A chamada específica que troca o código e verifica/obtém os dados do usuário no Google, citação literal (`google.controller.ts:140-148`):

```ts
let userInfo;
try {
  const idToken = await exchangeCodeForTokens(parsed.data.code);
  userInfo = await getUserInfoFromToken(idToken);
} catch {
  // Código inválido, expirado, já utilizado ou falha na verificação do token
  res.redirect('blendipulse://auth/callback?error=errors.auth.google_auth_failed');
  return;
}
```

`exchangeCodeForTokens` e `getUserInfoFromToken` são importados de `../services/google.service` (`google.controller.ts:28-31`) — `exchangeCodeForTokens` troca o código pelo `id_token` do Google (`google.service.ts:119`); `getUserInfoFromToken` verifica a assinatura RS256 e extrai `GoogleUserInfo` (`googleId`, `email`, `emailVerified`, `name`, `picture?` — interface em `google.service.ts:54-71`).

### 2.2 — Teste real via função do controller, sem reconstrução

**Método:** um script temporário (`apps/api/cpa6-verify-google-tmp.ts`, fora de `src/`, apagado ao final) fez *hijack* do `require.cache` do Node para o caminho resolvido de `google.service.ts` — substituindo **só** `exchangeCodeForTokens`/`getUserInfoFromToken` (e um stub inofensivo de `getAuthorizationUrl`, não usado neste fluxo) por funções fake, **antes** de importar `google.controller.ts`. Como o `require()` do controller resolve para o mesmo caminho absoluto e encontra o módulo já no cache, ele recebe as funções fake automaticamente — nenhuma linha de `google.controller.ts` foi copiada, reescrita ou contornada. A função `handleGoogleCallback` real foi chamada diretamente, com `req`/`res`/`next` fake (`req.query` com um `code` fake e um `state` JWT real, assinado com `env.JWT_ACCESS_SECRET` pelo mesmo método de `getGoogleUrl`; `res.redirect` capturando a URL; `next` capturando erros).

Confirmação de que o hijack funcionou e a função real seguiu seu próprio fluxo — saída real do script:

```
GOOGLE_SERVICE_RESOLVED_PATH: /Users/Gabriel/Documents/BLENDi-Pulse/apps/api/src/services/google.service.ts
✅  MongoDB conectado: test (ac-nmafr1s-shard-00-02.pjppwwq.mongodb.net)
EXCHANGE_CODE_CALLED: true RECEIVED_CODE: fake-auth-code-xyz
GET_USER_INFO_CALLED: true RECEIVED_ID_TOKEN: fake-id-token-1792537874191
NEXT_ERROR: undefined
REDIRECT_URL: blendipulse://auth/callback?accessToken=eyJ...&refreshToken=eyJ...&isNewUser=true&user=eyJ...
IS_NEW_USER: true
ACCESS_TOKEN_PRESENT: true
REFRESH_TOKEN_PRESENT: true
USER_PAYLOAD: {"id":"6ad7f518109bbcdb7afb221e","email":"cp-a6-verify-google-1792537874191@test.blendi.local","name":"CPA6 Verify Google","profilePhoto":"https://example.com/fake-pic.jpg","blendiModel":"Lite","goal":"Wellness","locale":"en","unitSystem":"metric","timezone":"America/New_York","dailyProteinTarget":150,"dailyCalorieTarget":2000,"dailyCarbTarget":200,"longestStreak":0,"createdAt":"2026-10-20T23:11:20.663Z"}
CREATED_DOC_PROFILE_FIELDS: {"weightGoal":"maintain","biologicalSex":"male","activityLevel":"moderatelyActive","birthDate":"1996-10-20T22:11:20.645Z","hasPassword":false}
GET_USERS_ME_STATUS: 200
GET_USERS_ME_BODY: {"success":true,"data":{"user":{"id":"6ad7f518109bbcdb7afb221e","name":"CPA6 Verify Google", ... "dailyProteinTarget":150,"dailyCarbTarget":200,"dailyCalorieTarget":2000, ...}}}
DELETE_RESULT: {"acknowledged":true,"deletedCount":1}
REMAINING_AFTER_CLEANUP: 0
```

Confirmado, ponto a ponto:
- `EXCHANGE_CODE_CALLED: true` / `GET_USER_INFO_CALLED: true` — a função real chamou de fato as duas dependências mockadas, com o `code` que veio de `req.query` (`fake-auth-code-xyz`), exatamente pela linha citada em 2.1.
- `CREATED_DOC_PROFILE_FIELDS` — `weightGoal:"maintain"`, `biologicalSex:"male"`, `activityLevel:"moderatelyActive"`, `birthDate` ~30 anos antes de hoje: **os mesmos 4 valores exatos de `getAccountCreationBodyProfileDefaults()`** (`apps/api/src/utils/accountDefaults.utils.ts:36-41`). Esta função **não foi mockada** — só `google.service` foi. Isso prova que a linha `...getAccountCreationBodyProfileDefaults()` dentro de `UserModel.create()` (`google.controller.ts:198`) executou de verdade, dentro da função real do controller, sem nenhuma reconstrução.
- `accessToken`/`refreshToken` no `REDIRECT_URL` foram gerados pela própria função (`generateAccessToken`/`generateRefreshToken`, `google.controller.ts:210-211`), não por um script à parte.
- `GET_USERS_ME_STATUS: 200` — chamada HTTP real, contra o servidor de dev real (porta 3000, processo separado), usando o `accessToken` extraído do redirect gerado pela função real. Perfil completo retornado, confirmando autenticação de ponta a ponta.

**Confirmado — teste real, executando a função do controller de verdade, incluindo o spread de `getAccountCreationBodyProfileDefaults()`.**

### 2.3 — Limpeza

Conta de teste (`cp-a6-verify-google-<timestamp>@test.blendi.local`) removida dentro do próprio script (`DELETE_RESULT: {"deletedCount":1}`), com `REMAINING_AFTER_CLEANUP: 0` confirmado no mesmo processo.

Confirmação **independente** adicional: um segundo script (`cpa6-cleanup-and-verify-tmp.ts`), em processo separado e sem nenhum hijack de `require.cache`, conectou ao Atlas de forma direta e rodou `countDocuments` para os dois padrões de email usados nesta verificação:
```
REMAINING_MACROS_ACCOUNTS: 0
REMAINING_GOOGLE_ACCOUNTS: 0
```
(este mesmo script também removeu a conta de teste da Tarefa 1, `cp-a6-verify-macros-*`, que ainda não tinha sido limpa — `MACROS_DELETE_RESULT: {"deletedCount":1}`.)

Os dois scripts temporários (`apps/api/cpa6-verify-google-tmp.ts`, `apps/api/cpa6-cleanup-and-verify-tmp.ts`) foram apagados ao final. Servidor de dev encerrado (`lsof -i :3000` vazio após o encerramento). `git status` final:
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
Idêntico ao estado inicial desta conversa — nenhum arquivo novo remanescente, nenhum arquivo de código-fonte alterado.

### 2.4 — Diagnóstico: diferença real em relação ao teste do CP-A.5

O teste do CP-A.5 (seção 3.2(b) daquele documento) executou um script que **importava** `UserModel`, `generateAccessToken`/`generateRefreshToken` e `getAccountCreationBodyProfileDefaults` do código real, e então chamava `UserModel.create({...})` **diretamente no script**, montando à mão o mesmo objeto que o controller monta. Isso prova que o Mongoose aceita aquele conjunto de campos — mas nunca executa uma única linha de `google.controller.ts`. Uma regressão dentro de `handleGoogleCallback` (por exemplo, alguém remover `...getAccountCreationBodyProfileDefaults()` da chamada real, ou trocar a ordem de verificação de `emailVerified`, ou remover o `await` de `exchangeCodeForTokens`) não seria detectada por aquele teste, porque ele nunca invoca a função — só reconstrói, de memória, o que ela parecia fazer na leitura do código.

O teste desta tarefa é estruturalmente diferente: ele importa e invoca `handleGoogleCallback` — a função exportada real, inalterada — e só substitui, via hijack do módulo resolvido, a única dependência externa que não pode ser exercitada neste ambiente (a troca de código com os servidores do Google). Toda a lógica de negócio real executa sem modificação: a verificação de `state` via `jwt.verify` (linha 123), a checagem de `emailVerified` (linha 155), o `findOne` por `googleId` e depois por `email` (linhas 162-167), o branch do "Caso 3" (linha 176), e — criticamente — a chamada real a `UserModel.create()` com o spread de `getAccountCreationBodyProfileDefaults()` na linha 198. A prova de que essa linha específica executou (e não foi reconstruída) está em `CREATED_DOC_PROFILE_FIELDS`: os 4 valores batem exatamente com `accountDefaults.utils.ts`, mas vieram da chamada real dentro do controller, não de um objeto montado no script de teste.

**Diagnóstico: sim, esta reexecução cobre algo que a do CP-A.5 não cobria.** Se alguém remover o spread de `getAccountCreationBodyProfileDefaults()` da linha 198 de `google.controller.ts` por engano, o teste do CP-A.5 continuaria passando (porque ele nunca lê essa linha — monta o objeto de novo, com ou sem o spread, dependendo de como o autor do teste decidiu escrevê-lo). O teste desta tarefa, ao invocar a função real, pegaria essa regressão: `UserModel.create()` lançaria `ValidationError` por `weightGoal`/`biologicalSex`/`activityLevel`/`birthDate` ausentes (os mesmos 4 campos sem `default` no Mongoose, confirmados pelo CP-A.4/CP-A.5), e o teste falharia com `NEXT_ERROR` preenchido em vez de `undefined`.

---

## Veredito

| Ponto | Veredito | Evidência |
|---|---|---|
| 1 — `calculateMacrosSchema` e o achado 2 de `cp-a-macros.md` | **Confirmado — achado vivo hoje** | Definição completa citada (1.1): `birthDate`/`biologicalSex`/`weightGoal`/`activityLevel` são todos obrigatórios, só `targetWeight` é opcional. Requisição real (1.2) reproduzindo o payload exato do mobile retorna `HTTP_STATUS:400` com os 3 campos ausentes listados como erro. Corpo real do caller (1.3), citado literalmente de `OnboardingBodyScreen.tsx:146-155`, confirma que `birthDate`/`biologicalSex`/`weightGoal` de fato não são enviados (`activityLevel`, ao contrário do que uma leitura rápida do achado sugere, É enviado). A etapa de onboarding de corpo do app mobile está, hoje, estruturalmente incapaz de calcular macros — retorna 400 sempre, forçando o usuário a usar "Pular por agora". |
| 2 — teste real do caminho Google | **Confirmado — reexecução cobre algo novo** | A chamada real identificada (2.1, `google.controller.ts:142-143`) foi mockada; `handleGoogleCallback` real foi invocada (2.2) sem reconstrução, e o resultado (`CREATED_DOC_PROFILE_FIELDS` idêntico aos defaults reais, tokens gerados pela própria função, `GET /users/me` real retornando 200) prova que o spread de `getAccountCreationBodyProfileDefaults()` dentro da função real executou. Diagnóstico (2.4): diferente do teste do CP-A.5 (que reconstruía a chamada a `UserModel.create()` manualmente), este teste exercita a linha real do controller e detectaria uma regressão futura que o teste anterior não detectaria. Contas de teste limpas e confirmadas com 0 remanescentes por consulta independente, em processo separado. |

**A linha de trabalho CP-A NÃO pode ainda ser considerada genuinamente encerrada.** O registro de conta (CP-A.4) e o teste do caminho Google (agora reforçado por esta tarefa) estão de fato corrigidos e verificados duas vezes, por dois métodos independentes. Mas o Ponto 1 desta verificação confirma, com uma requisição HTTP real contra o servidor real, que **o passo seguinte do fluxo principal do app — onboarding de corpo, que calcula as macros do usuário — está quebrado hoje**, por causa da mesma correção de schema que destravou o registro de conta. Um usuário consegue se cadastrar (direto ou via Google) e fazer login, mas ao chegar em `OnboardingBodyScreen`, todo cálculo de macros falha com 400 — o único caminho adiante é "Pular por agora", que deixa a conta sem `dailyProteinTarget`/`dailyCalorieTarget`/`dailyCarbTarget` calculados a partir dos dados reais do usuário. Isso não é uma regressão desta tarefa nem do CP-A.3/CP-A.4 — é uma lacuna aberta desde `cp-a-macros.md` (Tarefa 6, achado 2), nunca endereçada por nenhum CP da linha de trabalho A até agora, e que esta verificação confirma estar **viva em produção**, não hipotética. A correção (enviar os 3 campos do mobile, ou relaxar o schema para este endpoint específico, ou coletar os dados em uma tela própria) é trabalho de outro CP — por instrução explícita desta tarefa, nenhuma correção foi implementada aqui.
