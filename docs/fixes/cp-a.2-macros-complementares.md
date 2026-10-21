# CP-A.2 — Funcionalidades complementares de macros

Terceira correção/expansão da linha de trabalho de macros, depois do [CP-A](../../cp-a-macros.md) (idade real, sexo real, `weightGoal` separado de `goal`, recálculo centralizado) e do [CP-A.1](../../cp-a1-macros.md) (`goal` como gatilho, clamp de proteína). Esta não reabre nada dos dois anteriores — só adiciona o que está descrito abaixo, decidido depois de revisar os achados "fora de escopo" dos dois relatórios anteriores.

Pasta `docs/fixes/` (em vez de `docs/phase-N/`): esta trilha de correção usa nomenclatura letrada (CP-A, CP-A.1, CP-A.2) e é paralela ao roadmap numerado por fase, não um checkpoint dele — por isso vive numa pasta própria, decisão tomada com o usuário antes de escrever este arquivo.

**Revisado pelo CP-A.2.1** (dois ajustes pontuais, relatório próprio em [cp-a.2.1-overlap-select.md](cp-a.2.1-overlap-select.md), referenciado na Tarefa 6 abaixo), **pelo CP-A.2.2** (auditoria sistemática de limites numéricos, alargamento de `dailyCalorieTarget`/`dailyCarbTarget`/`dailyFatTarget`, desacoplamento do limite de validação de `dailyProteinTarget` do clamp automático — seção "Revisão (CP-A.2.2)") **pelo CP-A.2.3** (citação retroativa de linha pro CP-A.2.2, correção de 2 imprecisões de redação, idade plausível em `birthDate`, aviso suave de carboidrato, piso de 1.200kcal na sugestão automática e proteína automática reclampada pelo orçamento calórico — seção "Revisão (CP-A.2.3)") **e pelo CP-A.2.4** (3 verificações da revisão do CP-A.2.3: contradição do import de `dailyFatTarget` resolvida — era só uma frase ambígua, não um bug —, cronologia de `targetWeight` confirmada por citação literal do texto original, e duplicação do cálculo de idade no validador do Mongoose eliminada via reuso de `calculateAge` — seção "Revisão (CP-A.2.4)"). Este documento foi atualizado em linha nas 4 revisões, sem criar arquivo novo fragmentado, conforme pedido em cada uma.

## Arquivos alterados

| Arquivo | O que mudou |
|---|---|
| `apps/api/src/utils/macroCalculation.utils.ts` | `dailyFatTarget`, `bmr` expostos em `MacroCalculationResult`; multiplicador `extremelyActive`; `calculateWeightTargetEta`; `evaluateManualMacroEditWarnings` |
| `apps/api/src/controllers/user.controller.ts` | `updateMe` reestruturado (busca de usuário incondicional, IMC/ETA/warnings na resposta, `$set`+`$push` pro histórico); novo `getWeightHistory` |
| `apps/api/src/routes/users.ts` | nova rota `GET /users/me/weight-history` |
| `apps/api/src/models/User.ts` | `targetWeight`, `weightHistory`, `dailyFatTarget` opcionais; `extremelyActive` no enum de atividade; import de `DAILY_PROTEIN_TARGET_MIN`/`MAX` de `@blendi/shared` (exceção pontual à convenção do arquivo) |
| `packages/shared/src/schemas/user.ts` | `targetWeight` opcional (`updateUserSchema`, `calculateMacrosSchema`); `extremelyActive`; `dailyFatTarget` e `weightTargetEta` em `calculateMacrosResponseSchema` |

## Tarefa 1 — `dailyFatTarget`

Já existia como valor intermediário (`dailyFatCalories`, usado só pro resto de carboidrato) — nunca retornado. Adicionado `dailyFatTarget = round(dailyFatCalories / 9)` no mesmo lugar do cálculo (`macroCalculation.utils.ts`), sem alterar a linha de `dailyCarbTarget` (que continua lendo `dailyFatCalories` direto, nunca o novo campo arredondado). Presente em `calculateMacros`, no recálculo de `updateMe`, em `calculateMacrosResponseSchema` e no modelo Mongoose — campo opcional, sem default (contas que nunca recalcularam a meta não têm esse campo até a primeira vez que isso acontecer), **com limite `min: 0, max: 500` desde esta implementação original** (CP-A.2, não depois).

`macroTargetSchema` (schema Zod vestigial, confirmado via grep que não é importado em lugar nenhum do backend ou mobile) também já tinha sua própria definição independente de `dailyFatTarget`, opcional — **não foi tocada**, continua morta, agora ainda mais obviamente redundante com o campo real.

**Atualização (CP-A.2.2):** o limite de `dailyFatTarget` (0–500, só no Mongoose, confirmado como já existente desde a implementação original acima) foi alargado pra 0–600 e unificado com os demais via `@blendi/shared` — ver "Revisão (CP-A.2.2)" abaixo.

**Correção de premissa (CP-A.2.3):** a tarefa que motivou essa atualização havia partido da premissa de que `dailyFatTarget` "não tinha nenhum limite definido em lugar nenhum". Essa premissa estava **incorreta** — confirmado contra o código real: o limite 0–500 já existia no Mongoose desde a implementação original desta Tarefa 1 (CP-A.2), só nunca tinha sido centralizado em `@blendi/shared`. O que a tarefa seguinte de fato fez foi alargar e centralizar um limite já existente, não criar um do zero.

## Tarefa 2 — `extremelyActive`

Adicionado a `activityLevelValues` (shared), ao enum Mongoose e a `ACTIVITY_MULTIPLIERS` (×1,9 — valor de referência usado desde o diagnóstico original). Só backend; o seletor no onboarding mobile é trabalho de outro CP.

## Tarefa 3 — IMC consistente

Confirmado que o IMC já era só calculado na hora (nunca armazenado) — mantido assim deliberadamente, pela mesma razão de `birthDate`/idade no CP-A: um valor derivado armazenado fica desatualizado sozinho. `updateMe` agora também inclui `imc`/`imcUnit`/`imcClassification` na resposta, mas **só quando o recálculo de macro de fato acontece** nesse request (mesmo gatilho de `shouldRecalculateMacroTargets` da Tarefa 3 do CP-A) — reaproveita o mesmo resultado de `calculateMacroTargets()` já computado para as metas, nunca recalcula o IMC separadamente.

## Tarefa 4 — `targetWeight` e previsão de prazo

`targetWeight` (kg, opcional) aceito em `updateUserSchema` e `calculateMacrosSchema`. Nova função `calculateWeightTargetEta(currentWeight, targetWeight, weightGoal)`, reaproveitada por `calculateMacros` e `updateMe` — nunca duplicada.

**Fórmula:** `etaDays = round(abs(currentWeight - targetWeight) × 7700 / abs(ajusteCalórico[weightGoal]))`, reaproveitando o mapa `WEIGHT_GOAL_CALORIE_ADJUSTMENTS` (lose: -500, maintain: 0, gain: +300) já existente desde o CP-A. `KCAL_PER_KG_BODY_WEIGHT_CHANGE = 7700` é documentada no código como aproximação de mercado, não valor fisiológico exato.

**Casos sem previsão (nunca bloqueiam o PATCH — `targetWeight` é salvo normalmente):**
- `weightGoal === 'maintain'` → `{ etaDays: null, etaUnavailableReason: 'weightGoal_is_maintain' }` (ajuste calórico zero, divisão por zero).
- Direção contraditória (`lose` com alvo ≥ atual, ou `gain` com alvo ≤ atual) → `{ etaDays: null, etaUnavailableReason: 'contradictory_direction' }`.
- `targetWeight` indefinido → campo `weightTargetEta` omitido inteiramente da resposta.

**Decisão de design:** em `updateMe`, o cálculo da previsão é **independente** do gatilho de recálculo de macro (`shouldRecalculateMacroTargets`) — um PATCH só com `{ targetWeight: X }` já retorna a previsão, sem precisar que nenhuma meta de macro seja recalculada no mesmo request. Isso exigiu mover a busca do usuário atual (`currentUser`) pra fora do bloco condicional de recálculo, tornando-a incondicional — ela já era necessária pro merge de peso/weightGoal da previsão de qualquer forma.

## Tarefa 5 — Histórico de peso

Novo `weightHistory: { weight, recordedAt }[]` embutido no usuário. `updateMe` grava uma entrada só quando `weight` vem no body **e** é diferente do valor salvo antes do request (`weight !== currentUser.weight`) — isso cobre tanto mudanças reais quanto a primeira definição (confirmado: hoje `weight` só é definido pela primeira vez via `PATCH /users/me`, no finalize do onboarding mobile — nunca em `calculate-macros`, que é stateless, nem no registro). Como a verificação já mora dentro do próprio `updateMe`, essa primeira definição já gera a primeira entrada automaticamente, sem precisar tocar em nenhum outro ponto do código.

Tecnicamente, a gravação exigiu trocar a chamada de `findByIdAndUpdate` de um objeto plano (que o Mongoose trata implicitamente como `$set`) para um `$set` explícito + `$push` condicional — não é possível acrescentar ao array só atribuindo um novo valor a `updates.weightHistory`, isso substituiria o array inteiro.

Novo `GET /users/me/weight-history`, sem paginação, ordenado explicitamente por `recordedAt` ascendente (não confia só na ordem de inserção do `$push`).

## Tarefa 6 — Aviso de edição manual

Faixas fixas e globais (decisão já tomada no prompt, não uma alternativa avaliada):

| Campo | Condição de aviso | `code` | `message` (chave i18n) |
|---|---|---|---|
| `dailyProteinTarget` | `proteinPerKg < 0,8` | `macros/protein-below-range` | `warnings.manualMacroEdit.proteinBelowRange` |
| `dailyProteinTarget` | `proteinPerKg > 3,5` | `macros/protein-above-range` | `warnings.manualMacroEdit.proteinAboveRange` |
| `dailyCalorieTarget` | `< 1×BMR` | `macros/calories-below-bmr` | `warnings.manualMacroEdit.caloriesBelowBmr` |
| `dailyCalorieTarget` | `> 1,6×TDEE` | `macros/calories-above-tdee` | `warnings.manualMacroEdit.caloriesAboveTdee` |

Os 4 limites são estritos (`<`/`>`, nunca `<=`/`>=`) — estar exatamente no limite não dispara aviso, só superá-lo. Confirmado numericamente (ver seção de testes).

**Nunca bloqueia:** o PATCH sempre responde 200 e salva o valor exatamente como enviado; `warnings` só existe na resposta quando há pelo menos um aviso.

**Gatilho da avaliação:** só quando o body traz `dailyProteinTarget` e/ou `dailyCalorieTarget` **sem** nenhum dos 7 campos-gatilho já existentes (`weight`/`height`/`activityLevel`/`weightGoal`/`birthDate`/`biologicalSex`/`goal`). Se um gatilho viesse junto, o valor recalculado prevaleceria sobre o manual (regra do CP-A) e o valor manual nem chegaria a ser salvo — avaliar aviso nesse caso avaliaria um número que não vai pro banco.

**Correção (CP-A.2.1, confirmada com teste real contra o servidor — ver `docs/fixes/cp-a.2.1-overlap-select.md`):** a afirmação original deste documento, de que `warnings` e `imc`/`weightTargetEta` "nunca aparecem na mesma resposta", estava **errada** pra `weightTargetEta`. Só `imc` (vindo de `recalculatedMacros`) é de fato mutuamente exclusivo com `warnings`, porque os dois dependem do mesmo gatilho (`shouldRecalculateMacroTargets`) em direções opostas. `weightTargetEta` é calculado de forma **independente** desse gatilho (ver Tarefa 4) — ele usa só `weight`/`weightGoal`/`targetWeight` já salvos ou recém-patchados, nada relacionado ao caminho de edição manual. Teste real confirmou: um PATCH de edição manual pura (`{ dailyProteinTarget: 50 }`, sem nenhum campo-gatilho) numa conta que já tinha `targetWeight` coerente salvo retornou `warnings` **e** `weightTargetEta` na mesma resposta, lado a lado.

**BMR/TDEE usados na checagem de calorias:** vêm de uma chamada a `calculateMacroTargets()` com os dados **atuais** do usuário (sem merge — nenhum dos 7 campos-gatilho está no body neste caminho, então os valores já salvos são exatamente os efetivos). Reaproveita a função existente; não duplica a fórmula.

**Mensagens i18n:** as 4 chaves acima foram criadas e documentadas aqui, mas **as traduções em si não foram adicionadas** a `apps/mobile/src/locales/*.json` — isso é trabalho da tela mobile que vai consumir `warnings`, fora do escopo deste CP (backend only).

## Tarefa 7 — Limites de proteína unificados no Mongoose

`apps/api/src/models/User.ts` passou a importar `DAILY_PROTEIN_TARGET_MIN`/`MAX` de `@blendi/shared` — exceção pontual e documentada no código à convenção do arquivo de não importar tipos de `@blendi/shared` (os tipos continuam redeclarados; a exceção é só para esses 2 números de validação). Antes desta correção, o valor 10/400 existia em 3 lugares (2 no Zod, 1 solto no Mongoose); agora os 3 vêm da mesma fonte, com os 2 do Zod já centralizados desde o CP-A.1.

**Superado pelo CP-A.2.2:** `DAILY_PROTEIN_TARGET_MIN`/`MAX` (10/400) deixou de ser o par usado pela validação do schema — agora é usado **só** pelo clamp automático. A validação do schema passou a usar um par novo e mais largo, `DAILY_PROTEIN_TARGET_VALIDATION_MIN`/`MAX` (10/800). Ver "Revisão (CP-A.2.2)" abaixo para o motivo e os números exatos.

## Tarefa 8 — Testes

**Matriz numérica** (script isolado, fora do repositório, importando as funções reais via `tsx`): **14/14 passaram** — 2 casos de `dailyFatTarget`, 1 de `extremelyActive`, 3 de previsão de prazo (coerente/maintain/contraditório), 8 de fronteira de aviso (4 limites × exatamente-no-limite e um-passo-além).

**Integração real** (servidor de dev rodando, conta de teste descartável criada direto via Mongoose e removida ao final, confirmado com 0 remanescentes por consulta independente): **10/10 passaram** — IMC no recálculo de `updateMe`; nova entrada de histórico ao mudar peso; previsão de prazo coerente e depois contraditória no mesmo usuário; aviso de proteína dentro/fora da faixa; aviso de calorias dentro/fora da faixa; regressão do clamp máximo (250kg + Recovery → 400/5299/527, idêntico ao CP-A.1); histórico final com as 2 entradas reais em ordem ascendente.

## Revisão (CP-A.2.2) — auditoria de limites, calorias/carboidrato/gordura alargados, proteína desacoplada

Partiu de um achado da revisão deste documento: assim como o CP-A.1 precisou clampar a proteína (ela podia passar do limite do schema e quebrar o PATCH inteiro), o mesmo problema existia pra `dailyCalorieTarget`/`dailyCarbTarget` — e, nesse caso, alcançável com um perfil **comum**, não só extremo (ex.: mulher 40kg/150cm/70 anos sedentária com `weightGoal: 'lose'` → meta real de 492kcal, abaixo do piso antigo de 500; o mesmo perfil com `goal: 'Wellness'` → carboidrato de 22g, abaixo do piso antigo de 50 — os dois confirmados batendo exatamente com a implementação real antes de qualquer mudança).

### Auditoria completa dos 3 lugares (mais o clamp, que não é um schema mas é o 4º lugar relevante)

| Campo | `calculateMacrosSchema` (Zod) | `updateUserSchema` (Zod) | Mongoose | Clamp automático (`macroCalculation.utils.ts`) |
|---|---|---|---|---|
| `weight` | `.positive()` — **sem piso/teto** | 20–300 | 20–300 | N/A |
| `height` | `.positive()` — **sem piso/teto** | 100–250 | 100–250 | N/A |
| `targetWeight` | `.positive().optional()` — **sem piso/teto** | 20–300 (opcional) | 20–300 (opcional) | N/A |
| `birthDate` | só formato de data válida (YYYY-MM-DD) — **sem limite de idade plausível** | idem — **sem limite de idade plausível** | `Date`, sem `min`/`max` — **sem limite de idade plausível** | N/A |
| `dailyProteinTarget` | N/A (campo de saída, não de entrada deste schema) | **10–800** (era 10–400) | **10–800** (era 10–400) | **10–400, inalterado** |
| `dailyCalorieTarget` | N/A | **300–15.000** (era 500–10.000) | **300–15.000** (era 500–10.000) | N/A |
| `dailyCarbTarget` | N/A | **0–1.500** (era 50–800) | **0–1.500** (era 50–800, opcional) | N/A |
| `dailyFatTarget` | N/A | não existe — campo não é editável manualmente (decisão do CP-A.2, Tarefa 1) | **0–600** (era 0–500, opcional) | N/A |

**Confirmado com os valores reais do código:** peso máximo aceito pelo schema = 300kg; maior multiplicador em `PROTEIN_MULTIPLIERS` = 2,2 (`Recovery`). Produto = 300 × 2,2 = **660g** — o novo teto de validação (800) fica acima com margem, mesmo numa edição manual no limite físico do schema.

**Assimetrias confirmadas (nem todas são bugs):**
- `weight`/`height`/`targetWeight` sem piso/teto em `calculateMacrosSchema` — a instância de `weight` foi registrada no CP-A.1; a instância de `targetWeight` foi registrada no próprio CP-A.2 (ver achado 1 da lista "Achados fora do escopo" mais abaixo neste mesmo documento). Continua sem correção, fora do escopo desta tarefa.
- **`birthDate` nunca teve nenhum limite de idade plausível, em nenhum dos 3 lugares** — só valida que a string é uma data real (`YYYY-MM-DD` calendário-válido), nunca que a idade resultante é humanamente plausível. Isso nunca tinha sido confirmado explicitamente nesta linha de trabalho antes. Não foi corrigido aqui (fora do escopo desta tarefa) — ver achado abaixo sobre a consequência real disso.
- `dailyProteinTarget` agora é **deliberadamente** assimétrico entre validação (10–800) e clamp (10–400) — isso é o propósito da Tarefa 3, não um bug.

### Limites alargados (Tarefas 2-4)

Novas constantes em `packages/shared/src/schemas/user.ts`, única fonte pros 3 schemas que as usam (2 Zod + Mongoose), mesmo padrão já estabelecido pra proteína no CP-A.1:

```ts
export const DAILY_PROTEIN_TARGET_MIN = 10;              // clamp automático — inalterado
export const DAILY_PROTEIN_TARGET_MAX = 400;              // clamp automático — inalterado
export const DAILY_PROTEIN_TARGET_VALIDATION_MIN = 10;    // validação — novo, desacoplado do clamp
export const DAILY_PROTEIN_TARGET_VALIDATION_MAX = 800;   // validação — novo, desacoplado do clamp
export const DAILY_CALORIE_TARGET_MIN = 300;               // era 500
export const DAILY_CALORIE_TARGET_MAX = 15_000;            // era 10_000
export const DAILY_CARB_TARGET_MIN = 0;                     // era 50
export const DAILY_CARB_TARGET_MAX = 1_500;                 // era 800
export const DAILY_FAT_TARGET_MIN = 0;                      // inalterado
export const DAILY_FAT_TARGET_MAX = 600;                    // era 500
```

`apps/api/src/models/User.ts` importa todas elas (mesma exceção pontual já documentada na Tarefa 7). O `macroTargetSchema` vestigial também foi atualizado pra usar as mesmas constantes (mesmo tratamento já dado à proteína no CP-A.1 — continua sem uso real em lugar nenhum, mas sem literais soltos desatualizados).

**A filosofia não muda:** este piso/teto é só proteção de sanidade contra dado obviamente quebrado (negativo, erro de digitação) — não uma recomendação de dieta. A orientação de bom senso continua sendo o aviso suave e não-bloqueante da Tarefa 6 (faixas de g/kg e BMR/TDEE), **intocado** por esta revisão.

### Decisão de validação de proteína (Tarefa 3) — confirmada com teste real

`PATCH /users/me { dailyProteinTarget: 500 }` (sem nenhum campo-gatilho) → **200**, `dailyProteinTarget: 500` salvo literalmente (não 400 — o clamp nunca é acionado no caminho de edição manual, confirmado). Regressão: `PATCH { weight: 250, goal: 'Recovery', weightGoal: 'maintain' }` (com campo-gatilho) → `dailyProteinTarget: 400, dailyCalorieTarget: 5299, dailyCarbTarget: 527` — **idêntico** aos números já confirmados no CP-A.1/CP-A.2, provando que o clamp automático não mudou de comportamento.

### Verificação empírica por força bruta (Tarefa 5)

Script isolado (fora do repositório), importando `calculateMacroTargets` real via `tsx`, percorrendo 1.392.000 combinações: peso 20–300 (passo 10), altura 100–250 (passo 10), **idade 0–120 (passo 5, assumida — sem limite real confirmado na auditoria acima)**, 2 sexos, 5 atividades, 3 `weightGoal`, 4 `goal`.

| | Mínimo encontrado | Máximo encontrado | Dentro do novo limite? |
|---|---|---|---|
| `dailyCalorieTarget` | **-423** | 8.978 | Máx ✅ / **Mín ❌ (abaixo de 300)** |
| `dailyCarbTarget` | **-134** | 1.171 | Máx ✅ / **Mín ❌ (abaixo de 0)** |
| `dailyFatTarget` | **-14** | 299 | Máx ✅ / **Mín ❌ (abaixo de 0)** |

**Os 3 tetos ficam dentro dos novos limites com boa margem.** Os 3 **pisos não ficam** — reportando explicitamente, sem ajustar os números por conta própria, conforme pedido.

**Causa raiz confirmada, não é só "idade extrema":** o caso mínimo de calorias/gordura ocorre em `weight=20, height=100, age=120, female, sedentary, lose`. Testei isoladamente se bastava limitar a idade: **não basta** — com o MESMO peso/altura/sexo/atividade/objetivo, mesmo na idade mais favorável possível (`age=0`), o resultado já é `dailyCalorieTarget=297` (ainda abaixo de 300). Ou seja, a combinação `weight=20` + `height=100` (os dois já no próprio piso do schema de `updateUserSchema`/Mongoose, 20kg e 100cm — não tocados por esta tarefa) + `female` + `sedentary` + `lose` **já é suficiente por si só**, independente de qualquer suposição sobre idade. O caso mínimo de carboidrato ocorre num canto diferente (`weight=180`, `goal=Recovery`, mesma idade/sexo/atividade/objetivo) — proteína bruta alta (396g, quase no teto do clamp) deixando pouquíssima margem de calorias pro carboidrato.

**Não corrigido aqui, fora do escopo desta tarefa** — os pisos de 300/0/0 absorvem todos os perfis **realistas** testados (inclusive os dois do contexto motivador desta tarefa), mas não absorvem este canto duplamente extremo (peso/altura no próprio piso físico do schema, combinados com sedentarismo e objetivo de perda). A causa real não é "o piso de calorias está baixo demais" — é a ausência de qualquer validação cruzada entre peso/altura/idade (confirmada na auditoria acima: nenhum dos 3 campos valida o outro) e a ausência de um limite de idade plausível em `birthDate`. Reduzir ainda mais o piso de calorias não resolveria isso de forma sã (sempre existiria uma combinação sintética mais extrema); a correção real seria uma validação cruzada de plausibilidade (peso×altura×idade) ou um limite de idade em `birthDate`, deixado para uma tarefa futura, caso o usuário decida que vale a pena.

### Testes pendentes do CP-A.2.1 (Tarefas 6 e 7) — executados, corpo de resposta real

**Tarefa 6 — `imc` e `weightTargetEta` juntos, com campo-gatilho:** conta com `weight=70`, `weightGoal='lose'`, `targetWeight=60` já salvos. `PATCH { weight: 72 }` (campo-gatilho, sem `targetWeight` no body) →

```json
{
  "dailyProteinTarget": 115, "dailyCalorieTarget": 2040, "dailyCarbTarget": 242,
  "imc": 23.5, "imcUnit": "kg/m²", "imcClassification": "normal",
  "weightTargetEta": { "etaDays": 185 }
}
```

`imc` e `weightTargetEta` presentes **juntos**, confirmando a explicação do CP-A.2.1: `imc` aparece porque o campo-gatilho disparou recálculo; `weightTargetEta` aparece porque já não dependia disso — os dois são independentes entre si quando ambos os caminhos coincidem.

**Tarefa 7 — combinação tripla (campo-gatilho + `targetWeight` + manual fora da faixa, tudo no mesmo body):** mesma conta, agora com `weight=72`. `PATCH { weight: 80, targetWeight: 65, dailyProteinTarget: 700 }` →

```json
{
  "dailyProteinTarget": 128, "dailyCalorieTarget": 2164, "dailyCarbTarget": 251,
  "weight": 80, "targetWeight": 65,
  "imc": 26.1, "imcUnit": "kg/m²", "imcClassification": "overweight",
  "weightTargetEta": { "etaDays": 231 }
}
```

(sem `warnings` na resposta.) Confirma os 3 pontos pedidos: **proteína recalculada (128) prevaleceu sobre a manual (700)**; **a previsão de prazo usou o peso NOVO** (80→65, não o antigo 72→65); **nenhum `warnings` apareceu**, porque havia campo-gatilho no body (não é caminho de edição manual pura).

**Nota de precisão descoberta durante este teste:** a primeira tentativa usou `dailyProteinTarget: 999` (valor originalmente sugerido só pra estar "claramente fora da faixa de aviso") — mas o PATCH foi rejeitado com **400** antes de chegar à lógica de recálculo, porque `999` excede o novo teto de validação do schema (800). Isso não é um bug: o Zod valida o corpo bruto do request **antes** de qualquer lógica de "recalculado prevalece sobre manual" rodar — um valor manual só é substituído pelo recalculado depois de já ter passado pela validação de schema. O teste foi refeito com `700` (dentro de 10–800, ainda bem fora da faixa de aviso de 0,8–3,5g/kg), confirmando o comportamento pretendido.

## Revisão (CP-A.2.3) — conformidade retroativa, idade plausível, aviso de carboidrato, piso de calorias e proteína pelo orçamento

Fecha 3 pendências da revisão do CP-A.2.2: falta de citação de linha (REQUISITOS daquela tarefa pedia, não foi suprido); duas imprecisões de redação na documentação (corrigidas acima, nas notas "Correção de premissa" e "Correção de redação"); e dois cantos sintéticos que a força bruta do CP-A.2.2 encontrou produzindo valores negativos mesmo depois do alargamento de limites.

### Conformidade retroativa do CP-A.2.2 — linhas exatas

As 10 constantes criadas/alteradas e todos os pontos que passaram a usá-las, em `packages/shared/src/schemas/user.ts` (estado atual do arquivo, após também as mudanças desta revisão):

| Constante | Linha da definição | Usada em (linhas) |
|---|---|---|
| `DAILY_PROTEIN_TARGET_MIN` | 44 | `apps/api/src/utils/macroCalculation.utils.ts:190` (clamp automático — único consumidor desde o CP-A.2.2) |
| `DAILY_PROTEIN_TARGET_MAX` | 45 | `apps/api/src/utils/macroCalculation.utils.ts:191` (idem) |
| `DAILY_PROTEIN_TARGET_VALIDATION_MIN` | 52 | `user.ts:185,188,189` (`updateUserSchema`); `user.ts:357,360,361` (`macroTargetSchema`); `apps/api/src/models/User.ts:493` (Mongoose) |
| `DAILY_PROTEIN_TARGET_VALIDATION_MAX` | 53 | `user.ts:185,188,189`; `user.ts:357,360,361`; `apps/api/src/models/User.ts:494` |
| `DAILY_CALORIE_TARGET_MIN` | 64 | `user.ts:194,197,198` (`updateUserSchema`); `user.ts:348,351,352` (`macroTargetSchema`); `apps/api/src/models/User.ts:499` |
| `DAILY_CALORIE_TARGET_MAX` | 65 | `user.ts:194,197,198`; `user.ts:348,351,352`; `apps/api/src/models/User.ts:500` |
| `DAILY_CARB_TARGET_MIN` | 66 | `user.ts:203,206,207` (`updateUserSchema`); `user.ts:366,369,370` (`macroTargetSchema`); `apps/api/src/models/User.ts:506` |
| `DAILY_CARB_TARGET_MAX` | 67 | `user.ts:203,206,207`; `user.ts:366,369,370`; `apps/api/src/models/User.ts:507` |
| `DAILY_FAT_TARGET_MIN` | 71 | `user.ts:376,379,380` (`macroTargetSchema`); `apps/api/src/models/User.ts:512` (Mongoose — `dailyFatTarget` não existe em `updateUserSchema`, ver achado 4 da lista abaixo) |
| `DAILY_FAT_TARGET_MAX` | 72 | `user.ts:376,379,380`; `apps/api/src/models/User.ts:513` |

`apps/api/src/models/User.ts` importa **as 10**, num único bloco (`User.ts:16-27`): as 8 ligadas a macros (`DAILY_CALORIE_TARGET_MAX/MIN`, `DAILY_CARB_TARGET_MAX/MIN`, `DAILY_FAT_TARGET_MAX/MIN`, `DAILY_PROTEIN_TARGET_VALIDATION_MAX/MIN`, linhas 17-24) e as 2 de idade plausível (`MAX_PLAUSIBLE_AGE_YEARS`/`MIN_PLAUSIBLE_AGE_YEARS`, linhas 25-26, adicionadas depois na Tarefa 3 da "Revisão (CP-A.2.3)", no mesmo bloco de import). `DAILY_FAT_TARGET_MIN`/`MAX` estão entre as importadas (linhas 22 e 21) — a frase anterior ("8 primeiras") estava ambígua e, lida contra a ordem de linhas da tabela acima (que lista proteína primeiro, gordura por último), parecia excluir gordura. **Correção (CP-A.2.4):** confirmado com `tsc --noEmit` (limpo) que o import real de 10 constantes compila sem erro — nunca houve contradição no código, só na frase. Exceção pontual já documentada na Tarefa 7 do CP-A.2.

### Confirmação da ordem real de cálculo (pré-requisito desta revisão)

Lida direto de `apps/api/src/utils/macroCalculation.utils.ts` (estado antes desta revisão). A reconstrução por engenharia reversa do prompt desta tarefa (BMR → TDEE → calorieTarget; **fat → protein**; carb = resto) bate em quase tudo, com uma diferença real: **a ordem original tinha `protein` (bruto + primeiro clamp) calculado ANTES de `dailyFatCalories`**, não depois — os dois eram mutuamente independentes antes desta revisão (gordura só depende de `dailyCalorieTarget`; proteína só depende de peso+`goal`), então a ordem entre eles nunca importou matematicamente até agora.

O reclamp da Tarefa 6 (abaixo) introduz uma dependência nova (proteína passa a depender do valor de gordura), e por isso a função **precisou ser reordenada**: gordura agora é calculada antes do clamp de proteína. Implementado de acordo com essa confirmação, não com a reconstrução original do prompt — reportado aqui como pedido.

### Idade plausível em `birthDate` (Tarefa 3)

`MIN_PLAUSIBLE_AGE_YEARS = 13`, `MAX_PLAUSIBLE_AGE_YEARS = 120` (`packages/shared/src/schemas/user.ts:85-86`). Como `birthDate` é uma data, não um número, implementado como `.refine()` no `birthDateSchema` (`user.ts:93-130`, função auxiliar + pipeline que já existia desde o CP-A) e como `validate` customizado no Mongoose (`apps/api/src/models/User.ts:595-620`) — nenhum dos dois usa `.min()`/`.max()` direto na data. O cálculo de idade dentro do `.refine()` é uma duplicação deliberada do mesmo algoritmo de `calculateAge` (não importável de `apps/api` por direção de dependência do monorepo).

**Teste (Zod e Mongoose, os dois confirmados):**

| Idade enviada | Esperado | Zod | Mongoose |
|---|---|---|---|
| 10 | rejeitar | REJEITADO (`number_range`, min 13/max 120) | REJEITADO |
| 13 | aceitar | ACEITO | ACEITO |
| 120 | aceitar | ACEITO | ACEITO |
| 125 | rejeitar | REJEITADO | REJEITADO |

### Aviso suave simétrico de carboidrato (Tarefa 4)

`CARB_PER_KG_WARNING_MIN = 0.5`, `CARB_PER_KG_WARNING_MAX = 8` (`macroCalculation.utils.ts`). Mesma mecânica dos outros dois avisos: `evaluateManualMacroEditWarnings` ganhou um 3º bloco de checagem (`dailyCarbTarget / currentWeight`), e `updateMe` (`user.controller.ts`) passou a incluir `dailyCarbTarget` tanto na condição de `isManualMacroEdit` quanto no objeto passado pra função de avaliação.

**Teste de integração real** (conta de teste descartável, removida ao final, 0 remanescentes confirmado): `PATCH { dailyCarbTarget: 30 }` (peso 100kg, 0,3g/kg, sem campo-gatilho) → **200**, corpo de resposta com `"dailyCarbTarget": 30` e:
```json
"warnings": [{ "field": "dailyCarbTarget", "code": "macros/carb-below-range", "message": "warnings.manualMacroEdit.carbBelowRange" }]
```
Repetindo o mesmo valor (30) mas agora com `weight` também no body (campo-gatilho) → `warnings` ausente, `dailyCarbTarget` salvo é o recalculado (360), não o manual (30) — mesma regra de precedência já validada pros outros avisos.

### Piso de sanidade de 1.200kcal na sugestão automática (Tarefa 5)

`AUTO_CALORIE_TARGET_MIN_SUGGESTION = 1_200` (`packages/shared/src/schemas/user.ts:79`), aplicado em `macroCalculation.utils.ts:177`: `dailyCalorieTarget = Math.max(rawDailyCalorieTarget, AUTO_CALORIE_TARGET_MIN_SUGGESTION)`. Só a sugestão automática — a validação de edição manual continua `DAILY_CALORIE_TARGET_MIN/MAX` (300–15.000), sem nenhuma mudança: um valor manual entre 300 e 1.200 continua aceito normalmente (testado: `PATCH { dailyCalorieTarget: 800 }` sem campo-gatilho → 200, salvo).

**Teste** (perfil do achado original do CONTEXTO, agora com idade 13 — a nova idade mínima — em vez da idade 120 usada no achado original): peso 20kg, altura 100cm, sedentária, 13 anos, feminino, `lose`, goal `Wellness` → `dailyCalorieTarget = 1200` exatamente (antes desta correção, seria negativo). Confirmado via chamada direta à função real.

### Proteína automática reclampada pelo orçamento calórico (Tarefa 6)

Em `macroCalculation.utils.ts`, depois do piso de calorias e do cálculo de gordura (agora antecipado, ver "ordem real de cálculo" acima): `calorieBudgetProteinCeiling = Math.floor((dailyCalorieTarget - dailyFatCalories) / 4)`, e `dailyProteinTarget = Math.min(dailyProteinTargetClampedByFixedRange, calorieBudgetProteinCeiling)`. `Math.floor` (não `Math.round`) deliberadamente — garante que a proteína nunca ultrapassa o orçamento nem por fração de grama, o que por sua vez garante `dailyCarbTarget >= 0` por construção matemática (não só na prática).

**Teste 1** (perfil do achado original do CP-A.2.2 — peso 180kg, altura 100cm, 120 anos, feminino, sedentária, `lose`, goal `Recovery`): `dailyProteinTarget = 261` (reclampado; o clamp fixo por si só teria dado 396, dentro de 10-400), `dailyCalorieTarget = 1497`, `dailyCarbTarget = 1` (>= 0, confirmado). Bate exatamente com a fórmula do reclamp: orçamento = `(1497 - 449,1) / 4 = 261,975`, `floor = 261`.

**Teste 2 (regressão):** peso 250kg + `goal: Recovery` + `weightGoal: maintain` (mesmo cenário já confirmado no CP-A.1 e no CP-A.2.2) → `dailyProteinTarget = 400` — **inalterado**. Esse perfil tem orçamento calórico de sobra (927g de proteína caberiam no orçamento), então o clamp fixo de 400 continua sendo o teto efetivo, não o orçamento.

### Verificação empírica final (Tarefa 7)

Mesmo script/método do CP-A.2.2, agora com idade 13–120 (em vez de 0–120) e os dois clamps novos já aplicados: 1.280.640 combinações (peso 20–300 passo 10, altura 100–250 passo 10, 23 idades entre 13 e 120, 2 sexos, 5 atividades, 3 `weightGoal`, 4 `goal`).

| | Mínimo encontrado | Dentro do esperado? |
|---|---|---|
| `dailyCalorieTarget` | **1.200** (exato) | ✅ nunca abaixo de 1.200 |
| `dailyCarbTarget` | **0** (exato) | ✅ nunca negativo |
| `dailyFatTarget` | **40** | ✅ nunca negativo |

**Zero violações em qualquer combinação testada.** O piso de calorias e o reclamp de proteína juntos contêm matematicamente todo o espaço testado — diferente da verificação do CP-A.2.2, que tinha encontrado violações reais.

## Revisão (CP-A.2.4) — 3 verificações da revisão do CP-A.2.3

Nenhuma reabre código das Tarefas 1-7 do CP-A.2.3 — só verificações, com correção pontual de cada uma quando confirmada.

### Ponto 1 — contradição do import de `dailyFatTarget` em `User.ts`

Resolvido acima, na frase corrigida da Tarefa 1 ("Conformidade retroativa do CP-A.2.2"). Resumo: **não havia bug de código** — `DAILY_FAT_TARGET_MIN`/`MAX` sempre estiveram no único bloco de import (`User.ts:16-27`), junto com as outras 7 (hoje 9, depois da Tarefa 3 abaixo) constantes de `@blendi/shared`. A contradição era só a frase "8 primeiras", ambígua contra a ordem de linhas da tabela. `tsc --noEmit` confirmado limpo com o import real.

### Ponto 2 — cronologia de `targetWeight` confirmada por citação literal

A "correção de redação" do CP-A.2.3 (achado 1, acima) tinha concluído que a assimetria de `targetWeight` em `calculateMacrosSchema` foi registrada no **CP-A.2 original** (não só na auditoria do CP-A.2.2), mas sem citar o texto-fonte. Como nada deste histórico foi commitado em nenhum momento (git log confirma 0 commits desta trilha), a única fonte verificável é a própria chamada de escrita que criou este arquivo pela primeira vez, durante a implementação original do CP-A.2 — preservada literalmente nesta conversa. Texto original, exato, do achado 1 daquela primeira versão:

> 1. **`calculateMacrosSchema.targetWeight` não tem piso de 20kg** (só `.positive()`), ao contrário de `updateUserSchema.targetWeight` (20–300kg) — mesma assimetria entre os dois schemas de peso já registrada como achado incidental no CP-A.1 para `weight`, agora repetida para `targetWeight`.

Confirma, por citação literal (não suposição): a menção a `targetWeight` **já existia** na primeira versão do CP-A.2, antes de qualquer revisão. A cronologia da correção do CP-A.2.3 estava certa — nenhuma mudança adicional necessária.

### Ponto 3 — duplicação do cálculo de idade no validador do Mongoose, eliminada

Confirmado: `calculateAge(birthDate, now)` já existe, exportada, em `apps/api/src/utils/macroCalculation.utils.ts:92` — acessível de `apps/api/src/models/User.ts` sem ciclo real. `macroCalculation.utils.ts:18` importa de `User.ts` só com `import type {...}` (tipos `ActivityLevel`/`BiologicalSex`/`UserGoal`/`WeightGoal`), que o TypeScript sempre erase na compilação — então o grafo de módulos em tempo de execução, mesmo com `User.ts` agora importando `calculateAge` de volta, é só `User.ts -> macroCalculation.utils.ts`, nunca os dois sentidos. A justificativa de "direção de dependência" realmente não se aplicava aqui (ela é real só para o `.refine()` em `packages/shared`, que não pode importar de `apps/api` em nenhuma circunstância).

**Refatorado:** `apps/api/src/models/User.ts:34` (novo import de `calculateAge`); validador em `User.ts:595-611` (era 595-620) agora chama `calculateAge(value, new Date())` em vez de duplicar o algoritmo inline. Comportamento idêntico, confirmado por `tsc --noEmit` limpo.

**Regressão** (os mesmos 4 casos já usados no CP-A.2.3, Zod e Mongoose — nenhum teste novo):

| Idade | Zod (não tocado) | Mongoose (refatorado) |
|---|---|---|
| 10 | REJEITADO | REJEITADO |
| 13 | ACEITO | ACEITO |
| 120 | ACEITO | ACEITO |
| 125 | REJEITADO | REJEITADO |

Idêntico ao já reportado no CP-A.2.3 — a refatoração não mudou nenhum comportamento observável, só eliminou a duplicação.

## Achados fora do escopo

1. ~~`calculateMacrosSchema.targetWeight` não tem piso de 20kg~~ (só `.positive()`), ao contrário de `updateUserSchema.targetWeight` (20–300kg) — mesma categoria de assimetria já registrada no CP-A.1 para `weight`; esta é a primeira vez que a mesma assimetria é registrada especificamente para `targetWeight` (aqui, no CP-A.2). **Resolvido no [CP-A.3](cp-a.3-targetweight-piso-e-gordura-manual.md)**: `calculateMacrosSchema.targetWeight` ganhou o mesmo piso/teto (20-300) de `updateUserSchema.targetWeight`. `weight`/`height` do mesmo schema continuam sem piso/teto — não eram o que este achado rastreava, e não foram tocados por aquela correção.

   **Correção de redação (CP-A.2.3):** a frase anterior deste item usava "agora repetida", e a seção "Revisão (CP-A.2.2)" (mais acima neste documento) resumia o mesmo fato como "já registrada... no CP-A.2" — as duas frases descrevem exatamente a mesma cronologia (CP-A.1 → `weight`; CP-A.2 → `targetWeight`) e não são contraditórias entre si, mas a palavra "agora" num item que já existia antes da revisão do CP-A.2.2 criava ambiguidade sobre QUANDO esse "agora" se referia. Reescrito sem essa palavra pra eliminar a ambiguidade.
2. ~~`dailyCalorieTarget` (500–10.000) e `dailyCarbTarget` (50–800) continuam duplicados entre os schemas Zod e o Mongoose, sem uma fonte única~~ — **resolvido no CP-A.2.2**: os dois agora são unificados via `@blendi/shared` (300–15.000 e 0–1.500 respectivamente), mesmo padrão já usado pra proteína. Ver "Revisão (CP-A.2.2)" acima.
3. **`bmr` não é persistido no modelo** — só existe como campo transitório no retorno de `calculateMacroTargets()`, usado internamente pela checagem de aviso de calorias. Isso é intencional (a Tarefa 6 nunca pediu pra armazenar BMR), diferente de `dailyFatTarget`, que a Tarefa 1 pediu explicitamente pra persistir — mencionando aqui só pra deixar claro que a assimetria entre os dois é proposital, não uma inconsistência.
4. ~~`dailyCarbTarget` e `dailyFatTarget` não têm nenhum aviso de edição manual~~ — **parcialmente resolvido no CP-A.2.3**: `dailyCarbTarget` ganhou o aviso simétrico (0,5–8g/kg, ver "Revisão (CP-A.2.3)" acima). `dailyFatTarget` continua sem aviso — e continua nem editável manualmente (nunca exposto em `updateUserSchema`), ver achado 9 abaixo (tarefa combinada já decidida, ainda não implementada).
5. **O histórico de peso não tem limite de tamanho, TTL ou paginação** — aceitável agora ("sem paginação por enquanto, dado o volume esperado", conforme o próprio prompt), mas um usuário que edita o peso com muita frequência por anos cresceria o array indefinidamente. Não é um problema hoje; é uma observação para quando o volume real for conhecido.
6. **Registro de conta continua quebrado** (`POST /auth/register`/`POST /auth/google`), carregado do CP-A — não é um achado novo desta correção, só reconfirmando que o estado permanece o mesmo (nenhuma tarefa deste CP tocou em `auth.controller.ts`/`google.controller.ts`).
7. ~~`birthDate` não tem nenhum limite de idade plausível, em nenhuma das 3 camadas~~ — **resolvido no CP-A.2.3**: idade plausível (13–120) validada nos 3 lugares, ver "Revisão (CP-A.2.3)" acima. A ausência de validação cruzada entre peso/altura/idade (a causa mais profunda do canto sintético que a força bruta do CP-A.2.2 tinha encontrado) continua não implementada — mas deixou de ser necessária pra conter o problema original: o piso de 1.200kcal + o reclamp de proteína pelo orçamento (Tarefas 5 e 6 do CP-A.2.3) contêm matematicamente o espaço inteiro, confirmado por força bruta com zero violações, mesmo sem validação cruzada.
8. **Um valor manual fora do teto de validação (ex.: `dailyProteinTarget` > 800) é rejeitado pelo Zod antes de qualquer lógica de "recalculado prevalece sobre manual" rodar**, mesmo quando o mesmo body tem um campo-gatilho que faria o valor manual ser descartado de qualquer forma. Descoberto ao testar a combinação tripla do CP-A.2.2/CP-A.2.3 — comportamento correto e esperado (validação de schema sempre roda sobre o corpo bruto do request), só documentando porque não era óbvio antes de testar.
9. ~~(Novo, CP-A.2.3) `dailyFatTarget` editável manualmente — tarefa combinada já decidida, ainda não implementada.~~ Hoje `dailyFatTarget` não existe em `updateUserSchema` (não é manualmente editável) e, por consequência, não tem nenhum aviso suave (ao contrário de proteína, calorias e agora carboidrato). Decisão já tomada (não avaliada aqui): quando isso for implementado, caberá ao usuário a responsabilidade pela consistência entre os 4 campos manuais quando editados juntos (proteína+calorias+carboidrato+gordura não necessariamente somam entre si se cada um for editado de forma independente) — nenhuma validação cruzada entre os 4 está planejada para essa tarefa futura, só o limite rígido (0–600, já existente) e o aviso suave simétrico aos outros 3. **Resolvido no [CP-A.3](cp-a.3-targetweight-piso-e-gordura-manual.md)**: exatamente como previsto aqui — `dailyFatTarget` ganhou o limite rígido (0–600) estendido também pro Zod (`updateUserSchema`) e um aviso suave simétrico (0,5–2g/kg), sem nenhuma validação cruzada entre os 4 campos manuais.
