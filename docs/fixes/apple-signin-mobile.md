# Sign in with Apple (mobile) + botão Google em RegisterScreen (2026-11-04)

**Contexto:** lado mobile do login nativo via Apple — o backend
(`POST /auth/apple`) já estava implementado e testado antes desta CP (ver
[`apple-signin-backend.md`](apple-signin-backend.md)). Diferente do Google
(`expo-web-browser` + redirect), o SDK nativo (`expo-apple-authentication`)
entrega `identityToken` + `authorizationCode` direto no app, sem browser.

Escopo ampliado por decisão do Gabriel: o botão do Google, que hoje só
existia em `LoginScreen`, passa a existir também em `RegisterScreen`, ao
lado do novo botão da Apple — já que qualquer botão OAuth resulta em
login OU criação de conta automática no backend (mesmos três casos já
testados nas duas integrações).

Implementado em 6 tarefas.

---

## Tarefas 1-6 (implementação)

### Tarefa 1 — Instalação e configuração

`npx expo install expo-apple-authentication` (`~8.0.8`). Flag
`usesAppleSignIn: true` adicionada ao bloco `ios` já existente em
[`app.json`](../../apps/mobile/app.json) — confirmado que
`app.config.ts` não sobrescreve esse bloco (só altera `android`/`extra`).

### Tarefa 2 — `signInWithApple` em `auth.service.ts`

[`auth.service.ts`](../../apps/mobile/src/services/auth.service.ts): nova
função `signInWithApple(input: AppleSignInInput)` → `POST /auth/apple`,
mesmo estilo de `login`/`register` (sem lógica, sem tratamento de erro).

**Ajuste de tipo (não previsto no prompt):** `register`/`login` nunca
retornam `isNewUser` no corpo da resposta (cada endpoint só faz uma coisa
ou outra), mas `/auth/apple` retorna, porque o mesmo endpoint pode logar
OU criar conta. A interface `AuthResponse` existente não tinha esse campo
— criada `AppleSignInResponse` própria (`user`, `accessToken`,
`refreshToken`, `isNewUser`) em vez de reutilizar `AuthResponse`.

### Tarefa 3 — `useAppleAuth.ts`

[`useAppleAuth.ts`](../../apps/mobile/src/hooks/useAppleAuth.ts), espelhando
`useGoogleAuth.ts`. `AppleAuthentication.signInAsync` com scopes
`FULL_NAME`+`EMAIL`; `fullName` montado a partir de `givenName`+`familyName`
(cada parte tratada como opcional) só quando o credential trouxer o objeto
preenchido; cancelamento (`err.code === 'ERR_REQUEST_CANCELED'`) tratado em
silêncio (sem `setError`, sem `console.error`); qualquer outro erro vira
`errors.auth.apple_auth_failed`. Sucesso chama `_setSession` do
`auth.store` exatamente como o Google.

### Tarefa 4 — `AppleSignInButton.tsx`

[`AppleSignInButton.tsx`](../../apps/mobile/src/components/ui/AppleSignInButton.tsx)
usa o componente oficial `AppleAuthenticationButton` (tipo `CONTINUE`,
estilo `WHITE`, `cornerRadius: 14`, altura `52` — mesmas constantes do
`GoogleSignInButton`). Sem prop `disabled` nativa: resolvido com early
return no `onPress` durante `isLoading` + `View` externa com
`opacity: 0.92` (mesmo valor de "desabilitado" já usado em
`AuthButton.tsx`). Checagem de `isAvailableAsync()` guardada em estado
local; retorna `null` enquanto não resolver ou se vier `false`.

**Confirmado por leitura do código-fonte do pacote** (não assumido): em
qualquer plataforma sem o módulo nativo (Android, web), o pacote usa um
fallback puro em JS cujo `isAvailableAsync()` sempre resolve `false` — o
componente se esconde sozinho em qualquer plataforma não-iOS, sem precisar
de um `Platform.OS === 'ios'` explícito e sem risco de crash.

### Tarefa 5 — Telas

**`LoginScreen.tsx`:** botão da Apple adicionado acima do `GoogleSignInButton`
já existente, dentro do mesmo bloco do divisor "ou". Erro estendido de
`formError || googleError` para incluir `appleError`. Novo
`handleAppleSignIn` espelha `handleGoogleSignIn`.

**Decisão de implementação (mais rígida que o texto, mesma intenção):** o
prompt pedia "limpar os outros erros antes de disparar o fluxo" só para o
botão do Google; estendi a mesma limpeza cruzada para os dois botões —
`handleGoogleSignIn` agora também limpa `appleError`, e `handleAppleSignIn`
limpa `googleError` — assim nenhum erro de um provedor fica visível
enquanto o outro está em andamento.

**`RegisterScreen.tsx`:** sequência divisor "ou" → `AppleSignInButton` →
`GoogleSignInButton` adicionada ao final do bloco de campos (depois de
confirmar senha), dentro do `topContent`. `handleGoogleSignIn`/
`handleAppleSignIn` novos, limpando os erros do formulário manual
(`formError` + todos os `fieldErrors`) antes de disparar o OAuth. Erro OAuth
exibido reaproveitando o mesmo `Text`/estilo `formError` que já existia em
`bottomContent` (sem criar um segundo bloco de erro em outro lugar da tela).
Validação, campos e `AuthProgressDots` do formulário manual não foram
tocados.

### Tarefa 6 — Traduções

`auth.apple_sign_in` ("Continue with Apple" / "Continuar com Apple") e
`errors.auth.apple_auth_failed` adicionados em
[`en.json`](../../apps/mobile/src/locales/en.json) e
[`pt-BR.json`](../../apps/mobile/src/locales/pt-BR.json), ao lado das
chaves equivalentes do Google. A tipagem de `i18next`
([`i18n.d.ts`](../../apps/mobile/src/locales/i18n.d.ts)) é inferida
diretamente de `en.json` (`typeof en`) — nenhum arquivo de tipos precisou
ser tocado à mão.

**Nota:** `auth.apple_sign_in` acabou sem nenhum uso em código. O botão
oficial da Apple (`AppleAuthenticationButton`, tipo `CONTINUE`) já
localiza o próprio texto sozinho via sistema operacional — diferente do
Google, cujo botão é customizado e precisa da string via `t()`. A chave foi
criada do mesmo jeito, por paridade com o pedido explícito do prompt e para
uso futuro (ex.: `accessibilityLabel`), mas hoje é só `errors.auth.apple_auth_failed`
que é efetivamente lido em runtime.

---

## Validação

Typecheck e lint de `apps/mobile` limpos (nenhum erro novo) depois de cada
tarefa e no final do escopo completo. Suíte de testes existente
(`jest`, 8/8) sem regressão — não há teste automatizado cobrindo os hooks
OAuth, já que o código é nativo (ver limitação abaixo).

---

## Testes e pentest (2026-11-04)

O painel nativo real da Apple não é testável neste ambiente (ver seção de
limitação abaixo) — o pentest foi direcionado ao que de fato é testável
sem device/EAS: a lógica do hook (mockando `expo-apple-authentication`,
`auth.service` e `auth.store`) e revisão estática de segurança do código
desta CP (vazamento de dados sensíveis em log, confiança indevida em dados
do cliente, race conditions).

### Testes automatizados novos

**[`auth.service.test.ts`](../../apps/mobile/src/services/auth.service.test.ts)**
(3 testes) — `signInWithApple`: body enviado ao backend é exatamente o
recebido (sem campo extra, sem perda de campo); `fullName` indefinido nunca
sobrevive à serialização JSON (confirma a promessa "não manda o campo" no
nível do wire, não só no objeto JS); erro do axios é propagado sem
mascarar.

**[`useAppleAuth.test.tsx`](../../apps/mobile/src/hooks/useAppleAuth.test.tsx)**
(8 testes, via `react-test-renderer` + `act` — primeiro teste de hook React
deste repo, sem `@testing-library/react-native`): cancelamento silencioso;
sucesso chama `_setSession` com os dados corretos; `fullName` montado a
partir de `givenName`+`familyName` (com e sem as duas partes); `fullName`
omitido no wire quando `credential.fullName` vem nulo; **dois testes de
segurança** (abaixo); erro inesperado cai no catch externo.

**Dependência nova:** `react-test-renderer` (devDependency, pinada em
`19.1.0` — mesma versão do `react` do projeto; já resolvida no store pnpm
do monorepo via `jest-expo`/`react-native`, **zero download novo**).
Não tem `@types/react-test-renderer` resolvível nesta versão — criada
declaração ambiente mínima em
[`src/types/react-test-renderer.d.ts`](../../apps/mobile/src/types/react-test-renderer.d.ts)
cobrindo só `act`/`create` (mesmo padrão de `src/assets/images.d.ts`).

Suíte completa de `apps/mobile`: **19/19** (8 pré-existentes + 11 novos).
Typecheck e lint limpos.

### Achados de segurança (confirmados com teste, corrigidos)

Os dois testes abaixo foram escritos para **provar** a falha antes de
corrigi-la (escritos, executados, confirmada a falha real, só então
corrigido o código-fonte — não foi assumido, foi demonstrado):

1. **`identityToken`/`authorizationCode` ausentes → `credential` completo
   ia pro `console.error`.** Se só UM dos dois campos estivesse ausente
   (ex: `authorizationCode` presente, `identityToken` nulo — caso teórico,
   nunca visto na prática, mas o código não impedia), o outro campo real e
   válido aparecia em texto puro no log. **Corrigido:** o log agora manda só
   `{ hasIdentityToken: boolean, hasAuthorizationCode: boolean }`, nunca o
   `credential` inteiro.
2. **Falha ao chamar o backend → `err` (do axios) ia direto pro
   `console.error`.** Um `AxiosError` carrega `err.config.data` — o body
   serializado da requisição que falhou, ou seja, o `identityToken` e o
   `authorizationCode` reais que acabaram de ser enviados. **Corrigido:** o
   log agora extrai só `err.message`, nunca o objeto de erro inteiro.

**Por que isso importa mesmo sem Sentry/crash-reporting configurado hoje:**
o `ErrorBoundary.tsx` já comenta que a integração está prevista para o
futuro. Sem essa correção, no dia em que alguém configurar Sentry (ou
qualquer sink que capture `console.error`), esses dois logs passariam a
vazar credenciais Apple reais de usuários pra um serviço terceiro
automaticamente, sem ninguém precisar tocar neste arquivo de novo.

**Teste de regressão:** os dois testes de segurança falharam antes da
correção (confirmado rodando a suíte antes de tocar no código) e passam
depois — não é uma alegação, é demonstrável reexecutando o teste contra o
código anterior.

### Achado relacionado, fora do escopo desta CP (documentado e corrigido por decisão do Gabriel)

**`useGoogleAuth.ts` (pré-existente, não tocado pela implementação desta
CP — tocado só para esta correção pontual) tinha exatamente a mesma classe
de vulnerabilidade, num ponto potencialmente mais grave:**

```ts
// src/hooks/useGoogleAuth.ts, linha 115 (antes da correção)
if (!accessToken || !refreshToken || !userBase64) {
  console.error('[useGoogleAuth] Params obrigatórios ausentes no deep link:', result.url);
  ...
```

Se só `userBase64` estivesse ausente, `result.url` (logado por completo)
podia conter um `accessToken`/`refreshToken` **reais e válidos** — nossos
próprios tokens de sessão (mais sensíveis que `identityToken`/
`authorizationCode` da Apple, já que esses dão acesso direto à conta).
Mesma causa raiz do achado #1/#2 acima.

Documentado primeiro como fora do escopo (a implementação original desta
CP não tocou em `useGoogleAuth.ts`, e o prompt pediu para não alterar o
fluxo do Google). **Corrigido sob decisão explícita do Gabriel** ("pode
corrigir esse achado do google também"): o log agora manda só
`{ hasAccessToken: boolean, hasRefreshToken: boolean, hasUserBase64: boolean }`,
nunca `result.url`. Mesmo rigor de prova dos achados #1/#2: escrito
[`useGoogleAuth.test.tsx`](../../apps/mobile/src/hooks/useGoogleAuth.test.tsx)
reproduzindo o cenário (accessToken/refreshToken reais presentes,
userBase64 ausente) — confirmado que o teste falha contra o código
anterior (`git stash` + reexecução) e passa depois da correção. Suíte
completa: **20/20** (19 anteriores + 1 novo).

### Observação de baixa severidade (informativa, não é vulnerabilidade)

`AppleSignInButton` não tem uma prop `disabled` nativa (o componente
oficial da Apple não oferece isso) — o bloqueio de toque duplo é só a
checagem `if (isLoading) return` em JS, mais fraca que o `disabled` nativo
do `TouchableOpacity` do `GoogleSignInButton`. Dois toques rápidos antes do
primeiro `setIsLoading(true)` re-renderizar poderiam, em teoria, disparar
duas chamadas concorrentes a `signInAsync`. Na prática: é exatamente a
implementação pedida pelo prompt ("ignorar toques recebidos... early
return"), e qualquer corrida resultante no backend já é resolvida pela
proteção de TOCTOU/chave duplicada testada ao vivo no
[CP do backend](apple-signin-backend.md) — nenhuma consequência de
segurança ou de dado duplicado. Não é um achado, é uma observação.

---

## Achados fora do escopo explícito (corrigidos após decisão do Gabriel)

Documentados primeiro (não corrigidos sem avisar), depois corrigidos sob
decisão explícita do Gabriel ("implemente as duas correções"):

1. **Assimetria de limpeza de erro OAuth entre as duas telas:** em
   `LoginScreen`, trocar o texto do e-mail/senha também limpa
   `googleError`/`appleError` (`handleChangeEmail`/`handleChangePassword`
   chamam `clearGoogleError()`+`clearAppleError()`). Em `RegisterScreen`,
   os handlers equivalentes (`handleNameChange`, `handleEmailChange`,
   `handlePasswordChange`, `handleConfirmPasswordChange`) não faziam o
   mesmo — só zeravam `formError`/`fieldErrors` do próprio campo.
   **Corrigido:** os quatro handlers agora também chamam
   `clearGoogleError()`+`clearAppleError()`, junto com o `setFormError(null)`
   que já existia em cada um — mesmo padrão de `LoginScreen`.
2. **`AppleSignInButton` não usava a chave de tradução `auth.apple_sign_in`:**
   a chave existia no arquivo de traduções (conforme pedido na Tarefa 6) mas
   não era lida por nenhum componente, já que o botão oficial da Apple
   localiza o próprio texto sozinho. **Corrigido:** adicionado
   `accessibilityLabel={t('auth.apple_sign_in')}` ao
   `AppleAuthenticationButton` dentro de `AppleSignInButton.tsx` — mesma
   paridade de acessibilidade que o `GoogleSignInButton` já tinha
   (`accessibilityLabel={t('auth.google_sign_in')}`), sem alterar nada
   visual.

Typecheck, lint e a suíte de testes existente (`jest`, 8/8) seguem limpos
depois das duas correções.

---

## Limitação de validação (não é um achado — é esperado)

**Todo o fluxo de Sign in with Apple é código nativo
(`expo-apple-authentication`) e não roda no Expo Go.** O painel nativo da
Apple, o `AppleAuthenticationButton` oficial e o próprio
`AppleAuthentication.isAvailableAsync()` exigem um binário com o módulo
nativo compilado — ou seja, só é testável ponta a ponta (telas → hook →
serviço → `POST /auth/apple` → criação/login real de conta) num **build de
desenvolvimento** ou **build completo via EAS** rodando em iOS real (ou
Simulator com conta Apple configurada). A validação ficou limitada a:
typecheck, lint, leitura do código-fonte do pacote nativo (para confirmar
o fallback cross-platform), a suíte de testes pré-existente e os 11 testes
novos (que testam a lógica do hook com o SDK mockado — não o painel nativo
real). **Nenhuma parte deste fluxo foi exercitada de ponta a ponta contra
um dispositivo real** — isso só pode ser feito pelo Gabriel (ou numa CP
dedicada) depois de um build EAS/dev client.

---

## Status final

6 tarefas implementadas + os 2 achados fora do escopo (telas) corrigidos +
3 achados de segurança confirmados por teste e corrigidos (log de dados
sensíveis em `useAppleAuth.ts` e, por decisão do Gabriel, o mesmo problema
em `useGoogleAuth.ts`). Typecheck e lint de `apps/mobile` limpos. Suíte de
testes: **20/20** (8 pré-existentes + 12 novos). Nenhuma regressão no
fluxo de login/registro por email/senha nem no restante do fluxo do Google
já existente em `LoginScreen`. Arquivos tocados/criados:

- `apps/mobile/app.json`, `apps/mobile/package.json`
- `apps/mobile/src/services/auth.service.ts`
- `apps/mobile/src/services/auth.service.test.ts` (novo)
- `apps/mobile/src/hooks/useAppleAuth.ts` (novo)
- `apps/mobile/src/hooks/useAppleAuth.test.tsx` (novo)
- `apps/mobile/src/hooks/useGoogleAuth.ts` (achado de segurança corrigido, fora do escopo original)
- `apps/mobile/src/hooks/useGoogleAuth.test.tsx` (novo)
- `apps/mobile/src/types/react-test-renderer.d.ts` (novo)
- `apps/mobile/src/components/ui/AppleSignInButton.tsx` (novo)
- `apps/mobile/src/components/ui/index.ts`
- `apps/mobile/src/screens/auth/LoginScreen.tsx`
- `apps/mobile/src/screens/auth/RegisterScreen.tsx`
- `apps/mobile/src/locales/en.json`, `apps/mobile/src/locales/pt-BR.json`

**Pendência explícita:** validação ponta a ponta num build de
desenvolvimento ou EAS real no iOS (ver seção de limitação acima).
