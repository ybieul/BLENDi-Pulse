# Diagnóstico de Feedback Visual — Loading States, Estados Vazios, Erros e Duplo Toque (pré-lançamento)

**Data:** 2026-09-03
**Escopo:** Loading states nas 13 telas principais, as 3 operações de alta latência (Pulse AI, Pantry Scanner, upload de foto), estados vazios, tratamento de erro (incluindo 429 pós-Área 8), proteção contra duplo toque, pull-to-refresh, e avaliação dedicada do Daily Recipe Card.
**Método:** leitura integral de cada tela/componente relevante — nenhuma suposição sobre comportamento sem confirmação no código, nenhum servidor rodando, nenhum dado real necessário. Nenhuma alteração de código foi feita durante este diagnóstico.
**Pré-requisitos assumidos como corretos (não reavaliados aqui):** correções de animação da Área 7 (`hasMounted` guards, `useMemo` do `history7Days`); tempos de endpoint medidos na Área 1 (`diagnostico-performance.md`); rate limiting da Área 8 (`diagnostico-seguranca.md`), que introduziu a possibilidade de 429 em qualquer endpoint.

---

## Sumário executivo

Resultado: **7 Alta / 14 Média / 14 Baixa** (linhas da tabela de priorização — alguns agrupam 2 achados relacionados), além de ~40 comportamentos corretos confirmados ao longo das 10 tarefas originais + 3 extensões pedidas pelo usuário: T10-F3 (celebração de level up), Tarefa 11 (auth, compra, gerenciar suplementos, cold boot) e Tarefa 12 (checagem final — onboarding, timer, banner offline, e um padrão sistêmico de mutations sem `onError`). Com a Tarefa 12, as 23 telas do app e os principais componentes/hooks globais estão cobertos. Tabela de priorização consolidada ao final do documento.

Os achados de severidade Alta se concentram em quatro causas raiz:
1. **Ausência total de feedback visual numa operação longa e crítica** — o step "analyzing" do Pantry Scanner (até ~45s) fica visualmente parado sem nenhuma animação; o cálculo de macros no onboarding (T12-F1) trava o fluxo inteiro de forma parecida se a chamada falhar.
2. **Padrão sistêmico de `useMutation` sem `onError`, repetido em pelo menos 4 pontos independentes da base** — sync de shopping list (T6-F3), CRUD de suplementos (T11-F3), edição de configurações de perfil e preferências de notificação (T12-F3). Não é um lapso isolado: o padrão correto (retry contável + toast, como em `processPendingBlendQueue`) já existe no próprio código, só não foi aplicado de forma consistente — vale estabelecer isso como convenção ao corrigir.
3. **Botão que promete uma ação e não a executa** — o "Start Blend" do Daily Recipe Card não leva a receita mostrada para a tela de blend, quebrando a expectativa criada pelo próprio card.
4. **Overlay global fora do padrão de composição do resto do app** — a celebração de level up é o único overlay full-screen do app que não usa `<Modal>` nativo, e diverge do comportamento especificado no código quando testada ao vivo (o `OfflineBanner` compartilha a mesma arquitetura de risco, ver T12).

---

## Tarefa 1 — Inventário de loading states na HomeScreen

Arquivo: `apps/mobile/src/screens/HomeScreen.tsx` (integral, 680 linhas) + `apps/mobile/src/components/home/GoalRingsSection.tsx`, `DailyRecipeCard.tsx` + `apps/mobile/src/components/missions/MissionCard.tsx` + `apps/mobile/src/components/ui/SkeletonLoader.tsx` + `apps/mobile/src/store/gamification.store.ts`.

### Queries `useQuery` presentes

| Query key | queryFn | Alimenta | Loading consultado? |
|---|---|---|---|
| `QUERY_KEYS.dailyMissions` | `getDailyMissions` | Header de missões (badge de progresso) + `MissionCard[]` | Sim — `isLoadingMissions`, usado localmente no bloco de missões |
| `QUERY_KEYS.userProfile` | `fetchUserProfile` (`GET /users/me`) | Nome na saudação, badge Free/Pro, alvo dos 3 GoalRings (proteína/carbs/calorias), `StreakBadge`, `goal` do `DailyRecipeCard` | Sim — `isLoadingProfile`, compõe o gate global `isLoading` |
| `QUERY_KEYS.blendLogsToday` | `getTodayLogs` (`GET /blend-logs/today`) | Valores atuais dos 3 GoalRings + `dataUpdatedAt` (→ `StaleDataIndicator`) | Sim — `isLoadingLogs`, compõe o gate global `isLoading` |
| `QUERY_KEYS.hydrationToday` | `getHydrationToday` (`retry: 0`, comentário: "endpoint será implementado no futuro") | Barra de hidratação dentro do `GoalRingsSection` | **Não** — nem `isLoading` nem `isFetching` são desestruturados desta query em nenhum lugar |

`isLoading` (linha 206) = `isLoadingProfile || isLoadingLogs`. Esse único booleano controla **um único ternário** (linhas 374–518) que troca entre skeleton e absolutamente todo o conteúdo da tela — saudação, badge de nível, GoalRings, StreakBadge, missões, protocolos rápidos e DailyRecipeCard aparecem/desaparecem juntos. `hydrationToday` fica fora desse gate.

### Achados

- **🟡 Média (T1-F1) — Skeleton global não corresponde à forma nem à altura do conteúdo real, causando layout shift perceptível.** `HomeScreen.tsx:376–383`: enquanto `isLoading` é `true`, a tela mostra apenas `ProfileSkeleton` (avatar circular 80px centralizado + 2 linhas curtas centralizadas — layout de tela de perfil) seguido de 2× `RecipeCardSkeleton` (card genérico de 200px + linhas de texto). O conteúdo real que substitui isso (`HomeScreen.tsx:388–515`) é estruturalmente diferente e mais alto: saudação alinhada à esquerda (sem avatar) + badge de nível, 3 GoalRings + barra de hidratação, StreakBadge, cabeçalho + 3 `MissionCard` lado a lado, título "Quick Start", lista horizontal de `QuickProtocolCards`, e o `DailyRecipeCard`. Não há nenhuma tentativa de dimensionar o skeleton pela altura real dessas seções — o usuário vê a página "pular" de altura ao término do carregamento. Ocorre em toda abertura fria do app (Home é a tela inicial pós-login).
- **🟡 Média (T1-F2) — Barra de hidratação não tem estado de loading próprio; mostra 0 indistinguível de "genuinamente vazio hoje".** `hydrationToday` (linha 199–204) nunca expõe `isLoading`/`isFetching` para o componente, e `GoalRingsSection` recebe `hydrationCurrent={hydrationData?.totalMl ?? 0}` (linha 445). Como essa query fica **fora** do gate global (que só espera `userProfile` + `blendLogsToday`), é possível — dependendo de qual promise resolve primeiro — a tela sair do skeleton e mostrar a barra de hidratação em 0 enquanto a requisição de hidratação ainda está em voo, sem nenhum shimmer/placeholder, e sem diferença visual entre "ainda carregando" e "usuário não bebeu água hoje". Para um usuário que já registrou água mais cedo e reabre o app, a barra pode aparecer vazia por um instante antes de saltar para o valor real.
- **🟢 Baixa (T1-F3) — Indicador de nível ("Lv. N") mostra um valor momentaneamente incorreto no cold boot, mesmo para usuários com XP > 0.** `gamification.store.ts:31–34`: `totalXP` começa em `0` (store sem `persist`/MMKV, nunca hidratado entre sessões). `HomeScreen.tsx:273–281` só sincroniza `totalXP` da store com o valor real (`profileResponse.data.user.totalXP`) dentro de um `useEffect`, que roda **depois** do primeiro render em que `isLoading` vira `false` — nesse primeiro render, `levelInfo = calculateLevel(0)` já é computado (linha 167) e renderizado como "Lv. 1" (linha 404) antes do efeito corrigir para o nível real no próximo tick. Agravado por: a barra de progresso de nível é animada em 400 ms (linhas 220–233) a partir do valor inicial calculado no mount (também baseado em XP=0, linha 168), enquanto o texto "Lv. N" não tem transição alguma — troca instantaneamente. Resultado: um flicker breve e autocorrigido, mas tecnicamente um dado errado exibido, toda vez que a Home monta a partir de um cold boot.
- **🟢 Baixa (T1-F4) — Bloco de missões diárias não tem estado de erro/vazio; falha silenciosa mostra só o cabeçalho sem cards.** `HomeScreen.tsx:474–490`: `isLoadingMissions ? <skeletons> : missionsData ? <cards> : null`. Se a query `dailyMissions` falhar (erro de rede, 429 pós-Área 8, etc.) ou resolver com dado inesperado, `isLoadingMissions` vira `false` e `missionsData` permanece `undefined` → cai no `null` final. O cabeçalho "Daily Missions" (ícone + título) continua visível, mas a badge de progresso e os 3 cards somem sem nenhuma mensagem de erro, botão de retry, ou indicação de que algo deu errado — a seção fica com uma aparência truncada/quebrada.
- **✅ Correto — Os 3 `MissionCard` têm placeholder de loading com glassmorphism/pulse, confirmando o CP2.3-C.** `HomeScreen.tsx:475–479`: 3× `SkeletonLoader variant="card"` (shimmer de opacidade 0.3↔1 em loop de 1200 ms, `SkeletonLoader.tsx:64–82`) com `missionCardSkeleton: { flex: 1, height: 80 }` (linha 675–678). Dimensão é próxima da altura real do `MissionCard` (~77–91px dependendo de o título ocupar 1 ou 2 linhas, já que o card real não tem `height` fixo — é dirigido por conteúdo: padding 12 + ícone 22 + título até 2 linhas de 14px + track de progresso de 3px). Diferença de poucos pixels na pior hipótese (título de 2 linhas) — não chega a causar shift visível relevante, mas não é uma correspondência exata de dimensões.
- **✅ Correto — GoalRings (proteína/carbs/calorias) nunca aparecem em zero por falta de dado — ficam atrás do skeleton global até `userProfile` e `blendLogsToday` resolverem.** Como `GoalRingsSection` só é montado depois que `isLoading` vira `false` (dentro do `Animated.View` das linhas 386–517), os valores `logsData?.totalProtein ?? 0` etc. (linhas 439–447) já refletem dados reais na primeira renderização — não existe uma janela em que os anéis aparecem vazios/zerados por os dados ainda não terem chegado (diferente do caso de hidratação, achado T1-F2).
- **✅ Correto — Fade-in de 300 ms na transição skeleton → conteúdo, sem flash abrupto.** `HomeScreen.tsx:210–218`, `Animated.timing(fadeAnim, {toValue:1, duration:300})`.
- **✅ Correto/Informativo — Daily Recipe Card não depende de nenhuma query remota; renderiza de forma síncrona a partir de uma constante local.** `DailyRecipeCard.tsx:37–66`: `DAILY_RECIPES` é um `Record<UserGoal, DailyRecipe>` hardcoded no próprio componente (4 receitas fixas, uma por objetivo — Muscle/Wellness/Energy/Recovery), sem chamada a API, sem campo correspondente no `authStore`. Não existe (nem é necessário) qualquer estado de loading próprio — o card só fica invisível enquanto está atrás do skeleton global (porque `profile?.goal` vem de `userProfile`), nunca por conta própria. Avaliação completa (divergência com o plano do CP3.4, campos vs. receitas do Pulse AI, botão "Start Blend") na Tarefa 9.

---

## Tarefa 2 — Inventário de loading states na TrackScreen

Arquivo: `apps/mobile/src/screens/TrackScreen.tsx` (integral, 659 linhas) + `apps/mobile/src/components/track/HydrationSection.tsx`, `MyStackSection.tsx`, `SupplementCheckItem.tsx` (integrais).

### Queries `useQuery` presentes

| Query key | queryFn | Alimenta | No gate `isLoading`/`isError`? |
|---|---|---|---|
| `QUERY_KEYS.hydrationToday` | `getHydrationToday` | `HydrationSection` (total do dia + progresso) | Sim |
| `QUERY_KEYS.supplementStack` | `getStack` | `MyStackSection` / `SupplementCheckItem[]` | Sim |
| `[...hydrationHistory, timezone, '7days']` | `getHydrationHistory` | Gráfico de 7 dias dentro de `HydrationSection` | Sim |
| `QUERY_KEYS.shoppingLists` | `getLists` | Só o badge numérico do ícone de carrinho no header | **Não** |

`isLoading` (linha 243) = `isLoadingHydration || isLoadingStack || isLoadingHistory`. `isError` (linha 244) = mesma composição com `isError*`. Um único ternário de 3 vias (linhas 465–519) decide entre skeleton / tela de erro / conteúdo — diferente da HomeScreen, aqui existe um terceiro estado de erro dedicado.

### Achados

- **✅ Correto — TrackScreen é a única das duas telas analisadas até agora com estado de erro explícito e recuperável.** `TrackScreen.tsx:472–483`: se qualquer uma das 3 queries do gate falhar, a tela mostra `t('common.states.error')` + botão `t('common.actions.retry')` que chama `handleRetry` (linhas 406–410), reexecutando as 3 queries de uma vez. Contrasta com a HomeScreen (Tarefa 1), que não tem nenhum estado de erro — inconsistência entre telas, registrada para a Tarefa 10. A mensagem de erro é genérica (não diferencia qual das 3 queries falhou, nem trata 429 de forma diferente de falha de rede) — análise de qualidade do texto de erro fica para a Tarefa 6.
- **🟡 Média (T2-F1) — Skeleton (2× `RecipeCardSkeleton` genérico) não corresponde à forma real das 2 seções, mesma classe do achado T1-F1.** `TrackScreen.tsx:465–471`. O conteúdo real é: `HydrationSection` (card com título+progresso, barra de progresso, botão "Log Water", e gráfico SVG de 7 barras — bem mais alto e com layout distinto de um `RecipeCardSkeleton`) e `MyStackSection` (card com header + lista de suplementos de altura variável, dependente de quantos suplementos o usuário tem cadastrados). Nenhuma tentativa de aproximar altura/estrutura — layout shift visível ao sair do skeleton.
- **🟢 Baixa (T2-F2) — Badge de itens pendentes da shopping list não está no gate de loading/erro; degrada silenciosamente para "sem badge".** `pendingShoppingListItemsTotal` (linha 399–402) usa `shoppingListsQuery.data?.lists.reduce(...) ?? 0` — enquanto a query carrega ou se ela falhar, o badge simplesmente não aparece (`pendingShoppingListItemsTotal > 0` é falso), sem shimmer e sem erro. Degradação aceitável (não afirma "0 itens pendentes" ao usuário, só omite o badge), mas nenhuma tentativa de refletir estado de carregamento nesse elemento pontual.
- **✅ Correto — Cenário "abrir a Track às 7h com dados zerados" não é confundido com loading.** Como `HydrationSection` e `MyStackSection` só montam depois que o `isLoading` composto (3 queries) resolve para `false` (linhas 465, 484–519), um usuário que abre a tela de manhã sem ter feito nada ainda vê os valores reais (0 ml, todos os suplementos "0/N") — nunca um skeleton mascarando esse zero, nem um zero aparecendo antes da resposta do servidor chegar. Mesmo padrão correto do GoalRings na Home (exceto hidratação lá, achado T1-F2) — aqui a própria hidratação está corretamente dentro do gate.
- **✅ Correto — `MyStackSection` tem estado vazio bem definido, distinto de loading.** `MyStackSection.tsx:130–136`: `totalCount === 0` (sempre um valor pós-carregamento real, nunca renderizado durante o loading porque está atrás do gate da tela) mostra `t('track.noSupplements')` + link `t('track.addSupplement')` — mensagem orientativa, não um "sem dados" genérico.
- **✅ Correto/Informativo — `HydrationSection`, `MyStackSection` e `SupplementCheckItem` são puramente apresentacionais, sem query própria.** Todos os 3 recebem dado via props já resolvidos pelo gate da tela pai — nenhum risco de renderizar com dado parcial/ausente por conta própria.
- **Informativo (cross-referência Tarefa 8) — TrackScreen não tem `RefreshControl`/pull-to-refresh**, diferente da HomeScreen. Único jeito de forçar atualização é o botão "Retry", que só aparece em estado de erro — avaliação completa de pull-to-refresh fica para a Tarefa 8.

---

## Tarefa 3 — Inventário de loading states nas telas de conteúdo

### HistoryScreen

Arquivo: `apps/mobile/src/screens/HistoryScreen.tsx` (integral) + `apps/mobile/src/hooks/useHistoryData.ts` + `apps/mobile/src/components/history/StatCard.tsx`, `MacroBarChart.tsx`, `HydrationBarChart.tsx`, `SupplementHeatmap.tsx`.

- **✅ Correto — As 3 seções (Nutrição/Hidratação/Suplementos) carregam de forma genuinamente independente, não esperam a mais lenta.** `useHistoryData.ts` expõe 4 `useQuery`/`useInfiniteQuery` totalmente separadas (`blendSummaryQuery`, `hydrationSummaryQuery`, `supplementSummaryQuery`, `blendInfiniteQuery`), cada uma com seu próprio `isLoading`/`error`/`refetch`. Cada seção da `HistoryScreen` usa seu próprio `isXSummaryLoading` para os `StatCard` (skeleton de linha nas dimensões exatas do valor real, `StatCard.tsx:45-47`, 64×22) e seu próprio `XSummaryError` com `SectionError` + retry local (`HistoryScreen.tsx:257-258,343-344,386-387`) — falha ou lentidão em uma seção não afeta as outras.
- **🟡 Média (T3-F1) — Lista "All Blends" (itens individuais) não tem loading state próprio; pode renderizar em branco entre o resumo resolver e a lista paginada resolver.** `isBlendListEmpty` (`HistoryScreen.tsx:176`) só considera `isBlendSummaryLoading` + `blendCount` (do resumo agregado). Os itens de fato vêm de `blendInfiniteQuery` — uma query **separada** no hook (`useHistoryData.ts:116-130`) cujo `isBlendInfiniteLoading`/`blendInfiniteError` sequer são desestruturados pela tela (`HistoryScreen.tsx:116-133`). Se o resumo resolver antes da lista paginada (queries independentes, sem ordem garantida), o usuário vê stat cards com números reais + o subtítulo "All Blends", mas nenhum item embaixo — sem skeleton, sem mensagem, `blendLogs.map(...)` simplesmente não renderiza nada até a página 1 chegar. Pode parecer que o conteúdo sumiu/quebrou.
- **🟡 Média (T3-F2) — Os 3 gráficos (macros, hidratação, suplementos) mostram um estado "vazio" durante o loading, indistinguível de "sem dados reais no período" — o antipadrão explícito do enunciado.** `MacroBarChart.tsx:137-142` e `HydrationBarChart.tsx:131-136`: `buildChartData` cai em `buildPlaceholderChartData` (barras zeradas com `isPlaceholder:true`, cor `EMPTY_BAR_COLOR`, sem tooltip) sempre que o array de entrada está vazio — e é exatamente isso que `macroChartData`/`hydrationChartData` são (`?? []`, `HistoryScreen.tsx:162-170,188`) enquanto a query ainda não resolveu. `SupplementHeatmap` segue o mesmo princípio (`NO_DATA_COLOR` para células sem dado, `SupplementHeatmap.tsx:28`). O `StatCard` da mesma seção mostra skeleton corretamente, mas o gráfico logo abaixo já exibe a versão "sem dados" antes da resposta chegar.
- **✅ Correto — Estado vazio real da lista de blends é bem projetado e corretamente distinto de loading.** Ícone + título + mensagem orientativa (`track.history.empty_title`/`empty_message`, `HistoryScreen.tsx:298-303`), só aparece quando `!isBlendSummaryLoading && blendCount === 0` — nunca durante o carregamento.

### ConversationHistoryScreen

Arquivo: `apps/mobile/src/screens/ConversationHistoryScreen.tsx` (integral).

- **✅ Correto — Confirma o requisito documentado no CP3.3: exatamente 3 `ConversationCardSkeleton` durante o loading** (`ConversationHistoryScreen.tsx:120-128`, `SKELETON_COUNT = 3`), com shimmer via `SkeletonLoader`. Os 4 estados (`isLoading` / `isError` com retry / vazio / lista) são mutuamente exclusivos (`renderContent`, linhas 120-168) — nenhuma confusão entre "carregando" e "vazio". Estado vazio tem ícone + título + subtítulo orientativo (`pulseAi.historyEmptyTitle`/`historyEmptySubtitle`).
- **✅ Correto (cross-referência Tarefa 7) — Proteção de duplo toque ao abrir uma conversa:** `openingConversationId` desabilita todos os cards (`disabled={openingConversationId !== null}`) enquanto uma conversa está sendo aberta (`getConversationById`).

### ShoppingListsScreen

Arquivo: `apps/mobile/src/screens/ShoppingListsScreen.tsx` (integral).

- **✅ Correto (cross-referência Tarefa 5) — Estado vazio da lista principal é o mais completo encontrado no diagnóstico até agora:** ícone + título + subtítulo + botão CTA "Create first list" (`renderEmpty`, linhas 658–674).
- **🟢 Baixa (T3-F3) — Skeleton da lista principal não usa o `SkeletonLoader` compartilhado.** `skeletonCard` (linhas 823-827) é uma caixa cinza estática (`height:96, backgroundColor: SKELETON_BG`), sem shimmer/pulse — inconsistente com a linguagem visual usada em Home, Track e ConversationHistory (todas usam `SkeletonLoader` com animação de opacidade em loop).
- **🟢 Baixa (T3-F4) — Seção de arquivadas tem loading/erro só em texto simples, sem retry, e desaparece silenciosamente quando vazia.** `ArchivedSection` (linhas 154-203): `isLoading` → `<Text>{t('common.states.loading')}</Text>` (sem skeleton); `isError` → `<Text>{t('common.states.error')}</Text>` sem nenhum botão de retry (a única forma de tentar de novo é recolher e reexpandir a seção, reacionando a query via `enabled`); e se expandir e resolver com `lists.length === 0`, o bloco renderiza `null` — nenhuma mensagem de "nenhuma lista arquivada", o que pode parecer que o toggle não funcionou.

### WeeklyReportScreen

Arquivo: `apps/mobile/src/screens/WeeklyReportScreen.tsx` (integral).

- **✅ Correto — Máquina de estados completa e corretamente discriminada, incluindo o caso "relatório não existe ainda para esta semana" tratado como vazio (não como erro).** `datesQuery.isLoading` → `ReportSkeleton` (3× `SkeletonLoader variant="card"` com shimmer); `showEmptyNoReports || showReportNotFound` → `EmptyState` (ícone + título + subtítulo); `showReportError` (erro real, diferente de "not-found") → `ErrorState` com retry; `reportQuery.isLoading || !report` → skeleton novamente (linhas 394-401). `isNotFoundError` (linha 63-65) distingue explicitamente o código de API `weeklyReport/not-found` de qualquer outro erro — arquitetura de estados a mais completa das 13 telas analisadas até agora.
- **🟢 Baixa (T3-F5) — Mensagem de "nenhum relatório ainda" é texto estático genérico, sem data calculada.** `weeklyReport.emptySubtitle` = *"Your first weekly report will be available on Monday"* / *"...estará disponível na segunda-feira"* (`locales/en.json:1026`, `pt-BR.json:1026`) — não informa quantos dias faltam nem a data exata da próxima geração, só o dia da semana genérico.
- **🟡 Média (T3-F6) — Seletor de semana não é desabilitado durante `reportQuery.isLoading`.** As setas anterior/próxima (`WeeklyReportScreen.tsx:362-392`) só ficam `disabled` nos limites do histórico (`!canGoOlder`/`!canGoNewer`) — nada impede tocar repetidamente enquanto a semana atual ainda carrega, disparando múltiplas queries (uma por `weekStartDate`, sem debounce) e produzindo flicker de skeleton entre semanas diferentes se o usuário navegar rápido.

### MeScreen

Arquivo: `apps/mobile/src/screens/MeScreen.tsx` (integral, 1955 linhas).

- **🟡 Média (T3-F7) — StatCards de streak/blends/nível não têm nenhum estado de loading, apesar do `StatCard` suportar a prop `isLoading`.** A query `userProfile` (linhas 532-536) não desestrutura `isLoading` em nenhum momento — os 4 `StatCard` (linhas 1164-1189: `currentStreak`, `totalBlends`, `longestStreak`, `level`) renderizam imediatamente com `profile?.currentStreak ?? 0` etc., ou seja, mostram **"0"** até a query resolver, sem skeleton. Mitigado na prática pelo próprio comentário do arquivo (linha 5: a query "reutiliza o cache preenchido pela HomeScreen") — se o usuário já visitou a Home antes (fluxo comum, já que Home costuma ser a aba inicial), o cache já está quente e não há flash perceptível. Mas se a Me for a primeira tela após cold boot (deep link, estado de navegação restaurado) ou o cache de 15 min já tiver expirado, os números reais piscam de "0" para o valor correto sem nenhum aviso visual.
- **Informativo (cross-referência T1-F3) — O indicador de nível/progresso na Me sofre o mesmo flash de cold boot documentado na Home.** `totalXP` vem da mesma `gamification.store` (começa em 0, corrigido só via `useEffect` pós-render, linhas 538-546) — "Lv. N" e a barra de progresso (linhas 1196-1223) podem piscar aqui pelo mesmo motivo.
- **✅ Correto (avaliação completa na Tarefa 4) — Upload de foto de perfil tem `ActivityIndicator` sobre o círculo (`isProfilePhotoLoading`, linhas 1122-1126) e preview otimista** (`setProfilePhotoPreviewUri` setado antes da resposta do servidor, revertido para `null` no `catch`, linhas 775-806).
- **✅ Correto (cross-referência Tarefa 7) — Botão de compartilhar relatório semanal no header mostra `ActivityIndicator` no lugar do ícone e fica `disabled` durante `isWeeklyShareLoading`** (linhas 1071-1086).

---

## Tarefa 4 — Operações longas: Pulse AI, Pantry Scanner e upload de foto

### Pulse AI

Arquivo: `apps/mobile/src/screens/PulseAIScreen.tsx` + `apps/mobile/src/components/pulseAi/ChatInput.tsx`, `ChatMessageSkeleton.tsx` (integrais).

- **✅ Correto — Indicador de "gerando" visível e bem projetado enquanto a IA processa.** `ChatMessageSkeleton` dedicado (não o genérico do `ui/SkeletonLoader.tsx`) imita a estrutura de um card de receita real — título, subtítulo, corpo com 4 linhas e 4 "macro pills" (`ChatMessageSkeleton.tsx:13-55`) — exibido como `ListFooterComponent` da FlatList enquanto `isLoading` é `true` (`PulseAIScreen.tsx:498`).
- **✅ Correto — Botão de envio (e o campo de texto inteiro) ficam desabilitados durante o processamento.** `ChatInput.tsx:106-107`: `isFieldDisabled = isLoading || isLimitReached || isOffline` desabilita o `TextInput`; o botão de enviar (`disabled={!canSend || isLoading}`) troca o ícone por `ActivityIndicator` enquanto `isLoading` (linhas 256-261) — proteção dupla contra duplo toque, avaliação completa na Tarefa 7.
- **🟡 Média (T4-F1) — Nenhuma mensagem de status para esperas longas.** Nem o skeleton nem o `ChatInput` mudam de aparência ou texto conforme o tempo passa — o mesmo shimmer estático roda indefinidamente independente de a resposta levar 3s ou 15s+, sem nenhum "isso pode levar mais alguns segundos" ou indicação equivalente. Relevante porque o Pulse AI (texto) pode levar vários segundos dependendo do provider de IA (referência do CP3.3), e nada no código diferencia visualmente uma espera normal de uma anormalmente longa.

### Pantry Scanner

Arquivo: `apps/mobile/src/screens/PantryScannerScreen.tsx` (integral, 809 linhas) + `apps/mobile/src/assets/index.ts`.

- **🔴 Alta (T4-F2) — O step "analyzing" (o mais crítico, latência de referência de até ~45s para Vision AI) não tem NENHUMA animação, spinner, shimmer ou indicação de progresso.** `PantryScannerScreen.tsx:452-463`: a tela inteira nesse step é só um `View` estático com `imagePlaceholderStyles.blendiLogo` — que não é nem uma imagem real, é um objeto `ViewStyle` estático sem nenhuma animação (`assets/index.ts:14-18`, o `require` do logo real está comentado na linha 6) — mais o texto estático `t('pantryScanner.analyzing')`. Nenhum `ActivityIndicator`, nenhum shimmer, nenhuma estimativa de tempo ou progresso. Numa operação que pode levar até 45 segundos, a tela fica **visualmente parada o tempo inteiro** — o usuário não tem nenhum sinal de que algo está acontecendo e muito provavelmente concluiria que o app travou. É o achado de maior impacto de todo o diagnóstico até agora.
- **✅ Correto — Falha na análise sempre retorna ao step de captura com mensagem; a tela nunca fica presa em "analyzing".** Todo caminho de erro (`.catch`, linhas 190-208) e os casos de negócio `noFoodDetected`/`noUsableIngredients` (linhas 166-180) fazem `setStep('capture')` + `showToast(message)` de volta pro usuário — inclusive o limite mensal atingido, que redireciona direto para a tela de Upgrade (`handleUpgradePress`, sem travar em lugar nenhum).
- **🟢 Baixa (T4-F3) — Botão "Generate Recipes" mostra um loading que não corresponde a nenhuma espera real.** As receitas já foram geradas pela IA e armazenadas em `recipes` durante o step "analyzing" anterior (`setRecipes(result.recipes)`, linha 187). `handleGenerateRecipes` (linhas 323-326) só troca o `step` para `'recipes'` — e o próprio `useEffect` (linhas 216-220) desliga `isGeneratingRecipes` assim que detecta `step === 'recipes'`, no ciclo de render seguinte. O `loading` do `AuthButton` é, na prática, cosmético/quase instantâneo, não uma espera de rede genuína — nome do botão sugere geração em tempo real quando na verdade é só uma transição de tela.

### Upload de foto de perfil

Arquivo: `apps/mobile/src/screens/MeScreen.tsx` (handlers de foto, linhas 750-963) + `apps/mobile/src/components/profile/ProfilePhoto.tsx` (integral).

- **✅ Correto — `ActivityIndicator` sobreposto ao círculo da foto durante o upload** (`isProfilePhotoLoading`, `MeScreen.tsx:1122-1126`, overlay `photoLoadingOverlay`).
- **✅ Correto — Feedback otimista real: a preview local aparece ANTES da confirmação do servidor.** `setProfilePhotoPreviewUri(processedPhoto.previewUri)` (linha 775) é setado logo após comprimir a imagem localmente, antes do `api.post` — o usuário já vê a nova foto enquanto o upload roda em background.
- **✅ Correto — Toast de erro em toda falha, com reversão correta de estado.** Se o upload falhar, `profilePhotoPreviewUri` volta a `null` (linha 802, reverte para a foto anterior/iniciais) e `photoError` é mostrado via `showToast` (linha 803). Mesma proteção no fluxo de remoção de foto (linhas 881-882: reverte e avisa).
- **✅ Correto — `ProfilePhoto` (componente base) tem seu próprio cache MMKV + `ActivityIndicator` embutido para a busca inicial da foto do servidor**, independente do fluxo de upload (`isLoading`, `ProfilePhoto.tsx:137,239-240`) — evita mostrar iniciais "vazias" sem indicação enquanto a foto real é buscada pela primeira vez ou quando o cache está desatualizado (`profilePhotoUpdatedAt` divergente do cache).
- **Informativo — Sequência de 2 toasts durante o upload** (`uploadingPhoto` disparado no início, depois `photoUpdated`/`photoError` no fim, `MeScreen.tsx:774,800,803`) — não é um problema, só um padrão diferente do resto do app (a maioria das operações só mostra 1 toast, no resultado final).

---

## Tarefa 5 — Estados vazios: primeira experiência e telas sem dados

### Primeira experiência pós-onboarding

Arquivo: `apps/mobile/src/screens/onboarding/OnboardingMacrosScreen.tsx` (conclusão do fluxo) + revisão cruzada com a HomeScreen (Tarefa 1).

- **✅ Correto — GoalRings não mostram "zero quebrado"; mostram zero real com a mesma animação de preenchimento de qualquer carregamento.** Como documentado na Tarefa 1, `GoalRingsSection` só monta depois que `isLoading` (perfil + blend logs) resolve — um usuário recém-saído do onboarding vê os 3 anéis com a animação normal de preenchimento (`GoalRing`, via `hasMounted` guard da Área 7) indo a 0%, porque o valor é genuinamente 0. Não há tratamento especial de "primeira vez" nem é necessário — o comportamento correto (zero real, sem flash) já é o mesmo para qualquer carregamento.
- **✅ Correto — Daily Recipe Card aparece normalmente desde o primeiro acesso**, já que usa receitas estáticas locais (`DAILY_RECIPES`, sem query) — nenhuma dependência de dado que só existiria após uso (avaliação completa na Tarefa 9).
- **✅ Correto — Bloco de missões diárias mostra as 3 missões reais do dia (zeradas), não um estado vazio.** Confirmado no backend: `getDailyMissionsForUser` (`apps/api/src/services/missionProgress.service.ts:373-376`) chama `findOrCreateDailyMission` diretamente — o primeiro `GET /daily-missions` do dia já cria e retorna o documento com as missões sorteadas, então mesmo no primeiríssimo acesso o usuário vê 3 `MissionCard` reais com progresso 0/N, nunca uma lista vazia ou um "nenhuma missão hoje".
- **✅ Correto — Nenhum achado de "tela em branco" no primeiro acesso.** Todas as seções da Home (GoalRings, StreakBadge, missões, Daily Recipe Card) têm dado disponível desde o primeiro carregamento — os únicos problemas de primeira experiência já documentados são de outra natureza (T1-F1 layout shift do skeleton, T1-F3 flash do indicador de nível), não de "vazio".

### Inventário de `ListEmptyComponent` — todas as listas do app

| Lista / Tela | Qualidade do estado vazio | Detalhe |
|---|---|---|
| **Favoritos** (`FavoritesListScreen.tsx:177-197`) | ✅ Completo — o melhor do app | Ícone + título + subtítulo orientativo ("as receitas que você curtir no Pulse AI aparecerão aqui") + botão CTA ("Discover recipes") + **animação de entrada** (opacity+scale, único caso com animação) |
| **Listas de compras** (`ShoppingListsScreen.tsx:658-674`) | ✅ Completo | Ícone + título + subtítulo + botão CTA ("Create first list") |
| **Itens de uma lista de compras** (`ShoppingListDetailScreen.tsx:510-516`) | ✅ Completo | Ícone + título + subtítulo orientativos |
| **Histórico de conversas do Pulse AI** (`ConversationHistoryScreen.tsx:142-150`) | ✅ Completo | Ícone + título + subtítulo orientativo ("use o Pulse AI para começar") |
| **Histórico de blends — "All Blends"** (`HistoryScreen.tsx:298-303`) | ✅ Completo | Ícone + título + mensagem orientativa |
| **Seleção de receita favorita p/ importar** (`ImportFromFavoritesSheet.tsx:246-252`) | ✅ Completo | Ícone + título + subtítulo (reaproveita `favorites.emptySubtitle`) |
| **Seleção de lista p/ adicionar itens** (`AddToListSheet.tsx:236-241`) | ✅ Completo | Ícone + título + subtítulo (reaproveita `shoppingList.emptySubtitle`) |
| **Meu Stack de suplementos** (`MyStackSection.tsx:130-136`) | 🟡 Intermediário | Só texto + link "Add supplement", **sem ícone** — mensagem orientativa presente, mas visualmente menos completo que os demais |
| **Listas de compras arquivadas** (`ShoppingListsScreen.tsx` → `ArchivedSection`, linhas 182-200) | 🔴 Nenhum | Já documentado como T3-F4: `lists.length === 0 ? null` — nada é mostrado quando a seção expande e está genuinamente vazia |

Padrão geral: 7 das 9 listas do app têm estado vazio bem projetado (ícone + título + subtítulo orientativo, muitas com CTA), com texto que orienta corretamente a ação esperada (favoritar uma receita no Pulse AI, usar o Pulse AI, criar uma lista). A exceção mais notável é a seção de arquivadas da ShoppingListsScreen, que não segue o padrão do resto do app.

`QuickProtocolCards` (Home) e `ActiveRecipeHeader` (Blend) usam `FlatList` mas nunca ficam vazias por design (dado estático por objetivo / ingredientes de uma receita já confirmada) — não se aplicam a este inventário.

---

## Tarefa 6 — Estados de erro: tratamento e exibição

### Arquitetura geral de erros (achado central desta tarefa)

Arquivos: `apps/mobile/src/utils/error.utils.ts`, `apps/mobile/src/utils/toast.utils.tsx`/`toast.events.ts`, e o padrão `to*ServiceError` repetido em praticamente todo `apps/mobile/src/services/*.ts`.

- **✅ Correto — 429 (Área 8) já está mapeado de forma legível e uniforme em quase todo o app, via uma única função central.** `getApiErrorTranslationKey`/`getAxiosErrorTranslationKey` (`error.utils.ts:9-31`) transformam qualquer `code` de erro da API (ex.: `auth/too-many-requests`) em uma chave i18n (`errors.auth_too_many_requests`) — sem tratamento especial por status HTTP, então funciona automaticamente para os 3 rate limiters da Área 8 (`authLoginLimiter`, `authRegisterLimiter`, `authenticatedLimiter`, todos em `apps/api/src/middlewares/rateLimiter.ts`) sem precisar de nenhum código novo no mobile. Confirmado que as chaves resultantes **existem** em `locales/en.json:788-789` e `pt-BR.json:788-789` ("Too many attempts. Please wait a few minutes and try again." / "Muitas tentativas. Aguarde alguns minutos e tente novamente."). Esse padrão (`to*ServiceError` → `translationKey` → `getApiErrorTranslationKey`) é usado consistentemente em `blendLog.service.ts`, `shoppingList.service.ts`, `pantryScanner.service.ts`, `pulseAi.service.ts`, `hydration.service.ts`, `supplementStack.service.ts`, `dailyMission.service.ts`, `purchase.service.ts`, e no login/registro (`LoginScreen.tsx:112-113` usa `getAxiosErrorTranslationKey` diretamente). Este é o achado mais positivo do diagnóstico: a Área 8 não introduziu nenhuma lacuna de UX porque o sistema de erros já era genérico o bastante para absorver o novo código sem alteração.
- **🟡 Média (T6-F1, exceção ao padrão acima) — Falha no `POST /blend-logs` quando o app julga estar online usa `Alert.alert` genérico, ignorando o `translationKey` específico já mapeado.** Ver seção "Blend log" abaixo — o único ponto crítico do app onde o erro específico (incluindo um eventual 429) é substituído por uma mensagem fixa de "Server error" independente da causa real.

### Blend log falha

Arquivo: `apps/mobile/src/screens/BlendScreen.tsx:227-284` (`handleRateOrSkip`).

- **✅ Correto — Se o app detecta que o device está offline (`isConnected === false`), o blend cai corretamente no offline queue do CP1.9.** `addPendingBlend(blendLogInput)` + `showToast(t('blend.savedLocally'))` (linhas 255-258) — o usuário recebe confirmação visível de que o blend foi salvo localmente.
- **🟡 Média (T6-F1) — Se `isConnected === true` mas a requisição falha mesmo assim (timeout, 5xx, 429, falso-positivo de conectividade), o blend NÃO cai no offline queue.** O `catch` (linhas 272-276) só faz `setIsLogging(false)` + `Alert.alert(t('errors.network.server'))` — um Alert nativo genérico ("Server error. We're on it — try again shortly."), o mesmo texto não importa a causa real do erro (mesmo que `createBlendLog` já lance um `BlendLogServiceError` com `translationKey` específico — esse campo nunca é lido aqui). O comentário do código (linha 274: "timerStatus permanece 'completed' para o usuário poder tentar novamente") confirma que a única proteção é o usuário ficar na tela e tocar em tentar de novo manualmente — se ele sair da tela ou fechar o app após ver o Alert sem retry, **o blend é perdido**, diferente do caminho explicitamente offline, que é automaticamente enfileirado.

### Pulse AI falha

Arquivo: `apps/mobile/src/screens/PulseAIScreen.tsx:334-404` (`handleSend`) — cross-referência Tarefa 4.

- **✅ Correto — Erro de IA/timeout aparece como mensagem visível dentro da própria conversa, nunca desaparece silenciosamente.** Uma `ChatMessage` com `isError: true` é adicionada ao histórico (linhas 389-397), usando o `translationKey` específico do `PulseAiServiceError` quando disponível.
- **🟡 Média (T6-F2) — Caso específico do limite diário (429 `pulseai/daily-limit-reached`): a mensagem do usuário desaparece da conversa sem nenhuma mensagem de erro no próprio fluxo do chat.** `PulseAIScreen.tsx:370-373`: em vez do padrão acima (mensagem de erro do assistente), esse caminho remove a mensagem do usuário da lista (`setMessages((prev) => prev.filter(...))`) — a explicação de "limite atingido" só aparece separadamente, no `ChatInput` (`limitRow`, fora da área de mensagens). Um usuário que não olhar para baixo pode só ver sua pergunta sumir sem entender por quê.

### Pantry Scanner falha

Cross-referência Tarefa 4 (T4, seção Pantry Scanner) — já documentado como **✅ Correto**: todo caminho de erro (`.catch`, `noFoodDetected`, `noUsableIngredients`, limite mensal) retorna ao step de captura com `showToast`, nunca trava em "analyzing".

### Rate limit atingido (429, pós-Área 8)

Já coberto na seção "Arquitetura geral de erros" acima — **✅ Correto** de forma ampla, com a exceção pontual do Blend log (T6-F1).

### Shopping List sync falha ao reconectar

Arquivo: `apps/mobile/src/utils/reconnectSync.utils.ts` (integral, 149 linhas).

- **🔴 Alta (T6-F3) — Falha do `PUT /shopping-lists/:id/items` durante o reconnect sync é 100% silenciosa, para sempre.** `syncDirtyShoppingLists` (linhas 95-121): o `catch` (linhas 117-119) só tem um comentário — *"Mantém a flag dirty para nova tentativa no próximo reconnect"* — nenhum toast, nenhum log, nenhuma indicação visual em lugar nenhum do app. Se a causa da falha for persistente (conflito de validação, 429, um bug no payload), a lista fica marcada "dirty" indefinidamente e tenta de novo silenciosamente a cada reconexão, sem que o usuário jamais saiba que as mudanças feitas offline nunca chegaram ao servidor. **Contraste direto dentro do mesmo arquivo:** a fila de blend logs (`processPendingBlendQueue`, linhas 58-83) faz o oposto — conta tentativas (até 3) e, ao desistir, chama `showPersistentToast` com um botão de retry explícito (`buildRetryAction`, linhas 47-56). O padrão correto já existe no arquivo, só não foi aplicado à sincronização de shopping lists.
- **Informativo — As outras duas etapas do reconnect sync (`invalidateCriticalQueries`, `markSyncCompleted`) também falham em silêncio,** mas com comentários explícitos justificando a decisão (best-effort, próxima navegação dispara refetch natural) — impacto bem mais baixo que o da sincronização de shopping lists, porque não representa perda de escrita do usuário, só cache potencialmente desatualizado.

### Upload de foto falha

Cross-referência Tarefa 4 — já documentado como **✅ Correto**: reverte para o estado anterior (`profilePhotoPreviewUri` volta a `null`, mostra iniciais/foto antiga) + `showToast` de erro, tanto no upload quanto na remoção.

---

## Tarefa 7 — Proteção contra duplo toque em botões críticos

### Botão de completar blend (BlendScreen.tsx / RatingBottomSheet.tsx)

- **🟡 Média (T7-F1) — Nenhuma proteção explícita (sem `disabled`, sem loading) nos botões de estrela/skip do `RatingBottomSheet`; a proteção real contra blend duplicado é um efeito colateral acidental da API `Animated`, não uma trava intencional.** `RatingBottomSheet.tsx:134-163`: `handleRate`/`handleSkip` chamam `closeSheet(callback)`, que roda uma animação (`translateY`/`backdropOpacity`, 180-220ms) e só invoca `onRate`/`onSkip` **depois** que a animação termina (`.start(({finished}) => { if (!finished) return; ... callback(); })`, linhas 123-131). Nem as estrelas (linhas 190-206) nem o botão "Skip" (linha 209) têm `disabled` — continuam tocáveis durante toda a animação de fechamento. Na prática, um segundo toque (em outra estrela, ou em "Skip") chama `closeSheet` de novo sobre os **mesmos** `Animated.Value` compartilhados — isso interrompe a primeira animação, que then dispara seu próprio callback com `finished:false` e pula a chamada de `onRate`/`onSkip` (só a última chamada realmente dispara). Esse comportamento evita blend duplicado hoje, mas depende inteiramente de uma característica interna da API `Animated` (interrupção de animação compartilhada) — não é uma proteção desenhada para esse fim, e se a sheet for migrada para animações independentes por botão (ou pra Reanimated), o comportamento pode deixar de proteger sem nenhum teste acusar isso. A segunda camada (`BlendScreen.tsx:229`, `if (isLogging) return`) é estado React, não uma trava síncrona por `ref` — sujeita à mesma limitação estrutural que o resto do app (não há garantia de que o guard já reflita o toque anterior antes do segundo toque ser processado).

### Botão de adicionar item na Shopping List (ShoppingListDetailScreen.tsx)

- **✅ Correto — Confirmado exatamente como documentado pela Área 2.** `isAdding` (`ShoppingListDetailScreen.tsx:203`) é checado no topo do handler (`handleAddItem`, linha 335: `if (trimmedName.length === 0 || isAdding) return`), setado como `true` de forma síncrona antes de qualquer chamada assíncrona (linha 350) e resetado em `.finally()` (linha 373) — e o botão em si recebe `disabled={isAdding}` com estilo visual dimmed (`addButtonDisabled`, linhas 558-560). Proteção completa em ambas as camadas (lógica + UI).

### Botão de envio no Pulse AI (PulseAIScreen.tsx / ChatInput.tsx)

- **✅ Correto (já documentado na Tarefa 4).** `ChatInput.tsx:106-107,256-261`: `isFieldDisabled = isLoading || isLimitReached || isOffline` desabilita o campo inteiro; o botão de enviar tem `disabled={!canSend || isLoading}` e troca o ícone por `ActivityIndicator` durante `isLoading` — impossível disparar um segundo envio antes da resposta anterior completar.

### Botão de criar nova lista de compras (ShoppingListsScreen.tsx)

- **✅ Correto — Protegido via `isPending` da mutation do React Query, não um booleano manual.** `ShoppingListsScreen.tsx:411`: `const { mutate: mutateCreate, isPending: isCreating } = useMutation(...)`. `isCreating` é passado como `nameSheetLoading` para o `AuthButton` do `ListNameSheet` (`disabled={trimmedName.length === 0 || isLoading}` + `loading={isLoading}`, linhas 328-338). Confirmado em `AuthButton.tsx:91,96`: `isDisabled = disabled || loading` — o próprio componente reutilizável já desabilita o `Pressable` sempre que `loading` é `true`, então qualquer tela que use esse padrão (inclusive o botão "Generate Recipes" do Pantry Scanner, Tarefa 4) herda a proteção automaticamente.

### Botão de marcar suplemento (SupplementCheckItem.tsx)

- **🟡 Média (T7-F2) — Nenhuma proteção contra duplo toque; dois toques rápidos podem gerar uma dessincronia visível entre o contador local e o valor real do servidor.** O `Pressable` do círculo de check (`SupplementCheckItem.tsx:157-165`) não tem `disabled`, e a mutation em `TrackScreen.tsx:269-318` (`mutateProgress`) não expõe nem verifica `isPending` antes de disparar outra chamada. `handleIncrement`/`handleDecrement` (`SupplementCheckItem.tsx:133-149`) só bloqueiam nos limites (`consumedTodayCount >= dailyTargetCount` / `<= 0`), não contra chamadas concorrentes dentro da faixa válida. **Efeito observável de um duplo toque rápido (fora dos limites):** como o `onMutate` otimista (`TrackScreen.tsx:279-306`) só atualiza o cache de forma assíncrona, dois toques no mesmo frame podem ambos ler o mesmo `consumedTodayCount` de partida e computar o mesmo `nextConsumedTodayCount` (+1) — a UI mostra só +1 visualmente, mas **duas** chamadas reais a `checkSupplement`/`uncheckSupplement` são enviadas ao backend. Quando `onSettled` invalida e reconcilia com o servidor, o contador pode "saltar" de forma inesperada para um valor diferente do que o usuário viu durante os toques (dessincronia local vs. servidor), especialmente perceptível em suplementos com `dailyTargetCount` baixo.

### Botão de log de água (HydrationSection.tsx)

- **🟡 Média (T7-F3) — Nenhuma proteção contra duplo toque; dois toques rápidos registram genuinamente duas doses de água.** O `Pressable` do botão "Log Water" (`HydrationSection.tsx:306-339`, `logButton`) não tem `disabled`. `handleLogWater` (linha 267-278) só verifica `isOffline` — nada impede uma segunda chamada de `onLogWater()` (→ `mutateLogWater()` em `TrackScreen.tsx:248-254`) enquanto a primeira ainda está em voo; a mutation não expõe/consulta `isPending`. **Efeito observável:** diferente do caso do suplemento (que é limitado por `dailyTargetCount`), aqui `logWater(250)` é uma quantidade fixa sem limite superior — dois toques rápidos disparam **duas requisições reais** de +250ml cada, resultando em +500ml registrado no total de hidratação do dia para o que o usuário percebeu como um único toque. A animação de confirmação (`animateWaterConfirmation`) roda para cada toque também, sem indicar que o segundo foi redundante.

---

## Tarefa 8 — Pull to refresh e atualização manual

Levantamento em todas as 14 telas de `apps/mobile/src/screens/`. Apenas **2 das 14** implementam `RefreshControl`/`onRefresh`.

| Tela | Pull-to-refresh? | `staleTime` da(s) query(s) principal(is) | Avaliação |
|---|---|---|---|
| **HomeScreen** | ✅ Sim (`HomeScreen.tsx:360-368`, atualiza profile+blendLogs+hydration) | `USER_PROFILE_TTL` 15min / `HYDRATION_TODAY_TTL` 1h | — |
| **FavoritesListScreen** | ✅ Sim (`FlashList` `onRefresh`/`refreshing`, linhas 206-207) | `FAVORITES_TTL` 30 dias | — |
| **TrackScreen** | ❌ Não | `HYDRATION_TODAY_TTL` 1h / `SUPPLEMENT_STACK_TTL` 24h | 🟡 Ausência discutível (T8-F2) — é uma aba principal revisitada várias vezes ao dia (ex.: usuário toma suplemento em outro device), TTLs de 1h/24h são longos demais pra depender só de invalidação automática entre sessões. |
| **HistoryScreen** | ❌ Não (`ScrollView` só tem `onScroll` customizado p/ animação, sem `RefreshControl`) | `BLEND_HISTORY_TTL` **7 dias**, aplicado às 3 queries de resumo (`useHistoryData.ts:88,100,112`) | 🟡 Ausência não é aceitável (T8-F1) — é a tela citada explicitamente no enunciado como "dados que mudam com novos blends", e o `staleTime` de 7 dias significa que sem pull-to-refresh o usuário não tem NENHUMA forma de forçar atualização caso os dados tenham mudado em outro dispositivo (só invalidação automática via ações no mesmo device). Não chega a Alto porque não quebra layout nem gera confusão sobre o app estar funcionando — só entrega dado desatualizado sem aviso. |
| **ConversationHistoryScreen** | ❌ Não (`FlatList` simples) | 5 min (default global, `queryClient.ts:22`) | ✅ Aceitável — TTL curto, tela de baixo risco (histórico de conversas, não dado operacional do dia). |
| **ShoppingListsScreen** | ❌ Não (`FlatList`, sem `onRefresh`) | `SHOPPING_LISTS_TTL` **7 dias** (`ShoppingListsScreen.tsx:377`) | 🟡 Ausência discutível (T8-F3) — mudanças feitas em outro device (criar/arquivar lista) não apareceriam por até 7 dias sem navegar pra fora e voltar (o que também não força refetch, já que os 7 dias de `staleTime` valem pro remount também). |
| **ShoppingListDetailScreen** | ❌ Não (`SectionList`, sem `onRefresh`) | `DETAIL_STALE_TIME_MS` = **30s** (`ShoppingListDetailScreen.tsx:41,214`) | 🟢 Ausência aceitável na prática — é a tela citada no enunciado ("dados que podem mudar em outro dispositivo após sync offline"), mas o `staleTime` de 30s é curto o bastante para que sair e voltar à tela (ou uma nova navegação) já force um refetch — a única lacuna real é forçar atualização **sem sair da tela**, cenário mais raro. |
| **WeeklyReportScreen** | ❌ Não (`ScrollView`) | 5 min (default global) | ✅ Aceitável — dado de cadência semanal, baixíssima chance de precisar de atualização manual. |
| **MeScreen** | ❌ Não (`ScrollView`) | `USER_PROFILE_TTL` 15 min (query compartilhada com a Home) | 🟢 Ausência mitigada — é a tela citada no enunciado ("estatísticas que mudam com o uso do app"), mas como a query é a mesma (`QUERY_KEYS.userProfile`) atualizada pelo pull-to-refresh da Home, um usuário que puxar pra atualizar na Home também vê o reflexo aqui. A lacuna real é só para quem nunca visita a Home antes de checar a Me. |
| **PulseAIScreen** | N/A | — | Lista é o histórico da conversa atual (estado local), não uma query paginada de dados — pull-to-refresh não se aplica. |
| **PantryScannerScreen** | N/A | — | Fluxo de captura/análise por steps, sem lista de dados remotos. |
| **BlendScreen / ManageStackScreen / UpgradeScreen** | ❌ Não | — | Fora do escopo citado no enunciado; telas transacionais/de configuração, não de navegação por dados históricos — ausência de pull-to-refresh é o padrão esperado para esse tipo de tela. |

**Resumo:** o achado mais forte é a **HistoryScreen** — única tela onde o `staleTime` (7 dias) e a ausência total de pull-to-refresh se combinam sem nenhuma mitigação (nem TTL curto, nem cache compartilhado com outra tela que tem refresh). TrackScreen e ShoppingListsScreen são achados secundários pela mesma lógica, mas com TTLs menos extremos ou uso mais eventual.

---

## Tarefa 9 — Avaliação do Daily Recipe Card

Arquivos: `apps/mobile/src/components/home/DailyRecipeCard.tsx` (integral, lido na Tarefa 1) + `apps/mobile/src/screens/HomeScreen.tsx:332-334,507-513` (`handleStartBlend`) + `apps/mobile/src/screens/BlendScreen.tsx:90-138,328-338,363` (recepção do parâmetro de receita) + busca por `dailyRecipe` em todo o monorepo (`apps/api`, `apps/mobile`, `packages/shared`).

### De onde vêm os dados

- **Constante local hardcoded, sem nenhuma query nem campo de store.** `DAILY_RECIPES: Record<UserGoal, DailyRecipe>` (`DailyRecipeCard.tsx:37-66`) — 4 receitas fixas, uma por objetivo (`Muscle`, `Wellness`, `Energy`, `Recovery`). O único dado dinâmico é `goal={profile?.goal ?? 'Wellness'}`, vindo da query `userProfile` — ou seja, a única coisa que muda entre usuários é QUAL das 4 receitas fixas aparece, nunca o conteúdo delas.
- **Nenhum campo `dailyRecipe` existe no modelo `User`, nem em nenhum lugar do backend ou do pacote `shared`.** Busca em todo o monorepo por `dailyRecipe` não retornou nenhuma ocorrência — o plano do CP3.4 (geração diária via cron + campo no `User`) não foi apenas modificado, **nunca chegou a ser implementado**; a Home continua exatamente como no CP1.4.

### Estrutura de dados: divergência real dos campos do Pulse AI

- **`DailyRecipe` (Daily Recipe Card) não tem a mesma estrutura de `PulseAiRecipe` (receitas geradas pelo Pulse AI/Pantry Scanner) — faltam campos que o resto do app trata como obrigatórios.** `DailyRecipe` (`DailyRecipeCard.tsx:15-25`): `nameKey`, `protein`, `carbs`, `calories`, `durationMinutes` — só isso. `PulseAiRecipe` (usado em `ChatMessage`, `RecipeCard`, `BlendScreen`) exige `ingredients: Ingredient[]`, `macros: {protein, carbs, fat, calories}`, `prepTimeSeconds`, `blendInstruction`, `tip`, `hasSubstitutes`. Faltam no Daily Recipe Card: **`fat`** (nem aparece na UI do card), a lista de **ingredientes**, a **instrução de preparo**, e a **dica**. Essa divergência não é cosmética — é estruturalmente incompatível com o validador `isPulseAiRecipe()` do `BlendScreen` (`BlendScreen.tsx:90-118`), que exige `ingredients` não-vazio e `macros.fat` numérico. Mesmo que alguém tentasse corrigir o próximo achado (botão sem payload) da forma mais direta possível, os dados do `DailyRecipe` **não passariam** na validação de tipo do `BlendScreen` sem antes serem enriquecidos com ingredientes/fat/instrução — não é um ajuste de uma linha.

### Botão "Start Blend": navega sem payload, confirmado

- **🔴 Alta (T9-F1) — O botão "Start Blend" do Daily Recipe Card navega para a `BlendScreen` sem nenhum parâmetro de receita, apesar do próprio código do `BlendScreen` documentar essa origem como esperada.** `HomeScreen.tsx:332-334`: `handleStartBlend = () => navigation.navigate('Blend')` — nenhum `params` é passado (compare com Pulse AI/Pantry Scanner, que sempre passam `{ recipe }`, ex. `PulseAIScreen.tsx:435-439`). O comentário do próprio `BlendScreen.tsx:329-330` diz literalmente: *"Chamado quando o usuário vem do Pulse AI **ou da Home via 'Start Blend'**"* — o desenvolvedor documentou a intenção de que a Home também mandasse uma receita, mas isso nunca foi implementado no lado do `DailyRecipeCard`/`HomeScreen`.
  **Efeito observável, confirmado no código:** `getIncomingRecipe(route.params)` (`BlendScreen.tsx:121-128,332`) retorna `null` quando não há `params.recipe` — o `useEffect` que atualizaria `activeRecipe` na store (`setActiveRecipe`, linha 335) simplesmente não roda. Como `activeRecipe` vem de uma store Zustand persistente entre navegações (`useBlendStore`, não resetada nesta rota), dois cenários acontecem:
  1. **Usuário já tem um `activeRecipe` de uma sessão anterior** (ex.: blendou uma receita do Pulse AI mais cedo) → a `BlendScreen` mostra essa receita **antiga e completamente diferente** da que aparecia no Daily Recipe Card, sem nenhum aviso de que não é a mesma.
  2. **Usuário nunca setou um `activeRecipe`** (ex.: primeiro blend da conta, feito direto pelo Daily Recipe Card) → `activeRecipe` é `null`, e `ActiveRecipeHeader` **não é renderizado** (`BlendScreen.tsx:363`, `{activeRecipe !== null && <ActiveRecipeHeader .../>}`) — o usuário cai numa tela de timer pura, sem nome da receita, sem macros, sem nada que lembre o card que ele acabou de tocar.
  Em ambos os casos, o botão "Start Blend" quebra a expectativa criada pelo próprio card — é o achado de maior impacto desta tarefa, e um dos mais graves do diagnóstico inteiro, porque é 100% determinístico (não depende de rede, timing ou concorrência) e afeta literalmente todo usuário que toca nesse botão.

### Repetição e expectativa de personalização

- **🟡 Média (T9-F2, qualitativo) — A receita é 100% determinística por objetivo, sem rotação nem variação por data — o usuário percebe a repetição já na segunda vez que abre o app.** Como `DAILY_RECIPES[goal]` é uma tabela fixa sem nenhum componente de data/aleatoriedade, o card mostra **exatamente a mesma receita todos os dias**, indefinidamente, até o usuário mudar o campo `goal` no perfil (`Settings > Goal`). Isso contradiz diretamente a copy do próprio card — o badge diz `t('home.todaysBlend')` ("Today's Blend"), um texto que promete variação diária que não existe. Um usuário que abre o app pela manhã e à noite no mesmo dia (ou em dois dias seguidos) já nota a repetição — não é preciso "várias aberturas" para perceber, é imediato a partir da segunda visualização.

---

## Tarefa 10 — Achados fora do escopo explícito desta área

- **🟢 Baixa (T10-F1) — O componente `ProfileSkeleton` está desenhado exatamente para o formato de header da MeScreen (avatar centralizado + nome + subtítulo), mas é usado apenas na HomeScreen — onde não combina com o layout real (achado T1-F1) — enquanto a MeScreen, cujo header tem exatamente esse formato (foto de perfil circular + nome + email, `MeScreen.tsx:1105-1157`), não usa nenhum skeleton (achado T3-F7).** `SkeletonLoader.tsx:227-254`: `ProfileSkeleton` renderiza um círculo de avatar (80px) + duas linhas de texto centralizadas — é literalmente a forma do header da Me, não da Home (que é alinhada à esquerda, sem avatar, com badge de nível). O componente certo existe no design system do app, só está aplicado no lugar errado e ausente no lugar certo.
- **🟢 Baixa (T10-F2) — Gatilho de animação dos gráficos da HistoryScreen usa offsets de scroll fixos em pixels, não a posição real de cada seção.** `HistoryScreen.tsx:49-50,135-149`: `HYDRATION_SCROLL_THRESHOLD = 450` e `SUPPLEMENTS_SCROLL_THRESHOLD = 850` são constantes fixas comparadas contra `event.nativeEvent.contentOffset.y` para decidir quando animar `MacroBarChart`/`HydrationBarChart`/`SupplementHeatmap` (`animate={hydrationVisible}` etc.). Como a altura real de cada seção varia com o tamanho de fonte do sistema (Dynamic Type/acessibilidade), tamanho de tela, e principalmente com a quantidade de dados retornados (`blendLogs.map(...)`, cuja altura é dinâmica), esses offsets podem não corresponder à posição real das seções em todos os dispositivos — na pior hipótese, o gráfico anima antes de estar visível (desperdiçado) ou só depois que a seção já está bem acima do topo da tela (usuário nunca vê a animação, só o estado final estático). Impacto puramente de polimento, sem afetar dado ou funcionalidade.

Além dos dois achados acima (encontrados na leitura própria), a leitura das Tarefas 1-9 não revelou textos de loading enganosos adicionais, estados de loading que ficam presos (verifiquei especificamente o fluxo de compartilhamento de relatório semanal, `WeeklyReportScreen.tsx`/`MeScreen.tsx`, que usa `generateAndShare` — a função tem `try/catch` interno que nunca deixa a Promise rejeitar, então `isShareLoading`/`isWeeklyShareLoading` sempre são resetados corretamente mesmo em falha), nem inconsistências visuais adicionais entre telas semelhantes. Um terceiro achado (T10-F3) foi reportado pelo usuário depois da Tarefa 10 e investigado abaixo.

### T10-F3 — Celebração de level up quase transparente (reportado pelo usuário) + análise das demais celebrações

Arquivos: `apps/mobile/src/components/gamification/LevelUpCelebration.tsx` (integral, 504 linhas) + `apps/mobile/App.tsx:98-124` (montagem global) + `apps/mobile/src/components/missions/MissionCompletionToast.tsx` (integral) + busca por outros componentes de celebração (`particle`, `confetti`) em todo `apps/mobile/src`.

**Relato do usuário:** a celebração de level up aparece quase transparente na tela; o esperado é a tela escurecer e a celebração aparecer por cima.

- **🔴 Alta (T10-F3) — O código especifica corretamente um backdrop escuro (0.84 de opacidade) e devidamente animado, mas isso diverge do comportamento relatado ao vivo — a causa mais provável é uma interação de stacking do `react-native-screens` no Android, não um bug óbvio de lógica.** Confirmado que a intenção do código está certa: `OVERLAY_COLOR = 'rgba(0,0,0,0.84)'` (`LevelUpCelebration.tsx:36`) é aplicado a um `Animated.View` de fundo (`backdrop`, linha 425-431) que anima de opacidade 0 → 1 em 200ms assim que `levelUpData` deixa de ser `null` (linhas 243-262), e permanece em 1 durante os ~3s de exibição (`AUTO_CLOSE_DELAY = 3000`, linha 34) até o fechamento reverter para 0. O componente está corretamente montado como overlay global — `App.tsx:121`, `<LevelUpCelebration />` é o **último filho** de `SafeAreaProvider`, depois de `PersistQueryClientProvider`/`AppShell` (que contém toda a navegação) e de `OfflineBanner` — ou seja, deveria compor por cima de qualquer tela por ordem de JSX, com `overlay` usando `position:'absolute'` cobrindo a tela inteira (`zIndex:1000`, linhas 417-424).
  Rastreei toda a máquina de animação (`handleClose`, `finishClose`, o guard `isClosingRef`, o branch de interrupção `finished:false`) procurando um caminho que zerasse `overlayOpacity` sem fechar o modal — não encontrei nenhum sob o fluxo normal (abrir → esperar 3s → fechar, ou abrir → tocar no backdrop → fechar): o guard `isClosingRef.current` impede reentrância em `handleClose`, e o único branch que reseta `overlayOpacity` para 0 sem chamar `dismissLevelUp()` é o de animação interrompida (linhas 186-195), que exigiria uma segunda chamada de `handleClose` durante o fechamento — bloqueada pelo próprio guard.
  **Hipótese mais provável (requer confirmação em runtime, não visível por leitura estática):** `App.tsx:12` chama `enableScreens()` (ativação do `react-native-screens`) antes de qualquer render — isso faz o React Navigation montar cada tela como uma view nativa otimizada (Fragment no Android). É um padrão conhecido do ecossistema RN essas views nativas de tela não respeitarem a ordem de composição JS/JSX da mesma forma que Views comuns quando um overlay global (como o `LevelUpCelebration`) é renderizado como irmão *fora* do `NavigationContainer` — o backdrop pode estar sendo desenhado corretamente, mas parcialmente obscurecido/mal composto pela camada nativa da tela ativa, o que se perceberia visualmente como "quase transparente" mesmo com a opacidade animada correta no código JS. Vale testar especificamente no Android (esse tipo de gotcha é bem mais raro no iOS) e, se confirmado, mover o `LevelUpCelebration` para dentro do `NavigationContainer` (como um modal de root stack) em vez de irmão externo, ou usar uma API de portal/modal nativa (`Modal` do RN, como já é feito no `RatingBottomSheet`/`ListNameSheet`/etc. — nenhum desses outros overlays do app tem esse problema porque todos usam `<Modal>`, e o `LevelUpCelebration` é o único overlay "full-screen" do app que **não** usa `<Modal>`, optando por uma `View` absoluta solta na árvore).
- **✅ Correto — Nenhuma outra "celebração" full-screen existe no app (busca por `particle`/`confetti` em todo `apps/mobile/src` retorna só o `LevelUpCelebration`).** O único outro momento de comemoração é o `MissionCompletionToast` (`MissionCompletionToast.tsx`, integral) — um toast pequeno no topo da tela (pílula verde, ícone + texto de XP ganho), **intencionalmente sem backdrop/escurecimento** (`pointerEvents="none"`, linha 127, nunca bloqueia interação com o resto da tela) — design correto e proporcional para uma conquista menor (completar 1 missão) comparada ao level up (marco maior, merece o tratamento full-screen). Não foi encontrado nenhum bug de transparência ou de composição neste componente — a ausência de backdrop aqui é intencional, não um bug.
- **Informativo — `LevelDetailSheet.tsx` (sheet de detalhes de nível, acessível a partir do indicador "Lv. N" no header da Home) usa um backdrop mais claro (`rgba(0,0,0,0.3)`, 30%), mas corretamente — é um bottom sheet informativo, não uma celebração, e usa `<Modal>` nativo (não sofre do mesmo problema hipotetizado acima).**

---

## Tarefa 11 — Fluxos fora do escopo original (auth, compra, gerenciar suplementos, cold boot)

Extensão do diagnóstico a pedido do usuário, cobrindo áreas do mesmo assunto (feedback visual/loading/erro/duplo-toque) que as 10 tarefas originais não tocaram: os 5 fluxos de autenticação, o fluxo de compra/assinatura, a tela de gerenciar suplementos, e o cold boot do app.

### Fluxo de compra/assinatura (UpgradeScreen + usePulseProPurchase)

Arquivos: `apps/mobile/src/screens/UpgradeScreen.tsx` + `apps/mobile/src/hooks/usePulseProPurchase.ts` + `apps/mobile/src/services/purchase.service.ts` (integrais).

- **✅ Correto — Fluxo de compra bem protegido e com tratamento de erro completo, incluindo o caso de cancelamento pelo usuário.** `isBusy = isRestoring || activePlanId !== null` (`UpgradeScreen.tsx:120`) desabilita os cards de plano e o link "Restore" durante qualquer operação; o botão principal usa `loading={isPurchasingSelectedPlan}` (`AuthButton`, herdando o padrão já validado no resto do app de desabilitar automaticamente durante `loading`). `activePlanId`/`isRestoring` em `usePulseProPurchase.ts` são corretamente setados/resetados em `try/finally` (linhas 142-156, 196-220). Erros passam pelo mesmo padrão central de tradução (`PurchaseServiceError.translationKey`, `handlePurchaseError`) já elogiado na Tarefa 6. Cancelamento do usuário no dialog nativo da loja (`PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR`, `purchase.service.ts:205-206`) tem uma mensagem própria e neutra ("Purchase cancelled." / "Compra cancelada.") em vez de um erro alarmante — bom tratamento de um caso comum e não é bug.

### Telas de autenticação (Login, Register, ForgotPassword, ResetPassword, VerifyOtp)

Arquivo: `apps/mobile/src/screens/auth/*.tsx` (5 telas, integrais).

- **✅ Correto — `VerifyOtpScreen` tem a melhor proteção contra duplo toque de todo o app.** `isSubmittingRef` (`VerifyOtpScreen.tsx:54,201,210,256`) é uma trava por `ref`, checada e setada de forma **síncrona** antes de qualquer `await` — ao contrário dos guards baseados em `useState` usados em quase todo o resto do app (ex.: T7-F1, T7-F2, T7-F3, `BlendScreen.isLogging`), uma `ref` não sofre do atraso de um ciclo de render entre o toque e o guard refletir o estado. Esse é o padrão de referência que os achados T7-F1/F2/F3 deveriam adotar ao serem corrigidos. A tela também distingue corretamente OTP inválido (shake + limpa o campo, permite tentar de novo) de OTP expirado/limite de tentativas (mesma animação + libera o "reenviar código" imediatamente, sem esperar os 60s do cooldown).
- **🟡 Média (T11-F1) — "Reenviar código" no `VerifyOtpScreen` falha em silêncio se a API de reenvio der erro.** `handleResendCode` (`VerifyOtpScreen.tsx:270-290`): o `catch` está vazio, só com o comentário *"O fluxo continua disponível localmente mesmo se a API falhar ao reenviar"* — o cooldown de 60s é resetado e a UI se comporta como se um novo código tivesse sido enviado, mas se `requestForgotPassword` falhar (rede, 429, erro do servidor), nenhum e-mail novo chega e o usuário não é avisado — ele só descobre quando o código antigo (ou nenhum código) não funcionar. Mesma classe de achado do T6-F3 (falha de sync silenciosa), aqui num fluxo de autenticação.
- **🟢 Baixa (T11-F2) — Botão de login por e-mail/senha e botão "Sign in with Google" não compartilham estado de `disabled`, permitindo dois fluxos de autenticação concorrentes.** `LoginScreen.tsx:219` usa `loading={isSubmitting}` (de `authStore.isLoading`, compartilhado com `login`/`register`/restauração de sessão), enquanto o `GoogleSignInButton` (linha 206) usa `isLoading={isGoogleLoading}` — um estado **local** do hook `useGoogleAuth`, totalmente independente (`useGoogleAuth.ts:39`). Nada impede tocar em "Login" e, antes da resposta chegar, tocar em "Sign in with Google" (ou vice-versa) — dois fluxos de autenticação disputando a mesma sessão. Baixa probabilidade na prática (exige um toque muito rápido em dois lugares diferentes da tela), mas sem nenhuma proteção cruzada.
- **✅ Correto — Demais telas (`RegisterScreen`, `ForgotPasswordScreen`, `ResetPasswordScreen`) seguem o padrão `AuthButton loading={isSubmitting}` de forma consistente,** com validação client-side bloqueando o botão antes mesmo do submit em `ResetPasswordScreen` (`isButtonDisabled` combina `isSubmitting`, `isSuccess`, força da senha e confirmação, linhas 159-165) — nenhum achado adicional nessas 3 telas.

### Cold boot / restauração de sessão

Arquivo: `apps/mobile/App.tsx:98-124` + `apps/mobile/src/navigation/RootNavigator.tsx:15-30`.

- **✅ Correto — Feedback visual adequado durante a restauração da sessão.** Enquanto `isRestoringSession` é `true` (verificação do token salvo, restauração do usuário), o `RootNavigator` renderiza `NavigationSplashScreen` (`ActivityIndicator` centralizado, `RootNavigator.tsx:15-30`) em vez de decidir prematuramente entre tela de login e app autenticado. A splash nativa (`SplashScreen.preventAutoHideAsync()`) permanece visível até `isStorageReady` (inicialização do MMKV) resolver, então a transição nativa→JS não deixa brecha de tela branca.

### ManageStackScreen (gerenciar suplementos) — tela nunca visitada pelo diagnóstico original

Arquivos: `apps/mobile/src/navigation/TrackNavigator.tsx:24-90` (`ManageStackRoute`, o wrapper com a lógica real) + `apps/mobile/src/screens/ManageStackScreen.tsx` (UI, 706 linhas).

Arquitetura: `ManageStackScreen` é um componente de apresentação puro (recebe `supplements`/`onAdd`/`onDelete`/`onToggleActive` via props); toda a lógica de React Query vive em `ManageStackRoute`, o componente de fato registrado na `Stack.Screen name="ManageStack"`.

- **🔴 Alta (T11-F3) — Adicionar, remover ou (des)ativar um suplemento falha em silêncio: a mutation não tem `onError`, e a sheet fecha imediatamente sem esperar a resposta do servidor.** `TrackNavigator.tsx:36-41`: `useMutation({ mutationFn: updateStack, onSuccess: () => invalidateQueries })` — **sem `onError`**. `handleSave` em `ManageStackScreen.tsx:294-330` chama `onAdd(...)` (que só dispara `mutateUpdateStack`, fire-and-forget, sem `await`) e imediatamente `closeSheet()` — a sheet de adicionar suplemento sempre fecha como se tivesse dado certo, mesmo que o `PUT /supplement-stack` falhe (rede, 429, validação). O mesmo vale para `handleDelete`/`handleToggleActive` (nenhum feedback de erro em lugar nenhum). É a mesma classe de achado do T6-F3, mas numa tela inteira nunca coberta pelo diagnóstico original — o usuário acredita ter adicionado/removido um suplemento e continua vendo a lista antiga na próxima visita, sem nenhuma pista do motivo.
- **🟢 Baixa (T11-F4) — Lista de suplementos pode aparecer vazia enquanto ainda carrega (mesmo antipadrão do T1-F2/T3-F2).** `ManageStackRoute` não desestrutura `isLoading` da query (`TrackNavigator.tsx:30-34`) — `ManageStackScreen` recebe `supplements={supplementStack ?? []}` (linha 84) e não distingue "carregando" de "genuinamente sem suplementos". Mitigado na prática pelo cache de 24h compartilhado com a `TrackScreen` (rota normal de entrada), mas exposto em navegação direta com cache frio.
- **🟢 Baixa (T11-F5) — Botão "Save" (adicionar suplemento) não tem `disabled` nem indicação de loading durante o salvamento.** `ManageStackScreen.tsx:509-514`: `Pressable` simples, sem `disabled`, sem spinner. Severidade baixa (não Média, como situações análogas T7-F2/F3) porque `updateStack` substitui o array inteiro (`PUT` com o array completo, não um `PATCH` incremental) — dois toques rápidos disparam duas requisições redundantes, mas ambas calculam o mesmo array final a partir do mesmo estado de partida, então não criam duas entradas duplicadas do mesmo suplemento (diferente do caso da água, T7-F3, onde cada toque soma uma quantidade fixa).

---

## Tarefa 12 — Checagem final: onboarding, timer de blend, banner offline, e um padrão sistêmico de falha silenciosa

Varredura de fechamento a pedido do usuário ("tem mais alguma seção pra investigar?"). Cobre as últimas áreas do app ainda não lidas: as 4 telas de onboarding, os controles de timer da BlendScreen (`TimerControls`), o `OfflineBanner` global, e — o achado mais importante desta rodada — uma checagem cruzada de **todo mutation `useMutation` do app sem `onError`**, que revelou um padrão sistêmico já insinuado em T6-F3 e T11-F3.

### Onboarding (4 telas: Body, Goal, Model, Macros)

Arquivos: `apps/mobile/src/screens/onboarding/*.tsx` (4 telas, integrais).

- **🔴 Alta (T12-F1) — Se o cálculo de macros falhar, o onboarding trava nesse step sem nenhum erro visível — o botão "Continue" fica desabilitado para sempre.** `OnboardingBodyScreen.tsx:124-167`: a chamada debounced a `POST /users/calculate-macros` (disparada a cada mudança de peso/altura/atividade) tem um `catch` que só faz `setResult(null)` — sem toast, sem mensagem de erro, sem log. O botão de continuar (`AuthButton disabled={result === null}`, linha 309-314) permanece desabilitado enquanto `result` for `null`, e como o `useEffect` só re-dispara quando peso/altura/atividade/objetivo mudam, uma falha de rede nesse endpoint **nunca tenta de novo sozinha** — o usuário fica numa tela com os campos preenchidos, a área do IMC vazia (nem spinner nem erro, só um espaço em branco) e um botão que não sai do lugar. A única saída é o link "Skip" (`handleSkip`, linha 202-205), discreto, que a maioria dos usuários pode não notar como alternativa. Esse é literalmente um beco sem saída na primeira tela que todo usuário novo vê, dependendo só da rede estar instável naquele momento específico.
- **✅ Correto — `OnboardingMacrosScreen` (step final) trata erro corretamente.** `handleSubmit` (linhas 140-179) usa o mesmo padrão central de erro (`getApiErrorTranslationKey`) já elogiado na Tarefa 6, exibindo `formError` na tela e resetando `isSubmitting` em `finally` — nenhum achado aqui.
- **✅ Correto/Informativo — `OnboardingGoalScreen` e `OnboardingModelScreen` não fazem nenhuma chamada de rede** (seleção puramente local, submetida só no step final) — não se aplicam a loading/erro.

### Timer de blend (TimerControls.tsx)

Arquivo: `apps/mobile/src/components/blend/TimerControls.tsx` (integral) + `BlendScreen.tsx:206-225` (`handleStart`/`handleStop`).

- **🟢 Baixa (T12-F2) — Botões "Start"/"Stop" sem `disabled` explícito; protegidos principalmente pela renderização condicional por `status`.** `TimerControls.tsx:52-96`: o componente renderiza SÓ o botão "Stop" quando `status==='running'` e SÓ o botão "Start" nos demais estados — não há os dois simultaneamente, então um duplo toque exigiria acertar exatamente a janela de um render entre o toque e `setTimerStatus('running')` (`BlendScreen.tsx:206-213`) processar. Sem guard explícito (nem `ref` síncrona, nem `disabled`), mas a janela de risco é bem menor que a do T7-F1 (`RatingBottomSheet`, que tem uma animação de ~200ms mantendo os botões tocáveis) — aqui a troca é imediata, no próximo render. Mesma classe de achado, severidade mais baixa.

### OfflineBanner (banner global de conectividade)

Arquivo: `apps/mobile/src/components/ui/OfflineBanner.tsx` (integral).

- **✅ Correto — Máquina de estados bem feita (`neutral`/`offline`/`reconnected`), com banner vermelho enquanto offline e banner verde "Back online" por 2.5s ao reconectar, com guard contra re-disparo (`wasOffline === isOffline`).** Nenhum achado de lógica. **Nota cruzada com T10-F3:** este componente é montado exatamente do mesmo jeito que o `LevelUpCelebration` — como irmão solto de `PersistQueryClientProvider` dentro de `SafeAreaProvider` em `App.tsx`, fora do `NavigationContainer` e sem `<Modal>`. Se a hipótese de stacking do `react-native-screens` levantada em T10-F3 se confirmar em teste real no Android, vale checar também se o `OfflineBanner` sofre do mesmo problema (banner não aparecendo por cima de alguma tela específica) — mesma causa raiz, mesmo teste de runtime resolve os dois.

### Achado sistêmico: mutations sem `onError` em toda a base

Levantamento adicional motivado pelos achados T6-F3 e T11-F3 — busquei especificamente por `useMutation` sem `onError` em fluxos de configuração/preferência do usuário, além dos já documentados.

- **🔴 Alta (T12-F3) — Salvar qualquer configuração de perfil pela `MeScreen` (modelo, objetivo, metas de proteína/carbo/caloria/hidratação, sistema de unidades, idioma) falha em silêncio, e preferências de notificação falham de um jeito ainda pior: a UI otimista nunca é revertida.** Dois pontos, mesma causa raiz:
  - **`EditSettingSheet` → `handleConfirmEdit`** (`EditSettingSheet.tsx:247-254`, `MeScreen.tsx:673-748`): `handleConfirm` chama `onConfirm(confirmValue)` (fire-and-forget) e fecha a sheet imediatamente via sua própria animação, **independente do resultado** de `handleConfirmEdit`. `handleConfirmEdit` não tem nenhum `try/catch` ao redor do `await api.patch('/users/me', body)` — se a requisição falhar, a função só lança uma exceção não tratada; `queryClient.invalidateQueries` e `updateUserProfile` (que atualizariam a UI) nunca rodam. Resultado: a sheet fecha, e o valor exibido na lista de configurações simplesmente volta a mostrar o antigo (sem nenhuma mensagem explicando por quê) — o usuário pode tentar de novo sem entender o que deu errado da primeira vez.
  - **`useNotificationPreferences` → `togglePreference`/`updateDailyPulseTime`** (`useNotificationPreferences.ts:56-72,74-91`): pior que o caso acima, porque a UI **é** otimista aqui (`updateUserProfile(...)` roda ANTES da mutation, linha 77-86) mas as duas `useMutation` (`preferencesMutation`, `timeMutation`) só têm `onSuccess`, **nenhum `onError`** — se o `PATCH /users/notification-preferences` ou `PATCH /users/daily-pulse-time` falhar, não existe nenhum rollback do estado otimista. O `Switch` na tela de notificações fica mostrando o estado NOVO (ligado/desligado) permanentemente, mesmo que o servidor nunca tenha recebido a mudança — a próxima vez que o app buscar o perfil do zero (reinstalação, cache expirado), a preferência real vai divergir silenciosamente do que a UI mostrou o tempo todo.
  Os três casos (Shopping List T6-F3, ManageStack T11-F3, e este) compartilham a mesma causa raiz — `useMutation` sem `onError` — em pontos completamente diferentes da base de código, o que sugere que não é um lapso isolado, e sim a ausência de uma convenção (ex.: um `onError` padrão global de mutations, como o `getApiErrorTranslationKey` já é para chamadas manuais) que valeria a pena estabelecer de uma vez ao corrigir esses achados.

Com isso, a checagem cobre agora as 23 telas do app (`apps/mobile/src/screens/**`), todos os componentes globais montados em `App.tsx` (`LevelUpCelebration`, `OfflineBanner`, `ToastViewport`), os principais hooks de mutation ligados a configuração de usuário, e os fluxos de autenticação e compra. Não identifiquei mais nenhuma tela ou fluxo de ponta a ponta sem cobertura.

---

## Tabela de priorização consolidada

Todos os achados acionáveis, por impacto decrescente. Pronta para servir de base ao FIX-3 sem nova investigação.

### 🔴 Alta

| # | Achado | Arquivo:linha | Ação recomendada |
|---|---|---|---|
| T4-F2 | Step "analyzing" do Pantry Scanner (até ~45s) não tem nenhuma animação, spinner ou estimativa de tempo — tela parece travada | `PantryScannerScreen.tsx:452-463`, `assets/index.ts:14-18` | Substituir o placeholder estático por uma animação de progresso (shimmer, spinner, ou sequência de mensagens tipo "Identificando ingredientes... Montando receitas..."), com estimativa de tempo |
| T6-F3 | Falha de sync de shopping list ao reconectar é 100% silenciosa e permanente — nenhum toast, nenhuma indicação | `reconnectSync.utils.ts:95-121` (`syncDirtyShoppingLists`) | Replicar o padrão já existente no mesmo arquivo (`processPendingBlendQueue`): contar tentativas e, ao esgotar, chamar `showPersistentToast` com ação de retry |
| T9-F1 | Botão "Start Blend" do Daily Recipe Card navega sem payload de receita — mostra receita antiga ou nenhuma | `HomeScreen.tsx:332-334`, `BlendScreen.tsx:121-128,332-338,363` | Enriquecer `DailyRecipe` com os campos exigidos por `PulseAiRecipe` (ingredients, fat, blendInstruction, tip) e passar `{ recipe }` no `navigation.navigate('Blend', { recipe })`, igual ao Pulse AI/Pantry Scanner |
| T10-F3 | Celebração de level up aparece quase transparente ao vivo, apesar do código especificar um backdrop de 0.84 de opacidade corretamente animado (reportado pelo usuário) | `LevelUpCelebration.tsx:36,243-262,417-431`, `App.tsx:12,98-124` | Testar no Android; hipótese principal é conflito de stacking do `react-native-screens` (`enableScreens()`) com um overlay renderizado como irmão externo ao `NavigationContainer`. Corrigir migrando o `LevelUpCelebration` para usar `<Modal>` nativo (como todos os outros overlays do app já fazem), ou movê-lo para dentro do root stack como uma tela/modal de navegação |
| T11-F3 | Adicionar/remover/(des)ativar suplemento falha em silêncio — mutation sem `onError`, sheet fecha antes da resposta do servidor | `TrackNavigator.tsx:36-41`, `ManageStackScreen.tsx:294-330` | Adicionar `onError` na mutation com `showToast`; não fechar a sheet até a mutation resolver (ou reverter/reabrir em caso de erro) |
| T12-F1 | Onboarding trava sem erro se o cálculo de macros falhar — botão "Continue" fica desabilitado para sempre, só o link "Skip" escapa | `OnboardingBodyScreen.tsx:124-167,309-314` | Mostrar erro + botão de retry no lugar do espaço vazio quando o `catch` disparar; considerar destacar mais o "Skip" nesse estado |
| T12-F3 | Salvar configurações de perfil (EditSettingSheet) e preferências de notificação falham em silêncio — mesma causa raiz do T6-F3/T11-F3 (`useMutation` sem `onError`), mas aqui a UI otimista de notificações nunca é revertida | `EditSettingSheet.tsx:247-254`, `MeScreen.tsx:673-748`, `useNotificationPreferences.ts:56-91` | Adicionar `onError` com `showToast` + rollback do estado otimista (`updateUserProfile` de volta ao valor anterior) nas duas mutations; considerar convenção padrão de `onError` para todo `useMutation` do app |

### 🟡 Média

| # | Achado | Arquivo:linha | Ação recomendada |
|---|---|---|---|
| T1-F1 / T2-F1 | Skeletons de Home e Track não correspondem à forma/altura do conteúdo real — layout shift ao carregar | `HomeScreen.tsx:376-383`, `TrackScreen.tsx:465-471` | Criar skeletons dedicados por seção (GoalRings, StreakBadge, missões, HydrationSection, MyStackSection), com alturas aproximadas do conteúdo real |
| T1-F2 | Barra de hidratação na Home não tem loading próprio — pode mostrar 0 enquanto a query ainda carrega | `HomeScreen.tsx:199-204,445-447` | Incluir `hydrationToday.isLoading` no gate global, ou dar um skeleton próprio à barra |
| T3-F1 | Lista "All Blends" pode renderizar em branco entre o resumo e a lista paginada resolverem | `HistoryScreen.tsx:116-133,176` | Usar `isBlendInfiniteLoading` (já existe no hook, só não é lido) para mostrar skeleton de itens |
| T3-F2 | Gráficos de histórico mostram estado "vazio" (barras zeradas) durante o loading, indistinguível de período sem dados | `MacroBarChart.tsx:137-142`, `HydrationBarChart.tsx:131-136` | Passar um estado de loading explícito para os gráficos (skeleton ou opacidade reduzida) em vez de renderizar o placeholder de "vazio" antes da resposta chegar |
| T3-F6 | Seletor de semana do relatório semanal não desabilita durante o loading da semana atual | `WeeklyReportScreen.tsx:362-392` | Adicionar `disabled={reportQuery.isLoading}` nas duas setas |
| T3-F7 | StatCards de streak/blends/nível na MeScreen não têm loading — mostram "0" em cold boot sem cache quente | `MeScreen.tsx:532-536,1164-1189` | Desestruturar `isLoading` da query e passar para os `StatCard` (prop já suportada) |
| T4-F1 | Pulse AI sem mensagem de status para esperas longas (3s vs 15s+ é visualmente idêntico) | `PulseAIScreen.tsx`, `ChatMessageSkeleton.tsx` | Adicionar um texto complementar após alguns segundos de espera (ex. "Ainda trabalhando nisso...") |
| T6-F1 | Blend log é perdido se a requisição falhar enquanto o app julga estar online (não cai no offline queue) | `BlendScreen.tsx:247-276` | No `catch`, sempre chamar `addPendingBlend` (não só no branch `!isConnected`) e usar o `translationKey` do `BlendLogServiceError` em vez do Alert genérico |
| T6-F2 | Mensagem do usuário some do chat sem explicação quando o limite diário do Pulse AI é atingido | `PulseAIScreen.tsx:370-373` | Em vez de remover a mensagem, adicionar uma mensagem de erro no próprio fluxo do chat (mesmo padrão do `isError`) |
| T7-F1 | RatingBottomSheet sem proteção explícita contra duplo toque (proteção atual é acidental) | `RatingBottomSheet.tsx:134-163,190-209` | Adicionar `disabled`/trava local (`isClosing`) nas estrelas e no botão "Skip" |
| T7-F2 | Toque duplo no check de suplemento pode dessincronizar contador local vs. servidor | `SupplementCheckItem.tsx:157-165`, `TrackScreen.tsx:269-318` | Expor `isPending` da mutation e desabilitar o `Pressable` enquanto uma chamada está em voo |
| T7-F3 | Toque duplo no botão de log de água registra 2 doses reais (+500ml em vez de +250ml) | `HydrationSection.tsx:306-339`, `TrackScreen.tsx:248-254` | Mesma correção do T7-F2: `isPending` da mutation controlando `disabled` do botão |
| T8-F1 | HistoryScreen sem pull-to-refresh, com `staleTime` de 7 dias nas 3 queries de resumo | `HistoryScreen.tsx` (ScrollView), `useHistoryData.ts:88,100,112` | Adicionar `RefreshControl` chamando refetch das 4 queries do hook |
| T9-F2 | Daily Recipe Card mostra a mesma receita todos os dias, contradizendo o texto "Today's Blend" | `DailyRecipeCard.tsx:37-66`, `home.todaysBlend` | Fora do escopo desta correção (é uma decisão de produto/roadmap — implementar rotação ou renomear a copy para não prometer variação diária) |
| T11-F1 | "Reenviar código" no VerifyOtpScreen falha em silêncio — cooldown reseta mesmo se o e-mail não for enviado | `VerifyOtpScreen.tsx:270-290` | Adicionar `showToast` de erro no `catch` de `handleResendCode`, e não resetar `secondsRemaining`/limpar o campo se a chamada falhar |

### 🟢 Baixa

| # | Achado | Arquivo:linha | Ação recomendada |
|---|---|---|---|
| T1-F3 | Indicador de nível pisca "Lv. 1" por um frame no cold boot antes de corrigir | `HomeScreen.tsx:167-169,220-233,273-281` | Adiar a primeira renderização do indicador até `totalXP` estar sincronizado, ou aceitar como custo baixo |
| T1-F4 | Bloco de missões sem estado de erro — falha silenciosa deixa a seção truncada | `HomeScreen.tsx:474-490` | Adicionar branch de erro simples (texto + retry) no lugar do `null` |
| T2-F2 | Badge de itens pendentes da shopping list na Track não reflete loading/erro | `TrackScreen.tsx:399-402` | Aceitável como está; opcionalmente mostrar um pequeno skeleton no lugar do badge |
| T3-F3 | Skeleton da ShoppingListsScreen não usa o `SkeletonLoader` com shimmer | `ShoppingListsScreen.tsx:823-827` | Trocar as caixas estáticas por `SkeletonLoader variant="card"` |
| T3-F4 | Seção de arquivadas sem retry no erro e sem mensagem quando vazia | `ShoppingListsScreen.tsx:154-203` | Adicionar botão de retry no erro e um texto "nenhuma lista arquivada" no caso vazio |
| T3-F5 | Mensagem de "nenhum relatório ainda" não informa a data exata da próxima geração | `locales/en.json:1026`, `pt-BR.json:1026` | Calcular e interpolar a data real da próxima segunda-feira no texto |
| T4-F3 | Botão "Generate Recipes" do Pantry Scanner mostra loading cosmético (sem espera real) | `PantryScannerScreen.tsx:216-220,323-326` | Baixa prioridade — não é enganoso o suficiente para gerar reclamação, mas pode ser simplificado (remover o `loading` já que é instantâneo) |
| T8-F2 / T8-F3 | TrackScreen e ShoppingListsScreen sem pull-to-refresh, com TTLs de 1h-7 dias | `TrackScreen.tsx`, `ShoppingListsScreen.tsx` | Adicionar `RefreshControl` nas duas telas, mesmo padrão da Home |
| T10-F1 | `ProfileSkeleton` usado no lugar errado (Home) e ausente no lugar certo (Me) | `SkeletonLoader.tsx:227-254` | Ao corrigir T1-F1/T3-F7, considerar usar `ProfileSkeleton` no header da MeScreen |
| T10-F2 | Thresholds de scroll fixos em pixels para animar gráficos da HistoryScreen | `HistoryScreen.tsx:49-50,135-149` | Baixa prioridade — trocar por medição real via `onLayout` das seções, se o polimento for priorizado |
| T11-F2 | Login por e-mail e "Sign in with Google" não compartilham `disabled` — permite 2 fluxos de auth concorrentes | `LoginScreen.tsx:206,219`, `useGoogleAuth.ts:39` | Unificar num único estado de loading (ex.: desabilitar o botão de Google também durante `authStore.isLoading`, e vice-versa) |
| T11-F4 | Lista de suplementos no ManageStackScreen pode aparecer vazia durante o loading (cache frio) | `TrackNavigator.tsx:30-34,84` | Desestruturar `isLoading` da query e passar para `ManageStackScreen`, mesma correção do T3-F7 |
| T11-F5 | Botão "Save" de adicionar suplemento sem `disabled`/loading (impacto baixo, sem duplicar entrada) | `ManageStackScreen.tsx:509-514` | Adicionar `isPending` da mutation (exposta via prop) e desabilitar o botão durante o salvamento |
| T12-F2 | Botões Start/Stop do timer de blend sem `disabled` explícito (risco baixo, protegido por render condicional) | `TimerControls.tsx:52-96`, `BlendScreen.tsx:206-213` | Baixa prioridade — opcionalmente adicionar guard por `ref` síncrona, mesmo padrão do `VerifyOtpScreen` |

---

## Notas metodológicas

- Nenhuma alteração de código, log de debug ou refatoração foi feita durante este diagnóstico, conforme solicitado.
- Todos os achados foram confirmados por leitura direta do código-fonte (arquivo:linha citados), sem suposições sobre comportamento em runtime — exceto onde explicitamente indicado como "efeito observável" derivado de análise do fluxo de estado (ex.: T7-F2, T9-F1), casos em que a lógica foi rastreada passo a passo mas não executada de fato (diagnóstico é só leitura de código, conforme escopo).
- O achado mais positivo do diagnóstico (mapeamento de erro 429 já uniforme via `getApiErrorTranslationKey`) mostra que a arquitetura de erros do app já era bem generalizada antes da Área 8 — vale usar esse mesmo padrão como referência ao corrigir os achados T6-F1 e T6-F3, que são exatamente os pontos que não seguem esse padrão já existente.
