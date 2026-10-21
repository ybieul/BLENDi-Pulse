# CP-A.3 — Piso do peso-alvo em `calculateMacros` e edição manual de `dailyFatTarget`

**Data:** 2026-10-16
**Base:** [cp-a.2-macros-complementares.md](cp-a.2-macros-complementares.md), "Achados fora do escopo" — achado 1 (`targetWeight` sem piso em `calculateMacrosSchema`) e achado 9 (`dailyFatTarget` editável manualmente, decisão já tomada, nunca implementada).
**Escopo implementado:** as 2 tarefas do prompt — piso/teto do peso-alvo no endpoint de cálculo de macros; edição manual de `dailyFatTarget` com o mesmo limite de sanidade e o mesmo mecanismo de aviso não-bloqueante já usados por proteína/calorias/carboidrato.
**Método:** mesmo rigor da linha de trabalho — leitura do código real antes de cada mudança, `tsc --noEmit` nos 3 workspaces (`packages/shared`, `apps/api`, `apps/mobile`) a cada passo, e teste de integração real contra o servidor de dev subido só para este teste, com conta de teste descartável criada via Mongoose e removida ao final (confirmado com 0 remanescentes por consulta independente).

---

## Arquivos alterados

| Arquivo | O que mudou |
|---|---|
| `packages/shared/src/schemas/user.ts` | `calculateMacrosSchema.targetWeight` ganhou piso/teto (20-300); `updateUserSchema.dailyFatTarget` (novo campo, editável manualmente) |
| `apps/api/src/utils/macroCalculation.utils.ts` | `FAT_PER_KG_WARNING_MIN`/`MAX`; `MacroEditWarningField` e `ManualMacroEditWarningInput` estendidos com `dailyFatTarget`; novo bloco de checagem em `evaluateManualMacroEditWarnings` |
| `apps/api/src/controllers/user.controller.ts` | `updateMe`: `dailyFatTarget` destructurado, incluído em `updates`, no gatilho de `isManualMacroEdit` e no payload de `evaluateManualMacroEditWarnings` |

Nenhuma mudança em `apps/api/src/models/User.ts` — o limite de sanidade de `dailyFatTarget` (`DAILY_FAT_TARGET_MIN`/`MAX`, 0-600) já existia lá desde o CP-A.2 (Tarefa 1), só nunca era alcançável por uma edição manual porque o campo não existia em `updateUserSchema`.

---

## Tarefa 1 — piso do peso-alvo em `calculateMacrosSchema`

**O que foi feito:** `calculateMacrosSchema.targetWeight` (`packages/shared/src/schemas/user.ts:332-337`) ganhou `.min(20, ...).max(300, ...)`, antes só `.positive()`. Mesmos números literais já usados em `updateUserSchema.targetWeight` (`packages/shared/src/schemas/user.ts:252-257`) — nenhum valor novo inventado, reaproveitando exatamente o piso/teto que já protegia o endpoint de atualização de perfil.

**Por que `weight`/`height` do mesmo schema não foram tocados:** o achado 1 de "Achados fora do escopo" do CP-A.2 lista especificamente `targetWeight` como a assimetria rastreada (a menção a `weight`/`height` existe só como observação de contexto dentro da seção "Revisão (CP-A.2.2)" do mesmo documento, nunca como achado numerado) — e o prompt desta correção pede explicitamente só o peso-alvo. `weight`/`height` em `calculateMacrosSchema` continuam só com `.positive()`, intocados.

**Ressalva encontrada e registrada, não corrigida (fora do pedido):** este schema aceita `unitSystem: 'imperial'`, e o controller (`calculateMacros`, `user.controller.ts:1091-1098`) só converte `weight`/`height`/`targetWeight` pra métrico **depois** da validação Zod. O novo piso/teto (20-300) assume o valor já em kg — exatamente a mesma suposição implícita que `weight`/`height` já fazem neste schema (nenhum dos dois tem conversão prévia à validação). Na prática, isso não é hoje um caminho real: o único caller existente no app mobile (`OnboardingBodyScreen.tsx:146-154`) sempre converte para métrico no cliente e envia `unitSystem: 'metric'` literalmente — nunca `'imperial'` com valores em libras. Registrando a limitação por transparência (não inventei uma correção não pedida — isso exigiria validação cruzada com `unitSystem`, fora do escopo desta tarefa).

**Validação real** (servidor de dev subido só para este teste; conta de teste `cp-a2-5-prompt1-test-<timestamp>@test.blendi.local`, peso 70kg/165cm/30 anos/feminino/sedentary, criada via Mongoose e removida ao final — 0 remanescentes confirmado por `countDocuments` independente):

| Caso | `targetWeight` enviado | Resultado |
|---|---|---|
| Abaixo do novo piso | `15` | **400**, `errors: [{ field: "targetWeight", minimum: 20, message: '{"key":"errors.validation.number_range","min":20,"max":300}' }]` |
| Válido (regressão) | `65` | **200**, `weightTargetEta` presente na resposta |
| Acima do novo teto | `301` | **400**, erro no campo `targetWeight` |

Corpo real da rejeição (`targetWeight: 15`):
```json
{
  "success": false,
  "code": "validation/invalid-input",
  "message": "Validation failed.",
  "errors": [{ "field": "targetWeight", "message": "{\"key\":\"errors.validation.number_range\",\"min\":20,\"max\":300}", "minimum": 20 }]
}
```

---

## Tarefa 2 — edição manual de `dailyFatTarget`

**O que já existia (confirmado antes de implementar), reaproveitado sem mudança:**
- `DAILY_FAT_TARGET_MIN`/`MAX` (0-600) — `packages/shared/src/schemas/user.ts:71-72`, já usadas no Mongoose (`apps/api/src/models/User.ts:516-521`) desde o CP-A.2, Tarefa 1.
- O mecanismo de gatilho/precedência em `updateMe` (`shouldRecalculateMacroTargets`, `isManualMacroEdit`, `updates.dailyFatTarget = recalculated.dailyFatTarget` já setado incondicionalmente no bloco de recálculo desde o CP-A.2) — nenhuma mudança necessária nesse bloco: ele já sobrescrevia `dailyFatTarget` sempre que recalculava, mesmo antes de o campo ser editável manualmente.

**O que foi adicionado:**

1. **`updateUserSchema.dailyFatTarget`** (`packages/shared/src/schemas/user.ts:214-220`), novo campo, mesmo padrão exato de `dailyProteinTarget`/`dailyCalorieTarget`/`dailyCarbTarget` (required_error/invalid_type_error + `.int()` + `.min()`/`.max()`), usando `DAILY_FAT_TARGET_MIN`/`MAX` — o limite de sanidade "que já existe hoje para gordura em outro lugar do sistema" (Mongoose), agora também validando este caminho de edição manual. Como todo o objeto de `updateUserSchema` é `.partial()` (linha ~291), o campo é opcional no PATCH, igual aos outros 3.

2. **Faixa saudável de gordura por kg de peso corporal** (`apps/api/src/utils/macroCalculation.utils.ts:239-250`):
   ```ts
   export const FAT_PER_KG_WARNING_MIN = 0.5;
   export const FAT_PER_KG_WARNING_MAX = 2;
   ```
   **Justificativa documentada no código e aqui:** piso (0,5g/kg) igual ao piso já usado para carboidrato — mesmo racional de "mínimo estrutural" (abaixo disso, a ingestão de ácidos graxos essenciais e a absorção de vitaminas lipossolúveis ficam comprometidas, independente do tipo de dieta). Teto (2g/kg): o próprio cálculo automático deste app deriva gordura de 30% das calorias, o que para um adulto de atividade moderada gira em torno de ~1g/kg — o teto de 2g/kg dá margem generosa pra dietas de maior proporção de gordura (ex. abordagens low-carb) sem deixar de sinalizar um valor manual claramente fora de qualquer faixa plausível. Coerente em ordem de grandeza com as faixas já existentes (proteína 0,8-3,5g/kg; carboidrato 0,5-8g/kg) — gordura é o macro mais denso em calorias (9 kcal/g vs. 4 de proteína/carboidrato), por isso sua faixa em g/kg é a mais estreita das 3, o que é esperado e não um descuido.

3. **`MacroEditWarningField`/`ManualMacroEditWarningInput`** estendidos com `'dailyFatTarget'` (`macroCalculation.utils.ts:236-245`) e novo bloco em `evaluateManualMacroEditWarnings` (`macroCalculation.utils.ts:343-357`), mesma mecânica exata dos outros 3 (percentual por kg, `<` dispara `macros/fat-below-range`, `>` dispara `macros/fat-above-range`, ambos com `message` de chave i18n ainda sem tradução — mesma decisão já tomada e documentada no CP-A.2/CP-A.2.3 para os outros 3: tradução é trabalho da tela mobile, fora do escopo backend-only).

4. **`user.controller.ts`, `updateMe`:** `dailyFatTarget` destructurado de `parsed.data` (linha 789), incluído em `updates` condicionalmente (linha 808, mesmo padrão `...(dailyFatTarget !== undefined && { dailyFatTarget })`), adicionado ao OR-chain de `isManualMacroEdit` (linhas 927-932) e passado para `evaluateManualMacroEditWarnings` (dentro do bloco `isManualMacroEdit`). A resposta já incluía `dailyFatTarget: user.dailyFatTarget` desde o CP-A.2 — nenhuma mudança necessária aí.

**Validação real** (mesma conta de teste da Tarefa 1, peso 70kg — faixa saudável de gordura = 35-140g):

| Caso | Body do PATCH | Resultado |
|---|---|---|
| Dentro da faixa (1,14g/kg) | `{ dailyFatTarget: 80 }` | **200**, `dailyFatTarget: 80`, sem `warnings` |
| Acima da faixa (2,86g/kg) | `{ dailyFatTarget: 200 }` | **200**, `dailyFatTarget: 200` (salvo literalmente), `warnings: [{ field: "dailyFatTarget", code: "macros/fat-above-range" }]` |
| Abaixo da faixa (0,29g/kg) | `{ dailyFatTarget: 20 }` | **200**, `dailyFatTarget: 20` (salvo literalmente), `warnings: [{ field: "dailyFatTarget", code: "macros/fat-below-range" }]` |
| Campo-gatilho + manual no mesmo body | `{ weight: 72, dailyFatTarget: 500 }` | **200**, `dailyFatTarget` = **58** (recalculado, não 500), sem `warnings` |
| Acima do limite de sanidade (regressão) | `{ dailyFatTarget: 700 }` | **400**, erro no campo `dailyFatTarget` (rejeitado pelo Zod antes de qualquer lógica de precedência — mesmo comportamento já documentado pra proteína no CP-A.2.2, nota "precisão descoberta durante teste") |
| Regressão — proteína isolada | `{ dailyProteinTarget: 50 }` | **200**, warning só em `dailyProteinTarget`, nenhuma interferência de gordura |

Corpo real do caso "acima da faixa" (200g):
```json
{
  "success": true,
  "data": {
    "user": {
      "dailyFatTarget": 200,
      "warnings": [{ "field": "dailyFatTarget", "code": "macros/fat-above-range", "message": "warnings.manualMacroEdit.fatAboveRange" }]
    }
  }
}
```

Corpo real do caso "gatilho + manual" (`weight: 72` + `dailyFatTarget: 500` no mesmo PATCH):
```json
{
  "success": true,
  "data": {
    "user": {
      "dailyProteinTarget": 115, "dailyCalorieTarget": 1728, "dailyCarbTarget": 187, "dailyFatTarget": 58,
      "weight": 72,
      "imc": 26.4, "imcUnit": "kg/m²", "imcClassification": "overweight"
    }
  }
}
```
Confirma os 2 pontos pedidos: **o valor recalculado (58) prevaleceu sobre o manual (500)**; **nenhum `warnings` apareceu**, porque havia campo-gatilho no body (não é caminho de edição manual pura) — exatamente o mesmo comportamento já validado para proteína/calorias/carboidrato no CP-A.2/CP-A.2.2.

---

## Resumo

As 2 tarefas implementadas e validadas com os 4 casos pedidos pelo prompt (peso-alvo abaixo do piso rejeitado; gordura manual dentro da faixa sem aviso; gordura manual fora da faixa com aviso sem bloquear; recálculo automático prevalecendo sobre gordura manual no mesmo body) mais 3 regressões (teto do novo piso de peso-alvo, limite de sanidade de gordura ainda bloqueando valores absurdos, proteína isolada sem interferência). `tsc --noEmit` limpo em `packages/shared`, `apps/api` e `apps/mobile` (precisou rebuildar `packages/shared` antes do typecheck de `apps/api`, já que este consome o `dist/` publicado, não a fonte). Nenhuma mudança no comportamento das outras 3 metas de macro nem nos cálculos automáticos — confirmado pela própria regressão de proteína isolada e pelo caso de recálculo automático, que reproduziu exatamente o mesmo padrão de precedência já existente. Nenhum build, `eas`, commit ou deploy foi executado. Servidor de dev subido só para este teste foi encerrado ao final.

**Achados fora do escopo, registrados e não corrigidos:**
1. **Ressalva de unidade em `calculateMacrosSchema.targetWeight`** (detalhada na Tarefa 1): o novo piso/teto assume valor em kg; um `unitSystem: 'imperial'` com valor em libras só é convertido depois da validação. Não é um caminho real hoje (único caller sempre envia métrico), mas é uma limitação de design do schema, pré-existente e compartilhada com `weight`/`height`.
2. **`GET /users/me` (`getMe`, `user.controller.ts`) não retorna `dailyFatTarget`** na resposta — todas as outras 3 metas (`dailyProteinTarget`, `dailyCalorieTarget`, `dailyCarbTarget`) aparecem lá, `dailyFatTarget` não, desde que o campo foi criado no CP-A.2. Isso significa que, hoje, um cliente mobile que só chama `GET /users/me` não veria o valor de gordura que acabou de editar manualmente sem reler via outro caminho (`updateMe` retorna o campo corretamente, confirmado nos testes acima; só `getMe` tem a lacuna). Não é consequência desta correção (a lacuna já existia antes, pra qualquer leitura de `dailyFatTarget`) e não foi tocado — fora do pedido desta tarefa, que era sobre tornar o campo editável, não sobre a leitura via `getMe`.

As 2 lacunas correspondem exatamente aos achados 1 e 9 de "Achados fora do escopo" do [cp-a.2-macros-complementares.md](cp-a.2-macros-complementares.md) — marcados como resolvidos lá, com referência cruzada a este documento.


Confirmado no arquivo real (`docs/fixes/cp-a.2-macros-complementares.md`), citação literal, sem paráfrase:

**Achado 1 (linha 300):**
> 1. ~~`calculateMacrosSchema.targetWeight` não tem piso de 20kg~~ (só `.positive()`), ao contrário de `updateUserSchema.targetWeight` (20–300kg) — mesma categoria de assimetria já registrada no CP-A.1 para `weight`; esta é a primeira vez que a mesma assimetria é registrada especificamente para `targetWeight` (aqui, no CP-A.2). **Resolvido no [CP-A.3](cp-a.3-targetweight-piso-e-gordura-manual.md)**: `calculateMacrosSchema.targetWeight` ganhou o mesmo piso/teto (20-300) de `updateUserSchema.targetWeight`. `weight`/`height` do mesmo schema continuam sem piso/teto — não eram o que este achado rastreava, e não foram tocados por aquela correção.

**Achado 9 (linha 310):**
> 9. ~~(Novo, CP-A.2.3) `dailyFatTarget` editável manualmente — tarefa combinada já decidida, ainda não implementada.~~ Hoje `dailyFatTarget` não existe em `updateUserSchema` (não é manualmente editável) e, por consequência, não tem nenhum aviso suave (ao contrário de proteína, calorias e agora carboidrato). Decisão já tomada (não avaliada aqui): quando isso for implementado, caberá ao usuário a responsabilidade pela consistência entre os 4 campos manuais quando editados juntos (proteína+calorias+carboidrato+gordura não necessariamente somam entre si se cada um for editado de forma independente) — nenhuma validação cruzada entre os 4 está planejada para essa tarefa futura, só o limite rígido (0–600, já existente) e o aviso suave simétrico aos outros 3. **Resolvido no [CP-A.3](cp-a.3-targetweight-piso-e-gordura-manual.md)**: exatamente como previsto aqui — `dailyFatTarget` ganhou o limite rígido (0–600) estendido também pro Zod (`updateUserSchema`) e um aviso suave simétrico (0,5–2g/kg), sem nenhuma validação cruzada entre os 4 campos manuais.

**Achado 2, já resolvido antes (linha 303), para comparação de formato:**
> 2. ~~`dailyCalorieTarget` (500–10.000) e `dailyCarbTarget` (50–800) continuam duplicados entre os schemas Zod e o Mongoose, sem uma fonte única~~ — **resolvido no CP-A.2.2**: os dois agora são unificados via `@blendi/shared` (300–15.000 e 0–1.500 respectivamente), mesmo padrão já usado pra proteína. Ver "Revisão (CP-A.2.2)" acima.

**Comparação de padrão:** o formato é o mesmo nos três — texto original do achado riscado (`~~...~~`), seguido por **"Resolvido no..."**/**"resolvido no..."** em negrito e a explicação do que mudou. Uma diferença pontual: nos achados 1 e 9 (novos), risquei só a frase-título do achado, deixando o parágrafo de contexto subsequente sem risco (porque ainda é informação válida de background, não a alegação resolvida); no achado 2 (antigo), o risco cobre a frase inteira até o travessão, que é também só o título — mesmo critério, aplicado de forma consistente nos dois casos novos.