# CP-AUDIT.7 — Correção de documentação (INVENTARIO, endpoints.md, architecture.md)

**Escopo:** checkpoint só de documentação — nenhum arquivo de código de produção foi alterado. 3 arquivos corrigidos: `docs/INVENTARIO-FUNCIONALIDADES.md`, `docs/api/endpoints.md`, `docs/architecture.md`.
**Método:** cada afirmação nova foi confirmada contra o código real (arquivo + trecho) antes de ser escrita — sem generalizar a partir do prompt.

---

## Tarefa 1 — docs/INVENTARIO-FUNCIONALIDADES.md

1.1. Onboarding (Corpo) + fórmula de cálculo: corrigido. A tela real (`OnboardingBodyScreen.tsx`) coleta peso, altura, **data de nascimento**, **sexo biológico** e **meta de peso** (além do nível de atividade). A fórmula (`calculateMacroTargets`, `apps/api/src/utils/macroCalculation.utils.ts`) usa **idade e sexo reais** (idade derivada de `birthDate` no momento do cálculo via `calculateAge`, nunca armazenada; constante +5/−161 por `biologicalSex`) — não mais idade fixa em 30 anos.
2. E-mails automáticos: corrigido. `email.service.ts` envia de verdade por SMTP (Google Workspace) quando `ENABLE_DEV_EMAIL_LOG=false` — confirmado lendo o serviço. Boas-vindas e redefinição de senha são enviados de verdade em produção. Confirmei por `grep` que `sendVerificationEmail` **continua sem nenhum caller** em todo `apps/api/src` — esse terceiro método é o único que permanece em modo stub. A linha espelhada na Tarefa 8 (checklist "NÃO existe") foi corrigida no mesmo sentido.

Nenhuma outra seção do documento foi tocada.

## Tarefa 2 — docs/api/endpoints.md

2.1. Adicionadas `GET /health` (readiness check, junto de `GET /ping`) e `GET /users/me/weight-history` (junto das outras rotas de `/users/me`), no mesmo formato das rotas vizinhas.

2.2. `POST /auth/register`: `registerSchema` (`packages/shared/src/schemas/auth.ts`) **não aceita** `weightGoal`/`activityLevel`/`targetWeight`/`birthDate`/`biologicalSex` — não fazia sentido documentá-los como campos de request desta rota, e uma nota explícita foi adicionada esclarecendo isso (a conta nasce com defaults internos, sobrescritos no primeiro `PATCH /users/me` real). O único campo da lista do prompt que de fato existe nesta rota é `dailyFatTarget` (calculado automaticamente na criação da conta) — adicionado à resposta.

`PATCH /users/me`: `updateUserSchema` (`packages/shared/src/schemas/user.ts`) aceita todos os 10 campos da lista do prompt. Adicionados à tabela de request e ao exemplo de resposta: `weightGoal`, `activityLevel`, `targetWeight`, `birthDate`, `biologicalSex`, `completingBodyOnboarding`, `dailyFatTarget`, `hasRealBodyProfile`, `imc`/`imcUnit`/`imcClassification` (condicionais ao recálculo automático) e `weightTargetEta` (condicional a `weight`+`targetWeight` presentes) — todos confirmados lendo `updateMe` (`apps/api/src/controllers/user.controller.ts:775-1062`).

2.3. Pulse AI: adicionada menção explícita de que `weightGoal` (lose/maintain/gain) também personaliza o prompt (`buildWeightGoalSection`, `promptBuilder.service.ts`), junto de `blendiModel` e `goal`.

**Nota de transparência:** ao reescrever os exemplos JSON de `POST /auth/register` e `PATCH /users/me` para incluir os campos acima, também incluí alguns campos que já existiam de fato na resposta real do controller mas não estavam na lista do prompt (`unitSystem`, `dailyCarbTarget`, `longestStreak` em `register`) — fiz isso só para manter o exemplo JSON internamente coerente (não fazia sentido pular um campo real no meio do mesmo bloco que eu já estava corrigindo), não para expandir o escopo da tarefa.

## Tarefa 3 — docs/architecture.md

3.1. Integrações de terceiros atualizadas na seção "Backend API" (System Overview) e no diagrama de fluxo: Google OAuth (já existia) + provedor de IA configurável (OpenAI/Anthropic/Google) para Pulse AI e Pantry Scanner Vision (`services/aiProvider.service.ts`) + RevenueCat (verificação de compra + webhook) + Expo Push Notification service + SMTP (Google Workspace).

3.2. Removidas as 3 referências a "Phase 0" nos 3 locais indicados (Mobile Client, Internationalization Architecture, Offline Strategy), reescritas para descrever o estado atual (React Query/MMKV em uso real e amplo, não "planejado"; namespaces de i18n generalizados em vez de uma lista/contagem estática que muda com frequência — confirmei hoje 22 namespaces reais em `en.json`, mas documentei sem hardcodar o número, exatamente como o prompt pediu).

**Achado extra fixado (fora dos 3 locais listados no prompt):** encontrei uma 4ª menção a "Phase 0" na seção "3. Persistence" ("no object storage provider is integrated in the current Phase 0 codebase"), do mesmo tipo exato do item 3.2. Corrigi também, já verificando contra o código (`UserPhoto.ts`: fotos de perfil enviadas pelo usuário são salvas como base64 direto no MongoDB, `user_photos` — confirma que a frase de fundo ainda é verdadeira, só a moldura "Phase 0" estava desatualizada).

3.3. Corrigido o payload de erro padronizado: o campo real que falta era `code` (formato `dominio/erro`), confirmado em `errorHandler.ts:55-61` e no uso pelo mobile em `apps/mobile/src/utils/error.utils.ts` (`getApiErrorTranslationKey`, que lê `code`, não `message`).

3.4. Tabela de Environment Variables expandida com 3 grupos novos (Email/SMTP, AI Providers, RevenueCat) + a variável de token do Expo na seção geral — todos os nomes/propósitos confirmados lendo `apps/api/src/config/env.ts` linha a linha, não adivinhados.

3.5. Tabela de Security Decisions expandida com 4 linhas novas: rate limiting por rota (`middlewares/rateLimiter.ts`), sanitização contra injeção de operadores MongoDB (incluindo o motivo real de não usar o middleware padrão da lib — quebra no Express 5), headers de segurança via `helmet()`, e validação de origem CORS com rejeição controlada em 403 (`code: 'cors/origin-not-allowed'`, confirmado em `apps/api/src/index.ts`).

---

## Tarefa 4 — Achados adicionais (documentados, NÃO corrigidos)

### No próprio `docs/api/endpoints.md` (fora do escopo literal da Tarefa 2, mas relevante)

1. **`POST /users/calculate-macros` continua desatualizada e agora contradiz o resto do arquivo.** A seção ainda afirma que o cálculo usa "a fixed assumed age of 30" e a tabela de request não lista `birthDate`/`biologicalSex`/`weightGoal`/`targetWeight` (todos obrigatórios/opcionais reais em `calculateMacrosSchema`); a resposta documentada não inclui `dailyFatTarget` nem `weightTargetEta`. Isso contradiz diretamente o que a Tarefa 1 corrigiu no INVENTARIO e o que a Tarefa 2 documentou em `PATCH /users/me` (que cita a mesma fórmula). Não corrigi porque a Tarefa 2 do prompt listava explicitamente só `POST /auth/register` e `PATCH /users/me`.

2. **`GET /users/me` está muito mais desatualizada do que `PATCH /users/me` estava antes desta correção.** O exemplo de resposta documentado hoje tem uma fração pequena dos campos reais retornados por `getMe` (`user.controller.ts:190-...`): faltam, pelo menos, `weightGoal`, `weight`, `height`, `targetWeight`, `activityLevel`, `birthDate`, `biologicalSex`, `hasRealBodyProfile`, `pushToken`, `notificationPreferences`, `dailyPulseTime`, `dailyFatTarget`, `hasProfilePhoto`, `profilePhotoUpdatedAt`, `subscriptionId`/`subscriptionPlan`/`subscriptionExpiresAt`/`subscriptionCancelRequestedAt`/`revenueCatCustomerId`, `totalXP`, `lastLevelUp`, `currentLevel`, `levelProgress`. Não corrigi porque `GET /users/me` não foi citada na Tarefa 2 — mas é provavelmente o achado de maior impacto desta leva, já que é a rota mais lida por qualquer consumidor (humano ou IA) que queira entender o contrato de perfil do usuário.

3. **`POST /auth/login` ainda usa o formato antigo e minimalista de resposta** (sem `unitSystem`/`dailyCarbTarget`/`dailyFatTarget`/`longestStreak`) que `POST /auth/register` também usava antes desta correção. Como só `register` foi corrigida (por estar explicitamente no escopo), as duas rotas agora documentam formatos de `user` visivelmente diferentes para o que no código é a mesma forma de objeto.

### Inconsistência real no código-fonte (não é bug de documentação — descoberta ao ler os schemas para confirmar os campos da Tarefa 2.2)

4. `registerSchema` (`packages/shared/src/schemas/auth.ts`) valida `dailyProteinTarget` como 10-400 e `dailyCalorieTarget` como 500-10.000. `updateUserSchema` (`packages/shared/src/schemas/user.ts`) valida os mesmos nomes de campo como 10-800 (`DAILY_PROTEIN_TARGET_VALIDATION_MIN/MAX`) e 300-15.000 (`DAILY_CALORIE_TARGET_MIN/MAX`), e `dailyCarbTarget` como 0-1.500 (`DAILY_CARB_TARGET_MIN/MAX`). São dois schemas Zod diferentes validando os "mesmos" campos com faixas diferentes — pode ser intencional (register usa valores-placeholder fixos no onboarding inicial; updateMe precisa de faixas mais largas para edição manual legítima depois), mas não encontrei nenhum comentário que confirme a intenção. Não investiguei mais a fundo nem alterei nada, por estar fora do escopo deste checkpoint (código, não documentação).

   Como consequência direta, a tabela de request de `PATCH /users/me` em `endpoints.md` **já documentava antes desta correção** as faixas antigas e mais estreitas (`dailyProteinTarget`: "10 and 400", `dailyCarbTarget`: "50 and 800", `dailyCalorieTarget`: "500 and 10000") em vez das faixas reais de `updateUserSchema` citadas acima. Não toquei nesses números porque a Tarefa 2.2 pedia para **adicionar** campos faltantes, não corrigir faixas já documentadas.

### Outros documentos de referência consultados no processo

5. `docs/gemini-costs.md` modela custo só da chamada de texto do Pulse AI (`AI_PROVIDER`/`AI_MODEL`). Não cobre nenhum custo das chamadas de visão do Pantry Scanner (`VISION_PROVIDER`/`VISION_MODEL`), que são uma chamada de IA real e cobrada separadamente. Não é uma afirmação incorreta (o documento nunca alega cobrir Pantry Scanner), só incompleta frente a um custo real que existe hoje.

6. `docs/README.md`, seção "External Services Status" / "Open Questions": contém itens de status de negócio/operacional (ex.: RevenueCat "waiting on the Apple Developer Account", pagamentos pendentes do Jon) que podem estar desatualizados — por exemplo, checkpoints anteriores desta linha de auditoria (CP-AUDIT Tarefas 4 e 5, ver `progress_cp_audit_tarefa4.md`/`tarefa5.md` nas memórias desta sessão) já confirmaram RevenueCat funcional ponta a ponta no backend. Não investiguei a fundo nem corrigi porque são fatos de negócio (pagamento feito ou não, conta Apple registrada ou não) que o código não consegue confirmar nem desmentir.

---

## Status do controle de versão

Alterados **só** nesta correção (Tarefas 1-3) **e** este relatório (Tarefa 4):
- `docs/INVENTARIO-FUNCIONALIDADES.md`
- `docs/api/endpoints.md`
- `docs/architecture.md`
- `docs/fixes/cp-audit.7-documentacao-inventario-endpoints-architecture.md` (novo)

Nenhum arquivo de código de produção foi alterado. O `git status` no início desta conversa já continha outras alterações não commitadas (ex.: `apps/api/src/controllers/auth.controller.ts`, `packages/shared/src/schemas/user.ts`, `docs/fixes/cp-audit-achado1/3/4/7-*.md`, etc.) — são trabalho de checkpoints anteriores desta mesma linha de auditoria, já em andamento antes desta sessão, e não foram tocadas aqui.
