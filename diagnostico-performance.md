# Diagnóstico de Performance — 4 Dimensões (pré-lançamento)

**Data:** 2026-08-27
**Escopo:** Índices MongoDB, tempo de resposta de endpoints críticos, payloads/compressão, React Query (cache/waterfall), FlatList/SectionList, foto de perfil base64, bundle/inicialização.
**Ambiente:** backend em `localhost:3000` (modo `dev`, sem `NODE_ENV=production`) apontando para MongoDB Atlas M0 (free tier, sem Performance Advisor/Query Profiler). Conta de teste real com dados populados (`b@b.com`).
**Método:** leitura direta de models/controllers/services para índices e padrões de query; medição real via script Node (`fetch` nativo) contra o servidor local, 3 chamadas por endpoint. Nenhuma alteração de código, índice, cache ou componente foi feita durante este diagnóstico.

> **Nota sobre os números:** localhost → Atlas M0 já inclui o round-trip de rede real até a nuvem, mas **não** inclui o overhead de hospedagem do Railway (proxy, cold start de container, latência adicional de rede Railway↔Atlas). Os tempos aqui são o melhor cenário possível; produção real tende a ser mais lenta.

---

## Sumário executivo (preenchido incrementalmente por tarefa)

Diagnóstico em andamento. Esta seção será consolidada ao final das 7 tarefas com a tabela de otimizações priorizadas (Impacto × Esforço).

---

## Tarefa 1 — Índices MongoDB: cobertura e padrões de query

### Índices declarados por model

| Model (collection) | Índices declarados | Tipo |
|---|---|---|
| **BlendLog** (`blend_logs`) | `{userId:1, createdAt:-1}` | composto |
| **XPLog** (`xp_logs`) | `{createdAt:1}` TTL 90d · `{userId:1, xpType:1, logDate:1}` | TTL · único composto |
| **DailyMission** (`daily_missions`) | `{createdAt:1}` TTL 90d · `{userId:1, missionDate:1}` | TTL · único composto |
| **Conversation** (`conversations`) | `{createdAt:1}` TTL 90d · `{userId:1, createdAt:-1}` | TTL · composto |
| **WeeklyReport** (`weekly_reports`) | `{createdAt:1}` TTL 90d · `{userId:1, weekStartDate:1}` | TTL · único composto |
| **ShoppingList** (`shopping_lists`) | `{userId:1, isArchived:1}` · `{userId:1, updatedAt:-1}` | 2 compostos separados |
| **NotificationLog** (`notification_logs`) | `{createdAt:1}` TTL 3d · `{userId:1, type:1, notificationDate:1}` | TTL · único composto |
| **Favorite** (`favorites`) | `{userId:1, createdAt:-1}` · `{userId:1, recipeName:1}` único | 2 compostos |
| **HydrationLog** (`hydration_logs`) | `{createdAt:1}` TTL 365d · `{userId:1, createdAt:-1}` | TTL · composto |
| **SupplementLog** (`supplement_logs`) | `{createdAt:1}` TTL 365d · `{userId:1, createdAt:-1}` · `{userId:1, supplementId:1, logDate:1}` único | TTL · composto · único composto |
| **AiCache** (`ai_cache`) | `{cacheKey:1}` único · `{expiresAt:1}` TTL imediato | único · TTL |
| **UserPhoto** (`user_photos`) | `{userId:1}` único | único simples |
| **User** (`users`) | `email` único (auto) · `googleId` único+sparse (auto) | únicos simples |
| **Otp** (`otps`) | `{expiresAt:1}` TTL imediato | TTL |

### Classificação das 7 queries de alto volume do enunciado

| # | Query | Local | Índice usado | Classificação |
|---|---|---|---|---|
| 1 | BlendLog `findOne({userId, createdAt:{$lt}})`.sort(`createdAt:-1`) — cálculo de streak | `blendLog.controller.ts:251` | `{userId:1, createdAt:-1}` | **Coberta** |
| 2 | XPLog `insertOne` com unicidade `userId+xpType+logDate` | `xp.service.ts:89` | `{userId:1, xpType:1, logDate:1}` único | **Coberta** |
| 3 | DailyMission `findOne({userId, missionDate})` | `missionProgress.service.ts:232` | `{userId:1, missionDate:1}` único | **Coberta** |
| 4 | Conversation `findOne({userId, createdAt:{$gt}})`.sort(`createdAt:-1`) | `pulseAi.controller.ts:405` | `{userId:1, createdAt:-1}` | **Coberta** |
| 5 | WeeklyReport `findOne({userId})`.sort(`weekStartDate:-1`) | `weeklyReport.controller.ts:86` | `{userId:1, weekStartDate:1}` (scan reverso serve o sort desc) | **Coberta** |
| 6 | ShoppingList `find({userId, isArchived})`.sort(`updatedAt:-1`) | `shoppingList.controller.ts:219` | `{userId:1, isArchived:1}` cobre o filtro; `updatedAt` não está no mesmo índice → `SORT` em memória | **Parcialmente coberta** |
| 7 | NotificationLog `.exists({userId, type, notificationDate})` | `notifications.jobs.ts:133` | `{userId:1, type:1, notificationDate:1}` único | **Coberta** |

**Item 6 em detalhe:** existe `{userId:1, isArchived:1}` (cobre o filtro) e `{userId:1, updatedAt:-1}` (cobriria o sort), mas nenhum cobre os dois juntos. Faltaria `{userId:1, isArchived:1, updatedAt:-1}`. Impacto real é baixo hoje — free tier limita a 1 lista ativa e Pro dificilmente acumula dezenas — mas é uma lacuna real vs. o índice ideal.

### Achados adicionais fora da lista do enunciado

1. **`AiCache.userId` sem índice.** `invalidateUserCache()` (`cache.service.ts:159`) roda `AiCacheModel.deleteMany({userId})` — não existe índice em `userId` nessa collection (só `cacheKey` único e `expiresAt` TTL). **Collection scan garantido** a cada chamada de `POST /pulse-ai/invalidate-cache`.
2. **`User.revenueCatCustomerId` sem índice.** `findUserForWebhook()` (`revenueCatWebhook.controller.ts:104`) faz `$or` entre `_id` (indexado) e `revenueCatCustomerId` (não indexado). Todo webhook do RevenueCat dispara uma cláusula de **collection scan** sobre `users`.
3. **Cron jobs de notificação escaneiam `users` inteira.** `runDailyPulseJob` (a cada 5 min), `runStreakReminderJob`/`runSupplementReminderJob`/`runHydrationReminderJob` (a cada 30 min) filtram por `notificationPreferences.X` e `pushToken` — nenhum indexado. **Collection scans completos** rodando em background com frequência alta, competindo por I/O do M0 com requisições reais.

### Impacto estimado — query não coberta, 100 vs. 10.000 documentos

- **100 documentos:** `COLLSCAN` num working set pequeno cabe em RAM — sub-milissegundo a poucos ms, imperceptível.
- **10.000 documentos:** custo cresce linearmente mesmo em RAM — dezenas de ms por chamada, somando-se aos ~30-80ms de round-trip típico Atlas M0. Para os cron jobs, significa escanear `users` inteira a cada tick — com 10k usuários e jobs rodando a cada 5-30 min, o I/O acumulado no cluster compartilhado do M0 deixa de ser desprezível e passa a competir com tráfego de usuários reais.

`AiCache.userId` e `User.revenueCatCustomerId` são os achados de maior risco: crescem junto com o uso do Pulse AI e a base de assinantes, e hoje são "invisíveis" só porque o dataset de teste é pequeno.

---

## Tarefa 2 — Tempo de resposta dos endpoints críticos

**Condições da medição:** servidor local em modo `dev` (`tsx watch`, sem `NODE_ENV=production`), 3 chamadas sequenciais por endpoint, conta real `b@b.com` com dados populados (blends, conversas, listas de compras). Atlas M0 estava "morno" no início do lote — a primeira chamada da bateria (`login`) e a primeira de `GET /daily-missions` mostraram latência bem acima das demais, compatível com conexão/pool ainda se estabelecendo; as chamadas seguintes no mesmo endpoint estabilizaram em patamar mais baixo ("quente").

| Endpoint | Método | Mínimo (ms) | Médio (ms) | Máximo (ms) | Payload (KB) |
|---|---|---|---|---|---|
| `/users/me` | GET | 142.6 | 149.1 | 154.1 | 0.98 |
| `/blend-logs/history?from=...&to=...` (7 dias) | GET | 300.7 | 325.3 | 371.1 | 0.68 |
| `/daily-missions` | GET | 297.0 | 527.3 | 908.9 | 0.94 |
| `/blend-logs` (payload mínimo) | POST | 1128.3 | 1178.5 | 1216.3 | 0.34 |
| `/conversations` | GET | 143.5 | 146.5 | 151.7 | 0.24 |
| `/shopping-lists` | GET | 282.4 | 289.7 | 296.4 | 0.58 |
| `/weekly-reports/latest` | GET | 143.9 | 172.0 | 227.1 | 0.08 |

*(referência: `POST /auth/login` — não pedido na lista, mas necessário para autenticar — levou 669.4ms nesta mesma bateria, primeira chamada da sessão, provavelmente pagando o "frio" do Atlas + hash Argon2id.)*

### Observações por endpoint

- **`GET /users/me` (149ms médio):** estável nas 3 chamadas, sem outlier — é uma única query por `_id` (chave primária), sem aggregation. Custo é essencialmente round-trip de rede.
- **`GET /blend-logs/history` (325ms médio):** faz 2 operações em paralelo (`find` paginado + `aggregate` com `$facet` de 3 sub-pipelines). O tempo mais alto que `/users/me` é esperado pela aggregation, mas 300+ms para uma janela de 7 dias com poucos documentos sugere que o custo é dominado por round-trips/overhead do Atlas M0, não por volume de dados.
- **`GET /daily-missions` (527ms médio, alta variância 297-909ms):** maior variância da bateria. A primeira chamada (909ms) é consistente com Atlas "frio" logo após o login; chamadas seguintes (297-376ms) estabilizam. Internamente, se a missão do dia já existe, é só um `findOne` — a variância observada não parece ligada a criação de documento (a missão de hoje já existia na conta de teste).
- **`POST /blend-logs` (1178ms médio) — o mais lento de todos, por larga margem.** Consistente nas 3 chamadas (1128-1216ms, baixa variância — não é efeito de "frio"). Isso é esperado dado o volume de trabalho síncrono no controller: 1 `create` + 2 updates paralelos (streak requer sua própria query `findOne` prévia) + `Promise.all` de 3 awards de XP (cada um fazendo `insertOne` + `findOneAndUpdate` + possível notificação push) + `Promise.all` de progresso de missões (cada um podendo disparar `findOrCreateDailyMission` + 2 updates). É a soma de ~8-12 round-trips ao Atlas M0 encadeados com paralelismo parcial — cada um pagando a latência de rede até a nuvem. **Efeito colateral desta medição:** 3 blend logs reais mínimos (`Lite`, 30s, macros zeradas) foram criados na conta de teste como consequência de medir o endpoint de escrita — não removidos, conforme instrução de não alterar dado além do necessário para medir.
- **`GET /conversations` (146ms médio):** rápido e estável — a aggregation é enxuta (`$match` + `$sort` + `$limit(20)` + `$project` sem trazer o array `messages`). As 2 conversas existentes na conta de teste têm `messageCount: 0` (histórico vazio) — não é um erro, apenas não há dado para avaliar o payload em conversa longa; isso será revisitado na Tarefa 3 aproveitando `GET /conversations/:id` de uma conversa com mais mensagens, se existir.
- **`GET /shopping-lists` (290ms médio):** estável. 3 listas ativas na conta de teste, payload pequeno.
- **`GET /weekly-reports/latest` (172ms médio, variância 144-227ms):** a conta de teste **não tem relatório semanal gerado** (`hasReport:false`) — resposta é só `{hasReport:false, nextReportDate}`, praticamente sem custo de aggregation real. **Isso significa que o custo típico deste endpoint com um relatório real (5 sub-objetos de dados) não foi medido aqui** — o `findOne` por `{userId, weekStartDate}` respondeu rápido porque não há documento algum na coleção para este usuário. Documentado como limitação: não crio um relatório semanal artificial pois isso exigiria rodar o gerador fora do ciclo normal do cron, distorcendo o teste.

### Dados que não puderam ser medidos como pedido

- **Payload "cheio" de `/weekly-reports/latest`**: a conta de teste não tem relatório gerado. O endpoint respondeu 200 com corpo mínimo (`hasReport:false`), não é um erro, mas não representa o payload real de 5 sub-agregações que o endpoint entrega quando há relatório. Recomendação: se possível, aguardar a geração natural (próxima segunda-feira, conforme `nextReportDate: 2026-08-31`) ou considerar isso ao interpretar o tamanho de payload desse endpoint na Tarefa 3.
- **Conversa longa (10+ mensagens) para `GET /conversations/:id`**: as 2 conversas existentes têm 0 mensagens. Será avaliado na Tarefa 3 se vale a pena gerar uma conversa real via `/pulse-ai/chat` para obter uma amostra representativa, já que criar uma conversa de teste ali é uma ação legítima do fluxo normal (não um dado artificial forçado no banco).

---

---

## Tarefa 3 — Análise de payloads e compressão

### Os 5 maiores payloads da Tarefa 2

Em ordem decrescente: `/users/me` (0.98 KB) · `/daily-missions` (0.94 KB) · `/blend-logs/history` (0.68 KB) · `/shopping-lists` (0.58 KB) · resposta de `POST /blend-logs` (0.34 KB). Todos os 5 já são payloads enxutos (<1 KB) — os controllers montam manualmente o objeto de resposta em vez de serializar o documento Mongo bruto (confirmado na leitura dos controllers na Tarefa 1), então não há campo supérfluo relevante para cortar nesse grupo. Nesse patamar de tamanho, o custo dominante é round-trip de rede/protocolo, não payload. O risco real de payload desproporcional está concentrado nos dois endpoints que a Tarefa 3 pede para investigar à parte, abaixo.

### `GET /users/me/photo` — foto em base64

Medido ao vivo na conta de teste: a foto de perfil real armazenada tem **33.28 KB** de payload total (`imageBase64` = 34.016 caracteres ≈ 33.22 KB, `mimeType: image/jpeg`). O binário JPEG real por trás do base64 é ~25% menor (~24.7 KB), já que base64 infla o tamanho em ~33%.

O limite máximo aceito pelo backend é `MAX_PROFILE_PHOTO_BASE64_LENGTH = 530_000` caracteres (`user.controller.ts:19`) ≈ **517.6 KB** de payload no pior caso — bem mais que os ~500KB citados no enunciado como "foto típica". A foto real da conta de teste (33KB) está longe do pior caso, mas o app precisa suportar até ~518KB de payload de string nesse endpoint, e é esse limite superior que importa para o dimensionamento de custo de decodificação no JS thread (retomado na Tarefa 6).

### `GET /conversations/:id` — conversa completa com `PulseAiRecipe` embutido

**Não pôde ser medido ao vivo com dados reais.** Tentei gerar uma conversa real de 10+ mensagens via `POST /pulse-ai/chat` (a conta de teste é Pro, sem limite diário) mas as 5 chamadas falharam com timeout de 30s do provider (`[aiProvider] google request timed out after 30000ms`) — confirmado no log do servidor. Motivo raiz: nenhuma chave de API do Google Gemini está configurada no `.env` local (`AI_PROVIDER=google`, `AI_MODEL=gemini-2.5-flash`, mas sem `GOOGLE_GENERATIVE_AI_API_KEY`/`GEMINI_API_KEY` setada), então o endpoint de chat está inoperante neste ambiente — não é um problema de performance de banco, é de configuração de ambiente/rede para a API externa da IA.

**Efeito colateral das 5 tentativas:** cada uma passou por `resolveConversationContext()` antes de falhar, criando uma nova conversa "casca vazia" (`messages: []`) na conta de teste. Já existiam 2 conversas assim de sessões anteriores (`6a74e4bd...`, `6a6a1584...`, ambas com `messageCount: 0`) — agora há uma terceira (`6a9078a6...`, criada hoje). Isso é, em si, um indício (não medido formalmente aqui) de que `persistConversationTurn` falhando silenciosamente antes de gravar mensagens deixa lixo de documentos vazios na coleção `conversations` — vale investigar fora do escopo deste diagnóstico de performance.

Como não foi possível medir ao vivo, estimei o tamanho a partir do schema real (`PulseAiRecipe` em `packages/shared/src/schemas/pulseAi.ts`) montando uma troca de mensagens representativa (pergunta do usuário + receita completa da IA com 5 ingredientes, instruções e dica):

| Mensagens na conversa | Tamanho estimado do payload |
|---|---|
| 10 (5 trocas) | ~5.1 KB |
| 12 (6 trocas) | ~6.1 KB |
| 20 (10 trocas, limite de contexto do backend) | ~10.0 KB |

Isso é ordens de magnitude menor que a foto de perfil, mas ainda assim ~10x maior que os outros endpoints JSON da Tarefa 2 — e cresce linearmente sem paginação enquanto a conversa não expira pelo TTL de 90 dias. Não há campo supérfluo aparente no schema — `PulseAiRecipe` já é enxuto e todos os campos (`title`, `ingredients`, `macros`, `prepTimeSeconds`, `blendInstruction`, `tip`, `hasSubstitutes`) são usados pela tela de chat do mobile.

### `GET /weekly-reports/latest` — campos não usados na tela

A conta de teste não tem relatório gerado (`hasReport:false`, ver Tarefa 2), então não dá para medir o tamanho real de um payload cheio — mas dá para auditar estaticamente quais campos do schema `WeeklyReportData` a `WeeklyReportScreen.tsx` efetivamente renderiza, comparando com o que o backend serializa (`serializeWeeklyReport`, que devolve `report.data` inteiro sem filtrar nada).

Campos buscados pelo backend e **confirmados não usados** em `WeeklyReportScreen.tsx` (nem em `WeeklyShareCard`, que só consome `totalBlends`, `averageDailyProtein`, `currentStreak`, `supplementAdherenceRate`):

| Campo não usado | Onde vem | Observação |
|---|---|---|
| `data.supplements.bySupplementName` | `WeeklyReportSupplements` | **O maior candidato a desperdício** — mapa dinâmico `Record<nomeDoSuplemento, dados>`, cresce com o tamanho do `supplementStack` do usuário (até 20 itens). A tela só usa `topSupplement`/`bottomSupplement` (2 strings), nunca itera esse mapa. |
| `data.nutrition.calorieGoalHitDays` | `WeeklyReportNutrition` | Tela só renderiza `proteinGoalHitDays`. |
| `data.gamification.blendDaysInWeek` | `WeeklyReportGamification` | Nunca referenciado no JSX. |
| `previousWeekComparison.avgDailyMlDeltaPercent` | `WeeklyReportComparison` | Só `avgProteinPerDayDeltaPercent` é renderizado via `ComparisonRow`. |
| `previousWeekComparison.adherenceRateDeltaPercent` | `WeeklyReportComparison` | Mesmo caso acima. |
| `isProAtGeneration` (topo do documento) | `IWeeklyReport` | Campo de auditoria server-side, nunca lido no mobile. |

`bySupplementName` é o único com potencial de tamanho não-trivial (escala com o stack de suplementos do usuário); os demais são poucos bytes cada, mas somam-se ao overhead de over-fetching do endpoint.

### Compressão gzip

**Confirmado ausente.** `apps/api/src/index.ts` não importa `compression` nem qualquer variante — `grep` por `compression|helmet|express-compression` no arquivo não retornou nenhuma ocorrência, e o pacote `compression` não consta nas dependências do `apps/api/package.json`. Confirmado também empiricamente: `curl` para `GET /users/me` enviando `Accept-Encoding: gzip, deflate, br` explicitamente retornou a resposta **sem** o header `Content-Encoding` — o servidor nunca comprime, independentemente do que o cliente aceita.

**Estimativa de ganho:**
- Para os payloads JSON "puros" (users/me, daily-missions, blend-logs, conversations, shopping-lists, weekly-reports, e o texto/estrutura da conversa com receitas) — compressão gzip tipicamente reduz **60-80%** o tamanho em trânsito. Hoje isso não afeta muito a latência local (payloads já <1KB, dominados por round-trip), mas em produção no Railway, com payloads maiores (relatório semanal cheio, conversas longas) e conexões móveis mais lentas, o ganho de banda passa a importar mais.
- Para `GET /users/me/photo` (o maior payload, ~33KB medido / até ~518KB no limite), **o ganho de gzip é baixo, não os 60-80% do JSON.** A string base64 encapsula dados JPEG, que já é um formato comprimido — comprimir novamente com gzip tipicamente só recupera uma fração pequena (na casa de 5-10%) do overhead de codificação base64 em si, porque a entropia do JPEG já é alta. Habilitar compressão ajuda os endpoints JSON de forma significativa; para a foto, o ganho relevante viria de outra estratégia (ex: servir a foto sem re-envelopar em JSON/base64, ou reduzir a resolução/qualidade armazenada), não de gzip.

---

---

## Tarefa 4 — React Query: staleTime, waterfall e persistência

### `cache.config.ts` — TTLs, query keys e persistência

`CACHE_CONFIG` define os TTLs (usados como `staleTime` nos `useQuery` das telas, não como config central automática — cada tela importa o valor e passa manualmente). Default global (`queryClient.ts`): `staleTime: 5min`, `gcTime: 30 dias` (reaproveita `FAVORITES_TTL`).

| Query key raiz | `staleTime` aplicado | Persistida em MMKV? |
|---|---|---|
| `user` | (não observado em uso direto nas telas lidas) | ✅ sim |
| `userProfile` | 15 min (`USER_PROFILE_TTL`) | ✅ sim |
| `dailyMissions` | **60s** (`DAILY_MISSIONS_TTL`) | ❌ **não** |
| `blendLogsToday` | 1h (`HYDRATION_TODAY_TTL`, reaproveitado) | ✅ sim |
| `blendHistory` | 7 dias (`BLEND_HISTORY_TTL`) | ❌ **não** |
| `hydrationToday` | 1h | ✅ sim |
| `hydrationHistory` | 1h (Track) / 7 dias (History) — mesma key raiz, staleTime diferente por tela | ❌ **não** |
| `supplementStack` | 24h | ✅ sim |
| `supplementHistory` | 7 dias | ❌ **não** |
| `shoppingLists` | 7 dias | ✅ sim |
| `shoppingListDetail` | (não observado nas telas lidas nesta tarefa) | ✅ sim |
| `favorites` | 30 dias | ✅ sim |
| `conversations` | padrão global (5 min, não sobrescrito) | ❌ não (exclusão deliberada, comentário no código) |
| `weeklyReportDates` / `weeklyReport` / `weeklyReportLatest` | padrão global (5 min) | ❌ não (exclusão deliberada) |
| `pulseAiHistory` | — (key declarada mas não usada nas telas lidas) | ✅ sim |
| `pantryScans` | — | ❌ não (exclusão deliberada, quota sensível) |

**Nenhuma query com `staleTime: 0` ou sem staleTime causando refetch imediato foi encontrada** — toda `useQuery` observada nas 6 telas principais define um `staleTime` explícito (ou herda os 5 min do default global, que já evita refetch agressivo). `dailyMissions` com 60s é o mais agressivo, mas é intencional (progresso de missão precisa refletir ações recentes).

**Achado real de persistência:** apesar de existirem TTLs de "7 dias" pensados para reduzir sincronizações (`BLEND_HISTORY_TTL`, comentário explícito no código: _"reduzir o TTL força sincronizações mais frequentes"_), as query keys `blendHistory`, `hydrationHistory` e `supplementHistory` **não estão em `PERSISTABLE_QUERY_KEYS`** — não sobrevivem ao fechamento do app. O TTL de 7 dias só produz efeito dentro da mesma sessão de app (cache em memória do React Query); a cada cold boot, a `HistoryScreen` e as métricas de histórico da `TrackScreen` refazem a chamada de rede do zero, independentemente de terem sido buscadas minutos antes de o app fechar. Da mesma forma, `dailyMissions` não é persistida — a `HomeScreen` sempre mostra o skeleton de missões em todo cold boot, mesmo com MMKV "quente" para as outras seções da mesma tela.

### Mapa de queries por tela

| Tela | Queries (`useQuery`) | Estrutura |
|---|---|---|
| **HomeScreen** | `dailyMissions`, `userProfile`, `blendLogsToday`, `hydrationToday` | **Paralelo** — 4 queries independentes, sem `enabled` encadeado. `isLoading` da tela = `isLoadingProfile \|\| isLoadingLogs` (missões e hidratação têm skeleton próprio, não bloqueiam o resto). |
| **TrackScreen** | `hydrationToday`, `supplementStack`, `shoppingLists`, `hydrationHistory` (7d) | **Paralelo** — 4 queries independentes. `isLoading` = OR das 3 primeiras (a de `shoppingLists` não entra no gate — só alimenta um badge que aparece quando chega). |
| **PulseAIScreen** | `favorites` (via `useFavorites`) | Única query da tela, 30 dias de `staleTime`, persistida — na prática sempre cache hit após o primeiro uso. Histórico do chat em si é `useState` local, sem React Query (Fase 1, por design, conforme comentário no arquivo). |
| **MeScreen** | `userProfile` | Mesma query key da HomeScreen — se o usuário já visitou Home, é cache hit instantâneo. |
| **HistoryScreen** (`useHistoryData`) | `blendSummary`, `hydrationSummary`, `supplementSummary`, `blendInfinite` (página 1) | **Paralelo** — 4 queries independentes, todas derivadas do mesmo `from`/`to`. Redundância notável: `blendSummary` e `blendInfinite` chamam o mesmo endpoint `GET /blend-logs/history` com paginação diferente (resumo vs. lista completa) — 2 requisições de rede para o mesmo recurso base. |
| **WeeklyReportScreen** | `weeklyReportDates` → `weeklyReport` (por semana selecionada) | **Waterfall real, o único encontrado nas 6 telas.** `reportQuery` só é habilitada (`enabled: Boolean(selectedWeekStart)`) depois que `datesQuery` resolve e um `useEffect` seta `selectedWeekStart` a partir do resultado. Isso é sequencial por construção: busca das datas → seleção da última semana → busca do relatório daquela semana. |

### Tempo de loading estimado — sem cache vs. cache quente

Usando os tempos médios medidos na Tarefa 2 onde disponíveis; os demais (hidratação, suplementos, listagem de datas de relatório) não estavam na lista de endpoints da Tarefa 2 — estimados por analogia com endpoints de padrão de query equivalente (`findOne`/`find` simples sobre coleção pequena, mesma faixa de 140-300ms observada nos demais), marcados como **(estimado)**.

| Tela | Sem cache (frio, paralelo = tempo do mais lento) | Cache quente (MMKV, dentro do `staleTime`) |
|---|---|---|
| HomeScreen | ~300-900ms (gargalo: `daily-missions`, 297-909ms medido; `users/me`+`blend-logs/today` resolvem antes, ~150-300ms) | **Parcial.** `userProfile`/`blendLogsToday`/`hydrationToday` instantâneos (persistidos); `dailyMissions` sempre refaz a chamada de rede (não persistida) — tela nunca é 100% instantânea no cold boot. |
| TrackScreen | ~300ms (gargalo: `shopping-lists` 290ms / `hydration-history` ~250-300ms estimado, em paralelo) | **Parcial.** `hydrationToday`/`supplementStack`/`shoppingLists` instantâneos; `hydrationHistory` sempre refaz a chamada (não persistida). |
| PulseAIScreen | ~150-250ms (estimado, só `favorites`) | Instantâneo (persistida, TTL de 30 dias). |
| MeScreen | ~149ms (`users/me` medido) — ou 0ms se Home já carregou nesta sessão | Instantâneo (persistida) e/ou cache já quente vindo da Home. |
| HistoryScreen | ~325ms (gargalo: `blend-logs/history` 325ms medido; hidratação/suplemento ~250-300ms estimado, em paralelo) | **Nenhum ganho.** Nenhuma das 4 queries está em `PERSISTABLE_QUERY_KEYS` — sempre refaz todas as 4 chamadas de rede no cold boot, mesmo tendo sido carregadas segundos antes de fechar o app. |
| WeeklyReportScreen | **~300-450ms (sequencial, não paralelo)** — soma de `weekly-reports/dates` (~150-200ms estimado) + `weekly-reports?weekStart=` (172-227ms medido via `/latest`, presumindo custo semelhante), por causa do waterfall | Nenhum ganho — ambas explicitamente fora da persistência por design; refaz o waterfall completo a cada cold boot, mas fica em cache de memória por 5 min entre navegações na mesma sessão. |

**Nota sobre "sem cache":** os tempos acima assumem Atlas M0 "morno" (não o pior caso "frio" observado na primeira chamada da bateria da Tarefa 2, que chegou a 909ms só para `daily-missions`). Em um cold boot real do app — que corresponde ao pior caso, primeira interação do dia com o backend — é razoável esperar que a HomeScreen ocasionalmente bata perto de 1s de loading percebido pelo gargalo de `daily-missions`, coincidindo justamente com a tela que o usuário vê primeiro ao abrir o app.

### `PersistQueryClientProvider` — configuração observada em `App.tsx`/`queryClient.ts`

- Provider envolve todo o `AppShell` em `App.tsx:100-102`, com `persistOptions` vindo de `queryClient.ts`.
- `dehydrateOptions.shouldDehydrateQuery` filtra por `PERSISTABLE_QUERY_KEYS` — só a raiz da query key precisa estar na lista (`user`, `userProfile`, `blendLogsToday`, `favorites`, `hydrationToday`, `shoppingLists`, `shoppingListDetail`, `supplementStack`, `pulseAiHistory`).
- Excluídas explicitamente (por decisão documentada em comentário): `conversations`, `pantryScans`, `weeklyReportLatest`/`weeklyReport`/`weeklyReportDates`.
- **Excluídas implicitamente (sem comentário/decisão documentada, aparentam ser lacuna):** `dailyMissions`, `blendHistory`, `hydrationHistory`, `supplementHistory` — nenhuma está em `PERSISTABLE_QUERY_KEYS`, mas também não têm nenhum comentário explicando a exclusão como as 4 acima. Dado que `blendHistory`/`hydrationHistory`/`supplementHistory` têm TTL de 7 dias justamente pensado para "uso offline completo" (frase usada no comentário de `SHOPPING_LISTS_TTL`, que é o único TTL de 7 dias que de fato está persistido), a leitura mais provável é que ficaram de fora por descuido, não por design.
- `maxAge` global de persistência = `FAVORITES_TTL` (30 dias) — mas cada query pode ter um teto menor via `PERSISTED_QUERY_MAX_AGES`; hoje só `shoppingLists`/`shoppingListDetail` têm override (7 dias). As demais 7 query keys persistidas (`user`, `userProfile`, `blendLogsToday`, `favorites`, `hydrationToday`, `supplementStack`, `pulseAiHistory`) usam o teto de 30 dias por padrão — mais longo que o próprio `staleTime` de cada uma, o que é o comportamento esperado (dado obsoleto ainda é servido do disco enquanto revalida em rede).
- **Tamanho estimado do cache persistido em MMKV:** somando os payloads medidos na Tarefa 2 das queries persistidas — `userProfile` (0.98 KB) + `blendLogsToday` (payload não medido diretamente, mesma ordem de `blend-logs/history` ≈ 0.5-0.7 KB estimado) + `shoppingLists` (0.58 KB) + `favorites`/`supplementStack`/`hydrationToday`/`pulseAiHistory`/`shoppingListDetail`/`user` (não medidos, mas todos payloads pequenos e "curados" como os demais, tipicamente <1 KB cada pelos mesmos padrões de controller vistos na Tarefa 1) → total estimado **bem abaixo de 10 KB** por usuário. Isso é desprezível para o MMKV (que lida bem com centenas de KB) — a persistência de query cache não é um vetor de peso ou lentidão aqui; o custo real de armazenamento do app está concentrado na foto de perfil base64 (Tarefa 3/6), que fica em uma storage MMKV separada, não neste cache de queries.

---

---

## Tarefa 5 — FlatList e SectionList: configuração e otimização

### Configuração por lista

| Lista | Tipo | `keyExtractor` | `getItemLayout` | `initialNumToRender` | `windowSize` | `removeClippedSubviews` | `ListEmptyComponent` |
|---|---|---|---|---|---|---|---|
| `ShoppingListDetailScreen` — itens da lista | `SectionList` | ✅ `item.itemId` (estável) | ❌ ausente | ❌ ausente (default 10) | ❌ ausente (default 21) | ❌ ausente | ✅ configurado |
| `ShoppingListsScreen` — listas ativas | `FlatList` | ✅ `item.id` | ❌ ausente | ❌ ausente | ❌ ausente | ❌ ausente | ✅ configurado (`renderEmpty`) |
| `ConversationHistoryScreen` — conversas | `FlatList` | ✅ `item.id` | ❌ ausente | ❌ ausente | ❌ ausente | ❌ ausente | ⚠️ tratado fora do `FlatList` (estado vazio é um branch de render separado, não a prop `ListEmptyComponent`) |
| `HistoryScreen` — histórico de blends | **`ScrollView` + `.map()`, não é `FlatList`** | ✅ `item.id` (via `key` no `.map()`) | n/a | n/a | n/a | ⚠️ só no `ScrollView` externo, não item-a-item | ✅ (branch separado antes do `.map()`) |
| `MissionCard` na HomeScreen | `.map()` sobre array fixo de 3 | ✅ `mission.missionId` | n/a | n/a | n/a | n/a | n/a (nunca vazio, sempre 3 missões) |

### Achado principal: `HistoryScreen` não usa `FlatList` para o histórico de blends

Confirmado em `HistoryScreen.tsx:306`: a lista de blends (que suporta paginação via `useInfiniteQuery` + botão "carregar mais") é renderizada com `{blendLogs.map((item, index) => <BlendLogItem key={item.id} .../>)}` dentro de um `ScrollView` que envolve a tela inteira (gráficos + stats + a própria lista). Isso significa:

- **Nenhuma virtualização** — cada página carregada via "carregar mais" fica montada permanentemente em memória/árvore de views, sem desmontar itens fora da tela.
- Como a paginação é manual (botão, não `onEndReached` automático), o crescimento é limitado pela quantidade de vezes que o usuário toca em "carregar mais" — mitiga a gravidade, mas não elimina o problema: um usuário com muitos meses de histórico que pagina bastante numa única sessão acumula centenas de `BlendLogItem` montados simultaneamente.
- `key={item.id}` é usado corretamente (não é índice do array), então não há bug de re-render por chave instável — o problema é puramente ausência de virtualização, não correção.

Para os demais 3 (`SectionList`/`FlatList` reais), nenhum item usa `getItemLayout`, `initialNumToRender`, `windowSize` ou `removeClippedSubviews` — todos rodam com os defaults do React Native. Dado que shopping lists, conversas e listas de listas de compras são tipicamente pequenas (dezenas de itens, não milhares — conversas são hard-capped em 20 pelo backend), o impacto prático de não configurar esses parâmetros é baixo hoje, mas é a primeira coisa a ajustar se o volume crescer (ex: usuários Pro acumulando muitas shopping lists arquivadas).

### Componentes de item: custo de renderização e `React.memo`

| Componente | `React.memo`? | Operações na renderização |
|---|---|---|
| `ShoppingListItemRow` (`ShoppingListDetailScreen.tsx:62`) | ❌ **não memoizado** | 2 `Animated.Value` + 2 `Animated.spring` por item, um deles (`fillProgress`, interpolação de cor de fundo/borda) com `useNativeDriver: false` — roda no JS thread a cada toggle de check. Sem `React.memo`, qualquer atualização de `localItems` no componente pai re-renderiza **todas** as linhas da seção, não só a que mudou. |
| `ShoppingListCard` (`ShoppingListsScreen.tsx:95`) | ❌ não memoizado | Leve — só `useDateFormat`/`useAppTranslation`, sem cálculo derivado pesado nem acesso a storage. Baixo risco mesmo sem memo. |
| `ConversationHistoryCard` (`ConversationHistoryScreen.tsx:38`) | ❌ não memoizado | Leve, mesmo perfil do card acima. Lista é hard-capped em 20 itens pelo backend — impacto de não memoizar é desprezível. |
| `BlendLogItem` (`components/history/BlendLogItem.tsx:31`) | ❌ não memoizado | Leve — sem cálculo custoso, altura fixa (`height: 82` no style, ainda que não usado num `getItemLayout` porque a lista nem é um `FlatList`). Risco cresce com a paginação acumulada do achado acima (mais itens montados = mais candidatos a re-render desnecessário a cada mudança de estado da tela). |
| `MissionCard` (`components/missions/MissionCard.tsx:34`) | ❌ não memoizado | `useMemo` já protege o cálculo de `normalizedProgress`, mas 2 das 3 animações (`cardState` para cor de fundo/borda, `progressValue` para largura da barra) usam `useNativeDriver: false` — JS thread. Array fixo de 3, então o impacto de não ter memo é mínimo (sempre remonta os 3 juntos quando `missionsData` muda). |

**Padrão recorrente:** nenhum dos 5 componentes de item passa por `React.memo`, mas nenhum executa MMKV/storage síncrono ou cria objetos/arrays novos sem `useCallback` na renderização — o `renderItem` de cada lista já usa `useCallback` corretamente (exceto `ConversationHistoryScreen`, que declara o `renderItem` inline dentro do JSX do `FlatList`, sem `useCallback` — consistente com o baixo risco geral daquela tela por ser pequena, mas quebra o padrão usado nas outras telas). O maior risco real de custo de renderização não está nos itens de lista em si, mas nas animações com `useNativeDriver: false` (`ShoppingListItemRow`, `MissionCard`) — que competem por tempo de JS thread com qualquer outro trabalho JS concorrente, tema retomado na Tarefa 6 (decodificação da foto base64 no mesmo thread).

---

---

## Tarefa 6 — Foto de perfil base64 e custo de renderização

### Como a foto é carregada (`ProfilePhoto.tsx`)

Fluxo por instância do componente (`useEffect`, linhas 150-205):
1. Se `hasProfilePhoto` for falso, limpa cache e mostra as iniciais — sem custo.
2. Senão, chama `readCachedProfilePhoto(resolvedUserId)` — leitura **síncrona** do MMKV (`PROFILE_PHOTO_STORAGE.getString(...)`, linha 88) seguida de `JSON.parse` do valor lido.
3. Se o `profilePhotoUpdatedAt` em cache bate com o do perfil atual, usa o valor cacheado direto (`buildProfilePhotoImageUri`, uma concatenação de string simples para montar a `data:` URI).
4. Caso contrário (cache ausente ou desatualizado), busca `GET /users/me/photo` pela rede, grava o resultado no MMKV via `cacheProfilePhoto` (novo `JSON.stringify` + `.set`) e só então atualiza o estado.

### MMKV é síncrono — confirmado no código

`createAppStorage` (`config/storage.ts:27-29`) retorna `new MMKV({ id: namespace })` diretamente do `react-native-mmkv`, sem nenhum wrapper assíncrono. `getString`/`set`/`delete` do MMKV são chamadas síncronas por design da biblioteca (acesso a arquivo memory-mapped) — confirma a premissa do enunciado.

### Renderização simultânea em múltiplos componentes — confirmado, sem dedupe

`<ProfilePhoto>` é renderizado em 4 lugares: `MeScreen.tsx:1112` (avatar do header, sempre montado enquanto a tela está ativa) e dentro de `WeeklyShareCard.tsx:156`, `RecipeShareCard.tsx:172`, `AchievementShareCard.tsx:63` — os 3 últimos são **cards de compartilhamento montados condicionalmente** (`{pendingShare ? <WeeklyShareCard .../> : null}`, mesmo padrão em `MeScreen` e `WeeklyReportScreen`), só existem enquanto uma ação de "compartilhar" está em andamento.

**Isso significa que, no momento em que o usuário toca em "compartilhar" na `MeScreen` ou na `WeeklyReportScreen`, existem 2 instâncias de `ProfilePhoto` montadas ao mesmo tempo** (o avatar do header + o avatar dentro do card de compartilhamento recém-montado) — ambas para o **mesmo usuário**, ambas dependendo do mesmo `hasProfilePhoto`/`profilePhotoUpdatedAt`. Cada instância roda seu próprio `useEffect` de forma totalmente independente: **a string base64 é lida do MMKV e desserializada (`JSON.parse`) duas vezes**, uma por instância, sem nenhum cache compartilhado, memoização entre componentes, ou deduplicação de leitura (diferente do React Query, que dedupe por query key — aqui é acesso direto ao MMKV, sem camada de cache em memória do React por cima). Isso se repete a cada card de compartilhamento diferente (`RecipeShareCard` ao compartilhar uma receita, `AchievementShareCard` ao compartilhar uma conquista) — sempre uma leitura+parse redundante da mesma foto já carregada no avatar visível na tela.

### Tamanho real vs. pior caso

Medido na Tarefa 3: a foto real da conta de teste tem **33.28 KB** (`imageBase64` = 34.016 caracteres). O teto aceito pelo backend é `MAX_PROFILE_PHOTO_BASE64_LENGTH = 530_000` caracteres ≈ **517.6 KB**.

### Estimativa de custo no JS thread

Para uma string base64 de ~500 KB (próxima do pior caso, bem maior que a foto real de 33KB medida):

- **Leitura do MMKV (`getString`):** essencialmente um `memcpy` sobre um arquivo memory-mapped — sub-milissegundo mesmo para ~500KB. Não é o gargalo.
- **`JSON.parse` do objeto `{imageBase64, mimeType, profilePhotoUpdatedAt}`:** para um payload total de ~500-650KB, tipicamente **poucos milissegundos** em engines modernas (Hermes, usado por padrão em Expo/RN) — mas cresce em dispositivos Android de entrada, onde pode chegar à casa de 5-15ms para esse tamanho de string.
- **Montagem da `data:` URI (`buildProfilePhotoImageUri`):** concatenação de template string — aloca uma nova string do mesmo tamanho (~500KB+), custo comparável ao parse acima.
- **Decodificação do JPEG em si** (bitmap para exibição): esse passo tende a rodar fora do JS thread, no carregador de imagem nativo — mas a *string* base64 de ~500KB ainda precisa atravessar a ponte/JSI para o módulo nativo de imagem, o que tem custo de serialização proporcional ao tamanho da string na arquitetura antiga (bridge); com New Architecture (JSI), esse custo é menor mas não nulo.

**Total estimado por instância, pior caso (~500KB, cache hit):** na faixa de **poucos ms a ~15-20ms** de trabalho síncrono no JS thread, concentrado em uma única leitura+parse+concatenação — não é caro isoladamente, mas é bloqueante (síncrono) e ocorre **em dobro** exatamente no momento de compartilhar (2 instâncias simultâneas, ver achado acima). Com a foto real medida (33KB), esse custo é proporcionalmente ~15x menor — na faixa de frações de milissegundo, irrelevante na prática hoje.

### Coincidência com animações `useNativeDriver: false`

Na Tarefa 5 identifiquei animações rodando no JS thread (`useNativeDriver: false`) em `ShoppingListItemRow` (interpolação de cor de fundo/borda do checkbox), `MissionCard` (cor de fundo/borda do card + largura da barra de progresso) e `HomeScreen` (`levelProgressWidth`, barra de progresso de nível). Nenhuma dessas telas renderiza `ProfilePhoto` diretamente — o cruzamento real só acontece durante o fluxo de compartilhamento (`MeScreen`/`WeeklyReportScreen`/`RecipeCard`), que dispara a montagem de um card de compartilhamento com sua própria `ProfilePhoto`.

**Cenário de risco concreto:** usuário completa uma missão na `HomeScreen` (dispara a animação de `MissionCard`, ~300ms, JS thread) e navega rapidamente para `Me`/`WeeklyReport` para compartilhar antes da animação terminar — nesse caso, o parse do MMKV do avatar do header (`MeScreen`) já ocorre nesse intervalo, competindo por fatias do mesmo thread. É uma janela estreita e não o caminho mais comum de uso, mas é plausível dado o código atual. Um cenário mais provável de jank perceptível é o próprio `generateAndShare` (captura de view-shot do card de compartilhamento) coincidindo com o parse duplicado do MMKV logo após o toque em "compartilhar" — aí sim os dois custos (captura de imagem + leitura/parse duplicado) competem no mesmo instante, embora ambos sejam eventos pontuais (não contínuos) e o app já insira um delay de `SHARE_DELAY_MS` (300ms) antes de capturar, o que dá tempo para o parse do MMKV terminar antes da captura começar.

**Conclusão da Tarefa 6:** com a foto real medida (33KB) o custo é desprezível. O risco só se torna relevante se/quando um usuário tiver uma foto próxima do teto de ~518KB — nesse caso, a leitura duplicada (sem cache entre instâncias) dobra um custo que já não é trivial, na janela exata em que o app está tentando fazer algo visualmente suave (gerar um card de compartilhamento).

---

---

## Tarefa 7 — Bundle e inicialização

### Dependências de produção (`apps/mobile/package.json`)

**Achado positivo, contrário à hipótese do enunciado:** `date-fns` **não é dependência do mobile** (só existe em `apps/api`). Toda formatação de data é feita via `Intl.DateTimeFormat`/`Intl.RelativeTimeFormat` nativos, em `useDateFormat.ts` — e o próprio arquivo documenta a decisão em comentário: _"date-fns-tz adiciona ~40KB minificado para resolver exatamente o que o runtime já fornece"_. Não há import de barril nem parcial de date-fns para auditar porque a lib simplesmente não está no bundle.

**Achado principal: `react-native-reanimated` está declarado mas tem uso zero.** Busca em todo `src/` e `App.tsx` não encontrou nenhum import de `react-native-reanimated` — todas as animações do app (`ShoppingListItemRow`, `MissionCard`, `HomeScreen`, sheets de listas de compras, etc., vistas nas Tarefas 5/6) usam a API `Animated` nativa do React Native, não Reanimated. Isso é peso morto real: Reanimated é uma biblioteca nativa pesada (adiciona binário nativo em iOS/Android + exige o plugin Babel `react-native-reanimated/plugin` rodando sobre todo o código-fonte em cada build) sem nenhum benefício funcional hoje.

**`@shopify/flash-list` tem uso único e estreito.** Só é usado em `FavoritesListScreen.tsx` — nenhuma das 5 listas revisadas na Tarefa 5 usa FlashList (todas usam `FlatList`/`SectionList`/`ScrollView` nativos). O app carrega 2 motores de virtualização de lista diferentes (o nativo do RN + FlashList) para uma única tela usar o segundo — não é código morto, mas é uma dependência pesada para uma superfície de uso pequena.

**Duas famílias de ícones bundladas via `@expo/vector-icons`:** `Ionicons` (dominante, usado em praticamente toda a UI) e `AntDesign` (usado em só 3 glyphs — `checkcircle`, `google`, `arrowleft` — todos em telas do fluxo de autenticação). Cada família de ícone importada carrega seu próprio arquivo de fonte completo, independente de quantos glyphs são de fato usados — `AntDesign` está ali essencialmente pelo logo do Google (que `Ionicons` não tem), mas isso significa carregar uma fonte de ícones inteira para 3 símbolos. Achado menor, mas real.

**SDKs externos legítimos e usados de fato:** `react-native-purchases` (RevenueCat, 1 arquivo de serviço), `expo-camera`/`expo-image-manipulator`/`expo-image-picker` (Pantry Scanner + upload de foto de perfil), `expo-notifications`, `expo-auth-session`/`expo-web-browser` (OAuth do Google) — todos correspondem a features reais do app, sem sinal de over-fetching de SDK.

**Fontes (`@expo-google-fonts/*`):** os 3 pacotes (Syne, DM Sans, DM Mono) já são importados por peso específico em `App.tsx` (11 pesos ao todo, ex.: `Syne_400Regular`, `Syne_700Bold` — não a família inteira) — já é a prática correta, nada a cortar aqui.

**Estilo de import:** em todos os arquivos auditados nas Tarefas 4-6 (`@expo/vector-icons`, `@tanstack/react-query`, `@blendi/shared`, `react-native-mmkv`), os imports são nomeados (`import { X } from 'lib'`), nunca `import * as X from 'lib'` — não há padrão de import de barril desnecessário nas libs de terceiros observadas.

### Sequência de inicialização (`App.tsx` + `RootNavigator.tsx`)

1. **Nível de módulo (síncrono):** `import './src/locales/i18n'` (inicialização do i18next) e `enableScreens()` — executam antes de qualquer render.
2. `SplashScreen.preventAutoHideAsync()` — mantém a splash nativa visível (fire-and-forget).
3. `AppShell` monta. `useFonts(...)` começa a carregar as 11 variações de fonte (assíncrono). **`if (!fontsLoaded && !fontError) return null;`** (linha 358-360) — **bloqueia a árvore de render inteira**, incluindo `NavigationContainer`/`RootNavigator`, até as fontes resolverem. Nada aparece além da splash nativa nesse intervalo.
4. **Em paralelo** (mesmo ciclo de efeitos, não depende de fontes): um `useEffect` dispara `setupAxiosInterceptors()`, `initializePurchases()` (inicialização do SDK do RevenueCat) e `restoreSession()` (restauração da sessão persistida, possivelmente com validação/refresh de token via rede) — **não é um waterfall com o carregamento de fontes**, roda ao mesmo tempo.
5. Quando as fontes resolvem: a splash nativa é escondida (`SplashScreen.hideAsync()`) e `NavigationContainer`/`RootNavigator` finalmente montam. Se `restoreSession()` (passo 4) ainda não tiver terminado, `RootNavigator` renderiza sua própria tela de loading em JS (`NavigationSplashScreen` — texto "BLENDi Pulse" + `ActivityIndicator`, `RootNavigator.tsx:15-22`) até a sessão resolver.
6. Só então a primeira tela real monta (Home, se autenticado) e dispara suas próprias queries paralelas (Tarefa 4).

### Operação que bloqueia a exibição da primeira tela e poderia ser diferida

O carregamento de fontes (passo 3) é a única operação que **bloqueia a árvore de render inteira**, inclusive a tela de loading em JS que já existe para o caso de sessão ainda restaurando (`NavigationSplashScreen`). Como essa tela de loading usa só texto simples e um `ActivityIndicator` (não depende das fontes customizadas Syne/DM Sans/DM Mono para nada essencial), ela poderia, em princípio, ser renderizada imediatamente com uma fonte de sistema como fallback, sem esperar `useFonts` resolver — permitindo que a splash nativa some mais cedo e a restauração de sessão (que já roda em paralelo) tenha sua própria UI de espera exibida antes.

**Não foi possível medir a duração real do carregamento de fontes neste diagnóstico** — isso exigiria rodar o app num device/simulador com profiling de startup (Expo Go ou build nativo), fora do escopo de um diagnóstico feito por leitura de código e medição de backend. Vale registrar que fontes locais empacotadas no binário (não buscadas por rede) tendem a carregar em dezenas de milissegundos em dispositivos modernos — o achado aqui é arquitetural (uma dependência de bloqueio desnecessária), não necessariamente um gargalo grande em tempo absoluto; o ganho real só pode ser confirmado com medição em device.

---

## Tabela final — otimizações priorizadas por impacto vs. esforço

| # | Otimização | Impacto | Esforço | Tarefa |
|---|---|---|---|---|
| 1 | Habilitar `compression` (gzip) no Express | **Alto** | **Baixo** | 3 |
| 2 | Remover `react-native-reanimated` do bundle (dependência sem nenhum uso) | **Alto** (binário nativo + tempo de build) | **Baixo** | 7 |
| 3 | Adicionar índice em `AiCache.userId` (usado por `deleteMany` em `invalidateUserCache`) | **Alto** (cresce com uso do Pulse AI) | **Baixo** | 1 |
| 4 | Adicionar índice em `User.revenueCatCustomerId` (usado no `$or` do webhook) | **Alto** (cresce com base de assinantes) | **Baixo** | 1 |
| 5 | Persistir `dailyMissions`, `blendHistory`, `hydrationHistory`, `supplementHistory` no `PERSISTABLE_QUERY_KEYS` | **Alto** (Home sempre mostra skeleton de missões; History sempre refaz 4 chamadas no cold boot) | **Baixo** | 4 |
| 6 | Remover campos não usados do payload de `weekly-reports` (`bySupplementName`, `calorieGoalHitDays`, `blendDaysInWeek`, 2 campos de `previousWeekComparison`, `isProAtGeneration`) | **Médio** | **Baixo** | 3 |
| 7 | Otimizar `POST /blend-logs` (endpoint mais lento medido, ~1.18s médio) — paralelizar/reduzir round-trips da cadeia streak+XP+missões | **Alto** (ação mais frequente e crítica do app) | **Médio-Alto** | 2 |
| 8 | Investigar/corrigir conversas "casca vazia" acumulando quando `POST /pulse-ai/chat` falha após criar a conversa | **Médio** (lixo de dados, custo de storage a longo prazo) | **Médio** | 3 |
| 9 | Migrar `HistoryScreen` de `ScrollView`+`.map()` para `FlatList` real no histórico de blends | **Médio** (cresce com uso acumulado de paginação) | **Médio** | 5 |
| 10 | Corrigir índice composto do `ShoppingList` para cobrir filtro+sort juntos (`{userId, isArchived, updatedAt}`) | **Baixo** (hoje) | **Baixo** | 1 |
| 11 | Compartilhar/memoizar leitura do MMKV da foto de perfil entre instâncias simultâneas de `ProfilePhoto` (evitar parse duplicado durante compartilhamento) | **Baixo** (hoje, foto real é pequena) / **Médio** (pior caso ~518KB) | **Médio** | 3, 6 |
| 12 | Adicionar `getItemLayout`/`initialNumToRender`/`windowSize`/`removeClippedSubviews` nas listas existentes (`ShoppingListDetailScreen`, `ShoppingListsScreen`, `ConversationHistoryScreen`) | **Baixo** (hoje, listas pequenas) | **Baixo** | 5 |
| 13 | Envolver `ShoppingListItemRow`/`MissionCard`/cards de lista em `React.memo` | **Baixo** | **Baixo** | 5 |
| 14 | Consolidar ícones em uma única família (avaliar alternativa ao logo do Google via `AntDesign`) | **Baixo** | **Baixo** | 7 |
| 15 | Configurar chave de API do Google Gemini no ambiente local de desenvolvimento (bloqueou medição real do Pulse AI nesta bateria) | **N/A — pré-requisito de diagnóstico**, não é otimização de produção | **Baixo** | 3 |
| 16 | Adiar o gate de fontes customizadas para não bloquear a tela de loading da restauração de sessão | **Baixo-Médio** (não medido em device) | **Médio** | 7 |

**Maior retorno imediato (Alto impacto / Baixo esforço):** itens 1-5 — compressão gzip, remoção do Reanimated não usado, e os 2 índices ausentes (`AiCache.userId`, `User.revenueCatCustomerId`) e a correção da lista de persistência do React Query. Nenhum exige mudança de arquitetura, só configuração pontual.

---

## Limitações deste diagnóstico

- Medições de tempo de resposta (Tarefa 2) foram feitas com Atlas M0 "morno" no início da bateria — a primeira chamada de cada bateria (login, `daily-missions`) mostrou latência bem acima das demais, compatível com conexão ainda se estabelecendo.
- `GET /weekly-reports/latest` foi medido apenas no estado vazio (`hasReport:false`) — a conta de teste não tem relatório gerado. O custo real de um payload com as 5 sub-agregações não foi medido.
- `GET /conversations/:id` com 10+ mensagens não pôde ser medido ao vivo — o Pulse AI está inoperante neste ambiente local (sem chave de API do Google Gemini configurada, todas as tentativas deram timeout de 30s). Foi usada uma estimativa baseada no schema real.
- Duração real do carregamento de fontes na inicialização (Tarefa 7) não foi medida — exigiria profiling em device/simulador, fora do escopo de um diagnóstico via leitura de código + medição de backend.
- Efeitos colaterais reais na conta de teste `b@b.com` como consequência das medições: 3 blend logs mínimos criados (Tarefa 2), 1 conversa "casca vazia" adicional criada por tentativas falhas do Pulse AI (Tarefa 3) — nenhum dado foi apagado ou revertido, conforme a instrução de não alterar configuração, mas os efeitos colaterais de medir os próprios endpoints de escrita são inerentes ao método pedido.
