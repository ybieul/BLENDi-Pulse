# PostHog Analytics — instrumentação, correção de achados e testes (2026-11-01)

**Contexto:** 4º e último item de "Fix Before Launch" do feature brief do Jon
(outubro/2026) — rastrear sign-up, cada etapa do onboarding, visualização do
paywall, compras, blends, mensagens de IA e scans de despensa, com cobertura
completa do ciclo de vida de assinatura. Provedor PostHog, decisão tomada
com o Gabriel em 30/10/2026 (free tier, feature flags e error tracking
inclusos, SDK React Native sem plugin de config adicional).

Implementado em 7 tarefas, seguido de correção de 2 achados e uma bateria de
testes/pentest ao vivo que revelou um achado crítico não relacionado.

---

## Tarefa 1 — SDK, config e inicialização (mobile)

- `posthog-react-native` instalado como dependência de produção.
- `apps/mobile/src/config/analytics.config.ts` — mesmo padrão de
  `revenuecat.config.ts`, mas sem ramificação por `Platform.OS` (chave única
  para todas as plataformas). Expõe `getPostHogApiKey(): string | null`.
- `apps/mobile/src/services/analytics.service.ts` — `initializeAnalytics()`
  (idempotente, no-op se a chave estiver vazia), `identifyAnalyticsUser()`,
  `resetAnalyticsUser()`, `trackEvent()`. Nenhuma função lança erro.
- `app.config.ts` e `.env`/`.env.example` — nova variável
  `EXPO_PUBLIC_POSTHOG_API_KEY` (vazia), mesmo padrão de robustez do
  RevenueCat.
- `App.tsx` — `initializeAnalytics()` chamada no mesmo `useEffect` de boot
  que `initializePurchases()`, fire-and-forget (`.catch(() => undefined)`).

**Decisão técnica:** `@react-native-async-storage/async-storage` (peer dep
opcional do SDK) não foi instalado — o brief pedia "só instalação +
inicialização". Efeito: o client roda com storage em memória, sem persistir
o `distinctId` entre reinícios do app (relevante para a Tarefa 2 abaixo).

`PostHogEventProperties` não é reexportado publicamente pelo pacote — o
tipo usado por `trackEvent` foi extraído via
`Parameters<PostHog['capture']>[1]` em vez de importar de `@posthog/core`
(dependência transitiva, phantom dependency que quebra em pnpm estrito).

## Tarefa 2 — Identificação do usuário ligada à sessão

`identifyAnalyticsUser`/`resetAnalyticsUser` adicionados em
`auth.store.ts` ao lado de cada chamada a
`identifyPurchasesUser`/`logoutPurchasesUser` (em
`hydrateAuthenticatedUserAndPayments`, `logout`, `deleteAccount`).

**Desvio do texto do prompt, confirmado com o Gabriel:** o texto da Tarefa 2
pedia para não duplicar nada em `restoreSession` (chamada direta a
`identifyPurchasesUser`, fora de `hydrateAuthenticatedUserAndPayments`).
Mas os CRITÉRIOS DE ACEITE do checkpoint pediam identify "nos mesmos pontos
em que `identifyPurchasesUser` já acontece hoje" — o que inclui essa
chamada direta. `restoreSession` é o caminho de boot em toda reabertura do
app por usuário já logado; sem persistência de storage (Tarefa 1), pular
esse ponto deixaria a maioria das sessões anônimas no PostHog. Adicionado
`identifyAnalyticsUser` também em `restoreSession`.

## Tarefa 3 — Evento `sign_up`

`trackEvent('sign_up', { method: 'email' })` em `register`, depois do
`hydratedUser`. `trackEvent('sign_up', { method: 'google' })` em
`_setSession`, só dentro do bloco `isNewUser === true` (confirmado que
`_setSession` é usado exclusivamente pelo fluxo Google via
`useGoogleAuth.ts` — `login` nunca dispara `sign_up`).

## Tarefa 4 — Listener central de navegação (onboarding + paywall)

`onStateChange` no `NavigationContainer` (`App.tsx`), usando
`navigationRef.getCurrentRoute()?.name` (resolve a rota mais profunda,
mesmo aninhada) e uma ref de dedup (`lastTrackedScreenName`, mesmo padrão de
`lastHandledNotificationResponseKey`). `screen_viewed` só dispara para as
rotas em `TRACKED_SCREEN_NAMES`.

Lista original (5 rotas, por pedido explícito do brief):
`OnboardingModel`, `OnboardingGoal`, `OnboardingBody`, `OnboardingMacros`,
`Upgrade`. Ver "Correção dos achados 4 e 5" abaixo — essa lista foi
expandida para 7 rotas depois.

## Tarefa 5 — Eventos de ação de negócio (mobile)

Disparados só depois da chamada à API ter sucesso (nunca em caso de erro):

| Service | Evento | Propriedades |
|---|---|---|
| `blendLog.service.ts` (`createBlendLog`) | `blend_completed` | `blendiModel`, `durationSeconds` (de `result.log`) |
| `pulseAi.service.ts` (`sendMessage`) | `ai_message_sent` | `fromCache` |
| `pantryScanner.service.ts` (`analyzePantry`) | `pantry_scan_completed` | — |
| `purchase.service.ts` (`purchasePlan`) | `purchase_completed` | `planId`, `productIdentifier`, `priceString`, `currencyCode` (de `targetPackage.product`) |

## Tarefa 6 — Ciclo de vida da assinatura (backend)

- `posthog-node` instalado como dependência de produção em `apps/api`.
- `POSTHOG_API_KEY` adicionada ao schema de `env.ts` via `optionalString()`.
- `apps/api/src/services/analytics.service.ts` — `captureServerEvent(distinctId, event, properties?)`, client lazy, nunca lança (try/catch + `console.warn`).
- `revenueCatWebhook.controller.ts`: refatorado para extrair 3 funções antes
  internas como exportadas, para serem testáveis sem simular a requisição
  HTTP inteira — `handleInitialPurchaseOrRenewal` (nova, extraída do bloco
  inline), `markCancellationRequested`, `revokeExpiredSubscription`.
  - `subscription_renewed` — só quando `event.type === 'RENEWAL'`, nunca
    para `INITIAL_PURCHASE` (a compra inicial é responsabilidade exclusiva
    do app, via `purchase_completed`).
  - `subscription_cancel_requested` — depois do early-return que ignora
    cancelamento de assinatura já inativa.
  - `subscription_expired` — dentro de `revokeExpiredSubscription`, só
    quando a assinatura de fato foi revogada.
  - Todas com `String(user._id)` como `distinctId` e `{ product_id, store }`.
- Testes novos: `analytics.service.test.ts` (no-op com chave vazia,
  mockando `../config/env`) e `revenueCatWebhook.controller.test.ts` (6
  cenários: RENEWAL dispara, INITIAL_PURCHASE não dispara, cancelamento
  ativo dispara, cancelamento após expiração não dispara, usuário
  inexistente não dispara, expiração dispara).

**Achado técnico:** `mock.module()` do `node:test` só funciona em Node 22
com a flag `--experimental-test-module-mocks` (sem ela, `TypeError: mock.module
is not a function`). Adicionada ao script `test` de `apps/api/package.json`.
Sob `moduleResolution: "Node16"`, `import()` dinâmico (inclusive em posição
de tipo) exige extensão `.js` explícita no especificador — diferente dos
`import {} from` estáticos do resto do codebase.

## Tarefa 7 — Achados fora do escopo

Documentados em
[`posthog-analytics-achados-fora-do-escopo.md`](posthog-analytics-achados-fora-do-escopo.md):
`restorePurchaseHistory` sem evento (candidato a `purchase_restored`
futuro); confirmado que não há outro ponto de ciclo de vida de assinatura
nem outro fluxo de autenticação fora do escopo; `Blend`/`PantryScanner`
identificadas como telas de maior valor para rastrear no futuro; lint do
`apps/api` e `packages/shared` quebrado (sem config nenhuma).

---

## Correção dos achados 4 e 5 (a pedido do Gabriel, mesmo dia)

### Achado 4 — telas `Blend`/`PantryScanner` adicionadas ao listener

`TRACKED_SCREEN_NAMES` em `App.tsx` expandida de 5 para 7 rotas,
adicionando `Blend` e `PantryScanner` — formam funil direto com
`blend_completed`/`pantry_scan_completed` (Tarefa 5), revelando abandono
que antes era invisível (só a conclusão era rastreada).

### Achado 5 — lint quebrado em `apps/api` e `packages/shared`

Os dois workspaces tinham script `"lint": "eslint src --ext .ts"` mas
**nenhum arquivo de configuração do ESLint**. Criado `.eslintrc.js` em
ambos (parser `@typescript-eslint`, `eslint:recommended` +
`plugin:@typescript-eslint/recommended` — **sem** o tier
`recommended-requiring-type-checking`, que gerou 146 erros majoritariamente
em padrões já estabelecidos no código, como `any` legítimo nas bordas
Express/Mongoose e `it()`/`describe()` do `node:test`; corrigir isso seria
um refactor muito maior que o achado pedia).

Violações reais pré-existentes corrigidas (zero mudança de comportamento):
- `apps/api/src/services/pushNotification.service.ts` — `EXPO_ERROR_STATUS`
  usado só em posição de tipo (`typeof`), nunca em runtime; inline do
  literal no lugar da constante morta.
- `packages/shared/src/schemas/pantryScanner.ts` — `export interface
  PantryIngredient extends z.infer<...> {}` (interface vazia, flagada por
  `no-empty-object-type`) convertida para `export type PantryIngredient =
  z.infer<...>`, mesmo padrão já usado em todos os outros schemas do
  pacote.

**Descoberta ao validar:** com os dois workspaces limpos, `pnpm lint` da
raiz revelou que `apps/mobile` — que já tinha config própria funcionando —
tinha 7 erros reais + 1 warning pré-existentes, também corrigidos:
- `src/assets/index.ts` (causa raiz de 4 dos 7 erros): `require('...png')`
  sem tipo (`any`), propagando "unsafe assignment" para os 3 lugares que
  usam `images.swirl`/`images.blendiLogo` (`StreakBadge.tsx`,
  `PantryScannerScreen.tsx`, `PulseAIScreen.tsx`). Corrigido na raiz: criado
  `src/assets/images.d.ts` (`declare module '*.png'`, mesmo padrão de
  módulo ambiente de `src/locales/i18n.d.ts`) e troca de `require()` por
  `import` — Metro/Expo resolve os dois do mesmo jeito.
- `DeleteAccountSheet.tsx` (1 warning): estilo `submitError` declarado e
  nunca usado — confirmado que o erro do formulário é renderizado pela
  prop `error` do `AuthInput` (que tem estilo próprio); dead code genuíno,
  removido.

`pnpm lint` na raiz do monorepo passa limpo nos 3 workspaces linted
(`apps/api`, `apps/mobile`, `packages/shared`) por trás dessa correção.

---

## Bateria de testes e pentest (ao vivo, Atlas real)

Servidor local (`pnpm dev`) apontado para o mesmo `MONGODB_URI` de
produção. Usuário descartável criado via `/auth/register`
(`posthog-pentest-<timestamp>@blendi-test.invalid`), 14 cenários contra o
webhook real do RevenueCat, limpeza 100% reconciliada ao final (usuário
deletado, varredura em todas as collections confirmando zero
remanescentes, scripts de teste removidos do repo).

**Pentest de auth/validação (9/9 esperado):** path secret errado → 404;
`Authorization` errado → 401; JSON malformado → 400; schema inválido → 400;
`app_id` não aceito → 200 ignored; `event.type` não suportado → 200
ignored; usuário inexistente → 200 ignored; tentativa de injeção NoSQL em
`product_id` (`{"$ne": null}`) → 400 (zod fecha a superfície antes de
chegar no código); payload de 2MB (limite 1MB) → 413.

**Ciclo de vida real (4/4 esperado), verificado por leitura direta do
Mongo antes/depois:** CANCELLATION com `isPro:false` → early-return
confirmado no log; CANCELLATION com `isPro:true` →
`subscriptionCancelRequestedAt` gravado corretamente; EXPIRATION com
`expiration_at_ms` no passado → `isPro` virou `false`; RENEWAL → 500
tratado (ver achado crítico abaixo), servidor permaneceu no ar.

**Resiliência do `captureServerEvent`:** testado isoladamente com uma
chave PostHog real (porém inválida) tentando rede de verdade — retorno
síncrono em ~22ms, sem lançar, sem unhandled rejection, processo vivo
depois do flush assíncrono do SDK. Contrato "nunca falha o chamador"
confirmado sob falha de rede real, não só com chave vazia.

**Não testado:** `apps/mobile` não tem suíte de testes automatizados
configurada — validação do lado mobile ficou em typecheck + lint +
leitura de código.

---

## 🔴 Achado crítico (incidental, não relacionado a PostHog)

Ao pentestar o webhook, uma chamada RENEWAL retornou `500` em vez de `200`.
Investigação revelou que **não é bug de código** — é a `REVENUECAT_API_KEY`
configurada. Confirmado direto na API da RevenueCat, fora do backend:

```
curl -H "Authorization: Bearer sk_UVXNmKtqJyIOSaVhcTaEwcNdEwuPu" \
  https://api.revenuecat.com/v1/subscribers/test123
→ 403 {"code":7723,"message":"You're trying to use a secret API key incompatible with RevenueCat API V1."}
```

`apps/api/src/services/revenueCat.service.ts` usa
`https://api.revenuecat.com/v1` para os 2 únicos endpoints de servidor —
`getSubscriberCustomerInfo` (GET `/v1/subscribers/{id}`) e
`postReceiptAndGetActiveSubscription` (POST `/v1/receipts`) — com a mesma
autenticação. Com essa chave, **os dois estão quebrados**, não só um.
Impacto real:

- **Webhook** (`revenueCatWebhook.controller.ts`): `RENEWAL`/`INITIAL_PURCHASE`
  retornam `500` ao RevenueCat, que reenvia agressivamente e eventualmente
  desiste — a assinatura nunca sincroniza no banco local.
  `CANCELLATION` absorve o mesmo erro silenciosamente (`.catch()` que
  converte para `null`), sem sintoma visível, mas a pré-sincronização
  também nunca acontece.
- **`POST /purchases/verify`**: usado por `purchasePlan` (quando envia
  `receipt`) e por `restorePurchaseHistory` (sem `receipt`, cai em
  `getSubscriberCustomerInfo`) no app mobile.

**Não investigado mais a fundo** (fora do escopo deste checkpoint): se essa
é de fato a chave de produção (Railway) ou uma chave só deste `.env` local;
se o app mobile sempre envia `receipt` em `purchasePlan` (o que limitaria o
impacto real a `restorePurchaseHistory`); se existe uma chave
V1-compatível disponível no painel da RevenueCat. Reportado ao Gabriel com
prioridade crítica em 2026-11-01 — correção depende do painel da
RevenueCat, não do código.

### Resolução e re-teste ao vivo (mesmo dia)

Gabriel gerou uma `REVENUECAT_API_KEY` V1 nova no painel da RevenueCat.
Re-testei os dois pontos de consumo reais, direto na API da RevenueCat e
via webhook de ponta a ponta (usuário descartável real no Atlas, removido
depois, 0 órfãos em todas as collections):

- `GET /v1/subscribers/{id}` (`getSubscriberCustomerInfo`) → **200**, corpo
  correto. É o único caminho que `/purchases/verify` de fato usa hoje —
  confirmado por grep que `apps/mobile/src/services/purchase.service.ts`
  nunca envia `receipt` em `verifySubscriptionOnBackend`. Webhook: `CANCELLATION`/`EXPIRATION`
  → `200`, com a revogação por falta de assinatura ativa agora acionada
  pelo motivo genuíno (`RevenueCatInvalidPurchaseError`), não mais mascarada
  pelo erro de autenticação de antes. `INITIAL_PURCHASE`/`RENEWAL` ainda
  retornam `500` num teste sintético (usuário sem compra real registrada na
  RevenueCat), mas pelo motivo correto — em tráfego real a RevenueCat só
  dispara esses dois eventos quando já existe assinatura ativa do lado dela.
  Suíte 47/47 verde.
- `POST /v1/receipts` (`postReceiptAndGetActiveSubscription`) → **403**,
  `{"code":7243,"message":"Secret API keys should not be used in your app."}`.
  Diferente do achado original: não é mais um problema de chave inválida,
  é uma regra permanente da RevenueCat — esse endpoint só aceita a chave
  pública do SDK por plataforma (`appl_`/`goog_`), nunca uma secret/REST
  key. **Nenhuma troca de chave resolveria isso.**

**Ação:** como nenhum caller real jamais enviou `receipt` (confirmado por
grep em todo o monorepo), esse caminho era código morto desde sempre, não
só um bug de chave. A pedido do Gabriel, foi **excluído** em vez de
corrigido:
- `postReceiptAndGetActiveSubscription`, o tipo `RevenueCatPlatform` e o
  parâmetro `platform` de `getRevenueCatHeaders` (com o header `X-Platform`)
  removidos de `apps/api/src/services/revenueCat.service.ts`.
- O campo `receipt` e o `.superRefine` que o validava removidos de
  `verifyPurchaseSchema` em `apps/api/src/controllers/purchase.controller.ts`;
  `verifyPurchase` agora sempre resincroniza via `getSubscriberCustomerInfo`,
  sem branch condicional.
- `platform` e `productId` continuam aceitos no corpo da requisição (o
  mobile ainda os envia em todo `POST /purchases/verify`), mas agora não
  têm nenhum efeito no servidor — nenhuma lógica os lê mais. Deixados como
  estão por não fazerem parte do que foi pedido para excluir; ver nota em
  [`docs/api/endpoints.md`](../api/endpoints.md#post-purchasesverify).
- Typecheck, lint e suíte (47/47) confirmados limpos depois da exclusão.

**Conclusão:** achado crítico resolvido para 100% do tráfego real. O
segundo problema que ele escondia (`POST /receipts` irrecuperável com
secret key) não precisou de correção — só de remoção, por já ser
inalcançável.

---

## Status final

Typecheck limpo em `apps/mobile`, `apps/api` e `packages/shared`. `pnpm
lint` limpo nos 3 workspaces. Suíte de testes da API: 47/47 passando, sem
regressão. `EXPO_PUBLIC_POSTHOG_API_KEY` e `POSTHOG_API_KEY` seguem vazias
nos dois workspaces — nenhuma chave real do PostHog foi preenchida, por
decisão do checkpoint (o Gabriel cria a conta/projeto separadamente).
