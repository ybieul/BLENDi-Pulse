# CP-A.5 — Verificação completa de CP-A.3, CP-A.4 e achados 1/9 (citação literal)

**Data:** 2026-10-19
**Base:** [cp-a.3-targetweight-piso-e-gordura-manual.md](cp-a.3-targetweight-piso-e-gordura-manual.md), [cp-a.4-registro-de-conta-e-historico-de-peso.md](cp-a.4-registro-de-conta-e-historico-de-peso.md), [cp-a.2-macros-complementares.md](cp-a.2-macros-complementares.md) ("Achados fora do escopo").
**Escopo:** verificação independente — nenhum código alterado, nenhuma documentação pré-existente alterada. Reexecução real dos testes pedidos, não herança do relato anterior.
**Método:** leitura literal do código real (linhas exatas, citadas abaixo). Para os testes, subi o servidor de dev (`pnpm --filter @blendi/shared build` + `pnpm dev` em `apps/api`, porta 3000) conectado ao MongoDB Atlas real (banco `test`). Criei 2 contas de teste descartáveis (`cp-a5-verify-register-<timestamp>@test.blendi.local`, `cp-a5-verify-google-<timestamp>@test.blendi.local`), removidas ao final via `deleteMany` com o padrão de email — confirmado **0 remanescentes** por `countDocuments` independente rodado depois da remoção. Dois scripts temporários (`cpa5-verify-google-tmp.ts`, `cpa5-verify-cleanup-and-query-tmp.ts`) foram criados em `apps/api/` fora de `src/` só para este teste e apagados ao final — `git status` confirmado idêntico ao estado inicial desta conversa (nenhum arquivo novo remanescente). Servidor de dev encerrado ao final.

---

## Tarefa 1 — CP-A.3: piso do peso-alvo

### 1.1 — Citação da validação nos dois endpoints

`calculateMacrosSchema.targetWeight` (`packages/shared/src/schemas/user.ts:332-338`):
```ts
targetWeight: z
  .number({
    invalid_type_error: rangeErrorMessage(20, 300),
  })
  .min(20, rangeErrorMessage(20, 300))
  .max(300, rangeErrorMessage(20, 300))
  .optional(),
```

`updateUserSchema.targetWeight` (`packages/shared/src/schemas/user.ts:252-258`):
```ts
targetWeight: z
  .number({
    required_error: 'errors.validation.required',
    invalid_type_error: rangeErrorMessage(20, 300),
  })
  .min(20, rangeErrorMessage(20, 300))
  .max(300, rangeErrorMessage(20, 300)),
```

**Confirmado:** os dois usam os mesmos números (20, 300), na mesma unidade (kg).

**Confirmado com ressalva:** não existe uma *constante compartilhada* entre os dois — são dois literais `20`/`300` escritos de forma independente em cada schema, não uma referência a uma única fonte exportada (ao contrário de, por exemplo, `DAILY_FAT_TARGET_MIN`/`MAX`, que é uma constante real exportada e importada nos dois lugares que a usam — ver Tarefa 2.2 abaixo). O próprio CP-A.3 é preciso sobre isso — diz "mesmos números literais já usados", nunca "mesma constante" — então não há contradição com o que foi relatado, só uma precisão que vale registrar: "mesma fonte de piso/teto", no sentido estrito de uma única declaração compartilhada, não existe aqui para este par. Nenhum valor foi reinventado (os números são idênticos), mas também não há uma garantia estrutural de que os dois nunca divirjam no futuro (uma mudança em um dos dois literais não afeta o outro).

### 1.2 — Reexecução real (agora, não herdada)

Requisição real enviada agora contra o servidor de dev + Atlas:

```
POST /users/calculate-macros
{"weight":70,"height":175,"birthDate":"1996-01-01","biologicalSex":"male",
 "activityLevel":"moderatelyActive","goal":"Wellness","weightGoal":"maintain",
 "unitSystem":"metric","targetWeight":15}
```

Resposta real:
```
HTTP_STATUS:400
{"success":false,"code":"validation/invalid-input","message":"Validation failed.",
 "errors":[{"field":"targetWeight","message":"{\"key\":\"errors.validation.number_range\",\"min\":20,\"max\":300}","minimum":20}]}
```

**Confirmado** — rejeição idêntica à documentada no CP-A.3, reproduzida agora com uma requisição nova, não copiada do relato anterior. Regressão com `targetWeight: 65` confirmada no mesmo lote: `HTTP_STATUS:200`, `weightTargetEta` presente.

---

## Tarefa 2 — CP-A.3: edição manual da meta de gordura

### 2.1 — Trecho que aceita `dailyFatTarget` manual

`user.controller.ts:789` (destructuring) e `user.controller.ts:808` (inclusão condicional em `updates`):
```ts
dailyFatTarget,
// ...
...(dailyFatTarget !== undefined && { dailyFatTarget }),
```
Confirmado por leitura direta do arquivo real (`apps/api/src/controllers/user.controller.ts`, trecho de `updateMe`).

### 2.2 — Limite de sanidade reaproveitado, com as duas citações

**Onde já existia antes** (Mongoose, `apps/api/src/models/User.ts:519-520`):
```ts
min: [DAILY_FAT_TARGET_MIN, 'errors.validation.number_range'],
max: [DAILY_FAT_TARGET_MAX, 'errors.validation.number_range'],
```

**Onde passou a ser usado agora** (Zod, `packages/shared/src/schemas/user.ts:214-221`):
```ts
dailyFatTarget: z
  .number({
    required_error: 'errors.validation.required',
    invalid_type_error: rangeErrorMessage(DAILY_FAT_TARGET_MIN, DAILY_FAT_TARGET_MAX),
  })
  .int('errors.validation.integer')
  .min(DAILY_FAT_TARGET_MIN, rangeErrorMessage(DAILY_FAT_TARGET_MIN, DAILY_FAT_TARGET_MAX))
  .max(DAILY_FAT_TARGET_MAX, rangeErrorMessage(DAILY_FAT_TARGET_MIN, DAILY_FAT_TARGET_MAX)),
```

A constante em si (`packages/shared/src/schemas/user.ts:71-72`):
```ts
export const DAILY_FAT_TARGET_MIN = 0;
export const DAILY_FAT_TARGET_MAX = 600;
```

**Confirmado** — é literalmente a mesma constante exportada (`DAILY_FAT_TARGET_MIN`/`MAX`), importada nos dois lugares (Mongoose já a importava desde o CP-A.2; o Zod passou a importar agora). Diferente do caso de `targetWeight` na Tarefa 1.1, aqui existe de fato uma única fonte compartilhada — nenhum valor novo foi criado.

### 2.3 — Faixa saudável de gordura por kg + documentação

Código (`apps/api/src/utils/macroCalculation.utils.ts:249-250`):
```ts
export const FAT_PER_KG_WARNING_MIN = 0.5;
export const FAT_PER_KG_WARNING_MAX = 2;
```
O comentário que registra o porquê está imediatamente acima (linhas 240-248 do mesmo arquivo), e o próprio CP-A.3 reproduz esse raciocínio na seção "O que foi adicionado", item 2. Confirmado que a documentação do valor escolhido existe tanto no código quanto no relato.

**Discrepância de citação (menor, não de substância):** o CP-A.3 cita esse bloco como `macroCalculation.utils.ts:239-250`. A linha 239 real é `export const CARB_PER_KG_WARNING_MAX = 8;` — pertence ao bloco de carboidrato, não ao de gordura. O bloco de gordura (comentário + as duas constantes) começa na linha 240 e termina na 250. Mesma observação vale para a citação de `updateUserSchema.dailyFatTarget` como `user.ts:214-220` (a declaração completa, incluindo o `.max(...)`, vai até a linha 221) e para `targetWeight` em `updateUserSchema` citado como `252-257` (vai até 258). Em todos os casos o conteúdo citado existe e está correto — só o intervalo de linhas está com off-by-one/off-by-a-few, não uma citação de outro trecho.

**Discrepância de citação (mais relevante):** o CP-A.3 cita a extensão de `MacroEditWarningField`/`ManualMacroEditWarningInput` com `dailyFatTarget` como `macroCalculation.utils.ts:236-245`. As linhas 236-245 reais são comentário e constantes de carboidrato/gordura (`CARB_PER_KG_WARNING_MIN/MAX`, início do comentário de gordura) — **não** o `type`/`interface` em si. As declarações reais estão em:
```ts
// linha 252
export type MacroEditWarningField =
  | 'dailyProteinTarget'
  | 'dailyCalorieTarget'
  | 'dailyCarbTarget'
  | 'dailyFatTarget';        // linha 256
```
```ts
// linha 264
export interface ManualMacroEditWarningInput {
  dailyProteinTarget?: number;
  dailyCalorieTarget?: number;
  dailyCarbTarget?: number;
  dailyFatTarget?: number;   // linha 268
  // ...
}                             // linha 274
```
O conteúdo descrito (os dois tipos estendidos com `dailyFatTarget`) está correto e confirmado por leitura direta — só o intervalo de linhas citado (236-245) aponta para um trecho adjacente, não para as declarações em si. Registrando como discrepância, não suavizando.

### 2.4 — Lógica do gatilho do aviso, confirmada pela leitura do código

`user.controller.ts:927-932`:
```ts
const isManualMacroEdit =
  !shouldRecalculateMacroTargets &&
  (dailyProteinTarget !== undefined ||
    dailyCalorieTarget !== undefined ||
    dailyCarbTarget !== undefined ||
    dailyFatTarget !== undefined);
```
`shouldRecalculateMacroTargets` (`user.controller.ts:863-870`) é `true` se `weight`/`height`/`activityLevel`/`weightGoal`/`birthDate`/`biologicalSex`/`goal` vierem no body. Quando `shouldRecalculateMacroTargets` é `true`, o bloco em `user.controller.ts:906-909` sobrescreve `updates.dailyFatTarget` (e os outros 3) incondicionalmente com o valor recalculado — e isso acontece **antes** da checagem de `isManualMacroEdit` (linha 927), que já nasce `false` nesse caso por construção (`!shouldRecalculateMacroTargets` força `false`). O bloco de avisos (`macroEditWarnings = evaluateManualMacroEditWarnings(...)`, linha 960) só roda dentro de `if (isManualMacroEdit)` (linha 936). **Confirmado, pela leitura direta do código** (não pela descrição do CP-A.3): quando há campo-gatilho no mesmo body, o recalculado prevalece e nenhum aviso é avaliado sobre o valor manual — exatamente como relatado.

### 2.5 — Reexecução real dos 3 casos (agora)

Conta de teste `cp-a5-verify-register-<ts>@test.blendi.local`, peso ajustado para 70kg (faixa saudável de gordura = 35-140g) via `PATCH { weight: 70, height: 175 }` real.

| Caso | Body real enviado agora | Resposta real agora |
|---|---|---|
| Dentro da faixa | `{"dailyFatTarget":80}` | `200`, `"dailyFatTarget":80`, sem `warnings` no payload |
| Fora da faixa (acima) | `{"dailyFatTarget":200}` | `200`, `"dailyFatTarget":200`, `"warnings":[{"field":"dailyFatTarget","code":"macros/fat-above-range","message":"warnings.manualMacroEdit.fatAboveRange"}]` |
| Gatilho + manual no mesmo body | `{"weight":72,"dailyFatTarget":500}` | `200`, `"dailyFatTarget":86` (recalculado — peso 72kg, não 500), sem `warnings` no payload |

Corpo real do terceiro caso (recorte):
```json
{"dailyProteinTarget":115,"dailyCalorieTarget":2587,"dailyCarbTarget":338,"dailyFatTarget":86,"weight":72,"imc":23.5,"imcClassification":"normal"}
```

**Confirmado** — os 3 comportamentos pedidos pela tarefa (manual dentro da faixa sem aviso; manual fora da faixa com aviso sem bloquear; recálculo automático prevalecendo sobre manual no mesmo body, sem aviso) foram reproduzidos agora, com requisições novas, não copiadas do CP-A.3.

---

## Tarefa 3 — CP-A.4: registro de conta

### 3.1 — Causa raiz: citação e avaliação independente

**Defeito real** — os 4 campos exigidos pelo Mongoose sem `default`, nenhum deles fornecido pelos dois caminhos de criação de conta:

`apps/api/src/models/User.ts:461-465` (`weightGoal`):
```ts
weightGoal: {
  type: String,
  enum: ['lose', 'maintain', 'gain'] satisfies WeightGoal[],
  required: [true, 'errors.validation.required'],
},
```
`apps/api/src/models/User.ts:602-620` (`birthDate`, `required: [true, ...]` na linha 604, sem `default` em nenhuma linha do bloco), `621-625` (`biologicalSex`, `required: [true, ...]` na linha 624), `626-636` (`activityLevel`, `required: [true, ...]` na linha 635) — confirmado, nenhum dos 4 blocos tem propriedade `default`. Isso é comportamento determinístico do Mongoose: `UserModel.create()` sem um campo `required` sem `default` lança `ValidationError` antes de qualquer lógica de negócio rodar — não precisei reverter a correção para confirmar isso, a ausência de `default` nos 4 blocos já garante o comportamento por construção da biblioteca.

Isso é exatamente o achado 1 da Tarefa 6 de `cp-a-macros.md:116`, citado literalmente:
> 1. **`POST /auth/register` e `POST /auth/google` estão quebrados a partir de agora** (`auth.controller.ts:98-108`, `google.controller.ts:178`) — `UserModel.create()` não envia `birthDate`/`biologicalSex`/`weightGoal`/`activityLevel`, agora obrigatórios sem fallback. Toda tentativa de criar conta nova por esses dois caminhos vai falhar com `ValidationError` do Mongoose até um CP futuro (onboarding/perfil mobile) coletar esses dados. **Confirmado e aceito por você antes de implementar a Tarefa 1** — registrando aqui formalmente, como pedido.

**Correção real** — `apps/api/src/controllers/auth.controller.ts:105-116`:
```ts
const user = await UserModel.create({
  email, password, name, blendiModel, goal,
  locale: preferredLanguage, timezone,
  dailyProteinTarget, dailyCalorieTarget,
  ...getAccountCreationBodyProfileDefaults(),
});
```
`apps/api/src/controllers/google.controller.ts:185-199` — mesmo padrão, `...getAccountCreationBodyProfileDefaults()` na linha 198, dentro do bloco "Caso 3: primeiro acesso via Google".

**Avaliação independente:** este é, de fato, causa raiz do sintoma — não um paliativo que esconde o problema. O defeito citado (`ValidationError` do Mongoose por campo obrigatório ausente) é a única causa documentada em qualquer lugar desta linha de trabalho para o registro quebrado, e a correção atua exatamente no ponto onde a exceção era lançada (`UserModel.create()`), não em volta dela (não há `try/catch` escondendo o erro, nem um valor peneirado depois do fato — os 4 campos passam a existir antes da chamada ao Mongoose, e o documento é criado com sucesso). A ressalva que o próprio CP-A.4 já registra — são valores-placeholder, não dados reais do usuário, e a tela que coletaria os dados reais continua sendo outro CP — é uma limitação de produto honestamente exposta, não uma causa raiz escondida atrás de outra. Avaliação: **causa raiz confirmada, correção real, não paliativa**.

**Achado relacionado, não investigado por esta verificação (fora do escopo pedido) mas relevante para o veredito final:** `cp-a-macros.md:117`, achado 2 da mesma Tarefa 6, afirma que o mesmo endurecimento do schema também quebrou `POST /users/calculate-macros` para o único caller real do app mobile (`OnboardingBodyScreen.tsx`, que não envia `birthDate`/`biologicalSex`/`weightGoal`):
> 2. **`POST /users/calculate-macros` também quebrou para o único caller real hoje.** (...) a etapa de onboarding que faz exatamente o cálculo que este CP corrigiu vai começar a falhar com 400 assim que esta mudança for publicada, até a tela mobile (outro CP) passar a enviá-los.

Nem o CP-A.3 nem o CP-A.4 mencionam ter resolvido isso, e esta verificação não investigou o código mobile (fora de escopo explícito do pedido — "não toque em nada relacionado a CP-B"). Registrando só para o veredito final: a correção do CP-A.4 resolve o registro de conta, mas não necessariamente o onboarding completo (etapa seguinte, que chama `calculateMacros` diretamente do app).

### 3.2 — Reexecução real de ponta a ponta (agora)

**(a) Cadastro direto — HTTP real, agora:**

```
POST /auth/register
{"email":"cp-a5-verify-register-<ts>@test.blendi.local","password":"Teste@1234",
 "name":"CPA5 Verify","blendiModel":"Lite","goal":"Wellness","preferredLanguage":"en",
 "dailyProteinTarget":150,"dailyCalorieTarget":2000,"timezone":"America/Sao_Paulo"}
→ HTTP_STATUS:201, accessToken + refreshToken reais retornados

POST /auth/login (mesma senha)
→ HTTP_STATUS:200, novo par de tokens

GET /users/me (accessToken do login)
→ HTTP_STATUS:200, perfil completo retornado (dailyProteinTarget:150, dailyCarbTarget:200,
   dailyCalorieTarget:2000, createdAt real)
```

**Confirmado agora, de ponta a ponta, com requisições HTTP novas** — não herdado do relato do CP-A.4.

**(b) Google OAuth — Caso 3, reexecutado agora pelo mesmo método que o CP-A.4 descreveu** (script que importa `UserModel`, `generateAccessToken`/`generateRefreshToken` e `getAccountCreationBodyProfileDefaults` reais do próprio código, contra o MongoDB Atlas real):

```
UserModel.create({ email, name, googleId, profilePhoto, locale:'en',
  timezone:'America/New_York', blendiModel:'Lite', goal:'Wellness',
  dailyProteinTarget:150, dailyCalorieTarget:2000, scanCount:0, scanResetDate,
  ...getAccountCreationBodyProfileDefaults() })
→ CREATE_OK, sem ValidationError. birthDate: 1996-10-19 (30 anos antes de hoje,
  2026-10-19), biologicalSex:"male", weightGoal:"maintain",
  activityLevel:"moderatelyActive", hasPassword:false

generateAccessToken/generateRefreshToken reais sobre o usuário criado
→ TOKENS_OK (tokens gerados com sucesso)

GET /users/me via HTTP real com o accessToken gerado
→ HTTP_STATUS:200, perfil completo (profilePhoto presente, conta baseada em googleId)
```

**Confirmado agora** — mesma limitação honesta que o CP-A.4 já registrou: não há como dirigir o fluxo real de autorização do Google (navegador + conta real) neste ambiente, então a troca de código com os servidores do Google não foi (re)testada — e nunca foi o bug, confirmado pela leitura do próprio código (o bug vivia em `UserModel.create()`, depois de um `userInfo` já válido). O que estava quebrado foi testado de verdade, agora, de novo, com resultado idêntico ao relatado.

**Limpeza confirmada:** as 2 contas de teste desta verificação foram removidas (`deleteMany`, `deletedCount: 2`), `0` remanescentes confirmado por `countDocuments` independente rodado depois.

---

## Tarefa 4 — CP-A.4: histórico de peso

### 4.1 — Dados reais, reconsultados agora (não herdados)

Consulta rodada agora, depois da limpeza das 2 contas de teste desta verificação (mesmo método do CP-A.4: só contas reais pré-existentes):

```json
{"totalAccounts":3,"avgWeightHistorySize":0,"maxWeightHistorySize":0,
 "accountsWith2PlusEntries":0,"oldestAccountCreatedAt":"2026-10-05T17:24:33.626Z",
 "perAccount":[
   {"email":"biel782003@gmail.com","size":0},
   {"email":"gabrielordltd@gmail.com","size":0},
   {"email":"jonathankatz96@gmail.com","size":0}]}
```

**Confirmado** — números idênticos aos documentados no CP-A.4 (3 contas, tamanho médio/máximo 0, 0 contas com 2+ entradas, conta mais antiga em 2026-10-05, 14 dias antes de hoje). Esta é uma reexecução real agora, não uma citação do relato anterior.

### 4.2 — Conclusão documentada decorre dos dados

O único ponto de escrita em `weightHistory` em todo `apps/api/src` é confirmado por busca direta no código-fonte (não por grep reportado, refeito agora):
```
apps/api/src/controllers/user.controller.ts:984:  ...(weightHistoryEntry && { $push: { weightHistory: weightHistoryEntry } }),
```
Nenhuma outra ocorrência de escrita (`$push`, `.save()` com mutação do array, cron, migração) existe no restante de `apps/api/src`. O gatilho da entrada (`user.controller.ts:975-978`) é exatamente o descrito: só quando `weight` vem no body **e** é diferente do valor salvo. **Confirmado** — a conclusão ("estruturalmente limitado a no máximo 1 entrada por conta hoje") decorre da auditoria de código (único ponto de escrita, uma vez por conta no onboarding) combinada com os dados reais (0 entradas nas 3 contas existentes), não de suposição.

### 4.3 — Nenhuma implementação; decisão registrada com os dados que a sustentam

Confirmado: nenhuma mudança relacionada a paginação/TTL do histórico de peso aparece no diff não-commitado do repositório. O comentário da rota (`apps/api/src/routes/users.ts:29-33`) continua com o texto antigo e vago ("Sem paginação — volume esperado é baixo"), **não atualizado** para refletir o raciocínio estrutural novo do CP-A.4 — o próprio CP-A.4 já é explícito sobre isso ("Nenhuma mudança de código foi feita para esta tarefa, por decisão explícita"), então isto não é uma discrepância, é a confirmação de que a frase antiga permanece no código exatamente como estava, enquanto a justificativa real (o porquê de não precisar de paginação agora) vive só na documentação, não no comentário do código-fonte.

A decisão está registrada em dois lugares com os dados que a sustentam: no próprio `cp-a.4-registro-de-conta-e-historico-de-peso.md` (seção "Decisão") e em `docs/README.md`, "Key Decisions" (linha adicionada no diff não-commitado):
> Weight history left unpaginated for now (CP-A.4): growth is structurally capped at one entry per account under the current UI (no screen allows editing weight after onboarding), confirmed against real data (3 total accounts, 0 entries each) — revisit only if a future feature allows editing weight repeatedly after onboarding, since that changes the growth model entirely.

**Confirmado** — decisão consciente, não postergação sem resposta, com gatilho explícito de reabertura.

**Discrepância de citação (menor, à parte dos dados em si):** a linha "Base" do CP-A.4 e a seção de dados citam `docs/README.md`, "External Services Status", como referência para a premissa "o produto ainda não lançou". Lida literalmente, essa seção (linhas 203-212 de `docs/README.md`) fala só de RevenueCat/Expo EAS/Firebase/Apple Developer/Google Play/assets de imagem — nenhuma linha ali diz "o produto não lançou" ou menciona MongoDB/banco único. A premissa em si é verdadeira e sustentada por **outras** partes do mesmo arquivo, não citadas pelo CP-A.4 (`docs/README.md:87`, cabeçalho "Phase 5 — Launch Readiness"; `docs/README.md:220`, "Phase 3 is closed, the current app version is tracked as `0.4.0`, and Phase 4 — Launch is planned") — então a conclusão é correta, mas a citação específica aponta pra seção errada do mesmo documento.

---

## Tarefa 5 — achados 1 e 9 do documento consolidado

### 5.1 — Texto atual, citado literalmente

`docs/fixes/cp-a.2-macros-complementares.md:300`:
> 1. ~~`calculateMacrosSchema.targetWeight` não tem piso de 20kg~~ (só `.positive()`), ao contrário de `updateUserSchema.targetWeight` (20–300kg) — mesma categoria de assimetria já registrada no CP-A.1 para `weight`; esta é a primeira vez que a mesma assimetria é registrada especificamente para `targetWeight` (aqui, no CP-A.2). **Resolvido no [CP-A.3](cp-a.3-targetweight-piso-e-gordura-manual.md)**: `calculateMacrosSchema.targetWeight` ganhou o mesmo piso/teto (20-300) de `updateUserSchema.targetWeight`. `weight`/`height` do mesmo schema continuam sem piso/teto — não eram o que este achado rastreava, e não foram tocados por aquela correção.

`docs/fixes/cp-a.2-macros-complementares.md:310`:
> 9. ~~(Novo, CP-A.2.3) `dailyFatTarget` editável manualmente — tarefa combinada já decidida, ainda não implementada.~~ Hoje `dailyFatTarget` não existe em `updateUserSchema` (não é manualmente editável) e, por consequência, não tem nenhum aviso suave (ao contrário de proteína, calorias e agora carboidrato). Decisão já tomada (não avaliada aqui): quando isso for implementado, caberá ao usuário a responsabilidade pela consistência entre os 4 campos manuais quando editados juntos (proteína+calorias+carboidrato+gordura não necessariamente somam entre si se cada um for editado de forma independente) — nenhuma validação cruzada entre os 4 está planejada para essa tarefa futura, só o limite rígido (0–600, já existente) e o aviso suave simétrico aos outros 3. **Resolvido no [CP-A.3](cp-a.3-targetweight-piso-e-gordura-manual.md)**: exatamente como previsto aqui — `dailyFatTarget` ganhou o limite rígido (0–600) estendido também pro Zod (`updateUserSchema`) e um aviso suave simétrico (0,5–2g/kg), sem nenhuma validação cruzada entre os 4 campos manuais.

### 5.2 — Achado já resolvido antes, para comparação de formato

`docs/fixes/cp-a.2-macros-complementares.md:308` (achado 7, resolvido no CP-A.2.3):
> 7. ~~`birthDate` não tem nenhum limite de idade plausível, em nenhuma das 3 camadas~~ — **resolvido no CP-A.2.3**: idade plausível (13–120) validada nos 3 lugares, ver "Revisão (CP-A.2.3)" acima. A ausência de validação cruzada entre peso/altura/idade (...) continua não implementada — mas deixou de ser necessária pra conter o problema original (...).

`docs/fixes/cp-a.2-macros-complementares.md:305` (achado 4, parcialmente resolvido no CP-A.2.3):
> 4. ~~`dailyCarbTarget` e `dailyFatTarget` não têm nenhum aviso de edição manual~~ — **parcialmente resolvido no CP-A.2.3**: `dailyCarbTarget` ganhou o aviso simétrico (...). `dailyFatTarget` continua sem aviso — e continua nem editável manualmente (...), ver achado 9 abaixo (...).

**Padrão confirmado:** os 4 achados (1, 4, 7, 9) seguem o mesmo formato — título original riscado (`~~...~~`), seguido de **"Resolvido no..."**/**"resolvido no..."**/**"parcialmente resolvido no..."** em negrito e a explicação do que mudou. Único ponto de atenção, já identificado pelo próprio CP-A.3 e confirmado aqui: nos achados 1 e 9 (mais novos), só a frase-título é riscada, deixando o parágrafo de contexto subsequente sem risco; no achado 7 (mais antigo), o mesmo critério se aplica (só o título até o travessão é riscado). Consistente nos dois.

### 5.3 — Consistência da referência cruzada

Os dois achados apontam para `[CP-A.3](cp-a.3-targetweight-piso-e-gordura-manual.md)` — o CP-A.3 correto (piso do peso-alvo e edição manual de gordura), confirmado pelo link e pelo conteúdo do próprio arquivo (lido integralmente nesta verificação).

O motivo de resolução citado no achado 1 ("`calculateMacrosSchema.targetWeight` ganhou o mesmo piso/teto (20-300) de `updateUserSchema.targetWeight`") é consistente com o que a Tarefa 1 desta verificação encontrou de fato no código — confirmado por citação literal e teste real na Tarefa 1 acima, com a ressalva já registrada ali (mesmos números, não uma constante única compartilhada).

O motivo de resolução citado no achado 9 ("ganhou o limite rígido (0–600) estendido também pro Zod (`updateUserSchema`) e um aviso suave simétrico (0,5–2g/kg), sem nenhuma validação cruzada entre os 4 campos manuais") é consistente com o que a Tarefa 2 desta verificação encontrou de fato no código — confirmado por citação literal (`DAILY_FAT_TARGET_MIN/MAX`, `FAT_PER_KG_WARNING_MIN/MAX`) e pelos 3 testes reais da Tarefa 2.5, com as duas ressalvas de citação de linha já registradas ali (não de substância).

**Confirmado, sem refutação** — a referência cruzada aponta para o documento certo, e o motivo de resolução é fiel ao que o código realmente faz hoje.

---

## Veredito

| Tarefa | Veredito | Observação |
|---|---|---|
| 1 — piso do peso-alvo | **Confirmado com ressalva** | Comportamento e teste 100% reproduzidos agora. Ressalva: não há uma constante única compartilhada entre os dois schemas (são literais duplicados, não uma fonte única) — o CP-A.3 já foi preciso sobre isso, mas a tarefa pedia confirmar "mesma fonte", e essa fonte única não existe no sentido estrito. |
| 2 — edição manual da gordura | **Confirmado com ressalva** | Lógica, limites e os 3 testes 100% reproduzidos agora, com resultado idêntico ao relatado. Ressalva: duas citações de linha no CP-A.3 (`236-245` para `MacroEditWarningField`/`ManualMacroEditWarningInput`, e o `239-250` da faixa de gordura) apontam para trechos adjacentes, não exatamente para o conteúdo descrito — discrepância de citação, não de comportamento. |
| 3 — registro de conta | **Confirmado** | Causa raiz avaliada de forma independente e julgada genuína (não paliativa) — confirmada pela ausência de `default` nos 4 campos obrigatórios do Mongoose, que por si só garante o `ValidationError` sem precisar reverter a correção para provar. Os dois caminhos (direto e Google) foram reexecutados agora, de ponta a ponta, com evidência real (HTTP 201/200, tokens reais, leitura autenticada real). Achado relacionado e não resolvido (achado 2 da Tarefa 6 do `cp-a-macros.md`, sobre `calculateMacros` quebrado para o onboarding mobile real) permanece fora do que CP-A.3/CP-A.4 se propuseram a corrigir — não investigado aqui por estar fora de escopo (mobile), mas relevante para o veredito final da linha de trabalho. |
| 4 — histórico de peso | **Confirmado** | Dados reais reconsultados agora são idênticos aos documentados (3 contas, 0 entradas). Conclusão decorre de auditoria de código real (único ponto de escrita) + dados reais, não de suposição. Decisão de não implementar paginação está registrada com os dados que a sustentam, em dois lugares. Ressalva menor: a citação de `docs/README.md` ("External Services Status") para sustentar "produto não lançou" aponta pra seção errada do mesmo arquivo — a premissa é verdadeira, mas sustentada por outras linhas do mesmo documento, não citadas. |
| 5 — achados 1 e 9 | **Confirmado** | Texto atual, padrão de formatação e referência cruzada verificados por citação literal; motivo de resolução citado nos dois achados é fiel ao que o código faz hoje, com as mesmas ressalvas (não de substância) já registradas nas Tarefas 1 e 2. |

**A linha de trabalho CP-A (piso, gordura, conta, histórico, achados 1/9) pode ser considerada encerrada para o que foi pedido em cada um desses prompts específicos** — todo comportamento reivindicado foi reproduzido agora, com requisições e consultas novas, não herdadas. As únicas pendências reais encontradas nesta verificação são: (a) um conjunto pequeno de citações de linha imprecisas no CP-A.3/CP-A.4 (não afetam o comportamento, só a navegabilidade da documentação) e (b) um achado relacionado, já documentado desde `cp-a-macros.md` (Tarefa 6, achado 2) e nunca reaberto por nenhuma correção desta linha — `POST /users/calculate-macros` continua potencialmente quebrado para o único caller real do app mobile (`OnboardingBodyScreen.tsx`), porque o endurecimento de schema que exige `birthDate`/`biologicalSex`/`weightGoal` nunca foi acompanhado de uma mudança correspondente no app mobile. Isso não é uma pendência do escopo que CP-A.3/CP-A.4 assumiram resolver (registro de conta e histórico de peso, não onboarding), mas é uma pendência real e não investigada por esta verificação (fora de escopo — CP-B), que deveria ser verificada antes de considerar o fluxo de cadastro ponta a ponta (registro → onboarding → uso do app) como totalmente destravado.
