# Diagnóstico — Cálculo de Macros (Mifflin-St Jeor)

**Data:** 2026-10-13
**Escopo:** Item 8 da lista de pendências — suspeita de bug na fórmula de BMR/TDEE/macros, incluindo confirmação sobre a existência (ou não) de campo de sexo/gênero no perfil.
**Método:** leitura integral de todo o código relevante (backend, mobile, schema compartilhado) + grep exaustivo por `gender`/`sex`/`age`/`bmr`/`tdee`/`mifflin` em `apps/` e `packages/` (excluindo `node_modules`/`dist`) + **teste numérico ativo**: script Node.js, mantido fora do repositório (`/private/tmp/.../scratchpad/macro_diag_test.js`), que reproduz **literalmente** as fórmulas reais linha a linha e as executa com casos reais para confirmar os desvios com números, sem depender de interpretação. Nenhum arquivo do repositório foi alterado. Nenhum build, `eas`, commit ou deploy foi executado. Nenhum dado foi escrito no MongoDB — o endpoint `calculateMacros` é stateless (não lê nem escreve no banco), então o teste numérico isolado já reproduz 100% do comportamento real sem necessidade de subir o servidor ou criar usuários de teste.

---

## Sumário executivo

| Severidade | Achado |
|---|---|
| 🟠 Alta | **Idade sempre fixa em 30 anos** para todo usuário, em toda a base — não existe campo de idade em nenhuma camada do app (Tarefa 1/2) |
| 🟠 Alta | **Constante de sexo nunca varia** — a fórmula usa incondicionalmente o `+5` (constante "masculina") do Mifflin-St Jeor para 100% dos usuários; não existe campo de sexo/gênero em nenhuma camada (Tarefa 2) |
| 🟠 Alta | **Metas de macro nunca são recalculadas após o onboarding.** Trocar `goal` (ou, hipoteticamente, peso/altura) na tela de perfil grava o campo bruto via `PATCH /users/me` sem nunca chamar `/users/calculate-macros` de novo — a meta fica permanentemente desatualizada (Tarefa 8) |
| 🟠 Alta | **Terceira fonte de verdade desconectada**: `OnboardingMacrosScreen.tsx` exibe uma tabela de ranges (`GOAL_CONFIG`) totalmente hardcoded e divorciada da fórmula real do backend — pode mostrar ao usuário uma recomendação que contradiz o valor calculado na tela anterior (Tarefa 6/9) |
| 🟡 Média | Nível de atividade "extremamente ativo" (×1.9) não existe em nenhuma camada — nem enum do Zod, nem Mongoose, nem UI (Tarefa 4) |
| 🟡 Média | `goal` (Muscle/Wellness/Energy/Recovery) não é um seletor de objetivo de peso — é a "proposta do blend". O ajuste calórico por objetivo (Tarefa 5) é inferido dessa escolha sem que o usuário saiba que está escolhendo um déficit/superávit calórico |
| 🟡 Média | Nenhuma validação cruza `dailyProteinTarget`/`dailyCalorieTarget` editados manualmente com o peso/altura reais do usuário — os limites são fixos e globais (10–400 g, 500–10.000 kcal), não por pessoa (Tarefa 6/9) |
| 🟢 Baixa | `unitSystem: 'imperial'` no backend é código morto hoje — o mobile sempre pré-converte para métrico e envia `unitSystem: 'metric'` fixo (Tarefa 3/9) |
| 🟢 Baixa | Constante `POUNDS_PER_KILOGRAM = 2.205` duplicada em dois arquivos (mobile e backend) — mesma origem, duas cópias que podem divergir no futuro (Tarefa 3/9) |
| 🟢 Baixa | `dailyFatTarget` existe no schema compartilhado mas nunca é persistido, exibido ou usado — a % de gordura só existe como valor intermediário descartado (Tarefa 6/9) |
| ✅ Confirmado | A ordem de arredondamento (BMR cru → multiplica por atividade → só então arredonda o TDEE) está correta — não há o bug clássico de arredondar o BMR antes (Tarefa 4) |
| ✅ Confirmado | `macroValidation.utils.ts` é uma lógica **totalmente separada** da meta diária de macros — é o guardrail de consistência interna do Pulse AI (protein×4+carbs×4+fat×9 vs. calorias declaradas pela IA), nunca usado para calcular ou validar a meta do usuário (Tarefa 6) |
| ✅ Confirmado | A meta persistida (`user.dailyProteinTarget`/`dailyCalorieTarget`/`dailyCarbTarget`) é lida de uma **única fonte** em todos os pontos de exibição mapeados — não há divergência de valores entre telas, só desatualização no tempo (Tarefa 7) |

**Contexto importante:** o achado de idade/sexo fixos **já está documentado no próprio repositório**, de forma textual e precisa, em `docs/INVENTARIO-FUNCIONALIDADES.md:102`: *"A fórmula de cálculo (backend, `user.controller.ts`) usa Mifflin-St Jeor com idade fixa em 30 anos e a constante 'masculina' (+5) para todo mundo, porque o app não coleta sexo nem idade em nenhum lugar."* — e em `docs/phase-1/cp1.3-onboarding.md:26-30`, que reproduz a fórmula com `idade = 30` como parte da documentação oficial do CP1.3. Ou seja: isto não é um bug escondido — é uma lacuna de produto já conhecida e documentada, mas aparentemente nunca endereçada.

---

## Tarefa 1 — Localização e reprodução do cálculo real de BMR/TDEE

**Arquivo:** `apps/api/src/controllers/user.controller.ts`
**Função:** `calculateMacros` (linhas 874–921), constantes nas linhas 18–45.

Trecho literal (linhas 21–45, 886–904):

```ts
const ASSUMED_AGE = 30;

const ACTIVITY_MULTIPLIERS = {
  sedentary: 1.2,
  lightlyActive: 1.375,
  moderatelyActive: 1.55,
  veryActive: 1.725,
} as const;

const CALORIE_ADJUSTMENTS = {
  Muscle: 300,
  Wellness: 0,
  Energy: -150,
  Recovery: 0,
} as const;

const PROTEIN_MULTIPLIERS = {
  Muscle: 2.0,
  Wellness: 1.6,
  Energy: 1.8,
  Recovery: 2.2,
} as const;

const POUNDS_PER_KILOGRAM = 2.205;
const CENTIMETERS_PER_INCH = 2.54;

// ...

const { weight, height, activityLevel, goal, unitSystem } = parsed.data;

const metricWeight = unitSystem === 'imperial' ? weight / POUNDS_PER_KILOGRAM : weight;
const metricHeight = unitSystem === 'imperial' ? height * CENTIMETERS_PER_INCH : height;

const heightInMeters = metricHeight / 100;
const imc = roundToOneDecimal(metricWeight / (heightInMeters * heightInMeters));

const imcClassification =
  imc < 18.5 ? 'underweight' : imc < 25 ? 'normal' : imc < 30 ? 'overweight' : 'obese';

const basalMetabolism = (10 * metricWeight) + (6.25 * metricHeight) - (5 * ASSUMED_AGE) + 5;
const tdee = Math.round(basalMetabolism * ACTIVITY_MULTIPLIERS[activityLevel]);
const dailyCalorieTarget = Math.round(tdee + CALORIE_ADJUSTMENTS[goal]);
const dailyProteinTarget = Math.round(metricWeight * PROTEIN_MULTIPLIERS[goal]);
const dailyFatCalories = dailyCalorieTarget * 0.3;
const dailyCarbTarget = Math.round(
  (dailyCalorieTarget - (dailyProteinTarget * 4) - dailyFatCalories) / 4
);
```

### Comparação, passo a passo, com a fórmula de referência

Referência: `BMR_homem = 10×peso + 6,25×altura − 5×idade + 5` / `BMR_mulher = 10×peso + 6,25×altura − 5×idade − 161`.

Código real: `basalMetabolism = (10 × metricWeight) + (6.25 × metricHeight) − (5 × 30) + 5`.

- **Estrutura algébrica:** idêntica à referência masculina (mesmos coeficientes `10`, `6.25`, `5`, mesmo sinal). Não há erro de sinal nem de coeficiente.
- **Divergência 1 — idade:** a referência usa a idade real do usuário; o código usa `ASSUMED_AGE = 30` **sempre**, para qualquer pessoa, de 18 a 80 anos.
- **Divergência 2 — sexo:** a referência bifurca em `+5` (homem) ou `−161` (mulher); o código **nunca bifurca** — o literal `+ 5` está escrito direto na linha 897, sem condicional, sem média das duas constantes, sem fallback dinâmico. É a constante masculina aplicada a 100% da base de usuários.

### Teste numérico (executado, não estimado)

Caso de teste: peso = 70 kg, altura = 175 cm, atividade = `moderatelyActive` (×1,55), objetivo = `Wellness`.

```
Output real do app: basalMetabolism=1648.75  tdee=2556  dailyCalorieTarget=2556  dailyProteinTarget=112  dailyCarbTarget=335
```

Comparando o BMR que o app **sempre** retorna (1648,75 kcal) contra o BMR de referência com idade e sexo reais, para a mesma pessoa (70 kg / 175 cm):

| Idade real | Sexo | BMR referência | BMR do app (sempre) | Diferença |
|---|---|---|---|---|
| 20 | homem | 1698,75 | 1648,75 | −50,00 |
| 20 | mulher | 1532,75 | 1648,75 | **+116,00** |
| 30 | homem | 1648,75 | 1648,75 | 0,00 (único caso exato) |
| 30 | mulher | 1482,75 | 1648,75 | **+166,00** |
| 45 | homem | 1573,75 | 1648,75 | +75,00 |
| 45 | mulher | 1407,75 | 1648,75 | **+241,00** |
| 60 | homem | 1498,75 | 1648,75 | +150,00 |
| 60 | mulher | 1332,75 | 1648,75 | **+316,00** |

Após multiplicar pelo fator de atividade (1,55 neste exemplo), cada kcal de diferença no BMR vira ~1,55 kcal de diferença no TDEE/meta calórica final. Uma mulher de 45 anos nesse exemplo teria sua meta calórica superestimada em **~373 kcal/dia** (241 × 1,55) só por causa da constante de sexo errada — sem contar o efeito adicional da idade.

**Conclusão da Tarefa 1:** a fórmula é estruturalmente correta (mesmos coeficientes do Mifflin-St Jeor), mas **nunca usa a idade real nem o sexo real de ninguém** — ela computa, para toda a base de usuários, o BMR de "um homem de exatamente 30 anos" com o peso/altura informados.

---

## Tarefa 2 — Campo de sexo/gênero do usuário

Busca exaustiva (`grep -rniE "\bgender\b|\bsex\b|\bbiologicalSex\b"` em `apps/` e `packages/`, excluindo `node_modules`/`dist`): **zero ocorrências em todo o repositório.**

Confirmado, camada por camada:

| Camada | Arquivo | Resultado |
|---|---|---|
| Schema compartilhado (Zod) | `packages/shared/src/schemas/user.ts` (`updateUserSchema`, `calculateMacrosSchema`, linhas 54–183) | Sem campo de sexo/gênero |
| Modelo MongoDB (Mongoose) | `apps/api/src/models/User.ts` (`IUser`, linhas 44–139; schema, linhas 301–548) | Sem campo de sexo/gênero — e também **sem campo de idade** |
| Onboarding | `apps/mobile/src/screens/onboarding/OnboardingBodyScreen.tsx` (coleta peso/altura/atividade/objetivo) | Nenhum input de sexo/gênero nem de idade em nenhuma das 4 telas de onboarding |
| Tela de perfil | `apps/mobile/src/components/me/EditSettingSheet.tsx` (`EditSettingType`, linhas 36–45: `model | goal | protein | carbs | calories | hydration | unitSystem | language | theme`) | Sem opção de editar sexo/gênero (nem peso/altura — ver Tarefa 8) |
| Payload tela→backend | `calculateMacros` body: `{ weight, height, activityLevel, goal, unitSystem }` (`OnboardingBodyScreen.tsx:148-154`) | Sexo/idade nunca trafegam, porque nunca existiram para coletar |

**A cadeia quebra na origem — não existe lugar nenhum onde o dado é perdido "no meio do caminho".** O campo nunca foi criado em nenhuma camada, então não há "perda" de dado entre telas: é ausência de ponta a ponta.

**O que a fórmula usa no lugar:** não é um valor dinâmico, não é uma média das duas constantes, não é uma configuração — é o literal numérico `+ 5` escrito diretamente na expressão da linha 897 do controller (reproduzida na Tarefa 1). Equivale a tratar every usuário como homem, permanentemente, no cálculo de BMR.

---

## Tarefa 3 — Unidades (métrico vs. imperial)

O app aceita **os dois sistemas na interface**, mas sempre converte para métrico **no cliente** antes de enviar ao backend.

### Lógica de conversão (reproduzida)

Backend, `apps/api/src/controllers/user.controller.ts:44-45,888-889`:
```ts
const POUNDS_PER_KILOGRAM = 2.205;
const CENTIMETERS_PER_INCH = 2.54;
// ...
const metricWeight = unitSystem === 'imperial' ? weight / POUNDS_PER_KILOGRAM : weight;
const metricHeight = unitSystem === 'imperial' ? height * CENTIMETERS_PER_INCH : height;
```

Mobile, `apps/mobile/src/hooks/useUnits.ts:9-10,101-119` (constantes duplicadas, mesmos valores):
```ts
const POUNDS_PER_KILOGRAM = 2.205;
const CENTIMETERS_PER_INCH = 2.54;
// ...
const toStorageWeight = (value) => unitSystem === 'imperial' ? value / POUNDS_PER_KILOGRAM : value;
const toStorageHeight = (value) => unitSystem === 'imperial'
  ? roundToOneDecimal(value * CENTIMETERS_PER_INCH)
  : value;
```

E, criticamente, `apps/mobile/src/screens/onboarding/OnboardingBodyScreen.tsx:146-154`:
```ts
const response = await api.post<{ success: true; data: CalculateMacrosResponse }>(
  '/users/calculate-macros',
  {
    weight: storageWeight,   // já convertido para kg pelo useUnits
    height: storageHeight,   // já convertido para cm pelo useUnits
    activityLevel,
    goal,
    unitSystem: 'metric',    // <- SEMPRE 'metric', hardcoded, independente da escolha real do usuário
  },
);
```

### Teste numérico (executado) — usuário real de 170 lbs / 69 in (5'9")

```
Mobile converte ANTES de enviar: 170 lbs -> 77.0975 kg | 69 in -> 175.3 cm
Backend se recebesse (170lbs, 69in, unitSystem=imperial) diretamente: imc=25.1, basalMetabolism=1721.3500566893422, tdee=2066, dailyCalorieTarget=2066, dailyProteinTarget=123, dailyCarbTarget=239
Backend recebendo o valor já pré-convertido pelo mobile (fluxo real hoje): imc=25.1, basalMetabolism=1721.6000566893422, tdee=2066, dailyCalorieTarget=2066, dailyProteinTarget=123, dailyCarbTarget=239
IMC igual nos dois casos? true
```

**Resultado:** matematicamente correto nos dois sentidos — o IMC e todas as metas finais batem entre o caminho "imperial direto no backend" e o caminho real "mobile pré-converte e envia metric". A única diferença é um resíduo de 0,25 kcal no BMR intermediário (1721,35 vs. 1721,60), causado por `toStorageHeight` arredondar a altura para 1 casa decimal (`175.3`) antes de enviar, enquanto o branch `imperial` do backend usaria a altura crua sem esse arredondamento (`175.26`). Irrelevante no resultado final (ambos arredondam para `tdee=2066`), mas documentado porque é uma fonte real, ainda que inofensiva, de arredondamento em dois lugares.

**Achado relevante (fora do núcleo da Tarefa 3, mas decorrente dela):** como o mobile **sempre** envia `unitSystem: 'metric'` (linha 153 acima), o branch `unitSystem === 'imperial'` do backend (linhas 888-889) é **hoje código morto** do ponto de vista do único client real (o onboarding mobile). Ele só seria exercitado por um consumidor direto da API que enviasse `unitSystem: 'imperial'` de fato — o que não acontece em nenhum lugar do app atual. Isso não é um bug ativo, mas é um risco de manutenção: se algum dia o campo `unitSystem` do payload passar a refletir a escolha real do usuário (`effectiveUnitSystem` em vez do literal `'metric'`), o valor já estaria em métrico (dupla conversão), e o resultado ficaria errado.

---

## Tarefa 4 — Multiplicador de nível de atividade

Tabela real (`apps/api/src/controllers/user.controller.ts:23-28`):

| Nível | Multiplicador no código | Multiplicador de referência |
|---|---|---|
| `sedentary` | 1,2 | 1,2 ✅ |
| `lightlyActive` | 1,375 | 1,375 ✅ |
| `moderatelyActive` | 1,55 | 1,55 ✅ |
| `veryActive` | 1,725 | 1,725 ✅ |
| *(inexistente)* | — | **1,9 (extremamente ativo) — ausente** |

Os 4 valores presentes batem exatamente com a referência, dígito por dígito. **O nível "extremamente ativo" (×1,9) não existe em nenhuma camada**: não está no enum do Zod (`calculateMacrosSchema.activityLevel`, `packages/shared/src/schemas/user.ts:169-172`), não está no objeto `ACTIVITY_MULTIPLIERS` do backend, e não está na lista de chips da UI (`ACTIVITY_LEVELS`, `apps/mobile/src/screens/onboarding/OnboardingBodyScreen.tsx:69-74`, que tem exatamente 4 entradas). As três camadas estão consistentes entre si — o nível simplesmente nunca foi implementado em lugar nenhum, não é uma perda de sincronização entre camadas.

### Ordem de arredondamento (verificado — sem bug aqui)

```ts
const basalMetabolism = (10 * metricWeight) + (6.25 * metricHeight) - (5 * ASSUMED_AGE) + 5; // NÃO arredondado
const tdee = Math.round(basalMetabolism * ACTIVITY_MULTIPLIERS[activityLevel]); // arredonda só depois de multiplicar
```

`basalMetabolism` é mantido como float completo (ex.: `1648.75`, `1721.3500566893422`) e só o `tdee` — já multiplicado pelo fator de atividade — é arredondado. Essa é a ordem **correta**; o padrão de bug nº 3 do contexto (arredondar o BMR antes de multiplicar) **não ocorre** neste código.

---

## Tarefa 5 — Ajuste calórico por objetivo

Achado estrutural importante antes dos números: **o app não tem um seletor de "perder / manter / ganhar peso".** O campo `goal` (`Muscle | Wellness | Energy | Recovery`) é escolhido na tela `OnboardingGoalScreen` como a **proposta do blend/suplemento**, não como objetivo de peso corporal. Confirmado pelos textos reais de i18n (`apps/mobile/src/locales/en.json:67-74`):

```json
"goalMuscle": "Muscle",       "goalMuscleDesc": "High-protein blends to fuel strength and hypertrophy",
"goalWellness": "Wellness",   "goalWellnessDesc": "Balanced nutrition to feel energized every day",
"goalEnergy": "Energy",       "goalEnergyDesc": "Performance-focused blends for active lifestyles",
"goalRecovery": "Recovery",   "goalRecoveryDesc": "Anti-inflammatory ingredients to help your body reset"
```

O usuário nunca vê, em texto algum, que escolher "Energy" implica um déficit calórico de -150 kcal/dia, ou que "Muscle" implica um superávit de +300 kcal/dia. Essa é uma inferência de produto embutida silenciosamente no código.

### Valores reais e sinal (`apps/api/src/controllers/user.controller.ts:30-35`)

| `goal` | Ajuste | Sinal correto? |
|---|---|---|
| `Muscle` | `+300 kcal` | ✅ superávit, coerente com "hipertrofia" |
| `Wellness` | `0 kcal` | ✅ manutenção, coerente com "nutrição balanceada" |
| `Recovery` | `0 kcal` | ✅ manutenção, coerente com "reset anti-inflamatório" |
| `Energy` | `−150 kcal` | ⚠️ déficit — semanticamente não óbvio: a descrição de produto é "blends focados em performance para estilos de vida ativos", o que normalmente se associaria a manutenção ou superávit leve, não a déficit. Não há comentário no código nem nos docs do projeto (`docs/phase-1/cp1.3-onboarding.md:45-54`) explicando essa escolha — ela é reproduzida, mas não justificada, em nenhum lugar. |

Nenhum erro de sinal técnico (soma/subtração aplicada corretamente em todos os 4 casos — `Math.round(tdee + CALORIE_ADJUSTMENTS[goal])`); o ponto de atenção é semântico/de produto, não aritmético.

---

## Tarefa 6 — Split de macros e comparação com `macroValidation.utils.ts`

### Como os gramas são derivados (reproduzido, `user.controller.ts:900-904`)

```ts
const dailyProteinTarget = Math.round(metricWeight * PROTEIN_MULTIPLIERS[goal]); // grama-por-kg
const dailyFatCalories = dailyCalorieTarget * 0.3;                                // % fixa de calorias
const dailyCarbTarget = Math.round(
  (dailyCalorieTarget - (dailyProteinTarget * 4) - dailyFatCalories) / 4          // resto, em gramas
);
```

Resposta direta à pergunta da tarefa: **é uma mistura das duas lógicas, não uma ou outra** — exatamente o padrão de bug nº 6 do contexto. Proteína é grama-por-kg-de-peso (varia de 1,6 a 2,2 g/kg conforme `goal`); gordura é 30% fixo das calorias totais (nunca varia por objetivo); carboidrato é o resto da divisão, em gramas. As três fontes convivem na mesma função sem conflito interno — mas **o valor de gordura nunca sai dali**: `dailyFatCalories` é usado apenas para calcular `dailyCarbTarget` e descartado. Não existe `dailyFatTarget` em gramas em lugar nenhum da resposta (`calculateMacrosResponseSchema`, `packages/shared/src/schemas/user.ts:249-257`, não tem o campo), nem no modelo Mongoose (`IUser`, `apps/api/src/models/User.ts:80-83`, só tem `dailyProteinTarget`/`dailyCalorieTarget`/`dailyCarbTarget`). O schema `macroTargetSchema` (linhas 187-225 do mesmo arquivo) **define** um `dailyFatTarget` opcional, mas nada no código o popula ou lê — é campo morto.

### Comparação com `macroValidation.utils.ts` — **são duas lógicas completamente diferentes, sem relação**

`apps/api/src/utils/macroValidation.utils.ts:34-53` (`validateMacroConsistency`) não calcula meta nenhuma — ele recebe uma receita **já gerada pelo Pulse AI** e verifica se as calorias que a IA declarou batem com `protein×4 + carbs×4 + fat×9` dentro de 15% de tolerância (`MACRO_CALORIE_TOLERANCE_PERCENT = 15`, linha 12). É usado exclusivamente em `pulseAi.controller.ts` como guardrail de alucinação numérica da IA em uma receita individual — nunca é chamado por `calculateMacros`, nunca valida a meta diária do usuário, e os dois arquivos não compartilham nenhuma constante, tipo ou import entre si. **Conclusão: fontes totalmente separadas, e não há risco de divergência entre elas porque elas respondem perguntas diferentes** (meta diária do usuário vs. consistência interna de uma receita pontual) — mas isso também significa que a meta diária em si (o objeto deste diagnóstico) **não tem nenhum guardrail automático de sanidade**, nem o de `macroValidation.utils.ts` nem nenhum outro.

---

## Tarefa 7 — Mapa completo de onde a meta é calculada, guardada e exibida

A fórmula de BMR/TDEE/macros existe em **exatamente um lugar no repositório inteiro** (confirmado por grep de `basalMetabolism`, `ACTIVITY_MULTIPLIER`, `CALORIE_ADJUSTMENT`, `PROTEIN_MULTIPLIER`, `ASSUMED_AGE` em todo `apps/` e `packages/`): `apps/api/src/controllers/user.controller.ts`. Todos os demais pontos do app **leem o valor já persistido** em `user.dailyProteinTarget` / `user.dailyCalorieTarget` / `user.dailyCarbTarget` — nenhum deles recalcula de forma independente:

| Ponto | Arquivo:linha | Fonte |
|---|---|---|
| Cálculo | `apps/api/src/controllers/user.controller.ts:874-921` | Única fonte de cálculo (`calculateMacros`) |
| Persistência | `apps/api/src/models/User.ts:80-83,388-406` | Campos `dailyProteinTarget`/`dailyCalorieTarget`/`dailyCarbTarget` no documento `User` |
| Leitura para o perfil | `apps/api/src/controllers/user.controller.ts:250-252` (`getMe`) | Lê direto do documento |
| HomeScreen (anéis de meta) | `apps/mobile/src/screens/HomeScreen.tsx:536-540` → `GoalRingsSection` (`apps/mobile/src/components/home/GoalRingsSection.tsx:40-64,194-212`) | Props vindas de `profile?.dailyProteinTarget` etc., sem cálculo próprio |
| MeScreen (tela de perfil) | `apps/mobile/src/screens/MeScreen.tsx:645-668` (`getCurrentEditValue`) | Lê `profile?.dailyProteinTarget ?? authUser?.dailyProteinTarget ?? <fallback de UI>` |
| Store Zustand + MMKV | `apps/mobile/src/store/auth.store.ts:79-81,126-128` | Espelha o mesmo valor vindo da API, persistido via MMKV para uso offline |
| Pulse AI (prompt da IA) | `apps/api/src/services/promptBuilder.service.ts:241-243,291-293` | Recebe os targets como parâmetro, injeta no prompt — não recalcula |
| Weekly Report | `apps/api/src/services/weeklyReportGenerator.service.ts:99-100,409-410` | Usa `user.dailyProteinTarget`/`dailyCalorieTarget` para calcular % de dias com meta batida — não recalcula a meta em si |

**Resposta direta:** existe **uma única fonte de verdade centralizada e corretamente respeitada por todos os consumidores** (o documento `User` no MongoDB). **O risco real não é divergência entre telas — é desatualização no tempo da própria fonte única**, detalhado na Tarefa 8.

**Exceção/contraponto que é, em si, um achado:** `apps/mobile/src/screens/onboarding/OnboardingMacrosScreen.tsx:53-68` define `GOAL_CONFIG`, uma tabela de ranges de proteína/calorias **hardcoded e totalmente independente da fórmula real**, usada apenas para o texto de recomendação (`onboarding.macroRecommendation`, linha 295-303) exibido ao lado dos campos editáveis. Ela não participa do cálculo nem é persistida, mas **pode contradizer visualmente o valor real calculado na tela anterior**: por exemplo, para `goal: 'Muscle'`, essa tabela anuncia uma faixa de "2000–2600 kcal, sugestão 2300", mas a fórmula real para uma pessoa pequena/sedentária pode calcular um valor bem abaixo dessa faixa (ex.: ~1800 kcal) — o usuário veria um número pré-preenchido fora do range que o próprio texto da tela diz ser o recomendado. Isso é, na prática, uma terceira fonte de "verdade" sobre a meta de macro, mesmo que só cosmética.

---

## Tarefa 8 — Gatilho de recálculo

**Fluxo real, confirmado por grep + leitura completa dos handlers envolvidos:**

- `POST /users/calculate-macros` (`apps/api/src/routes/users.ts`, comentário na própria rota: *"Calcula IMC, TDEE e metas diárias **para o onboarding**"*) é chamado em **exatamente um lugar do app inteiro**: `apps/mobile/src/screens/onboarding/OnboardingBodyScreen.tsx:146-155`, dentro do fluxo de onboarding.
- Documentado oficialmente como arquitetura pretendida em `docs/phase-1/cp1.11-profile.md:83-92`: ao confirmar uma edição em `MeScreen`, o fluxo é `PATCH /users/me` → invalidar query do perfil → atualizar store local → (se `goal`/`model`) `DELETE /pulse-ai/cache`. **Em nenhum passo desse fluxo documentado há recálculo de macros.**
- Código real confirma exatamente isso: `apps/mobile/src/screens/MeScreen.tsx:672-772` (`handleConfirmEdit`) monta o `body` do PATCH com o campo bruto escolhido (`{ goal: nextValue }`, `{ dailyProteinTarget: Number(nextValue) }`, etc.) e envia direto — não há chamada a `/users/calculate-macros` em lugar nenhum dessa função.
- No backend, `updateMe` (`apps/api/src/controllers/user.controller.ts:785-872`) apenas grava os campos que vierem no body (`$set` implícito via objeto `updates`) — não recalcula nada, mesmo que `weight`, `height` ou `goal` estejam entre os campos atualizados.
- **Weight/height não são sequer editáveis na UI pós-onboarding**: `EditSettingType` (`apps/mobile/src/components/me/EditSettingSheet.tsx:36-45`) não inclui `'weight'` nem `'height'` — essas duas propriedades só são escritas uma vez, durante o onboarding (`setBodyData`, `apps/mobile/src/store/onboarding.store.ts`), e nunca mais.

### Teste numérico (executado) — trocar `goal` sem recalcular

Usuário termina onboarding com peso 70 kg / altura 175 cm / atividade `moderatelyActive` / `goal: Energy`:

```
dailyCalorieTarget=2406  dailyProteinTarget=126
```

Usuário troca `goal` para `Muscle` na tela de perfil (`PATCH /users/me { goal: "Muscle" }`, sem recálculo):

```
Valor que permanece gravado no banco: dailyCalorieTarget=2406  dailyProteinTarget=126  (inalterado)
Valor correto, se a app recalculasse para Muscle: dailyCalorieTarget=2856  dailyProteinTarget=140
Divergência real: 450 kcal/dia e 14 g de proteína/dia
```

**Resposta direta:** a meta **não é recalculada automaticamente em nenhum lugar mapeado na Tarefa 7** quando o usuário muda `goal` — fica desatualizada indefinidamente até que o próprio usuário edite manualmente `protein`/`calories`/`carbs` pela tela de perfil (o que exige que ele saiba, por conta própria, que precisa fazer isso e qual seria o novo valor correto). Peso e altura têm o mesmo problema em teoria, mas na prática **nem chegam a ser editáveis** depois do onboarding — o que significa que, uma vez feito o onboarding, não existe NENHUM caminho de UI para o app perceber que o peso do usuário mudou.

---

## Tarefa 9 — Achados fora do escopo

1. **Nenhum guardrail liga `dailyProteinTarget`/`dailyCalorieTarget` ao corpo real do usuário quando editados manualmente.** `updateUserSchema` (`packages/shared/src/schemas/user.ts:66-91`) só limita por faixa global fixa (proteína 10–400 g, calorias 500–10.000 kcal) — um usuário de 50 kg pode gravar `dailyProteinTarget: 400` (8 g/kg, muito acima de qualquer recomendação clínica) sem que nada no backend rejeite. Isso é consistente com o achado já registrado em memória deste projeto sobre o guardrail de proteína do Pulse AI ceder sob pedido adversarial — aqui o problema é anterior e mais simples: nem existe tentativa de guardrail na origem do dado.
2. **`unitSystem: 'imperial'` no backend é código morto hoje** (ver Tarefa 3) — nenhum client real o exercita, o que é um risco de teste/manutenção (um bug introduzido nesse branch não seria pego por nenhum fluxo real hoje).
3. **Constante `POUNDS_PER_KILOGRAM = 2.205` duplicada** em `apps/api/src/controllers/user.controller.ts:44` e `apps/mobile/src/hooks/useUnits.ts:9` — mesmo valor hoje, mas sem fonte compartilhada (não está em `packages/shared`), então uma correção de precisão futura (ex.: para `2.20462`) feita em um lado e esquecida no outro geraria divergência silenciosa de IMC/peso entre mobile e backend.
4. **`dailyFatTarget` é campo morto** — definido em `macroTargetSchema` (`packages/shared/src/schemas/user.ts:216-224`) mas nunca populado, nunca persistido no `User` Mongoose, nunca lido por nenhuma tela. O split de gordura (30% fixo) só existe como valor intermediário descartado dentro de `calculateMacros`.
5. **A ausência de idade/sexo já está documentada no projeto** (`docs/INVENTARIO-FUNCIONALIDADES.md:102`, `docs/phase-1/cp1.3-onboarding.md:26-30`) mas aparentemente nunca endereçada desde que o CP1.3 original foi implementado — não é uma regressão recente.

---

## Testes realizados (resumo de método)

Todos os números deste relatório vêm de um script Node.js que **reproduz literalmente** (cópia linha a linha, não reimplementação) as constantes e fórmulas de `apps/api/src/controllers/user.controller.ts` e `apps/mobile/src/hooks/useUnits.ts`, executado isoladamente em `/private/tmp/.../scratchpad/macro_diag_test.js` — fora do repositório, sem tocar em nenhum arquivo do projeto, sem subir o servidor e sem escrever no MongoDB (desnecessário, já que `calculateMacros` não lê nem escreve no banco — é puramente aritmético a partir do payload). Quatro baterias de teste foram executadas:

1. Reprodução da fórmula real com `weight=70, height=175, moderatelyActive, Wellness` + comparação contra BMR de referência para 8 combinações de idade/sexo reais (20/30/45/60 × homem/mulher).
2. Conversão de unidade com um caso de uso real (170 lbs / 69 in), comparando o caminho "imperial direto no backend" com o caminho real hoje (mobile pré-converte e envia metric) — confirmando igualdade de resultado final.
3. Verificação textual dos limites do schema (`updateUserSchema`) contra um cenário de edição manual sem guardrail.
4. Simulação de troca de `goal` pós-onboarding sem recálculo, quantificando a divergência resultante (450 kcal / 14 g).

Nenhuma alteração de código, nenhum commit, nenhum build e nenhum comando `eas` foram executados durante este diagnóstico.
