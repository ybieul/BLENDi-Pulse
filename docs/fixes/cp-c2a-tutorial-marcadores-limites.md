# CP-C2a — Tutorial: marcadores nos textos, limites num lugar só, Timer/Passo a passo, Pro ilimitado e acertos

**Data:** 27/11/2026
**Base:** CP-C2 (sem commit). Este CP também fica sem commit.

## Resultado

| Verificação | Resultado |
|---|---|
| Typecheck (shared, api, mobile) | limpo (o shared agora checa também os testes, `tsconfig.test.json`) |
| Lint (shared, api, mobile) | limpo |
| Suíte do shared (nova) | **25/25** (`level.utils.test.ts` + limites + roteiro) |
| Suíte da API | **1631/1631** (antes 1646: os 21 testes de roteiro foram para o shared; 6 testes de serviço ficaram) |
| Suíte do mobile | **1201/1201** em 80 suítes (antes 1193; +4 marcadores, +1 limpeza do estado, +3 auth store) |
| Como rodar tudo | `pnpm test` na raiz (build do shared + shared + API + mobile) |
| Biblioteca nova | nenhuma |
| Valores de limite | nenhum mudou; as cópias tinham todas o mesmo valor (não precisei parar) |

---

## Tarefa 1 — Limites num lugar só

Fonte única: `packages/shared/src/planLimits.ts` (exportada pelo `@blendi/shared`).

| Constante | Valor | O que é |
|---|---|---|
| `FREE_PULSE_AI_MESSAGES_PER_DAY` | 3 | mensagens do Pulse AI por dia (grátis) |
| `FREE_PULSE_AI_PREVIEWS_PER_DAY` | 1 | prévias bloqueadas do Pulse AI por dia (grátis) |
| `FREE_PANTRY_SCANS_PER_MONTH` | 3 | scans do Pantry por ciclo mensal (grátis) |
| `FREE_PANTRY_PREVIEWS_PER_CYCLE` | 1 | prévias bloqueadas do Pantry por ciclo (grátis) |
| `DAILY_MISSIONS_PER_DAY` | 3 | missões sorteadas por dia |
| `QUICK_WATER_GLASS_ML` | 250 | copo da ação rápida e padrão do `POST /hydration-logs` |

Também em `PLAN_LIMITS` (objeto com os mesmos valores).

### Cada lugar trocado

**API**

| Arquivo | Antes | Agora |
|---|---|---|
| `controllers/pulseAi.controller.ts` | `DAILY_FREE_LIMIT = 3`, `DAILY_FREE_PREVIEW_LIMIT = 1` | `FREE_PULSE_AI_MESSAGES_PER_DAY`, `FREE_PULSE_AI_PREVIEWS_PER_DAY` |
| `controllers/pantryScanner.controller.ts` | `FREE_MONTHLY_SCAN_LIMIT = 3`, `FREE_MONTHLY_SCAN_PREVIEW_LIMIT = 1` | `FREE_PANTRY_SCANS_PER_MONTH`, `FREE_PANTRY_PREVIEWS_PER_CYCLE` (o teto de leituras grátis continua derivado: `(scans + prévia) × PANTRY_READS_PER_SCAN`) |
| `services/missionProgress.service.ts` | `FREE_TIER_SCAN_LIMIT = 3`; `>= 3`, `=== 3`, `< 3` no sorteio (3 lugares) e "three" nas mensagens de erro | `FREE_PANTRY_SCANS_PER_MONTH`; `DAILY_MISSIONS_PER_DAY` nos 3 lugares e nas mensagens |
| `models/DailyMission.ts` | validador `missions.length === 3` | `DAILY_MISSIONS_PER_DAY` |
| `controllers/hydration.controller.ts` | `DEFAULT_HYDRATION_AMOUNT_ML = 250` | `QUICK_WATER_GLASS_ML` |
| `models/HydrationLog.ts` | `amountMl` com `default: 250` | `QUICK_WATER_GLASS_ML` |
| `config/cache.config.ts` | `PANTRY_SCANNER_MONTHLY_LIMIT: 3` | `PANTRY_SCANNER_MONTHLY_LIMIT: FREE_PANTRY_SCANS_PER_MONTH` (ver observação 2) |

**App**

| Arquivo | Antes | Agora |
|---|---|---|
| `screens/PulseAIScreen.tsx` | `DAILY_FREE_LIMIT = 3`; `PANTRY_SCAN_LIMIT_FREE` (do cache.config) | `FREE_PULSE_AI_MESSAGES_PER_DAY`, `FREE_PANTRY_SCANS_PER_MONTH` |
| `components/pulseAi/UsageIndicator.tsx` | `DAILY_QUERY_LIMIT = 3` (bolinhas) | `FREE_PULSE_AI_MESSAGES_PER_DAY` |
| `screens/PantryScannerScreen.tsx` | `PANTRY_SCAN_LIMIT_FREE` | `FREE_PANTRY_SCANS_PER_MONTH` |
| `config/cache.config.ts` | `export const PANTRY_SCAN_LIMIT_FREE = 3` | removida (não tinha outro uso) |
| `components/home/QuickActionTrigger.tsx` | `WATER_CONFIRMATION_AMOUNT_ML = 250` | `QUICK_WATER_GLASS_ML` |
| `components/track/HydrationSection.tsx` | `WATER_CONFIRMATION_AMOUNT_ML = 250` | `QUICK_WATER_GLASS_ML` |
| `services/hydration.service.ts` | `logWater(amountMl = 250)` | `logWater(amountMl = QUICK_WATER_GLASS_ML)` |
| `screens/TrackScreen.tsx` | `logWater(250)` | `logWater(QUICK_WATER_GLASS_ML)` |
| `screens/HomeScreen.tsx` | contador de missões `` `${completedCount}/3` `` | `` `${completedCount}/${DAILY_MISSIONS_PER_DAY}` `` |

Três dessas cópias não estavam na lista do prompt e apareceram na varredura: o validador do `DailyMission`, o `default: 250` do `HydrationLog` e o `< 3` do sorteio de missões.

### Textos i18n do app

**Nenhum texto do `en.json` / `pt-BR.json` cita os limites do plano**, então não houve frase para interpolar. Varri os dois arquivos atrás de 3, 1, 250 e "three"/"três"/"um". Os números que aparecem são outra coisa:
- "3 attempts / 3 tentativas" (`errors.blend_sync_failed_named`, `shoppingList.syncFailedPersistent`): tentativas de sincronização.
- "Generating the recipes uses 1 scan" e "Uses 1 of your {{count}} remaining scans" (`pantryScanner.howToUse.scan`, `usesScan_other`): custo de uma ação, não limite do plano (o restante já vem do servidor em `{{count}}`).
- "Make 1 blend today" (`missions.makeBlend.description`): requisito da missão.
- "up to 250 kcal" (`pantryScanner.howToUse.exampleLight`): exemplo de pedido, não o copo de água.

Os textos do paywall e do Me falam em "ilimitado", sem número.

### Guarda

`packages/shared/src/planLimits.test.ts` lê todo o código (sem testes) de `apps/api/src` e `apps/mobile/src` e falha se:
- voltar uma constante local com um dos nomes antigos e um número;
- aparecer `logWater(<número>)`, padrão de `amountMl` com número ou `default:` numérico no `amountMl`;
- missões forem contadas com número (`selectedTypes.length`, `selectedTypeSet.size`, `missions.length`) ou o contador `completedCount}/<número>` voltar.

Também confere que cada arquivo da tabela acima usa a constante da fonte. Rodei os padrões contra a versão do último commit desses 12 arquivos: o guarda pegaria todos.

---

## Tarefa 2 — Marcadores no roteiro

- **Lista fechada e tipada** (`TUTORIAL_MARKERS` em `packages/shared/src/schemas/tutorial.ts`): `{{waterGlass}}`, `{{freeAiPerDay}}`, `{{freeScansPerMonth}}`, `{{missionsPerDay}}`. Marcador desconhecido, chave solta (`{{` ou `}}`), marcador vazio ou com espaço (`{{ waterGlass }}`) deixam o roteiro inválido.
- **Preenchimento no app** (`features/tutorial/tutorialMarkers.ts` + `TutorialProvider`): `waterGlass` = `useUnits().displayVolume(QUICK_WATER_GLASS_ML)`, o mesmo formatador do botão ("250 ml" no métrico, "8.5 fl oz" no imperial). Os números vêm da fonte única. Trocar a unidade ou o idioma da conta re-planeja o texto, inclusive no meio do tour.
- **Limite do balão no texto preenchido:** `TUTORIAL_MARKER_MAX_LENGTH` reserva o maior valor de cada marcador (copo: 12 caracteres; números: 3). O schema mede o texto com esses tamanhos no lugar dos marcadores (título 48, texto 300). O texto cru tem teto separado de 600, só para cortar lixo.
- **Compatibilidade (regra documentada no schema e no README):**
  - Marcador é parte da `schemaVersion`. Marcador novo = subir `TUTORIAL_SCHEMA_VERSION`.
  - O app antigo recusa o roteiro do servidor, pela `schemaVersion` maior ou pelo marcador desconhecido, e usa a cópia embutida dele. Nunca mostra `{{...}}` cru.
  - Segunda proteção no app: se sobrar `{{`/`}}` depois de preencher, a etapa é pulada (motivo novo `invalidText`, vai para log e analytics).
  - A `schemaVersion` 1 continua: nunca foi publicada sem marcadores (CP-C2 e CP-C2a saem juntos), então ela já inclui os quatro.
- **Etapas com marcador:** `home.logWater`, `home.missions`, `pulseAi.usage`, `pulseAi.pantry`. Nenhum outro texto tinha número de limite. "Two minutes" (boas-vindas) e "last 7 days" (Track) não são limites do plano; ficaram escritos (ver observação 4).
- `contentVersion` 1 → **2**.

Ajuste de texto: em inglês, "a 8.5 fl oz glass" ficaria errado (seria "an 8.5"). O texto passou a "Each tap logs one {{waterGlass}} glass", que funciona nas duas unidades.

## Tarefa 3 — Timer e Passo a passo

| Etapa | Texto novo (en / pt-BR) |
|---|---|
| `blend.timer` | The timer shows how long to blend. When you open a recipe, the time comes from it; without one, set it with the buttons below. Recipes with steps can also be followed one step at a time: switch between Timer and Steps at the top. / O timer mostra quanto tempo bater. Quando você abre uma receita, o tempo vem dela; sem receita, ajuste nos botões abaixo. Receitas com etapas também podem ser seguidas uma etapa por vez: alterne entre Timer e Passos no topo. |
| `blend.modeToggle` (agora **depois** do timer, `order` 215) | This recipe has steps. Tap Steps to follow it one step at a time, and Timer to go back to the countdown. / Esta receita tem etapas. Toque em Passos para seguir uma etapa por vez e em Timer para voltar à contagem. |

"Timer" / "Steps" / "Passos" são os rótulos reais do seletor (`blend.viewModeTimer`, `blend.viewModeSteps`). Sem receita com etapas, o seletor não aparece e a etapa dele é pulada, mas o timer já explicou o Passo a passo. Com receita com etapas, o seletor vem logo depois e só aponta onde tocar.

## Tarefa 4 — Pulse Pro ilimitado

| Etapa | en | pt-BR |
|---|---|---|
| `pulseAi.usage` | … Pulse Pro gives you unlimited Pulse AI. | … Com o Pulse Pro, o Pulse AI é ilimitado. |
| `me.planPro` | Your Pulse Pro plan is active. You get unlimited Pulse AI, more Pantry scans and the full weekly report. | O seu plano Pulse Pro está ativo. Você tem Pulse AI ilimitado, mais leituras da despensa e o relatório semanal completo. |
| `me.planFree` | Pulse Pro gives you unlimited Pulse AI, more Pantry scans and the full weekly report. If you already subscribed, restore your purchase here. | O Pulse Pro dá Pulse AI ilimitado, mais leituras da despensa e o relatório semanal completo. Se você já assinou, restaure a compra aqui. |

As promessas sobre o Pantry ("more Pantry scans" / "mais leituras da despensa") não mudaram. Um teste impede "daily limit" / "limite diário" em qualquer etapa.

## Tarefa 5 — Acertos

- **Exclusão de conta no app:** `auth.store.deleteAccount`, depois do `DELETE /users/me` com sucesso, chama `clearTutorialLocalState(userId)`, que apaga progresso e fila pendente daquele usuário. O roteiro em cache e o estado de outras contas ficam. A conta excluída entra numa lista em memória: uma gravação atrasada do motor (fila terminando depois da exclusão) não recria o estado. **Logout não apaga:** o progresso fica no aparelho para retomar o tour e continua salvo no servidor. Exclusão que falha no servidor não apaga nada.
- **`docs/api/endpoints.md`:** `DELETE /users/me` documentado (seção Users). Cobre a transação, a tabela das 18 coleções com o filtro de cada uma, a revogação na Apple (melhor esforço), o aviso de que a assinatura não é cancelada, a limpeza no aparelho e as respostas 200/401/404/429/500. A seção Tutorial também explica os marcadores.
- **Testes do shared:**
  - Script `test` no `packages/shared`: `node --import tsx --test src/*.test.ts src/*/*.test.ts`, no padrão da API. Usa o `tsx` da raiz do monorepo.
  - Roda agora o `level.utils.test.ts` (que nunca rodava), `planLimits.test.ts` e `tutorial/tutorialContent.test.ts`.
  - Movidos para o shared: schema, marcadores e regras de texto do roteiro.
  - Ficaram na API (`services/tutorial.service.test.ts`): ETag, If-None-Match, roteiro inválido não lança, montagem do update do PATCH, mais as rotas (`controllers/tutorial.controller.test.ts`).
  - Raiz: `pnpm test` = build do shared + shared + API + mobile. Só o shared: `pnpm --filter @blendi/shared test`.
  - **Sem instalar `@types/node` no shared:** os testes usam `node:test`, `node:assert`, `node:fs` e `node:path`. Os tipos mínimos ficam em `src/testing/node-test-shim.d.ts`, que só entra no `tsconfig.test.json` (o `typecheck` do shared agora roda os dois tsconfigs). Se quiser `@types/node` de verdade no shared, é uma dependência nova para aprovar; aí o shim sai.
  - O build do shared deixou de compilar os testes para o `dist` (antes ia um `level.utils.test.js`, que apaguei do `dist`).

---

## Observações (fora do escopo, não mexi)

1. **Imperial com ponto em pt-BR:** o `displayVolume` formata fl oz com `toFixed(1)`, então em pt-BR aparece "8.5 fl oz" (com ponto) no botão e agora no tour. Mantive o mesmo formatador do botão, como pedido. Trocar para vírgula muda o botão também.
2. **`PANTRY_SCANNER_MONTHLY_LIMIT` e `PANTRY_SCANNER_PRO_LIMIT` (999) no `apps/api/src/config/cache.config.ts` não são usados em lugar nenhum.** O primeiro agora aponta para a fonte única; os dois poderiam sair num CP de limpeza.
3. **Bônus de 20 XP das missões** (`dailyMission.controller.ts`, `xpAvailable`) é outro número escrito à mão, fora da lista deste CP.
4. **"Last 7 days" (Track)** está escrito no roteiro e no app (`track.last7Days`); é o período do gráfico, não limite do plano. Se mudar, precisa de marcador.
5. **Logs da revogação da Apple** (`user.controller.ts`) incluem o `userId`. Não é nome nem e-mail, mas é identificador da conta num log de erro. Já era assim antes.

## Checklist do aparelho (além do CP-C2)

- [ ] Conta imperial: etapa da água mostra "8.5 fl oz", igual ao botão.
- [ ] Trocar a unidade em Me e "Ver tutorial de novo": o texto da água acompanha.
- [ ] Plano grátis: bolinhas, Pantry e missões com os números certos; Pro: "Pulse AI ilimitado".
- [ ] Blend sem receita: o timer explica o Passo a passo. Com receita com etapas: o seletor aparece depois do timer.
- [ ] Excluir uma conta de teste no aparelho e criar outra: o tour abre do zero.

## Arquivos

**Novos:** `packages/shared/src/planLimits.ts`, `planLimits.test.ts`, `tutorial/tutorialContent.test.ts`, `testing/node-test-shim.d.ts`, `tsconfig.test.json`; `apps/api/src/services/tutorial.service.test.ts` (substitui `tutorialContent.test.ts`); `apps/mobile/src/features/tutorial/tutorialMarkers.ts`, `tutorialMarkers.test.tsx`; `apps/mobile/src/store/auth.store.tutorial.test.ts`; este relatório.

**Alterados:**
- shared: `index.ts`, `package.json` (scripts `test` e `typecheck`), `tsconfig.json` (testes fora do build), `schemas/tutorial.ts` (marcadores), `tutorial/tutorial.content.ts` (textos, `contentVersion` 2).
- API: os 7 arquivos da tabela da Tarefa 1.
- App: os 9 arquivos da tabela da Tarefa 1; o motor (`tutorialPlanner.ts`, `TutorialController.ts`, `TutorialProvider.tsx`, `tutorial.types.ts`, `tutorialStorage.ts`) e seus testes; `store/auth.store.ts`.
- Raiz e docs: `package.json` da raiz (`test`), `docs/api/endpoints.md`, `docs/tutorial/README.md`, `docs/fixes/cp-c2-tutorial-guiado.md` (tabela de etapas com marcadores e exemplos preenchidos), `docs/README.md`.
