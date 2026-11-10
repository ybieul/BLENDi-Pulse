# CP-1.1.1b — Tela "Minhas metas", avisos de meta e correções pequenas

**Contexto:** continuação do CP-1.1.1a ([cp-1.1.1a-onboarding-additions.md](cp-1.1.1a-onboarding-additions.md)).
O campo `dietaryPreferences` existia e o backend já o aceitava, mas não havia
lugar no app para editar a dieta depois do onboarding. Decisão do Gabriel: as
metas nutricionais e a dieta ganham uma tela própria; modelo e goal ficam no Me;
dados de corpo ficam no `CompleteProfileScreen`.

**Resultado em uma linha:** tela nova `NutritionGoalsScreen` (4 metas + dieta,
validação com os limites do `packages/shared`, PATCH só com o que mudou, avisos
do backend no campo certo, confirmação ao sair, teclado/rolagem tratados),
4 linhas saíram do Me, onboarding alinhado aos limites do resto do app, badge de
modelo só para quem tem BLENDi, rótulo "Sem laticínios". Typecheck dos 3
workspaces limpo, API 102/102, mobile 357/357 em 22 suítes; o lint tem **1 erro
pré-existente** (ver "Verificação"). Teste ao vivo feito (respostas abaixo) e, depois,
uma bateria de testes adversariais + pentest que achou e corrigiu 5 problemas na
própria tela (ver "Correções vindas do pentest" e
[cp-1.1.1b-testes-pentest.md](cp-1.1.1b-testes-pentest.md)).
**Nenhuma mudança de comportamento no backend.**

---

## Pontos que precisam do seu olhar (leia primeiro)

1. **Hidratação: o shared não exportava os limites.** O prompt cita as constantes
   de proteína/kcal/carbo, mas a hidratação (500–8000) só existia como número
   solto no schema Zod (e no Mongoose). Para a tela não ter número fixo, **exportei
   `DAILY_HYDRATION_TARGET_MIN = 500` e `DAILY_HYDRATION_TARGET_MAX = 8_000`** em
   `packages/shared/src/schemas/user.ts` e o schema Zod passou a usá-las. **Valores
   idênticos; nenhum limite mudou.** O Mongoose (`apps/api/src/models/User.ts`)
   continua com os literais — não toquei no backend. Se preferir reverter e deixar a
   tela com literais, é só apagar essas duas constantes e o `GOAL_LIMITS` da hidratação.

2. **Hidratação e unidade: o que o `EditSettingSheet` faz não é o que o prompt
   supôs.** O prompt diz que a hidratação "respeita a unidade do usuário" no sheet.
   Na verdade o sheet **não converte nada**: `getCurrentEditValue` entrega o valor
   cru em **ml** e o campo edita esse número; só a *linha* do Me exibia
   `displayVolume(...)` (fl oz para imperial). Ou seja, hoje um usuário imperial vê
   "84,5 fl oz" na linha e abre um campo com "2500". Como o prompt manda "manter
   igual ao Me", a tela edita **sempre em ml** (sem conversão) e o rótulo diz
   **"Hidratação diária (ml)"** para não enganar ninguém. A inconsistência
   fl oz/ml já existia e continua nas outras telas (Home/Track exibem na unidade do
   usuário). **Decisão sua:** converter para fl oz na edição para quem é imperial
   (é uma mudança de comportamento, fica para um CP).

3. **O teclado numérico do iOS não tem tecla de retorno.** `number-pad` (que o
   onboarding usa, com `returnKeyType`) ignora "próximo/concluir" no iPhone. Para
   cumprir "botão próximo/concluir" no iOS, a tela tem uma **barra
   (`InputAccessoryView`) acima do teclado** com "Próximo" (campos 1–3) e
   "Concluir" (último). No Android quem faz isso é a ação do próprio teclado
   (`returnKeyType`). O onboarding tem o mesmo limite no iOS; não mexi nele.

4. **Fonte do sistema ampliada e o `AuthInput`.** O `AuthInput` tem altura fixa de
   56 e o rótulo flutuante não tem teto de escala. Na tela nova limitei o **valor
   digitado** a 1,3× (`maxFontSizeMultiplier`), o que evita cortar os números. O
   **rótulo flutuante** continua sem teto (é do componente compartilhado, usado em
   login/cadastro/onboarding, e o prompt pede para não criar variações dele). Com
   fonte muito grande (≥ 1,6×) o rótulo pode encostar no valor. Recomendação para
   um CP: pôr `maxFontSizeMultiplier` também no rótulo do `AuthInput` (beneficia o
   app todo).

5. **Lint: 1 erro que já existia.** `CompleteProfileScreen.tsx:279`
   (`no-unnecessary-type-assertion`) — confirmado em `main` com `git stash` (já
   constava no relatório do CP-1.1.1a, e o arquivo está no "não mexer"). Todo o
   resto do lint está limpo, com `--max-warnings 0`.

6. **Achado pré-existente do backend (não corrigido).** O pentest mostrou que um JSON
   aninhado em ~5.000 níveis ou mais (≈ 10 KB) devolve **HTTP 500** em qualquer rota com
   corpo JSON (recursão no `express-mongo-sanitize`); o processo não cai e em produção a
   mensagem é genérica. Como este CP não muda o backend, fica só documentado, com a
   recomendação, em [cp-1.1.1b-testes-pentest.md](cp-1.1.1b-testes-pentest.md#achado-pré-existente-do-backend-não-corrigido-este-cp-não-muda-o-backend).

7. **Não validei em aparelho.** Não há simulador/emulador nem `adb` aqui. A lógica
   de teclado/rolagem está coberta por testes, mas **o comportamento real no iOS e
   no Android precisa dos testes manuais da última seção**, principalmente o
   Android (ver "Android: o que encontrei").

---

## O que foi feito, por tarefa

### Tarefa 1 — Tela "Minhas metas"

- [NutritionGoalsScreen.tsx](../../apps/mobile/src/screens/NutritionGoalsScreen.tsx),
  registrada no stack raiz autenticado em
  [RootNavigator.tsx](../../apps/mobile/src/navigation/RootNavigator.tsx) (ao lado de
  `CompleteProfile`, abre por cima das abas, com botão de voltar) e
  `NutritionGoals: undefined` em [types.ts](../../apps/mobile/src/navigation/types.ts).
- Ordem: título e subtítulo → proteína, carbo, kcal, hidratação → aviso de recálculo
  → seção de dieta → botão **Salvar** (fixo no rodapé).
- Campos com o `AuthInput` existente; rótulos reaproveitam
  `onboarding.proteinPlaceholder`, `onboarding.carbTarget`, `onboarding.caloriesPlaceholder`
  (só a hidratação ganhou rótulo novo).
- **Validação** com `GOAL_LIMITS` ([nutritionGoals.utils.ts](../../apps/mobile/src/utils/nutritionGoals.utils.ts)),
  montado só com constantes do shared: proteína 10–800, carbo 0–1.500, kcal 300–15.000,
  hidratação 500–8.000. Erro inline por campo **só depois de digitar algo**, com
  `errors.validation.number_range` (mesmo texto/estilo do onboarding). Só aceita
  inteiros (`"12abc"`, `"1,5"`, `"-3"` são inválidos).
- **Dieta:** novo componente
  [DietaryPreferencesPicker.tsx](../../apps/mobile/src/components/ui/DietaryPreferencesPicker.tsx)
  (os 4 `SelectionCard` + alerta de alergia, chaves `onboarding.diet.*`), usado pela
  tela de dieta do onboarding **e** pela tela nova — sem duplicar lista nem texto.
  `OnboardingDietScreen` passou a usá-lo; os testes dela continuam passando sem alteração.
- **Salvar:** desabilitado sem mudança ou com campo inválido. PATCH só com os campos
  que mudaram (dieta sempre na ordem canônica do shared). Em sucesso: sincroniza o
  usuário local (Zustand), invalida `userProfile` (e `hydrationToday` **só se a
  hidratação mudou**), toast `nutritionGoals.saved` e `goBack()` para o Me.
  - O Me também sincronizava o usuário local ao salvar uma meta, e
    `WeeklyReportScreen`/`HistoryScreen` leem as metas de lá (sem query); por isso a
    tela nova faz o mesmo (`updateUserProfile(patch)`).
- **Erro:** mensagem traduzida (`getAxiosErrorTranslationKey`) no rodapé, acima do
  botão; o que foi digitado fica; dá para tentar de novo; o erro some ao editar.
- **Durante o envio** os campos ficam bloqueados (`editable={!isSaving}`), os cards de
  dieta ignoram o toque e um segundo toque em "Salvar" é barrado (`isSavingRef`). Se a
  pessoa sair da tela com o envio em voo, o resultado ainda sincroniza o usuário local e
  as queries, mas não chama `goBack()`. Uma resposta 2xx com corpo fora do contrato conta
  como salvo (ver "Correções vindas do pentest").
- **Sair com alteração não salva:** `beforeRemove` + `Alert` ("Descartar alterações?")
  — cobre o botão de voltar, o gesto do iOS e o botão físico do Android. Depois de
  salvar, o `goBack()` automático não é barrado (flag), e sem alteração sair é livre.
  Digitar de volta o valor original também conta como "sem alteração".

### Tarefa 2 — Responsividade e teclado

Padrão do `AuthScreenLayout`/`OnboardingLayout` (`KeyboardAvoidingView` `padding` no
iOS / `height` no Android + `ScrollView` `keyboardShouldPersistTaps="handled"` +
insets de área segura), mais o que o padrão sozinho não garante:

| Requisito | Como foi resolvido |
|---|---|
| Campo em foco nunca escondido (nos 4, inclusive o último) | Ao focar, `scrollTo` até o topo do campo (menos 24 pt), usando `onLayout` de cada campo. Quando o teclado termina de abrir (`keyboardDidShow`) a rolagem é **reforçada** — cobre o último campo em telas altas, onde o primeiro `scrollTo` ainda roda contra a área rolável antiga. Não depende de o sistema rolar sozinho (iOS e Android diferem). |
| "Salvar" alcançável com o teclado aberto | **Fixo no rodapé, fora do `ScrollView`.** Motivo: a tela é longa (4 campos + 4 cards de dieta ≈ 1.100 pt); no fim do conteúdo exigiria rolar tudo com o teclado aberto. Fixo, ele sobe junto com o teclado nas duas plataformas e fica sempre à vista. Com o teclado aberto a folga da barra inferior some (eventos de teclado), para o botão encostar nele. |
| Teclado numérico, próximo/concluir | `number-pad`; `returnKeyType` `next`/`done` + `onSubmitEditing` encadeia o foco (Android); barra "Próximo/Concluir" no iOS (ponto 3 acima). `submitBehavior="submit"` evita o teclado piscar entre campos. |
| Tocar fora fecha o teclado sem perder o valor | `keyboardShouldPersistTaps="handled"` (toque em área sem filho que trate o toque fecha o teclado) + `keyboardDismissMode` (`interactive` no iOS, `on-drag` no Android). Valor fica no estado, não no campo nativo. |
| Área segura | `paddingTop = insets.top + 12` no conteúdo; rodapé com `insets.bottom + 16` (teclado fechado). |
| Tela pequena (iPhone SE) / grande | Layout em coluna única sem alturas fixas além do `AuthInput`/`AuthButton`; os cards de dieta crescem com o texto. Estimativa (não medida em aparelho): no SE, com teclado numérico aberto, sobram cerca de 300 pt de área rolável acima do rodapé — cabe um campo com erro/aviso. |
| Fonte ampliada sem corte | Textos quebram linha; cards/avisos crescem; valor digitado com teto 1,3× (ponto 4 acima). |

#### Android: o que encontrei

- `app.json` **não** define `android.softwareKeyboardLayoutMode` → o Expo gera
  `android:windowSoftInputMode="adjustResize"` (default confirmado em
  `@expo/config-plugins` 54.0.5, `WindowSoftInputMode.js`).
- **Expo SDK 54 / RN 0.81.5 / `newArchEnabled: true`:** o edge-to-edge está **sempre
  ligado** (`edgeToEdgeEnabled` aparece como `@deprecated` em `@expo/config-types`:
  "Android 16+ requires edge-to-edge… can't be disabled"). RN chama
  `setDecorFitsSystemWindows(false)` em `ReactActivityDelegate`/`WindowUtil.kt`.
- Em edge-to-edge o `adjustResize` **não redimensiona a janela sozinho**; quem
  informa o teclado ao JS é o `ReactRootView` (`keyboardDidShow` com altura =
  `ime.bottom − systemBars.bottom`). Por isso o app depende do `KeyboardAvoidingView`
  (`height`) — que é exatamente o padrão que Auth/Onboarding já usam. Não há
  `react-native-keyboard-controller` no projeto, e não adicionei dependência nativa.
- Consequência para a tela: nada de `adjustPan`/`adjustResize` manual; uso o mesmo
  `KeyboardAvoidingView` + a rolagem explícita até o campo + botão fixo. **Não pude
  rodar no Android** — o teste manual nº 1–3 abaixo é o que confirma.

### Tarefa 3 — Me

- Saíram do card de configurações as linhas de proteína, carbo, kcal e hidratação;
  entrou **"Minhas metas"** (valor: `150g · 2.100 kcal`, do perfil/usuário local) entre
  goal e unidade, abrindo a tela nova via `getParent().navigate('NutritionGoals')`.
  Modelo, goal, unidade, idioma e tema ficam como estavam; a linha de gordura continua
  comentada. O card agora tem **6 linhas**.
- Removido o que ficou sem uso: casos `protein`/`carbs`/`calories`/`hydration` do
  `EditSettingType`, de `TITLE_KEYS`, de `isNumericType`, de `getCurrentEditValue` e
  dos dois `switch` de `handleConfirmEdit` (inclusive a invalidação de
  `hydrationToday`, que foi para a tela nova); import e uso de `useUnits`
  (`displayVolume` só servia à linha de hidratação). `fat` ficou intacto.
- **Efeito fora do Me?** Conferi: `EditSettingType`/`EditSettingSheet` só são usados
  por `MeScreen` e pelo próprio sheet/teste; as chaves de tradução removidas só eram
  usadas por esse código. **Nenhum efeito fora do Me.**
- Chaves órfãs removidas de en e pt-BR: `me.settingCarbs`, `me.edit.{protein,carbs,calories,hydration}Title`,
  `profile.fields.{protein_target,calories_target}`. Mantidas: `me.edit.fatTitle`, `profile.fields.fat_target`.

### Tarefa 4 — Avisos de meta

- `parseGoalWarnings` lê `data.user.warnings` e mapeia **por `code`** (mapa tipado
  `code → { field, chave }`, sem cast; a `message` do backend nunca vai para `t()`).
  Codes confirmados em `macroCalculation.utils.ts`: `macros/protein-below-range`,
  `protein-above-range`, `calories-below-bmr`, `calories-above-tdee`,
  `carb-below-range`, `carb-above-range`. Os dois de gordura e qualquer code
  desconhecido são ignorados; lista ausente/malformada vira "sem avisos".
- Textos curtos, sem tom de alarme e sempre dizendo que **a meta foi salva**
  (`nutritionGoals.warnings.*`, en e pt-BR).
- Com aviso: fica na tela, toast de sucesso, e cada aviso aparece num quadro **âmbar**
  (`overlay.warning`, ícone `alert-circle-outline`, `accessibilityRole="alert"`) logo
  abaixo do campo do `field` — distinto do vermelho do erro de validação. Editar o
  campo apaga o aviso dele. Sem aviso: volta para o Me.
- Duas decisões minhas (o prompt não cobria): (a) um aviso cujo `field` não é o campo
  que o `code` descreve é ignorado (melhor sumir que aparecer no campo errado);
  (b) ao salvar só outro campo, o aviso de um campo **não tocado** continua visível
  (o valor dele não mudou e o backend não o reavalia), e a decisão de voltar ao Me
  olha só a resposta atual.
- Limite do backend (não é bug da tela): os avisos só existem em edição manual pura
  e dependem de peso/BMR salvos. Conta que pulou o corpo no onboarding não recebe
  avisos de proteína/carbo/kcal.

### Tarefa 5 — Onboarding

- [OnboardingMacrosScreen.tsx](../../apps/mobile/src/screens/onboarding/OnboardingMacrosScreen.tsx)
  valida com `DAILY_PROTEIN_TARGET_VALIDATION_MIN/MAX` (10–800),
  `DAILY_CALORIE_TARGET_MIN/MAX` (300–15.000) e `DAILY_CARB_TARGET_MIN/MAX` (0–1.500).
- A faixa de **recomendação** de carbo virou constante própria
  (`CARBS_RECOMMENDATION_MIN/MAX` = 50/800), desacoplada da validação: o texto
  continua "…50–800g de carboidratos". Recomendação de proteína/kcal (por goal) intacta.
- Testes atualizados/novos: 450 g de proteína e 400 kcal aceitos; extremos aceitos
  (10/800, 300/15.000, 0/1.500); logo além bloqueados com o erro no campo certo; PATCH
  com os valores novos; texto de recomendação inalterado.

### Tarefa 6 — Badge de modelo

[badges.utils.ts](../../apps/mobile/src/utils/badges.utils.ts): `BadgeProfile` ganhou
`blendiOwnership?`; os 3 badges de modelo só contam com modelo igual **e** posse
`blendi` (campo ausente = `blendi`). O `MeScreen` passa `displayOwnership` (que já
tinha esse fallback). Testes: Lite+`blendi` ganha; Lite+`other`/`none` não; conta
antiga sem o campo ganha; a posse não afeta os badges de blends/sequência.

### Tarefa 7 — "Sem laticínios"

`pt-BR.json`: `onboarding.diet.dairyFree` = "Sem laticínios". A descrição ("Sem leite,
iogurte, queijo ou whey") continua coerente com a regra do prompt (`promptBuilder.service.ts`:
"no milk, yogurt, cheese, butter, cream, kefir, whey, casein…") e não menciona lactose.
`en.json` não foi tocado. Teste em `locales.test.ts`.

---

## Verificação

| Item | Resultado |
|---|---|
| Typecheck (`pnpm typecheck`: shared, api, mobile) | **limpo** nos 3 |
| Lint (`pnpm lint`, `--max-warnings 0`) | shared e api **limpos**; mobile: **1 erro pré-existente** em `CompleteProfileScreen.tsx:279` (confirmado em `main`); nada novo |
| Suíte da API (`node --test`) | **102/102** em 24 suítes |
| Suíte do mobile (`jest`) | **357/357** em 22 suítes (antes do CP: 124 em 16 no fim do CP-1.1.1a) |
| Bundle `expo export` (iOS + Android, Hermes) | **ok** nas duas plataformas, com a tela e os textos novos dentro |

Arquivos de teste novos/alterados: `NutritionGoalsScreen.test.tsx` (76 testes: valores
iniciais, validação nos limites do shared, botão, PATCH só com o que mudou, dieta,
invalidação de `hydrationToday`, confirmação ao sair, avisos, teclado/rolagem, Android),
`nutritionGoals.utils.test.ts` (72), `MeScreen.test.tsx` (11), `badges.utils.test.ts` (7),
`NutritionGoalsScreen.adversarial.test.tsx` (39) e `nutritionGoals.utils.fuzz.test.ts` (11) —
estes dois últimos são o pentest da tela e o fuzz das regras de valor —
`OnboardingMacrosScreen.test.tsx` (limites e recomendação), `locales.test.ts`
("Sem laticínios", paridade e chaves órfãs), `EditSettingSheet.test.tsx` (`fat` segue
funcionando). Os testes de tela mockam tema/i18n/área segura/API; React Query,
`AuthInput`, `AuthButton` e `SelectionCard` são os reais.

Os avisos de `act(...)` no console vêm das animações do `AuthInput` (já ocorriam nos
testes do onboarding) e não afetam o resultado.

### Teste ao vivo (API local + banco de desenvolvimento)

**Método:** `pnpm exec tsx src/index.ts` (`NODE_ENV=development`, porta 3000) ligada ao
banco `test` do Atlas, igual ao CP-1.1.1a. O alvo foi confirmado com o Gabriel antes de
subir (o `EXPO_PUBLIC_API_URL` do mobile aponta para **produção**; nada foi feito lá).
Conta descartável `cp111b-live-<timestamp>@test.blendi.local` criada por
`POST /auth/register` e apagada por `DELETE /users/me`; **reconciliação direta no
Mongo ao fim: 0 usuários com o padrão `cp111b-live-*` e 0 com `@test.blendi.local`**. API
encerrada e porta 3000 liberada. Script descartável fora do repositório. Campos de
identidade/irrelevantes foram omitidos das respostas abaixo (id, e-mail, nome, datas).

**Preparação (PATCH de corpo, dispara recálculo)** — só para a conta ter peso/BMR/TDEE no backend

`HTTP 200`

```json
{
  "dietaryPreferences": [],
  "dailyProteinTarget": 140,
  "dailyCalorieTarget": 2548,
  "dailyCarbTarget": 306,
  "dailyHydrationTarget": 2500,
  "weight": 70
}
```

**Teste A — PATCH só com proteína alta** — `{ "dailyProteinTarget": 800 }`, peso 70 kg (≈ 11,4 g/kg, acima de 3,5 g/kg)

`HTTP 200`

```json
{
  "success": true,
  "data": {
    "user": {
      "dietaryPreferences": [],
      "dailyProteinTarget": 800,
      "dailyCalorieTarget": 2548,
      "dailyCarbTarget": 306,
      "dailyFatTarget": 85,
      "dailyHydrationTarget": 2500,
      "weight": 70,
      "warnings": [
        {
          "field": "dailyProteinTarget",
          "code": "macros/protein-above-range",
          "message": "warnings.manualMacroEdit.proteinAboveRange"
        }
      ]
    }
  }
}
```

**Teste B — mesma proteína junto de `weight`** — `{ "dailyProteinTarget": 800, "weight": 72 }`: o recálculo sobrescreveu os 800 g (virou 144) e não há `warnings`

`HTTP 200`

```json
{
  "success": true,
  "data": {
    "user": {
      "dietaryPreferences": [],
      "dailyProteinTarget": 144,
      "dailyCalorieTarget": 2579,
      "dailyCarbTarget": 307,
      "dailyFatTarget": 86,
      "dailyHydrationTarget": 2500,
      "weight": 72,
      "imc": 23.5,
      "imcUnit": "kg/m²",
      "imcClassification": "normal"
    }
  }
}
```

**Extra 1 — proteína alta + dieta + hidratação** — nenhum dos três campos dispara recálculo: o aviso volta e a dieta/hidratação são salvas

`HTTP 200`

```json
{
  "success": true,
  "data": {
    "user": {
      "dietaryPreferences": [
        "vegan",
        "nut_free"
      ],
      "dailyProteinTarget": 800,
      "dailyCalorieTarget": 2579,
      "dailyCarbTarget": 307,
      "dailyFatTarget": 86,
      "dailyHydrationTarget": 3000,
      "weight": 72,
      "warnings": [
        {
          "field": "dailyProteinTarget",
          "code": "macros/protein-above-range",
          "message": "warnings.manualMacroEdit.proteinAboveRange"
        }
      ]
    }
  }
}
```

**Extra 2 — calorias e carboidrato baixos** — `{ "dailyCalorieTarget": 400, "dailyCarbTarget": 10 }`: dois avisos, cada um com o seu `field`

`HTTP 200`

```json
{
  "success": true,
  "data": {
    "user": {
      "dietaryPreferences": [
        "vegan",
        "nut_free"
      ],
      "dailyProteinTarget": 800,
      "dailyCalorieTarget": 400,
      "dailyCarbTarget": 10,
      "dailyFatTarget": 86,
      "dailyHydrationTarget": 3000,
      "weight": 72,
      "warnings": [
        {
          "field": "dailyCalorieTarget",
          "code": "macros/calories-below-bmr",
          "message": "warnings.manualMacroEdit.caloriesBelowBmr"
        },
        {
          "field": "dailyCarbTarget",
          "code": "macros/carb-below-range",
          "message": "warnings.manualMacroEdit.carbBelowRange"
        }
      ]
    }
  }
}
```

**Extra 3 — só hidratação e dieta** — sem `warnings`

`HTTP 200`

```json
{
  "success": true,
  "data": {
    "user": {
      "dietaryPreferences": [],
      "dailyProteinTarget": 800,
      "dailyCalorieTarget": 400,
      "dailyCarbTarget": 10,
      "dailyFatTarget": 86,
      "dailyHydrationTarget": 2800,
      "weight": 72
    }
  }
}
```

**Extra 4 — proteína 801 (acima do limite do shared)**

`HTTP 400`

```json
{
  "success": false,
  "code": "validation/invalid-input",
  "message": "Validation failed.",
  "errors": [
    {
      "field": "dailyProteinTarget",
      "message": "{\"key\":\"errors.validation.number_range\",\"min\":10,\"max\":800}",
      "maximum": 800
    }
  ]
}
```

**Extra 5 — hidratação 8001 (acima do limite)**

`HTTP 400`

```json
{
  "success": false,
  "code": "validation/invalid-input",
  "message": "Validation failed.",
  "errors": [
    {
      "field": "dailyHydrationTarget",
      "message": "{\"key\":\"errors.validation.number_range\",\"min\":500,\"max\":8000}",
      "maximum": 8000
    }
  ]
}
```

**Limpeza — DELETE /users/me**

`HTTP 200` — `{"success":true,"data":{"message":"Account deleted."}}`

**Conferência — login com a conta apagada**

`HTTP 401` — `{"success":false,"code":"auth/invalid-credentials","message":"Invalid email or password."}`

**Conclusões:** (1) PATCH só com proteína alta devolve `macros/protein-above-range` no
`field` `dailyProteinTarget`; (2) a mesma proteína junto de `weight` **não** devolve
aviso e o valor digitado é sobrescrito pelo recálculo (800 → 144) — exatamente o
comportamento que a tela evita por só enviar metas/dieta; (3) dieta e hidratação não
disparam recálculo; (4) os limites do shared (801 e 8001) são rejeitados com 400.

### Correções vindas do pentest

Depois da primeira entrega, o pedido de testes e pentest
([cp-1.1.1b-testes-pentest.md](cp-1.1.1b-testes-pentest.md)) achou 5 problemas **na
implementação deste CP**, todos corrigidos e reverificados:

| # | Problema | Correção |
|---|---|---|
| F1 | Duplo toque em "Salvar" mandava 2 PATCHes (o `isSaving` só chega no próximo render) | `isSavingRef` barra o segundo toque |
| F2 | Campos editáveis durante o envio: o que a pessoa digitava depois de tocar em Salvar sumia ao terminar | campos `editable={!isSaving}`; dieta ignora toque durante o envio |
| F3 | Sair da tela com o PATCH em voo e o servidor responder depois: `goBack()` na tela desmontada podia desempilhar outra | `isMountedRef`: desmontada, só sincroniza usuário/queries e mostra o toast |
| F4 | Resposta 2xx fora do contrato (corpo vazio, `null`, HTML) virava "erro de rede" falso | `parsePatchResponseWarnings(body: unknown)` lê `data.user.warnings` sem presumir formato; 2xx = salvo |
| F5 | `buildGoalsPatch` não filtrava a faixa (o fuzz achou 17135 no PATCH); só o botão protegia | só entra no PATCH valor dentro de `GOAL_LIMITS` (defesa em profundidade) |

---

## Testes manuais para o Gabriel (iOS e Android)

Rodar com a conta já com peso/altura salvos (senão o backend não gera avisos).

1. **Abrir a tela:** Me → "Minhas metas". Confira os 4 valores, o resumo na linha do
   Me e a dieta marcada. Voltar pelo botão da tela e pelo gesto/botão físico.
2. **Último campo com o teclado aberto:** toque em "Hidratação" (4º campo). O campo
   precisa ficar visível acima do teclado, com o "Salvar" também visível. Repita nos
   3 primeiros. **Android é o mais importante** (edge-to-edge; ver "Android: o que
   encontrei") — se o teclado cobrir o campo/botão, me avise com o modelo do aparelho.
3. **Salvar com o teclado aberto:** altere a proteína e toque em "Salvar" sem fechar o
   teclado. Deve salvar na hora (toast "Metas salvas") e voltar ao Me com o novo resumo.
4. **Próximo/Concluir:** no iOS, a barra acima do teclado ("Próximo" → "Concluir" no
   último); no Android, a tecla de ação do teclado. Tocar numa área vazia fecha o
   teclado sem perder o que foi digitado.
5. **Voltar com alteração não salva:** digite algo e volte (botão, gesto do iOS, botão
   físico do Android) → "Descartar alterações?"; "Continuar editando" mantém tudo,
   "Descartar" sai. Sem alteração, sai direto.
6. **Tela pequena e fonte ampliada:** iPhone SE (ou o menor Android) e depois fonte do
   sistema no máximo (iOS: Acessibilidade → Tamanho do texto; Android: Tamanho da
   fonte). Nada cortado nos textos/cards/avisos; observe o rótulo flutuante dos campos
   (ponto 4).
7. **Aviso de meta:** com peso ~70 kg, salve proteína **800** → fica na tela, toast, e o
   quadro âmbar aparece **embaixo do campo de proteína**. Edite a proteína → o aviso
   some. Salve de novo com 160 → volta ao Me. Teste também calorias **400** (abaixo do
   metabolismo basal) e carbo **10**. Troque o idioma (en/pt-BR) e veja o texto.
8. **Erro:** modo avião, altere e salve → mensagem de rede embaixo, valores mantidos;
   ligue a rede e salve de novo.
9. **Hidratação reflete na Home/Track:** mude a hidratação para 3200 → ao voltar, Home
   e Track já mostram a meta nova (invalidação de `hydrationToday`).
10. **Dieta:** marque/desmarque os 4 cards e salve; abra uma receita na Pulse AI e
    confira que a dieta é respeitada. Rótulo pt-BR: "Sem laticínios".
11. **Onboarding:** conta nova → metas com proteína 450 g / kcal 400 / carbo 0 são
    aceitas; texto de recomendação de carbo continua "50–800g".
12. **Badge:** conta com "Other or older model" ou "No BLENDi yet" não ganha mais
    "BLENDi Lite"; conta com BLENDi Lite de verdade continua ganhando.

---

## Arquivos

**Novos:** `screens/NutritionGoalsScreen.tsx`, `utils/nutritionGoals.utils.ts`,
`components/ui/DietaryPreferencesPicker.tsx` e os testes `NutritionGoalsScreen.test.tsx`,
`NutritionGoalsScreen.adversarial.test.tsx`, `nutritionGoals.utils.test.ts`,
`nutritionGoals.utils.fuzz.test.ts`, `MeScreen.test.tsx`, `badges.utils.test.ts`.
Documentação: este arquivo e [cp-1.1.1b-testes-pentest.md](cp-1.1.1b-testes-pentest.md).

**Alterados (mobile):** `MeScreen.tsx`, `EditSettingSheet.tsx` (+ teste),
`OnboardingMacrosScreen.tsx` (+ teste), `OnboardingDietScreen.tsx`, `badges.utils.ts`,
`RootNavigator.tsx`, `navigation/types.ts`, `locales/en.json`, `locales/pt-BR.json`,
`locales.test.ts`.

**Alterado (shared):** `packages/shared/src/schemas/user.ts` — só as duas constantes de
hidratação e o schema usando-as (valores idênticos).

**Não tocados:** backend (`apps/api`), `CompleteProfileScreen`, meta de gordura,
limites de validação e regras dos avisos.
