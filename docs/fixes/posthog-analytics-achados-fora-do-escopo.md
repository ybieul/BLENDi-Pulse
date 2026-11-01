# PostHog Analytics (Fix Before Launch #4) — achados fora do escopo (Tarefa 7)

**Contexto:** checkpoint de instrumentação do PostHog (sign-up, onboarding,
paywall, compras, blends, mensagens de IA, scans de despensa + 3 eventos de
ciclo de vida de assinatura no backend) — 4º e último item de "Fix Before
Launch" do feature brief do Jon (outubro/2026). Implementado em 6 tarefas
(SDK/init, identify/reset, sign_up, listener de navegação, eventos de ação
no mobile, ciclo de vida no backend). Este documento cobre só a Tarefa 7 —
achados relevantes encontrados no caminho, **sem nenhuma correção**,
conforme pedido.

---

## 1 — `restorePurchaseHistory` (mobile) não dispara nenhum evento

`purchasePlan` e `restorePurchaseHistory`
([purchase.service.ts](../../apps/mobile/src/services/purchase.service.ts))
chamam o mesmo endpoint do backend (`POST /purchases/verify`, em
[purchase.controller.ts](../../apps/api/src/controllers/purchase.controller.ts):120-193),
que grava `isPro: true` e os campos de assinatura — o mesmo efeito de um
`INITIAL_PURCHASE` do webhook. A Tarefa 5 deste checkpoint só instrumentou
`purchasePlan` com `purchase_completed`, por pedido explícito do brief.
`restorePurchaseHistory` (acionado pelo botão "Restaurar compras", comum em
reinstalação/troca de dispositivo) fica, portanto, **sem nenhum evento** —
nem de sucesso nem de falha. Não é um bug: o brief não pediu isso. Mas é um
ponto de dados que o Jon pode querer no futuro (ex.: taxa de recuperação de
assinatura em reinstalação), com um evento como `purchase_restored` análogo
ao `purchase_completed` já existente.

## 2 — Nenhum outro ponto de ciclo de vida de assinatura no backend

Revisão de todo `apps/api/src/controllers`, `apps/api/src/services` e
`apps/api/src/jobs` por grep de `isPro`, `subscriptionExpiresAt` e
`revenueCatCustomerId`: os únicos pontos que **escrevem** esses campos são
os 3 já instrumentados no webhook (`handleInitialPurchaseOrRenewal`,
`markCancellationRequested`, `revokeExpiredSubscription`) e o endpoint de
verificação de compra (`purchase.controller.ts`, achado 1 acima, que não
precisa de evento de servidor porque o app já cobre a mesma ação). Os
demais usos de `isPro: false` encontrados em `pulseAi.controller.ts` e
`pantryScanner.controller.ts` são **filtros de query** (condição do
`findOneAndUpdate`/`updateOne`), não escritas — não mudam o estado da
assinatura. O mesmo vale para `isPro: true` em
`notifications.jobs.ts:runWeeklyReportJob` (filtro de elegibilidade para
geração do relatório semanal, não uma escrita). Nenhum ponto adicional de
ciclo de vida de assinatura ficou de fora.

## 3 — Nenhum outro fluxo de autenticação existe hoje

Revisão de `apps/api/src/routes/auth.ts`: as únicas rotas de criação de
sessão são `/auth/register` (email) e `/auth/google/url` +
`/auth/google/callback` (Google OAuth) — exatamente os dois métodos já
cobertos pelo `sign_up` da Tarefa 3. Não existe Sign in with Apple, nem
fluxo de cadastro via OTP/telefone, nem qualquer criação de conta
administrativa. `/auth/forgot-password`, `/auth/verify-otp` e
`/auth/reset-password` são o fluxo de redefinição de senha — não criam
conta nova e corretamente não disparam `sign_up`. Nada fora do escopo aqui.

## 4 — Telas fora da lista de 5 que podem fazer sentido no futuro — **CORRIGIDO (2026-11-01)**

A Tarefa 4 instrumentou exatamente as 4 telas de onboarding + `Upgrade`,
por pedido explícito do brief (evitar ruído). Das candidatas identificadas
aqui, o Gabriel pediu para adicionar as duas de maior valor — formam um
funil direto com eventos de ação já implementados na Tarefa 5, que sem
`screen_viewed` da tela só mostravam a conclusão, nunca o abandono:

- **`Blend`** — tela onde a mistura é de fato preparada; pareado com
  `blend_completed` revela taxa de abandono entre abrir a tela e concluir
  o blend.
- **`PantryScanner`** — tela da câmera do scanner; pareado com
  `pantry_scan_completed` revela abandono do scan (ex.: usuário abre a
  câmera mas não chega a enviar a foto).

Adicionadas a `TRACKED_SCREEN_NAMES` em `App.tsx` (agora 7 rotas, não mais
5). Menções honrosas que **permanecem fora**, como sinal geral de
reengajamento sem funil de ação associado: `WeeklyReport`,
`ConversationHistory` e `Favorites` — não implementadas, decisão de
produto em aberto.

## 5 — Achado geral (não relacionado a analytics): lint do `apps/api` estava quebrado — **CORRIGIDO (2026-11-01)**

Encontrado ao validar lint das Tarefas 5-6 deste checkpoint: `apps/api` tinha
`"lint": "eslint src --ext .ts"` no `package.json`, mas **nenhum arquivo de
configuração do ESLint** no workspace. Confirmado pré-existente, não era
regressão do checkpoint.

**Correção aplicada:** criado `apps/api/.eslintrc.js` (parser
`@typescript-eslint`, `eslint:recommended` +
`plugin:@typescript-eslint/recommended`, sem o tier
`recommended-requiring-type-checking` — esse tier type-aware gerou 146
erros, majoritariamente `no-unsafe-*`/`no-floating-promises` em padrões já
estabelecidos no código, como `any` legítimo nas bordas do Express/Mongoose
e `it()`/`describe()` do `node:test`; corrigir isso seria um refactor muito
maior que o escopo deste achado). `@typescript-eslint/eslint-plugin` e
`@typescript-eslint/parser` instalados como devDependencies, nas mesmas
versões já usadas por `apps/mobile`. Resultado: 1 violação real
pré-existente (`EXPO_ERROR_STATUS` em
`pushNotification.service.ts`, usada só em posição de tipo, nunca em
runtime) — corrigida inline, sem mudar lógica. `pnpm --filter @blendi/api
lint` agora passa limpo; suíte de testes (47/47) e typecheck continuam sem
regressão.

**Descoberta ao validar a correção:** `packages/shared` tinha **o mesmo
problema exato** (script de lint sem nenhuma config) — bloqueava o
`pnpm lint` da raiz mesmo depois do `apps/api` corrigido. Também corrigido
com a mesma config mínima; 1 violação real pré-existente
(`no-empty-object-type` em `schemas/pantryScanner.ts`: `export interface
PantryIngredient extends z.infer<...> {}` — convertido para `export type
PantryIngredient = z.infer<...>`, mesmo padrão já usado em todos os outros
schemas do pacote). `pnpm --filter @blendi/shared lint` agora passa limpo.

**Achado novo, CORRIGIDO (2026-11-01):** com `apps/api` e `packages/shared`
limpos, o `pnpm lint` da raiz revelou que `apps/mobile` — que já tinha
config própria funcionando — estava com 7 erros reais + 1 warning
pré-existentes, em arquivos não tocados neste checkpoint. A pedido do
Gabriel, corrigidos:

- **`src/assets/index.ts` (4 erros: 2× `no-unsafe-assignment` + 2×
  `no-require-imports`):** `require('...png')` não tem tipo (`any`) sem
  uma declaração de módulo ambiente — e esse `any` se propagava para os 3
  outros erros abaixo, em todo lugar que usava `images.swirl`/
  `images.blendiLogo`. Criado `src/assets/images.d.ts` (`declare module
  '*.png'`, mesmo padrão de módulo ambiente já usado em `src/locales/
  i18n.d.ts`) e trocado `require()` por `import` — Metro/Expo resolve os
  dois do mesmo jeito, comportamento idêntico, agora com tipo (`number`)
  em vez de `any`.
- **`StreakBadge.tsx:144`, `PantryScannerScreen.tsx:741`,
  `PulseAIScreen.tsx:203` (3 erros, mesma causa):** `source={images.swirl}`
  / `source={images.blendiLogo}` — resolvidos automaticamente pela
  correção acima, sem tocar nesses 3 arquivos.
- **`DeleteAccountSheet.tsx:199` (1 warning):** estilo `submitError`
  declarado mas nunca usado — confirmado que o erro do formulário é
  renderizado via a prop `error` do `AuthInput` (que tem estilo próprio),
  não por um `<Text style={styles.submitError}>` esquecido. Dead code
  genuíno, removido.

`pnpm lint` da raiz agora passa limpo nos 3 workspaces (`apps/api`,
`apps/mobile`, `packages/shared`). Typecheck e suíte de testes (47/47)
sem regressão.

---

## Status

Investigação da Tarefa 7 concluída (2026-11-01), sem correção por design.
Posteriormente, a pedido do Gabriel, os achados 4 e 5 foram corrigidos (ver
seções acima) — typecheck limpo em `apps/mobile`/`apps/api`, suíte de
testes da API sem regressão (47/47), `pnpm lint` limpo em `apps/api` e
`packages/shared`. Achados 1, 2 e 3 permanecem sem correção, por decisão
de produto em aberto. O lint pré-existente de `apps/mobile` (achado novo
na seção 5) também foi corrigido a pedido do Gabriel — `pnpm lint` da
raiz está limpo nos 3 workspaces.
