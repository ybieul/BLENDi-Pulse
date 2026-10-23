# CP-B — Coleta real de birthDate/biologicalSex/weightGoal no onboarding mobile

**Contexto:** desde o [CP-A.7](cp-a.7-fallback-onboarding-calculate-macros.md), `POST /users/calculate-macros` tem um fallback que preenche `birthDate`/`biologicalSex`/`weightGoal` com o que já está salvo no perfil quando o mobile não envia esses 3 campos. Isso destravou o onboarding, mas é um stopgap: o app nunca tinha, em lugar nenhum, uma tela que coletasse esses 3 dados — a conta ficava para sempre com os placeholders do [CP-A.4](cp-a.4-registro-de-conta-e-historico-de-peso.md) (`birthDate` = 30 anos antes do registro, `biologicalSex: 'male'`, `weightGoal: 'maintain'`). Este CP resolve isso coletando os 3 campos de verdade em `OnboardingBodyScreen` e persistindo-os no PATCH real de fim de onboarding.

## TAREFA 0 — Investigação

**0.1 — Ponto real de persistência.** `OnboardingMacrosScreen.tsx:181` — `await api.patch('/users/me', payload)`. Payload montado em `OnboardingMacrosScreen.tsx:169-179`: `blendiModel, goal, dailyProteinTarget, dailyCalorieTarget, dailyCarbTarget, unitSystem`, mais `weight`/`height` condicionais.

**Desvio encontrado (fora da suposição original do prompt):** `activityLevel` **nunca** era enviado nesse PATCH, apesar de ser coletado em `OnboardingBodyScreen` e salvo no store. Confirmado por grep (zero ocorrências de `activityLevel` em `OnboardingMacrosScreen.tsx` antes deste CP). É uma lacuna pré-existente, fora do escopo — ver seção "Achado fora de escopo" abaixo, com evidência real coletada na Tarefa 4.

**0.2 — Valores literais** (`packages/shared/src/schemas/user.ts:24-25`):
```ts
const biologicalSexValues = ['male', 'female'] as const;
const weightGoalValues = ['lose', 'maintain', 'gain'] as const;
```

**0.3 — `birthDateSchema`** (`packages/shared/src/schemas/user.ts:116-129`): string ISO 8601 pura (`YYYY-MM-DD`, sem hora/fuso), transformada em `Date`, com `refine` de idade plausível usando `MIN_PLAUSIBLE_AGE_YEARS = 13` / `MAX_PLAUSIBLE_AGE_YEARS = 120` (linhas 85-86). Nada mudou desde o CP-A.2.3.

**0.4 — Transporte de estado:** store Zustand `useOnboardingStore` (`apps/mobile/src/store/onboarding.store.ts`), em memória, resetado se o app fechar. Cada tela grava sua parte via actions; `OnboardingMacrosScreen` lê tudo para montar o PATCH final.

## TAREFA 1 — Mapa de implementação

| Campo | Componente reaproveitado | Onde entrou |
|---|---|---|
| `biologicalSex` (2 opções) | Chip-row inline, mesmo padrão já usado para `activityLevel` em `OnboardingBodyScreen.tsx` | Nova seção, após o chip-row de atividade |
| `weightGoal` (3 opções) | Mesmo padrão de chip-row | Nova seção, após `biologicalSex` |
| `birthDate` | **Nenhum componente existente** (confirmado: zero ocorrências de date-picker, nenhuma lib instalada em `apps/mobile/package.json`) — reaproveitado `AuthInput` (mesmo componente de peso/altura), com máscara manual `DD/MM/AAAA` | Terceiro input, junto de peso/altura |

Validação de idade reaproveita o próprio schema Zod do backend (`calculateMacrosSchema.shape.birthDate.safeParse(...)`), não uma constante duplicada.

## TAREFA 2 — Implementação em `OnboardingBodyScreen.tsx`

- `birthDate`: `AuthInput` com máscara `maskBirthDateInput`/`birthDateInputToIso`, validado via `calculateMacrosSchema.shape.birthDate.safeParse(...)` (o schema real do backend). Mensagem de erro: `errors.validation.number_range` (idade fora de 13-120, chave já existente) ou `onboarding.birthDateFormatError` (formato malformado, chave nova).
- `biologicalSex`/`weightGoal`: chip-rows, mesmo visual de `activityLevel`, com legenda (`sectionLabel`) acima de cada grupo.
- `canFetch` estendido para exigir os 3 campos válidos/selecionados, igual já exigia peso/altura — decisão deliberada: sem isso, o usuário poderia pular os 3 campos novos e o app continuaria usando o fallback do CP-A.7 indefinidamente, anulando o propósito deste CP. O link "Pular por agora" (`handleSkip`) continua intocado.
- Payload de `calculate-macros` (`runMacrosCalculation`) passou a incluir os 3 campos reais — nenhum campo existente foi removido ou alterado.
- `onboarding.store.ts`: `SetBodyDataInput`/`setBodyData` estendidos com os 3 campos (mesma action, já que são salvos no mesmo momento que weight/height/activityLevel).

**Achado corrigido durante a própria implementação:** a chave `onboarding.birthDateFormatError` originalmente criada nunca era usada — o código caía na chave genérica `errors.validation.invalid_option` ("Opção inválida selecionada."), confusa para um campo de data. Corrigido antes de prosseguir.

## TAREFA 3 — Persistência real em `OnboardingMacrosScreen.tsx`

Os 3 campos foram lidos do store e incluídos no payload do PATCH com o mesmo padrão condicional de `weight`/`height` (`if (x !== null) payload['x'] = x`).

**Decisão (seguindo precedente já existente):** os 3 campos **não** foram adicionados ao `useAuthStore.getState().updateUserProfile(...)` (cache local pós-PATCH) — confirmado que `AuthUser` (`apps/mobile/src/services/auth.service.ts:22-63`) nem modela `weight`/`height`/`activityLevel`, e por isso esse cache local já não os incluía mesmo sendo enviados no PATCH hoje. Mesmo precedente seguido para os 3 campos novos.

**3.2 — Recálculo automático confirmado por citação** (`apps/api/src/controllers/user.controller.ts:866-873`, nenhuma mudança de backend):
```ts
const shouldRecalculateMacroTargets =
  weight !== undefined || height !== undefined || activityLevel !== undefined ||
  weightGoal !== undefined || birthDate !== undefined || biologicalSex !== undefined ||
  goal !== undefined;
```
`birthDate`, `biologicalSex` e `weightGoal` já eram gatilhos. Nenhum cálculo novo foi implementado.

## TAREFA 4 — Teste real

Executado contra o Atlas real (ambiente `development`, servidor local `tsx watch` apontando para a mesma `MONGODB_URI` do `.env`), com conta descartável `cp-b-test-<timestamp>@example.com` (domínio reservado para teste, RFC 2606 — não gera spam a terceiros).

1. `POST /auth/register` → conta criada com os placeholders do CP-A.4.
2. `POST /users/calculate-macros` **sem** os 3 campos novos (dispara o fallback do CP-A.7, usa os placeholders salvos: 1996-10-19/male/maintain) → `bmr: 1586, tdee: 2181, dailyCalorieTarget: 2181`.
3. `POST /users/calculate-macros` **com** os 3 campos reais (`birthDate: "1985-06-15"`, `biologicalSex: "female"`, `weightGoal: "lose"`, mesmo peso/altura) → `bmr: 1365, tdee: 1877, dailyCalorieTarget: 1377`. **Resultado diferente do passo 2, prova que os valores reais — não o fallback — foram usados** no cálculo.
4. `PATCH /users/me` real, espelhando exatamente o payload de `OnboardingMacrosScreen.tsx` (sem `activityLevel`, como o código real envia) + os 3 campos novos → resposta já retorna `birthDate: "1985-06-15T00:00:00.000Z"`, `biologicalSex: "female"`, `weightGoal: "lose"`.
5. Consulta direta ao Atlas via `UserModel` (mesmo padrão do CP-A.4, já que `GET /users/me` não serializa esses 3 campos — achado à parte, ver abaixo) confirmou, de forma independente: `birthDate: 1985-06-15`, `biologicalSex: female`, `weightGoal: lose` — **os valores reais, não os placeholders**.
6. `GET /users/me` pós-PATCH confirmou os macros recalculados persistidos (`dailyCalorieTarget: 1616`, igual ao retornado pelo PATCH).
7. Limpeza: conta excluída via `UserModel.deleteOne` (processo 1) e confirmação de **0 remanescentes** via consulta independente em processo separado (processo 2, conexão nova a um shard diferente do cluster) — `null`.

**Typecheck:** `pnpm --filter @blendi/mobile exec tsc --noEmit` → exit 0. **Lint:** `eslint` nos 2 arquivos `.tsx` tocados → exit 0. Nenhum outro pacote foi alterado.

### Achados fora de escopo (não corrigidos, só documentados)

1. **`activityLevel` nunca é enviado no PATCH real de `OnboardingMacrosScreen.tsx`** — confirmado também empiricamente no teste real (passo 4 acima): o PATCH persistiu `activityLevel: "moderatelyActive"` (o placeholder do CP-A.4), não `"lightlyActive"` usado no calculate-macros, fazendo o `dailyCalorieTarget` final (1616) divergir do preview mostrado na tela anterior (1377). Pré-existente a este CP, fora do escopo pedido (só os 3 campos birthDate/biologicalSex/weightGoal).
2. **`GET /users/me` não serializa `birthDate`, `biologicalSex`, `weightGoal`, `weight`, `height` nem `activityLevel`** (`apps/api/src/controllers/user.controller.ts`, `getMe`) — só `PATCH /users/me` os retorna (no corpo de resposta imediato). Combinado com a decisão da Tarefa 3 de não cachear esses 3 campos localmente (ver acima), o app mobile hoje não tem **nenhuma** forma de reler `birthDate`/`biologicalSex`/`weightGoal` depois que o onboarding termina — nem do backend, nem de um cache local.

   **Isso é um pré-requisito real do CP-B.1, não um rodapé — mas a dependência não é "corrigir o `getMe` pra expor esses 3 campos crus".** Essa correção específica não resolveria o problema que o CP-B.1 precisa resolver: um usuário real de 30 anos, `male`, `weightGoal: 'maintain'` é **indistinguível** dos placeholders do CP-A.4, então nenhuma heurística sobre os valores salvos (crus ou via `getMe`) detecta completude de forma confiável — já era esse o motivo de adiar a flag de "perfil completo" para uma tarefa própria, e continua valendo aqui.

   Também não dá pra fechar essa lacuna com um corte por `createdAt` (que o `getMe` já expõe, sem precisar de mudança): o link "Pular por agora" (`handleSkip`, intocado por este CP) deixa uma conta **criada depois do CP-B** tão presa nos placeholders quanto uma de antes, porque `birthDate`/`biologicalSex`/`weightGoal` continuam `null` no store e o PATCH simplesmente omite os 3 campos quando o usuário pula. Nenhuma heurística baseada em "quando a conta nasceu" é confiável.

   A forma robusta é um **flag booleano dedicado** (ex. `hasRealBodyProfile`), setado no backend só quando os 3 campos chegam **juntos** num PATCH real (distinguindo submissão real de fallback/edição parcial) — exposto via `getMe` no lugar dos 3 campos crus. Requisito de design a levar para o CP-B.1: esse flag precisa ser **sticky** (uma vez `true`, nunca volta a `false`) — depois do onboarding o usuário edita `weightGoal` isoladamente via `MeScreen`, num PATCH que não traz os outros 2 campos; se a lógica recalculasse o flag a cada PATCH conferindo se os 3 vieram juntos, ele oscilaria incorretamente para `false` nessa edição legítima.

## Checklist de verificação visual no Expo Go (manual, não executado por este CP)

- [ ] Os 3 campos novos aparecem em `OnboardingBodyScreen` na ordem esperada: birthDate (3º input, após peso/altura) → chips de sexo biológico → chips de objetivo de peso.
- [ ] Máscara `DD/MM/AAAA` funciona digitando e apagando (backspace) sem travar o cursor.
- [ ] Mensagem de erro aparece só depois de 10 caracteres digitados, nunca enquanto o campo está incompleto.
- [ ] Erro de idade implausível (ex. digitar um ano muito recente) mostra "Insira um valor entre 13 e 120" em pt-BR.
- [ ] Erro de data malformada (ex. mês 13) mostra "Insira uma data válida no formato DD/MM/AAAA."
- [ ] Botão "Calcular meus macros" só habilita depois de peso, altura, data de nascimento válida, sexo biológico e objetivo de peso preenchidos.
- [ ] IMC calculado aparece corretamente depois de preencher tudo.
- [ ] Ao avançar, os valores digitados aparecem corretos no payload real (inspecionar via Flipper/log de rede) enviado tanto ao `calculate-macros` quanto ao PATCH final.
- [ ] Testar em en-US e pt-BR (textos traduzidos corretamente nos dois idiomas).

## Resumo

Implementado: os 3 campos (`birthDate`, `biologicalSex`, `weightGoal`) agora são coletados de verdade em `OnboardingBodyScreen`, validados no client reaproveitando o schema Zod real do backend, enviados ao `calculate-macros` (preview) e persistidos no PATCH real de fim de onboarding — substituindo definitivamente os placeholders do CP-A.4 para qualquer conta que complete o onboarding a partir desta versão. Testado de ponta a ponta contra o Atlas real, com prova empírica de que os valores reais (não o fallback do CP-A.7) são os efetivamente usados no cálculo e persistidos no banco.

**Fica para o CP-B.1:** a flag de "perfil completo" para identificar contas ainda nos placeholders e o fluxo de "complete seu perfil" para elas — explicitamente fora de escopo aqui, por decisão já tomada no prompt original.

**Pré-requisito real do CP-B.1 (não resolvido aqui, tratar antes de implementar):** o CP-B.1 precisa decidir sua estratégia de detecção de completude antes de implementar; qualquer estratégia vai exigir um sinal novo exposto via API — não necessariamente os 3 campos crus, e provavelmente um flag dedicado e sticky, não uma heurística sobre valores salvos. Ver análise completa no Achado 2 da seção "Achados fora de escopo".

**Também fora de escopo, mas vale considerar em algum CP futuro:** o Achado 1 da seção acima (`activityLevel` nunca enviado no PATCH).
