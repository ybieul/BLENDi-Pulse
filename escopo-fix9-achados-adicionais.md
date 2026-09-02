# ESCOPO — Correção dos achados adicionais (fora do escopo original do diagnóstico)

**Data:** 2026-09-02
**Origem:** auditoria estendida pedida após o FIX-8, cobrindo rotas que os 9 dias do diagnóstico original (`diagnostico-seguranca.md`) não haviam testado — favorites, supplement-stack, purchases, pantry-scanner, hydration-logs, resolução de conversa do Pulse AI, e os handlers restantes de `users` e do fluxo Google OAuth.
**Resultado da auditoria:** a esmagadora maioria do código auditado está corretamente escopada (mesmo padrão de `req.user.sub` já confirmado em todo o resto do app). 4 achados novos, detalhados abaixo, dos quais 1 é uma vulnerabilidade real de account takeover.

---

## CONTEXTO

Este escopo assume o estado do código **após** as 9 tarefas do FIX-8 (`escopo-fix9` é a continuação numérica — não confundir com as rotas `/auth/*` já corrigidas lá, que não são tocadas aqui) e a correção do bug de rotas de reset de senha. Antes de cada etapa, releia integralmente o arquivo indicado para confirmar que os números de linha e nomes de variável ainda correspondem ao código atual — o diagnóstico foi feito em leitura estática mais teste ativo pontual, e pode haver pequenas divergências se algo mudou entre a auditoria e a implementação.

## OBJETIVO

Corrigir os 4 achados abaixo, na ordem apresentada (por severidade decrescente), sem alterar contratos de API, schemas Zod exportados pelo pacote `shared`, ou qualquer comportamento já confirmado correto nas duas rodadas de diagnóstico anteriores.

---

## ETAPA 1 — Verificar `email_verified` antes de vincular conta Google a uma conta existente (🔴 Alta)

**Arquivo:** `apps/api/src/services/google.service.ts` e `apps/api/src/controllers/google.controller.ts`

**O problema:** no fluxo `GET /auth/google/callback`, quando o e-mail do token do Google já existe no banco mas ainda **não** tem `googleId` vinculado (`google.controller.ts:154-163`, "Caso 2" do fluxo documentado no cabeçalho do arquivo), o backend vincula a conta Google à conta existente **só com base no campo `email` do payload** — sem checar `payload.email_verified`. Um id_token do Google com `email_verified: false` cujo `email` bata com o de uma conta BLENDi já cadastrada (via email/senha) resultaria na vinculação da conta da vítima ao Google do atacante, dando a ele acesso total dali em diante (login por Google passaria a funcionar para a conta da vítima).

**Evidência de que a checagem já foi planejada e nunca implementada:** a chave `errors.auth.email_not_verified` já existe nos dois arquivos de locale do mobile (`apps/mobile/src/locales/en.json` e `pt-BR.json`, dentro do objeto aninhado `errors.auth`) com o texto "Your Google account email is not verified." / "O e-mail da sua conta Google não está verificado." — mas **nenhum código no repositório referencia essa chave**. É a mesma chave que o fluxo já usa para outros erros de redirect (`errors.auth.google_cancelled`, `errors.auth.invalid_state`, `errors.auth.google_auth_failed` — todos usados via `res.redirect('blendipulse://auth/callback?error=<chave>')`).

**O que fazer:**

1. Em `apps/api/src/services/google.service.ts`:
   - Adicione `emailVerified: boolean` à interface `GoogleUserInfo` (linhas 38-47).
   - Em `getUserInfoFromToken` (linha 126+), leia `payload.email_verified` (campo padrão do id_token do Google, já disponível em `ticket.getPayload()` sem mudança nenhuma na chamada ao SDK) e inclua `emailVerified: payload.email_verified === true` no objeto retornado (ao lado de `googleId`, `email`, `name`, `picture`).

2. Em `apps/api/src/controllers/google.controller.ts`:
   - Logo após obter `userInfo` (linha ~142, após `userInfo = await getUserInfoFromToken(idToken);`, ainda dentro do mesmo bloco `try`), adicione a checagem: se `!userInfo.emailVerified`, redirecione com `res.redirect('blendipulse://auth/callback?error=errors.auth.email_not_verified')` e retorne — **antes** de qualquer lookup no banco (`UserModel.findOne`), para que a rejeição valha tanto para o Caso 2 (vinculação a conta existente — o risco de account takeover) quanto para o Caso 3 (criação de conta nova com e-mail não verificado — higiene de dados, evita que um e-mail não confirmado entre no sistema via este fluxo).
   - Não altere a lógica do Caso 1 (login direto quando `googleId` já existe) — usuários que já passaram por essa checagem em um login anterior não precisam repetir a verificação a cada login subsequente.

**Por que checar cedo, uma vez só, em vez de só no Caso 2:** simplifica o código (uma única checagem, não duas) e cobre os dois cenários de risco real (takeover no Caso 2, e-mail não confirmado entrando no sistema no Caso 3) com a mesma linha.

---

## ETAPA 2 — Allowlist de algoritmo no `jwt.verify` do state CSRF do Google (🟡 Média)

**Arquivo:** `apps/api/src/controllers/google.controller.ts`

**O problema:** a Tarefa 7 do FIX-8 adicionou `{ algorithms: ['HS256'] }` às 3 chamadas `jwt.verify` de `auth.service.ts`, mas esta chamada específica — `jwt.verify(state, env.JWT_ACCESS_SECRET)`, linha 122, usada para validar o `state` de proteção CSRF do fluxo OAuth — está em outro arquivo e ficou fora do escopo daquela tarefa. Mesma classe de risco (não explorável hoje, já que o app usa exclusivamente HS256 em todo lugar, mas é o mesmo desvio de prática recomendada).

**O que fazer:**
- Em `apps/api/src/controllers/google.controller.ts:122`, adicione o terceiro argumento: `jwt.verify(state, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] })`.

---

## ETAPA 3 — Validação de magic bytes no upload do Pantry Scanner (🟢 Baixa)

**Arquivos:** `apps/api/src/controllers/pantryScanner.controller.ts` e `packages/shared/src/schemas/pantryScanner.ts`

**O problema:** `pantryScanSchema` (linhas 8-18 de `pantryScanner.ts`) valida `mimeType` como um enum (`'image/jpeg' | 'image/png'`), mas — assim como o achado M8 corrigido na Tarefa 5 do FIX-8 para foto de perfil — esse valor é inteiramente declarado pelo cliente, nunca verificado contra os bytes reais do `imageBase64`. Diferente da foto de perfil, esta imagem não é persistida nem servida de volta a nenhum cliente (é processada uma vez pela Vision AI em `analyzePantry`, `pantryScanner.controller.ts:413+`, e descartada) — então o risco aqui não é XSS armazenado, é abuso de custo/quota: um payload que não é uma imagem de verdade ainda consome uma chamada real à Vision AI (e conta contra o limite mensal de scans do usuário) antes de falhar.

**O que fazer:**
- Em `apps/api/src/controllers/pantryScanner.controller.ts`, adicione uma função `hasValidImageMagicBytes(imageBase64: string, mimeType: 'image/jpeg' | 'image/png'): boolean` — mesma lógica da já existente em `user.controller.ts` (Tarefa 5 do FIX-8: decodifica os primeiros 16 caracteres base64 via `Buffer.from(imageBase64.slice(0, 16), 'base64')`, confere contra `FF D8 FF` para JPEG ou `89 50 4E 47` para PNG), adaptada para o formato de `mimeType` completo (`image/jpeg`/`image/png`) usado neste schema, diferente do `fileType` curto (`jpeg`/`png`) usado em `user.controller.ts`.
- Em `analyzePantry` (linha 433, logo após `const { imageBase64, mimeType } = parsed.data;`), chame essa validação **antes** de checar o limite mensal de scans e antes de qualquer chamada à Vision AI. Se inválida, rejeite com `400` e um código novo `scanner/invalid-content` (mensagem `'Invalid image content.'`).
- Adicione a chave i18n `errors.scanner_invalid_content` (convenção flat, mesma da Tarefa 5) nos dois arquivos de locale do mobile: `"Invalid image content."` (en) / `"Conteúdo de imagem inválido."` (pt-BR).

---

## ETAPA 4 — Limite superior em `amountMl` do log de hidratação (🟢 Baixa)

**Arquivo:** `apps/api/src/controllers/hydration.controller.ts`

**O problema:** `getAmountMl` (linhas 160-172) rejeita valores `≤ 0`, não inteiros, ou não numéricos, mas não tem limite superior — um usuário pode registrar `amountMl: 999999999` em um único log. Não é vazamento nem invasão (o "dano" fica só nas próprias estatísticas do usuário, não afeta outros), mas é uma lacuna de validação de dado que vale fechar já que estamos revisando o arquivo.

**O que fazer:**
- Adicione uma constante `MAX_HYDRATION_AMOUNT_ML = 5000` (5 litros — generoso o suficiente para qualquer uso real, inclusive registro manual de um dia inteiro de uma vez) próxima a `DEFAULT_HYDRATION_AMOUNT_ML` (linha 17).
- Em `getAmountMl`, ajuste a condição de rejeição (linha 167) para também rejeitar `amountMl > MAX_HYDRATION_AMOUNT_ML`.
- Não é necessário novo código de erro — o retorno `null` já cai no branch existente que responde com o erro de validação genérico do endpoint (`sendInvalidAmountMl`, já usado para os outros casos de rejeição).

---

## REQUISITOS

- Releia cada arquivo integralmente antes de editar, confirmando que os números de linha citados acima ainda batem com o código atual.
- Para a Etapa 1, teste ativamente com um usuário real: crie uma conta via email/senha, e valide (por leitura de código, já que simular um id_token do Google com `email_verified: false` exige um token real assinado pelo Google) que a checagem está posicionada corretamente — antes de qualquer `UserModel.findOne`/`create` do fluxo.
- Para as Etapas 2-4, valide com `tsc --noEmit` limpo e, onde aplicável, teste ativo real (Pantry Scanner com payload não-imagem disfarçado; hydration-logs com valor acima do novo limite).
- Rode os testes de regressão relevantes: login/registro via Google (Casos 1 e 3, se houver forma de testar sem um token real do Google — ao menos confirmar por leitura de código que não foram alterados), Pantry Scanner com imagem real (upload legítimo continua funcionando), hydration-logs com valor normal (continua aceitando).

## NÃO FAÇA

- Não altere a lógica do Caso 1 (login direto via `googleId` já vinculado) nem do Caso 3 além de adicionar a checagem de `email_verified` no ponto único indicado — não introduza uma segunda checagem duplicada dentro do Caso 2.
- Não remova nem renomeie a chave `errors.auth.email_not_verified` já existente nos locales — ela já está pronta para ser usada, só precisa ser referenciada no código.
- Não toque nas 3 chamadas `jwt.verify` de `auth.service.ts` — já corrigidas na Tarefa 7 do FIX-8.
- Não persista nenhum dado de teste malicioso (payload não-imagem do Pantry Scanner, valores extremos de hidratação) além da sessão de validação — limpe ao final.

## CRITÉRIOS DE ACEITE

**Etapa 1:** `GoogleUserInfo` tem o campo `emailVerified`; `google.controller.ts` rejeita com redirect `?error=errors.auth.email_not_verified` antes de qualquer lookup no banco quando `emailVerified` for `false`; Casos 1 e 3 continuam funcionando para tokens com e-mail verificado (confirmação por leitura de código, já que não há como forjar um id_token real do Google neste ambiente).

**Etapa 2:** `jwt.verify(state, ...)` em `google.controller.ts` passa a incluir `{ algorithms: ['HS256'] }`; `tsc --noEmit` limpo.

**Etapa 3:** `POST /pantry-scanner/analyze` com um payload não-imagem (ex: texto puro em base64) declarado como `image/png` retorna `400 scanner/invalid-content`; uma imagem real continua sendo aceita e processada normalmente.

**Etapa 4:** `POST /hydration-logs` com `amountMl: 999999` retorna o erro de validação existente (`400`); `amountMl: 500` continua sendo aceito normalmente.

---

## Priorização

| # | Achado | Severidade | Arquivo(s) |
|---|---|---|---|
| 1 | Account takeover via Google OAuth sem checar `email_verified` | 🔴 Alta | `google.service.ts`, `google.controller.ts` |
| 2 | `jwt.verify(state)` sem allowlist de algoritmo | 🟡 Média | `google.controller.ts` |
| 3 | Pantry Scanner sem validação de magic bytes | 🟢 Baixa | `pantryScanner.controller.ts`, `packages/shared/src/schemas/pantryScanner.ts` |
| 4 | `amountMl` do hydration log sem limite superior | 🟢 Baixa | `hydration.controller.ts` |
