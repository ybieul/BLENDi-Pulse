# CP-L1 — Limpeza antes do build

**Data:** 27/11/2026
**Base:** CP-C2 + CP-C2a (ainda sem commit). Este CP também fica sem commit.

## Resultado

| Verificação | Resultado |
|---|---|
| Typecheck (shared, api, mobile) | limpo |
| Lint (shared, api, mobile) | limpo |
| Suíte do shared | **25/25** |
| Suíte da API, 5 rodadas seguidas | **1639/1639** nas 5 (1631 de antes + 8 do guarda de logs), ~7 s cada, zero falhas |
| Suíte do mobile | **1225/1225** em 82 suítes (antes 1201; +4 barra de água, +12 separador decimal no `useUnits`, +8 outros pontos decimais) |
| Biblioteca nova | nenhuma |
| Valores de limite, XP, regras de IA, Pantry, pagamentos | nenhum mudou |

---

## 1. Barra de água verde na Home

`components/home/GoalRingsSection.tsx`:
- **Cores pelo tema** (`useColors`), não mais pela constante estática. Abaixo da meta: `overlay.info[70]` (a cor de hoje). Meta batida: `overlay.success[70]`, o mesmo token da barra do Track (`BAR_GOAL_FILL`).
- **Quando fica verde:** a cor é uma interpolação do mesmo valor animado da largura. A barra fica verde quando chega ao fim (progresso 1, ou seja, `current >= target` com `target > 0`). Não entrou animação nova: a troca acompanha a animação de largura que já existia.
- **Leitor de tela:** com a meta batida, o rótulo vira "2,500 ml / 2,500 ml, goal reached" / "…, meta atingida" (chave nova `home.hydrationBarGoalReached` em en e pt-BR). O texto visível não muda.
- **Testes:** `GoalRingsSection.test.tsx` cobre meta batida, acima da meta, abaixo da meta e meta zero (que não conta como batida). A cor é conferida depois da animação.

**Outros indicadores conferidos** (nenhum tinha a mesma falha):

| Indicador | Situação |
|---|---|
| Anéis de proteína, carboidratos e calorias (`ui/GoalRing.tsx`) | já ficavam verdes (`feedback.success`) |
| Barras de 7 dias do Track (`track/HydrationSection.tsx`) | já ficavam verdes (`overlay.success[70]`). Usam a constante estática; a família `overlay.success/info` é igual nos dois temas, então o valor é o mesmo (não mexi) |
| Gráfico de água do Histórico (`history/HydrationBarChart.tsx`) | já ficava verde (`BAR_SUCCESS_COLOR` quando `totalMl >= dailyTarget`) |
| Gráfico de macros do Histórico | tem linha de meta, sem cor de "batida" (não é barra de meta diária) |
| Relatório semanal | não tem barra de meta diária |

Os anéis não dizem "meta atingida" ao leitor de tela (só a barra, pedida aqui). Fica como sugestão.

## 2. Vírgula decimal em pt-BR

- Novo `formatFixedDecimal(value, locale, digits = 1)` em `utils/formatNumbers.ts`. Usa o mesmo `Intl.NumberFormat` do `formatDecimal`, sempre com uma casa ("80.0" / "80,0", o formato que o app já mostrava com `toFixed`) e sem separador de milhar, para o texto continuar aceito pelos campos (`parseStrictDecimal` aceita ponto ou vírgula).
- `hooks/useUnits.ts`: `displayVolume` imperial e `displayWeight` (kg e lbs) passam a formatar pelo idioma da conta. "8,5 fl oz", "178,6 lbs" e "70,0 kg" em pt-BR; em en, como antes. Isso vale para o botão de água da Home, o Track, a barra da Home e o `{{waterGlass}}` do tutorial. O `displayVolume` métrico já usava `formatDecimal` ("2.500 ml" em pt-BR).

**Outros `toFixed` com casa decimal mostrados ao usuário:**

| Lugar | O que é | Feito |
|---|---|---|
| `utils/nutritionGoals.utils.ts` `formatGoalDisplayValue` | valor inicial do campo de hidratação em fl oz (Minhas metas) | corrigido ("84,5" em pt-BR) |
| `utils/nutritionGoals.utils.ts` `formatGoalLimit` | faixa em fl oz na mensagem de erro | corrigido ("17,0") |
| `utils/bodyFields.utils.ts` `weightRangeError` | faixa de peso em lbs na mensagem de erro (onboarding e Completar perfil) | corrigido |
| `screens/CompleteProfileScreen.tsx` | peso e altura pré-preenchidos nos campos | corrigido (o campo aceita a vírgula) |
| `screens/onboarding/OnboardingBodyScreen.tsx` IMC (`result.imc.toFixed(1)`) | índice, não unidade de medida | **não mexi** (fora da regra do prompt). Em pt-BR aparece "22.5". Sugestão: mesma troca |
| `screens/HistoryScreen.tsx` proteína média e aderência (`toFixed(0)`) | inteiros, sem casa decimal | não mexi |

`locale` entrou como parâmetro opcional (padrão `en`) nas funções utilitárias, para os testes antigos continuarem iguais. As telas passam o idioma da conta.

**Testes:**
- `utils/volumeUnits.test.ts`: en/pt-BR × métrico/imperial para volume, incluindo 250 ml ("8.5" / "8,5 fl oz"), mais peso em kg e lbs.
- `utils/decimalLocale.cpL1.test.ts`: `formatFixedDecimal`, Minhas metas em fl oz, faixa em lbs, e o texto em pt-BR aceito pelo campo.
- `features/tutorial/tutorialMarkers.test.tsx`: o `{{waterGlass}}` em pt-BR imperial agora é "8,5 fl oz".

## 3. Fator único ml ↔ fl oz

Uma constante só: `ML_PER_US_FLUID_OUNCE = 29.5735`, em `packages/shared/src/blenderLimits.ts` (já existia).
- **Mobile:** `utils/volumeUnits.ts` usa a do shared; `MILLILITERS_PER_FLUID_OUNCE` (29,574) foi removida, e o teste fuzz de metas importa a do shared.
- **API:** `utils/recipeVolume.utils.ts` (regex de fl oz) usa a constante em vez do literal. `recipeText.utils.ts` já usava.

**Testes que mudaram:** só `volumeUnits.test.ts`, que fixava o valor 29,574. Ele passou a conferir 29,5735 e `mlToFlOz(29.5735) = 1`. Nenhum outro resultado de teste mudou: os valores das tabelas (500, 2500, 3000, 8000 ml e as idas e voltas) dão o mesmo número com os dois fatores.

**Valores visíveis que mudam** (a diferença é 0,0005 ml por fl oz):
- Os limites do campo de hidratação em fl oz não mudam (17,0 e 270,5), nem os valores redondos: 250, 500, 1.000, 2.000, 2.500, 3.000, 3.500, 4.000, 5.000 e 8.000 ml dão o mesmo fl oz.
- **ml → fl oz (uma casa):** 285 dos 10.001 valores de 0 a 10.000 ml mudam em 0,1 fl oz, por exemplo 451 ml (15,2 → 15,3), 1.075 ml (36,3 → 36,4) e 1.699 ml (57,4 → 57,5). Aparece no total de água do dia e no histórico para conta imperial, só quando o total cai num desses valores.
- **fl oz → ml (meta digitada em fl oz):** 402 dos 4.001 décimos de 0 a 400 fl oz gravam 1 ml a menos, por exemplo 12,9 fl oz (382 → 381 ml) e 34 fl oz (1.006 → 1.005 ml).
- A API e os limites do liquidificador já usavam 29,5735, então app e servidor agora concordam.

## 4. Constantes sem uso

`PANTRY_SCANNER_MONTHLY_LIMIT` e `PANTRY_SCANNER_PRO_LIMIT` (999) saíram do `apps/api/src/config/cache.config.ts`. A busca em `apps/`, `packages/` e `docs/` (inclusive testes) não achou nenhum uso. O guarda do `planLimits.test.ts` só cita o nome na lista de constantes proibidas com número, para impedir que volte; continua valendo.

## 5. Bônus de XP das missões

- `controllers/dailyMission.controller.ts`: o `xpAvailable` soma `XP_EVENTS.missionBonus` em vez do `20` à mão.
- O bônus concedido de fato (`services/missionProgress.service.ts`, `awardXP(userId, 'missionBonus')` → `xp.service` lê `XP_EVENTS[xpType]`) já usava a mesma entrada. O valor continua 20.
- O guarda (`packages/shared/src/planLimits.test.ts`) agora também falha com `bonusAwarded ? 0 : <número>` e com `xpAvailable… + <número>`, e confere que o controller usa `XP_EVENTS`. Rodei esses padrões contra a versão do último commit e o guarda pegaria.

## 6. Logs sem dado da conta

Helper novo: `apps/api/src/utils/logSafety.utils.ts`.
- `describeErrorForLog(err)` devolve nome, código e status do erro, nunca o objeto bruto. A mensagem só entra com `includeMessage`, quando ela é montada sem valores da conta.
- `redactForLog(text)` mascara e-mail, JWT, token de push e credencial de URI.

**Revogação da Apple** (`user.controller.ts`): o log tem só nome, código e a mensagem, montada em `apple.service.ts` com o código de erro da Apple ou o status HTTP. Sem `userId`. O `err` não carrega token nem e-mail: o corpo da Apple só vira `body.error`, e o token vai no corpo do POST, não no erro. A leitura do `appleRefreshToken` antes da exclusão também saiu sem `userId`.

**Varredura dos `console.error/warn` da API (109 chamadas). Corrigidos (mesma natureza):**

| Arquivo | O que ia para o log | Agora |
|---|---|---|
| `controllers/apple.controller.ts` — identityToken | objeto do `jose`: o erro de validação de claim traz o `payload` do token, **com e-mail** | nome, código e mensagem do jose (sem valores) |
| `controllers/apple.controller.ts` — sem claim e-mail | `sub` da Apple | só a mensagem |
| `controllers/apple.controller.ts` — troca do authorizationCode | `{ err }` bruto | nome, código e mensagem (montada em `apple.service`) |
| `services/email.service.ts` (3) e `controllers/password.controller.ts` | erro do nodemailer (destinatário na mensagem e no `envelope`) | nome, código, status SMTP |
| `services/xp.service.ts` | `userId` + erro de push (pode citar token) | nome e código |
| `controllers/blendLog.controller.ts` (3) | `userId` + erro | `logId`/`missionType` + nome e código |
| `controllers/pulseAi.controller.ts` — conversa não encontrada | `userId` | só `conversationId` |
| `controllers/revenueCatWebhook.controller.ts` | `userId` | só `eventId`/`eventType` (o evento é achado no painel do RevenueCat) |
| "Mission update failed" (favorite, hydration, supplementStack, pantryScanner, pulseAi) | erro do Mongo bruto (chave duplicada traz `keyValue` com userId) | nome e código |
| `jobs/notifications.jobs.ts` (19) | id do usuário na mensagem, `userId` no objeto, erros de push brutos | "Failed to process a user" + nome e código; nenhum id |
| `services/analytics.service.ts` | `{ event, err }` | `event` + nome e código |
| `middlewares/errorHandler.ts` | mensagem e stack do erro não tratado (chave duplicada do Mongo traz o valor na mensagem) | mensagem e stack com e-mail, token e credencial mascarados |
| `index.ts` (unhandledRejection / uncaughtException) e `config/database.ts` (2) | objeto bruto | nome, código, mensagem e stack mascarados |

Nenhum código de evento ou prefixo de log mudou. Os textos dos logs só perderam o id ("Failed to process user <id>" → "Failed to process a user").

**Guarda** (`utils/logSafety.utils.test.ts`): testa o helper com erro do jose com payload, chave duplicada do Mongo e nodemailer com destinatário, além do mascaramento. Também varre todos os `console.error/warn` da API e falha se algum levar `userId`, `email`, `sub`, `user._id`, token, ou o objeto de erro bruto (`err`, `error`, `reason`) como valor.

## 7. Teste instável

**Causa:** o orçamento de tempo da requisição (`services/aiRequestBudget.service.ts`) gravava o prazo com o `Date.now()` real, enquanto o teste usava relógio falso no `aiProvider` e só alinhava os dois depois (`fakeNow = Date.now()`). Na 2ª parte do teste ("12 s, cada chamada leva 1,5 s"), a 3ª tentativa cabe na janela exatamente na borda (4 s + 3 s + 5 s = 12 s). Com a suíte cheia, sobrava 1 ms real: a 3ª tentativa não cabia, a reserva rodava e respondia, e a chamada que devia falhar dava certo ("Missing expected rejection", o erro visto em 19/11, 25/11 e 27/11).

**Correção:** `aiRequestBudgetClock.now` (relógio do orçamento, trocável) passou a ser usado no `runWithAiRequestBudget` e no `getAiRequestRemainingMs`. No teste, ele aponta para o mesmo relógio falso do `aiProvider`, e as 4 linhas de alinhamento saíram. Nenhuma conferência do teste mudou. Em produção, o comportamento é igual (`Date.now()`).

**Prova:** rodei o arquivo com um `Date.now` "sob carga" (cada leitura anda 7 ms). Com o código antigo, "reserva só se ainda couber na janela" falha (18/19); com o novo, passa (19/19). Depois, 5 rodadas completas da API: 1639/1639 em todas.

## 8. Nome do arquivo de teste

`git mv apps/api/src/controllers/pantryScanner.cpB54.test.ts apps/api/src/controllers/pantryScanner.twoStep.test.ts`. Ele cobre as duas etapas (`/read` e `/generate`), por isso "twoStep" e não "twoStepRead"; e já existe um `pantryScanner.cpB7.test.ts`. Referências atualizadas no comentário do `pantryScanner.cpB7.test.ts`, em `docs/fixes/cp-b7-pantry-duas-etapas-lote13.md` e em `docs/fixes/cp-b7b-pedido-conferido-lote14.md`. Nas frases históricas ("o arquivo manteve o nome"), o nome antigo ficou com a nota do novo.

---

## Checklist do aparelho

- [ ] Home, tema claro: registrar água até bater a meta; a barra fica verde no fim da animação.
- [ ] Home, tema escuro: o mesmo.
- [ ] VoiceOver/TalkBack na barra com a meta batida: lê "…, meta atingida".
- [ ] Conta imperial + pt-BR: botão de água da Home mostra "+8,5 fl oz".
- [ ] Conta imperial + pt-BR: Track mostra os totais e o botão com vírgula.
- [ ] Conta imperial + pt-BR: "Ver tutorial de novo", etapa da água com "copo de 8,5 fl oz".
- [ ] Conta imperial + pt-BR: Minhas metas mostra a hidratação com vírgula e aceita digitar "84,5".
- [ ] Conta imperial + en: tudo com ponto, como antes.

## Arquivos

**Novos:** `apps/api/src/utils/logSafety.utils.ts` e `logSafety.utils.test.ts`; `apps/mobile/src/components/home/GoalRingsSection.test.tsx`; `apps/mobile/src/utils/decimalLocale.cpL1.test.ts`; este relatório.

**Renomeado:** `apps/api/src/controllers/pantryScanner.cpB54.test.ts` → `pantryScanner.twoStep.test.ts`.

**Alterados:**
- mobile: `GoalRingsSection.tsx`; `useUnits.ts`; `formatNumbers.ts`; `volumeUnits.ts` e teste; `nutritionGoals.utils.ts` e o teste fuzz; `bodyFields.utils.ts`; `NutritionGoalsScreen.tsx`; `CompleteProfileScreen.tsx`; `OnboardingBodyScreen.tsx`; `tutorialMarkers.test.tsx`; `en.json` / `pt-BR.json` (`home.hydrationBarGoalReached`).
- API: `cache.config.ts`, `dailyMission.controller.ts`, `recipeVolume.utils.ts`, `aiRequestBudget.service.ts`, `aiProvider.service.test.ts`, `pantryScanner.cpB7.test.ts` (comentário), e os logs em `user`, `apple`, `blendLog`, `pulseAi`, `pantryScanner`, `favorite`, `hydration`, `supplementStack`, `password` e `revenueCatWebhook` controllers, `email`, `xp` e `analytics` services, `notifications.jobs.ts`, `errorHandler.ts`, `index.ts` e `database.ts`.
- shared: `planLimits.test.ts` (guarda do bônus).
- docs: `docs/tutorial/README.md`, `docs/fixes/cp-c2-tutorial-guiado.md`, `docs/fixes/cp-c2a-tutorial-marcadores-limites.md` (exemplo pt-BR com vírgula), os dois docs do CP-B7 e `docs/README.md`.
