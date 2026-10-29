# CP-AUDIT Achado 4 — `/auth/forgot-password` sem rate limit (email-bombing)

**Contexto:** achado nº 4 da "Lista priorizada de achados para CP próprio" em [`cp-audit-completo-backend-frontend-documentacao.md`](cp-audit-completo-backend-frontend-documentacao.md) (Tarefa 1.2): `authenticatedLimiter` ignora todo `/auth/*` (cada rota pública é responsável pelo próprio limitador), mas só `/auth/login` e `/auth/register` tinham limitador dedicado. `POST /auth/forgot-password` ficava sem nenhum teto de chamadas — um atacante podia disparar indefinidamente a geração de OTP + envio de e-mail de redefinição para o mesmo endereço (email-bombing), ou chamar o endpoint sem limite algum vindo de um único IP.

Uma chave composta IP+e-mail (o padrão já usado em `authLoginLimiter`) não resolve esse vetor: limita um par (IP, e-mail) específico, mas um atacante trocando de IP continuaria conseguindo mandar e-mails ilimitados para a MESMA vítima, porque cada IP novo abriria uma cota nova para aquele par. Proteger a caixa de entrada da vítima exige uma chave que seja só o e-mail de destino, independente de IP.

## TAREFA 1 — Dois limitadores novos em `rateLimiter.ts`

Adicionados em [`apps/api/src/middlewares/rateLimiter.ts:98-144`](../../apps/api/src/middlewares/rateLimiter.ts#L98-L144), na mesma seção de `authLoginLimiter`/`authRegisterLimiter`, seguindo exatamente o mesmo padrão de código (`rateLimit` do `express-rate-limit`, `standardHeaders`/`legacyHeaders`, `rateLimitHandler` já existente):

- **`forgotPasswordIpLimiter`** — 10 requisições / 60 min, chave só IP (`ipKeyGenerator`). Reaproveita o código `auth/too-many-requests` já usado por `authLoginLimiter`.
- **`forgotPasswordEmailLimiter`** — 3 requisições / 60 min, chave só o e-mail do body (trim + lowercase, mesma normalização que a parte de e-mail da chave composta de `authLoginLimiter` já faz), sem nenhuma composição com IP. Quando o body não trouxer um e-mail válido como string, cai no IP normalizado como fallback. Código de erro próprio: `auth/too-many-password-reset-requests`.

## TAREFA 2 — Aplicados em `POST /auth/forgot-password`

Em [`apps/api/src/routes/auth.ts:81-86`](../../apps/api/src/routes/auth.ts#L81-L86), os dois limitadores foram encadeados antes do controller, na mesma ordem/estilo em que `authLoginLimiter`/`authRegisterLimiter` já são usados em `/login`/`/register`. JSDoc da rota atualizado para documentar as duas cotas (🔒 10/60min por IP + 3/60min por e-mail).

Nenhuma alteração em `password.controller.ts`, `otp.service.ts` ou `email.service.ts` — a resposta 200 sempre idêntica (prevenção de enumeração de e-mail) continua intacta, já que os limitadores rodam antes do controller.

## Achado adicional corrigido na mesma sessão — `/auth/verify-otp` sem limite por IP

A tarefa final em aberto do checkpoint pedia para verificar se `/auth/verify-otp` já tinha proteção equivalente contra força bruta de OTP. **Tinha, mas só contra adivinhação de UM código específico**: `validateOtpRecord` (`otp.service.ts:182`) já limita a 5 tentativas por registro de OTP, incrementadas antes da verificação (evita race condition) e rejeitadas instantaneamente (sem custo de Argon2) após o limite — suficiente contra força bruta de um código de 6 dígitos (espaço de 10^6).

O que não existia era qualquer limite de volume por IP no endpoint: um atacante podia varrer MUITOS e-mails diferentes em alta velocidade, esgotando as 5 tentativas de cada um rapidamente e passando para o próximo. A pedido do usuário, esse vetor também foi corrigido:

- **`verifyOtpLimiter`** — 10 requisições / 15 min, só por IP (mesma janela/limite de `authLoginLimiter`), adicionado em [`rateLimiter.ts:146-169`](../../apps/api/src/middlewares/rateLimiter.ts#L146-L169), reaproveitando o código `auth/too-many-requests`.
- Aplicado em [`auth.ts:84-89`](../../apps/api/src/routes/auth.ts#L84-L89), JSDoc atualizado (🔒 10/15min por IP).

`otp.service.ts` e o limite de 5 tentativas por registro não foram alterados — essa camada continua sendo a defesa específica contra adivinhação de um código; o novo limitador cobre o vetor volumétrico de varredura entre e-mails.

## Testes reais

Executados ao vivo contra o servidor local (`tsx watch`, porta 3000, `NODE_ENV=development`), sem reiniciar o processo entre as mudanças (hot reload confirmado a cada edição pelo `RateLimit-Limit` retornado nos headers).

1. **`/auth/forgot-password` — caminho feliz.** 1ª chamada com e-mail/IP sem histórico recente → 200, resposta idêntica de sempre (`errors.auth.forgot_password_sent`).
2. **`/auth/forgot-password` — limite por e-mail.** 4 chamadas com o mesmo e-mail fictício (`test-ratelimit-A@example.com`, inexistente no banco — nenhum e-mail real enviado): chamadas 1-3 → 200; chamada 4 → 429 `auth/too-many-password-reset-requests`. Confirmado que o bloqueio independe do IP, porque a chave do limitador (ver código) não compõe com IP.
3. **`/auth/forgot-password` — limite por IP.** Mais 7 chamadas com e-mails fictícios distintos a partir do mesmo IP (acumulando 11 chamadas totais nesse IP, contando as do item 2): chamadas 5-10 (do total) → 200; chamada 11 → 429 `auth/too-many-requests`.
4. **`/auth/verify-otp` — limite por IP.** 11+ chamadas sequenciais do mesmo IP com e-mail inexistente + OTP inválido: as primeiras responderam `400 auth/otp-invalid` (comportamento normal); a partir de um certo ponto dentro da janela de 15 min, passaram a responder `429 auth/too-many-requests`. Headers confirmaram a config correta (`RateLimit-Limit: 10`, `RateLimit-Policy: 10;w=900`).
5. **Typecheck:** `pnpm typecheck` (monorepo: `@blendi/shared`, `@blendi/api`, `@blendi/mobile`) → limpo, sem erros novos, nas duas rodadas (depois da Tarefa 1/2 e depois do fix de `verify-otp`).
6. **Suíte automatizada existente da API** (`pnpm --filter api test`): 39/39 passando, sem regressão, nas duas rodadas.

Nenhuma conta real nem e-mail real foi afetado — todos os testes usaram e-mails fictícios de domínio `@example.com`, que o `UserModel.findOne` nunca encontra (o fluxo de envio de e-mail do `forgotPassword` é `fire-and-forget` só depois de confirmar que o usuário existe).

## Resumo

4 limitadores novos (`forgotPasswordIpLimiter`, `forgotPasswordEmailLimiter`, `verifyOtpLimiter`) em `apps/api/src/middlewares/rateLimiter.ts`, aplicados em `POST /auth/forgot-password` e `POST /auth/verify-otp` em `apps/api/src/routes/auth.ts`. Nenhuma alteração em `password.controller.ts`, `otp.service.ts`, `email.service.ts`, `packages/shared` ou `apps/mobile`. Testado ao vivo ponta a ponta (caminho feliz + os dois limites de `forgot-password` + o novo limite de `verify-otp`), typecheck limpo e suíte automatizada sem regressão nas duas rodadas.

**Resolve o achado nº 4 da lista priorizada do CP-AUDIT** (`cp-audit-completo-backend-frontend-documentacao.md`) e corrige, além do escopo original, a lacuna de rate limit por IP em `/auth/verify-otp` identificada na tarefa final em aberto do mesmo checkpoint.
