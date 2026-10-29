# CP-B.1 — Flag de "perfil completo" (sticky, não inferida)

**Contexto:** o [CP-B](cp-b-coleta-birthdate-biologicalsex-weightgoal-onboarding.md) coletou birthDate/biologicalSex/weightGoal de verdade no onboarding, mas deixou documentado que nenhuma heurística sobre os valores salvos consegue distinguir uma conta real (ex.: 30 anos, male, maintain) dos placeholders do CP-A.4. O [CP-B.1.1](cp-b.1.1-getme-activitylevel-patch.md) corrigiu `getMe` para expor os campos crus, mas confirmou que isso **não** resolve a detecção de completude — só deixa os dados disponíveis caso um flag dedicado precise deles. Este CP implementa esse flag.

## TAREFA 0 — Investigação

**0.1 — Ponto real de persistência.** `OnboardingMacrosScreen.tsx:187` — `await api.patch('/users/me', payload)`. Achado fora da suposição original do prompt: esse é o **mesmo** ponto de chamada tanto do fluxo real (`handleContinue`) quanto do "Pular por agora" (`handleSkip`, [OnboardingBodyScreen.tsx:337-339](../../apps/mobile/src/screens/onboarding/OnboardingBodyScreen.tsx#L337-L339), que navega para o mesmo `OnboardingMacros`). Mandar o sinal de completude incondicionalmente nesse handler marcaria contas que pularam como "completo" para sempre — o próprio bug que esta tarefa existe para evitar.

**0.2 — Handler genérico do PATCH.** `MeScreen.tsx:722` — mesmo endpoint, mesmo handler backend (`updateMe`, `user.controller.ts:774-1054`). Confirmado que hoje não há nenhum sinal que distinga "fim de onboarding" de "edição pontual". Achado extra: `EditSettingType` ([EditSettingSheet.tsx:36-46](../../apps/mobile/src/components/me/EditSettingSheet.tsx#L36-L46)) não inclui `weightGoal`/`birthDate`/`biologicalSex`/`activityLevel` — não existia (antes deste CP) nenhuma forma de editar esses 4 campos pela UI do app principal.

**0.3 — Onde exibir "complete seu perfil".** Nada diretamente reaproveitável: `OfflineBanner.tsx` é global e `pointerEvents="none"` (sem CTA). O padrão mais próximo é o card de upsell Pro em `MeScreen.tsx` (~linha 1892, título + lista + `AuthButton` com navegação). Achado crítico: **não existia nenhuma tela alcançável do app principal para editar os 4 campos de corpo** — `OnboardingBodyScreen` só é montada dentro de `OnboardingNavigator`, que `RootNavigator.tsx:67-78` só renderiza quando `isNewUser: true`, mutuamente exclusivo com `AppFlow`. Essa lacuna foi levada ao usuário antes de qualquer código; decisão: construir uma tela nova (`CompleteProfileScreen`), não apenas um banner informativo.

**0.4 — `getMe` suficiente.** Confirmado: uma vez exposto via `getMe`, o campo novo é tudo que o client precisa, sem reavaliar nenhum outro dado.

## TAREFA 1 — Decisão de design

**1.1 — Nome/tipo.** `hasRealBodyProfile: boolean`. Citação literal, não apenas atribuição (o mesmo tipo de afirmação já teve que ser removido uma vez, no CP-B.1.1, por não ter citação): [cp-b-coleta-birthdate-biologicalsex-weightgoal-onboarding.md:79](cp-b-coleta-birthdate-biologicalsex-weightgoal-onboarding.md#L79) — "A forma robusta é um **flag booleano dedicado** (ex. `hasRealBodyProfile`)...". O próprio CP-B já qualifica isso como exemplo, não nome fechado ("ex."), então a decisão de manter esse nome é minha, não uma obrigação herdada — mas a existência da sugestão no texto é, agora, verificável por citação. Tipo boolean (não timestamp) porque nenhum requisito pede "quando", só "se".

**1.2 — Onde é setado.** Só dentro de `updateMe`, quando o sinal explícito do corpo da requisição está presente. Nunca resetado para `false` em nenhum outro lugar do código.

**1.3 — Sinal explícito.** Campo novo e transiente em `updateUserSchema`: `completingBodyOnboarding: z.literal(true)` (packages/shared/src/schemas/user.ts). Nunca persistido no schema do Mongoose — só destructurado em `updateMe` para decidir se seta `hasRealBodyProfile`. Enviado em dois pontos:
- `OnboardingMacrosScreen.handleFinish` — só quando `weight`/`height`/`birthDate`/`biologicalSex`/`weightGoal` estão todos presentes no store (não são `null`), ou seja, só no caminho real, nunca no "Pular por agora".
- `CompleteProfileScreen` (tela nova) — sempre, já que ali os campos são obrigatórios antes do botão habilitar.

**1.4 — Backfill: desnecessário, mas por um motivo diferente do que o prompt assumia.** Toda leitura em `user.controller.ts` usa `.lean()` — com `.lean()`, o Mongoose **não** hidrata um Document e **não** aplica defaults de schema a campos ausentes em documentos antigos (isso só acontece em criação via `UserModel.create()`, nunca em leitura lean de documento já existente). O código já segue o padrão certo para isso: `hasProfilePhoto: user.hasProfilePhoto ?? false` (`user.controller.ts:220`, pré-existente). Segui o mesmo precedente em vez de confiar no default do Mongoose. Confirmado por teste real (Tarefa 4.2) que o fallback funciona mesmo com o campo genuinamente ausente no documento raw do Mongo.

## TAREFA 2 — Implementação backend

- `packages/shared/src/schemas/user.ts` — campo `completingBodyOnboarding: z.literal(true)` adicionado ao objeto de `updateUserSchema` (vira opcional via `.partial()`, como todo o resto do schema).
- `apps/api/src/models/User.ts` — `hasRealBodyProfile: boolean` na interface `IUser` e no schema Mongoose (`default: false`), logo após `activityLevel`.
- `apps/api/src/controllers/user.controller.ts`:
  - `updateMe` (linha ~807): `completingBodyOnboarding` destructurado de `parsed.data`; `updates.hasRealBodyProfile = true` só quando `completingBodyOnboarding === true` — nunca resetado.
  - `getMe` e a resposta de `updateMe` agora expõem `hasRealBodyProfile: user.hasRealBodyProfile ?? false`.

## TAREFA 3 — Implementação mobile

- `OnboardingMacrosScreen.tsx` — sinal enviado condicionalmente (ver 1.3).
- `apps/mobile/src/utils/birthDate.utils.ts` (novo) — máscara/validação/conversão de data extraídas de `OnboardingBodyScreen.tsx` (que passou a importar de lá) para serem reaproveitadas também pela tela nova, sem duplicar lógica. Inclui `isoToBirthDateInput` (novo), o inverso de `birthDateInputToIso`, implementado por string-slicing (sem `new Date()`) para não introduzir um bug de fuso horário (off-by-one-day) ao pré-preencher o campo.
- `apps/mobile/src/screens/CompleteProfileScreen.tsx` (novo) — tela alcançável a partir do banner em `MeScreen`, reaproveitando os chip-rows/validação de `OnboardingBodyScreen`, mas só com os 6 campos de corpo (sem tocar `blendiModel`/`goal`/metas de macro). Pré-preenche com os valores atuais via `getMe` (reais ou placeholders — o usuário sempre revisa e confirma todos os campos, já que não dá para saber qual é qual). Um único PATCH no submit, com `completingBodyOnboarding: true`.
- `apps/mobile/src/navigation/types.ts` e `RootNavigator.tsx` — rota nova `CompleteProfile`, montada no mesmo nível de `Upgrade`/`WeeklyReport` (só quando `!isNewUser`).
- `apps/mobile/src/screens/MeScreen.tsx` — banner condicionado só a `profile?.hasRealBodyProfile ?? false`, entre o header e a seção de stats, navegando para `CompleteProfile`.
- i18n (`en.json`/`pt-BR.json`) — namespace novo `completeProfile` (tela) e `me.completeProfile` (banner); paridade de chaves entre os dois idiomas confirmada por script.

### Bug encontrado e corrigido durante a revisão pós-implementação

Ao revisar o código em busca de problemas (pedido explícito do usuário), encontrei uma inconsistência real: `CompleteProfileScreen` recalcula `dailyProteinTarget`/`dailyCalorieTarget`/`dailyCarbTarget`/`dailyFatTarget` no backend (todos os 6 campos enviados são gatilho de recálculo em `updateMe`), mas a implementação original só invalidava o cache do react-query — sem sincronizar `useAuthStore` (Zustand). `WeeklyReportScreen.tsx:366` e `HistoryScreen.tsx:120` leem essas metas **direto** de `authUser`, sem nenhum fallback de query, ao contrário de `MeScreen`/`HomeScreen`. Isso faria essas duas telas mostrarem metas de macro desatualizadas até o próximo login. **Corrigido**: `handleSave` agora também chama `useAuthStore.getState().updateUserProfile({...})` com os 4 campos vindos da resposta do PATCH — mesmo padrão já usado por `OnboardingMacrosScreen.handleFinish` e `MeScreen.handleConfirmEdit`. Confirmado por teste real que a resposta do PATCH sempre inclui os 4 campos.

### Achados menores, não corrigidos (fora do escopo desta tarefa)

- O chip-row de `activityLevel` (em `OnboardingBodyScreen` e, por reaproveitamento, em `CompleteProfileScreen`) só oferece 4 das 5 opções do enum do backend (falta `extremelyActive`). Pré-existente a este CP. Como nenhuma tela jamais oferece essa 5ª opção, nenhuma conta real pode tê-la hoje — mas se um dia isso mudar, abrir `CompleteProfileScreen` sem tocar no chip-row sobrescreveria silenciosamente `extremelyActive` para `moderatelyActive` no submit. Vale uma tarefa própria se a 5ª opção for exposta em algum lugar.
- Pré-preencher weight/height em imperial e salvar sem editar perde ~0,01-0,1 unidade de precisão (arredondamento de `.toFixed(1)` no round-trip kg↔lbs/cm↔in). Irrelevante na escala de peso/altura humana, mesmo comportamento que o próprio `OnboardingBodyScreen` já tem.
- O sinal `completingBodyOnboarding` é confiado ao cliente (o backend nunca infere a partir de quais campos vieram) — decisão explícita do prompt original, não uma lacuna. Como só os dois pontos corretos (`OnboardingMacrosScreen` com o gate dos 5 campos, e `CompleteProfileScreen` com validação completa antes do submit) enviam esse sinal, não há caminho real para abusar dele hoje.

## TAREFA 4 — Testes reais

Executado contra o Atlas real (ambiente `development`, servidor local já rodando via `tsx watch`), contas descartáveis `cp-b1-test-<timestamp>@example.com` / `cp-b1-test2-<timestamp>@example.com`.

**4.1 — Onboarding real.** `POST /auth/register` → `GET /users/me` confirmou `hasRealBodyProfile: false` (placeholders do CP-A.4). `PATCH /users/me` com os 6 campos reais + `completingBodyOnboarding: true` → resposta já retornou `hasRealBodyProfile: true`. `GET /users/me` subsequente (releitura independente) confirmou o valor persistido.

**4.2 — Conta "antiga" (campo genuinamente ausente).** Em vez de só testar uma conta nova (que já recebe o default via `UserModel.create()`, caminho diferente do fallback `?? false`), removi o campo diretamente do documento raw no Mongo (`$unset`) para simular de verdade uma conta pré-migração. Confirmei por query direta que o campo estava ausente no documento, e então `GET /users/me` ainda retornou `hasRealBodyProfile: false` — prova real do fallback de serialização, não só do default do Mongoose.

**4.3 — Cenário de quebra (teste principal).** Na conta já marcada como completa, `PATCH /users/me` com **só** `{"weightGoal": "gain"}` (sem o sinal, mesma rota que `MeScreen`/`EditSettingSheet` usaria se já editassem esse campo — que hoje não editam, ver achado 0.2) → `weightGoal` mudou para `"gain"`, `activityLevel`/`birthDate`/`biologicalSex` permaneceram intocados, e `hasRealBodyProfile` continuou `true` na releitura via `GET /users/me`. Confirmado: edição isolada não reseta a flag.

**4.4 — Typecheck e limpeza.** `tsc --noEmit` limpo em `@blendi/shared`, `@blendi/api` e `@blendi/mobile`. `eslint` limpo nos arquivos `.tsx`/`.ts` tocados do mobile. Ambas as contas de teste excluídas via `UserModel.deleteOne` (processo 1) e confirmadas com **0 remanescentes** via consulta independente em processo separado, com padrão de busca cobrindo as duas variantes de nome usadas (processo 2).

**4.5 — Checklist de verificação visual no Expo Go (manual, não executado por este CP):**
- [ ] Conta sem `hasRealBodyProfile` (nova, placeholders) mostra o banner "Complete seu perfil" em `MeScreen`, entre o header e os stats.
- [ ] Tocar no banner navega para `CompleteProfileScreen`.
- [ ] `CompleteProfileScreen` pré-preenche peso/altura/data de nascimento/sexo biológico/objetivo de peso/nível de atividade com os valores atuais (reais ou placeholders).
- [ ] Botão "Save" só habilita com peso, altura e data de nascimento válidos e sexo biológico/objetivo de peso selecionados.
- [ ] Após salvar, volta para `MeScreen` e o banner desaparece (sem precisar fechar/reabrir o app).
- [ ] Completar o onboarding de verdade (não pular) também faz o banner nunca aparecer.
- [ ] Completar o onboarding pelo link "Pular por agora" faz o banner aparecer normalmente.
- [ ] Textos em en-US e pt-BR corretos (banner e tela nova).
- [ ] Toggle de unidade (métrico/imperial) em `CompleteProfileScreen` funciona igual ao de `OnboardingBodyScreen`.

## Resumo

Implementado: campo sticky `hasRealBodyProfile` no backend (setado só por sinal explícito em `updateMe`, exposto via `getMe`), sinal enviado pelo onboarding real (nunca pelo "pular"), e uma tela nova (`CompleteProfileScreen`) que fecha a lacuna real encontrada na investigação — não havia, antes deste CP, nenhuma forma de editar birthDate/biologicalSex/weightGoal/activityLevel fora do onboarding inicial. Testado de ponta a ponta contra o Atlas real, incluindo o teste do cenário de quebra (edição isolada não reseta a flag) e uma simulação real de conta pré-migração (campo ausente no documento, não só não-setado). Um bug de sincronização de cache (`authUser` desatualizado após recálculo de macros em `CompleteProfileScreen`) foi encontrado na revisão pós-implementação e corrigido antes da entrega.

**CP-B (coleta real de dados do onboarding) está genuinamente encerrado**: os 3 campos são coletados e persistidos (CP-B), `getMe` os expõe (CP-B.1.1), e agora existe tanto a detecção de completude quanto um caminho real para o usuário completar o perfil fora do onboarding (CP-B.1). Pendências reais que sobravam, nenhuma delas bloqueando este CP: o gap pré-existente de `activityLevel` nunca ser enviado por `OnboardingMacrosScreen` (documentado desde o CP-B, decisão explícita de não tocar — **corrigido em 2026-10-27**, ver [`cp-audit-achado1-activitylevel-onboarding-patch.md`](cp-audit-achado1-activitylevel-onboarding-patch.md)); a 5ª opção de `activityLevel` (`extremelyActive`) ausente de todo chip-row do app; e o checklist de verificação visual no Expo Go (4.5), que é manual e fica para confirmação posterior.
