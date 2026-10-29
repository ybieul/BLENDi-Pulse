# CP-AUDIT Achado 7 — `weight`/`height` sem piso/teto em `calculateMacrosSchema`

**Contexto:** achado nº 7 da "Lista priorizada de achados para CP próprio" em [`cp-audit-completo-backend-frontend-documentacao.md`](cp-audit-completo-backend-frontend-documentacao.md) (Tarefa 2): os campos `weight`/`height` de `calculateMacrosSchema` (`packages/shared/src/schemas/user.ts`) validavam só com `.positive()` — aceitavam, por exemplo, um peso de 0,5kg ou uma altura de 1cm sem rejeitar. Mesma classe do bug de `targetWeight` no mesmo schema, já corrigido antes desta sessão (piso/teto 20-300kg). Os outros 3 pontos do app que já impõem peso/altura fisicamente plausíveis — `updateUserSchema.weight/height` (20-300 / 100-250), o modelo Mongoose de usuário (mesmos números) e o próprio `targetWeight` deste schema — já estavam corretos e serviram de referência.

## TAREFA 1 — Piso/teto em `calculateMacrosSchema.weight`/`height`

Em [`packages/shared/src/schemas/user.ts:312-326`](../../packages/shared/src/schemas/user.ts#L312-L326), o `.positive('errors.validation.number_range')` solto de cada campo foi substituído por `.min()/.max()` com `rangeErrorMessage`, exatamente no mesmo estilo de encadeamento já usado por `targetWeight` (linhas 342-348, mesmo arquivo) e por `weight`/`height` de `updateUserSchema` (linhas 232-246):

- `weight`: piso 20, teto 300 (kg).
- `height`: piso 100, teto 250 (cm).

`required_error`/`invalid_type_error` de ambos os campos não foram tocados (continuam `errors.validation.required` / `errors.validation.number_range`, a checagem de tipo/obrigatoriedade pré-existente) — só o piso/teto que faltava foi adicionado. `targetWeight` no mesmo schema, `updateUserSchema` e o modelo Mongoose não foram alterados.

## TAREFA 2 — Verificação de lacunas equivalentes (sem corrigir)

Nenhuma outra lacuna da mesma classe encontrada:

- **Resto do mesmo arquivo:** `birthDate` (via `birthDateSchema`, compartilhado pelos dois schemas) já aplica piso/teto de idade plausível (`MIN_PLAUSIBLE_AGE_YEARS`/`MAX_PLAUSIBLE_AGE_YEARS`, 13-120). Nenhum outro campo de `weight`/`height`/medida física existe fora de `user.ts` em `packages/shared/src/schemas/`.
- **Modelo Mongoose** (`apps/api/src/models/User.ts:397-401` e `590-607`): `weight`, `height`, `targetWeight` e `weightHistory[].weight` já têm os mesmos pisos/tetos (20-300 / 100-250). Nada para corrigir.
- **Mobile:** os dois únicos callers reais que coletam peso/altura — `OnboardingBodyScreen.tsx:156-157` e `CompleteProfileScreen.tsx:216-217` — já validam `storageWeight >= 20 && storageWeight <= 300` e `storageHeight >= 100 && storageHeight <= 250` no cliente antes de habilitar o envio (`weightValid`/`heightValid` bloqueando `canSubmit`/`canFetch`). Nenhum caso legítimo do fluxo real passava valores fora da faixa mesmo antes desta correção, e nenhum dos dois precisa de ajuste.
- **Observação menor, não classificada como achado:** `updateUserSchema.scanCount` (linha 275-281 do mesmo arquivo) tem só `.min(0, ...)`, sem `.max()`. Na prática é inofensivo: `updateMe` (`apps/api/src/controllers/user.controller.ts:793-811`) nunca lê `scanCount` de `parsed.data` — o campo passa a validação do Zod mas é descartado antes de qualquer gravação, então não há caminho real de abuso hoje. Registrando só por completude, não accionável.
- **Observação pré-existente, não introduzida por esta correção:** o próprio comentário acima de `targetWeight` no schema (linhas 328-339) já documentava que a validação de piso/teto roda sobre o valor bruto do body, **antes** da conversão de unidade (`metricWeight`/`metricHeight` só são calculados depois do `parsed.data`, em `user.controller.ts:1163-1166`). Isso significa que, em teoria, um `unitSystem: 'imperial'` com `height` em polegadas seria validado contra 100-250 (que faria sentido em cm, não em polegadas) — mas o único caller real (`OnboardingBodyScreen`) sempre converte pra métrico localmente e hard-codeia `unitSystem: 'metric'` na chamada, então essa ordem de validação nunca é exercitada na prática hoje. Documentado também em `docs/api/endpoints.md` (seção deste endpoint) por clareza, sem alterar o código.

## Testes reais

Executados ao vivo contra `POST /users/calculate-macros` (servidor local, `tsx watch`, porta 3000 — reiniciado nesta sessão para carregar o `packages/shared` recompilado, já que o processo anterior tinha o `dist/` antigo em memória). Usuário de teste criado via `/auth/register`, usado só para obter um JWT válido, e removido ao final (confirmado por varredura nas 14 collections do banco: nenhum resíduo em nenhuma coleção com efeito colateral, só o próprio documento em `users`).

| Caso | Payload | Resultado |
|---|---|---|
| Peso abaixo do piso | `weight: 0.5` | `400`, `{"field":"weight","message":"{\"key\":\"errors.validation.number_range\",\"min\":20,\"max\":300}"}` |
| Peso acima do teto | `weight: 301` | `400`, mesma chave, `maximum: 300` |
| Altura abaixo do piso | `height: 1` | `400`, `{"field":"height",...,"min":100,"max":250}` |
| Altura acima do teto | `height: 251` | `400`, mesma chave, `maximum: 250` |
| Perfil válido (80kg/175cm) | — | `200`, cálculo de macros normal (IMC 26.1, `dailyCalorieTarget: 2711`, etc.) |

- **Typecheck:** `pnpm typecheck` (3 workspaces: `@blendi/shared`, `@blendi/api`, `@blendi/mobile`) → limpo.
- **Suíte automatizada da API:** `pnpm test` (`apps/api`) → 39/39 passando, sem regressão.
- **Git status:** único arquivo alterado por esta tarefa é `packages/shared/src/schemas/user.ts` (os demais arquivos já apareciam modificados/untracked antes desta sessão, de checkpoints anteriores da mesma linha).

## Pentest adicional contra o endpoint corrigido

A pedido do usuário, numa sessão seguinte, rodei uma bateria de testes de segurança precisos contra `POST /users/calculate-macros`, focada no piso/teto recém-adicionado e nos vetores padrão de um endpoint autenticado. Usuário de teste criado via `/auth/register` e removido ao final (confirmado por varredura nas 14 collections — só `users` tinha o documento).

**Boundary exato (inclusivo, correto):**

| Caso | Resultado |
|---|---|
| `weight=20`, `weight=300` (piso/teto exatos) | `200` nos dois |
| `height=100`, `height=250` (piso/teto exatos) | `200` nos dois |
| `weight=19.999999` / `weight=300.000001` | `400`, `minimum:20` / `maximum:300` |
| `height=99.999999` / `height=250.000001` | `400`, `minimum:100` / `maximum:250` |

**Confusão de tipo** (todas `400`, `errors.validation.number_range` ou `required`): string `"80"`, `null`, `true`, array `[80]`, campo ausente, `1e308`, `-80`, `0`.

**Tentativa de NoSQL injection** — `{"$gt":0}` e `{"$ne":null}` no lugar do número: `400` nos dois, rejeitados pela checagem de tipo do Zod antes de qualquer query Mongo (o endpoint nem usa esses campos em query, mas confirma que não há *type coercion* perigosa).

**Mass assignment** — campos extras no body (`isPro`, `blendiModel:"Steel"`, `_id`, `role:"admin"`, `$where`): `200`, mas todos descartados pelo Zod (schema não-`.strict()`, chaves desconhecidas são ignoradas); sem risco real porque o endpoint é stateless e não persiste nada.

**Bypass de autenticação** — `401` em todos os 4 casos: sem header `Authorization`, token malformado, token sem prefixo `Bearer`, token com payload adulterado e assinatura falsa.

**Rate limit** — confirmado ativo via `authenticatedLimiter` global (`apps/api/src/index.ts:153`), 120 req/min por usuário (`RateLimit-Policy: 120;w=60` no header da resposta).

**Vazamento de stack trace** — um body JSON malformado (erro do `body-parser`, não do Zod) retorna `stack` completo com caminhos absolutos do sistema de arquivos, mas só porque o servidor local testado roda com `NODE_ENV=development`; `errorHandler.ts:31,60` condiciona isso a `isDev`, nunca aparece em produção. Comportamento pré-existente, já confirmado ao vivo (inclusive com uma segunda instância `NODE_ENV=production` sem vazamento) no [`cp-audit-completo-backend-frontend-documentacao.md`, linha 86](cp-audit-completo-backend-frontend-documentacao.md) — não é regressão desta correção.

Nenhuma falha encontrada no fix nem nos vetores testados. O piso/teto é estritamente inclusivo nos dois extremos, rejeita qualquer valor fora por qualquer vetor tentado (tipo, injeção, mass assignment), e a autenticação/rate limit da rota continuam intactos.

## Resumo

`calculateMacrosSchema.weight`/`height` agora rejeitam com `400` valores fora de 20-300kg / 100-250cm, replicando exatamente o padrão já usado por `targetWeight` no mesmo schema e por `weight`/`height` de `updateUserSchema`. Nenhum outro arquivo foi alterado. Testado ao vivo ponta a ponta (4 casos de borda + 1 caso válido), typecheck limpo e suíte da API sem regressão. Nenhuma lacuna equivalente encontrada em Mongoose ou mobile — os dois únicos callers reais já respeitavam a mesma faixa no cliente.

**Resolve o achado nº 7 da lista priorizada do CP-AUDIT** (`cp-audit-completo-backend-frontend-documentacao.md`).
