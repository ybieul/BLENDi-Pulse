# CP-1.1.2 — Tela "Montando seu plano" no fim do onboarding

Item do brief do Jon (Update 1.1). Depois das metas do onboarding, uma tela de cerca de 6 segundos mostra um anel de progresso, passos com os dados da pessoa e fatos do BLENDi, para dar a sensação de que o plano está sendo montado. No brief, essa tela vem antes do paywall. O paywall do fim do onboarding fica para o CP-1.1.3 (Free Trial). Neste CP, a tela leva para a Home, como antes.

Sem mudança no backend nem no payload do `PATCH /users/me`, e sem biblioteca nova.

Verificação final: typecheck nos 3 workspaces, lint, API **573/573** (sem mudança) e mobile **771/771** em 36 suítes (antes 754).

## Resumo

| # | O que mudou | Onde |
|---|---|---|
| 1 | "Finish setup" com sucesso abre a tela nova em vez de concluir o onboarding na hora | [OnboardingMacrosScreen.tsx](../../apps/mobile/src/screens/onboarding/OnboardingMacrosScreen.tsx) |
| 2 | Tela nova: anel com porcentagem, passos personalizados e fatos do BLENDi | [OnboardingBuildingPlanScreen.tsx](../../apps/mobile/src/screens/onboarding/OnboardingBuildingPlanScreen.tsx) |
| 3 | Rota `OnboardingBuildingPlan` com parâmetros e sem gesto de voltar | [OnboardingNavigator.tsx](../../apps/mobile/src/navigation/OnboardingNavigator.tsx), [types.ts](../../apps/mobile/src/navigation/types.ts) |
| 4 | Desenho do anel extraído do GoalRing, sem mudar o GoalRing | [RingArc.tsx](../../apps/mobile/src/components/ui/RingArc.tsx), [GoalRing.tsx](../../apps/mobile/src/components/ui/GoalRing.tsx) |
| 5 | `OnboardingBuildingPlan` passou a disparar `screen_viewed` | [App.tsx](../../apps/mobile/App.tsx) (`TRACKED_SCREEN_NAMES`) |
| 6 | Textos novos em `onboarding.buildingPlan.*` | [en.json](../../apps/mobile/src/locales/en.json), [pt-BR.json](../../apps/mobile/src/locales/pt-BR.json) |

---

## Tarefa 1 — Fluxo

**Antes:** `handleFinish` → `PATCH /users/me` → `updateUserProfile` → `completeOnboarding()` → `resetOnboarding()` → Home.

**Agora:**

1. `handleFinish` na tela de metas: `PATCH /users/me` e `updateUserProfile`, iguais a antes (mesmo payload, mesmo tratamento de erro).
2. Se der certo: `navigation.reset` para `OnboardingBuildingPlan`, com os dados salvos como parâmetros da rota.
3. A tela nova roda por 6 s e chama `concluirOnboarding()`, que faz `completeOnboarding()` e depois `resetOnboarding()`.
4. O `RootNavigator` reage ao `isNewUser: false` e abre o AppFlow (Home), sem navegação manual, como antes.

Se o PATCH falhar, nada muda: o erro aparece na tela de metas (`formError`) e a tela nova não abre.

**Por que `reset` e não `replace`:** o `replace` tiraria só a tela de metas, e voltar ainda levaria ao passo de corpo. O `reset` deixa a tela nova sozinha na pilha do onboarding.

**Parâmetros da rota** (`OnboardingBuildingPlanParams`): `blendiModel`, `blendiOwnership`, `goal`, `dailyProteinTarget`, `dailyCalorieTarget`, `dailyCarbTarget` e `dietaryPreferences`. A tela lê só esses parâmetros, nunca o onboarding store, porque o `resetOnboarding()` limpa o store. Assim, nada que a tela mostra pode ser apagado pelo reset.

**Saída única:** `concluirOnboarding()` é o único ponto de saída da tela. Ela roda uma vez só (guarda por ref) e traz o comentário que marca onde o CP-1.1.3 vai inserir o paywall.

**Voltar bloqueado:**
- iOS: `gestureEnabled: false` na rota.
- Android: o botão voltar é bloqueado por um `BackHandler` que devolve `true`, removido quando a tela desmonta.

### App fechado durante a animação

Comportamento confirmado lendo o [auth.store.ts](../../apps/mobile/src/store/auth.store.ts):

- O PATCH já foi salvo, mas `completeOnboarding()` não rodou, então `onboarding_completed` continua `'false'` no MMKV (gravado no cadastro).
- Ao abrir de novo, `restoreSession` coloca `isNewUser: hasPendingOnboarding()`, que dá `true`, e o `RootNavigator` mostra o onboarding.
- O onboarding store só existe em memória, então o fluxo recomeça do primeiro passo. Isso é intencional e já valia antes.
- Ao concluir de novo, o novo PATCH sobrescreve o anterior, sem erro. Até lá, os dados do primeiro PATCH continuam no servidor.
- Antes deste CP, o mesmo caso já existia, mas só no intervalo curto entre o PATCH e o `completeOnboarding()`. Agora esse intervalo é de 6 s.
- Igual a antes: o `hasRealBodyProfile` só vai para `true` e nunca volta. Se a pessoa preencher o corpo na primeira vez e pular na segunda, ele continua `true`.

## Tarefa 2 — A tela

De cima para baixo:

1. **Título e subtítulo:** "Building your plan" / "Montando seu plano".
2. **Anel** com a porcentagem (0% a 100%) no centro. Ele tem `accessibilityRole="progressbar"` e `accessibilityValue` com o valor atual. Fica roxo (`brand.pulse`) durante o progresso e verde (`feedback.success`) em 100%, como o GoalRing.
3. **Passos**, que vão sendo marcados conforme o anel avança:

| Passo | Texto (en) | Regra |
|---|---|---|
| Modelo | "Calibrating for your BLENDi Lite" | Nome do modelo pelas chaves já existentes (`onboarding.model.*.name`) |
| Modelo (neutro) | "Calibrating safe settings for any portable blender" | Para "Other or older model" e "No BLENDi yet", sem citar modelo |
| Objetivo | "Tuning recipes for Muscle" | Nome do objetivo pelas chaves `onboarding.goal*` |
| Metas | "Setting 150 g protein · 2,300 kcal · 250 g carbs" | Sempre em g e kcal, também no imperial; números com separador do idioma |
| Dieta | "Applying: dairy-free, vegan" | Só aparece com alguma dieta marcada; nomes de `onboarding.diet.*`, em minúsculas |
| Pronto | "Your plan is ready" | Sempre o último |

4. **Card "Did you know?" / "Você sabia?"** com um fato do BLENDi, que troca a cada 2 s com fade. Ele usa `accessibilityLiveRegion="polite"` (Android) e um rótulo com o título e o fato (iOS).

### Tempo

| Constante | Valor | Uso |
|---|---|---|
| `BUILDING_PLAN_DURATION_MS` | 6000 | Duração total, até abrir a Home |
| `READY_HOLD_MS` | 600 | O anel chega a 100% em 5,4 s e fica parado no fim, com "pronto" marcado |
| `FACT_ROTATION_MS` | 2000 | Troca dos fatos |
| `FACT_FADE_MS` | 250 | Cada metade do fade (some, troca, aparece) |

Os timers só começam depois que o sistema responde se "reduzir movimento" está ligado. Todos são limpos ao desmontar. Em 6 s a pessoa vê 3 dos 5 fatos.

### Fatos do BLENDi

Fonte: blendiblender.com/pages/our-story. A lista fica em `BLENDI_FACT_KEYS`, na tela, e para reordenar basta mudar o array. Não acrescente fatos ou números que não estejam na página.

| Chave | en | pt-BR |
|---|---|---|
| `dormRoom` | BLENDi started in a Springfield College dorm room in 2016. | O BLENDi começou num quarto de dormitório da Springfield College, em 2016. |
| `featuredOnTv` | BLENDi has been featured on Good Morning America and The View. | O BLENDi já apareceu no Good Morning America e no The View. |
| `firstPrototype` | The first prototype paired a drill battery with a blender. | O primeiro protótipo juntou uma bateria de furadeira com um liquidificador. |
| `umassEngineers` | 11 UMass engineers helped shape the final design. | 11 engenheiros da UMass ajudaram a chegar ao design final. |
| `firstBatchSoldOut` | The first 300 BLENDi blenders sold out in 2018. | Os primeiros 300 BLENDi esgotaram em 2018. |

### Comportamento

- **Sem botão** de pular nem de voltar.
- **Reduzir movimento** (`AccessibilityInfo.isReduceMotionEnabled`): o anel e a porcentagem andam em saltos, um por passo, sem animação contínua. Os fatos trocam sem fade, e a tela conclui nos mesmos 6 s.
- **Haptic:** toque leve (`ImpactFeedbackStyle.Light`) uma vez, ao chegar em 100%. O onboarding não usava haptic em nenhuma tela. Segui o padrão dos checks do Track e do Pantry Scanner (toque leve, com `.catch` para aparelhos sem suporte).
- **Tela pequena:** conteúdo numa `ScrollView` com as margens da área segura. O anel varia de 120 a 180 pt conforme a tela (cerca de 146 pt num iPhone SE).
- **Fonte grande:** `maxFontSizeMultiplier` 1.3 em todos os textos, o mesmo teto do `AuthInput` (`AUTH_INPUT_MAX_FONT_SIZE_MULTIPLIER`).
- **Visual:** fundo `AuroraBackground` e cores só pelos tokens do tema. As fontes também vêm do tema: `fonts.display` nos títulos e na porcentagem, `fonts.body` no resto.
- **Indicador de passos:** a tela não usa o `OnboardingLayout`, então não aparece nele. O indicador continua com 5 passos.

**Sobre as fontes:** o prompt citava Montserrat (títulos) e Roboto (corpo), mas o tema do app usa Syne (`fonts.display`) e DM Sans (`fonts.body`), carregadas no `App.tsx`. Usei os tokens do tema, como o resto do onboarding. Nenhuma fonte foi trocada.

### Anel compartilhado

O [RingArc.tsx](../../apps/mobile/src/components/ui/RingArc.tsx) contém só o desenho que antes estava dentro do GoalRing: o trilho, o arco com `strokeDasharray`/`strokeDashoffset` e a rotação de -90°. Ele também exporta `getRingGeometry(size, strokeWidth)`.

- O **GoalRing** passou a usar o RingArc, com a mesma geometria, cores, animação (`InteractionManager` + atraso + `Easing.out(cubic)`) e celebração. Na Home e no relatório semanal nada muda.
- A **tela nova** anima um valor de 0 a 1, que vira `dashOffset` por `interpolate`. Assim, o anel acompanha o tamanho da tela.

O GoalRing não servia direto: ele mostra "atual/meta", espera interações, usa outra curva e celebra com escala.

### Textos novos

`onboarding.buildingPlan`: `title`, `subtitle`, `progressLabel`, `stepModel`, `stepModelNeutral`, `stepGoal`, `stepTargets`, `stepDiet`, `stepReady`, `stepDone`, `stepPending`, `factLabel` e `facts.*`. Estão nos dois idiomas, inseridos sem reformatar o resto dos arquivos. Todas as chamadas passam pela checagem estrita do `t()`, sem cast.

---

## Testes

| Arquivo | O que cobre |
|---|---|
| [OnboardingBuildingPlanScreen.test.tsx](../../apps/mobile/src/screens/onboarding/OnboardingBuildingPlanScreen.test.tsx) (novo, 15 testes, timers falsos) | Detalhado logo abaixo |
| [OnboardingMacrosScreen.test.tsx](../../apps/mobile/src/screens/onboarding/OnboardingMacrosScreen.test.tsx) (atualizado) | PATCH ok → `navigation.reset` para a tela nova com os parâmetros certos, sem `completeOnboarding` nem `resetOnboarding`. PATCH falha → erro na tela, sem navegar e sem `updateUserProfile` |
| [onboardingRoutes.test.ts](../../apps/mobile/src/navigation/onboardingRoutes.test.ts) (atualizado) | 6 rotas na ordem (os 5 passos e depois BuildingPlan), tipos com os parâmetros, `gestureEnabled: false`, `screen_viewed`, indicador ainda com 5 passos |

O que o teste da tela nova cobre:

- passos com modelo, objetivo, metas e dieta, nesta ordem;
- Pro+ e Steel com o nome certo;
- sem dieta, o passo da dieta some;
- "other" e "none" com o texto neutro;
- passos marcados conforme o anel avança;
- a lista dos 5 fatos e a troca na ordem, com rótulo e live region;
- saída aos 6 s com `completeOnboarding` e `resetOnboarding` uma vez só, nessa ordem;
- haptic uma vez em 100%;
- desmontar antes do fim não chama nada, limpa os timers e não gera warning;
- "reduzir movimento" sem `Animated.timing`, com o anel em saltos e saída no tempo;
- voltar do Android bloqueado e removido ao desmontar;
- anel como progressbar com o valor atual.

As outras suítes do onboarding já emitiam avisos de `act(...)` (animações do `SelectionCard` e do `AuthInput`) antes deste CP. A suíte nova não emite nenhum.

## Testes manuais no aparelho

1. Fluxo completo até a Home com Lite, Pro+ e Steel: o passo do modelo cita o modelo certo e a Home abre sozinha depois de ~6 s.
2. "Other or older model" e "No BLENDi yet": o passo do modelo mostra o texto neutro.
3. Com duas dietas marcadas o passo aparece; sem nenhuma, ele some.
4. Em imperial, as metas continuam em g e kcal.
5. Com o servidor fora ou em modo avião, tocar "Finish setup": o erro aparece na tela de metas e a tela nova não abre.
6. iPhone SE: nada cortado, conteúdo respeitando o notch e o indicador inferior.
7. Fonte grande no máximo (iOS e Android): o texto cresce até o teto e dá para rolar se precisar.
8. Reduzir movimento ligado: o anel anda em saltos, os fatos trocam sem fade e a Home abre em ~6 s.
9. Android: o botão voltar não faz nada. iOS: o gesto de voltar não funciona.
10. VoiceOver/TalkBack: o anel é lido como progresso com a porcentagem, e o card de fato é anunciado quando troca (no Android, pela região ao vivo).
11. Fechar o app durante a animação e abrir de novo: o onboarding volta do início, completar de novo funciona sem erro e a Home mostra as metas novas.
12. Home e relatório semanal: o GoalRing continua igual.

## Próximo passo (CP-1.1.3)

O paywall do fim do onboarding entra em `concluirOnboarding()`, no [OnboardingBuildingPlanScreen.tsx](../../apps/mobile/src/screens/onboarding/OnboardingBuildingPlanScreen.tsx), antes do `completeOnboarding()`.

## Arquivos

- **Novos:** `OnboardingBuildingPlanScreen.tsx` e o teste dela, `RingArc.tsx`.
- **Alterados:** `OnboardingMacrosScreen.tsx` (só o `handleFinish` e a assinatura, que passou a usar `navigation`), `OnboardingNavigator.tsx`, `navigation/types.ts`, `GoalRing.tsx` (usa o `RingArc`), `App.tsx` (`TRACKED_SCREEN_NAMES`), `en.json`, `pt-BR.json`, `OnboardingMacrosScreen.test.tsx` e `onboardingRoutes.test.ts`.
- **Não mudaram:** backend, payload do PATCH, as outras telas do onboarding, `OnboardingLayout` e o `auth.store`.
