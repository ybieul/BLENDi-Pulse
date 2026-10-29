# CP-AUDIT Achado 3 — escala errada do `adherenceRate` em `GET /supplement-logs/history`

**Contexto:** achado nº 3 da "Lista priorizada de achados para CP próprio" em [`cp-audit-completo-backend-frontend-documentacao.md`](cp-audit-completo-backend-frontend-documentacao.md) (Tarefa 10/12), que por sua vez confirmou como bug real e ativo uma discrepância que [`cp1.10-history.md`](../phase-1/cp1.10-history.md) já insinuava, sem nunca ter sido corrigida por nenhum checkpoint posterior.

O endpoint `GET /supplement-logs/history` (`apps/api/src/controllers/supplementLog.controller.ts`) calculava, para cada dia do histórico, um `adherenceRate` como a razão entre suplementos marcados e o total do stack, **multiplicada por 100** — devolvendo um número de 0 a 100 (ex.: `50` para "metade marcado"). `averageAdherence`, a média simples desses valores diários, herdava a mesma escala quebrada.

Os 4 lugares do app mobile que consomem esses campos foram todos escritos esperando uma fração de 0 a 1, não uma escala de 0 a 100:

1. `SupplementHeatmap.tsx` — decide a cor do círculo comparando o valor com `0.5`/`1`, e só multiplica por 100 na hora de montar o texto do painel.
2. `HistoryScreen.tsx`, card "Aderência média" — multiplica por 100 na exibição.
3. `HistoryScreen.tsx`, card "Dias perfeitos" — conta como perfeito todo dia com valor `>= 1`.
4. `MeScreen.tsx` (`handleShareWeekly`), card de compartilhamento semanal — multiplica `averageAdherence` por 100 antes de passar para `WeeklyShareCard`. Não estava na lista original de 3 pontos — achado durante a tarefa final em aberto deste fix (ver abaixo).

A prova de que a convenção certa do app é 0-1 está no relatório semanal: `weeklyReportGenerator.service.ts` calcula a mesma métrica de forma independente, sem multiplicar por 100, e `WeeklyReportScreen.tsx` consome esse valor multiplicando por 100 só na exibição — exatamente como os 4 pontos acima sempre esperaram que `GET /supplement-logs/history` se comportasse. Esse endpoint era o único lugar do app fora da convenção.

## TAREFA 1 — Corrigir a escala do cálculo diário de `adherenceRate`

Removida a multiplicação por 100 em `supplementLog.controller.ts:261`, dentro do `map` que constrói o histórico por dia:

```diff
  const adherenceRate = historyStack.length === 0
    ? 0
-   : roundToTwoDecimals((checkedSupplements.length / historyStack.length) * 100);
+   : roundToTwoDecimals(checkedSupplements.length / historyStack.length);
```

Mantidos exatamente como estavam: o arredondamento de duas casas decimais e o caso de `historyStack` vazio retornando `0`.

## TAREFA 2 — Confirmar que `averageAdherence` herda a escala corrigida

Confirmado por leitura, sem alteração de código: `averageAdherence` (linhas 271-275) tira a média simples dos `adherenceRate` diários já corrigidos na Tarefa 1, então passa a ficar na escala 0-1 automaticamente, sem precisar de nenhum ajuste adicional.

## Testes reais

Executados contra o Atlas real (banco `test`), chamando os controllers reais (`updateStack`, `getSupplementHistory`) diretamente, sem HTTP, com contas descartáveis `cpaudit-*@test.blendi.local` removidas ao final de cada rodada.

**Cenário principal:** stack de 2 suplementos, 1 marcado hoje, os outros 3 dias anteriores com os 2 marcados → `adherenceRate` do dia de hoje veio `0.5` (não `50`), os 3 dias completos vieram `1`, `averageAdherence` veio `0.88`. Validado nos 3 pontos de consumo originais com esses valores reais: heatmap caiu no bucket `GOOD_COLOR` (não "parcial" nem "perfeito") e mostrou "50%" no painel; card "Aderência média" mostrou "88%"; card "Dias perfeitos" contou 3, não 4.

**Bateria de edge cases**, 4 contas separadas:

| Cenário | Resultado |
|---|---|
| Stack vazio (`historyStack.length === 0`) | `adherenceRate=0`, `averageAdherence=0`, sem crash |
| Stack de 3 itens, fração não exata (0/3, 1/3, 2/3, 3/3) | `0`, `0.33`, `0.67`, `1` — média `0.5`. "Dias perfeitos"=1, card "50%", heatmap distingue os 4 buckets de cor corretamente |
| Suplemento removido do stack mas reconstruído via snapshot do log | `historyStack` reconstrói os 2 itens certos (ativo + removido), `adherenceRate=1` (não `2.0`/`200`) |
| Log legado sem `snapshotDosage`/`supplementName` (inserido direto na collection, simulando dado pré-FIX-4) | ignorado como antes — não reconstruído, `adherenceRate` considera só o stack ativo real |

Limpeza confirmada em 0 remanescentes após cada rodada, verificada em `users`, `supplement_logs` e nas demais coleções com efeito colateral possível (`XPLog`, `DailyMission`, `AiCache`) — nenhuma delas chegou a ser escrita, já que os cenários inserem logs direto no banco em vez de passar por `checkSupplement`/`awardXP`.

**Typecheck:** `pnpm typecheck` (monorepo) → limpo em `@blendi/shared`, `@blendi/api` e `@blendi/mobile`.
**Suíte automatizada existente da API** (`pnpm --filter @blendi/api test`): 39/39 passando, sem regressão. Não existe teste automatizado dedicado a este controller — não foi criado nenhum, conforme o escopo pedido (validação manual contra dados reais).

## Tarefa final em aberto — outros consumidores de `adherenceRate`/`averageAdherence`

Verificado, por grep em todo `apps/mobile/src`, se existe algum consumidor de `GET /supplement-logs/history` fora dos 3 pontos originalmente listados. Encontrado um 4º: `MeScreen.tsx:1059` (`handleShareWeekly`) também lê `averageAdherence` desse mesmo endpoint para montar o card de compartilhamento semanal, multiplicando por 100 antes de passar para `WeeklyShareCard` — exatamente a mesma convenção 0-1 dos outros 3, e também estava quebrado antes deste fix. Como a correção é inteiramente do lado do dado (o controller), esse 4º ponto já fica corrigido automaticamente, sem precisar de nenhuma edição adicional nele. Reportado aqui conforme pedido; **nenhum outro consumidor além desses 4 foi encontrado.**

## Resumo

1 linha alterada em `apps/api/src/controllers/supplementLog.controller.ts` (remoção da multiplicação por 100). Nenhum outro arquivo tocado — `apps/mobile`, `weeklyReportGenerator.service.ts`, `WeeklyReportScreen.tsx` e `packages/shared` continuam exatamente como estavam, já escritos certos. Testado de ponta a ponta contra o Atlas real, incluindo um cenário principal e 4 cenários de borda (stack vazio, fração não exata, suplemento removido/reconstruído, log legado sem snapshot). Typecheck limpo, suíte automatizada sem regressão, contas de teste limpas e confirmadas em cada rodada.

**Resolve o achado nº 3 da lista priorizada do CP-AUDIT** (`cp-audit-completo-backend-frontend-documentacao.md`) e a nota de implementação que [`cp1.10-history.md`](../phase-1/cp1.10-history.md) já registrava, sem confirmar, desde a Fase 1.
