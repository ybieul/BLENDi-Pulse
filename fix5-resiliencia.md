# FIX-5 — Relatório de Implementação: Resiliência

**Data:** 2026-09-04
**Base:** `diagnostico-resiliencia.md` (10 Alta, 11 Média, 5 Baixa)
**Escopo implementado:** 10 achados de Alta + 7 de 11 achados de Média, em 9 tarefas.
**Método:** cada tarefa foi lida e analisada antes da implementação, cruzada com o código-fonte real das bibliotecas envolvidas quando o comportamento não estava documentado claramente (node-cron, gaxios, google-generative-ai, zustand), implementada, e validada com testes reais sempre que tecnicamente possível — nunca só por leitura de código ou typecheck.

---

## Tarefa 1 — Handlers globais de processo + healthcheck de readiness

**O que foi feito:** adicionados os handlers `unhandledRejection`, `uncaughtException`, `SIGTERM` e `SIGINT`; adicionada a rota `GET /health`.

**Como foi feito:**
- `apps/api/src/index.ts`: `app.listen(...)` passou a ter seu retorno capturado (`const server = app.listen(...)`) — antes não era guardado em variável nenhuma, e os handlers de shutdown precisam de acesso ao `server` para chamar `server.close()`.
- `setupProcessHandlers(server)`: `unhandledRejection` só loga (`console.error`) e continua rodando. `uncaughtException` loga e inicia shutdown estruturado (`server.close()` → `mongoose.connection.close()` → `process.exit(1)`), com um `setTimeout` de 5s como fallback caso o shutdown gracioso trave. `SIGTERM`/`SIGINT` compartilham a mesma função `gracefulShutdown()`, idêntica em estrutura mas saindo com `process.exit(0)`.
- `apps/api/src/routes/ping.ts`: nova rota `GET /health` lendo `mongoose.connection.readyState`, retornando `dbStatus` no corpo e HTTP 503 quando `readyState !== 1`. `GET /ping` não foi alterada.

**Validação real:** subi o servidor localmente. `GET /ping` segue idêntico; `GET /health` retornou `200 { dbStatus: 1, ... }` com o Atlas conectado. Enviei `kill -15` no processo e confirmei no log: `[SIGTERM] Shutdown gracioso iniciado.` seguido do Mongo desconectando e do processo saindo limpo, dentro do teto de 5s, porta liberada.

**Achados/notas:** nenhum desvio do prompt. Único detalhe de implementação não especificado no prompt: como `mongoose` não era importado em `index.ts` antes (só `connectDatabase`), precisei importá-lo diretamente para chamar `mongoose.connection.close()`.

---

## Tarefa 2 — Cancelamento real da chamada ao Google Gemini + retry de 503

**O que foi feito:** `callGoogle`/`callGoogleVision` agora cancelam de verdade a chamada ao Gemini quando o timeout de aplicação expira, e retentam automaticamente 1x em caso de 503 "high demand".

**Como foi feito:**
- Nova função `generateGoogleContent(model, request, timeoutMs)` em `aiProvider.service.ts`: cria um `AbortController` próprio, passa `{ signal: controller.signal }` como **segundo argumento** de `model.generateContent` (confirmei no `.d.ts` do SDK que `generateContent(request, requestOptions?)` — `signal` é um parâmetro separado, não faz parte do corpo da requisição). O mesmo controller cobre as duas tentativas (original + retry), então o orçamento de tempo nunca dobra.
- Detecção de 503: `error instanceof GoogleGenerativeAIFetchError && error.status === 503` — encontrei essa classe de erro exportada pelo SDK com `status` tipado (mais preciso que regex na mensagem, que era minha ideia inicial antes de checar o SDK).
- Backoff fixo de 1s entre tentativas (não exponencial), conforme o prompt pediu.

**Validação real** (chamadas de verdade contra a API do Gemini, com a chave real do projeto, via scripts descartáveis depois apagados):
- Timeout de 30s: chamada normal resolveu em 919ms — confirma que o `AbortController` não interfere em chamadas dentro do prazo.
- Timeout deliberadamente de 10ms: rejeitou em 17ms com `AbortError` real — confirma cancelamento genuíno, não só desistência da aplicação.
- Lógica de retry testada isoladamente (mock, sem custo de API): 503→sucesso retenta 1x (~1s de backoff); erro não-503 (400) nunca retenta; 503→503 duas vezes seguidas para em exatamente 2 tentativas, sem loop infinito.

**Achados/notas:** nenhum desvio do prompt — a análise de código confirmou exatamente a API que o diagnóstico já tinha identificado.

---

## Tarefa 3 — Timeout nas chamadas ao RevenueCat

**O que foi feito:** `AbortSignal.timeout(15_000)` adicionado às duas chamadas `fetch` de `revenueCat.service.ts` (`postReceiptAndGetActiveSubscription`, `getSubscriberCustomerInfo`). Nada mais foi alterado.

**Validação real:** subi um servidor TCP local que aceita a conexão mas nunca responde (simulando RevenueCat lento, não fora do ar) e confirmei que o padrão `fetch` + `AbortSignal.timeout` aborta no tempo configurado (316ms para um teste de 300ms) com `TimeoutError`, em vez de ficar pendurado.

**Achados/notas:** nenhum desvio. Nota técnica: o erro resultante de timeout não é encapsulado em `RevenueCatRequestError` — cai no `next(err)` genérico (500 `unexpected-error`), exatamente como o prompt pediu (não alterar o tratamento de erro existente).

---

## Tarefa 4 — Timeout no Google OAuth

**O que foi feito:** login/registro via Google agora tem timeout de 10s em toda chamada de rede (troca de código por token, busca de chaves JWKS).

**Como foi feito e achado relevante:** o prompt supunha que `oauth2Client.getToken()` aceitaria um segundo argumento de opções com timeout — **isso não existe** (confirmei no código-fonte de `google-auth-library@10.6.2`: `getToken(codeOrOptions, callback)`, o segundo parâmetro é só um callback opcional). O caminho real é o fallback que o próprio prompt previu: troquei a construção do `oauth2Client` da forma posicional deprecated (`new OAuth2(clientId, clientSecret, redirectUri)`) para a forma de objeto único, incluindo `transporterOptions: { timeout: 10_000 }` — repassado direto ao `Gaxios` interno (`this.transporter = new Gaxios(transporterOptions)`), que aplica esse timeout via `AbortSignal` em **toda** requisição feita pelo client (tanto `getToken` quanto a busca de JWKS dentro de `verifyIdToken`).

**Validação real:** usei a opção `endpoints.oauth2TokenUrl` do próprio `OAuth2Client` (também suportada) para redirecionar `getToken()` a um servidor TCP local que nunca responde — confirmei abort em 333ms com timeout configurado de 300ms, provando que o timeout propaga do construtor até a chamada de rede real, ponta a ponta. Também subi o servidor de verdade e confirmei `GET /auth/google/url` continua retornando 200 normalmente.

---

## Tarefa 5 — Ordem reserva/entrega, noOverlap, try/catch nos jobs, timeout Expo

A tarefa mais extensa — 4 partes, 2 arquivos.

**Parte A (inversão reserva/entrega):** nos 4 jobs de lembrete (Daily Pulse, Streak, Supplement, Hydration), a reserva no `NotificationLog` não acontece mais antes do envio. Fluxo novo: uma checagem somente-leitura (`hasExistingNotificationLog`, nova função) filtra usuários já notificados antes de montar o payload; depois do `dispatchNotifications`, a reserva real (`reserveNotificationLog`) só acontece para os tokens que o Expo confirmou como entregues (`successfulTokens`).

**Achado que exigiu mudança de assinatura:** `sendNotificationBatch` (em `pushNotification.service.ts`) só retornava contagens agregadas (`successCount`/`errorCount`) — não havia como saber *quais* tokens tiveram sucesso. Adicionei `successfulTokens: string[]` ao retorno, extraído do array de resultados por-ticket que a função já computava internamente e descartava.

**Parte B:** `{ noOverlap: true }` adicionado aos 5 `cron.schedule` — confirmei em runtime (não só no tipo) que o node-cron aceita a opção sem erro.

**Parte C:** query inicial de usuários e o dispatch agora têm try/catch dedicados nos 4 jobs de lembrete, com log que diferencia "falha ao carregar usuários" de "falha por usuário" (Área 2, preservada) de "falha no dispatch".

**Parte D:** `AbortSignal.timeout(30_000)` na chamada `fetch` de `sendExpoBatch`.

**Validação real:** `tsc --noEmit` limpo; subi o servidor e confirmei `✅ Notification cron jobs registered successfully.` sem erro (prova `noOverlap` funcionando em runtime); revisão linha a linha dos 4 jobs reescritos.

**Achado à parte (fora do escopo desta tarefa, registrado para sua ciência):** `runWeeklyReportJob` tem exatamente o mesmo padrão de "reserva antes da entrega" para a notificação push de "relatório pronto" — mas o prompt pediu explicitamente para não alterá-lo nesta tarefa, com a justificativa de que "a geração do relatório já é o dado persistido, não uma entrega externa". Essa justificativa cobre os *dados* do relatório (já protegidos por índice único), mas não cobre a notificação *push* especificamente, que tem a mesma vulnerabilidade dos outros 4 jobs. Segui a instrução explícita e não mexi nele.

---

## Tarefa 6 — Sincronização offline no startup após crash

**O que foi feito:** dado local não sincronizado (lista de compras offline, blends pendentes) agora sincroniza automaticamente ao reabrir o app, mesmo sem uma transição de rede offline→online.

**Como foi feito:** novo `useEffect` em `useNetworkStatus.ts` com dependências vazias (roda só no mount) que checa `getDirtyLists().length > 0` e `getPendingBlends().length > 0` — se qualquer um for verdadeiro, dispara `triggerReconnectSync`, independente de `wasOffline` ou do estado de conectividade atual.

**Achado que exigiu correção adicional:** confirmei (como já tinha sinalizado na análise antes de começar) que `triggerReconnectSync` não tinha proteção contra chamada concorrente. Adicionei uma flag módulo-level (`isReconnectSyncInProgress`) envolvendo toda a função em `reconnectSync.utils.ts` — protege qualquer combinação de chamadas simultâneas (o novo efeito de startup + o efeito existente de transição de rede), não só o caso novo isoladamente.

**Validação real:** `tsc --noEmit` limpo. Como o MMKV é um módulo nativo (não roda fora do runtime React Native) e não há Jest configurado no projeto, validei a lógica da guarda de concorrência isoladamente com a mesma lógica exata da implementação: 2 chamadas simultâneas colapsam em 1 execução real; 2 chamadas sequenciais executam as 2 normalmente.

---

## Tarefa 7 — Error Boundary no mobile

**O que foi feito:** criado `apps/mobile/src/components/ui/ErrorBoundary.tsx` e integrado em `App.tsx`, envolvendo `AppShell`.

**Como foi feito:** uma classe `ErrorBoundaryClass` (`getDerivedStateFromError` + `componentDidCatch` — única forma de capturar erro de render em React) envolvida por um componente funcional `ErrorBoundary` que usa `useAppTranslation()` (convenção do projeto — hooks não funcionam em lifecycle methods de classe, então o `t` é repassado como prop). Tela de fallback com mensagem (`errors.unexpected_error`) e botão de retry (`common.actions.retry`) que chama `setState({hasError: false})`. Botão "Limpar dados" deixado como `TODO` comentado, não implementado, conforme pedido.

**Achado:** as chaves i18n (`errors.unexpected_error`, `common.actions.retry`) **já existiam** nos dois arquivos de locale (Área 8) — não precisei adicionar nada novo, ao contrário do que o prompt cogitava como possível.

**Validação:** `tsc --noEmit` limpo. **Não validado em runtime real** — ver seção de testes manuais abaixo, item 1.

---

## Tarefa 8 — Retry inteligente do React Query

**O que foi feito:** `retry: 2` substituído por `retry: shouldRetryQuery` em `queryClient.ts` — erros 4xx (`status >= 400 && < 500`) nunca retentam; qualquer outro erro (5xx, timeout, erro de rede genérico) mantém as 2 tentativas com backoff existentes.

**Como foi feito:** usei `axios.isAxiosError(error)` — confirmei que é o padrão já usado em todo o app (grep encontrou o mesmo idioma em ~10 arquivos), em vez de um cast inseguro.

**Validação real:** testei a lógica exata com a classe `AxiosError` real do axios instalado (não mockada manualmente) — 8 casos: 401/400/403 nunca retentam; 503/502 retentam até o limite de 2 e depois param; erro genérico não-Axios mantém o comportamento padrão. Todos passaram. `tsc --noEmit` limpo.

---

## Tarefa 9 — Persistência do timer de blend

**O que foi feito:** `isTimerRunning` e `timerStartedAt` agora sobrevivem a um crash do app, junto com `timerDuration` (que já sobrevivia).

**Achado crítico encontrado antes de implementar (e corrigido):** a implementação literal do prompt ("adicione os dois campos ao `partialize`") introduziria um bug novo. `createJSONStorage` do zustand serializa via `JSON.stringify`/`JSON.parse` **sem reviver customizado** — um `Date` persistido volta como **string** após reidratação, não como instância de `Date`. `BlendScreen.tsx` fazia `timerStartedAt.getTime()` diretamente, o que quebraria com `TypeError` exatamente no cenário que esta correção deveria resolver (reabrir o app após crash com timer em andamento).

**Correção aplicada:** além de adicionar os dois campos ao `partialize` (`blend.store.ts`), troquei `timerStartedAt.getTime()` por `new Date(timerStartedAt).getTime()` (com guarda `Number.isNaN`) em `BlendScreen.tsx` — funciona tanto para o valor reidratado (string) quanto para um `Date` real dentro do mesmo processo.

**Validação real:** simulei o round-trip exato de serialização (mesmo mecanismo interno do `createJSONStorage`) e confirmei: (1) sem a correção, `.getTime()` direto realmente quebra com `TypeError: ...getTime is not a function`; (2) com a correção, `new Date(...).getTime()` funciona corretamente nos dois cenários (reidratado e mesmo processo), sem regressão. `tsc --noEmit` limpo.

---

## Arquivos alterados

**Backend (`apps/api`):**
- `src/index.ts` — handlers de processo, captura de `server`
- `src/routes/ping.ts` — rota `/health`
- `src/services/aiProvider.service.ts` — cancelamento + retry Google
- `src/services/revenueCat.service.ts` — timeout
- `src/services/google.service.ts` — timeout via `transporterOptions`
- `src/jobs/notifications.jobs.ts` — ordem reserva/entrega, `noOverlap`, try/catch
- `src/services/pushNotification.service.ts` — timeout Expo, `successfulTokens`

**Mobile (`apps/mobile`):**
- `src/hooks/useNetworkStatus.ts` — sync de startup
- `src/utils/reconnectSync.utils.ts` — guarda de concorrência
- `src/components/ui/ErrorBoundary.tsx` — novo arquivo
- `App.tsx` — integração do ErrorBoundary
- `src/config/queryClient.ts` — retry inteligente
- `src/store/blend.store.ts` — persistência do timer
- `src/screens/BlendScreen.tsx` — coerção de `Date` na recuperação

Nenhum contrato de API, schema Zod exportado, ou comportamento confirmado como correto no diagnóstico foi alterado.

---

## Testes manuais necessários no Expo Go

Os itens 1, 2 e 3 são os únicos que o próprio FIX-5 exige como critério de aceite e que eu não consegui validar sem o app rodando de verdade. Os demais (4-6) são sanity checks de baixo risco — as mudanças no backend são aditivas (só timeout/cancelamento), mas vale confirmar que nada quebrou no fluxo visível do usuário.

### 1. Error Boundary (Tarefa 7) — obrigatório
1. Introduza um erro de render de propósito em qualquer tela simples (ex: numa tela qualquer, acesse `undefined.algumaCoisa` dentro do render, ou force `throw new Error('teste')` no corpo de um componente).
2. Abra essa tela no Expo Go.
3. **Esperado:** em vez do app travar/fechar, aparece a tela de fallback com a mensagem de erro inesperado e um botão "Tentar novamente".
4. Toque em "Tentar novamente".
5. **Esperado:** a tela volta ao normal (remonta) — se o erro que você introduziu for permanente (ex: o `throw` fixo do passo 1), ele vai aparecer de novo, o que é esperado; remova o erro de teste e confirme que aí sim a tela volta ao normal.
6. Remova o erro de teste do código antes de continuar.

### 2. Sincronização offline pós-crash (Tarefa 6) — obrigatório
1. Abra uma lista de compras no app.
2. Ative o modo avião (ou derrube o wifi) e marque/desmarque alguns itens, ou adicione um item novo.
3. Sem sair do modo avião, **force o fechamento completo do app** (swipe pra cima e feche, não só minimize) — não desative o modo avião ainda.
4. Reative a conexão (desative o modo avião).
5. Reabra o app.
6. **Esperado:** a sincronização dispara sozinha logo na abertura, sem você precisar ativar/desativar o modo avião de novo depois de já estar com o app aberto. Confirme na lista de compras que as alterações feitas offline aparecem sincronizadas (ou, se a sincronização falhar por outro motivo, que o toast de erro persistente aparece).

### 3. Timer de blend pós-crash (Tarefa 9) — obrigatório
1. Vá para a tela de Blend, inicie um timer (ex: 30s).
2. Enquanto o timer está rodando (por volta da metade, ex: aos 15s de um timer de 30s), **force o fechamento completo do app**.
3. Reabra o app e volte para a tela de Blend.
4. **Esperado:** o timer retoma de onde parou (contagem já avançada, não do zero) — se o tempo que passou enquanto o app estava fechado já ultrapassou a duração total, a tela deve ir direto para o estado de "completo"/avaliação, não ficar travada em "pronto para iniciar".

### 4. Login com Google (Tarefa 4) — sanity check
1. Faça logout e tente entrar de novo via "Continuar com Google".
2. **Esperado:** fluxo funciona normalmente, sem demora perceptível a mais que antes.

### 5. Fluxo de compra/RevenueCat (Tarefa 3) — sanity check
1. Se possível em ambiente de teste (sandbox), simule uma compra ou restauração de compra.
2. **Esperado:** funciona normalmente. (Timeout de 15s só é perceptível se o RevenueCat estiver genuinamente lento — não dá pra forçar esse cenário manualmente.)

### 6. Pulse AI e Pantry Scanner (Tarefa 2) — sanity check
1. Use o chat do Pulse AI normalmente (peça uma receita) e o Pantry Scanner (escaneie a geladeira).
2. **Esperado:** funciona normalmente, sem diferença perceptível de velocidade. (O retry de 503 e o cancelamento só aparecem sob instabilidade real do Gemini — não dá pra forçar isso manualmente; se acontecer sozinho, o app deve mostrar o erro dentro de ~30-45s, não travar.)

### Fora do escopo do Expo Go (precisam do próximo deploy no Railway)
- Handlers de `SIGTERM`/`uncaughtException`/`unhandledRejection` (Tarefa 1) — já validados localmente por mim; o comportamento real em produção só se confirma no próximo deploy.
- `noOverlap` e a inversão reserva/entrega dos cron jobs (Tarefa 5) — dependem de execução real ao longo de vários dias em produção para observar o efeito prático nas notificações.
