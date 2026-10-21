# CP-A.2.1 — Verificação da sobreposição aviso/previsão e otimização da leitura em `updateMe`

Correção pontual de dois pontos levantados na revisão do relatório do [CP-A.2](cp-a.2-macros-complementares.md) (já implementado e testado — esta tarefa não reabre nenhuma das 7 tarefas de código nem os testes já feitos).

> Os dois testes que esta revisão deixou como "corolário lógico, ainda não testado" (combinação de `imc`+`weightTargetEta` com campo-gatilho, e a combinação tripla gatilho+`targetWeight`+manual) foram executados no **CP-A.2.2** — ver a seção "Testes pendentes do CP-A.2.1" em [cp-a.2-macros-complementares.md](cp-a.2-macros-complementares.md).

## Ponto 1 — `warnings` e `weightTargetEta` podem aparecer juntos (confirmado com teste real)

**Suspeita:** a documentação do CP-A.2 (Tarefa 6) afirmava que `warnings` e `imc`/`weightTargetEta` "nunca aparecem na mesma resposta (gatilhos mutuamente exclusivos)" — mas a Tarefa 4 descreve `weightTargetEta` como calculado de forma incondicional, independente do caminho de edição manual.

**Teste real executado** (`apps/api/src/controllers/user.controller.ts`, servidor de dev rodando, conta de teste descartável criada via Mongoose e removida ao final, confirmado com 0 remanescentes):

1. Conta criada com `weight: 75`, `weightGoal: 'lose'`.
2. `PATCH /users/me { targetWeight: 65 }` (coerente com `weightGoal: 'lose'`, 65 < 75) → `weightTargetEta: { etaDays: 154 }` retornado normalmente.
3. `PATCH /users/me { dailyProteinTarget: 50 }` (50/75 = 0,667g/kg, abaixo de 0,8 — **sem nenhum campo-gatilho** no body) → corpo de resposta literal:

```json
{
  "status": 200,
  "success": true,
  "data": {
    "user": {
      "...": "...",
      "dailyProteinTarget": 50,
      "weightTargetEta": { "etaDays": 154 },
      "warnings": [
        {
          "field": "dailyProteinTarget",
          "code": "macros/protein-below-range",
          "message": "warnings.manualMacroEdit.proteinBelowRange"
        }
      ]
    }
  }
}
```

**Resultado:** `warnings` e `weightTargetEta` apareceram **juntos**, confirmando a suspeita. `imc` corretamente **não** apareceu nessa resposta — essa parte da afirmação original estava certa.

**Causa raiz** (`apps/api/src/controllers/user.controller.ts`):
- `weightTargetEta` (linha ~900, antes da correção) é calculado a partir de `mergedWeight`/`mergedTargetWeight`/`mergedWeightGoal`, sem checar `shouldRecalculateMacroTargets` nem `isManualMacroEdit` em nenhum momento — ele só depende de `targetWeight` existir (no body ou já salvo).
- `warnings` (via `isManualMacroEdit`) exige explicitamente `!shouldRecalculateMacroTargets`.
- `imc` (via `recalculatedMacros`) exige explicitamente `shouldRecalculateMacroTargets`.

Como `imc` e `warnings` dependem do mesmo gatilho em direções opostas, são de fato mutuamente exclusivos entre si. `weightTargetEta` não depende desse gatilho em nenhuma direção — por isso pode coexistir com qualquer um dos dois.

**Correção:** a frase errada em `cp-a.2-macros-complementares.md` (Tarefa 6) foi substituída por uma explicação precisa da relação real entre os três campos, com referência a este teste.

## Ponto 2 — Projeção de campos na leitura de `currentUser`

**Auditoria completa** (grep por `currentUser` dentro de `updateMe`, `apps/api/src/controllers/user.controller.ts`): a variável é lida em exatamente 8 campos, todos nas linhas 833-840 (os merges) e 953 (comparação do histórico de peso) — nenhum outro ponto da função acessa `currentUser` por qualquer outro campo:

`weight`, `height`, `birthDate`, `biologicalSex`, `activityLevel`, `weightGoal`, `goal`, `targetWeight`.

**Mudança** (`apps/api/src/controllers/user.controller.ts`, linha ~822): adicionado `.select({ weight: 1, height: 1, birthDate: 1, biologicalSex: 1, activityLevel: 1, weightGoal: 1, goal: 1, targetWeight: 1 })` à query. `_id` continua incluído (comportamento padrão do Mongoose com projeção de inclusão — não foi excluído). A leitura continua **incondicional** (roda em todo `PATCH /users/me`, como decidido no CP-A.2) — só o tamanho de cada leitura foi reduzido.

**Regressão** (servidor rodando, conta de teste descartável, removida ao final, 0 remanescentes confirmado): os mesmos 3 cenários já testados no CP-A.2, reproduzidos com os mesmos dados de entrada, confirmam números **idênticos** aos já reportados antes da projeção:

| Cenário | Antes da projeção (CP-A.2) | Depois da projeção (CP-A.2.1) |
|---|---|---|
| Campo-gatilho — baseline (`weightGoal` no-op) | protein=112, cal=2509, carb=327, imc=22.9/normal | idêntico |
| Campo-gatilho — `weight: 75` | protein=120, cal=2587, carb=333 | idêntico |
| Edição manual — `dailyProteinTarget: 50` | 200 + `warnings` com `macros/protein-below-range` + salvo=50 | idêntico |
| PATCH trivial — `preferredLanguage` | sem recálculo, sem `warnings`/`weightTargetEta`/`imc` | idêntico |

4/4 passaram, nenhuma divergência.

## Resumo

Ambos os pontos confirmados com teste real (não assumidos). Documentação do CP-A.2 corrigida. `.select()` adicionado em `updateMe` com a lista exata e auditada de campos, sem alterar o comportamento incondicional da leitura. `tsc --noEmit` limpo. Nenhum build, `eas`, commit ou deploy executado.
