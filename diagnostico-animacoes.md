# Diagnóstico — Animações reiniciando ao trocar de tab

> Documento temporário de trabalho (será excluído após uso). Registra os resultados de cada
> tarefa do diagnóstico de causa raiz do problema de animações/números reiniciando ao sair e
> voltar para uma tab (ex.: Home → Track → Home).

---

## Tarefa 1 — Comportamento atual de ciclo de vida das telas

**Arquivos lidos:** `apps/mobile/src/navigation/RootNavigator.tsx`, `apps/mobile/src/navigation/AppNavigator.tsx`,
`apps/mobile/src/navigation/TrackNavigator.tsx`, `apps/mobile/src/navigation/PulseAINavigator.tsx`, `apps/mobile/App.tsx`

### Estrutura encontrada

- **RootNavigator** (`RootNavigator.tsx:34-53`): `createNativeStackNavigator` padrão do `@react-navigation/native-stack`. Alterna entre `AuthFlow`, `OnboardingFlow` e `AppFlow` (+ `Upgrade`/`WeeklyReport` soltos no root). Sem customização de ciclo de vida — troca condicional de branch, não relevante ao bug de tabs.
- **AppNavigator** (`AppNavigator.tsx:47-84`): `createBottomTabNavigator` **padrão**, sem nenhuma prop customizada de ciclo de vida. 5 tabs:
  - `Home` → `HomeScreen` direto (Tab.Screen sem stack)
  - `PulseAI` → `PulseAINavigator` (stack aninhado, tela inicial `PulseAIChat`)
  - `Blend` → `BlendScreen` direto
  - `Track` → `TrackNavigator` (stack aninhado, tela inicial `TrackMain`)
  - `Me` → `MeScreen` direto
- **TrackNavigator** / **PulseAINavigator**: `createNativeStackNavigator` padrão, sem `unmountOnBlur` nem nada incomum.
- **App.tsx**: `enableScreens()` é chamado (`App.tsx:12`) — ativa `react-native-screens` para as views nativas, mas **`enableFreeze()` não é chamado** em nenhum lugar do projeto (confirmado por grep). Não há `screenListeners` globais, nem lógica de refetch amarrada a eventos de navegação no `NavigationContainer`.

### Busca por overrides

`grep -rn "unmountOnBlur|detachInactiveScreens|freezeOnBlur|lazy"` em `src/navigation` e `src/screens`: **zero ocorrências relevantes** (único match foi um comentário sobre "lazy" sem relação com navegação). Nenhuma tab ou stack screen força desmontagem ao perder foco, nenhuma usa `lazy` explícito.

### Comportamento padrão resultante (React Navigation v7.3.10)

| Tab | Tipo | Comportamento ao trocar de tab |
|---|---|---|
| Home | Tab.Screen direto | Monta na 1ª visita (lazy padrão), depois **permanece montado** (oculto, não destruído) |
| PulseAI | Tab.Screen → Stack aninhado | Stack monta na 1ª visita e **permanece montado**; `PulseAIChat` nunca desmonta por troca de tab |
| Blend | Tab.Screen direto | Mesmo padrão do Home |
| Track | Tab.Screen → Stack aninhado | Mesmo padrão do PulseAI; `TrackMain` permanece montado |
| Me | Tab.Screen direto | Mesmo padrão do Home |

### Conclusão da Tarefa 1

Com as configurações atuais, **nenhuma tela é desmontada/remontada estruturalmente só por trocar de tab e voltar**. O `bottom-tabs` v7 mantém todas as tabs já visitadas montadas (oculta via `display:none` nativo, não via unmount de React), e o `native-stack` mantém as telas inferiores do stack montadas enquanto o stack existir. `enableScreens()` sem `enableFreeze()` não muda isso — apenas otimiza a camada nativa, sem afetar ciclo de vida de hooks/refs em JS.

Isso significa que a **causa raiz #1 do prompt original (desmontagem/remontagem por navegação) provavelmente não é estrutural** neste projeto. O foco mais provável, a confirmar nas próximas tarefas, são as causas #2 (useEffect com dependência na query) e #3 (refetch com dados idênticos disparando ciclo de update), que ocorrem **mesmo com o componente permanecendo montado**.

Ponto em aberto para as próximas tarefas: verificar se algum componente interno usa `useFocusEffect`, `isFocused` condicional, ou uma `key` dinâmica que force remount local dentro de uma tela já montada — isso seria uma causa estrutural em nível de componente, não de navegador.

---

## Tarefa 2 — HomeScreen

**Arquivos lidos:** `apps/mobile/src/screens/HomeScreen.tsx`, `apps/mobile/src/components/home/GoalRingsSection.tsx`,
`apps/mobile/src/components/ui/GoalRing.tsx`, `apps/mobile/src/components/home/DailyRecipeCard.tsx`,
`apps/mobile/src/components/home/StreakBadge.tsx`, `apps/mobile/src/components/missions/MissionCard.tsx`,
`apps/mobile/src/config/queryClient.ts`

### Contexto importante descoberto (afeta a interpretação de todas as tarefas seguintes)

`grep -rn "focusManager|refetchOnMount|refetchOnWindowFocus|refetchOnReconnect"` em `src/` e `App.tsx`: **zero ocorrências**.
O projeto não registra um `focusManager` do React Query ligado ao `AppState` do RN (padrão comum em apps RN para simular
"refetch on window focus" do web). Isso significa que, hoje, **nenhuma query refaz fetch automaticamente só por uma tab
recuperar o foco** — sem essa integração, o React Query não tem como saber que a tela "voltou a ficar visível". Combinado
com a conclusão da Tarefa 1 (nenhum componente desmonta ao trocar de tab), isso implica que **trocar de tab e voltar, por
si só, não deveria disparar nenhum dos `useEffect` abaixo** nas condições atuais do código — a menos que os dados
realmente mudem de valor entre uma visita e outra (refetch em background pelo `staleTime`, pull-to-refresh, ou mutation
que invalida cache). Esse ponto é importante porque desloca a causa mais provável: não é "o efeito dispara à toa ao
focar a tab", é "o efeito, quando dispara por uma mudança real de dado, **reseta a animação para zero antes de
reanimar** em vez de interpolar a partir do valor atual" — o que looks exactly like a re-entrada do zero para quem está
testando e provocando pequenas mudanças de dado (log de água, pull-to-refresh, etc.) ao alternar de tab.

### Componentes animados auditados

| Componente | Animated.Value | Declaração | Reinicia para 0 antes de animar? | Dependência do efeito |
|---|---|---|---|---|
| `fadeAnim` (fade do conteúdo) — `HomeScreen.tsx:161,210-218` | `useRef` | valor inicial `0`, fixo | Não — só roda quando `isLoading` vira `false` pela 1ª vez | `[isLoading, fadeAnim]` |
| `levelProgressWidth` (barra de nível no header) — `HomeScreen.tsx:168-169,220-233` | `useRef` | valor inicial = progresso real já calculado (`levelInfo.progress * LEVEL_PROGRESS_BAR_WIDTH`) | **Não** — anima direto do valor atual para o novo, sem `setValue` de reset | `[levelInfo.progress, levelProgressWidth]` |
| `hydrationAnimatedProgress` (barra de hidratação) — `GoalRingsSection.tsx:76,78-105` | `useRef` | inicial `0` | **Sim** — `hydrationAnimatedProgress.setValue(0)` incondicional na linha 82, toda vez que o efeito roda | `[hydrationAnimatedProgress, hydrationProgress]` |
| `dashOffset` (arco SVG dos 3 GoalRings: proteína/carbo/calorias) — `GoalRing.tsx:101,104-155` | `useRef` | inicial `circumference` (= 0% preenchido) | **Sim** — `dashOffset.setValue(circumference)` incondicional na linha 116, toda vez que o efeito roda | `[animate, celebrationScale, circumference, dashOffset, isComplete, targetDashOffset]` |
| `celebrationScale` (pulso de comemoração ao completar meta) — `GoalRing.tsx:102,105` | `useRef` | inicial `1` | Resetado para `1` a cada rodada do efeito (correto, é o estado de repouso) | mesmo efeito acima |
| `cardState` / `iconState` / `progressValue` (MissionCard) — `MissionCard.tsx:38-80` | `useRef` (3x) | inicial = estado real da missão (`completed ? 1 : 0`, progresso real) | **Não** — cada `Animated.timing` anima direto do valor atual para o novo `toValue`, sem reset | `[cardState, mission.completed]`, `[iconState, mission.completed]`, `[normalizedProgress, progressValue]` |
| `entryOpacity` / `entryScale` (StreakBadge, entrada) — `StreakBadge.tsx:43-77` | `useRef` | inicial `0` / `0.92` | Roda **uma única vez** (deps são só os próprios refs, estáveis) — é entrada intencional, não amarrada a `streakDays` | `[entryOpacity, entryScale]` |
| `rotation` (StreakBadge, selo lendário ≥30 dias) — `StreakBadge.tsx:45,79-102` | `useRef` | inicial `0` | Reseta e reinicia o loop só quando `isLegendaryStage` muda de fato | `[isLegendaryStage, rotation]` |
| `DailyRecipeCard` | — | — | Sem nenhuma animação — é conteúdo estático (texto derivado de `goal`) | — |

### Achados — problema confirmado

**1. `GoalRing.tsx:104-155` (usado 3× em `GoalRingsSection` para proteína, carboidrato e calorias) — Severidade Alta**

O `useEffect` chama `dashOffset.setValue(circumference)` (linha 116) **incondicionalmente**, toda vez que o efeito roda —
antes de agendar a animação para o valor novo. Como `circumference * (1 - progress) = 0%` preenchido, isso faz o anel
**visualmente esvaziar por completo** e só depois (após `InteractionManager.runAfterInteractions` + `HOME_INTERACTION_DELAY_MS`)
reanimar até o valor real. O `useEffect` depende de `targetDashOffset`/`circumference`/`isComplete`, todos recalculados a
partir das props `current`/`target` a cada render — ou seja, **qualquer mudança real no valor de macro** (mesmo pequena:
um novo log, um pull-to-refresh, um refetch em background depois do `staleTime` expirar) faz os três anéis picarem para
vazio e reencherem do zero, reproduzindo exatamente o sintoma relatado. Causa raiz: **categoria 2** (useEffect cuja lógica
força um reset visual a cada disparo, independentemente de o componente ter desmontado ou não).

**2. `GoalRingsSection.tsx:76-105` (barra de hidratação) — Severidade Alta**

Mesmo padrão: `hydrationAnimatedProgress.setValue(0)` (linha 82) incondicional a cada execução do efeito, antes de animar
até `hydrationProgress`. Qualquer mudança real em `hydrationCurrent`/`hydrationTarget` — inclusive a que o próprio
`handleLogWater` do `HomeScreen` dispara ao invalidar `hydrationToday` (`HomeScreen.tsx:298-304`) — faz a barra colapsar
para 0% e reencher. Causa raiz: **categoria 2**, mesma classe do item acima.

### Comportamento correto (padrão a replicar)

- **`levelProgressWidth`** (`HomeScreen.tsx:220-233`) e **`MissionCard`** (`cardState`/`iconState`/`progressValue`,
  `MissionCard.tsx:55-80`) fazem o que deveria ser feito em todo lugar: o `Animated.timing(...)` anima **direto do valor
  atual do `Animated.Value` para o novo `toValue`**, sem nenhum `setValue()` de reset antes. Resultado: se o valor não
  mudou, nada acontece visualmente; se mudou, a transição é suave a partir de onde a barra/ícone já estava — não há
  "flash" de volta a zero.
- **`fadeAnim`** (`HomeScreen.tsx:210-218`) depende de `isLoading`, que no React Query v5 (`^5.99.2` confirmado em
  `package.json`) é `isPending && isFetching` — fica `false` permanentemente assim que os dados chegam pela primeira vez
  e **não volta a `true`** em refetches subsequentes. Corretamente não reinicia o fade ao trocar de tab.
- **`StreakBadge`** — a animação de entrada roda uma única vez por montagem (deps são só os próprios refs), o que é uma
  animação de entrada intencional, e como a tela não desmonta ao trocar de tab (Tarefa 1), ela de fato só acontece uma
  vez por sessão — comportamento correto, não é um caso do bug relatado.

### Observação para a Tarefa 8 (verificação empírica)

Como a Tarefa 1 e a ausência de `focusManager` indicam que o remount/refetch por navegação **não deveria** ocorrer
estruturalmente, mas o bug foi observado nos testes, vale testar manualmente ao vivo (fora do escopo de leitura estática)
se `react-native-screens` (`enableScreens()` ativo, `App.tsx:12`) causa algum artefato visual em views `Animated`
com `useNativeDriver: false` (caso do `dashOffset` e do `hydrationAnimatedProgress`, ambos JS-driven por usarem
`strokeDashoffset`/`width`, que não suportam native driver) ao destacar/reanexar a view nativa da tab inativa — isso é
uma classe conhecida de comportamento do RN que não é 100% verificável por leitura estática de código.

---

## Tarefa 3 — TrackScreen

**Arquivos lidos:** `apps/mobile/src/screens/TrackScreen.tsx`, `apps/mobile/src/components/track/HydrationSection.tsx`,
`apps/mobile/src/components/track/SupplementCheckItem.tsx`, `apps/mobile/src/components/track/MyStackSection.tsx`

### Nota sobre nomes do prompt vs. código real

O prompt original menciona "HydrationTracker" e pede atenção especial ao "HydrationBarChart" dentro da TrackScreen.
Nenhum dos dois nomes existe literalmente na TrackScreen: o componente real é **`HydrationSection`**
(`components/track/HydrationSection.tsx`), que contém tanto a barra de progresso do dia quanto um mini gráfico de
barras dos últimos 7 dias **embutido nela mesma** (não é o componente `HydrationBarChart` de `components/history/`,
que só é usado pela `HistoryScreen` — esse será coberto na Tarefa 4). Como o mini gráfico de 7 dias dentro do
`HydrationSection` é visualmente equivalente ao que o prompt descreve como "HydrationBarChart" e é, de fato, o
componente mais afetado encontrado até agora, tratei-o com a mesma prioridade aqui.

### Componentes animados auditados

| Componente | Animated.Value | Reinicia para 0 antes de animar? | Dependência do efeito |
|---|---|---|---|
| `progressAnimation` (barra de progresso do dia) — `HydrationSection.tsx:119,141-160` | `useRef`, inicial `0` | **Sim** — `stopAnimation()` + `setValue(0)` incondicional (linha 144-145) | `[progress, progressAnimation]` |
| `barAnimations[7]` (mini gráfico de 7 dias) — `HydrationSection.tsx:125-127,162-191` | `useRef` (array), inicial `0` cada | **Sim** — `setValue(0)` em todas as 7 barras incondicional (linha 165-168) | `[barAnimations, chartData, maxPeriodTotal]` |
| `waterScale` / `waterConfirmationOpacity` / `waterConfirmationTranslateY` (feedback do botão "log water") — `HydrationSection.tsx:120-122,205-253` | `useRef` | N/A — só dispara via `handleLogWater`, não em resposta a dado de query | Chamado imperativamente, não em `useEffect` de dados |
| `progressValue` / `progressScale` (círculo de check do suplemento) — `SupplementCheckItem.tsx:87-131` | `useRef`, inicial = `progressRatio` real | **Não** — guarda de 1º mount (`hasMounted`) evita animar na entrada; depois anima direto do valor atual pro novo | `[consumedTodayCount, progressRatio, progressScale, progressValue]` |
| `progressScale` (pulso de "stack completo") — `MyStackSection.tsx:59,66-93` | `useRef`, inicial `1` | Não — só dispara na transição `false → true` de `isComplete`, guardada por `wasCompleteRef` | `[isComplete, progressScale]` |

### Achado crítico — o pior caso encontrado no diagnóstico até agora

**`HydrationSection.tsx:162-191` (mini gráfico de barras de 7 dias) — Severidade Alta, gatilho confirmado (não hipotético)**

Este é o único caso, até agora, em que a causa raiz **não depende de o dado ter realmente mudado de valor** — o efeito
reinicia a cada *render* da `TrackScreen`, ponto. A cadeia completa:

1. `TrackScreen.tsx:391-393` — `history7Days` é recalculado com `.filter(...)` **direto no corpo do componente, sem
   `useMemo`**, toda vez que `TrackScreen` renderiza. Mesmo que o conteúdo dos dados seja idêntico ao da renderização
   anterior, `.filter()` sempre retorna um **array novo** (nova referência).
2. Esse array é passado como prop `history7Days` para `HydrationSection`.
3. Dentro do `HydrationSection.tsx:132-135`, `chartData = useMemo(() => buildTrailingSevenDays(history7Days, ...), [history7Days, historyTimezone])`
   — como `history7Days` chega com uma referência nova a cada render do pai, esse `useMemo` **nunca acerta o cache**:
   recalcula (e retorna um novo array) toda vez.
4. O `useEffect` das barras (`HydrationSection.tsx:162-191`) depende de `chartData` — como `chartData` é sempre uma
   referência nova, **esse efeito dispara em toda renderização da TrackScreen**, chamando `setValue(0)` nas 7 barras
   e reanimando-as do zero (linha 165-168, 170-183).

Ou seja: qualquer coisa que force a `TrackScreen` a re-renderizar — trocar de tab e voltar não é nem necessário; basta
marcar um suplemento, puxar para atualizar, ou qualquer outro re-render do componente pai — faz o mini gráfico de
hidratação **esvaziar e reencher visivelmente**. Esse é o candidato mais forte para "o componente mais visivelmente
afetado" citado no prompt original, e é o único achado do diagnóstico com causa raiz **categoria 3** genuína (o dado
tecnicamente não mudou de valor, mas a referência do array é recriada a cada ciclo, then o efeito interpreta isso como
"dado novo" e reanima).

**`HydrationSection.tsx:141-160` (barra de progresso do dia) — Severidade Alta**

Mesmo padrão de reset incondicional do `GoalRing`/`GoalRingsSection` (Tarefa 2): `setValue(0)` antes de animar para
`progress`. Aqui o gatilho é apenas mudança real de valor (deps `[progress, progressAnimation]`, `progress` é
primitivo derivado de `todayTotal`/`dailyTarget`) — não sofre do problema de referência instável do item acima, mas
ainda assim reseta visualmente a cada mudança real de hidratação (novo log de água, refetch após `staleTime`).
Causa raiz: **categoria 2**.

### Comportamento correto (padrão a replicar)

- **`SupplementCheckItem.tsx:92-131`** é o melhor exemplo do projeto até agora: usa uma guarda `hasMounted` explícita
  para pular a animação no primeiro mount (define o valor final direto, sem animar) e, em atualizações reais, anima
  **do valor atual para o novo** sem nenhum `setValue()` de reset. É o padrão a copiar para `GoalRing`,
  `GoalRingsSection` e a barra/gráfico do `HydrationSection`.
- **`MyStackSection.tsx:66-93`** também está correto: só anima na transição real `false → true`, guardada por ref —
  não reanima em todo render nem em toda troca de tab.

---

## Tarefa 4 — HistoryScreen e componentes de gráfico

**Arquivos lidos:** `apps/mobile/src/screens/HistoryScreen.tsx`, `apps/mobile/src/components/history/MacroBarChart.tsx`,
`apps/mobile/src/components/history/HydrationBarChart.tsx`, `apps/mobile/src/components/history/SupplementHeatmap.tsx`,
`apps/mobile/src/hooks/useHistoryData.ts`

### Diferença estrutural importante em relação às Tarefas 1–3

A `HistoryScreen` **não é uma tab** — ela é acessada via `navigation.navigate('History')` de dentro do
`TrackNavigator` (`TrackNavigator.tsx:96`), ou seja, é empilhada (push) sobre o stack da tab Track. Isso muda a
conclusão da Tarefa 1: enquanto tabs (Home, Track, PulseAI, Blend, Me) **nunca desmontam** ao trocar de tab, uma tela
empilhada como a History **é genuinamente desmontada quando o usuário volta** (gesto de voltar / botão back — o
`native-stack` remove a tela do array de rotas e ela some da árvore React). Isso significa que, aqui, **desmontagem e
remontagem real acontecem a cada visita** — não é um bug de configuração, é o comportamento padrão e esperado de uma
tela empilhada. Reentrar na History reanimar os gráficos do zero é, portanto, mais próximo de "animação de entrada
intencional em tela nova" do que do sintoma relatado (que é especificamente sobre tabs que permanecem montadas).

### Componentes animados auditados

| Componente | Animated.Value | Reinicia para 0 antes de animar? | Dependência do efeito |
|---|---|---|---|
| `MacroBarChart` (barras empilhadas de macros) — `MacroBarChart.tsx:172,187-213` | `useMemo(() => new Animated.Value(0), [])` — memoizado 1x por montagem | Só quando `period` muda ou `animate` passa de `false→true` (gate de scroll) | `[period, progress, animate]` — **não inclui `data`** |
| `HydrationBarChart` (barras de hidratação por período) — `HydrationBarChart.tsx:163,177-203` | mesmo padrão acima | mesmo padrão acima | `[period, progress, animate]` — **não inclui `data`** |
| `SupplementHeatmap` — bottom sheet (`translateY`/`backdropOpacity`) — `SupplementHeatmap.tsx:95-161` | `useRef` | Só abre/fecha por interação do usuário (`selectedEntry`), nunca por dado de query | `[height, translateY]` (reset ao girar tela) e `[..., selectedEntry, ...]` (abrir/fechar) |

### Achado — comportamento correto (o melhor caso do diagnóstico até agora)

**`MacroBarChart.tsx` e `HydrationBarChart.tsx` — Severidade Baixa**

Ao contrário de todos os componentes com problema encontrados nas Tarefas 2 e 3, esses dois **não** têm `data` nas
dependências do `useEffect` de animação (`MacroBarChart.tsx:213`, `HydrationBarChart.tsx:203` — deps são só
`[period, progress, animate]`). Consequência prática: se a query subjacente (`blendSummaryData`/`hydrationSummaryData`
via `useHistoryData`, Task 4) refizer fetch e devolver valores novos **enquanto a tela continua montada e visível**
(ex.: pull-to-refresh, ou qualquer refetch em background), os retângulos SVG (`AnimatedRect`) simplesmente
reinterpolam para a nova altura instantaneamente (sem replay do zero, porque `progress` já está parado em `1` e só o
`outputRange` da interpolação mudou) — não há o "flash para vazio" das Tarefas 2 e 3. O `useMemo(() => new
Animated.Value(0), [])` com array de dependências vazio também garante que o próprio `Animated.Value` sobrevive a
qualquer re-render subsequente sem ser recriado.

A única vez que a animação de fato reinicia do zero é quando a `HistoryScreen` é genuinemente desmontada e remontada
(voltar e reabrir a tela) — comportamento estrutural esperado do stack, não um bug de código, e gated por
`nutritionVisible`/`hydrationVisible`/`supplementsVisible` (scroll-triggered, `HistoryScreen.tsx:112-149`), que também
resetam para `false` a cada montagem — então a animação nem toca até o usuário rolar a tela de novo. Isso é
consistente com "animação de entrada intencional em tela nova", não com o sintoma relatado no prompt original.

**`SupplementHeatmap.tsx`** também está corretamente implementado: a única animação amarrada a estado é a abertura do
bottom sheet (`selectedEntry`), puramente controlada por interação do usuário — nenhuma dependência de dado de query.

### Cache do React Query (`useHistoryData.ts`)

As 4 queries (`blendSummaryQuery`, `hydrationSummaryQuery`, `supplementSummaryQuery`, `blendInfiniteQuery`) têm
`staleTime: CACHE_CONFIG.BLEND_HISTORY_TTL` configurado (valor exato a confirmar na Tarefa 6) e chave composta por
`[root, timezone, period]`. Como o cache do `QueryClient` é global (não amarrado ao ciclo de vida do componente), ele
**sobrevive** ao unmount/remount da `HistoryScreen` — reentrar na tela com cache ainda válido pula o skeleton de
carregamento (`isLoading` já `false` de imediato), mas **não** pula a reanimação dos gráficos, porque essa reanimação
está amarrada ao mount do componente (`useMemo` recriando `progress` do zero) e ao gate de scroll, não ao estado de
loading da query. Ou seja: cache quente evita o "flash de skeleton", mas não evita — nem deveria evitar, dado que é
comportamento de entrada intencional — a animação de entrada dos gráficos.

### Conclusão da Tarefa 4

Nenhum problema de severidade Alta/Média encontrado aqui. Os dois bar charts de History são, até agora, o melhor
exemplo de implementação do projeto (padrão a seguir para corrigir `GoalRing` e `HydrationSection`). O único reinício
observável — reanimar ao reabrir a tela — é esperado e correto dado que `History` é uma tela empilhada que desmonta de
verdade ao voltar, não uma tab que permanece montada.

---

## Tarefa 5 — PulseAIScreen e MeScreen

**Arquivos lidos:** `apps/mobile/src/screens/PulseAIScreen.tsx`, `apps/mobile/src/screens/MeScreen.tsx`,
`apps/mobile/src/components/history/StatCard.tsx`, `apps/mobile/src/components/gamification/LevelDetailSheet.tsx`

### PulseAIScreen

Único elemento animado: **`badgeScale`** (badge de contagem de favoritos no header) — `PulseAIScreen.tsx:199-216`.
Padrão correto: só dispara `Animated.spring` na transição real `0 → >0` (`prev === 0 && favoritesCount > 0`); se a
contagem for de 0, apenas `setValue(0)` direto (sem animação, esconde o badge); se mudar entre valores não-zero
(ex.: 2 → 3), o efeito roda mas nenhuma das duas condições bate — o número no badge só atualiza via re-render normal
do texto, sem replay de animação. Mesmo padrão de guarda por ref usado em `MyStackSection` (Tarefa 3). **Nenhum
problema encontrado.**

Achado à parte (não é bug, é contexto): `PulseAIScreen.tsx:237-249` registra um **`navigation.addListener('focus',
syncPantryScanStatus)`** — o único listener de foco explícito encontrado em todas as telas auditadas até agora. Ele
só lê `queryClient.getQueryData(...)` (dado já em cache) para sincronizar o contador de scans da pantry; não dispara
refetch nem toca em nenhuma animação. Não contradiz o achado da Tarefa 2 sobre a ausência de `focusManager` global —
é uma sincronização pontual e inofensiva.

O restante da tela (histórico de mensagens em `useState`, banner de "viewing history", etc.) não usa `Animated` e,
como a `PulseAI` é uma tab que nunca desmonta (Tarefa 1), o estado do chat sobrevive naturalmente a trocas de tab —
comportamento correto, sem necessidade de nenhuma mudança.

### MeScreen

**`levelProgressAnim`** (barra de progresso de XP/nível) — `MeScreen.tsx:479,611-624` — **padrão correto**, igual ao
`levelProgressWidth` da HomeScreen (Tarefa 2): valor inicial já é `levelInfo.progress` real (não `0`), e o
`Animated.timing` anima direto do valor atual para o novo, sem `setValue()` de reset. Deps `[levelInfo.progress,
levelProgressAnim]` — só dispara quando o progresso realmente muda.

**`StatCard`** (grid de streak/blends/nível) — `components/history/StatCard.tsx` — **não tem nenhuma animação**; é
texto estático com um `SkeletonLoader` enquanto `isLoading`. O prompt original supõe uma "transição numérica"
animada aqui, mas o componente real apenas troca texto por texto — não há `Animated.Value` envolvido, logo não há
como esse componente reiniciar uma animação.

Nenhum outro elemento animado na `MeScreen` (badges, settings, upgrade card, footer são todos estáticos).

### LevelDetailSheet — usado somente pela HomeScreen (não pela MeScreen)

Nota de discrepância: `grep` confirma que `LevelDetailSheet` só é importado/renderizado em `HomeScreen.tsx:521` — a
`MeScreen` **não** abre esse sheet (seu card de nível, `MeScreen.tsx:1195-1224`, é só exibição inline, sem
`onPress`). O prompt original pede para verificar esse componente sob a Tarefa 5 (MeScreen), mas ele estruturalmente
pertence à Home.

**Estado preservado ao trocar de tab? Sim — corretamente.** `showLevelDetail` é `useState` da `HomeScreen`
(`HomeScreen.tsx:163`), e como a Home nunca desmonta ao trocar de tab (Tarefa 1), esse estado sobrevive
normalmente. Na prática, porém, o `Modal` do RN (`LevelDetailSheet.tsx:147`) é renderizado num layer nativo separado
que fica acima de tudo, inclusive da tab bar — ou seja, com o sheet aberto o usuário não consegue nem tocar nas
outras tabs sem antes fechar o sheet (backdrop ou `onClose`). Isso torna o cenário "abrir o sheet, trocar de tab,
voltar" praticamente inalcançável pela UI normal — mas, se acontecesse (ex.: navegação programática), o estado
seria preservado corretamente. Comportamento correto, nada a corrigir aqui.

**Achado — mesmo padrão de bug das Tarefas 2 e 3, Severidade Média**

`LevelDetailSheet.tsx:107-127` — o `useEffect` da barra de progresso interna do sheet (`progressAnimation`) chama
`progressAnimation.setValue(0)` **incondicionalmente** (linha 113) antes de animar para `levelInfo.progress`, com
deps `[levelInfo.progress, progressAnimation, visible]`. Se o usuário ganhar XP (ex.: completar uma missão) **enquanto
o sheet está aberto**, a barra vai piscar para 0% e reencher — mesma causa raiz **categoria 2** do `GoalRing`
(Tarefa 2) e do `HydrationSection` (Tarefa 3). Severidade Média (não Alta) porque exige que o sheet esteja aberto no
momento exato em que o XP muda, uma janela de exposição bem menor que os componentes sempre visíveis das Tarefas 2 e
3 — mas a correção é idêntica: animar direto do valor atual para o novo, sem o `setValue(0)` prévio.

---

## Tarefa 6 — staleTime e cache do React Query

**Arquivo lido:** `apps/mobile/src/config/cache.config.ts` (+ referência cruzada com `queryClient.ts`, Tarefa 2, e
todos os `useQuery` já vistos nas Tarefas 2–5)

### Valores de TTL definidos em `CACHE_CONFIG`

| Constante | Valor | Usado por (query key) | Alimenta animação? |
|---|---|---|---|
| `DAILY_MISSIONS_TTL` | 60 s | `dailyMissions` (Home) | Sim — `MissionCard` (padrão correto, Tarefa 2) |
| `USER_PROFILE_TTL` | 15 min | `userProfile` (Home, Me) | Sim — `levelProgressWidth`/`levelProgressAnim`/`LevelDetailSheet` (padrão correto, exceto o sheet — Tarefa 5) |
| `HYDRATION_TODAY_TTL` | 1 h | `hydrationToday`, `blendLogsToday` (Home, Track), `hydrationHistory` 7d (Track) | Sim — `GoalRing`/`GoalRingsSection` (Alta, Tarefa 2), `HydrationSection` (Alta, Tarefa 3) |
| `SUPPLEMENT_STACK_TTL` | 24 h | `supplementStack` (Track) | Sim — `SupplementCheckItem`/`MyStackSection` (padrão correto, Tarefa 3) |
| `SHOPPING_LISTS_TTL` | 7 dias | `shoppingLists`, `shoppingListDetail` | Não |
| `BLEND_HISTORY_TTL` | 7 dias | `blendHistory`, `hydrationHistory`/`supplementHistory` (History via `useHistoryData`) | Sim — `MacroBarChart`/`HydrationBarChart` (padrão correto, Tarefa 4) |
| `FAVORITES_TTL` | 30 dias | `favorites`; também reaproveitada como `gcTime` **global** em `queryClient.ts:91` | Sim — badge de favoritos no PulseAI header (padrão correto, Tarefa 5) |
| `PULSE_AI_RESPONSES_TTL` | 7 dias | não referenciado em nenhum `useQuery` lido até agora (provavelmente usado no backend/cache de resposta) | — |

`gcTime` **não é configurado por query em nenhum lugar** — todas herdam o default global `CACHE_CONFIG.FAVORITES_TTL`
(30 dias, `queryClient.ts:91`). Isso não causa o bug de animação, mas significa que dados voltam do cache em memória
mesmo depois de muito tempo sem uso — reforça que trocar de tab não deveria, por si, gerar nem um "cache miss" nem
uma tela vazia.

### Achado — inconsistência de `staleTime` para a mesma query key (não é a causa raiz do bug, mas é uma falha real de configuração)

`QUERY_KEYS.supplementStack` é usado em **dois lugares** com valores diferentes:

- `TrackScreen.tsx:196` → `staleTime: CACHE_CONFIG.SUPPLEMENT_STACK_TTL` (24 horas)
- `TrackNavigator.tsx:30-33` (dentro de `ManageStackRoute`, tela `ManageStack`) → `useQuery({ queryKey:
  QUERY_KEYS.supplementStack, queryFn: getStack })` **sem `staleTime`**, caindo no default global de
  `queryClient.ts:90` (`DEFAULT_STALE_TIME = 5 minutos`)

Ou seja, a mesma chave de query tem frescor de 24h num lugar e 5 minutos em outro. Isso pode fazer a tela
`ManageStack` (empilhada sobre Track, acessível pelo botão "gerenciar") refazer fetch e devolver dados possivelmente
diferentes toda vez que for reaberta após 5 minutos, mesmo que a `TrackScreen` ainda considere os dados válidos por
24h. Não confirmei um efeito de animação quebrado por esse caminho especificamente (o componente `ManageStackScreen`
em si não foi lido em detalhe nas tarefas anteriores — está fora do escopo original do prompt), mas é uma
inconsistência de configuração real que vale corrigir por consistência, já que o comentário em `cache.config.ts:37-40`
deixa claro que a intenção documentada é 24h para essa entidade.

### Resposta direta à pergunta da Tarefa 6: existe alguma query com `staleTime` zero ou não definido alimentando animação?

**Não.** Todas as queries que alimentam os componentes animados identificados nas Tarefas 2–5 (`dailyMissions`,
`userProfile`, `hydrationToday`, `blendLogsToday`, `hydrationHistory`, `supplementStack` em `TrackScreen`,
`blendHistory`/`hydrationHistory`/`supplementHistory` via `useHistoryData`, `favorites`) têm `staleTime` explícito e
razoável (60 s a 7 dias). A única ocorrência de `staleTime` não definido (`supplementStack` em `ManageStackRoute`) não
alimenta diretamente nenhum componente animado documentado nas tarefas anteriores.

**Conclusão importante para o diagnóstico geral:** isso reforça o que já apontamos na Tarefa 2 — a causa raiz do bug
relatado **não é configuração de cache agressiva ou ausente**. Os `staleTime`s estão bem configurados e, combinados
com a ausência de `focusManager` (Tarefa 2) e o fato de as tabs nunca desmontarem (Tarefa 1), **não deveria haver
refetch nenhum só por trocar de tab**. O problema real, como documentado nas Tarefas 2, 3 e 5, está inteiramente na
**lógica dos `useEffect` de animação dentro dos componentes** (`setValue(0)` incondicional antes de animar, e — no
caso do `HydrationSection` — uma dependência de array recriado a cada render). A configuração de cache está correta;
não há nada a mudar aqui para resolver o sintoma relatado, exceto a inconsistência pontual do `supplementStack`
citada acima.

---

## Tarefa 7 — Classificação por categoria de causa raiz

Esta tarefa é uma síntese das Tarefas 2–5: nenhum arquivo novo precisou ser lido, só a consolidação de todos os
`Animated.Value` já auditados numa única tabela, com a verificação `useRef` vs. `useState` pedida no prompt e o
enquadramento em uma das três categorias:

- **Categoria 1** — desmontagem/remontagem do componente reinicia o `Animated.Value` inicial
- **Categoria 2** — `useEffect` com dependência em dado de query dispara a animação de novo (tipicamente via
  `setValue(0)`/`setValue(circumference)` incondicional antes de reanimar)
- **Categoria 3** — a query (ou um `useMemo` mal formado a jusante dela) entrega uma referência "nova" mesmo com dado
  idêntico, e o componente trata isso como mudança real

### Achado transversal: `useRef` vs. `useState`

Conferi a declaração de **todos** os `Animated.Value` encontrados nas Tarefas 2–5 (25 ocorrências, contando arrays
como o `barAnimations[7]` como um grupo). **100% usam `useRef` (ou `useMemo` com deps `[]`, funcionalmente
equivalente — sobrevive a re-renders enquanto o componente não desmontar).** Não há **nenhuma** ocorrência de
`Animated.Value` declarado com `useState` em todo o código auditado. Isso é relevante para a Tarefa 7 porque elimina
de saída um erro estrutural clássico (perder o valor por guardá-lo em `useState`, que é recriado a cada render) —
o problema deste projeto nunca é "onde o valor mora", é "quando o `useEffect` decide zerá-lo antes de reanimar".

### Tabela completa de classificação

| # | Componente | Animated.Value(s) | Declaração | Categoria | Severidade | Origem |
|---|---|---|---|---|---|---|
| 1 | `GoalRing` (proteína/carbo/calorias) | `dashOffset`, `celebrationScale` | `useRef` | **2** | Alta | Tarefa 2 |
| 2 | `GoalRingsSection` (barra hidratação Home) | `hydrationAnimatedProgress` | `useRef` | **2** | Alta | Tarefa 2 |
| 3 | `HomeScreen` (fade de conteúdo) | `fadeAnim` | `useRef` | — (correto) | — | Tarefa 2 |
| 4 | `HomeScreen` (barra de nível no header) | `levelProgressWidth` | `useRef` | — (correto) | — | Tarefa 2 |
| 5 | `MissionCard` | `cardState`, `iconState`, `progressValue` | `useRef` | — (correto) | — | Tarefa 2 |
| 6 | `StreakBadge` (entrada) | `entryOpacity`, `entryScale` | `useRef` | — (correto, roda 1x) | — | Tarefa 2 |
| 7 | `StreakBadge` (loop lendário) | `rotation` | `useRef` | — (correto, guardado por `isLegendaryStage`) | — | Tarefa 2 |
| 8 | `HydrationSection` (barra do dia) | `progressAnimation` | `useRef` | **2** | Alta | Tarefa 3 |
| 9 | `HydrationSection` (mini gráfico 7 dias) | `barAnimations[7]` | `useRef` | **3** | **Alta (pior caso do diagnóstico)** | Tarefa 3 |
| 10 | `HydrationSection` (feedback "log water") | `waterScale`, `waterConfirmationOpacity`, `waterConfirmationTranslateY` | `useRef` | — (correto, disparado por interação, não por query) | — | Tarefa 3 |
| 11 | `SupplementCheckItem` | `progressValue`, `progressScale` | `useRef` | — (correto, guarda de 1º mount) | — | Tarefa 3 |
| 12 | `MyStackSection` (pulso "stack completo") | `progressScale` | `useRef` | — (correto, guardado por `wasCompleteRef`) | — | Tarefa 3 |
| 13 | `MacroBarChart` | `progress` | `useMemo([])` | **1** (esperado/correto) | Baixa | Tarefa 4 |
| 14 | `HydrationBarChart` | `progress` | `useMemo([])` | **1** (esperado/correto) | Baixa | Tarefa 4 |
| 15 | `SupplementHeatmap` (bottom sheet) | `translateY`, `backdropOpacity` | `useRef` | — (correto, disparado por interação) | — | Tarefa 4 |
| 16 | `PulseAIScreen` (badge favoritos) | `badgeScale` | `useRef` | — (correto, guardado por `prevCountRef`) | — | Tarefa 5 |
| 17 | `MeScreen` (barra de nível) | `levelProgressAnim` | `useRef` | — (correto) | — | Tarefa 5 |
| 18 | `LevelDetailSheet` (abrir/fechar sheet) | `translateY`, `backdropOpacity` | `useRef` | — (correto, disparado por `visible`) | — | Tarefa 5 |
| 19 | `LevelDetailSheet` (barra de progresso interna) | `progressAnimation` | `useRef` | **2** | Média | Tarefa 5 |

### Contagem por categoria

- **Categoria 1** (remonta e reinicia): 2 ocorrências — `MacroBarChart`, `HydrationBarChart`. Ambas classificadas como
  **comportamento esperado/correto**, não como bug: a `HistoryScreen` é uma tela empilhada que desmonta de verdade ao
  voltar (Tarefa 4), então reanimar do zero a cada entrada é uma animação de entrada legítima, não um reinício
  espúrio. Nenhuma outra tela do app desmonta ao trocar de tab (Tarefa 1), então essa categoria não se aplica a mais
  nada no diagnóstico.
- **Categoria 2** (useEffect com dependência de dado da query reseta antes de animar): **4 ocorrências, a categoria
  dominante do bug relatado** — `GoalRing` (3 anéis), `GoalRingsSection` (barra de hidratação Home), `HydrationSection`
  (barra do dia em Track), `LevelDetailSheet` (barra interna do sheet de nível). Em todos os 4 casos, o padrão é
  idêntico: `Animated.Value.setValue(0-ou-equivalente)` chamado incondicionalmente no início do `useEffect`, antes de
  animar para o valor real — nenhum deles anima a partir do valor atual.
- **Categoria 3** (dado tecnicamente idêntico, mas referência nova dispara o efeito mesmo assim): **1 ocorrência,
  porém a mais severa do diagnóstico inteiro** — o mini gráfico de 7 dias do `HydrationSection`
  (`TrackScreen.tsx:391-393` → `HydrationSection.tsx:132-135,162-191`). É o único caso em que o reinício acontece **em
  toda renderização**, não só quando o dado muda de verdade.

### Padrão de correção único para as categorias 2 e 3

Todas as 5 ocorrências de bug (4 da categoria 2 + 1 da categoria 3) têm a mesma correção estrutural, já demonstrada
como padrão correto em 8 componentes diferentes do próprio projeto (`levelProgressWidth`, `levelProgressAnim`,
`MissionCard`, `SupplementCheckItem`, `MyStackSection`, badge do PulseAI, `MacroBarChart`, `HydrationBarChart`):
**remover o `setValue()` de reset incondicional e deixar o `Animated.timing`/`spring` animar direto do valor atual do
`Animated.Value` para o novo `toValue`.** Para a Categoria 3 especificamente, a correção adicional necessária é
memoizar `history7Days` em `TrackScreen.tsx` com `useMemo` (ou comparar por conteúdo antes de recriar o array) para
que a referência só mude quando o dado realmente mudar.

---

## Tarefa 8 — Expo Go vs. build de produção

**Arquivos lidos:** `apps/mobile/app.json`, `apps/mobile/app.config.ts`, `apps/mobile/package.json` (dependências
relevantes), busca por `eas.json` e por condicionais `__DEV__`

### Nota de discrepância com o prompt original

O prompt descreve o projeto como "Expo SDK 52". A versão real, confirmada em `package.json`, é **`expo: ~54.0.33`**
com **`react-native: 0.81.5`**. Registro isso porque a diferença de SDK importa diretamente para esta tarefa: a
partir do SDK 51, o Expo Go passou a rodar exclusivamente com a **New Architecture** — o que muda a análise abaixo.

### Configuração relevante encontrada

- **`newArchEnabled: true`** em `app.json:8` — o projeto tem a New Architecture (Fabric + TurboModules) ligada
  explicitamente.
- **Nenhum `eas.json`** no repositório — não há profiles de build EAS configurados ainda, então não existe uma
  definição formal de "build de produção" para comparar diretamente; a única forma de rodar o app hoje é via Expo Go
  ou um build de desenvolvimento manual.
- **Nenhum `expo-dev-client`** nas dependências — o projeto ainda não migrou para um dev client customizado; os testes
  mencionados no prompt provavelmente acontecem via Expo Go puro.
- **`jsEngine` não é sobrescrito** em `app.json`/`app.config.ts` — permanece no padrão do Expo SDK 54 (Hermes em
  ambas as plataformas), então não há divergência de engine JS entre Expo Go e um build futuro.
- Único `__DEV__` encontrado no projeto inteiro (`purchase.service.ts:138`) é só o nível de log do RevenueCat — não
  há nenhum condicional `__DEV__` que afete navegação, ciclo de vida de tela ou animação.
- `react-native-reanimated` (`~3.17.4`) está instalado como dependência, mas **nenhum** dos componentes animados
  auditados nas Tarefas 2–5 o utiliza — todos usam a API `Animated` clássica do `react-native` (confirmado nos
  imports de cada arquivo lido). Irrelevante para Expo Go vs. produção, mas relevante para contexto: trocar para
  Reanimated não resolveria os bugs encontrados, porque são bugs de lógica (`setValue(0)` incondicional / array
  não memoizado), não de qual thread roda a animação.

### O que isso muda na interpretação do diagnóstico

Como o Expo Go do SDK 54 já roda em New Architecture — a mesma que qualquer build de produção deste projeto também
vai usar (`newArchEnabled: true` é uma configuração do projeto, não do Expo Go) — **não há uma divergência estrutural
grande de arquitetura entre o que os testes viram no Expo Go e o que rodará em produção**. Isso contraria a hipótese
inicial (nas instruções do prompt) de que talvez o comportamento fosse "exclusivo do Expo Go".

Onde Expo Go **pode** amplificar (mas não causar) o sintoma:

- Todos os 5 bugs confirmados nas Tarefas 2, 3 e 5 usam `useNativeDriver: false` — porque animam propriedades que o
  driver nativo não suporta (`strokeDashoffset` de SVG no `GoalRing`, `width` em `%` nas barras de progresso, `height`/`y`
  de `Rect` no mini gráfico do `HydrationSection`). Isso significa que **essas animações sempre rodam na JS thread**,
  em qualquer ambiente. O Expo Go tem overhead extra de JS thread (dev menu, LogBox, ponte com o Metro) que pode
  tornar o "flash para zero" mais perceptível/com mais stutter do que num build de release otimizado — mas o
  **reset em si acontece de qualquer forma**, porque é causado por uma chamada explícita a `setValue(0)` no código,
  não por lentidão de thread.
- Não há como confirmar por leitura estática se a versão de `react-native-screens` (`~4.10.0`) embutida no shell do
  Expo Go corresponde exatamente à mesma versão nativa que seria compilada num build de produção real — isso só é
  verificável rodando os dois lado a lado, o que está fora do escopo de um diagnóstico somente-leitura.

### Conclusão da Tarefa 8

Nenhum dos 5 problemas confirmados nas Tarefas 2, 3 e 5 é condicionado por `__DEV__`, por Expo Go, ou por qualquer
configuração exclusiva de desenvolvimento — são bugs de lógica React (`useEffect` resetando um `Animated.Value`
incondicionalmente antes de animar, e um `useMemo` quebrado por array não memoizado) que existem no bundle JS e
rodarão **de forma idêntica em produção**, com ou sem New Architecture, em Expo Go ou num build TestFlight/Play
Store. Confirmando a instrução do prompt: todos os itens permanecem classificados como problemas a corrigir,
independentemente do ambiente de teste. A única variável de ambiente que vale testar ao vivo (fora do escopo deste
diagnóstico de leitura) é se a versão de `react-native-screens` do Expo Go introduz algum artefato visual adicional
no detach/reattach de tabs inativas — mas isso seria um problema **somatório**, não a causa raiz.

---

## Tabela resumo e lista priorizada de correção

### Tabela-resumo por tela

| Tela / Componente | Problema encontrado? | Causa raiz (categoria) | Severidade |
|---|---|---|---|
| Navegação (Root/App/Track/PulseAI Navigator) | Não | — (tabs nunca desmontam; sem `unmountOnBlur`/`focusManager`) | — |
| `HomeScreen` — `fadeAnim`, `levelProgressWidth` | Não | — (padrão correto) | — |
| `HomeScreen` → `GoalRingsSection` → `GoalRing` (3 anéis) | **Sim** | Categoria 2 — `setValue(circumference)` incondicional | **Alta** |
| `HomeScreen` → `GoalRingsSection` (barra hidratação) | **Sim** | Categoria 2 — `setValue(0)` incondicional | **Alta** |
| `HomeScreen` → `MissionCard`, `StreakBadge` | Não | — (padrão correto) | — |
| `TrackScreen` → `HydrationSection` (barra do dia) | **Sim** | Categoria 2 — `setValue(0)` incondicional | **Alta** |
| `TrackScreen` → `HydrationSection` (mini gráfico 7 dias) | **Sim** | Categoria 3 — array não memoizado recria a cada render | **Alta (pior caso)** |
| `TrackScreen` → `SupplementCheckItem`, `MyStackSection` | Não | — (padrão correto) | — |
| `HistoryScreen` → `MacroBarChart`, `HydrationBarChart` | Não (esperado) | Categoria 1 — remonta de verdade (tela empilhada), animação de entrada legítima | Baixa |
| `HistoryScreen` → `SupplementHeatmap` | Não | — (padrão correto) | — |
| `PulseAIScreen` — badge de favoritos | Não | — (padrão correto) | — |
| `MeScreen` — `levelProgressAnim`, `StatCard` | Não | — (padrão correto / sem animação) | — |
| `LevelDetailSheet` (aberto pela Home) — barra de progresso interna | **Sim** | Categoria 2 — `setValue(0)` incondicional | Média |
| Cache do React Query (`cache.config.ts`) | Inconsistência pontual (não é causa do bug de animação) | `supplementStack` com `staleTime` diferente em `TrackNavigator.tsx` vs. `TrackScreen.tsx` | Baixa |
| Expo Go vs. produção | Não é a causa — bugs reproduzem igual em build de produção | — | — |

### Lista de correções por tarefa (com base no código lido)

Todas as correções abaixo seguem o mesmo princípio, já validado como padrão correto em 8 componentes deste mesmo
projeto (`levelProgressWidth`, `MissionCard`, `SupplementCheckItem`, `MyStackSection`, badge do PulseAI,
`MacroBarChart`/`HydrationBarChart`): **nunca chamar `.setValue()` de reset dentro do `useEffect` de atualização —
deixar o `Animated.timing`/`spring` animar a partir do valor atual do próprio `Animated.Value`.** Uma animação de
entrada (do zero) só deve acontecer explicitamente no primeiro mount real, via uma guarda tipo `hasMounted`
(`useRef(false)`), exatamente como o `SupplementCheckItem.tsx:92-99` já faz.

#### Tarefa 2 — `apps/mobile/src/components/ui/GoalRing.tsx:104-155`

Problema: `dashOffset.setValue(circumference)` (linha 116) roda incondicionalmente a cada disparo do efeito.

Correção sugerida — adicionar guarda de primeiro mount e remover o reset incondicional:

```tsx
const hasMounted = useRef(false);

useEffect(() => {
  celebrationScale.setValue(1);

  if (!animate) {
    dashOffset.setValue(targetDashOffset);
    hasMounted.current = true;
    return;
  }

  if (!hasMounted.current) {
    hasMounted.current = true;
    dashOffset.setValue(circumference); // só zera na 1ª entrada real
  }
  // nas próximas execuções, dashOffset já está no valor anterior — anima
  // direto dele para o novo targetDashOffset, sem reset.

  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let ringAnimation: Animated.CompositeAnimation | null = null;
  let celebrationAnimation: Animated.CompositeAnimation | null = null;

  const interactionTask = InteractionManager.runAfterInteractions(() => {
    timeoutId = setTimeout(() => {
      ringAnimation = Animated.timing(dashOffset, {
        toValue: targetDashOffset,
        duration: GOAL_RING_ANIMATION_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      });

      ringAnimation.start(({ finished }) => {
        if (!finished || !isComplete) return;
        celebrationAnimation = createCelebrationAnimation(celebrationScale);
        celebrationAnimation.start();
      });
    }, HOME_INTERACTION_DELAY_MS);
  });

  return () => {
    interactionTask.cancel();
    if (timeoutId !== null) clearTimeout(timeoutId);
    ringAnimation?.stop();
    celebrationAnimation?.stop();
    dashOffset.stopAnimation();
    celebrationScale.stopAnimation();
  };
}, [animate, celebrationScale, circumference, dashOffset, isComplete, targetDashOffset]);
```

#### Tarefa 2 — `apps/mobile/src/components/home/GoalRingsSection.tsx:78-105`

Problema: `hydrationAnimatedProgress.setValue(0)` (linha 82) roda incondicionalmente a cada disparo do efeito.

Correção sugerida — mesmo padrão de guarda:

```tsx
const hasMounted = useRef(false);

useEffect(() => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let hydrationAnimation: Animated.CompositeAnimation | null = null;

  if (!hasMounted.current) {
    hasMounted.current = true;
    hydrationAnimatedProgress.setValue(0); // só zera na 1ª entrada real
  }

  const interactionTask = InteractionManager.runAfterInteractions(() => {
    timeoutId = setTimeout(() => {
      hydrationAnimation = Animated.timing(hydrationAnimatedProgress, {
        toValue: hydrationProgress,
        duration: GOAL_RING_ANIMATION_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      });
      hydrationAnimation.start();
    }, HOME_INTERACTION_DELAY_MS);
  });

  return () => {
    interactionTask.cancel();
    if (timeoutId !== null) clearTimeout(timeoutId);
    hydrationAnimation?.stop();
    hydrationAnimatedProgress.stopAnimation();
  };
}, [hydrationAnimatedProgress, hydrationProgress]);
```

#### Tarefa 3 — `apps/mobile/src/screens/TrackScreen.tsx:391-393` (raiz do bug mais severo)

Problema: `history7Days` é recalculado com `.filter()` direto no corpo do componente, gerando uma referência de array
nova a cada render — isso quebra o `useMemo` de `chartData` dentro do `HydrationSection` e faz o mini gráfico de 7
dias reanimar do zero em toda renderização da tela, não só quando o dado muda.

Correção sugerida — memoizar por conteúdo real (`rawHistoryDailyBreakdown`), não recriar a cada render:

```tsx
const history7Days: HydrationHistoryDailyBreakdownItem[] = useMemo(
  () =>
    Array.isArray(rawHistoryDailyBreakdown)
      ? rawHistoryDailyBreakdown.filter(isHydrationHistoryDailyBreakdownItem)
      : [],
  [rawHistoryDailyBreakdown],
);
```

Isso é suficiente porque `rawHistoryDailyBreakdown` vem de `hydrationHistoryQuery.data`, cuja referência só muda
quando o React Query efetivamente recebe um payload novo do backend (fetch bem-sucedido) — não a cada render do
componente. Com essa mudança, o `useMemo` de `chartData` dentro do `HydrationSection.tsx:132-135` volta a acertar o
cache normalmente, e o `useEffect` das barras (`HydrationSection.tsx:162-191`) só dispara quando o dado real muda.

#### Tarefa 3 — `apps/mobile/src/components/track/HydrationSection.tsx:141-160` (barra de progresso do dia)

Mesmo padrão de correção da Tarefa 2 — adicionar guarda de primeiro mount antes do `progressAnimation.setValue(0)`
na linha 145, e deixar o `Animated.timing` seguinte animar direto do valor atual nas execuções seguintes.

#### Tarefa 3 — `apps/mobile/src/components/track/HydrationSection.tsx:162-191` (mini gráfico, complemento)

Depois da correção na `TrackScreen.tsx` (acima), este efeito só vai disparar quando `chartData` mudar de verdade.
Ainda assim, para eliminar de vez o "flash para vazio" quando o dado muda legitimamente (ex.: novo log de água),
aplicar a mesma guarda de primeiro mount ao `barAnimations.forEach(v => v.setValue(0))` da linha 165-168.

#### Tarefa 5 — `apps/mobile/src/components/gamification/LevelDetailSheet.tsx:107-127`

Problema: `progressAnimation.setValue(0)` (linha 113) roda incondicionalmente toda vez que `levelInfo.progress` muda
enquanto o sheet está aberto.

Correção sugerida:

```tsx
useEffect(() => {
  if (!visible) {
    progressAnimation.setValue(0);
    return;
  }

  // anima direto do valor atual (já é 0 na 1ª abertura, pois foi zerado no
  // ramo `!visible` acima) para o novo progresso — sem setValue(0) aqui.
  const animation = Animated.timing(progressAnimation, {
    toValue: levelInfo.progress,
    duration: 600,
    easing: Easing.out(Easing.cubic),
    useNativeDriver: false,
  });

  animation.start();

  return () => {
    animation.stop();
  };
}, [levelInfo.progress, progressAnimation, visible]);
```

Como o próprio ramo `!visible` já zera o valor ao fechar o sheet, remover o `setValue(0)` do ramo `visible` é
suficiente — a próxima abertura começa do zero (comportamento correto de entrada) e, se o XP mudar com o sheet já
aberto, anima do valor atual em vez de piscar para vazio.

#### Tarefa 6 — `apps/mobile/src/navigation/TrackNavigator.tsx:30-33` (inconsistência de config, não é causa do bug de animação)

Corrigir por consistência, alinhando com a intenção documentada em `cache.config.ts:37-40` (24h para
`supplementStack`):

```tsx
const { data: supplementStack } = useQuery({
  queryKey: QUERY_KEYS.supplementStack,
  queryFn: getStack,
  staleTime: CACHE_CONFIG.SUPPLEMENT_STACK_TTL, // adicionar — hoje ausente, cai no default de 5 min
});
```

### Lista final ordenada por severidade

1. **Alta** — `HydrationSection.tsx:162-191` (mini gráfico 7 dias) + `TrackScreen.tsx:391-393` (causa raiz) — único
   bug que reinicia em toda renderização, não só quando o dado muda. Corrigir primeiro.
2. **Alta** — `GoalRing.tsx:104-155` (3 anéis de macro na Home) — `setValue(circumference)` incondicional.
3. **Alta** — `GoalRingsSection.tsx:78-105` (barra de hidratação na Home) — `setValue(0)` incondicional.
4. **Alta** — `HydrationSection.tsx:141-160` (barra de progresso do dia em Track) — `setValue(0)` incondicional.
5. **Média** — `LevelDetailSheet.tsx:107-127` (barra de progresso interna do sheet de nível) — mesmo padrão, exposição
   menor (só quando o sheet está aberto).
6. **Baixa** — `TrackNavigator.tsx:30-33` — `staleTime` ausente para `supplementStack` em `ManageStackRoute`,
   inconsistente com as 24h usadas em `TrackScreen.tsx`. Não é causa do bug de animação, mas vale alinhar.
7. **Baixa / não é bug** — `MacroBarChart`/`HydrationBarChart` reanimando a cada entrada na `HistoryScreen` — é
   comportamento correto e esperado (tela empilhada que desmonta de verdade ao voltar). Não corrigir; documentado
   aqui só para registro completo, conforme pedido no prompt original.
