# CP-B — Investigação: personalização em Pulse AI e Pantry Scanner

> Nota de nomenclatura: este repositório já tem um "CP-B" anterior (coleta de
> `birthDate`/`biologicalSex`/`weightGoal` no onboarding —
> `docs/fixes/cp-b-coleta-birthdate-biologicalsex-weightgoal-onboarding.md`,
> `cp-b.1-*`, `cp-b.1.1-*`). Este documento usa o nome de arquivo exato pedido
> no prompt (`cp-b-investigacao-personalizacao-pulse-ai-pantry-scanner.md`),
> então não há colisão de arquivo, mas o rótulo "CP-B" está duplicado para
> duas iniciativas diferentes — vale renomear a próxima referência a isto
> (sugestão: CP-C) para evitar confusão futura.

Investigação pura, sem nenhuma alteração de código. Todas as citações abaixo
são literais, com arquivo e linha exatos, lidos diretamente do código em
2026-10-23.

---

## TAREFA 0 — Pulse AI: o que `promptBuilder.service.ts` injeta hoje

### 0.1 — Os "5 blocos"

O prompt da Pulse AI (e, como a Tarefa 1 confirma, também o do Pantry
Scanner) é montado por uma única função, `buildSystemPrompt`
(`apps/api/src/services/promptBuilder.service.ts:235-319`), não por 5 funções
independentes chamadas em sequência. A função monta, nesta ordem: Behavior
requirements, User context, (Recent recipes, condicional), e então 5 seções
adicionadas no CP3.3 — documentadas literalmente em
`docs/phase-3/cp3.3-pulse-ai-avancado.md:47-53`:

> "[apps/api/src/services/promptBuilder.service.ts] gained five new
> system-prompt sections, all appended to every Pulse AI request:
> 1. Macro calculation instruction... 2. Nutrition reference table...
> 3. Calorie equation self-check... 4. Recipe scope instruction...
> 5. Physical blender guardrails..."

Essas 5 seções mapeiam, no código atual, para 5 funções chamadas em
`buildSystemPrompt` (`promptBuilder.service.ts:305-316`):

```
buildMacroCalculationSection(),      // linha 307
buildNutritionReferenceSection(),    // linha 309
buildCalorieEquationCheckSection(),  // linha 311
buildRecipeScopeSection(),           // linha 313
buildBlenderGuardrailsSection(...)   // linha 315
```

Ou seja: "5 blocos" é uma descrição correta das seções adicionadas no CP3.3
(a "Layer 1: Prompt Enrichment" da doc), não uma descrição do arquivo inteiro
— o arquivo tem mais seções além dessas 5 (Behavior requirements e User
context, que já existiam antes do CP3.3).

### 0.2 — Campos do perfil injetados em cada seção

A entrada de `buildSystemPrompt` é o tipo `PulseAiPromptUserContext`
(`promptBuilder.service.ts:16-25`):

```ts
export interface PulseAiPromptUserContext {
  blendiModel: BlendiModel;
  goal: UserGoal;
  locale: UserLocale;
  unitSystem: UserUnitSystem;
  dailyProteinTarget: number;
  dailyCarbTarget: number;
  dailyCalorieTarget: number;
  recentBlendRecipeNames?: string[];
}
```

Esses são **todos** os campos do usuário que a função recebe — e, por
extensão, os únicos que qualquer seção do prompt pode citar. O bloco "User
context" de fato os renderiza (`promptBuilder.service.ts:286-294`):

```
`- BLENDi model: ${modelContext.displayName} (${modelContext.wattage}W).`
`- Hardware guidance: ${modelContext.hardwareGuidance}`
`- Goal: ${goal} (${GOAL_CONTEXT[goal]}).`
`- Unit system: ${unitSystemContext.label}.`
`- Daily protein target: ${dailyProteinTarget} g.`
`- Daily carbs target: ${dailyCarbTarget} g.`
`- Daily calories target: ${dailyCalorieTarget} kcal.`
`- Expected response language: ${responseLanguage}.`
```

As 5 seções do CP3.3 usam só um subconjunto disso: `buildBlenderGuardrailsSection`
usa `blendiModel` e `unitSystem` (linhas 199-214); as outras 4 seções
(macro calculation, nutrition reference, calorie equation check, recipe
scope) não recebem nenhum campo do usuário — são texto fixo, exceto a seção
de recipe scope, que referencia a meta do usuário só indiretamente (via a
instrução textual "25% and 40% of the user's daily protein target", sem
interpolar o valor numérico ali).

Confirmado por leitura direta: **não há** `activityLevel`, `goal` corporal
(`weightGoal`), `birthDate`/idade, `biologicalSex`, nem `dailyFatTarget` em
`PulseAiPromptUserContext` nem em nenhuma seção de `buildSystemPrompt`.

### 0.3 — `weightGoal` está ausente do prompt (confirmado)

`weightGoal` não aparece em nenhum lugar de
`apps/api/src/services/promptBuilder.service.ts` — confirmado por busca
direta no arquivo (zero ocorrências da string `weightGoal`) e pela lista
fechada de campos em `PulseAiPromptUserContext`
(`promptBuilder.service.ts:16-25`, citada acima), que não inclui esse campo.

O campo existe no banco (`apps/api/src/models/User.ts:114`,
`type WeightGoal = 'lose' | 'maintain' | 'gain'` em `User.ts:41`) e já é lido
em outros fluxos — por exemplo no cálculo de macros
(`apps/api/src/utils/macroCalculation.utils.ts:121-137`, ajuste calórico do
TDEE) — mas nenhum desses consumidores é `promptBuilder.service.ts`. A
pergunta original do CP-B tem resposta definitiva: **ausente do prompt**, e
o dado já existe persistido no usuário, só não é passado para
`buildPulseAiPrompt`/`buildPantryRecipePrompt`.

---

## TAREFA 1 — Pantry Scanner: pipeline de geração de receita

### 1.1 — Controller/service real

`apps/api/src/controllers/pantryScanner.controller.ts`, função exportada
`analyzePantry` (linha 520). Dois serviços de prompt são importados:
`buildPantryAnalysisPrompt` de
`apps/api/src/services/pantryPromptBuilder.service.ts` (linha 30) e
`buildPantryRecipePrompt` de
`apps/api/src/services/promptBuilder.service.ts` (linhas 31-34).

### 1.2 — Reaproveita `promptBuilder.service.ts`? Sim, parcialmente

Isto refuta a suspeita levantada no CONTEXTO do prompt original. Existem
**dois** pipelines de prompt no Pantry Scanner, com responsabilidades
diferentes:

1. **Análise de visão (foto → lista de ingredientes):** usa
   `pantryPromptBuilder.service.ts`, que é de fato um arquivo próprio e
   separado — confirmado tanto pelo código
   (`pantryPromptBuilder.service.ts:1-67`, um prompt de visão fixo sem
   nenhum campo de usuário) quanto pela documentação:
   `docs/phase-2/cp2.1-pantry-scanner.md:84` — "[pantryPromptBuilder.service.ts]
   is intentionally separate from [promptBuilder.service.ts]. The Vision
   prompt has a different responsibility from Pulse AI recipe generation."

2. **Geração da receita em texto (ingredientes → receita):** usa a **mesma**
   função `buildSystemPrompt` da Pulse AI, através de
   `buildPantryRecipePrompt` (`promptBuilder.service.ts:336-361`), que é só
   um wrapper de `buildSystemPrompt` com `responseMode: 'recipe-array'` e uma
   seção adicional de ingredientes disponíveis. Confirmado pelo uso real em
   `pantryScanner.controller.ts:481-495`, dentro de `generatePantryRecipes`.

Ou seja: o indício do CONTEXTO (variáveis de ambiente de IA separadas) está
correto quanto à etapa de visão, mas não se estende à etapa de geração de
texto da receita — essa etapa já reaproveita o mesmo `promptBuilder.service.ts`
e o mesmo `callAi` (não `callVisionAi`) que a Pulse AI usa.

### 1.3 — O que é injetado no prompt de receita do Pantry Scanner

Como a etapa de receita usa o mesmo `buildSystemPrompt` da Pulse AI, os
campos injetados são exatamente os mesmos da Tarefa 0.2 — confirmado pela
chamada real em `pantryScanner.controller.ts:481-495`:

```ts
const prompt = buildPantryRecipePrompt({
  blendiModel: user.blendiModel,
  goal: user.goal,
  locale: user.locale,
  language: user.locale,
  unitSystem: user.unitSystem,
  dailyProteinTarget: user.dailyProteinTarget,
  dailyCarbTarget: user.dailyCarbTarget,
  dailyCalorieTarget: user.dailyCalorieTarget,
  recentBlendRecipeNames: await getRecentBlendRecipeNames(user.id),
  availableIngredients: ingredients.map(...),
});
```

`PantryScannerUserProfile` (`pantryScanner.controller.ts:49-62`) nem sequer
carrega `weightGoal`, `biologicalSex`, `birthDate` ou `activityLevel` do
banco — o `.select({...})` em `findPantryScannerUserProfile`
(`pantryScanner.controller.ts:327-340`) busca só `blendiModel`, `goal`,
`locale`, `unitSystem`, `timezone`, `dailyProteinTarget`, `dailyCarbTarget`,
`dailyCalorieTarget`, `scanCount`, `scanResetDate`, `isPro`. Esses campos
nunca chegam nem a sair do Mongo nessa query — a ausência é ainda mais
explícita que na Pulse AI.

A etapa de visão (`buildPantryAnalysisPrompt()`,
`pantryPromptBuilder.service.ts:65-67`) não recebe nenhum parâmetro — o
prompt é uma constante fixa (`PANTRY_ANALYSIS_PROMPT_SECTIONS`,
linhas 1-63), sem nenhum dado de usuário, só a lista de categorias de
ingredientes aceitas/ignoradas.

### 1.4 — Visão → texto: mesma chamada ou duas chamadas?

Duas chamadas de IA em sequência, confirmadas em
`pantryScanner.controller.ts`:

1. `callVisionAi({...})` (linha 572), usando `VISION_PROVIDER`/`VISION_MODEL`
   — produz `visionResponseContent`, parseado em `visionAnalysis`
   (`parsePantryVisionAnalysis`, linha 592).
2. Os ingredientes de `visionAnalysis.ingredients` (filtrados por confiança
   em `usableIngredients`, linha 618) são passados como
   `availableIngredients` para `generatePantryRecipes` (linha 650), que
   chama `callAi({...})` (linha 498) usando `AI_PROVIDER`/`AI_MODEL` — a
   mesma configuração de provedor usada pela Pulse AI
   (`pulseAi.controller.ts:302`, mesma função `callAi`).

Confirmado em `apps/api/src/config/env.ts:164-171`: `AI_PROVIDER`/`AI_MODEL`/
`AI_API_KEY` e `VISION_PROVIDER`/`VISION_MODEL`/`VISION_API_KEY` são pares de
variáveis distintos, e `aiProvider.service.ts` usa cada par em funções
diferentes (`callAi` lê `env.AI_PROVIDER`/`env.AI_MODEL`, linhas 433-434;
`callVisionAi` lê `env.VISION_PROVIDER`/`env.VISION_MODEL`, linhas 365-366).

---

## TAREFA 2 — Guardrails: proteína (Layer 2) e macro/calorias (Layer 3)

### 2.1 — `blenderGuardrail.utils.ts` (citação completa)

```ts
// apps/api/src/utils/blenderGuardrail.utils.ts
import type { PulseAiRecipe } from '@blendi/shared';
import { BLENDER_LIMITS } from '../config/pricing.config';
import type { BlendiModel } from '../models/User';

export interface ProteinGuardrailDiscrepancy {
  declaredProtein: number;
  maxProteinGrams: number;
}

export type ProteinGuardrailResult =
  | { withinGuardrail: true }
  | { withinGuardrail: false; discrepancy: ProteinGuardrailDiscrepancy };

export function validateProteinGuardrail(
  recipe: Pick<PulseAiRecipe, 'macros'>,
  blendiModel: BlendiModel
): ProteinGuardrailResult {
  const { maxProteinGrams } = BLENDER_LIMITS[blendiModel];

  if (recipe.macros.protein <= maxProteinGrams) {
    return { withinGuardrail: true };
  }

  return {
    withinGuardrail: false,
    discrepancy: { declaredProtein: recipe.macros.protein, maxProteinGrams },
  };
}

export function buildProteinGuardrailRetryMessage(
  discrepancy: ProteinGuardrailDiscrepancy
): string {
  return [
    `Your previous response exceeded the physical protein guardrail for this blender: it has ${discrepancy.declaredProtein}g of protein, but the maximum allowed for this hardware is ${discrepancy.maxProteinGrams}g.`,
    'Reduce or substitute ingredients so the total protein fits within that limit, then return the corrected JSON with recalculated macros.',
  ].join(' ');
}
```

**Fonte do limite:** `BLENDER_LIMITS[blendiModel]` — um valor **fixo no
código**, por modelo de blender (`apps/api/src/config/pricing.config.ts:22-36`):

```ts
export const BLENDER_LIMITS: Record<BlendiModel, BlenderLimit> = {
  Lite:    { maxVolumeMl: 400, maxVolumeOz: 17.5, maxProteinGrams: 35 },
  ProPlus: { maxVolumeMl: 400, maxVolumeOz: 17.5, maxProteinGrams: 45 },
  Steel:   { maxVolumeMl: 600, maxVolumeOz: 21,   maxProteinGrams: 55 },
} as const;
```

Não é o `dailyProteinTarget` do usuário — é um teto físico por hardware,
independente da meta nutricional. Os dois conceitos (limite físico do
blender vs. meta diária de proteína) são intencionalmente distintos, e o
guardrail valida só o primeiro.

### 2.2 — `macroValidation.utils.ts` (citação completa)

```ts
// apps/api/src/utils/macroValidation.utils.ts
import type { PulseAiRecipe } from '@blendi/shared';

export const MACRO_CALORIE_TOLERANCE_PERCENT = 15;

export interface MacroConsistencyDiscrepancy {
  declaredCalories: number;
  derivedCalories: number;
  differencePercent: number;
}

export type MacroConsistencyResult =
  | { macrosValidated: true }
  | { macrosValidated: false; discrepancy: MacroConsistencyDiscrepancy };

function getCalorieDifferencePercent(declaredCalories: number, derivedCalories: number): number {
  const referenceCalories = Math.max(declaredCalories, derivedCalories);
  if (referenceCalories <= 0) return 0;
  return (Math.abs(declaredCalories - derivedCalories) / referenceCalories) * 100;
}

export function validateMacroConsistency(
  recipe: Pick<PulseAiRecipe, 'macros'>
): MacroConsistencyResult {
  const { protein, carbs, fat, calories } = recipe.macros;
  const derivedCalories = protein * 4 + carbs * 4 + fat * 9;
  const differencePercent = getCalorieDifferencePercent(calories, derivedCalories);

  if (differencePercent <= MACRO_CALORIE_TOLERANCE_PERCENT) {
    return { macrosValidated: true };
  }

  return {
    macrosValidated: false,
    discrepancy: {
      declaredCalories: calories,
      derivedCalories: Math.round(derivedCalories),
      differencePercent: Math.round(differencePercent * 100) / 100,
    },
  };
}

export function buildMacroInconsistencyRetryMessage(
  recipe: Pick<PulseAiRecipe, 'macros'>,
  discrepancy: MacroConsistencyDiscrepancy
): string {
  const { protein, carbs, fat } = recipe.macros;
  return [
    'Your previous response had inconsistent macros.',
    `You declared ${discrepancy.declaredCalories} kcal, but protein (${protein}g x 4) + carbs (${carbs}g x 4) + fat (${fat}g x 9) = ${discrepancy.derivedCalories} kcal, a ${discrepancy.differencePercent}% difference.`,
    'Recalculate the macros and total calories using the exact ingredient quantities you listed, then return the corrected JSON.',
  ].join(' ');
}
```

**Fonte do valor validado:** não é nenhuma meta do usuário — é a
**consistência matemática interna da própria receita** (os macros que a IA
declarou vs. as calorias derivadas deles pela fórmula `protein×4 + carbs×4 +
fat×9`). Esse guardrail nunca compara nada contra `dailyCalorieTarget`,
`dailyProteinTarget` ou qualquer outra meta diária — confirmado por leitura
completa do arquivo acima: nenhuma dessas variáveis aparece no código.

### 2.3 — Escopo de execução dos guardrails

**Layer 2 (proteína, `blenderGuardrail.utils.ts`): só no fluxo da Pulse AI.**
Confirmado por:
- Import e uso em `apps/api/src/controllers/pulseAi.controller.ts:49-52`
  (`validateProteinGuardrail`, `buildProteinGuardrailRetryMessage`) e chamada
  real em `ensureBlenderGuardrail` (linhas 317-350), executada em
  `runPulseAiChat` na linha 669 (`recipe = await ensureBlenderGuardrail(...)`).
- Busca direta em `apps/api/src/controllers/pantryScanner.controller.ts`:
  nenhuma ocorrência de `validateProteinGuardrail`, `ensureBlenderGuardrail`
  ou `blenderGuardrail` (grep confirmado, zero resultados) — nem o import no
  topo do arquivo (linhas 1-39) inclui esse módulo.

**Layer 3 (macro/calorias, `macroValidation.utils.ts`): nos dois fluxos.**
Confirmado por:
- Pulse AI: `pulseAi.controller.ts:45-48` (import) e `ensureMacroConsistency`
  (linhas 352-391), chamada na linha 670.
- Pantry Scanner: `pantryScanner.controller.ts:36-39` (import) e
  `ensurePantryRecipeMacroConsistency` (linhas 278-322), chamada dentro de
  `generatePantryRecipes` na linha 507, para cada uma das 2 receitas geradas.

**Achado relevante não pedido explicitamente, mas decorrente direto desta
tarefa:** existe uma assimetria real — uma receita gerada pelo Pantry
Scanner para um usuário `Lite` pode declarar mais de 35g de proteína sem
nenhuma correção automática, porque o guardrail físico (Layer 2) simplesmente
não roda nesse fluxo. A instrução de texto no prompt
(`buildBlenderGuardrailsSection`, usada nos dois pipelines) ainda pede ao
modelo para respeitar o limite, mas sem a rede de segurança do backend que a
Pulse AI tem.

---

## TAREFA 3 — Modelo de blender possuído (LITE/PRO+/STEEL)

### 3.1 — Campo no schema do User

O campo existe. `apps/api/src/models/User.ts:38`:

```ts
export type BlendiModel = 'Lite' | 'ProPlus' | 'Steel';
```

Interface (`User.ts:107`): `blendiModel: BlendiModel;`

Schema Mongoose (`User.ts:461-465`):

```ts
blendiModel: {
  type: String,
  enum: ['Lite', 'ProPlus', 'Steel'] satisfies BlendiModel[],
  required: [true, 'errors.validation.required'],
},
```

Nome exato do campo: `blendiModel`. Valores possíveis: `'Lite'`, `'ProPlus'`,
`'Steel'` (nomenclatura do código bate com LITE/PRO+/STEEL do CONTEXTO, só
sem o "+").

### 3.2 — O campo já é lido e usado para restringir/ajustar a receita

Sim, em ambos os pipelines, de duas formas distintas:

**a) Instrução de texto no prompt (as duas pipelines, via
`buildBlenderGuardrailsSection`, `promptBuilder.service.ts:199-214`):**

```ts
const MODEL_CONTEXT: Record<BlendiModel, PulseAiModelContext> = {
  Lite: {
    displayName: 'BLENDi Lite',
    wattage: 60,
    hardwareGuidance:
      'Use softer fruit, liquids, yogurt, oats, and similar easy-to-blend ingredients. Avoid recommending ice, whole nuts, or dense raw fibrous ingredients unless they are softened first.',
  },
  ProPlus: {
    displayName: 'BLENDi Pro+',
    wattage: 120,
    hardwareGuidance:
      'Can process frozen fruit and tougher fiber with confidence. Moderate-density ingredients are acceptable when liquid balance is adequate.',
  },
  Steel: {
    displayName: 'BLENDi Steel',
    wattage: 180,
    hardwareGuidance:
      'Can crush ice, whole nuts, and denser ingredients. You may recommend more demanding textures while still keeping the recipe practical and repeatable.',
  },
};
```

Isso responde diretamente ao exemplo citado no CONTEXTO do prompt original
("nunca sugerir gelo pra quem tem LITE"): a instrução **já existe**, mas é
só uma instrução de texto para o modelo (`hardwareGuidance`), não uma
validação de backend — não há nenhum código que rejeite ou corrija uma
receita que, mesmo assim, inclua gelo para um usuário Lite. É o mesmo padrão
que o volume: existe no prompt (Layer 1), não é verificado depois (Layer 2
só verifica proteína, nunca textura/gelo/volume).

**b) Validação de backend — só para proteína (Layer 2):** `BLENDER_LIMITS[blendiModel].maxProteinGrams`,
já citado na Tarefa 2.1, usado em `validateProteinGuardrail`
(`blenderGuardrail.utils.ts:29-33`) e só no fluxo da Pulse AI (Tarefa 2.3).

**c) Volume máximo (`maxVolumeMl`/`maxVolumeOz`):** também já existe em
`BLENDER_LIMITS` e é injetado no prompt (`buildBlenderGuardrailsSection`,
linha 210), mas — confirmado pelo comentário em código
(`blenderGuardrail.utils.ts:10-13`) e pela doc
(`docs/phase-3/cp3.3-pulse-ai-avancado.md:69`) — nunca é validado no backend
em nenhum dos dois pipelines, pelo mesmo motivo: o campo `amount` de cada
ingrediente é texto livre, sem parser de unidades.

`blendiModel` chega aos dois pipelines: Pulse AI via `PulseAiUserProfile`
(`pulseAi.controller.ts:70-83`, usado na linha 588) e Pantry Scanner via
`PantryScannerUserProfile` (`pantryScanner.controller.ts:49-62`, usado na
linha 482).

### 3.3 — N/A

O campo existe (Tarefa 3.1 confirmou), então esta tarefa não se aplica.

---

## TAREFA 4 — Volume/porção da receita

### 4.1 — Volume é só texto livre, sem parser/validação estruturada

Confirmado em três lugares independentes:

1. O tipo compartilhado `PulseAiRecipe['ingredients'][number].amount` é
   `string` (`packages/shared/src/schemas/pulseAi.ts:20`), e o schema Zod
   correspondente (`pulseAiIngredientSchema`, linhas 35-44) só valida que é
   uma string não vazia (`z.string().trim().min(1, ...)`) — nenhuma
   validação de unidade, formato numérico ou faixa.
2. A estrutura JSON pedida à IA no prompt
   (`PULSE_AI_SINGLE_RECIPE_JSON_STRUCTURE`, `promptBuilder.service.ts:75`)
   declara `"amount": string` explicitamente como texto livre.
3. O comentário de cabeçalho de `blenderGuardrail.utils.ts:10-13` confirma a
   ausência deliberada: "Volume não é validado aqui: o campo `amount` de
   cada ingrediente é texto livre ('30g', '1 cup', '240ml') e não há como
   converter isso de forma confiável para um total comparável sem um parser
   de unidades — fora do escopo desta correção pontual." A mesma ausência é
   documentada em `docs/phase-3/cp3.3-pulse-ai-avancado.md:69`: "Volume is
   deliberately not validated here... there is no reliable way to parse and
   sum that into a comparable total without a dedicated unit-conversion
   parser."

### 4.2 — Vínculo entre porção e meta de macro: existe, mas só como instrução de texto

Existe hoje, em `buildRecipeScopeSection`
(`promptBuilder.service.ts:190-197`), usada nos dois pipelines (parte de
`buildSystemPrompt`):

```ts
function buildRecipeScopeSection(): string {
  return [
    'Recipe scope:',
    '- This shake is one of multiple meals the user has in a day, not their entire daily nutrition by itself.',
    "- Unless the user explicitly asks for their full daily target in a single shake, the recipe should provide between 25% and 40% of the user's daily protein target.",
    "- Never default to putting the user's entire daily target into a single recipe.",
  ].join('\n');
}
```

Isso vincula explicitamente o tamanho da porção à meta diária de proteína do
usuário ("25% and 40% of the user's daily protein target") — mas é texto
fixo (a instrução não interpola o valor numérico de `dailyProteinTarget`
diretamente nessa frase; o valor numérico só aparece separadamente na seção
"User context", linha 291) e **nenhum guardrail de backend verifica essa
proporção depois**. Nem `blenderGuardrail.utils.ts` nem
`macroValidation.utils.ts` calculam "proteína da receita ÷ meta diária do
usuário" — o primeiro só compara contra o limite físico do blender (Tarefa
2.1), o segundo só verifica consistência interna da própria receita (Tarefa
2.2). Então o vínculo existe como instrução ao modelo, mas não como
validação.

---

## TAREFA 5 — Achados fora do escopo das 4 tarefas acima

Nenhuma menção a restrição alimentar/alergia foi encontrada em nenhum ponto
do código tocado por esta investigação (busca direta por `allerg`,
`intoler`, "restrição alimentar", `dietary.restriction` em
`apps/api/src` e `apps/mobile/src`: zero resultados) — confirma que é
lacuna total, consistente com o escopo futuro já definido no prompt
original. `dailyFatTarget` existe no schema do usuário
(`User.ts:131-137,526-531`) mas não é lido por nenhum dos dois
`UserProfile` dos controllers (`PulseAiUserProfile`,
`PantryScannerUserProfile`) nem injetado em nenhuma seção do prompt — é meta
de macro persistida e sem nenhum consumidor no pipeline de IA, o mesmo tipo
de lacuna que `weightGoal`, mas um nível a mais (nem é buscado do banco para
esses dois fluxos). Por fim, a divisão de responsabilidade entre os dois
`UserProfile` locais (cada controller faz sua própria query `.select({...})`
no `UserModel`, em vez de compartilhar uma função) significa que qualquer
campo novo que se queira injetar no prompt (`weightGoal`, por exemplo)
precisaria ser adicionado em **dois lugares** (`findPulseAiUserProfile`,
`pulseAi.controller.ts:228-264`, e `findPantryScannerUserProfile`,
`pantryScanner.controller.ts:324-362`) além do `buildSystemPrompt` em si.

---

## Resumo final — os 5 pilares

| Pilar | Estado | Conclusão |
|---|---|---|
| **Metas de macro** (`dailyProteinTarget`/`dailyCarbTarget`/`dailyCalorieTarget`) | Já injetadas nos dois pipelines (Pulse AI e receita do Pantry Scanner) | Dado já existe e já está conectado — nada a construir aqui. `dailyFatTarget` é a exceção: existe no schema mas não é buscado nem injetado em nenhum dos dois fluxos. |
| **`weightGoal`** (perder/manter/ganhar) | Campo existe no User model e já é usado em `calculateMacros`, mas está **ausente** de `promptBuilder.service.ts` e nem é buscado do banco pelos profiles de Pulse AI/Pantry Scanner | Dado já existe no sistema — é "injetar dado já disponível", não "construir do zero". Precisa: adicionar aos dois `.select({...})`, aos dois `UserProfile` locais, ao `PulseAiPromptUserContext`, e a uma nova seção/frase em `buildSystemPrompt`. |
| **Modelo de blender possuído** (`blendiModel`: Lite/ProPlus/Steel) | Campo existe, já injetado nos dois pipelines, já usado para instrução de hardware no prompt (texto) e para limite físico de proteína (backend, **só na Pulse AI**) | Já existe e já está amplamente conectado. O que falta é pontual: (a) estender o guardrail de proteína (Layer 2) para também rodar no Pantry Scanner; (b) decidir se vale a pena um guardrail real de textura/gelo (hoje só existe como instrução de texto, sem validação); volume continua sem solução por falta de parser de unidades, em ambos os fluxos. |
| **Pipeline compartilhado ou separado (Pulse AI vs. Pantry Scanner)** | Parcialmente compartilhado: a etapa de visão é separada (`pantryPromptBuilder.service.ts`, por design), mas a etapa de geração de receita em texto usa o **mesmo** `promptBuilder.service.ts`/`buildSystemPrompt` da Pulse AI | Não é "pipelines inteiramente separados" como o indício das variáveis de ambiente sugeria — é um pipeline de visão + um pipeline de texto compartilhado. Qualquer campo novo injetado em `buildSystemPrompt` passa a valer automaticamente para os dois recursos. |
| **Vínculo porção ↔ meta de macro** | Existe como instrução de texto fixa no prompt ("25%–40% of daily protein target"), nos dois pipelines; não existe como validação de backend em nenhum dos dois guardrails | Metade already existe (instrução), metade não (validação) — e a segunda metade não pode ser construída sem primeiro resolver o problema de unidades livres em `amount` (Tarefa 4.1), que é um bloqueio técnico mais profundo que uma simples injeção de dado. |

**Conclusão direta para o escopo do próximo CP:** a maior parte do trabalho
é "injetar dado já disponível" — `weightGoal` já existe no banco e só
precisa ser adicionado ao contexto de prompt dos dois controllers. A
exceção real que exige desenho novo (não só injeção) é o vínculo
estruturado porção↔macro e qualquer validação física de volume/textura além
de proteína — ambos bloqueados pelo mesmo problema de fundo: `amount` é
texto livre sem parser de unidades, em todo o sistema, nos dois recursos.
