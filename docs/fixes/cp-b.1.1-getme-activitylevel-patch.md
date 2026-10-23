# CP-B.1.1 — `getMe` incompleto e investigação de `activityLevel` no PATCH

**Contexto:** o [CP-B](cp-b-coleta-birthdate-biologicalsex-weightgoal-onboarding.md) documentou, como achados fora de escopo, que (1) `GET /users/me` não retorna `birthDate`/`biologicalSex`/`weightGoal`/`weight`/`height`/`activityLevel`, e (2) `activityLevel` nunca chega no PATCH real de `OnboardingMacrosScreen.tsx`. Este CP trata o achado 1 (pré-requisito real do CP-B.1, que vai ler o perfil via `getMe` para decidir sobre a flag de "perfil completo") e investiga o achado 2 a fundo antes de assumir onde está o bug.

## TAREFA 0 — Investigação

**0.1 — `getMe` incompleto (confirmado).** `getMe` (`apps/api/src/controllers/user.controller.ts:186-259`) monta a resposta campo a campo — nunca por spread do documento. Comparado com a interface `IUser` completa (`apps/api/src/models/User.ts:86-225`), os campos ausentes na resposta:

| Campo | Status |
|---|---|
| `weightGoal`, `weight`, `height`, `birthDate`, `biologicalSex`, `activityLevel` | Ausentes — achado original do CP-B |
| `targetWeight` | Ausente — mesmo bug, não citado no achado original, incluído neste fix por decisão explícita do usuário |
| `password`, `googleId` | Corretamente ausentes (`select: false` no schema exclui ambos da query por padrão — `.lean()` não tem relação com essa exclusão, só converte o documento Mongoose em objeto plain) |
| `passwordChangedAt`, `tokenVersion` | Corretamente ausentes (uso interno de segurança — nunca deveriam ir ao client) |
| `scanCount`, `scanResetDate`, `dailyAiUsage`, `aiUsageResetDate`, `isActive`, `updatedAt`, `supplementStack`, `weightHistory` | Ausentes, mas fora de qualquer achado deste CP — não tocados |

**0.2 — `activityLevel` no PATCH: achado não reproduz.** Citando `updateMe` (`apps/api/src/controllers/user.controller.ts:785-821, 866-873, 1029`):

```ts
const { ..., activityLevel, ... } = parsed.data;                                     // linha 797
const updates = { ..., ...(activityLevel !== undefined && { activityLevel }), ... };  // linha 816
const shouldRecalculateMacroTargets = ... || activityLevel !== undefined || ...;      // linha 869
// resposta do PATCH:
activityLevel: user.activityLevel,                                                   // linha 1029
```

`activityLevel` já é destructurado de `parsed.data`, já entra no `$set` quando presente no corpo, já é gatilho de recálculo e já volta na resposta. `git blame` nessas 4 linhas aponta o commit `cf652dc6` ("CP-A and Fixes", 2026-10-21) — um dia antes deste CP. **Não existe bug de persistência no backend.**

A causa é 100% client-side: `OnboardingMacrosScreen.tsx` (mobile) nunca inclui `activityLevel` no corpo do PATCH que envia — o backend recebe o campo `undefined` e corretamente não o altera (semântica padrão de PATCH parcial). Isso está estabelecido por **duas** fontes independentes, não uma inferência: (a) o CP-B já havia confirmado por grep estático, na Tarefa 0.1 do doc original ("Desvio encontrado... confirmado por grep (zero ocorrências de `activityLevel` em `OnboardingMacrosScreen.tsx` antes deste CP)"); (b) reconfirmado agora, nesta sessão, por grep direto contra o estado atual do working tree (`grep -n "activityLevel" apps/mobile/src/screens/onboarding/OnboardingMacrosScreen.tsx` → 0 ocorrências, mesmo com o CP-B ainda não commitado). O teste real do PATCH (Tarefa 4, passo 4 do CP-B) mostra só o *sintoma* consistente com essa causa (o valor antigo não mudou) — a causa em si vem do grep, não do teste de PATCH isolado. Fora do escopo deste CP (que é só backend).

**Decisão tomada com o usuário:** Tarefa 2 (fix de `activityLevel` no PATCH) foi pulada — não há bug de backend para corrigir, e alterar `OnboardingMacrosScreen.tsx` contrariaria a restrição original de não tocar no app mobile. O gap do mobile permanece documentado como achado fora de escopo (já estava no CP-B).

## TAREFA 1 — Fix: `getMe` retornando os campos ausentes

**1.1.** Adicionados a `getMe` (`apps/api/src/controllers/user.controller.ts:224-230`), no nível raiz da resposta (mesmo formato já usado pelos demais campos, sem aninhamento novo): `weightGoal`, `weight`, `height`, `targetWeight`, `activityLevel`, `birthDate`, `biologicalSex`.

**1.2 — Sanidade.** Nenhum campo sensível exposto: `password`/`googleId` continuam fora (`select: false` no schema já exclui ambos de qualquer query por padrão, com ou sem `.lean()`); `tokenVersion`/`passwordChangedAt` não foram referenciados — a resposta continua construída campo a campo, não por spread.

## TAREFA 2 — `activityLevel` no PATCH

Não aplicável — ver Tarefa 0.2. Nenhuma alteração de código feita aqui.

## TAREFA 3 — Testes reais

Executado contra o Atlas real (ambiente `development`, servidor local `tsx watch` apontando para a mesma `MONGODB_URI` do `.env`), conta descartável `cp-b11-test-<timestamp>@example.com`.

1. `POST /auth/register` → conta criada com os placeholders de sempre (`birthDate`: 30 anos atrás, `biologicalSex: male`, `weightGoal: maintain`, `activityLevel: moderatelyActive`).
2. `GET /users/me` (getMe já corrigido) → confirmou os 4 placeholders obrigatórios (`weightGoal`, `activityLevel`, `birthDate`, `biologicalSex`) presentes na resposta pela primeira vez. `weight`/`height`/`targetWeight` ausentes do JSON porque ainda `undefined` (comportamento esperado, idêntico ao de `updateMe`).
3. `PATCH /users/me` com os 7 campos (`weight: 78`, `height: 180`, `targetWeight: 72`, `birthDate: "1990-03-15"`, `biologicalSex: "female"`, `weightGoal: "lose"`, `activityLevel: "lightlyActive"`) → resposta já retornou tudo persistido, com macros recalculados (`dailyCalorieTarget`: 2200 → 1651).
4. `GET /users/me` pós-PATCH → confirmou, por leitura real (não pela resposta imediata do PATCH), os 7 valores exatos enviados e `dailyCalorieTarget: 1651` idêntico ao do PATCH — prova de que o recálculo usou o novo `activityLevel` (`lightlyActive`), não o antigo (`moderatelyActive`).
5. PATCH parcial adicional, só `weightGoal: "gain"` (simulando uma edição isolada futura em `MeScreen`) → `weight`/`height`/`targetWeight`/`activityLevel`/`birthDate`/`biologicalSex` permaneceram intocados, `dailyCalorieTarget` recalculado para 2451 usando o `activityLevel: lightlyActive` preservado (não resetado) — confirma que o fix de `getMe` não interferiu na lógica pré-existente de `updateMe`, e reconfirma empiricamente a conclusão da Tarefa 0.2 (não há bug de perda de `activityLevel`).
6. Limpeza: conta excluída via `UserModel.deleteOne` (processo 1) e confirmação de **0 remanescentes** via consulta independente em processo separado (processo 2) — `found: null`.

**Typecheck:** `pnpm --filter @blendi/api exec tsc --noEmit` → exit 0. `pnpm --filter @blendi/shared exec tsc --noEmit` → exit 0 (não alterado, checado por precaução já que `getMe` lê campos do schema compartilhado). Nenhum outro pacote alterado.

## Resumo

Implementado: `getMe` agora retorna `weightGoal`, `weight`, `height`, `targetWeight`, `activityLevel`, `birthDate` e `biologicalSex`, reaproveitando o mesmo formato de resposta já usado. Testado de ponta a ponta contra o Atlas real, com prova empírica de que os valores persistidos pelo PATCH são corretamente relidos.

**Achado 2 (`activityLevel` no PATCH) não teve fix de código** — investigação encontrou que o backend já persiste o campo corretamente desde o commit `cf652dc6` (2026-10-21). O gap real está em `OnboardingMacrosScreen.tsx` (mobile), fora do escopo deste CP (back-end only) e documentado como pendência futura.

**Dependência do CP-B.1 resolvida:** `getMe` agora expõe os campos reais de perfil (incluindo os 3 coletados pelo CP-B). Importante notar, como o próprio CP-B já havia analisado: isso **não** resolve sozinho a detecção de "perfil completo", porque um usuário real com os mesmos valores dos placeholders (ex.: 30 anos, `male`, `maintain`) continua indistinguível deles. O CP-B ainda precisa decidir e implementar esse flag dedicado e *sticky* — ele sugere, textualmente, um **exemplo** de nome ("a forma robusta é um flag booleano dedicado (**ex.** `hasRealBodyProfile`)"), não um nome fechado; o CP-B.1 é livre para adotar esse nome ou outro. Este CP apenas garante que `getMe` tem os dados crus disponíveis caso esse flag (ou qualquer outra estratégia) precise deles.
