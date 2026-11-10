# CP-1.1.1d — Login do Google com código de uso único, webhook de renovação, teto das listas, scan do Pantry e lacunas da dieta

Cinco achados de backend das verificações dos CPs anteriores, mais o ajuste mínimo de mobile que o login do Google exige. O app ainda não está nas lojas, então o caminho antigo (tokens no deep link) foi removido sem compatibilidade.

## Resumo

| # | Achado | Situação |
|---|---|---|
| 1 | Tokens e usuário inteiro no deep link do Google; URL com tokens em `console.error` | Corrigido: deep link só com código de uso único + verificador (PKCE S256) |
| 2 | Webhook: compra/renovação sem tratamento de erro (500 e sem `subscription_renewed`) | Corrigido: 503 para erro temporário (RevenueCat reenvia), 200 ignorado para erro permanente |
| 3 | Lista gigante de itens inválidos gera um issue por item | Corrigido em favoritos (ingredientes, passos), lista de compras e suplementos |
| 4 | Pantry consome scan e dá XP quando a IA não entrega receita | Corrigido: scan devolvido, sem XP e sem missão; resposta igual |
| 5 | Validador: proteína em pó genérica (vegan) e granola (nut_free) passavam | Corrigido, com mensagem de retry específica |

Verificação: typecheck nos 3 workspaces, lint, API **471/471**, mobile **479/479** (25 suítes). Teste ao vivo: **20/20** no Google, webhook nos dois casos, limpeza com 0 sobras.

---

## Tarefa 1 — Login do Google com código de uso único

### Fluxo novo

1. O app gera o **verificador** (32 bytes do CSPRNG nativo, base64url, 43 caracteres) e o **desafio** = `base64url(SHA-256(verificador))`. O verificador é uma variável local do `signInWithGoogle`: nunca vai para log, storage ou analytics.
2. `GET /auth/google/url?codeChallenge=<desafio>`. O desafio é obrigatório e validado (43 caracteres `[A-Za-z0-9_-]`); sem ele, 400. O state assinado passa de `{ csrf: true }` para `{ csrf: true, codeChallenge }` (só isso mudou no state).
3. O callback resolve o usuário **sem nenhuma mudança** na lógica de criação, vínculo, corrida e conflito (CP-AUDIT.4). No lugar de gerar tokens, cria um código de uso único (32 bytes, base64url), guarda só o SHA-256 dele na coleção nova `googleauthcodes` (ligado ao usuário, ao desafio do state e ao `isNewUser`, validade de 2 minutos com TTL no banco, como o OTP) e redireciona para `blendipulse://auth/callback?code=...`. Os redirects de erro continuam iguais. Um state sem desafio (emitido antes desta versão) vira `invalid_state`.
4. O app chama `POST /auth/google/exchange` com `{ code, codeVerifier }`:
   - acha o código pelo hash e o consome com `findOneAndDelete` (atômico, uso único mesmo que a checagem falhe depois);
   - confere a validade (o TTL do Mongo tem atraso de até ~60s) e compara `SHA-256(verificador)` com o desafio guardado com `crypto.timingSafeEqual`;
   - sucesso: `{ user, accessToken, refreshToken, isNewUser }` — formato do login por e-mail mais `isNewUser` (como o Apple), com o usuário pelo serializador do `GET /users/me`;
   - qualquer falha (corpo inválido, código inexistente, usado, expirado, verificador errado, usuário apagado): **o mesmo** `401 auth/google-exchange-failed`;
   - rate limit: `authLoginLimiter` (10 falhas/15 min por IP; trocas com sucesso não contam).
5. O app segue com o mesmo `_setSession` de antes, com `isNewUser` (o `sign_up` do PostHog continua igual).

### Arquivos

- **Backend**: [google.controller.ts](../../apps/api/src/controllers/google.controller.ts) (URL com desafio, passo 6 do callback, handler `exchangeGoogleCode`), [googleAuthCode.service.ts](../../apps/api/src/services/googleAuthCode.service.ts) (novo: criar/consumir o código), [GoogleAuthCode.ts](../../apps/api/src/models/GoogleAuthCode.ts) (novo modelo, TTL), [routes/auth.ts](../../apps/api/src/routes/auth.ts) (rota nova), [userProfile.utils.ts](../../apps/api/src/utils/userProfile.utils.ts) (novo).
- **Serializador do getMe**: o objeto `user` do `GET /users/me` era montado inline no `user.controller.ts`. Foi extraído para `serializeUserProfile` (com os normalizadores de notificação e Daily Pulse), e o getMe passou a usá-lo. A lista de campos é idêntica (conferida por diff e por teste ao vivo: o usuário do exchange é byte a byte igual ao do `GET /users/me`, 43 campos).
- **Shared**: [schemas/auth.ts](../../packages/shared/src/schemas/auth.ts) — `googleAuthUrlQuerySchema`, `googleExchangeSchema` e os padrões de formato.
- **Mobile**: [useGoogleAuth.ts](../../apps/mobile/src/hooks/useGoogleAuth.ts), [pkce.utils.ts](../../apps/mobile/src/utils/pkce.utils.ts) (novo), [auth.service.ts](../../apps/mobile/src/services/auth.service.ts) (`getGoogleAuthUrl(codeChallenge)`, `exchangeGoogleCode`). O tipo e o mapeamento do usuário do getMe (`preferredLanguage` → `locale`) saíram do `auth.store.ts` para o `auth.service.ts` (`mapCurrentUserProfile`), e o exchange usa o mesmo mapeamento.

### Decisões

- **SHA-256 (não Argon2) para o código**: o código tem 256 bits aleatórios, então força bruta offline não é viável, e o hash determinístico é o que permite achar e consumir o registro de forma atômica pelo índice único. O OTP usa Argon2 porque tem só 10⁶ combinações.
- **Validade de 2 minutos**: tempo de o browser fechar e o app fazer a troca, que acontece logo em seguida.
- **Corpo inválido também dá o erro genérico** (e não o 400 de validação padrão), para nenhuma falha do exchange ser distinguível.
- **Usuário lido de novo na troca** (e não guardado no código) para devolver o estado atual completo.
- **Exclusão em cascata**: `GoogleAuthCodeModel.deleteMany({ userId })` entrou na transação do `DELETE /users/me`. Mesmo vivendo ~2 minutos, um código pendente ficaria ligado a uma conta apagada (o exchange já recusaria, porque o usuário não existe, mas não deve sobrar documento). Confirmado ao vivo: o código pendente foi apagado junto.
- **Dependência**: nenhuma nova. O `expo-crypto ~15.0.9` (versão do Expo SDK 54) já estava instalado e é usado no boot do app (`config/storage.ts`, chave do MMKV), então já roda em todo ambiente em que o app abre, inclusive o Expo Go. Uso `getRandomBytesAsync` e `digestStringAsync` com `CryptoEncoding.BASE64`, convertido para base64url.
- **Logs**: o `console.error` que registrava a URL inteira do deep link foi trocado por um log com só o nome do erro. Todos os logs do hook passaram a registrar no máximo `errorName` e flags booleanas (inclusive a falha ao pedir a URL e a falha da troca: o objeto de erro do Axios carrega a config da requisição, com o código e o verificador no corpo).
- **Analytics**: o PostHog do app usa o cliente sem `PostHogProvider` nem `captureAppLifecycleEvents`, então não registra URLs de deep link. Nenhum evento novo leva código ou verificador.
- **i18n**: nenhum texto novo no app — toda falha do exchange usa a chave existente `errors.auth.google_auth_failed`.

---

## Tarefa 2 — Webhook de compra e renovação

### Como os outros eventos decidem

- `CANCELLATION`: engole os 3 erros da RevenueCat e segue com os dados do próprio evento → sempre 2xx.
- `EXPIRATION`: se a sincronização falha (compra inválida ou erro HTTP) **e** o evento sozinho basta para agir (expiração já passou), revoga com os dados do evento → 2xx. Senão, relança → 500 → a RevenueCat reenvia.

Ou seja: 2xx quando a resposta não muda com reenvio (ou dá para agir com o evento); fora de 2xx quando um reenvio pode dar certo.

### O que mudou

`handleInitialPurchaseOrRenewal` passa a devolver `'synced' | 'invalid-purchase' | 'retry'`:

| Erro | Classe | Resposta | `subscription_renewed` |
|---|---|---|---|
| Nenhum | — | 200 `processed` | Sim (só `RENEWAL`) |
| `RevenueCatInvalidPurchaseError` (a RevenueCat respondeu, mas sem assinatura ativa de produto conhecido) | Permanente | 200 `ignored` | Não |
| `RevenueCatRequestError` (qualquer HTTP fora de 2xx da API), falha de rede/timeout do `fetch`, configuração ausente, erro do banco | Temporário | **503** `webhooks/subscription-sync-unavailable` | Não nesta tentativa |

**Por quê:**

- **Temporário → 503**: a RevenueCat reenvia com backoff; a renovação é aplicada na tentativa que der certo. Não usei os dados do evento como fallback (como o `EXPIRATION` faz) porque aqui seria **conceder** Pro sem confirmar com a API — o projeto sempre confirma concessões na RevenueCat (`/purchases/verify` também). Revogar com dados do evento é seguro; conceder, não.
- **Falha de rede não é `RevenueCatRequestError`**: `getSubscriberCustomerInfo` não embrulha o erro do `fetch` (TypeError/TimeoutError). Por isso o critério é "tudo que não é compra inválida é temporário", e não "só `RevenueCatRequestError`". Não mexi no service para não mudar o comportamento de `CANCELLATION`/`EXPIRATION`.
- **Evento só no sucesso**: disparar `subscription_renewed` na tentativa que falhou duplicaria o evento quando o reenvio desse certo. Disparar no erro permanente contaria uma renovação que não aconteceu no nosso banco.
- **Log**: só `userId`, `eventId`, `eventType`, `errorName` e `statusCode` — a mensagem do erro pode trazer texto da API externa.

`CANCELLATION` e `EXPIRATION` não foram tocados.

---

## Tarefa 3 — Teto antes da validação item a item

Auditei todos os `safeParse(req.body)` da API e os schemas do `packages/shared`. Listas que recebem dado do usuário:

| Schema | Lista | Antes | Depois |
|---|---|---|---|
| `updateUserSchema` | `dietaryPreferences` | já corrigido no CP-1.1.1a | — (referência) |
| `createFavoriteSchema` | `ingredients` | sem teto | **30**, checado antes dos itens |
| `createFavoriteSchema` | `steps` | sem teto | **20**, checado antes dos itens |
| `updateItemsSchema` (lista de compras) | raiz | `.max(100)` depois do array | 100, checado antes |
| `updateSupplementStackSchema` | raiz | `.max(20)` depois do array | 20, checado antes |

Padrão aplicado: `z.array(z.unknown()).max(N).pipe(z.array(itemSchema))`. O `.pipe` só valida os itens se o tamanho passou. Mensagens de erro, `required_error`/`invalid_type_error` e o tipo inferido (`z.infer`) continuam os mesmos.

**Tetos novos**: o favorito é sempre uma receita do Pulse AI ou do Pantry, que hoje trazem 3 a 8 ingredientes e 3 a 5 passos (o prompt pede 3–5 passos). 30 e 20 dão folga de ~4x.

**Fora**: `pantryScanner` (ingredientes/receitas) e `pulseAiRecipeSchema` só validam resposta da IA. `aliases` do webhook vem da RevenueCat, autenticado e com corpo limitado a 1 MB. Nenhum dos demais schemas de entrada tem lista.

Prova: 4000 itens inválidos agora geram **1** issue e uma resposta de menos de 300 bytes em cada schema. Rodando o mesmo teste contra os schemas antigos, 5 dos 10 casos falham.

---

## Tarefa 4 — Pantry: scan devolvido quando não há receita

Quando a geração falha ou volta vazia, [pantryScanner.controller.ts](../../apps/api/src/controllers/pantryScanner.controller.ts) chama `rollbackPantryScanCount`, não chama `awardXP` e não avança a missão `scanPantry`. A resposta continua `200` com as mesmas chaves (`ingredients`, `recipes: []`, `scansUsed`, `scansLimit`, `resetDate`, `noFoodDetected`, `xpAwarded`, `leveledUp`, `newLevel`). Só os valores mudam: `scansUsed` volta ao valor de antes do scan, `xpAwarded: 0`, `leveledUp: false`, `newLevel: null`.

A missão também deixou de avançar. O scan foi devolvido, então contar a missão daria progresso por um scan que não conta.

**Visão que falha antes da geração**: já não consome scan. O incremento só acontece depois da visão (falha do provedor → 503 `scanner/vision-unavailable`; resposta ilegível → 500 `scanner/vision-parse-error`; nada de comida ou nenhum ingrediente usável → 200 sem incremento).

**Como o mobile mostra hoje (sem mudança)**: com `recipes: []`, o app vai normalmente para a etapa de ingredientes; ao tocar em gerar receitas, mostra "Receitas Para Você" com o subtítulo "com base em…", **nenhum card** e só o botão "Escanear de novo". Não aparece mensagem explicando que não houve receita nem que o scan foi devolvido (o contador de scans restantes é atualizado com o valor novo). Fica como sugestão para um CP de mobile: um estado vazio com a mensagem.

---

## Tarefa 5 — Lacunas do validador de dieta

Em [recipeRestrictions.utils.ts](../../apps/api/src/utils/recipeRestrictions.utils.ts):

- **vegan**: `protein powder`, `protein isolate`, `proteína em pó`, `pó de proteína` e `proteína isolada` são violação, a não ser que tenham qualificador de origem vegetal: `plant`, `plant-based`, `vegan(o/a)`, `vegetal`, `pea`/`ervilha`, `soy`/`soja`, `rice`/`arroz`. Incluí também `hemp`/`cânhamo` (proteína vegetal comum). O qualificador vale até 2 palavras antes ("vegan vanilla protein powder") ou logo depois ("proteína em pó de ervilha", "proteína em pó vegetal"), e a busca para trás pára em conjunção, para "soy milk and protein powder" não liberar a proteína. "Proteína de ervilha em pó" e "pea protein" nunca casaram com o termo e continuam passando.
- **nut_free**: `granola` é violação, a não ser que o nome diga que não tem castanhas: "nut-free granola", "tree-nut-free granola", "granola (nut-free)", "granola without nuts", "granola sem castanhas/oleaginosas/nozes", "granola livre de castanhas".
- **Retry**: quando a violação é uma dessas, a mensagem ganha uma orientação a mais: para vegan, que a proteína em pó precisa dizer a origem vegetal no nome (com exemplos); para nut_free, que a granola comum costuma ter castanhas e deve ser removida ou nomeada como sem castanhas.

**Mudança de expectativa em 2 testes antigos**: `'Peanut-free granola'` e `'Granola sem amendoim'` estavam na tabela como permitidos. Eram a lacuna documentada: "sem amendoim" não diz nada sobre as castanhas. Agora são violação. "Granola sem castanhas" continua permitida.

Nada além dessas duas lacunas mudou no validador. Proteína em pó genérica não barra `dairy_free` nem `nut_free`, e granola não barra `vegan` nem `dairy_free` (testado).

---

## Tarefa 6 — Testes e verificação

### Testes novos ou atualizados

| Arquivo | Casos |
|---|---|
| [google.controller.test.ts](../../apps/api/src/controllers/google.controller.test.ts) (novo, 25) | URL sem desafio e com 5 formatos inválidos → 400; state com `{ csrf, codeChallenge }`; callback só com `code` na URL (sem tokens, usuário, `isNewUser` nem e-mail), só o hash guardado, validade ~2 min; conta nova guarda `isNewUser: true`; state sem desafio → `invalid_state`; redirects de erro iguais; exchange válido devolve tokens e o usuário exatamente como `serializeUserProfile`; inexistente, verificador errado, expirado, reaproveitado, usuário apagado e 5 corpos inválidos → mesmo erro; verificador errado queima o código; as falhas são indistinguíveis |
| [useGoogleAuth.test.tsx](../../apps/mobile/src/hooks/useGoogleAuth.test.tsx) (reescrito, 11) | verificador de 43 caracteres e desafio = SHA-256 dele; desafio na URL e verificador na troca; verificador novo a cada login; `isNewUser` true/false segue para o `_setSession`; erro do deep link; deep link sem código; cancelamento; URL ilegível não registra URL nem código; falha da troca não registra código, verificador nem corpo; fluxo inteiro sem segredo em log; falha ao pedir a URL registra só o nome |
| [auth.service.test.ts](../../apps/mobile/src/services/auth.service.test.ts) (+2) | desafio como query param; exchange manda só `code` e `codeVerifier` e converte `preferredLanguage` → `locale` |
| [revenueCatWebhook.controller.test.ts](../../apps/api/src/controllers/revenueCatWebhook.controller.test.ts) (+12) | `RENEWAL` e `INITIAL_PURCHASE` × (HTTP 503, HTTP 429, rede, timeout) → `retry` sem gravar nem evento; compra inválida → `invalid-purchase`; falha e depois reenvio com sucesso → um único `subscription_renewed`; log sem a mensagem da API externa |
| [listSchemaCaps.test.ts](../../apps/api/src/utils/listSchemaCaps.test.ts) (novo, 10) | 4000 itens inválidos → 1 issue e menos de 300 bytes em cada schema; limites exatos (30/20, 100, 20); itens dentro do teto continuam validados, com o caminho do item |
| [pantryScanner.controller.test.ts](../../apps/api/src/controllers/pantryScanner.controller.test.ts) (+3) | geração vazia e falha da IA: mesmas chaves na resposta, `scansUsed` devolvido, sem XP e sem missão; com receita: sem regressão |
| [recipeRestrictions.utils.test.ts](../../apps/api/src/utils/recipeRestrictions.utils.test.ts) (+~50) | casos da Tarefa 5 nas duas línguas, passos, outras dietas, mensagem de retry |

### Resultado

```
pnpm typecheck                 shared, api, mobile: Done
pnpm lint                      shared, api, mobile: Done
pnpm --filter @blendi/api test     471 pass, 0 fail (44 suítes)
pnpm --filter @blendi/mobile test  479 pass, 0 fail (25 suítes)
```

### Teste ao vivo (API local + Atlas, banco `test`, alvo confirmado pelo Gabriel)

Roteiro descartável no scratchpad (fora do repo). O código de uso único foi criado chamando direto o `createGoogleAuthCode` real, sem passar pelo Google. Conta `cp111d-google-<timestamp>@test.blendi.local`.

**Google (20/20):**

| Caso | Resultado |
|---|---|
| `GET /auth/google/url` sem desafio / malformado | 400 / 400 |
| Com desafio | 200, URL do `accounts.google.com`, state com `codeChallenge, csrf, exp, iat` |
| Callback com state antigo (sem desafio) | 302 `?error=errors.auth.invalid_state` |
| Callback cancelado | 302 `?error=errors.auth.google_cancelled` (igual a antes) |
| Banco | só o hash do código; índice TTL `expiresAt` com `expireAfterSeconds: 0` |
| Exchange com código inexistente | 401 genérico |
| Verificador errado | 401 genérico |
| Mesmo código depois, com o verificador **certo** | 401 genérico (queimado) |
| Código expirado (antes do TTL apagar) | 401 genérico |
| Código + verificador certos | 200, tokens, `isNewUser: true` |
| Access token devolvido em `GET /users/me` | 200; usuário do exchange idêntico ao do `/users/me` (43 campos) |
| Mesmo código reaproveitado depois do sucesso | 401 genérico |
| As 5 falhas | status e corpo idênticos: `401 {"success":false,"code":"auth/google-exchange-failed","message":"Google sign-in could not be completed. Please try again."}` |

**Webhook (`RENEWAL` sintético, mesmo padrão do CP-POSTHOG-VALIDACAO, para a conta descartável sem compra na RevenueCat):**

| Cenário | Antes | Agora |
|---|---|---|
| Permanente: chave real, a RevenueCat responde sem assinatura ativa | 500 | **200** `{"ignored":true,"reason":"No active subscription found on RevenueCat for this event."}` — `isPro` continua `false` |
| Temporário: API reiniciada com `REVENUECAT_API_KEY` inválida só na linha de comando (`.env` intacto) → RevenueCat 401 | 500 | **503** `webhooks/subscription-sync-unavailable` — log com `errorName: RevenueCatRequestError, statusCode: 401`; `isPro` continua `false` |

**Limpeza**: `DELETE /users/me` → 200 com um código pendente criado de propósito; varredura em todas as coleções → **0** documentos da conta (inclusive `googleauthcodes`) e **0** contas `cp111d-*`. API encerrada. Varredura dos logs do servidor das duas execuções: nenhum token, `Bearer`, JWT (`eyJ`), `code=` ou `codeVerifier`.

---

## Teste manual do login real com o Google (precisa do Gabriel no celular)

Pré-requisitos:

- **Backend com este CP no ar onde o app aponta.** O `EXPO_PUBLIC_API_URL` do mobile é a produção (Railway), e o `GOOGLE_REDIRECT_URI` cadastrado no Google Cloud precisa ser o callback desse mesmo backend. Versões desencontradas falham: o app novo contra o backend antigo recebe tokens no deep link em vez de `code` e mostra "Falha ao entrar com Google. Tente novamente."; o app antigo contra o backend novo leva 400 ao pedir a URL (sem desafio). Os dois precisam subir juntos.
- **Um build com o esquema `blendipulse`** (dev build ou EAS preview) — igual ao teste de Google anterior. O Expo Go não registra `blendipulse://` no Android, então o retorno do browser não volta para ele (isso já era assim antes deste CP). O `expo-crypto` não é problema em nenhum ambiente: ele já roda no boot do app.

Passos:

1. **Conta nova**: com um Google que nunca entrou no BLENDi, tocar em "Continuar com Google" no login → escolher a conta → o browser fecha sozinho → o app abre o **onboarding** (prova que `isNewUser: true` chegou). Conferir no PostHog que saiu um `sign_up` com `method: google`.
2. **Conta existente**: sair (Me → Sair), entrar de novo com o mesmo Google → o app vai direto para a Home, **sem** onboarding e sem novo `sign_up`.
3. **Vínculo**: com um Google cujo e-mail já tem conta criada por e-mail/senha → entra na mesma conta (mesmos dados e histórico).
4. **Cancelar**: tocar em "Continuar com Google" e fechar o browser sem escolher conta → volta para o login sem mensagem de erro.
5. **Perfil completo**: depois do passo 2, abrir o Me e conferir nome, foto, modelo do BLENDi, dieta e metas — vêm do usuário completo do exchange.
6. **Logs do Railway** durante os passos: não deve aparecer nenhum token, código nem verificador (em produção o request logger fica desligado; os únicos logs do fluxo são de erro, e nenhum deles inclui esses valores).
7. **Opcional (prova do uso único)**: no Railway, contar os documentos da coleção `googleauthcodes` logo depois do login → **0** (consumido na troca; um código esquecido some sozinho em ~2 minutos pelo TTL).

Se o passo 1 ou 2 falhar com "Falha ao entrar com Google. Tente novamente.", o log do app (Metro) mostra só qual passo falhou (`Falha ao obter URL…`, `Código ausente no deep link`, `Falha ao trocar o código…`), com o nome do erro.

---

## Achados fora do escopo (não corrigidos)

- **Pantry sem receita no mobile**: a etapa de receitas aparece vazia, sem mensagem (ver Tarefa 4).
- **Favoritos sem limite de tamanho nos textos**: `ingredients[].name`, `ingredients[].amount`, `steps[].text`, `blendInstruction` e `tip` do `createFavoriteSchema` não têm `.max()` de caracteres (só `recipeName` tem 100). O teto do corpo (50 KB) limita o total, mas um favorito pode guardar strings bem maiores que qualquer receita real. Fica para um CP de favoritos.
- **`GET /auth/google/url` sem rate limit**: não grava nada no banco (só assina um JWT), então o risco é baixo. Não mexi porque o prompt pediu limite só no exchange.
