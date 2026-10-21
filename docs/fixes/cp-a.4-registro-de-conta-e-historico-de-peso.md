# CP-A.4 — Causa raiz do registro de conta quebrado e avaliação do histórico de peso

**Data:** 2026-10-19
**Base:** [cp-a-macros.md](../../cp-a-macros.md) (Tarefa 6, achado 1 — registro quebrado nos dois caminhos, aceito e documentado como pendência na época, nunca investigado de verdade); `docs/fixes/cp-a.3-targetweight-piso-e-gordura-manual.md` (prompt anterior, já concluído); rota `GET /users/me/weight-history` (CP-A.2) e seu comentário "sem paginação — volume esperado é baixo", nunca reavaliado desde então.
**Escopo implementado:** as 2 tarefas do prompt — causa raiz real do registro de conta quebrado (cadastro direto e Google) corrigida nos dois caminhos; avaliação de dados reais do histórico de peso, concluindo que paginação não é necessária agora (decisão registrada, não implementada).
**Método:** mesmo rigor da linha de trabalho — leitura do código real (controllers, modelo Mongoose, schemas Zod, telas mobile) antes de qualquer mudança, `tsc --noEmit` nos 3 workspaces, e teste de integração real contra o servidor de dev subido só para este teste + MongoDB Atlas real (banco `test`, o único que existe hoje — o produto ainda não lançou, ver "External Services Status" em `docs/README.md`).

---

## Tarefa 1 — causa raiz do registro de conta quebrado

### Investigação (antes de qualquer correção)

Ambos os caminhos de cadastro chamam `UserModel.create(...)`. Desde o [CP-A](../../cp-a-macros.md) (Tarefa 1, "Desvio 2"), o modelo Mongoose (`apps/api/src/models/User.ts`) exige 4 campos **obrigatórios sem `default`**: `weightGoal` (linha 461-465), `birthDate` (602-620), `biologicalSex` (621-625), `activityLevel` (626-636) — necessários pra fórmula real de BMR/TDEE (idade e sexo reais, ver `diagnostico-macros.md`).

Nenhum dos dois pontos de criação de conta fornecia esses 4 campos:

- **Cadastro direto** (`auth.controller.ts`, `register`): `registerSchema` (`packages/shared/src/schemas/auth.ts`) nunca pediu esses 4 campos ao cliente — o payload validado só tem `email/password/name/blendiModel/goal/preferredLanguage/dailyProteinTarget/dailyCalorieTarget/timezone`. `UserModel.create()` recebia exatamente isso, sem os 4 obrigatórios.
- **Google OAuth** (`google.controller.ts`, `handleGoogleCallback`, Caso 3 — primeiro acesso): o Google nunca fornece esses 4 dados (não fazem parte do perfil OAuth). `UserModel.create()` recebia só `email/name/googleId/profilePhoto/locale/timezone/blendiModel/goal/dailyProteinTarget/dailyCalorieTarget/scanCount/scanResetDate` — mesma lacuna.

Em ambos os casos, `UserModel.create()` lançava `ValidationError` (4 campos obrigatórios ausentes), capturado pelo `catch` genérico de cada handler e repassado a `next(err)` — por isso o cadastro "simplesmente não funcionava" nos dois caminhos, sem uma mensagem de erro específica de domínio.

**Causa raiz confirmada:** não é um bug novo nem desconhecido — é exatamente o achado 1 da Tarefa 6 do CP-A ("`POST /auth/register` e `POST /auth/google` estão quebrados a partir de agora"), **aceito explicitamente antes de implementar** naquela época porque a tela que coletaria esses 4 dados seria "outro CP" — e esse CP nunca chegou a existir. As revisões seguintes (CP-A.1, CP-A.2, CP-A.3) nunca tocaram o registro; só reconfirmavam a mesma lacuna como"ainda quebrado", sem investigar se havia algo mais a corrigir. Confirmado também que o app mobile **não tem, em lugar nenhum**, nenhuma tela que colete `birthDate`/`biologicalSex`/`weightGoal` (`grep` por essas 3 strings em `apps/mobile/src` → zero ocorrências) — não é uma tela "quase pronta", é uma lacuna real de produto, consistente com a decisão já tomada no CP-A de adiar essa coleta pra outro checkpoint.

### Correção aplicada

Em vez de inventar uma convenção nova, reaproveitei o padrão que **já existe nos dois controllers** para campos que o cliente ainda não fornece: valores-placeholder fixos no momento da criação da conta (exatamente como `blendiModel: 'Lite'` e `goal: 'Wellness'` já eram hardcoded em `google.controller.ts`, Caso 3, desde sempre). Estendi esse mesmo padrão aos 4 campos novos, num arquivo utilitário dedicado pra evitar duplicar os 4 valores (e o raciocínio por trás deles) em dois controllers sem nenhuma fonte única:

| Arquivo | O que mudou |
|---|---|
| `apps/api/src/utils/accountDefaults.utils.ts` (novo) | `getAccountCreationBodyProfileDefaults()` — retorna `{ weightGoal: 'maintain', biologicalSex: 'male', activityLevel: 'moderatelyActive', birthDate: subYears(new Date(), 30) }` |
| `apps/api/src/controllers/auth.controller.ts` (`register`, linha ~105-116) | `UserModel.create()` agora inclui `...getAccountCreationBodyProfileDefaults()` |
| `apps/api/src/controllers/google.controller.ts` (`handleGoogleCallback`, Caso 3, linha ~185-199) | idem |

**Por que esses 4 valores específicos, e por que não é um viés novo:** `biologicalSex: 'male'` + idade 30 (via `birthDate`) reproduzem **deliberadamente** a mesma suposição que o próprio sistema já fazia — hardcoded dentro da fórmula de BMR, não como dado — antes de toda esta linha de correção (`diagnostico-macros.md`: "idade sempre 30, sexo sempre a constante masculina"). Não é um viés introduzido por esta correção; é o mesmo placeholder histórico, agora um dado explícito e sobrescrevível, em vez de uma constante escondida dentro do cálculo. `activityLevel: 'moderatelyActive'` reaproveita o próprio valor padrão já usado pela UI (`OnboardingBodyScreen.tsx`, `DEFAULT_ACTIVITY`). `weightGoal: 'maintain'` é o ajuste calórico neutro (0, ver `WEIGHT_GOAL_CALORIE_ADJUSTMENTS`), simetricamente neutro ao `goal: 'Wellness'` que já era o padrão hardcoded ao lado dele. Nenhum dos 4 valores é novo — todos já existiam em algum lugar do sistema ou da UI; esta correção só os torna explícitos no ponto de criação da conta, onde antes simplesmente faltavam.

Esses valores só destravam a criação da conta — são sobrescritos pelo primeiro `PATCH /users/me` real que trouxer dados verdadeiros do usuário (a tela de onboarding/perfil que os coletaria continua sendo outro CP, não construída nesta correção — fora do pedido deste prompt, que era só destravar o registro).

**Nenhuma lógica de cálculo de macro, de `updateMe`, ou de qualquer schema Zod foi alterada.** A mudança é inteiramente contida nos dois pontos de criação de conta.

### Validação real (ponta a ponta, servidor de dev + MongoDB Atlas real, conta de teste removida ao final)

**(a) Cadastro direto — `POST /auth/register` → `POST /auth/login` → `GET /users/me` (todos via HTTP real):**

| Passo | Resultado |
|---|---|
| `POST /auth/register` | **201**, `user` + `accessToken` + `refreshToken` reais |
| `POST /auth/login` (mesma senha) | **200**, novo par de tokens |
| `GET /users/me` com o `accessToken` | **200**, perfil completo retornado |

Confirmado no banco (consulta direta via `UserModel`, mesma função real): `birthDate: 1996-10-19` (exatamente 30 anos antes de hoje), `biologicalSex: 'male'`, `weightGoal: 'maintain'`, `activityLevel: 'moderatelyActive'`.

Testei também o passo natural seguinte (`PATCH /users/me { weight: 70, height: 175 }`, simulando o fim do onboarding): **200**, recálculo disparado com sucesso usando os placeholders mesclados com o peso/altura reais — `dailyProteinTarget=112, dailyCalorieTarget=2556, dailyCarbTarget=335`, **idêntico** ao caso de referência já validado no CP-A (homem/30 anos/70kg/175cm/moderatelyActive/Wellness/maintain). `weightHistory` ganhou sua primeira entrada (`{ weight: 70, recordedAt: ... }`). Confirma que a correção não só destrava a criação da conta como se integra sem atrito com a lógica de recálculo já existente (intocada).

**(b) Google OAuth — Caso 3 (primeiro acesso via Google):**

Limitação honesta: não há como dirigir o fluxo de autorização real do Google (navegador + conta Google real) neste ambiente. `exchangeCodeForTokens`/`getUserInfoFromToken` — a troca de código com os servidores do Google — nunca foram a causa do bug e não foram re-testados aqui. O que **era** o bug (o que acontece depois de um `userInfo` válido) foi testado de verdade: script que importa `UserModel`, `generateAccessToken`/`generateRefreshToken` e `getAccountCreationBodyProfileDefaults()` **reais** (não reimplementados) e reproduz, literal e integralmente, o bloco do Caso 3 pós-correção, contra o MongoDB Atlas real.

| Passo | Resultado |
|---|---|
| `UserModel.create()` com payload estilo-Google (`googleId`, `profilePhoto`, sem senha) + os 4 placeholders | Sucesso, sem `ValidationError` |
| `generateAccessToken`/`generateRefreshToken` reais sobre o usuário criado | Tokens gerados |
| `GET /users/me` via HTTP real com o `accessToken` gerado | **200**, perfil completo (`googleId`-based account, `profilePhoto` presente, `password` ausente) |

Confirma: a causa raiz (campo obrigatório ausente em `UserModel.create()`) está corrigida também no caminho Google — o mesmo tipo de objeto que o Caso 3 real monta, passado pela mesma função real, cria conta e autentica com sucesso.

**Limpeza:** as 2 contas de teste (`cp-a2-prompt2-register-*@test.blendi.local`, `cp-a2-prompt2-google-*@test.blendi.local`) foram removidas ao final (`deleteMany`, `deletedCount: 2`), confirmado por consulta independente (`0` remanescentes). Servidor de dev subido só para este teste foi encerrado ao final.

---

## Tarefa 2 — avaliação do histórico de peso

### Como o histórico realmente cresce (auditoria de código, antes de olhar dados)

Único ponto de escrita em todo `apps/api/src`: `updateMe` (`user.controller.ts`, bloco `weightHistoryEntry`) — uma entrada nova **só quando** `weight` vem no corpo do `PATCH /users/me` **e** é diferente do valor já salvo. Não há cron, migração nem nenhum outro endpoint que grave nele.

Auditoria do app mobile (`grep` por `weight:` fora das telas de onboarding, e por `weight` em `EditSettingType`/`EditSettingSheet.tsx`/`MeScreen.tsx`): **nenhuma tela pós-onboarding envia `weight`** — `EditSettingType` só lista `model/goal/protein/carbs/calories/hydration/unitSystem/language/theme`, peso não é editável em nenhum lugar depois do cadastro. O único call site real do app inteiro que pode gerar uma entrada é `OnboardingMacrosScreen.tsx` ("Finish setup"), executado **uma única vez por conta**, sempre.

**Conclusão estrutural, não suposição:** sob o conjunto de telas hoje existente, cada conta está matematicamente limitada a **0 ou 1** entrada em `weightHistory`, para sempre — não "cresce lentamente", **não tem caminho de crescimento nenhum** além desse primeiro registro, até que uma feature futura (ainda não construída) permita editar peso depois do onboarding.

### Dados reais (MongoDB Atlas, banco `test` — o único banco que existe hoje; o produto não lançou, ver "External Services Status" em `docs/README.md`)

| Métrica | Valor |
|---|---|
| Total de contas | **3** |
| Tamanho médio de `weightHistory` | **0** |
| Tamanho máximo observado | **0** |
| Contas com 2+ entradas | **0** |
| Conta mais antiga | 2026-10-05 (14 dias) |

(Consulta rodada após a limpeza das 2 contas de teste da Tarefa 1 — números refletem só contas reais pré-existentes, não inflados pelos meus próprios testes.)

### Decisão (registrada, não só adiada)

**Paginação/limite de tamanho NÃO é necessário agora.** Não por "o volume esperado é baixo" (a frase vaga que já estava no comentário da rota desde o CP-A.2, nunca reavaliada) — por uma razão concreta e verificável: o crescimento está **estruturalmente limitado a no máximo 1 entrada por conta** sob o conjunto de telas hoje existente, e os dados reais confirmam isso (3 contas, 0 entradas em todas). Implementar paginação agora protegeria contra um cenário que o próprio código não permite acontecer.

**Condição explícita para reabrir esta decisão** (não "revisar de novo depois", um gatilho concreto): no momento em que qualquer tela do app passar a permitir editar peso **depois** do onboarding (ex.: um registro diário de peso, uma tela de progresso) — nesse momento o modelo de crescimento muda de "no máximo 1, sempre" para "N ao longo do tempo", uma pergunta de escala completamente diferente, que deve ser reavaliada com dados reais daquele momento (não com os números deste documento, que ficam obsoletos no instante em que essa feature existir).

Nenhuma mudança de código foi feita para esta tarefa, por decisão explícita baseada nos dados acima — conforme instrução do prompt.

---

## Resumo

**Tarefa 1:** causa raiz identificada (4 campos obrigatórios desde o CP-A, nunca fornecidos por nenhum dos dois caminhos de criação de conta) e corrigida com placeholders que reaproveitam valores já existentes no sistema (não um viés novo, não uma convenção nova). Cadastro direto testado 100% de ponta a ponta via HTTP real (registro → login → leitura autenticada → PATCH pós-onboarding). Cadastro via Google testado no ponto exato onde o bug vivia (criação da conta, geração de tokens, leitura autenticada), com a troca de código com o Google em si fora do alcance deste ambiente (nunca foi o bug). `tsc --noEmit` limpo em `packages/shared`, `apps/api` e `apps/mobile`. Nenhuma lógica de macro, `updateMe` ou schema Zod tocada.

**Tarefa 2:** avaliação real (auditoria de código + 3 contas reais no único banco existente) conclui que o histórico de peso está estruturalmente limitado a no máximo 1 entrada por conta hoje — paginação não implementada, decisão registrada com o dado que a embasa e com a condição exata que deve reabri-la no futuro.

Nenhuma mudança em metas de macro, no piso de peso-alvo ou na edição manual de gordura (CP-A.3, prompt anterior) — não tocados. Nenhum build, `eas`, commit ou deploy foi executado.
