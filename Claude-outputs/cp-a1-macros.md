# CP-A.1 — Relatório de Implementação: Gatilho `goal` e clamp de proteína

**Data:** 2026-10-14
**Base:** `cp-a-macros.md` (achados 3 e 4 da Tarefa 6 — "fora do escopo" do CP-A)
**Escopo implementado:** as 3 tarefas do prompt — `goal` como gatilho de recálculo, clamp de proteína dentro dos limites do schema, testes (matriz numérica + integração real).
**Método:** mesmo rigor do CP-A — leitura do código real antes de cada mudança, `tsc --noEmit` a cada passo, matriz numérica isolada fora do repositório, e teste de integração contra o servidor de dev rodando de verdade, com conta de teste descartável criada e removida.

---

## Tarefa 1 — `goal` como gatilho de recálculo

**O que foi feito:** `goal` adicionado à lista de campos-gatilho de `updateMe` (`apps/api/src/controllers/user.controller.ts:811-823`).

**Como foi feito:** a lógica de merge já lia `goal` como insumo do cálculo desde o CP-A (`mergedGoal = goal ?? currentUser.goal`, necessário porque a proteína sempre dependeu de `goal`) — só não disparava o recálculo quando `goal` era o ÚNICO campo mudado no PATCH. A mudança foi de uma linha: adicionar `goal !== undefined` ao OR-chain de `shouldRecalculateMacroTargets`, e atualizar o comentário que antes dizia explicitamente que `goal` não era gatilho. Nenhum caminho novo foi criado — reaproveita 100% da função `calculateMacroTargets` e do merge já existentes.

**Validação real** (contra o servidor rodando, conta de teste `macro-cp-a1-integration-<ts>@blendi-test.dev`, removida ao final — confirmado com 0 remanescentes por consulta independente):

Estado real do usuário (peso 70kg/175cm/36 anos/homem/moderatelyActive/maintain/**Wellness**, obtido via um PATCH-no-op pra forçar o primeiro recálculo real, não o seed arbitrário da criação): `dailyProteinTarget=112, dailyCalorieTarget=2509, dailyCarbTarget=327`.

`PATCH /users/me { goal: 'Muscle' }` (só esse campo) →
`dailyProteinTarget=140, dailyCalorieTarget=2509, dailyCarbTarget=299`.

- **dailyProteinTarget mudou** de 112 para 140 — bate exatamente com o cálculo manual (70kg × 2,0 g/kg de Muscle = 140).
- **dailyCarbTarget mudou** de 327 para 299 (resto de calorias recalculado com a nova proteína).
- **dailyCalorieTarget permaneceu 2509 — sem mudar**, confirmando que `goal` não afeta mais calorias (migraram pra `weightGoal` no CP-A).

---

## Tarefa 2 — Clamp de proteína dentro dos limites do schema

**Onde os limites já estavam definidos hoje (confirmado antes de implementar):** em **3 lugares independentes**, todos com os mesmos valores literais `10`/`400` nunca centralizados:
1. `packages/shared/src/schemas/user.ts` — `updateUserSchema.dailyProteinTarget` (Zod)
2. `packages/shared/src/schemas/user.ts` — `macroTargetSchema.dailyProteinTarget` (Zod)
3. `apps/api/src/models/User.ts:418-423` — schema Mongoose

**O que foi feito:** nomeei os dois literais como `DAILY_PROTEIN_TARGET_MIN = 10` e `DAILY_PROTEIN_TARGET_MAX = 400`, exportados de `packages/shared/src/schemas/user.ts` (linhas ~28-37, logo após os outros arrays de valores do arquivo), e os dois usos Zod (#1 e #2 acima) passaram a referenciar essas constantes em vez de repetir `10`/`400`. A cópia no Mongoose (#3) **não foi tocada** — segue a mesma convenção já estabelecida nesse arquivo de não importar de `@blendi/shared` (os outros tipos do modelo, como `UserGoal`/`BlendiModel`, também são redeclarados ali, não importados). `apps/api/src/utils/macroCalculation.utils.ts` importa `DAILY_PROTEIN_TARGET_MIN`/`MAX` direto de `@blendi/shared` — nenhum número novo foi inventado dentro da função de cálculo.

**Clamp aplicado** (`apps/api/src/utils/macroCalculation.utils.ts:110-127`):
```ts
const rawDailyProteinTarget = Math.round(weight * PROTEIN_MULTIPLIERS[goal]);
const dailyProteinTarget = Math.min(
  Math.max(rawDailyProteinTarget, DAILY_PROTEIN_TARGET_MIN),
  DAILY_PROTEIN_TARGET_MAX
);

const dailyFatCalories = dailyCalorieTarget * 0.3;
const dailyCarbTarget = Math.round(
  (dailyCalorieTarget - (dailyProteinTarget * 4) - dailyFatCalories) / 4
);
```
`dailyCalorieTarget` é calculado **antes** deste bloco e não depende em nada do valor de proteína — confirmado que o clamp não o afeta (nem por código, nem pelos testes abaixo). `dailyCarbTarget` referencia a variável `dailyProteinTarget` (já clampada), nunca a bruta — um único ponto de cálculo usado tanto por `calculateMacros` quanto pelo recálculo de `updateMe`, exatamente como pedido.

---

## Tarefa 3 — Testes

### Matriz numérica (script isolado, fora do repositório, `tsx`)

**Caso 1 — limite máximo (achado 4), reproduzido de verdade:** peso 250kg (dentro do próprio limite do schema de peso, 300kg), goal `Recovery` (maior multiplicador, 2,2 g/kg) → proteína bruta calculada à mão = 250 × 2,2 = **550g**.

Resultado real: `dailyProteinTarget=400` (exatamente `DAILY_PROTEIN_TARGET_MAX`, não os 550g brutos), `dailyCalorieTarget=5299`, `dailyCarbTarget=527`.
- **PASSOU:** proteína é exatamente o limite, não o valor bruto.
- **PASSOU:** os 3 macros reconciliam com as calorias finais — `400×4 + 527×4 + (5299×0,3)` = 5297,7, uma diferença de 1,3kcal em relação a 5299 (dentro da folga inerente de arredondamento do carboidrato por resto, ±2kcal no máximo — a mesma folga que já existia antes desta correção, não introduzida pelo clamp).
- **PASSOU:** `dailyCalorieTarget=5299` bate exatamente com o TDEE+ajuste de `weightGoal` calculado de forma totalmente independente do clamp — calorias confirmadas como não afetadas.

**Caso 2 — limite mínimo, testado diretamente na função pura:** peso 5kg (propositalmente irreal — ver alcançabilidade abaixo), goal `Wellness` (menor multiplicador, 1,6 g/kg) → proteína bruta = 5 × 1,6 = **8g**.

Resultado real: `dailyProteinTarget=10` (exatamente `DAILY_PROTEIN_TARGET_MIN`, não os 8g brutos), reconciliação dentro de 0,7kcal. **PASSOU.**

**Alcançabilidade real do limite mínimo — testada, não assumida:**
- **Via `updateMe` (o único caminho onde o recálculo automático roda):** `updateUserSchema.weight` tem `.min(20, ...)` — testei as 4 combinações de `goal` no peso mínimo aceito (20kg): `Muscle`=40g, `Wellness`=32g, `Energy`=36g, `Recovery`=44g. **Nenhuma fica abaixo de 10g** — confirmado, não assumido: o limite mínimo **não é alcançável** via `updateMe` com dados válidos do schema.
- **Via `calculateMacros`:** `calculateMacrosSchema.weight` só exige `.positive()` — **sem piso de 20kg**. Isso significa que, tecnicamente, o limite mínimo **é alcançável** nesse endpoint específico com um peso irreal (ex.: 5kg), porque esse schema em particular não tem o mesmo piso de peso que `updateUserSchema`. Achado incidental, fora do que esta tarefa pediu pra corrigir — só registrando a diferença entre os dois schemas, já que a tarefa pediu pra confirmar explicitamente, não assumir.

### Teste de integração real (servidor rodando, conta de teste nova, removida ao final)

**(a) PATCH só `goal`** — já reportado na Tarefa 1 acima, com números antes/depois.

**(b) PATCH combinando `weight`+`goal` pra exceder o limite máximo:**

`PATCH /users/me { weight: 250, goal: 'Recovery' }` (proteína bruta esperada: 250 × 2,2 = 550g).

| | dailyProteinTarget | dailyCalorieTarget | dailyCarbTarget |
|---|---|---|---|
| Antes | 140 | 2509 | 299 |
| Depois | **400** | 5299 | 527 |

- **Status HTTP: 200** — o PATCH **não falhou** com `ValidationError` (esse era exatamente o risco do achado 4).
- `dailyProteinTarget` salvo = 400, **o limite do schema**, não os 550g brutos.
- `dailyCarbTarget=527` reconcilia com `dailyCalorieTarget=5299` (diferença de 1,3kcal, mesma folga de arredondamento do caso 1 da matriz — números idênticos, confirmando consistência entre o teste isolado e o teste de integração real).

Conta de teste (`macro-cp-a1-integration-<timestamp>@blendi-test.dev`) criada direto via Mongoose (mesma justificativa do CP-A: registro via HTTP continua quebrado de propósito) e **removida ao final** (`deletedCount: 1`), confirmado de forma independente logo depois (`0` remanescentes). Servidor de dev subido só para este teste foi encerrado ao final — não toquei nos processos de dev que já estavam rodando na máquina antes desta sessão.

---

## Resumo

As 3 tarefas implementadas e validadas. `tsc --noEmit` limpo em `packages/shared`, `apps/api` e `apps/mobile`. Nenhuma outra parte da lógica de cálculo foi tocada (fórmula de BMR, multiplicador de atividade, ajuste por `weightGoal`, % de gordura — todos intactos, confirmado pelos próprios testes). Nenhum build, `eas`, commit ou deploy foi executado.

**Achado incidental (fora do pedido desta tarefa, só registrando):** `calculateMacrosSchema.weight` não tem piso de 20kg como `updateUserSchema.weight` tem — os dois schemas de peso não são simétricos. Isso é o que torna o limite mínimo de proteína tecnicamente alcançável por `calculate-macros` mas não por `updateMe`. Não foi pedido pra corrigir, e não toquei nisso.
