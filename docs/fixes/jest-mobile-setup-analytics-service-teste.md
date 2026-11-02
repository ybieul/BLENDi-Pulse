# Jest no apps/mobile — infraestrutura + teste de analytics.service.ts (2026-11-02)

**Contexto:** `apps/mobile` não tinha nenhuma suíte de testes automatizados —
toda validação histórica, inclusive a do checkpoint que instrumentou a
PostHog no mobile ([posthog-analytics.md](posthog-analytics.md)), dependeu só
de typecheck + lint + leitura de código. Com a PostHog já configurada com a
chave real de produção, o próximo passo natural era validar a integração de
analytics do lado mobile de verdade — o que exigia primeiro resolver a
lacuna de infraestrutura de testes.

Implementado em 2 tarefas (Jest configurado + teste real de
`analytics.service.ts`), seguidas de uma Tarefa 3 só de documentação
(candidatos futuros, sem implementação).

---

## Tarefa 1 — Jest instalado e configurado

- `jest-expo` e `jest` instalados via `npx expo install jest-expo jest`
  (resolve a versão compatível com o Expo SDK ~54 automaticamente: `jest
  ~29.7.0`, `jest-expo ~54.0.18`). `@types/jest` adicionado via `pnpm add -D`
  — por padrão veio na major `^30`, desalinhada com o `jest` 29 instalado;
  fixado em `^29` pra bater com a major real do test runner.
- `apps/mobile/jest.config.js` (arquivo separado, consistente com
  `babel.config.js`/`app.config.ts` já existentes no workspace, em vez de
  bloco `"jest"` no `package.json`): `preset: 'jest-expo'` +
  `moduleNameMapper` pro alias `@/*` → `<rootDir>/src/$1`.
- `@blendi/shared` resolve normalmente nos testes sem mapeamento manual
  (pacote real do workspace pnpm, diferente do alias virtual `@/*`).
- Script `"test": "jest"` adicionado ao `package.json` do mobile.
- **Achado de infra:** o TypeScript não reconhecia os globals do Jest
  (`describe`, `it`, `expect`, `jest`, `beforeEach`) em arquivos `.test.ts` —
  precisou adicionar `"jest"` ao array `compilerOptions.types` do
  `tsconfig.json` do mobile. Mudança generaliza pra qualquer teste futuro,
  não é específica do `analytics.service.test.ts`. Interessante: não foi
  necessário configurar `env: { jest: true }` nem instalar
  `eslint-plugin-jest` — o `@typescript-eslint/parser` já resolve esses
  globals via o `tsconfig.json` atualizado (confirmado rodando `eslint`
  isolado no arquivo de teste, sem erros).

## Tarefa 2 — Teste de analytics.service.ts (mobile)

`apps/mobile/src/services/analytics.service.test.ts`, ao lado do arquivo
testado (mesma convenção do `apps/api`). Mocka `posthog-react-native`
inteiro (client real nunca instanciado) e `getPostHogApiKey()` de
`analytics.config.ts`. 8 testes, espelhando o padrão de resiliência já
confirmado no backend
([analytics.service.test.ts](../../apps/api/src/services/analytics.service.test.ts)):

- Chave vazia (`getPostHogApiKey()` retorna `null`): `initializeAnalytics()`
  não cria client; `identifyAnalyticsUser`/`resetAnalyticsUser`/`trackEvent`
  não lançam erro e não chamam nenhum método do client mockado.
- Chave válida: `initializeAnalytics()` cria o client; uma segunda chamada
  não cria um segundo client (guard de idempotência confirmado).
- `identifyAnalyticsUser(userId)` chama `client.identify(userId)`;
  `resetAnalyticsUser()` chama `client.reset()`; `trackEvent(eventName,
  properties)` chama `client.capture(eventName, properties)` — todos com os
  argumentos certos.
- Se o client mockado lança erro em `identify`/`reset`/`capture`, a função
  correspondente não propaga o erro pro chamador.

**Achados técnicos:**

- `jest.mock()` só permite referenciar variáveis externas cujo nome comece
  com `mock` (case-insensitive) — proteção do Babel contra mocks não
  inicializados. O mock do construtor do `PostHog` teve que se chamar
  `mockPostHogConstructor`, não algo como `PostHogConstructorMock` (erro
  `ReferenceError: The module factory of jest.mock() is not allowed to
  reference any out-of-scope variables`).
- `analytics.service.ts` guarda o `client` como singleton de módulo — sem
  isolar isso, o estado vazaria entre testes (ex.: o teste de "chave vazia"
  passaria ou falharia dependendo da ordem de execução). Resolvido com
  `jest.resetModules()` + `require()` dinâmico a cada teste, mantendo as
  referências de mock (`mockIdentify`, `mockReset`, `mockCapture`,
  `mockPostHogConstructor`) estáveis entre os `resetModules()` por estarem
  declaradas fora da factory do `jest.mock()`.

`pnpm --filter @blendi/mobile test` passa 8/8, determinístico (confirmado
rodando 2× seguidas). `pnpm typecheck` e `pnpm lint` limpos nos 3
workspaces. Suíte do `apps/api` sem regressão (47/47).

## Tarefa 3 — Candidatos pra próxima rodada (só documentação, sem implementação)

- **`purchase.service.ts`** — precisaria de mock de `react-native-purchases`.
- **Os pontos de `identify`/`reset` em `auth.store.ts`** — arquivo maior e
  mais interligado; precisaria de mock de MMKV e SecureStore também.
- **O listener de navegação (`screen_viewed`) em `App.tsx`** — precisaria
  montar a árvore de navegação real; candidato natural a usar
  `@testing-library/react-native` quando for feito.
- **E2E (Detox ou Maestro)** — lembrete explícito de pendência, não
  implementado nesta rodada nem na próxima. Faz sentido considerar antes do
  lançamento (simulador ou dispositivo real, fluxos completos de tela,
  incluindo validar `screen_viewed` contra navegação real). Só registrado
  como pendência — sem estimativa nem comparação entre as duas ferramentas.

---

## Status

Checkpoint concluído (2026-11-02). Tarefas 1 e 2 implementadas e validadas
(`pnpm --filter @blendi/mobile test` 8/8 determinístico, typecheck/lint
limpos nos 3 workspaces, `apps/api` sem regressão). Tarefa 3 é só
documentação dos candidatos futuros — nenhum deles implementado.
