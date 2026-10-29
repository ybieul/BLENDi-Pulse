# CP-AUDIT.5 — Housekeeping: build de `@blendi/shared`, versão do app, schema morto, expiração de JWT

**Contexto:** 5ª correção da linha de checkpoints derivados da auditoria completa do backend/frontend do BLENDi Pulse (CP-AUDIT.1 a CP-AUDIT.4). As 4 tarefas abaixo são itens de housekeeping/dívida de processo, de baixo risco, já investigados e com causa e coordenadas confirmadas antes da implementação — não eram bugs ativos afetando usuário final.

## TAREFA 1 — Rebuild automático de `@blendi/shared` antes do typecheck

`@blendi/api` e `@blendi/mobile` consomem `@blendi/shared` pela pasta `dist/` publicada (campos `main`/`types`), não pelo código-fonte. O script `typecheck` da raiz rodava só `pnpm --recursive typecheck`, que no workspace `@blendi/shared` executa `tsc --noEmit` (não atualiza `dist/`) — então uma mudança de código-fonte em `@blendi/shared` podia passar batido no typecheck local dos outros dois workspaces, validando contra uma versão desatualizada do pacote.

Ajustado [`package.json:10`](../../package.json#L10) (raiz do monorepo):

```json
"typecheck": "pnpm --filter @blendi/shared build && pnpm --recursive typecheck",
```

**Teste real:** adicionado um campo obrigatório inexistente (`__typecheckRebuildProbe`) na interface `PulseAiRecipe` em `packages/shared/src/schemas/pulseAi.ts`, rodado `pnpm typecheck` da raiz sem nenhum build manual separado antes — o erro apareceu imediatamente (o próprio passo de build de `@blendi/shared`, que agora roda primeiro, falhou ao tentar compilar o pacote com a mudança). Mudança de teste revertida depois; typecheck voltou a ficar limpo.

Não foi necessário alterar os scripts `build`/`dev` da raiz (fora de escopo). O workflow de deploy no Railway já buildava as dependências antes da API — não foi tocado.

## TAREFA 2 — Versão do app sincronizada em "1.0.0"

Havia 3 valores divergentes: `apps/mobile/app.json` (manifesto Expo, fonte de verdade) já tinha `"1.0.0"`; os 4 `package.json` (raiz, `@blendi/mobile`, `@blendi/api`, `@blendi/shared`) tinham `"0.1.0"`; `docs/README.md` citava `"0.4.0"`.

**Antes de alterar**, confirmado por busca (`grep -rn` em `.ts`/`.tsx`/`.js`/`.json`/`.yml` fora de `node_modules`/`dist`) que nenhum script, build config ou lógica de runtime lê o campo `"version"` de qualquer um desses 4 `package.json` — são só metadado, nunca importados em código (`apps/api/src`, `apps/mobile/src`, `packages/shared/src`) nem referenciados em `.github/workflows/`.

Atualizados para `"1.0.0"`: [`package.json`](../../package.json), [`apps/mobile/package.json`](../../apps/mobile/package.json), [`apps/api/package.json`](../../apps/api/package.json), [`packages/shared/package.json`](../../packages/shared/package.json). Corrigido também [`docs/README.md:221`](../../docs/README.md#L221) (`0.4.0` → `1.0.0`).

**Achado adjacente, originalmente fora do escopo desta tarefa** (documentado na primeira versão deste relatório; corrigido depois a pedido do usuário — ver seção "Achado adicional corrigido" abaixo): existe uma variável de ambiente separada, `API_VERSION` (não é campo de `package.json`), que **é** lida em runtime pelos endpoints `GET /ping` e `GET /health` (`apps/api/src/routes/ping.ts`) para confirmar que um deploy no Railway foi aplicado.

## TAREFA 3 — Removido o schema morto `macroTargetSchema`

Confirmado por busca (`grep -rn "macroTargetSchema\|MacroTargetInput"` em todo o monorepo) que o único uso de ambos os símbolos era a própria definição em `packages/shared/src/schemas/user.ts` — nenhum consumidor real em `apps/api`, `apps/mobile` ou no próprio `packages/shared`. `MacroTargetInput` também não constava na lista manual de reexports nomeados do arquivo de entrada do pacote (`packages/shared/src/index.ts`), reforçando que nunca foi consumido.

Removidos de `packages/shared/src/schemas/user.ts`: o bloco completo de `macroTargetSchema` (antes nas linhas 376-416, incluindo o cabeçalho de seção) e a linha `export type MacroTargetInput = z.infer<typeof macroTargetSchema>;`. Constantes (`DAILY_CALORIE_TARGET_MIN/MAX`, `DAILY_PROTEIN_TARGET_VALIDATION_MIN/MAX`, `DAILY_CARB_TARGET_MIN/MAX`, `DAILY_FAT_TARGET_MIN/MAX`) e `rangeErrorMessage` permanecem — ainda usadas por outros schemas do mesmo arquivo. Arquivo de entrada do pacote (export wildcard) não precisou de edição.

Busca pós-remoção confirma zero ocorrências restantes dos dois símbolos em todo o monorepo.

## TAREFA 4 — `JWT_ACCESS_EXPIRES_IN`/`JWT_REFRESH_EXPIRES_IN` conectadas de verdade

Em [`apps/api/src/config/auth.ts`](../../apps/api/src/config/auth.ts), os campos `expiresIn` de `accessToken`/`refreshToken` usavam os literais fixos `'15m' as const`/`'30d' as const` em vez das variáveis de ambiente já validadas em `env.ts` (`JWT_ACCESS_EXPIRES_IN`/`JWT_REFRESH_EXPIRES_IN`, ambas com os mesmos valores-padrão). Trocado para `env.JWT_ACCESS_EXPIRES_IN`/`env.JWT_REFRESH_EXPIRES_IN`.

**Consumidor afetado pela tipagem:** `jwt.sign()` (`apps/api/src/services/auth.service.ts`) espera `SignOptions['expiresIn']` como `StringValue | number`, não `string` genérica — o literal `as const` satisfazia isso antes; a `string` genérica de `env.ts` não satisfaz. Corrigido ajustando a tipagem no ponto de consumo (`config/auth.ts`, import `type { SignOptions } from 'jsonwebtoken'`, cast `as SignOptions['expiresIn']` nos dois campos), sem reintroduzir nenhum valor fixo.

**Testes reais executados:**
1. Gerado um access token e um refresh token com os valores-padrão (`.env` já tinha `JWT_ACCESS_EXPIRES_IN=15m`/`JWT_REFRESH_EXPIRES_IN=30d`) e decodificado `exp - iat`: `900` (15m) e `2.592.000` (30d) — idêntico ao comportamento anterior ao hardcode.
2. Caminho configurável ponta a ponta: com `JWT_ACCESS_EXPIRES_IN=3s` (env var sobrescrita só para esse processo de teste), o token gerado embutiu `exp - iat = 3`; `verifyAccessToken` aceitou o token imediatamente após gerado e rejeitou com `TokenExpiredError` após ~4s — confirmando que a variável afeta de fato a expiração, não só que o valor é lido.

Nenhuma alteração em `REVENUECAT_APP_ID` nem em nenhuma outra env var fora das duas tratadas aqui.

## Achado adicional corrigido (Tarefa 5 — tarefa final em aberto)

Durante a Tarefa 2, identificado que `apps/api/.env`/`.env.example` tinham uma variável `API_VERSION=0.1.0`, lida em runtime por `GET /ping` e `GET /health` (`apps/api/src/routes/ping.ts:22,35`) e documentada em `docs/api/endpoints.md:2924` como o valor usado para confirmar que um deploy no Railway foi de fato aplicado. É uma variável independente dos 4 `package.json` tocados pela Tarefa 2 (não é lida de lá), então ficou fora do escopo original e foi só documentada, sem correção, na primeira versão deste relatório.

A pedido do usuário, corrigida na mesma sessão:

- [`apps/api/.env`](../../apps/api/.env) (local, não versionado — `.gitignore` da API o exclui) e [`apps/api/.env.example`](../../apps/api/.env.example) (versionado, template): `API_VERSION` `0.1.0` → `1.0.0`.
- [`docs/api/endpoints.md:2924`](../../docs/api/endpoints.md#L2924): exemplo de resposta de `GET /ping` atualizado de `"0.1.0"` para `"1.0.0"`.
- Validado ao vivo: `env.API_VERSION` carregado via `tsx` confirma `"1.0.0"` após a mudança; `pnpm typecheck` (3 workspaces) e `pnpm --filter @blendi/api test` (39/39) seguem limpos depois da correção.

**Não alterado — fora do alcance deste repositório:** o valor real de `API_VERSION` configurado no ambiente de produção do Railway é definido direto no painel do Railway, não lido deste `.env`/`.env.example` locais. Se o app em produção também deve reportar `1.0.0` em `/ping`/`/health`, essa variável precisa ser atualizada manualmente no Railway — ação em infraestrutura compartilhada que não foi tomada aqui sem confirmação explícita.

Nenhum outro uso real de `macroTargetSchema`/`MacroTargetInput` ou das env vars JWT fora do já mapeado foi encontrado.

## Validação geral

- `pnpm typecheck` (raiz, builda `@blendi/shared` antes dos outros dois workspaces): limpo nos 3 workspaces, antes e depois de cada tarefa.
- `pnpm --filter @blendi/api test`: 39/39 passando, 0 falhas, sem regressão.
- `git status` confirmado: só os arquivos esperados pelas 4 tarefas foram alterados (`package.json` raiz, `apps/mobile/package.json`, `apps/api/package.json`, `packages/shared/package.json`, `docs/README.md`, `packages/shared/src/schemas/user.ts`, `apps/api/src/config/auth.ts`) — nenhum arquivo fora do escopo tocado.
- `REVENUECAT_APP_ID` não foi removida nem alterada.
- Versão do app não foi definida para nenhum valor diferente de `1.0.0`.

## Resumo

4 tarefas de housekeeping implementadas e validadas isoladamente: (1) typecheck da raiz agora builda `@blendi/shared` antes de typecheckar `@blendi/api`/`@blendi/mobile`, provado com uma mudança de teste real revertida depois; (2) versão `1.0.0` sincronizada nos 4 `package.json` + `docs/README.md`, confirmado antes que o campo não é lido em runtime; (3) `macroTargetSchema`/`MacroTargetInput` removidos de `packages/shared`, confirmado zero uso restante; (4) `JWT_ACCESS_EXPIRES_IN`/`JWT_REFRESH_EXPIRES_IN` agora controlam de fato a expiração dos tokens, validado com teste ao vivo de expiração real (3s) além da paridade de comportamento padrão (15m/30d). Achado adicional (`API_VERSION` em `.env`/`.env.example`, divergente em `0.1.0`) também corrigido a pedido do usuário, com o único ponto restante — o valor real configurado no painel do Railway em produção — deixado explicitamente de fora por ser infraestrutura compartilhada fora do alcance deste repositório.
