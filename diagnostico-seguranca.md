# Diagnóstico de Segurança — Pré-lançamento

**Data de início:** 2026-09-02
**Escopo:** Armazenamento de tokens no mobile, rate limiting, IDOR, injeção NoSQL, headers HTTP, dados sensíveis em logs/erros, gestão de secrets, segurança da coleção `user_photos`, e achados fora do escopo original.
**Método:** leitura de código + **testes ativos de exploração** contra o servidor local de desenvolvimento (payloads reais, documentados para reprodução). Nenhuma alteração de código foi feita durante este diagnóstico. Nenhum dado malicioso foi deixado persistido — cada teste de injeção/IDOR é limpo logo após a verificação.

> Por instrução explícita do usuário, este diagnóstico vai além das 9 tarefas do prompt original: qualquer problema de segurança adicional encontrado durante a investigação (dependências vulneráveis, CORS, endpoints sem auth, mass assignment, etc.) é documentado na Tarefa 9 com o mesmo rigor, mesmo sem teste ativo pedido explicitamente.

---

## Sumário executivo

| Severidade | Qtde | Descrição |
|---|---|---|
| 🔴 Crítica | 0 | Nenhum achado com exploração imediata confirmada permitindo acesso a dados de outro usuário ou comprometimento do servidor — os 7 testes cruzados de IDOR (Tarefa 3) e os 5 testes de injeção NoSQL (Tarefa 4) não produziram nenhum vazamento |
| 🟠 Alta | 7 | Vetor de ataque real, requer algum esforço/precondição para explorar |
| 🟡 Média | 10 | Risco real, mas com pré-condições que reduzem probabilidade |
| 🟢 Baixa | 7 | Melhoria de postura, sem risco imediato |
| ✅ Correto | 27 | Comportamento verificado e confirmado correto — documentado para evitar retrabalho futuro |

Os 7 achados de Alta severidade se concentram em duas causas raiz:
1. **Ausência total de rate limiting de infraestrutura** (Tarefa 2) — afeta login, registro e qualquer endpoint autenticado simultaneamente, e amplifica o achado de storage fraco (Tarefa 1) ao não conter tentativas de força bruta contra tokens/senhas.
2. **Mecanismos de proteção com "modo de falha inseguro" silencioso** — o fallback do refresh token para MMKV sem criptografia (Tarefa 1) e o log de OTP condicionado a uma comparação frágil de `NODE_ENV` (Tarefa 6) são ambos exemplos do mesmo padrão: a proteção correta existe no caminho feliz, mas degrada para um estado inseguro sem alarme quando esse caminho falha ou é mal configurado.

Zero achados de severidade Crítica não significa zero risco — a ausência de rate limiting (Alta) combinada com a ausência de revogação de sessão (Tarefa 9, Média) forma uma cadeia de risco composto que se aproxima de impacto crítico em cenários de token roubado, mesmo que nenhum passo individual isolado cruze a barra de "Crítica" tal como definida neste diagnóstico.

---

## Registro de dados de teste criados — limpeza executada

Todos os usuários de teste usaram o domínio `@blendi-test.dev`, permitindo limpeza determinística ao final da sessão.

| Origem | Dado | Status |
|---|---|---|
| Tarefa 2 | 15 usuários `mass-reg-<ts>-{1..15}@blendi-test.dev` criados via teste de registro em massa | ✅ Removido |
| Tarefa 2 | ~5 gerações reais do Pulse AI (1 sucesso, resto falhas por quota do Gemini) associadas ao usuário `mass-reg-...-1@blendi-test.dev` — `XPLog`/`Conversation` associados | ✅ Removido (o consumo real de quota da API do Google, obviamente, não é reversível — só o dado no MongoDB) |
| Tarefa 3 (1ª rodada, descartada por erro de payload) | Usuários `idor-usera-1788360087965@blendi-test.dev` / `idor-userb-1788360088943@blendi-test.dev` + shopping list + item + foto de perfil (UserA) | ✅ Removido |
| Tarefa 3 (2ª rodada, válida) | Usuários `idor-usera-1788360251498@blendi-test.dev` / `idor-userb-1788360252260@blendi-test.dev` + shopping list + item + 2 blend logs + foto de perfil (UserA) | ✅ Removido |
| Tarefa 4 | Usuário `injection-test-1788360806384@blendi-test.dev` + 1 shopping list vazia | ✅ Removido |
| Tarefa 4 | Usuário `injection-tz-...@blendi-test.dev`, sem dados adicionais | ✅ Removido |
| Tarefa 5 | Usuário `headers-test-...@blendi-test.dev`, sem dados adicionais | ✅ Removido |
| Tarefa 8 | Usuário `photo-injection-...@blendi-test.dev` + 1 documento em `user_photos` contendo o SVG malicioso com `<script>` embutido | ✅ Removido — era o único dado de teste com conteúdo potencialmente perigoso, priorizado na limpeza |
| Tarefa 9 | Usuário `dos-test-...@blendi-test.dev`, sem dados adicionais | ✅ Removido |

**Método de limpeza:** script temporário (`apps/api/scripts/__security-audit-cleanup.ts`, criado, executado via `tsx` e **apagado logo em seguida** — não ficou no repositório) que conectou ao MongoDB Atlas via a própria config do backend (`connectDatabase()`), localizou todos os usuários com e-mail terminando em `@blendi-test.dev`, e removeu em cascata os documentos relacionados em `ShoppingList`, `BlendLog`, `Conversation`, `UserPhoto`, `XPLog`, `DailyMission` e `Otp`, antes de remover os próprios usuários.

**Resultado da execução (verificado, não estimado):**
```
Encontrados 24 usuarios de teste (@blendi-test.dev)
Documentos removidos por colecao: {
  "shoppingLists": 3,
  "blendLogs": 2,
  "conversations": 3,
  "userPhotos": 3,
  "xpLogs": 4,
  "dailyMissions": 3,
  "otps": 0,
  "users": 24
}
Usuarios de teste remanescentes apos limpeza: 0
```

O número de `conversations` (3) e `dailyMissions` (3) removidos é maior do que o rastreado manualmente ao longo do diagnóstico — confirma que algumas gerações do Pulse AI e progresso de missão diária ocorreram como efeito colateral dos testes sem que eu tivesse capturado o ID explicitamente (ex: a missão diária "usar o Pulse AI" sendo marcada como completa nos testes da Tarefa 2/3). Nenhum desses documentos remanescentes representa risco — todos vinculados a `userId`s que foram removidos na mesma operação, e a base de teste (`test`, MongoDB Atlas M0) não tem usuários reais.

**Servidor local:** o processo `npm run dev` iniciado para os testes ativos (PID monitorado durante a sessão) foi finalizado ao término do diagnóstico.

---

## Tarefa 1 — Armazenamento de tokens no mobile

Arquivos lidos: `apps/mobile/src/store/auth.store.ts` (integral), `apps/mobile/src/config/storage.ts` (integral), `apps/mobile/src/config/queryClient.ts`, `apps/mobile/src/config/cache.config.ts`, `apps/mobile/src/components/profile/ProfilePhoto.tsx`, `apps/mobile/package.json`. Grep recursivo por `createAppStorage`/`new MMKV(` e por `encryptionKey` em todo `apps/mobile/src`.

### Mecanismo de armazenamento confirmado

- **Access token JWT:** só em memória, no store Zustand (`accessToken` em `auth.store.ts:278`). Nunca escrito em disco — comentário no topo do arquivo confirma a decisão de design e o código bate com o comentário.
- **Refresh token:** primariamente em `expo-secure-store` (`SecureStore.setItemAsync`/`getItemAsync`/`deleteItemAsync`, `auth.store.ts:180-210`), com `keychainAccessible: AFTER_FIRST_UNLOCK` — usa Keychain (iOS) / Keystore (Android), criptografia nativa da plataforma. Design correto e documentado.
- **`expo-secure-store` está instalado** (`^55.0.13`) e é usado **exclusivamente** para o refresh token — nenhum outro dado passa por ele.
- **`react-native-mmkv` está instalado** (`^3.2.0`) via um único helper `createAppStorage(namespace)` (`config/storage.ts:27-40`) que faz `new MMKV({ id: namespace })`.

### Achados

- **🔴 Alta — Fallback silencioso do refresh token para MMKV sem criptografia.** `setRefreshToken`/`getRefreshToken`/`deleteRefreshToken` (`auth.store.ts:180-210`) envolvem toda chamada ao SecureStore em `try/catch`; se `SecureStore.setItemAsync` lançar exceção por qualquer motivo (Keystore indisponível, erro de plataforma, simulador com Keychain corrompido, etc.), o código cai silenciosamente para `authStorage.set(REFRESH_TOKEN_KEY, token)` — gravando a credencial de sessão de longa duração **em texto claro** no MMKV, sem nenhum log de erro, alerta ou flag exposta ao restante do app. Como o refresh token é o único artefato que permite obter novos access tokens indefinidamente (via rotação), esse fallback silencioso é equivalente a "modo inseguro sem aviso" — exatamente o tipo de degradação que o comentário do arquivo (linhas 11-17) afirma que não acontece. Em dispositivo rootado/jailbroken, se esse fallback for exercitado, o refresh token fica legível diretamente do sandbox do app.
- **🔴 Alta — Nenhuma instância MMKV do app usa `encryptionKey`.** Confirmado por grep recursivo: a string `encryptionKey` não aparece em nenhum lugar do código-fonte do mobile. `createAppStorage` (`config/storage.ts:29`) sempre cria `new MMKV({ id: namespace })` sem opção de criptografia — logo, **todo** dado gravado via esse helper é persistido em texto claro no arquivo MMKV do sandbox do app, legível em dispositivo comprometido (root Android / jailbreak iOS) sem precisar quebrar nenhuma criptografia adicional.
- **🟡 Média — Todos os namespaces MMKV do app resolvem para o mesmo arquivo físico `'blendi-pulse'`, concentrando dados sensíveis em um único ponto de exposição.** Grep confirma que `authStorage`, `PROFILE_PHOTO_STORAGE`, `queryCacheStorage`, `pendingBlendStorage`, `shoppingListSyncStorage`, `blendStorage` e o storage do `i18n` usam todos o literal `'blendi-pulse'` como `id` — apesar de nomes de variável diferentes sugerirem namespaces separados, é um único banco MMKV. Não é uma vulnerabilidade por si só (não há isolamento adicional a violar), mas significa que comprometer esse arquivo único expõe **todos** os dados abaixo de uma vez, não apenas uma categoria.
- **🟡 Média — Cache de foto de perfil em base64 completo, sem expiração, em MMKV sem criptografia.** `ProfilePhoto.tsx:116-118` (`cacheProfilePhoto`) grava o JPEG/PNG inteiro do usuário como string base64 via `PROFILE_PHOTO_STORAGE.set(...)`, chave `profile_photo_<userId>`. Sem TTL — só é invalidado quando `profilePhotoUpdatedAt` muda ou a foto é removida (`clearProfilePhotoCache`). Em dispositivo comprometido, a foto de perfil de qualquer usuário que já fez login nesse device fica recuperável indefinidamente.
- **🟡 Média — Dados de saúde/uso persistidos em texto claro via cache do React Query.** `cache.config.ts:94-108` (`PERSISTABLE_QUERY_KEYS`) confirma que `user`, `userProfile`, `dailyMissions`, `blendLogsToday`, `blendHistory`, `favorites`, `hydrationToday`, `hydrationHistory`, `shoppingLists`, `shoppingListDetail`, `supplementStack`, `supplementHistory` e **`pulseAiHistory`** são serializados via `createMMKVPersister` (`queryClient.ts:98-113`) direto no MMKV sem criptografia. Isso inclui metas nutricionais diárias, histórico de hidratação/suplementos/blends e respostas cacheadas do Pulse AI — dado de saúde pessoal, sensível sob LGPD/GDPR, legível em dispositivo rootado. **Nota positiva:** os próprios comentários do arquivo (`cache.config.ts:88-93`) mostram decisão consciente de **excluir** `pantryScans`, `conversations` (histórico completo de conversas do Pulse AI) e os relatórios semanais dessa persistência — reduz a superfície, mas o restante ainda é uma quantidade relevante de dado pessoal em claro.
- **✅ Correto — Access token nunca toca disco.** Único artefato de curta duração (15 min) fica só na RAM (Zustand), reduzindo a janela de exposição mesmo no design ideal.
- **✅ Correto — Caminho feliz do refresh token usa o mecanismo mais seguro disponível no Expo.** Quando o SecureStore funciona normalmente (o caso comum), o design é correto: Keychain/Keystore nativo, `AFTER_FIRST_UNLOCK` evita extração cold-boot.
- **Informativo — Flag de onboarding (`onboarding_completed`) e preferência de idioma (`i18n`) também em MMKV sem criptografia**, mas sem qualquer sensibilidade real — risco desprezível mesmo em device comprometido.

### Impacto de dispositivo rootado/jailbroken (resumo)

| Dado | Onde | Criptografado? | Impacto se device comprometido |
|---|---|---|---|
| Access token JWT | RAM (Zustand) | N/A (nunca em disco) | Nenhum — não sobrevive à leitura de disco |
| Refresh token (caminho normal) | expo-secure-store (Keychain/Keystore) | Sim (nativo da plataforma) | Baixo — precisaria comprometer o Keychain/Keystore, não só o sandbox do app |
| Refresh token (fallback silencioso) | MMKV `'blendi-pulse'` | **Não** | **Crítico se exercitado** — sequestro de sessão indefinido (até rotação/expiração) |
| Foto de perfil (base64) | MMKV `'blendi-pulse'` | Não | Médio — exposição de imagem pessoal |
| Histórico de blend/hidratação/suplementos, metas nutricionais, respostas cacheadas do Pulse AI | MMKV `'blendi-pulse'` (via React Query persister) | Não | Médio — dado de saúde pessoal (LGPD/GDPR) |
| Listas de compras | MMKV `'blendi-pulse'` | Não | Baixo/Médio — dado pessoal de menor sensibilidade |
| Flag de onboarding, idioma | MMKV `'blendi-pulse'` | Não | Desprezível |

---

## Tarefa 2 — Rate limiting: mapeamento e testes de abuso

**Ambiente:** servidor local (`npm run dev` em `apps/api`, porta 3000, `NODE_ENV=development`, conectado ao MongoDB Atlas `test`). Scripts em Node.js com `fetch` nativo, salvos em `task2-tests.mjs` (scratchpad da sessão) — reproduzíveis por qualquer dev com o servidor local no ar.

### Mapeamento estático

- Grep em `apps/api/package.json` confirma: **`express-rate-limit` não está instalado** (nem nas `dependencies` nem nas `devDependencies`).
- `apps/api/src/middlewares/` contém apenas `authenticate.ts`, `errorHandler.ts` e `requestLogger.ts` — **nenhum middleware de rate limiting, throttling ou lockout de conta**, global ou por rota.
- `apps/api/src/index.ts` confirma a cadeia completa de middlewares globais: `cors` → `compression` → (`/webhooks` com `express.raw`) → `express.json({limit:'4mb'})` → `express.urlencoded` → `requestLogger`. Nenhum limitador de taxa em nenhum ponto da cadeia.

### Testes ativos executados

**Teste 1 — Força bruta no login.** 20x `POST /auth/login` sequenciais, mesmo e-mail (`bruteforce-target@blendi-test.dev`, inexistente), senha diferente a cada tentativa.
- Resultado: **20/20 respostas HTTP 401**, sem variação de código, sem aumento de latência progressivo (todas entre 139–400ms), sem header `Retry-After`, sem CAPTCHA, sem bloqueio temporário de IP ou de conta.
- Tempo total: 3.867ms para 20 tentativas (~193ms/req) — nada impede um atacante de rodar isso em paralelo (não testado em paralelo aqui, mas nada na cadeia de middleware limitaria).

**Teste 2 — Criação em massa.** 15x `POST /auth/register` sequenciais, e-mails distintos, mesmo IP, payload idêntico exceto e-mail/nome.
- Resultado: **15/15 aceitas com HTTP 201**, todas com `userId` distinto retornado, e-mail de boas-vindas "enviado" (log do `EmailService` mockado) para cada uma. Nenhuma detecção de padrão, nenhum CAPTCHA, nenhuma exigência de verificação de e-mail antes de liberar a conta com tokens ativos.

**Teste 3 — Flood em endpoint autenticado.** 50x `GET /daily-missions` sequenciais com token válido de um dos usuários criados no Teste 2.
- Resultado: **50/50 respostas HTTP 200**, latência estável (~277–1060ms, sem padrão de degradação por excesso de requisições — a variação reflete round-trip ao Atlas, não throttling). Nenhuma proteção detectada.

**Teste 4 — Abuso do Pulse AI (limite de negócio + corrida).**
- Sequencial (chamadas 1–4 do dia, usuário free/`Lite`, limite de negócio = 3/dia): 1ª → 503 (`pulseai/ai-unavailable`, timeout do provider Gemini após 30s), 2ª → 200 (sucesso real), 3ª e 4ª → 500 (`pulseai/invalid-ai-response`). As falhas de IA (503/500) **não consumiram o limite diário** — confirmado via rollback (ver abaixo) — então o limite de negócio nunca chegou a ser testado no caminho sequencial (só 1 geração bem-sucedida ocorreu).
- 10 requisições simultâneas via `Promise.all` (mesmo usuário, `dailyAiUsage=1` no momento do disparo, restando 2 reservas até o limite de 3): resultado **0/10 com HTTP 200** nessa rodada — 2 delas passaram pela reserva atômica e falharam na chamada real à IA (503/500, com rollback), e as **outras 8 foram bloqueadas imediatamente com HTTP 429** (`pulseai/daily-limit-reached`). `GET /pulse-ai/usage` ao final confirmou `dailyAiUsage: 1` — nenhuma reserva "vazou" além do limite, mesmo sob concorrência real.
- **✅ Correto — Nenhuma condição de corrida explorável no rate limit de negócio do Pulse AI.** O padrão atômico `$lt` + `$inc` em `reservePulseAiUsage` (já confirmado no diagnóstico de edge cases anterior) se manteve correto sob teste de carga real com 10 requisições simultâneas — 0 bypasses observados.
- **Achado colateral (registrado para Tarefa 6):** os erros do provider de IA (timeout do Gemini, erro de quota `429 Too Many Requests` do Google) são capturados em `aiProvider.service.ts:359-370,390-398` e relançados como `AiProviderRequestError('AI provider request failed.')` genérico — **nenhuma informação interna do provider (endpoint, quota, chave de projeto) vaza para o cliente**, apenas para o log do servidor via `console.error`. Comportamento correto, documentado aqui e não repetido na Tarefa 6.

### Achados

- **🔴 Alta — Nenhum rate limiting de infraestrutura em nenhum endpoint, incluindo `/auth/login`.** 20 tentativas de login com credenciais erradas para o mesmo e-mail não geram nenhuma forma de proteção (delay, bloqueio, CAPTCHA, header de aviso). Combinado com o hash `argon2`/`bcryptjs` (caro por design, mas não impede o abuso de rede), um atacante com paralelismo real (não testado aqui, mas nada no código impede) pode tentar milhares de senhas por minuto contra qualquer e-mail conhecido sem qualquer fricção.
- **🔴 Alta — Nenhum rate limiting em `/auth/register` permite criação ilimitada de contas.** 15/15 aceitas sem fricção. Combinado com o limite de negócio do Pulse AI ser "3 gerações grátis por conta/dia", isso é um vetor real de abuso de custo: um atacante pode automatizar criação de contas descartáveis para obter gerações de IA "gratuitas" essencialmente sem limite agregado, consumindo quota paga da API do Google/Anthropic/OpenAI indefinidamente. Não é hipotético — o teste confirmou que nada no fluxo de registro exige verificação de e-mail, CAPTCHA, ou detecção de padrão antes de liberar tokens ativos.
- **🔴 Alta — Nenhum rate limiting em endpoints autenticados.** 50 requisições consecutivas a `/daily-missions` com um único token não sofrem nenhuma limitação. Qualquer endpoint autenticado (não só este) está igualmente exposto — um token vazado ou um usuário malicioso pode gerar carga arbitrária no backend e no Atlas M0 (que tem limites de conexão/IOPS baixos por ser tier gratuito), criando risco real de negação de serviço por exaustão de recursos, não só de abuso de dado.
- **✅ Correto — Rate limit de *negócio* do Pulse AI é atomicamente seguro sob concorrência real**, incluindo o teste de corrida pedido explicitamente pela tarefa. Isso protege contra excesso de *gerações cobradas*, mas não protege contra volume bruto de requisições HTTP ao endpoint (cada requisição ainda consome CPU/IO para validação Zod, leitura de usuário, tentativa de reserva, mesmo quando bloqueada em 429) — a ausência de rate limit de infraestrutura (achado acima) continua se aplicando a esse endpoint especificamente para o eixo "volume de requisições", mesmo com o eixo "gerações de IA cobradas" protegido.
- **✅ Correto — Nenhum vazamento de detalhe interno do provider de IA nos erros do Pulse AI**, mesmo sob quota real excedida do Google Gemini durante o teste (ver achado colateral acima).

---

## Tarefa 3 — Autorização de endpoints: teste de IDOR

**Ambiente:** mesmo servidor local da Tarefa 2. Script `task3-idor.mjs` (scratchpad da sessão), reproduzível. Dois usuários reais criados via `POST /auth/register` (UserA e UserB), com dados de teste reais gerados por UserA: shopping list + item, blend log, e foto de perfil. A tentativa de gerar uma conversa real do Pulse AI falhou (ver nota abaixo) — o teste específico de IDOR em conversas não pôde ser executado ativamente, mas o código foi lido e a proteção foi confirmada estaticamente.

### Resultados dos testes cruzados (token de UserB contra recursos de UserA)

| # | Teste | Resposta HTTP | Código | Veredito |
|---|---|---|---|---|
| 1 | `GET /shopping-lists/:listId` (lista de UserA) | **403** | `shoppingList/forbidden` | ✅ Comportamento correto |
| 2 | `GET /conversations/:id` (conversa de UserA) | *não executado ativamente* | — | Ver nota — confirmado apenas por leitura de código |
| 3 | `PATCH /shopping-lists/:listId/items/:itemId/check` (item de UserA) | **403** | `shoppingList/forbidden` | ✅ Comportamento correto |
| 4 | `GET /users/me/photo` com token de UserB (endpoint não aceita `userId` externo) | **404** (UserB não tem foto própria) | `profilePhoto/not-found` | ✅ Comportamento correto — endpoint estruturalmente não vulnerável (ver abaixo) |
| 5 | `DELETE /shopping-lists/:listId` (lista de UserA) | **403** | `shoppingList/forbidden` | ✅ Comportamento correto — lista de UserA confirmada intacta após a tentativa |
| 6 | `GET /weekly-reports?weekStart=2026-08-24` (token de UserB) | **404** | `weeklyReport/not-found` | ✅ Comportamento correto (ver limitação abaixo) |
| 7 | `GET /blend-logs/history` (token de UserB) | **200**, `totalLogs:1`, sem nenhum dado de UserA presente | — | ✅ Comportamento correto — isolamento confirmado |
| Bônus | `PUT /shopping-lists/:listId/items` (replace total, lista de UserA, token de UserB) | **403** | `shoppingList/forbidden` | ✅ Comportamento correto |

**Nenhuma resposta HTTP 200 foi obtida com token do usuário errado em nenhum teste executado — nenhum vazamento de dado confirmado via IDOR nos endpoints testados.**

### Notas e limitações

- **Teste #2 (conversas do Pulse AI) não pôde ser exercitado ativamente.** As chamadas reais a `POST /pulse-ai/chat` durante os testes falharam sistematicamente (`pulseai/invalid-ai-response`, 500) — o provider configurado (`gemini-2.5-flash`, tier gratuito) respondeu, mas o conteúdo não passou na validação/parse do backend na maioria das tentativas, e adicionalmente sua quota gratuita (5 req/min) já estava parcialmente consumida pelos testes da Tarefa 2. Sem uma geração bem-sucedida, nenhum `conversationId` real ficou disponível para o teste cruzado. **Compensação:** o código de `getConversationById` (`conversation.controller.ts:172-188`) foi lido integralmente e confirma a mesma proteção dos demais endpoints — busca por `findById` sem filtro de usuário, seguida de checagem explícita `String(conversation.userId) !== userId` → `403 conversations/forbidden` antes de retornar qualquer dado. Estruturalmente idêntico ao padrão usado em `shoppingList.controller.ts` e já confirmado correto ali sob teste ativo — mas fica registrado que este ponto específico não teve confirmação por exploração real, apenas por leitura de código. Recomenda-se reexecutar este teste especificamente quando a quota/config de IA permitir uma geração bem-sucedida.
- **Teste #4 (`GET /users/me/photo`) não é um cenário de IDOR aplicável.** Leitura de `user.controller.ts:361-373` confirma que o endpoint usa exclusivamente `req.user?.sub` (extraído do JWT) — não existe parâmetro de query, path ou body que aceite um `userId` externo. Não há superfície de ataque a testar; o "teste cruzado" nesse caso foi apenas uma verificação de sanidade (UserB não recebe a foto de UserA por nenhum caminho, nem que tentasse).
- **Teste #6 (`weekly-reports`) rodou sob precondição incompleta.** Nenhum dos dois usuários de teste (recém-criados) tinha relatório semanal gerado (relatórios são produzidos por job assíncrono, não por ação do usuário) — o 404 obtido não distingue "protegido corretamente" de "não existe mesmo". **Compensação:** `weeklyReport.controller.ts:153` mostra que a query já é construída como `WeeklyReportModel.findOne({ userId, weekStartDate: weekStart })` — o filtro por `userId` do token está embutido na própria consulta ao banco, não é uma checagem posterior — o que é estruturalmente mais seguro que buscar por ID e checar depois (elimina a classe inteira de erro "esqueci de checar ownership"). Confiança alta no código, sem confirmação por dado real positivo.

### Achados

- **✅ Correto — Nenhum IDOR explorável nos 6 dos 7 endpoints testados ativamente** (shopping lists: get/check/delete/put-items; blend logs history; weekly reports). Todos aplicam checagem de ownership consistente — 403 nos casos onde o recurso existe mas pertence a outro usuário, ou a própria query já é escopada por `userId` do token (blend history, weekly reports).
- **✅ Correto — Padrão de autorização consistente entre controllers.** `shoppingList.controller.ts` e `conversation.controller.ts` seguem o mesmo padrão: buscar por ID, depois comparar `userId` do documento com `req.user.sub`, retornando 403 explícito antes de serializar qualquer dado. Reduz o risco de um endpoint futuro esquecer a checagem, já que é um padrão replicado, não uma decisão ad-hoc por rota.
- **🟢 Baixa — Inconsistência de código HTTP entre "recurso não existe" e "recurso existe mas não é seu".** Todos os endpoints testados retornam 403 explícito para IDOR (não 404 disfarçado) — o que é honesto sobre a existência do recurso, mas tecnicamente permite a um atacante confirmar se um `listId`/`conversationId` arbitrário existe no banco (403 = existe mas não é seu; 404 = não existe), mesmo sem conseguir ler o conteúdo. É uma enumeração de existência de baixíssimo impacto prático aqui (os IDs são ObjectIds de 24 hex chars / UUIDs, não adivinháveis por força bruta), mas vale registrar como observação de rigor.

---

## Tarefa 4 — Injeção NoSQL: testes ativos com payloads maliciosos

**Ambiente:** mesmo servidor local. Script `task4-injection.mjs` (scratchpad da sessão), reproduzível — configurado para **parar imediatamente em qualquer HTTP 500**, conforme instrução do prompt. Nenhum 500 ocorreu.

### Mapeamento estático

- Grep em `apps/api/package.json` confirma: **`express-mongo-sanitize` não está instalado.** Não há nenhuma camada de sanitização de operadores MongoDB (`$ne`, `$gt`, `$where`, etc.) na cadeia de middlewares.
- Grep recursivo por `z.any()`, `z.record(` e `z.unknown()` em `packages/shared/src/schemas/` e por queries Mongoose construídas diretamente a partir de `req.query`/`req.body` sem passar por Zod em `apps/api/src/controllers/`: **nenhuma ocorrência.** Todo input de usuário observado passa por um schema Zod com tipos primitivos explícitos (`z.string()`, `z.number()`, `z.enum()`) antes de qualquer uso em query/update do Mongoose.

### Testes ativos executados

| # | Teste | Payload | Status HTTP | Resultado |
|---|---|---|---|---|
| 1 | Bypass de login | `{"email":{"$ne":null},"password":{"$ne":null}}` | **400** | Rejeitado por `loginSchema.safeParse` — `"Expected string, received object"` em ambos os campos, antes de qualquer query ao Mongo |
| 2 | `$where` no `recipeName` do blend log | `{"recipeName":{"$where":"this.userId != this.userId"}, ...}` | **400** | Rejeitado por `createBlendLogSchema` — mesmo padrão de erro de tipo |
| 3 | `$gt` no nome de item de shopping list | `[{"name":{"$gt":""}, ...}]` | **400** | Rejeitado por `shoppingListItemSchema` dentro do array — `"0.name": "Expected string, received object"` |
| 4 | Operador via query string | `GET /blend-logs/history?from[$gt]=2020-01-01&to=...` | **400** | O parser de query do Express (`qs`) converteu `from[$gt]=...` em `{from: {"$gt": "2020-01-01"}}`; `getFirstQueryValue` (`blendLog.controller.ts:87-90`) só aceita `typeof rawValue === 'string'`, então o objeto foi descartado e `from` chegou como `undefined` ao Zod → rejeitado como campo obrigatório ausente |
| 5a | `$regex` no `timezone` via `PATCH /users/me` | `{"timezone":{"$regex":".*"}}` | **200**, mas **sem efeito** | Ver nota abaixo — não é bypass, é comportamento correto por um motivo diferente do esperado |
| 5b | `$regex` no `timezone` via `PATCH /auth/timezone` (endpoint real dono do campo) | `{"timezone":{"$regex":".*"}}` | **400** | Rejeitado por `updateTimezoneSchema` — mesmo padrão de erro de tipo |

**Nenhum HTTP 500 ocorrido em nenhum teste — nenhuma parada de emergência foi necessária.**

### Nota sobre o Teste 5 — por que 200 não é um bypass

O prompt original pede o teste especificamente em `PATCH /users/me`. A resposta HTTP 200 **não indica vulnerabilidade** — investigação do schema mostra que `updateUserSchema` (`packages/shared/src/schemas/user.ts:47-104`, um `.partial()` de um `z.object`) **não declara `timezone` como campo aceito** — esse campo pertence exclusivamente a `updateTimezoneSchema`, usado por `PATCH /auth/timezone`. Como Zod, por padrão, **descarta silenciosamente chaves desconhecidas** de um objeto (a menos que `.strict()` seja usado), o payload `{"timezone": {...}}` foi parseado como um objeto de atualização vazio — a requisição "teve sucesso" porque não fez nada, não porque o operador `$regex` foi aceito em algum lugar. Reexecutar o mesmo payload contra o endpoint que de fato possui o campo (`PATCH /auth/timezone`, Teste 5b) confirma a rejeição correta com 400. Verificado via `GET /users/me` após o teste: `timezone` permaneceu `"America/Sao_Paulo"`, valor original — nenhuma alteração ocorreu.

### Verificação pós-teste (nenhum documento inesperado)

- Lista de shopping list usada no Teste 3: `GET /shopping-lists/:listId` após o teste retorna `items: []` — o item malicioso não foi criado.
- `GET /users/me` após o Teste 5: `timezone` inalterado.
- `GET /blend-logs/history` após o Teste 2: nenhum blend log presente — a criação foi corretamente rejeitada antes de qualquer escrita no Mongo.
- Nenhuma verificação direta no MongoDB Atlas foi necessária além dessas — como todos os testes foram rejeitados na camada de validação (antes de qualquer chamada ao Mongoose), não há razão para suspeitar de escrita fora do caminho da API.

### Achados

- **✅ Correto — Nenhuma das 5 tentativas de injeção NoSQL teve sucesso**, incluindo o bypass clássico de autenticação via `$ne`. Toda a superfície testada é protegida por Zod com tipos primitivos estritos antes de qualquer contato com o Mongoose/MongoDB.
- **✅ Correto — Parsing de query string com operadores em colchetes (`from[$gt]=...`) não é interpretado como operador MongoDB**, graças à checagem explícita de `typeof === 'string'` em `getFirstQueryValue` — um padrão replicado em pelo menos 4 controllers (`weeklyReport`, `hydration`, `blendLog`, `supplementLog`), reduzindo o risco de um único ponto de falha.
- **🟡 Média — Ausência de `express-mongo-sanitize` (ou equivalente) como camada de defesa em profundidade.** A proteção atual contra injeção de operadores MongoDB é **inteiramente incidental** — resultado colateral de todo endpoint usar Zod com tipos primitivos, não uma decisão explícita de segurança. Não há uma segunda camada que pegue o erro se um desenvolvedor futuro introduzir um campo `z.any()`, `z.record()`, um schema `.passthrough()`, ou um endpoint novo que monte uma query Mongoose a partir de `req.body`/`req.query` sem Zod. Hoje o risco real é baixo (grep confirma 100% de cobertura por Zod tipado), mas a rede de segurança de infraestrutura não existe — é puramente dependente de disciplina de code review contínua.

---

## Tarefa 5 — Headers de segurança HTTP

**Ambiente:** `curl -v` contra o servidor local, uma requisição autenticada (`GET /users/me`) e uma sem autenticação (`GET /ping`), para confirmar se a proteção varia por rota.

### Headers observados (idênticos nas duas requisições)

```
HTTP/1.1 200 OK
X-Powered-By: Express
Vary: Origin, Accept-Encoding
Access-Control-Allow-Credentials: true
Content-Type: application/json; charset=utf-8
Content-Length: <N>
ETag: W/"<hash>"
Date: <data>
Connection: keep-alive
Keep-Alive: timeout=5
```

### Checklist item a item

| Header esperado | Presente? | Valor observado | Severidade (ausência) |
|---|---|---|---|
| `X-Content-Type-Options: nosniff` | ❌ Ausente | — | 🟡 Média |
| `X-Frame-Options: DENY` | ❌ Ausente | — | 🟢 Baixa (ver nota de contexto) |
| `Strict-Transport-Security` | ❌ Ausente | — | 🔴 Alta em produção |
| `X-XSS-Protection: 0` | ❌ Ausente | — | 🟢 Baixa |
| `Content-Security-Policy` | ❌ Ausente | — | 🟡 Média |
| `X-Powered-By` (deve estar ausente) | ⚠️ **Presente** | `Express` | 🟢 Baixa |
| `Server` (deve estar ausente/genérico) | ✅ Ausente | — | Correto — nenhuma ação necessária |

- **`helmet` não está instalado** (`apps/api/package.json` sem a dependência) — confirma e explica a ausência total dos 5 headers de proteção. Nenhum deles é setado manualmente em nenhum middleware.
- `Server` já vem ausente por padrão do próprio módulo `http` do Node.js (Express não adiciona esse header) — comportamento correto, mas não é uma escolha deliberada de segurança, é o default da plataforma.

### Nota de contexto — impacto real por ser uma API JSON pura

O backend serve exclusivamente JSON para o app mobile (React Native/Expo), sem servir HTML diretamente — a única rota que faz `redirect` (`GET /auth/google/callback`) redireciona para um deep link customizado (`blendipulse://...`), não para uma página web. Isso **reduz mas não elimina** o impacto de alguns headers:
- `X-Frame-Options`/`X-XSS-Protection` protegem primariamente contexto de navegador renderizando HTML — sem superfície HTML servida pela API hoje, o risco prático é baixo. Ainda assim, adicionar custa zero (via `helmet`) e cobre qualquer rota HTML futura (ex: página de erro do OAuth, admin/dashboard futuro).
- `X-Content-Type-Options: nosniff` continua relevante mesmo para JSON puro — previne MIME sniffing caso um cliente (webview, navegador acessando a URL da API diretamente) interprete a resposta de forma inesperada.
- `Content-Security-Policy` tem valor reduzido sem HTML servido, mas é defesa em profundidade de custo zero.
- **`Strict-Transport-Security` continua crítico independente do tipo de conteúdo** — protege contra downgrade de HTTPS para HTTP e ataques de MITM na camada de transporte, relevante para qualquer cliente (inclusive o app mobile) que se conecte à API em produção (Railway). Como o diagnóstico pede para classificar pelo impacto real em produção, não pelo ambiente local, mantenho a severidade **Alta** — é o único header desta lista cuja ausência tem impacto de segurança direto e sério em produção, independente do fato de a API não servir HTML.

### Achados

- **🔴 Alta — `Strict-Transport-Security` ausente.** Sem HSTS, um cliente que acidentalmente se conecte via HTTP (ou seja alvo de downgrade attack) não é forçado a usar HTTPS. Em produção (Railway, onde HTTPS é a única via oficial mas nada no lado da aplicação reforça isso), essa ausência abre uma janela real para interceptação de tráfego, incluindo tokens de autenticação, em cenários de rede hostil (Wi-Fi público, proxy malicioso).
- **🟡 Média — `X-Content-Type-Options` e `Content-Security-Policy` ausentes.** Impacto reduzido pela natureza JSON-only da API hoje, mas são controles de custo zero via `helmet` e cobrem cenários futuros (rotas HTML, webviews, admin dashboard).
- **🟢 Baixa — `X-Powered-By: Express` exposto.** Facilita fingerprinting da stack tecnológica, ajudando um atacante a mirar exploits conhecidos de Express/Node — mitigação trivial (`app.disable('x-powered-by')` ou `helmet` já remove automaticamente).
- **🟢 Baixa — `X-Frame-Options` e `X-XSS-Protection` ausentes.** Impacto prático baixo hoje (sem HTML servido), mas sem custo para corrigir.
- **✅ Correto — Header `Server` ausente**, não expõe versão do Express/Node (comportamento padrão do Node.js, não uma configuração explícita, mas o resultado observável é o correto).
- **Recomendação consolidada:** todos os 6 achados desta tarefa (5 ausências + 1 exposição indevida) são resolvidos de uma só vez com `app.use(helmet())` no topo da cadeia de middlewares em `index.ts`, antes de `cors()`. Custo de implementação mínimo, sem risco de regressão para uma API JSON pura.

---

## Tarefa 6 — Dados sensíveis em logs e respostas de erro

**Ambiente:** servidor local, `NODE_ENV=development`. Erros provocados via `curl` contra endpoints reais; leitura integral de `errorHandler.ts`, `error.utils.ts`, e grep recursivo por `console.` em todo `apps/api/src`.

### Formato das respostas de erro (testes ativos)

| Teste | Payload/condição | Status | Corpo da resposta |
|---|---|---|---|
| `POST /blend-logs` malformado | `protein` como string, `blendiModel` inválido, `durationSeconds` ausente | 400 | `{"code":"validation/invalid-input","message":"Validation failed.","errors":[...]}` — sem stack, sem detalhe interno |
| `GET /shopping-lists/id-invalido` | ObjectId malformado | 400 | `{"code":"shoppingList/invalid-id","message":"Invalid shopping list id."}` — erro do Mongoose (`CastError`) nunca chega a ocorrer, pois o controller valida com `mongoose.isValidObjectId()` **antes** de qualquer query |
| `GET /shopping-lists/000...000` | ObjectId válido, documento inexistente | 404 | `{"code":"shoppingList/not-found","message":"Shopping list not found."}` — limpo |
| JWT com assinatura inválida | Token forjado | 401 | `{"code":"auth/unauthorized","message":"Unauthorized."}` — não diferencia "token expirado" de "assinatura inválida" de "token ausente" (ver achado abaixo) |
| Sem token | — | 401 | `{"code":"auth/unauthorized","message":"Unauthorized."}` — idêntico ao caso acima |
| **JSON malformado no body** (`{"protein": 10, "carbs":` cortado) | Erro de parsing do `body-parser`/`express.json()` | 400 | **Inclui `stack` trace completo com caminho absoluto do filesystem** (`/Users/.../node_modules/.pnpm/body-parser@2.2.2/...`) — ver achado abaixo |

### Achados

- **🟡 Média — `message` de erro nunca é sanitizado por ambiente, apenas `stack`.** `errorHandler.ts:20-31` só protege `stack` atrás de `isDev` (`NODE_ENV === 'development'`); o campo `message` é **sempre** `err.message`, em qualquer ambiente, para qualquer erro que chegue até este handler genérico (`next(error)` sem tratamento explícito no controller). Confirmado via teste ativo: um JSON malformado devolveu a mensagem crua do `body-parser` ("Unexpected end of JSON input") — inofensiva neste caso específico, mas o mecanismo é genérico. Qualquer exceção não tratada explicitamente por um controller (erro de conexão do Mongoose, erro de biblioteca de terceiros, bug de código) vai propagar sua `message` original para o cliente **mesmo em produção**. O código-base é disciplinado (Zod em toda entrada, validação manual de ObjectId antes do Mongoose, `AiProviderRequestError` genérico envolvendo erros de IA) — por isso, na prática, poucos caminhos além de "JSON malformado" chegam a esse handler genérico hoje — mas não há proteção estrutural contra um futuro erro menos disciplinado vazar detalhe interno via `message`.
- **🟢 Baixa — `stack` trace completo (com caminho absoluto do filesystem local) é retornado ao cliente em `NODE_ENV=development`**, confirmado via teste ativo com JSON malformado. Comportamento é exatamente o documentado no código (`isDev && {stack: err.stack}`) e portanto **não deveria reproduzir em produção**, desde que `NODE_ENV=production` esteja corretamente configurado no Railway — não verificado neste diagnóstico (fora do escopo testar produção). Classificado como Baixa apenas porque o próprio mecanismo de proteção existe e está corretamente implementado; o risco real está na dependência de uma variável de ambiente estar sempre certa (ver achado relacionado abaixo sobre `env.ts`).
- **🔴 Alta — Código OTP de redefinição de senha e código de verificação de conta são logados em texto claro no console em qualquer ambiente onde `NODE_ENV !== 'production'`.** `apps/api/src/services/email.service.ts:161` (`sendPasswordResetEmail`) loga `` `🔑 [EmailService] Password reset OTP for ${name} <${email}>: ${code}` `` — o código de 6 dígitos que permite a **qualquer pessoa redefinir a senha da conta sem conhecer a senha atual**. O mesmo padrão ocorre em `sendVerificationEmail` (linhas 113-118, código de verificação de conta) e é estruturalmente o design correto para desenvolvimento local (arquivo já rotulado `DEVELOPMENT STUB — DO NOT USE IN PRODUCTION AS-IS` no cabeçalho, linhas 3-13, e a integração real com Resend está marcada como pendência de Fase 4). O ponto de risco real não é o ambiente de desenvolvimento em si, mas **a robustez do gate**: a condição é `env.NODE_ENV !== 'production'` — uma checagem negativa que loga em qualquer valor de `NODE_ENV` que não seja exatamente a string `'production'`. Se o deploy em produção (Railway) rodar com `NODE_ENV` ausente, mal configurado (ex: `Production` com maiúscula, `staging`, ou não setado), **o OTP de redefinição de senha de usuários reais seria logado em texto claro nos logs do Railway** — acessível a qualquer pessoa com acesso à plataforma de deploy (não só à equipe de engenharia, dependendo de quem tem acesso ao projeto Railway), e potencialmente a qualquer serviço de agregação de log conectado. Um OTP vazado é equivalente a um token de takeover de conta completo — mais crítico que vazar `totalXP`/`currentStreak`. Classificado como Alta porque, apesar de mitigado hoje (arquivo aparenta ser dev-only e o `.env` de produção presumivelmente define `NODE_ENV=production`), a superfície de erro é uma variável de ambiente mal configurada — um erro operacional plausível e não detectável automaticamente (nenhum teste/alerta cobre esse gate).
- **✅ Correto — Nenhum log de `totalXP`/`currentStreak` combinado com `userId`** em `xp.service.ts` (único log ali é `{userId, err}` em falha de push notification de level-up — sem dado de XP/streak).
- **✅ Correto — Nenhum log de conteúdo de mensagens do Pulse AI.** Todos os `console.info`/`console.error` em `pulseAi.controller.ts` (guardrail de proteína, inconsistência de macro, falha de persistência) logam apenas metadados (`blendiModel`, `discrepancy` numérico, `errorName`/`errorMessage`, `conversationId`, `userId`) — nunca o texto da mensagem do usuário nem o conteúdo da receita gerada.
- **✅ Correto — Nenhum log de valores de token JWT** (access ou refresh) encontrado em todo `apps/api/src` — grep recursivo por padrões de token combinados com `console.` não retornou nenhuma ocorrência.
- **✅ Correto — Nenhum log de base64 de foto de perfil.** `user.controller.ts` (upload/leitura/remoção de foto) não contém nenhuma chamada `console.*`. `pantryScanner.controller.ts:436` loga apenas `{userId, mimeType, imageSizeKb}` para imagens de scan — nunca o base64 em si.
- **✅ Correto (melhoria desde o diagnóstico de edge cases anterior) — `persistConversationTurn` agora verifica `matchedCount` e loga um aviso quando a conversa expira por TTL no meio da requisição** (`pulseAi.controller.ts:491-496`). O achado T8-F2 do [diagnóstico de edge cases de 2026-08-13](diagnostico-edge-cases.md) ("`persistConversationTurn` ignora o resultado do `updateOne`") **não reproduz mais** — o código atual já checa `result.matchedCount === 0` e emite `console.warn` com `conversationId`/`userId` (sem dado sensível). A perda de dado em si ainda pode ocorrer na janela de corrida rara descrita naquele diagnóstico, mas agora é observável em log — mudança positiva, vale registrar para não reabrir o achado antigo por engano.
- **Informativo — Erro de autenticação não diferencia causa (token ausente vs. inválido vs. expirado).** Todos retornam `401 auth/unauthorized` genérico — comportamento correto do ponto de vista de segurança (não ajuda um atacante a diferenciar cenários), mas dificulta debug legítimo pelo time. Não é um achado de risco, é uma observação de trade-off aceitável.

---

## Tarefa 7 — Gestão de secrets e variáveis de ambiente

**Método:** `git rev-list --objects --all` (busca exaustiva em todos os objetos já existentes no histórico, mais confiável que `git log` para detectar arquivos renomeados/removidos), leitura de `.env.example` e `config/env.ts`, grep recursivo por padrões de secret hardcoded. Nenhum valor real de secret é reproduzido neste relatório — apenas comprimento e classificação de força.

### Histórico do git — arquivos `.env` reais

- `git log --all --full-history` para `.env`, `.env.local`, `.env.development`, `.env.production` (raiz do repo): **nenhum resultado** em todos os 4 casos.
- Busca exaustiva com `git rev-list --objects --all` filtrando por qualquer caminho terminando em `.env`, `.env.local`, `.env.development`, `.env.production` ou `.env.staging`, em **todo o histórico e todos os branches**: **nenhum objeto encontrado.**
- Uma busca inicial mais ampla (`**/.env.*`) retornou 2 resultados — investigados e confirmados como **falsos positivos**: são os arquivos `apps/api/.env.example` (commit `5eeea23`) e `apps/mobile/.env.example` (commit `6d75c0b`), que são exatamente os arquivos que *devem* ser versionados (contêm apenas placeholders, ver abaixo).
- `apps/api/.env` e `apps/mobile/.env` (arquivos reais, com secrets de desenvolvimento) existem no working tree local, mas `git status --ignored` confirma que estão corretamente listados como ignorados (`.gitignore:14-19` cobre `.env`, `.env.local`, `.env.*.local`, `.env.development`, `.env.staging`, `.env.production`) — nunca foram staged, nunca foram commitados.
- **✅ Correto — Nenhum arquivo `.env` com secrets reais jamais existiu no histórico do repositório, em nenhum momento, em nenhum branch.**

### `.env.example` — placeholders vs. valores reais

- `apps/api/.env.example`: todas as 20 variáveis usam placeholders explícitos (`CHANGE_ME`, `CHANGE_ME_USE_OPENSSL_RAND`, `mongodb+srv://CHANGE_ME:CHANGE_ME@cluster0.xxxxx.mongodb.net/...`, `GOOGLE_CLIENT_ID=CHANGE_ME.apps.googleusercontent.com`) ou strings vazias documentadas para os campos opcionais do RevenueCat. Comentário explícito no topo: `"NUNCA commite o arquivo .env"`. Instrução de geração segura incluída (`Use \`openssl rand -base64 64\` para gerar segredos fortes`).
- `apps/mobile/.env.example`: mesma disciplina — `EXPO_PUBLIC_*` vazios ou placeholders, com aviso explícito no cabeçalho de que variáveis `EXPO_PUBLIC_` são expostas no bundle e nunca devem conter secrets.
- **✅ Correto — Nenhum valor real em nenhum `.env.example`.**

### Força dos secrets no `.env` de desenvolvimento atual

Valores não reproduzidos — apenas comprimento e classificação, conforme critério do prompt (< 32 = Crítico, 32–64 = Adequado, > 64 = Forte, todos assumindo caracteres aleatórios gerados corretamente, não verificados quanto à entropia real):

| Variável | Comprimento | Classificação |
|---|---|---|
| `JWT_ACCESS_SECRET` | 64 caracteres | Adequado (no limite superior da faixa) |
| `JWT_REFRESH_SECRET` | 64 caracteres | Adequado (no limite superior da faixa) |
| `JWT_RESET_SECRET` | 64 caracteres | Adequado (no limite superior da faixa) |
| `REVENUECAT_WEBHOOK_SECRET` | 45 caracteres | Adequado |

Os 3 secrets JWT estão exatamente no limite entre "Adequado" e "Forte" (64 é o teto da faixa Adequado definida no prompt) — nenhum classificado como Crítico. Nenhuma verificação de entropia/aleatoriedade real foi feita (fora do escopo verificável sem o valor em claro) — a classificação é puramente por comprimento.

### Secrets hardcoded no código-fonte

- Grep recursivo em `apps/api/src` por padrões `sk_`, `pk_`, `mongodb+srv://`, `AKIA` (AWS), `Bearer <token longo>`: **nenhuma ocorrência real** — os 2 únicos hits são a própria lógica de validação de formato em `env.ts:67-68` (comparando prefixo de string, não um valor real).
- Grep adicional por atribuições literais de `secret`/`password`/`apiKey` a strings fixas fora de arquivos de configuração de ambiente: **nenhuma ocorrência.**
- **✅ Correto — Nenhum secret hardcoded encontrado em todo o código-fonte do backend.**

### Validação de variáveis obrigatórias no boot (`config/env.ts`)

- **✅ Correto — `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` e `JWT_RESET_SECRET` têm `.min(32, ...)` no schema Zod** (`env.ts:72-80`) — se qualquer um estiver ausente ou tiver menos de 32 caracteres, `envSchema.safeParse(process.env)` falha, o erro é logado (`console.error`, sem vazar o valor) e **`process.exit(1)` mata o processo antes de qualquer `app.listen`** (`env.ts:123-135`). Não é um warning — é uma falha de boot real, exatamente o comportamento que o prompt pede para confirmar.
- **✅ Correto — `MONGODB_URI` validada quanto ao formato** (`mongodb://` ou `mongodb+srv://`) com o mesmo padrão de boot-fail.
- **✅ Correto — `AI_API_KEY`/`VISION_API_KEY` exigem no mínimo 10 caracteres** (`requiredApiKey`, `env.ts:31-40`) — mais permissivo que os secrets JWT, mas essas chaves são de terceiros (Google/OpenAI/Anthropic), cuja força é responsabilidade do provider, não da aplicação.
- **🟡 Média — `REVENUECAT_WEBHOOK_SECRET` não tem validação de comprimento mínimo/força**, ao contrário dos 3 secrets JWT. É declarada como `optionalString()` (`env.ts:118-120`) — aceita string vazia (o que é intencional, já que pagamentos podem ficar desconfigurados por design, confirmado por `paymentsConfig.isConfigured`) — mas se **um valor for fornecido**, nenhuma checagem impede um segredo curto ou previsível (ex: 4 caracteres passaria sem erro). Esse secret protege a verificação HMAC-SHA256 dos webhooks de pagamento do RevenueCat — a única defesa desse endpoint contra forjar eventos de assinatura (confirmada correta em auditorias anteriores, mas a corretude da *implementação* do HMAC não compensa um segredo *fraco*, que reduziria drasticamente o esforço de força bruta offline de uma assinatura interceptada). Valor atual em desenvolvimento (45 caracteres) está adequado — o achado é sobre a ausência da rede de segurança que garantiria isso em qualquer ambiente/configuração futura, o mesmo padrão de risco identificado no achado dos secrets JWT (mas lá, protegido; aqui, não).

---

## Tarefa 8 — Segurança da coleção `user_photos`

**Ambiente:** leitura integral de `user.controller.ts` (handlers de foto) e `models/UserPhoto.ts`; teste ativo de upload de conteúdo malicioso disfarçado de imagem contra o servidor local.

### `GET /users/me/photo` — reconfirmação do achado da Tarefa 3

Já analisado em detalhe na Tarefa 3: o handler (`user.controller.ts:361-373`, `getMyProfilePhoto`) usa **exclusivamente** `req.user?.sub` — não existe parâmetro de query, path ou body que aceite um `userId` externo. **Não há superfície de IDOR a testar neste endpoint** — reconfirmado aqui por completude do escopo da Tarefa 8, sem necessidade de reexecutar o teste.

### `POST /users/profile-photo` — validação de conteúdo (teste ativo)

O schema Zod (`profilePhotoBodySchema`, `user.controller.ts:93-109`) valida apenas:
- `imageBase64`: string não vazia (mais o limite de 530.000 caracteres checado manualmente logo depois, `MAX_PROFILE_PHOTO_BASE64_LENGTH`, linha 269) — **nenhuma verificação de que o conteúdo decodificado é de fato uma imagem válida.**
- `fileType`: enum `['jpeg', 'png']` — mas esse valor é **inteiramente declarado pelo cliente**, nunca derivado do conteúdo real do arquivo (sem checagem de magic bytes — ex: `FF D8 FF` para JPEG, `89 50 4E 47` para PNG).

**Teste ativo executado:** upload de um SVG contendo `<script>alert(document.cookie)</script>` embutido, codificado em base64 e declarado como `fileType: "png"`.

```
POST /users/profile-photo
{ "imageBase64": "<base64 de '<svg xmlns=\"...\"><script>alert(document.cookie)</script></svg>'>", "fileType": "png" }

→ HTTP 200 { "success": true, "data": { "user": { "hasProfilePhoto": true, ... } } }
```

Confirmado em seguida via `GET /users/me/photo`: o servidor devolve `mimeType: "image/png"` e o `imageBase64` decodifica de volta para o SVG malicioso **byte a byte, sem nenhuma sanitização ou rejeição.** O upload foi aceito e persistido sem qualquer indicação de erro.

### Achados

- **🟡 Média — Nenhuma validação de conteúdo real da imagem — `fileType` é um rótulo puramente declarado pelo cliente, nunca verificado contra os bytes reais do arquivo.** Confirmado via teste ativo: um SVG com `<script>` embutido foi aceito, armazenado e servido de volta rotulado como `image/png`, sem nenhuma rejeição. Isso é uma classe real de vulnerabilidade (confusão de tipo de conteúdo / *stored malicious file*), mas o vetor de exploração imediato é limitado no estado atual do produto: o app mobile (React Native) renderiza a foto via `<Image source={{uri: "data:image/png;base64,..."}}>`, que usa decodificadores nativos de imagem (não um WebView) — um SVG disfarçado provavelmente apenas falha ao renderizar (ícone de imagem quebrada) em vez de executar o `<script>`. O risco real está em **qualquer consumidor futuro que renderize esse conteúdo em contexto de navegador/WebView** (um painel administrativo web, uma feature de exportação, um preview de foto em um e-mail HTML, um proxy de imagem que repasse o `Content-Type` declarado) — nesse cenário, isso vira XSS armazenado clássico. Classificado como Média (não Alta) porque, hoje, não existe superfície de navegador que consuma esse dado — mas é uma bomba-relógio caso essa superfície apareça sem que este ponto seja corrigido antes. Correção recomendada: validar magic bytes do conteúdo decodificado contra o `fileType` declarado (ex: bibliotecas como `file-type` ou checagem manual dos primeiros bytes) antes de persistir.
- **🟢 Baixa — Nenhum limite de dimensões/complexidade da imagem, apenas de tamanho do base64.** Um arquivo de 530.000 caracteres base64 (~397KB decodificado) que não seja uma imagem válida (ex: um blob binário arbitrário, um vídeo curto, um arquivo compactado) passaria pela mesma validação de tamanho sem ser rejeitado por não ser uma imagem — uso do MongoDB Atlas M0 (tier gratuito, armazenamento limitado) como espaço de blob genérico, em vez de exclusivamente fotos de perfil. Mesma causa raiz do achado acima (falta de validação de conteúdo), consequência diferente (abuso de armazenamento em vez de XSS).
- **✅ Correto — Índice único em `userId` confirmado no schema** (`models/UserPhoto.ts:39`, `userPhotoSchema.index({ userId: 1 }, { unique: true })`), consistente com o que auditorias anteriores já haviam confirmado.
- **✅ Correto — `uploadProfilePhoto` usa `findOneAndUpdate` com `upsert: true` dentro de uma transação MongoDB (`session.withTransaction`)** (`user.controller.ts:290-325`), atualizando `UserPhotoModel` e `UserModel` (`hasProfilePhoto`, `profilePhotoUpdatedAt`) atomicamente na mesma transação. Combinado com o índice único, **não é possível duas requisições concorrentes de upload criarem dois documentos `user_photos` para o mesmo usuário** — o padrão upsert é seguro por construção do MongoDB (a segunda tentativa concorrente colide no índice único e é tratada pela transação), e não há uma janela onde `UserModel.hasProfilePhoto=true` e `UserPhotoModel` fiquem dessincronizados, já que ambas as escritas ocorrem na mesma transação atômica.

---

## Tarefa 9 — Achados fora do escopo explícito deste prompt

Investigação dirigida pelas categorias sugeridas no prompt (CVEs em dependências, CORS, endpoints sem autenticação indevida, payload sem limite, mass assignment) mais 2 pontos adicionais encontrados organicamente durante a leitura de código das tarefas anteriores (gestão de sessão/revogação de token, e verificação de algoritmo JWT).

### 🟡 Média — Nenhum mecanismo de revogação de sessão: redefinir a senha (e fazer logout) não invalida refresh tokens já emitidos

- **Confirmado por leitura de código, não é hipótese.** O próprio time já documentou isso como dívida técnica conhecida: `password.controller.ts:173-176` tem um comentário `TODO (Fase 3 — Gerenciamento de Sessões): Incrementar tokenVersion do usuário para invalidar todos os refresh tokens ativos. Atualmente, sessões existentes permanecem válidas até expirar.`
- Confirmado também que **não existe nenhuma rota de logout no backend** (`grep` em `auth.controller.ts`/`auth.ts` não encontra nada) — o "logout" do app mobile (`auth.store.ts`, Tarefa 1) é puramente client-side: apenas apaga o refresh token do `expo-secure-store` local. O token em si nunca é invalidado no servidor.
- **Impacto:** um refresh token vive até **30 dias** (`JWT_REFRESH_EXPIRES_IN=30d`, `.env.example`). Se um refresh token for comprometido — por exemplo, através do fallback de armazenamento em MMKV sem criptografia identificado na **[Tarefa 1](#tarefa-1--armazenamento-de-tokens-no-mobile)**, ou por qualquer outro vazamento — **nem trocar a senha, nem fazer logout no app remove o acesso do atacante.** O token roubado continua válido até expirar naturalmente, independente de qualquer ação de remediação que o usuário legítimo tome. Isso derrota o principal mecanismo que um usuário tem para recuperar uma conta comprometida.
- Classificado como Média (não Alta) porque depende da precondição de um token já estar comprometido — mas o impacto, quando essa precondição se realiza, é severo (a remediação padrão simplesmente não funciona). Combinado com o achado de storage da Tarefa 1, forma uma cadeia de risco real: storage fraco → token vazado → nem reset de senha resolve.
- **Correção recomendada:** implementar o `tokenVersion` já planejado pelo time (incrementar no reset de senha e, idealmente, adicionar uma rota `POST /auth/logout` que também o incremente; `authenticate`/`refresh` passam a comparar o `tokenVersion` do payload do JWT contra o valor atual no banco).

### 🟡 Média — Dependências com vulnerabilidades conhecidas (CVEs)

`pnpm audit --prod` no monorepo inteiro: **2 críticas, 47 altas, 29 moderadas, 5 baixas** (909 dependências de produção analisadas). Investigação por pacote:

- **`apps/api` (backend de produção): 0 dependências vulneráveis.** Confirmado via `pnpm why` para os 3 pacotes mais críticos (`shell-quote`, `tar`, `@xmldom/xmldom`) — nenhum aparece na árvore de dependências do backend. As 17 dependências diretas do `apps/api/package.json` (express, mongoose, argon2, jsonwebtoken, zod, etc.) não introduzem nenhuma das vulnerabilidades críticas/altas encontradas.
- **`apps/mobile` — maioria das CVEs críticas/altas é tooling de build do Expo, não código que roda no app final.** `shell-quote` (crítica) e `tar` (crítica) chegam via `@expo/cli` → `react-devtools-core`/build tooling — processos que rodam durante `expo start`/`expo build` na máquina do desenvolvedor ou CI, não código empacotado no bundle JS que roda no dispositivo do usuário final. Mesmo padrão para várias das 37 CVEs altas (`postcss`, `browserslist`, `js-yaml`, `brace-expansion`, `fast-uri`, `image-size`, `nanoid`, `form-data`, `@xmldom/xmldom` — todas via cadeia de `@expo/cli`/`expo-router`/`metro`). Risco real, mas do tipo "proteger a máquina de build/CI", não "proteger o usuário final do app".
- **`apps/mobile` — exceção real: `axios` (dependência direta do app, usada em `config/api.ts` para todas as chamadas à API) tem CVEs altas na versão instalada (1.15.2)**, incluindo vazamento de header `Proxy-Authorization` através de redirecionamentos HTTP→HTTPS, ReDoS via injeção no nome de cookie, e poluição de protótipo via `config.proxy`. Exploração prática no contexto deste app é baixa (o app não expõe configuração de proxy a input do usuário nem processa cookies/redirects de origens não confiáveis), mas é a única CVE desta lista que roda de fato no dispositivo do usuário final, então merece prioridade de atualização (`pnpm update axios`) sobre as demais.
- **Recomendação:** `pnpm update axios` no mobile (baixo esforço, prioridade real); atualizar a cadeia do Expo CLI/build tooling por rotina de manutenção (baixo risco imediato, mas acúmulo de dívida técnica se ignorado indefinidamente); nenhuma ação necessária no `apps/api`.

### ✅ Correto — Configuração de CORS

`index.ts:37-50` (revisto na Tarefa 2, reanalisado aqui com foco em CORS especificamente): em produção, `isAllowedOrigin` só aceita origens explicitamente listadas em `ALLOWED_ORIGINS` — sem wildcard, sem reflexão de origem arbitrária. O fallback que aceita qualquer `localhost`/`127.0.0.1` só é ativado quando `NODE_ENV === 'development'`, não vaza para produção. Requisições sem header `Origin` (o caso do app mobile nativo, que não é um browser e não envia esse header) são permitidas — comportamento correto e necessário, já que CORS é uma proteção aplicada pelo *browser*, não uma camada de autenticação; um cliente não-browser nunca é afetado por CORS de qualquer forma, protegido ou não. `credentials: true` combinado com essa validação de origem restrita (não um wildcard `*`) é a configuração correta.

### ✅ Correto — Nenhum endpoint sem autenticação indevida

Todas as rotas de todos os 15 arquivos em `apps/api/src/routes/` foram enumeradas. Os únicos endpoints sem `authenticate` são: `GET /ping` (health check), `POST /auth/register`, `POST /auth/login`, `POST /auth/refresh`, `GET /auth/google/url`, `GET /auth/google/callback`, `POST /auth/forgot-password`, `POST /auth/verify-otp`, `PATCH /auth/reset-password` (todo o fluxo de auth/recuperação de senha, que por definição precisa ser acessível sem sessão prévia), e `POST /webhooks/revenuecat` (protegido por HMAC-SHA256 em vez de JWT, já confirmado correto no contexto do diagnóstico). Nenhum endpoint de dado de usuário ficou desprotegido por engano.

### 🟢 Baixa — Limite de payload (4MB) aplicado globalmente, sem diferenciação por rota

`express.json({ limit: '4mb' })` (`index.ts:75`) é dimensionado para o caso de uso mais pesado (imagens base64 do Pantry Scanner), mas se aplica a **todas** as rotas, incluindo `/auth/login`. **Teste ativo:** enviei `POST /auth/login` com um campo `password` de ~3,9MB contra um e-mail real cadastrado — aceito e processado (401 em 247ms) sem nenhum limite específico de rota. **Hipótese testada e não confirmada:** cogitei que isso pudesse amplificar custo de CPU via hash Argon2 de um input gigante, mas a comparação de latência entre uma senha curta errada (255ms) e uma senha de ~3,9MB errada (247ms) não mostrou diferença mensurável — o Argon2id parece dominado pelos parâmetros de custo configurados (`memoryCost`/`timeCost`), não pelo tamanho do input, então essa hipótese específica de amplificação **não se confirmou**. O achado remanescente é mais modesto: consumo de banda/memória de parsing de JSON grande em endpoints que não precisam disso — defesa em profundidade recomendada (limite menor, ex: 10-50KB, especificamente em `/auth/*` e outras rotas sem upload de imagem), mas sem uma amplificação de custo comprovada que justificasse severidade maior.

### ✅ Correto — Nenhum padrão de mass assignment encontrado

Grep recursivo por `$set: req.body`, `$set: parsed.data`, `...req.body`, `...parsed.data` diretamente em operações Mongoose: nenhuma ocorrência em nenhum controller. `updateMe` (`user.controller.ts:754+`) é o exemplo mais representativo: mesmo depois do Zod (`updateUserSchema.partial()`) já ter descartado chaves desconhecidas, o controller ainda desestrutura explicitamente apenas os campos esperados (`blendiModel`, `goal`, `dailyProteinTarget`, etc.) antes de montar o objeto de update — dupla proteção contra um usuário conseguir alterar campos sensíveis como `isPro`, `totalXP` ou `role` via payload malicioso, mesmo que um schema futuro afrouxasse acidentalmente a validação.

### ✅ Correto — Sistema de OTP (esqueci minha senha) é excepcionalmente bem projetado

Achado positivo que merece destaque por contraste com a Tarefa 2 (ausência total de rate limiting de infraestrutura): `otp.service.ts` compensa isso especificamente para o fluxo de recuperação de senha — o mais sensível a força bruta por natureza (código numérico de 6 dígitos, espaço de apenas 10^6 combinações). Geração via `crypto.randomInt` (CSPRNG, não `Math.random`), hash Argon2id do código armazenado (nunca texto puro, então nem um vazamento do banco expõe os códigos ativos), **limite de 5 tentativas por código**, contador incrementado **antes** da verificação (evita bypass por corrida — embora a implementação via `record.save()` em vez de um `findOneAndUpdate` atômico com `$inc` deixe uma janela teórica muito estreita para 1 tentativa extra sob concorrência exata, de impacto desprezível dado que ainda está ordens de magnitude longe de viabilizar força bruta de 10^6 combinações), expiração de 15 minutos, e invalidação de OTPs anteriores ao gerar um novo. Nenhuma ação de correção necessária.

### 🟢 Baixa — `jwt.verify()` não especifica um allowlist explícito de algoritmos

`auth.service.ts:81,90,119` chama `jwt.verify(token, secret)` sem a opção `algorithms: ['HS256']`. Não é explorável no estado atual do código — a aplicação usa exclusivamente HMAC-SHA256 (segredo simétrico) em todos os 3 fluxos de token (access, refresh, reset), sem nenhum par de chaves assimétricas (RS256/ES256) em uso em lugar nenhum, então o ataque clássico de "confusão de algoritmo" (usar uma chave pública RSA conhecida como segredo HMAC) não tem superfície aqui. Mesmo assim, é uma prática recomendada de defesa em profundidade — fixar `algorithms: ['HS256']` explicitamente em cada chamada de `verify` elimina essa classe de risco de forma estrutural, caso o código evolua no futuro para suportar múltiplos algoritmos ou uma migração de biblioteca.

---

## Tabela de priorização consolidada — base para o prompt de correção FIX-8

Todos os achados de risco das 9 tarefas, ordenados por severidade decrescente. Achados confirmados corretos (✅) não entram nesta tabela — estão documentados em cada seção acima para referência, mas não precisam de ação. Cada linha é acionável isoladamente, sem necessidade de nova investigação.

### 🟠 Alta (7)

| # | Achado | Arquivo(s) afetado(s) | Ação de correção recomendada |
|---|---|---|---|
| A1 | Fallback silencioso do refresh token para MMKV sem criptografia se `SecureStore` falhar | `apps/mobile/src/store/auth.store.ts:180-210` | Remover o fallback para `authStorage` (MMKV) nas 3 funções (`setRefreshToken`/`getRefreshToken`/`deleteRefreshToken`); se `SecureStore` falhar, tratar como sessão não persistida (forçar novo login) em vez de degradar para storage inseguro. No mínimo, logar/alertar quando o fallback for exercitado. |
| A2 | Nenhuma instância MMKV usa `encryptionKey` | `apps/mobile/src/config/storage.ts:27-40` | Adicionar `encryptionKey` gerada e persistida via `expo-secure-store` na criação de cada `MMKV` em `createAppStorage`. Chave gerada uma vez por instalação, armazenada no Keychain/Keystore, usada para inicializar o MMKV. |
| A3 | Zero rate limiting em `/auth/login` (força bruta) | `apps/api/src/index.ts` (cadeia de middlewares), `apps/api/src/middlewares/` | Adicionar `express-rate-limit` (ou equivalente) por IP+email combinados, com backoff progressivo, no mínimo em `/auth/login`. |
| A4 | Zero rate limiting em `/auth/register` (criação em massa / abuso de custo do Pulse AI) | `apps/api/src/index.ts`, `apps/api/src/routes/auth.ts` | Rate limit por IP em `/auth/register`; considerar exigir verificação de e-mail antes de liberar `dailyAiUsage` para contas novas. |
| A5 | Zero rate limiting em endpoints autenticados (flood) | `apps/api/src/index.ts` (middleware global) | Rate limit global por usuário autenticado (ex: por `userId` do JWT), aplicado a todas as rotas via middleware, não rota a rota. |
| A6 | `Strict-Transport-Security` ausente | `apps/api/src/index.ts` | `app.use(helmet())` no topo da cadeia de middlewares (resolve também A/M/B de headers da Tarefa 5 de uma vez). |
| A7 | OTP de reset de senha / código de verificação logado em texto claro quando `NODE_ENV !== 'production'` | `apps/api/src/services/email.service.ts:113-118,161` | Trocar a checagem negativa (`!== 'production'`) por uma checagem positiva explícita de um flag dedicado (ex: `ENABLE_EMAIL_CONSOLE_LOG=true`, default `false`), nunca inferido de `NODE_ENV`. Priorizar a implementação real do Resend (Fase 4) antes do lançamento — sem isso, reset de senha não funciona de verdade em produção. |

### 🟡 Média (10)

| # | Achado | Arquivo(s) afetado(s) | Ação de correção recomendada |
|---|---|---|---|
| M1 | Todos os namespaces MMKV resolvem para o mesmo arquivo físico `'blendi-pulse'` | `apps/mobile/src/config/storage.ts` e todos os chamadores de `createAppStorage` | Não é bug isolado — resolvido automaticamente por A2 (encryptionKey), mas considerar namespaces físicos separados por sensibilidade (auth vs. cache geral) como defesa em profundidade adicional. |
| M2 | Foto de perfil em base64 completo, sem TTL, em MMKV sem criptografia | `apps/mobile/src/components/profile/ProfilePhoto.tsx:116-118` | Resolvido por A2; adicionalmente, considerar TTL de expiração do cache local. |
| M3 | Dados de saúde (blend/hidratação/suplementos, Pulse AI) em texto claro via cache do React Query | `apps/mobile/src/config/cache.config.ts:94-108`, `apps/mobile/src/config/queryClient.ts:98-113` | Resolvido por A2 (o persister usa o mesmo MMKV). |
| M4 | Ausência de `express-mongo-sanitize` como defesa em profundidade contra injeção NoSQL | `apps/api/package.json`, `apps/api/src/index.ts` | Instalar `express-mongo-sanitize`, registrar como middleware global logo após `express.json()`/`express.urlencoded()` e antes das rotas. Proteção hoje é 100% incidental (só Zod); isso adiciona uma segunda camada estrutural. |
| M5 | `X-Content-Type-Options` e `Content-Security-Policy` ausentes | `apps/api/src/index.ts` | Resolvido junto com A6 via `helmet()`. |
| M6 | `message` de erro nunca sanitizado por ambiente em `errorHandler.ts` (só `stack` é) | `apps/api/src/middlewares/errorHandler.ts:20-31` | Em produção, usar uma mensagem genérica (`DEFAULT_ERROR_MESSAGE`) para qualquer erro sem `code`/`statusCode` explícito (ou seja, que não passou por `sendErrorResponse`), preservando `err.message` só em dev. |
| M7 | `REVENUECAT_WEBHOOK_SECRET` sem validação de comprimento mínimo/força | `apps/api/src/config/env.ts:118-120` | Adicionar `.min(32, ...)` condicionalmente quando o valor não for vazio (mesmo padrão dos secrets JWT), mantendo a opcionalidade total do campo. |
| M8 | Upload de foto aceita qualquer conteúdo — `fileType` é só um rótulo declarado pelo cliente, sem checagem de magic bytes | `apps/api/src/controllers/user.controller.ts:257-276,93-109` | Validar os primeiros bytes do buffer decodificado contra a assinatura real de JPEG (`FF D8 FF`)/PNG (`89 50 4E 47`) antes de persistir; rejeitar com 400 se não corresponder ao `fileType` declarado. Bibliotecas como `file-type` cobrem isso. |
| M9 | Nenhuma revogação de sessão — reset de senha e logout não invalidam refresh tokens ativos | `apps/api/src/controllers/password.controller.ts:173-176`, `apps/api/src/models/User.ts`, `apps/api/src/services/auth.service.ts` | Implementar `tokenVersion` no `UserModel` (já planejado pelo próprio time, TODO existente): incrementar no reset de senha; adicionar `POST /auth/logout` autenticado que também incrementa; `refresh`/`authenticate` passam a comparar `tokenVersion` do JWT contra o valor atual do usuário no banco. |
| M10 | Dependências vulneráveis: `axios` (mobile, dependência direta real) com CVEs altas na versão instalada | `apps/mobile/package.json` (`axios`) | `pnpm update axios` para a versão patcheada mais recente da linha 1.x. Rotina separada de manutenção para a cadeia de build tooling do Expo CLI (menor urgência, não afeta usuário final). |

### 🟢 Baixa (7)

| # | Achado | Arquivo(s) afetado(s) | Ação de correção recomendada |
|---|---|---|---|
| B1 | Inconsistência 403 vs. 404 em IDOR permite enumeração de existência de recursos | `apps/api/src/controllers/shoppingList.controller.ts`, `apps/api/src/controllers/conversation.controller.ts` | Opcional: padronizar para 404 em vez de 403 quando o recurso pertence a outro usuário. Baixo retorno sobre esforço dado que os IDs não são adivinháveis; avaliar se vale a pena. |
| B2 | `X-Powered-By: Express` exposto | `apps/api/src/index.ts` | Resolvido junto com A6 via `helmet()` (ou `app.disable('x-powered-by')` isoladamente). |
| B3 | `X-Frame-Options`/`X-XSS-Protection` ausentes | `apps/api/src/index.ts` | Resolvido junto com A6 via `helmet()`. |
| B4 | Stack trace com caminho de filesystem local retornado em dev (funciona como projetado; risco só se `NODE_ENV` for mal configurado em produção) | `apps/api/src/middlewares/errorHandler.ts:20-31` | Nenhuma ação isolada necessária — coberto pela correção de M6, que já reforça a sanitização de erro por ambiente. Validar no deploy do Railway que `NODE_ENV=production` está de fato setado (ação de infraestrutura, não de código). |
| B5 | Nenhuma validação de dimensões/complexidade da imagem de perfil, só tamanho do base64 | `apps/api/src/controllers/user.controller.ts:269` | Resolvido em conjunto com M8 (a validação de magic bytes já rejeita blobs não-imagem). |
| B6 | Limite de payload (4MB) aplicado globalmente sem diferenciação por rota | `apps/api/src/index.ts:75` | Aplicar um limite menor (ex: 20-50KB) via `express.json({limit:...})` específico nas rotas que não lidam com upload de imagem (`/auth/*`, a maioria dos endpoints), mantendo 4MB só em `/pantry-scanner/analyze` e `/users/profile-photo`. |
| B7 | `jwt.verify()` sem allowlist explícito de algoritmos | `apps/api/src/services/auth.service.ts:81,90,119` | Adicionar `{ algorithms: ['HS256'] }` como segundo argumento de opções em cada chamada de `jwt.verify`. |

---
