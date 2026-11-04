# Sign in with Apple — backend, correção de achados e pentest (2026-11-03)

**Contexto:** backend do login nativo via Apple (`expo-apple-authentication`,
mobile — CP separada, só começa depois desta estar no ar). Diferente do
Google (browser + redirect), o app nativo recebe `identityToken` +
`authorizationCode` direto do SDK da Apple e manda os dois num único POST.
Portal da Apple já configurado (Key ID `4G334QJZGL`, Team ID `49SM6447X6`,
bundle id `com.blendi.pulse`).

Implementado em 5 tarefas, seguido de uma varredura de achados (11
encontrados, 7 corrigidos de imediato + 3 decididos pelo Gabriel), e uma
bateria de testes automatizados + pentest ao vivo.

---

## Tarefas 1-5 (implementação)

### Tarefa 1 — Campos novos no `User`

`appleUserId` e `appleRefreshToken` em
[`User.ts`](../../apps/api/src/models/User.ts), espelhando exatamente o
padrão do `googleId` existente (`String`, `required: false`, `select:
false`; `appleUserId` também `unique: true, sparse: true`).

### Tarefa 2 — `apple.service.ts`

[`apple.service.ts`](../../apps/api/src/services/apple.service.ts) com 4
funções: `verifyAppleIdentityToken` (jose `createRemoteJWKSet` +
`jwtVerify` contra `appleid.apple.com/auth/keys`, validando `iss`, `aud` e
expiração), `generateAppleClientSecret` (JWT ES256 assinado com a Key
privada, TTL de 5min), `exchangeAppleAuthorizationCode` (POST
`/auth/token`) e `revokeAppleRefreshToken` (POST `/auth/revoke`).

**Achado técnico (bloqueante, resolvido):** `jose` 6.x é um pacote
**ESM-only** (sem build CJS), enquanto `apps/api` compila para CommonJS. Um
`import ... from 'jose'` estático gera um `require('jose')` no JS
compilado, que falha em runtime com `ERR_REQUIRE_ESM`. Resolvido com
`import()` dinâmico cacheado (`loadJose()`) + `import type { CryptoKey }
from 'jose' with { 'resolution-mode': 'import' }` para os tipos. Validado
de verdade em dois ambientes: `tsx watch` (dev) e build `tsc` + `node`
puro (produção) — os dois funcionam.

### Tarefa 3 — `apple.controller.ts`

[`apple.controller.ts`](../../apps/api/src/controllers/apple.controller.ts),
`handleAppleSignIn`, replicando a estrutura de 3 casos de
`handleGoogleCallback` (login / vincular / criar), mas respondendo **JSON
direto** (nunca redirect, já que não há browser no fluxo nativo).
`appleSignInSchema` adicionado em `packages/shared/src/schemas/auth.ts`.

### Tarefa 4 — Rota

`POST /auth/apple` registrada em
[`routes/auth.ts`](../../apps/api/src/routes/auth.ts) com o mesmo
`authLoginLimiter` do `/auth/login`.

### Tarefa 5 — Revoke na exclusão de conta

`deleteAccount` ([`user.controller.ts`](../../apps/api/src/controllers/user.controller.ts))
busca `appleRefreshToken` (select: false) e chama `revokeAppleRefreshToken`
como melhor esforço — nunca bloqueia nem atrasa a exclusão.

### Variáveis de ambiente

`APPLE_TEAM_ID`, `APPLE_KEY_ID`, `APPLE_CLIENT_ID`, `APPLE_PRIVATE_KEY` em
`env.ts`/`.env`/`.env.example`. O valor real de `APPLE_PRIVATE_KEY` **não**
foi preenchido — fica como placeholder com a forma de PEM (ver achado #6
abaixo) até o Gabriel colar o conteúdo real do `.p8`, que só é necessário
quando o mobile (CP separada) estiver pronto para testar ponta a ponta.

---

## Varredura de achados (pós-implementação)

11 achados, pedidos como "seja preciso, busque erros e possíveis
problemas". Tabela de resolução:

| # | Achado | Resolução |
|---|---|---|
| 1 | `/auth/revoke` da Apple retorna 200 mesmo com `client_secret` inválido (confirmado ao vivo contra a API real — ver pentest) | **Documentado** (decisão do Gabriel) — comportamento da Apple, não corrigível do nosso lado |
| 2 | Comentário da rota dizia "IP+email", mas o body de `/auth/apple` não tem `email` — limite é só por IP | **Corrigido** |
| 3 | Comentário em `User.ts` citava `revokeAppleToken` (nome errado da função) | **Corrigido** |
| 4 | Campo `emailVerified` pedido pelo prompt nunca existiu no modelo `User` | **Corrigido** — campo adicionado |
| 5 | Zero log de erro em `apple.controller.ts` para falha de verify/exchange | **Corrigido** |
| 6 | `APPLE_PRIVATE_KEY` sem validação de formato no boot (só não-vazio) | **Corrigido** |
| 7 | `.select('+appleUserId')` desnecessário no Caso 1 (valor nunca lido) | **Corrigido** (removido) |
| 8 | Sem como testar `exchange`/`revoke` com credenciais genuinamente válidas (chave real + mobile não existem ainda) | **Documentado** (decisão do Gabriel) — ação futura, quando o mobile for implementado |
| 9 | Caso 2 sobrescrevia `appleUserId`/`googleId` silenciosamente se a conta já estivesse vinculada a uma Apple/Google ID diferente | **Corrigido** — nos dois (Apple e Google) |
| 10 | `claims.email` ausente no Caso 3 geraria `ValidationError` → 500 genérico | **Corrigido** |
| 11 | Leitura de `appleRefreshToken` em `deleteAccount` sem isolamento — falha bloquearia a exclusão pra todo usuário | **Corrigido** |

### Detalhe dos achados #4 e #9 (correção mais recente)

**#4 — `emailVerified`:** campo `Boolean` (default `false`) adicionado ao
`User` ([`User.ts`](../../apps/api/src/models/User.ts)), ao lado de
`email`. Salvo em `apple.controller.ts` (Caso 3) com o valor real do claim
Apple. **Decisão de escopo:** não retrofitado no fluxo do Google
(`register`/`google.controller.ts` continuam sem setá-lo) — só o que foi
pedido.

**#9 — proteção contra sobrescrita silenciosa:** em
`apple.controller.ts` (Caso 2) e `google.controller.ts` (Caso 2), antes de
vincular a conta, agora checa se `user.appleUserId`/`user.googleId` já
tinha um valor **diferente** do que está chegando. Se sim: Apple responde
`409 auth/apple-account-conflict` (JSON); Google redireciona com
`errors.auth.google_account_conflict` (mesmo padrão de deep link dos
outros erros desse fluxo). Em nenhum dos dois casos o vínculo antigo é
sobrescrito nem `.save()` é chamado.

**Achado de tipagem (Mongoose, resolvido):** ler `appleUserId`/`googleId`
pra checar o conflito exige `.select('+campo')` — mas a sobrecarga de
`.select(string)` do Mongoose **não propaga** `IUserMethods` no tipo de
retorno (limitação conhecida da biblioteca, não um bug nosso:
`comparePassword` existe de fato em runtime, só a inferência de tipo não
reflete isso pra essa sobrecarga específica). Resolvido com anotação
explícita `let user: UserDocument | null` + cast nas duas linhas afetadas,
nos dois controllers.

---

## Testes automatizados

[`apple.controller.test.ts`](../../apps/api/src/controllers/apple.controller.test.ts)
— 13 testes, mockando `UserModel`/`apple.service`/`auth.service`/`EmailService`
(mesmo padrão de `revenueCatWebhook.controller.test.ts`, sem MongoDB real):

- Validação: body vazio → `400`, sem tocar na Apple nem no banco.
- Falha de `verifyAppleIdentityToken`/`exchangeAppleAuthorizationCode` →
  `401 auth/apple-auth-failed`, sem tocar no banco.
- Caso 1 (login): atualiza `appleRefreshToken`, `isNewUser: false`.
- Caso 2 (vincular): email verificado + conta sem `appleUserId` → vincula.
- **Achado #9 (regressão):** conta já vinculada a OUTRA Apple ID → `409`,
  **não** sobrescreve nem salva.
- `email_verified: false` → não tenta buscar por email, cai direto no
  Caso 3.
- Caso 3 (criar): defaults corretos, `emailVerified` do claim salvo,
  welcome email disparado; sem `fullName` → fallback pela parte local do
  email.
- **Achado #10 (regressão):** `claims.email` ausente → `401` claro, **nunca**
  chama `UserModel.create`.
- Resposta de sucesso nunca inclui `appleRefreshToken`, `password` ou
  `appleUserId` (confirma que não há vazamento de campo sensível/interno).
- TOCTOU: duplicate key no create → recupera a conta já criada pela outra
  requisição (`isNewUser: false`); duplicate key **sem** conta recuperável
  → propaga o erro original pro `errorHandler` (`next`).

Suíte completa da API: **60/60 passando** (47 pré-existentes + 13 novos),
typecheck e lint limpos nos 3 workspaces afetados (`apps/api`,
`packages/shared`).

---

## Pentest ao vivo (servidor real + API real da Apple)

Servidor local (`tsx src/index.ts`) apontado pro mesmo `MONGODB_URI` de
produção (Atlas). Nenhuma das tentativas abaixo passou da etapa de
verificação — **zero dado criado no banco** durante toda a bateria
(confirmado por varredura direta no Atlas ao final, 0 usuários suspeitos).

### Forja de JWT (identityToken) — 6/6 bloqueados

| Ataque | Resultado | Motivo exato (log) |
|---|---|---|
| `alg: "none"` | 401 `auth/apple-auth-failed` | `JOSENotSupported: Unsupported "alg" value for a JSON Web Key Set` |
| `alg: "HS256"` (confusão de algoritmo — assinado com string arbitrária) | 401 | mesmo erro acima — HS256 não mapeia pra nenhum `kty` de um JWKS |
| `alg: "ES256"` com `kid` real da Apple, assinado com chave EC própria | 401 | `JWKSNoMatchingKey` (Apple hoje só serve chaves **RSA/RS256** — achado lateral: a suposição inicial de ES256 pro identityToken estava errada; corrigido no próprio pentest) |
| `alg: "RS256"` (algoritmo real da Apple) com `kid` real, assinado com chave RSA própria (forja de assinatura) | 401 | `ERR_JWS_SIGNATURE_VERIFICATION_FAILED` — o teste mais realista: header/kid corretos, só a assinatura é falsa |
| `aud` errado (`com.outro.app.diferente`) | 401 | mesmo `ERR_JWS_SIGNATURE_VERIFICATION_FAILED` — a assinatura falha **antes** da claim de `aud` ser checada (ver limitação abaixo) |
| `exp` no passado (token "expirado") | 401 | idem — mesma limitação |

### Injeção, payload e protocolo — 9/9 bloqueados

| Teste | Resultado |
|---|---|
| `identityToken: {"$ne": null}` | `400 validation/invalid-input` — Zod rejeita tipo (`Expected string, received object`) antes de qualquer query |
| `fullName: {"$gt": ""}` | `400` — mesmo motivo |
| Chave top-level `"$where": "..."` no body | Removida pelo `mongoSanitize` antes do Zod — requisição seguiu normalmente (falhou depois, na Apple, por token inválido — não por causa da chave injetada) |
| Payload de 60KB (limite 50KB) | `413 Payload Too Large` |
| JSON malformado | `400` (SyntaxError do body-parser) |
| `Content-Type: text/plain` | `400 validation/invalid-input` — parser de JSON nem roda, body vira vazio |
| `GET /auth/apple` | `404 resource/not-found` — rota só existe como POST |
| CRLF (`\r\n`) dentro de `authorizationCode` | Tratado como string literal comum, sem crash — `URLSearchParams` percent-encoda o valor antes de montar o body pra Apple, estruturalmente incapaz de injetar headers |
| Campos extras não esperados no body (`isAdmin: true`, `appleUserId: "forjado"`) | Ignorados — `appleUserId` real só vem do claim `sub` do token **verificado**, nunca do body; confirma que não há mass-assignment |

### Rate limiting — confirmado

11+ requisições malsucedidas seguidas do mesmo IP: a partir da 5ª (as
anteriores já tinham consumido parte do orçamento com os testes de JWT
acima, no mesmo IP/janela de 15min) todas retornaram `429
auth/too-many-requests` — confirma o limite de 10/15min por IP, cumulativo
entre tentativas de login legítimas e forjadas.

### Limitações do pentest (não testável sem a chave real/mobile)

- **Validação de `aud`/`iss`/`exp` isolada:** todo token forjado falha
  primeiro na verificação de **assinatura** (propriedade de segurança
  correta — sem a chave privada real da Apple, nenhum atacante externo
  passa dessa etapa). Não há como forjar um token com assinatura válida
  pra isolar e provar o comportamento específico do `audience`/`issuer`
  do `jwtVerify` nestes testes — essa validação depende inteiramente do
  comportamento padrão e já testado da própria `jose`, não de lógica
  própria do BLENDi.
- **`exchangeAppleAuthorizationCode`/`revokeAppleRefreshToken` com
  credenciais genuinamente válidas:** idem achado #8 — precisa da Key
  privada real + um `authorizationCode` de device real (mobile, CP
  separada). Testado e confirmado que a rede/formatação/parsing funcionam
  ponta a ponta contra os servidores reais da Apple (erros limpos como
  `invalid_grant`), mas a combinação "client_secret assinado pela Key
  certa + code genuíno" nunca foi exercitada.
- **Isolamento do try/catch de leitura em `deleteAccount` (achado #11):**
  verificado por code review + typecheck/lint/teste do padrão geral de
  melhor esforço (já provado ao vivo na Tarefa 5, com falha de parsing de
  PEM). Não forçei uma falha genuína de leitura no Mongo (exigiria
  derrubar a conexão em produção durante o teste).

---

## Status final

Typecheck e lint limpos em `apps/api` e `packages/shared`. Suíte de testes:
**60/60** (13 novos). Nenhum dado real/órfão deixado no Atlas. `.env` não
commitado (`APPLE_PRIVATE_KEY` com placeholder de forma válida, sem
quebrar o boot local). `.env.example` documentado com passo a passo.

**Pendências explícitas (decisão do Gabriel):**
- Achado #1 (resposta genérica de sucesso do `/auth/revoke` da Apple):
  aceito como limitação da API da Apple, sem ação de código.
- Achado #8 (chave privada real + teste ponta a ponta): só quando o
  mobile (CP separada) estiver implementado.
