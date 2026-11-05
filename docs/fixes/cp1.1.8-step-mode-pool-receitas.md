# CP1.1.8 — Step Mode no Blend + pool de 20 receitas por goal na Home

**Contexto:** até este checkpoint, toda receita (gerada por IA, favoritada ou
a receita fixa da Home) tinha só um campo de texto único,
`blendInstruction` — um parágrafo livre, nunca exibido dentro da
`BlendScreen` (que só mostrava o timer circular contínuo). Cada goal
(Muscle/Wellness/Energy/Recovery) tinha exatamente 1 receita fixa
hardcoded na Home, sem rotação.

**Escopo:** adicionar passos estruturados de verdade (`steps`, cada um com
`text`/`pulseCount` opcional) em todos os lugares onde uma receita existe
(schema compartilhado, modelo `Favorite`, prompt da IA), um Step Mode
dentro da própria `BlendScreen` como visão alternativa ao timer (não uma
tela nova), e a expansão do pool fixo da Home de 1 para 20 receitas por
goal (80 no total), com rotação diária determinística 100% client-side.
As 80 receitas (texto, macros, ingredientes, passos) e as 852 chaves de
tradução por idioma vieram prontas e validadas por script, anexadas ao
prompt original — não foram geradas nem alteradas por esta implementação.

**Método:** implementação tarefa por tarefa (1 a 8 do prompt original),
com permissão pedida entre cada uma, typecheck + lint + suíte de testes
validados após cada tarefa de código. As Tarefas 7 e 8 foram implementadas
juntas por dependência estrutural direta — o texto da própria Tarefa 7
("renderize o novo componente StepModeView (ver TAREFA 8)") referencia um
componente que só existe depois da Tarefa 8; sem ele, `BlendScreen.tsx` não
compila.

---

## Tarefa 1 — Schemas compartilhados (`packages/shared`)

Campo `steps` opcional adicionado em dois lugares, aditivo em ambos —
nenhum campo existente mudou de obrigatório para opcional ou teve
comportamento alterado:

- **`PulseAiRecipe`** (interface + `pulseAiRecipeSchema`,
  [pulseAi.ts](../../packages/shared/src/schemas/pulseAi.ts)): novo
  `pulseAiStepSchema` (linha 50: `text` obrigatório/trim/min 1,
  `pulseCount` opcional/inteiro) e `steps: z.array(pulseAiStepSchema).optional()`
  no schema principal (linha 112).
- **`FavoriteItem`** (interface + `createFavoriteSchema`,
  [favorite.ts](../../packages/shared/src/schemas/favorite.ts)): mesmo
  formato, `favoriteStepSchema` (linha 14) e `steps: z.array(favoriteStepSchema).optional()`
  (linha 86).

**Achado médio encontrado no mesmo pentest posterior, corrigido:**
`pulseCount` nos dois schemas acima validava só `.int()`, sem `.min(1)` —
diferente do subdocumento Mongoose da Tarefa 2, que sempre teve
`min: 1`. Um `pulseCount` de `0` ou negativo passava a validação Zod e só
quebrava no `.create()` do Mongoose, virando um `500` não tratado em vez
de um `400` limpo. `.min(1, 'errors.validation.number_range')`
adicionado aos dois para alinhar com o Mongoose. Ver
[cp1.1.8-testes-pentest.md](cp1.1.8-testes-pentest.md) para a prova
completa.

## Tarefa 2 — Modelo Mongoose `Favorite` (`apps/api`)

[Favorite.ts](../../apps/api/src/models/Favorite.ts): subdocumento
`favoriteStepSchema` (linha 56, `{ _id: false }`, mesmo padrão já usado
pelo array `ingredients` deste modelo) com `text` (String, obrigatório,
trim) e `pulseCount` (Number, opcional, `min: 1`). Campo `steps` no
documento principal (linha 155) com `required: false` — favoritos
existentes sem passos continuam válidos sem nenhuma migração.

**Achado crítico encontrado num pentest posterior, corrigido:** o modelo e
o schema Zod persistiam `steps` corretamente, mas
`favorite.controller.ts`'s `serializeFavorite()` — uma whitelist manual
de campos pra resposta da API — nunca foi atualizada para incluir
`steps`, deixando o recurso inteiro não-funcional de ponta a ponta nos
endpoints de Favorites (dado salvo certo, nunca devolvido). Ver
[cp1.1.8-testes-pentest.md](cp1.1.8-testes-pentest.md) para a causa raiz
completa, a prova (leitura direta do Mongo vs. resposta da API) e a
correção.

## Tarefa 3 — Geração de receita por IA (`apps/api`)

[promptBuilder.service.ts](../../apps/api/src/services/promptBuilder.service.ts):
`steps` adicionado à estrutura JSON pedida à IA nos dois modos de resposta
— receita única (linha 88) e array de receitas do pantry (linha 91) — e
duas regras novas de comportamento (linhas 318-319), no mesmo estilo das
regras já existentes:

```
- Generate between 3 and 5 preparation steps in the steps field, written in the same language as the rest of the response.
- Include pulseCount (an integer number of pulses) only in steps that involve adding ice or frozen fruit; omit the pulseCount field from every other step.
```

`blendInstruction` continua pedido exatamente como já era. Os dois
controllers que fazem o parse da resposta da IA
([pulseAi.controller.ts](../../apps/api/src/controllers/pulseAi.controller.ts),
[pantryScanner.controller.ts](../../apps/api/src/controllers/pantryScanner.controller.ts))
já validam com `pulseAiRecipeSchema` — como `steps` já era opcional nesse
schema desde a Tarefa 1, nenhuma mudança adicional foi necessária neles.

## Tarefa 4 — Nova dependência (`apps/mobile`)

`expo-keep-awake@~15.0.8` instalado via `npx expo install` (resolve
automaticamente a versão compatível com o Expo SDK 54 já usado no
projeto) — [package.json:48](../../apps/mobile/package.json).

## Tarefas 5 e 6 — Pool de receitas da Home + traduções (`apps/mobile`)

### Tipos e seleção determinística

[DailyRecipeCard.tsx](../../apps/mobile/src/components/home/DailyRecipeCard.tsx):

- Novo `interface DailyRecipeStep { textKey: TranslationKey; pulseCount?: number }` (linha 23).
- `nameKey` generalizado de uma união fechada de 4 valores para
  `TranslationKey` genérico (linha 29) — ver achado 2 em
  [cp1.1.8-achados-fora-do-escopo.md](cp1.1.8-achados-fora-do-escopo.md)
  sobre o que esse tipo garante de fato em tempo de compilação.
- `DAILY_RECIPES` trocado de `Record<UserGoal, DailyRecipe>` para
  `Record<UserGoal, DailyRecipe[]>`, com o literal completo do arquivo
  anexo copiado byte a byte (verificado por diff automatizado contra o
  arquivo original) — nenhum nome, macro, ingrediente ou chave alterado.
- Seleção do dia, como implementada originalmente nesta tarefa (linhas
  1588-1590 da época):

  ```ts
  const pool = DAILY_RECIPES[goal];
  const daysSinceEpoch = Math.floor(Date.now() / MS_PER_DAY); // MS_PER_DAY = 86400000
  const recipe = pool[daysSinceEpoch % pool.length];
  ```

  100% client-side — sem chamada de rede, sem `AsyncStorage`/MMKV, sem
  estado persistido, exatamente como pedido. Essa fórmula (implementada
  ao pé da letra como o prompt especificou) calculava o "dia" em UTC, não
  no calendário local do aparelho — achado 1, **corrigido depois**, ver
  ["Correção dos achados 1, 2 e 4"](#correção-dos-achados-1-2-e-4-a-pedido-do-gabriel-mesmo-dia)
  ao final deste documento.
- `handleStartBlendPress` (linha 1609) monta `steps` resolvendo cada
  `textKey` via `t()` (mesmo padrão já usado para `nameKey` e as chaves de
  ingrediente), preservando a ordem e repassando `pulseCount` quando
  existir. `blendInstruction`/`tip` continuam usando as duas chaves
  compartilhadas já existentes (`home.dailyRecipeBlendInstruction`/
  `home.dailyRecipeTip`) para as 80 receitas — nenhuma chave nova por
  receita para esses dois campos, por decisão deliberada do prompt (nenhum
  dos dois é exibido no fluxo de blend a partir da Home hoje).

### Traduções

852 chaves novas por idioma, inseridas sem o prefixo `home.` dentro do
objeto `home` já existente em
[en.json](../../apps/mobile/src/locales/en.json) e
[pt-BR.json](../../apps/mobile/src/locales/pt-BR.json) — logo após as
chaves da receita original (`dailyRecipeIngredientRecovery3Amount`),
mantendo o agrupamento temático do arquivo, não necessariamente a última
posição do objeto `home`. Inserção feita por substituição textual precisa
(não round-trip `JSON.parse`/`JSON.stringify` do arquivo inteiro) para
evitar qualquer reformatação colateral — confirmado por `git diff`: as
duas mudanças são 100% aditivas, zero linha alterada fora do bloco
inserido. `en.home`/`pt-BR.home` passaram de 52 para 904 chaves cada.

Cross-check automatizado: as 886 chaves `home.*` referenciadas pelo
código de `DailyRecipeCard.tsx` resolvem todas em `en.json` e `pt-BR.json`
(zero ausentes nos dois idiomas).

## Tarefas 7 e 8 — `BlendScreen` (Timer/Passos) + `StepModeView` (`apps/mobile`)

### `BlendScreen.tsx`

- `useKeepAwake()` chamado incondicionalmente no topo do componente
  (linha 160) — ativo durante toda a montagem da tela, em qualquer
  `viewMode`, desativado automaticamente ao desmontar (comportamento
  padrão do hook).
- Novo estado `viewMode: 'timer' | 'steps'`, inicial `'timer'` (linha
  189).
- `hasSteps`/`showStepMode` (linhas 405-406): o controle de alternância só
  aparece quando `activeRecipe.steps` é um array não vazio; sem isso, o
  comportamento é idêntico ao anterior a este checkpoint (nenhuma
  alternância visível, `TimerCircle`/`TimerControls` sempre mostrados).
- Segmented control Timer/Passos (linhas 419-459), posicionado acima do
  `ActiveRecipeHeader`, estilizado com os mesmos tokens já usados por
  `TimerControls`/`ActiveRecipeHeader` (`colors.overlay.plum[8/12]`,
  `colors.brand.pulse`, `colors.text.inverse/primary`) — sem introduzir
  paleta nova.
- Quando `viewMode === 'steps'` e há passos, `StepModeView` substitui o
  `TimerCircle` **e** o `TimerControls` é ocultado (linha 475,
  `{!showStepMode && <TimerControls .../>}`) — ajustar o timer de bater
  antes de terminar os passos de preparo não faz sentido, e o próprio
  texto da Tarefa 7 implica isso ("a tela deve **passar a mostrar**
  TimerCircle + TimerControls" só depois da conclusão dos passos).
- `handleStepsComplete` (linha 408) só troca `viewMode` de volta para
  `'timer'` — o `StepModeView` nunca inicia timer algum; a duração
  (`prepTimeSeconds`) e toda a lógica de `TimerCircle`/`TimerControls` são
  exatamente as mesmas já existentes, sem nenhuma duplicação.
- `isPulseAiRecipe`/`getIncomingRecipe` (guards de validação do parâmetro
  de rota) não precisaram de nenhuma alteração: são guards que retornam o
  objeto original sem reconstruí-lo, então um `steps` presente no
  `PulseAiRecipe` recebido sobrevive intacto; `setActiveRecipe` no
  `blend.store.ts` também só faz `set({ activeRecipe })`, sem
  transformação.

### `StepModeView.tsx` (novo)

[apps/mobile/src/components/blend/StepModeView.tsx](../../apps/mobile/src/components/blend/StepModeView.tsx) —
`steps: StepModeViewStep[]` (tipo derivado de
`NonNullable<PulseAiRecipe['steps']>[number]`, única fonte de verdade,
sem duplicar a forma do objeto) + `onComplete: () => void`.

- Mostra um passo por vez, texto grande (`fontSizes['2xl']`,
  `fonts.display`, `lineHeights.relaxed`), com contador de posição
  (`t('blend.stepCounter', { current, total })`).
- Navegação: botão "Voltar" (desabilitado no primeiro passo, opacidade
  reduzida) e botão "Avançar" (`AuthButton`, reaproveitado sem
  modificação). Ao avançar a partir do último passo, chama `onComplete()`
  em vez de incrementar o índice — nunca estoura o array.
- Quando o passo atual tem `pulseCount`, mostra um botão de pulso
  separado: cada toque dispara `Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)`
  (mesma intensidade já usada pelos botões de ±5s do `TimerControls`, por
  ser a ação mais parecida — um incremento pequeno e repetido) e
  incrementa um contador local (`t('blend.pulseCounter', { current, target })`).
  Esse contador nunca bloqueia o botão "Avançar" — é só referência visual,
  e é resetado para 0 toda vez que o usuário navega para outro passo
  (voltar ou avançar).
- Não usa nenhum timer interno — `onComplete` é a única forma de a tela
  reagir à conclusão dos passos.

### Traduções novas (`blend.*`)

7 chaves novas adicionadas ao objeto `blend` já existente em
[en.json](../../apps/mobile/src/locales/en.json)/[pt-BR.json](../../apps/mobile/src/locales/pt-BR.json),
logo após `syncFailed` (última chave pré-existente do namespace):
`viewModeTimer`, `viewModeSteps`, `stepCounter`, `stepBack`, `stepNext`,
`pulseButton`, `pulseCounter`. `en.blend` passou de 13 para 20 chaves.

---

## Testes automatizados

Nenhum dos testes existentes (26 antes deste checkpoint: hooks de
autenticação + `analytics.service`) foi alterado. Adicionados:

- **`DailyRecipeCard.test.tsx` (6 testes na versão original desta tarefa):**
  seleção determinística (dia 0 → primeira receita do pool; dia 1 →
  segunda; dia 21 → mesma receita do dia 1, provando o módulo pelo
  tamanho do pool; mesmo dia em horários diferentes → mesma receita) e
  repasse de `steps`/`pulseCount` pro `PulseAiRecipe` (ordem preservada,
  `pulseCount` presente só no passo com gelo/congelado). **Reescrito como
  parte da correção do achado 1** (ver seção ao final) — a versão atual
  tem outra composição de 6 testes, descrita lá.
- **`StepModeView.test.tsx` (8 testes na versão original desta tarefa):**
  contador de posição, avançar, voltar, botão "Voltar" desabilitado no
  primeiro passo, `onComplete` chamado só ao avançar a partir do último
  passo (sem estourar o array), contador de pulso ausente em passos sem
  `pulseCount`, incremento do contador de pulso sem travar o avanço,
  reset do contador ao navegar. **Reescrito como parte da correção do
  achado 3** (ver seção ao final) — mesmos 8 testes, migrados para a API
  de `@testing-library/react-native`.

**Infraestrutura de teste estendida na época, não criada do zero:**
`react-test-renderer.d.ts` — declaração de módulo ambiente já existente
(cobria só `act`/`create`, usada pelos testes de hook deste repo) —
ganhou `root`, `findByProps`, `findAllByType` e `parent`, necessários
para os dois arquivos de teste acima navegarem a árvore renderizada e
simularem toques. Ver achado 3 em
[cp1.1.8-achados-fora-do-escopo.md](cp1.1.8-achados-fora-do-escopo.md) —
**esse módulo foi apagado depois**, na correção do achado 3 (ver seção
ao final), substituído pelo `@types/react-test-renderer` real.

**Resultado final:** 6 suítes, 34 testes, 0 falhas. Typecheck limpo em
`packages/shared`, `apps/api` e `apps/mobile`. Lint limpo nos arquivos
tocados.

---

## Resumo final

- 8 tarefas do prompt original implementadas (Tarefas 7 e 8 em conjunto,
  por dependência estrutural).
- Nenhuma receita, macro, ingrediente ou chave de tradução das 80 receitas
  anexadas foi alterada — só copiadas.
- `steps` é opcional em todos os pontos tocados (schema compartilhado,
  modelo `Favorite`, tipo `DailyRecipe`) — nenhum fluxo existente sem
  passos (receita de IA antiga, favorito antigo) muda de comportamento.
- `TimerCircle`/`TimerControls` não foram modificados — só reaproveitados
  condicionalmente.
- A rotação diária da Home é inteiramente client-side, como pedido — na
  versão original desta tarefa, com a ressalva do achado 1 sobre o fuso
  usado no cálculo; **corrigida depois** (ver seção abaixo).
- 4 achados fora do escopo (1 Alta, 1 Média, 2 Baixa) documentados em
  [cp1.1.8-achados-fora-do-escopo.md](cp1.1.8-achados-fora-do-escopo.md) —
  **os 4 foram corrigidos**, a pedido do Gabriel, em duas rodadas (ver
  seção abaixo): Achados 1/2/4 de imediato; Achado 3 reconsiderado e
  corrigido numa conversa posterior, depois de uma análise de
  dependências confirmando ausência de conflitos.

**Não testado:** nenhuma verificação visual no Expo Go/dispositivo real —
validação restrita a typecheck, lint, testes automatizados e leitura de
código ponta a ponta (Home → navegação → `BlendScreen` → `StepModeView`).
Isso continua valendo depois da correção dos achados abaixo.

---

## Correção dos 4 achados, em duas rodadas (a pedido do Gabriel)

**Primeira rodada (Achados 1, 2 e 4), mesmo dia:** plano de ação próprio,
aprovado antes da implementação, com verificação empírica de cada passo
(algoritmos testados isoladamente num script Node e num `tsconfig`
isolado antes de alterar o projeto real).

**Segunda rodada (Achado 3), conversa posterior:** inicialmente deixado de
lado por decisão do próprio Gabriel ("não vale a pena agora"); ele
reconsiderou e pediu a instalação mesmo assim, mas só depois de uma
análise explícita de conflito de dependências — feita antes de instalar
qualquer coisa, não depois.

Detalhes completos dos dois, com todos os bugs extras encontrados no
caminho, em
[cp1.1.8-achados-fora-do-escopo.md](cp1.1.8-achados-fora-do-escopo.md) —
esta seção é o resumo.

### Achado 1 — rotação pelo fuso do aparelho

[DailyRecipeCard.tsx](../../apps/mobile/src/components/home/DailyRecipeCard.tsx) —
nova função exportada `getLocalDayIndex(date, timezone?)`, extraindo
ano/mês/dia via `Intl.DateTimeFormat('en-CA', { timeZone, ... })
.formatToParts(...)` (mesma técnica de `useDateFormat.ts`/
`timezone.utils.ts`), com `timezone` opcional e, em produção, **nunca**
passado — o default lê o fuso real do aparelho, de novo em toda chamada.
`pool[daysSinceEpoch % pool.length]` trocado por módulo matemático
(`((daysSinceEpoch % pool.length) + pool.length) % pool.length`).

Dois bugs reais adicionais, só encontrados ao escrever os testes (fora do
plano original):
1. `new Date()` sem argumentos ignora `jest.spyOn(Date, 'now')` neste
   stack (o motor lê o relógio por um caminho interno que não passa pela
   propriedade `Date.now` sobrescrita) — corrigido chamando
   `Date.now()` explicitamente (`new Date(Date.now())`).
2. O operador `%` do JS podia devolver resto negativo perto da época Unix
   (`-1 % 20 === -1`), indexando o array fora dos limites — eliminado
   pelo módulo matemático acima.

`DailyRecipeCard.test.tsx` reescrito: `process.env.TZ` mutado em runtime
**não é confiável** neste setup de Jest (confirmado empiricamente — o
fuso resolvido continuava sendo o real da máquina mesmo depois da troca),
então os testes de fuso chamam `getLocalDayIndex` direto com um fuso
explícito (`UTC`/`America/Sao_Paulo`/`Asia/Tokyo`), sem renderizar nada;
os testes que renderizam o componente usam o fuso real da máquina (igual
produção) e calculam o índice esperado chamando a mesma função
exportada. Um teste percorre as 20 receitas do pool em 20 dias locais
consecutivos, confirmando cobertura total sem repetição nem pulo, e
`steps`/`pulseCount` fiéis em cada uma. `DAILY_RECIPES` e
`getLocalDayIndex` exportados só para viabilizar isso — sem mudança de
comportamento visível.

### Achado 2 — `TranslationKey` real

[i18n.ts](../../apps/mobile/src/locales/i18n.ts) — `TranslationKey`
passou a ser derivado estruturalmente de `en.json` (tipo `DotPath`
recursivo sobre o JSON), não mais extraído de `Parameters<typeof t>`
(que resolvia pra `string` disfarçado, por pegar a última assinatura da
sobrecarga do `t`). Os 14 arquivos trocaram a definição local pelo
import deste tipo único.

Dois achados extras, encontrados só ao rodar `tsc --noEmit` depois da
troca (não previstos no plano original):
1. Chaves de pluralização do i18next (`_one`/`_other`, ex.
   `me.badges.requirements.blendJourneyBronze`) não existem no JSON sem
   sufixo — o tipo original as rejeitava. Corrigido com
   `StripPluralSuffix<K>`, cobrindo as 8 famílias pluralizadas que
   existem no app inteiro.
2. `BadgeStage.requirementKey`/`Badge.titleKey`/`Badge.descriptionKey`
   em [badges.utils.ts](../../apps/mobile/src/utils/badges.utils.ts)
   eram `string` solto (fora da lista original de 14 arquivos) — também
   apertados para `TranslationKey`, depois de confirmar as 22 chaves
   literais contra `en.json` (nenhum typo).

### Achado 4 — comentário corrigido

[DailyRecipeCard.tsx:47](../../apps/mobile/src/components/home/DailyRecipeCard.tsx) —
reescrito para deixar explícito que a fórmula de gordura só descreve a
receita original (índice 0) de cada goal, não as 19 seguintes.

### Verificação final (primeira rodada)

`tsc --noEmit` limpo em `packages/shared`, `apps/api` e `apps/mobile`;
`eslint` limpo em todos os arquivos tocados (16 no total, entre os 14 da
lista original + `badges.utils.ts` + o `BadgeCard.tsx` que ficou com um
cast redundante depois do aperto); suíte completa de `apps/mobile`
sem regressão — 6 suítes, 34 testes, 0 falhas (mesma contagem total de
antes, composição diferente em `DailyRecipeCard.test.tsx`).

### Achado 3 — `@testing-library/react-native` instalado, depois de confirmar ausência de conflitos

**Análise de dependências antes de instalar**, verificada contra o
registry via `npm view` (não só lendo documentação): a versão **mais
recente** (`14.x`) depende de um pacote novo, `test-renderer` (não
`react-test-renderer` — um substituto moderno do mesmo autor, já que o
React trata `react-test-renderer` como legado), exige Node `^22.13.0 ||
>=24` e usa utilitários internos de Jest 30, enquanto este projeto roda
Jest `~29.7.0` — migrar pra essa versão trocaria a base de **todos** os
testes existentes (inclusive `useAppleAuth.test.tsx`/
`useGoogleAuth.test.tsx`, que usam `react-test-renderer` direto), não só
os 2 que motivaram o pedido. Escolhida a **`13.3.3`** no lugar — última
versão compatível com o `react-test-renderer` clássico já usado aqui,
com todas as `peerDependencies` satisfeitas pelas versões já instaladas
(`react-test-renderer`/`react` ambos `19.1.0`, exatamente iguais, como o
próprio README da lib exige). `pnpm add` confirmou **nenhum peer
dependency novo** além dos que já existiam no projeto antes desta
instalação.

**Achado extra, descoberto só ao tentar remover o módulo ambiente manual**
(`react-test-renderer.d.ts`): os tipos públicos da lib `13.3.3` importam
de `'react-test-renderer'` símbolos que o stub manual não cobria
(`ReactTestRenderer`, `TestRendererOptions`, `ReactTestRendererJSON`).
Em vez de seguir estendendo esse stub à mão — exatamente a fragilidade
que este achado já apontava —, verificado que `@types/react-test-renderer`
**existe de verdade** no registry, com uma versão `19.1.0` batendo
exatamente com `react`/`react-test-renderer` já usados aqui (a suposição
original anotada no próprio stub, de que não existia, nunca tinha sido
checada contra o registry). Instalado, e o módulo ambiente manual **apagado
por completo** — `tsc --noEmit` ficou limpo sem ele, nos 4 arquivos de
teste que dependiam dele.

Os 2 arquivos migrados de `act`/`create`/navegação manual de árvore
(`.root.findByProps`, subir `.parent`) para `render`/`screen`/`getByRole`/
`getByText`/`fireEvent.press`. **Achado extra real, encontrado ao migrar
`StepModeView.test.tsx`:** as 2 asserções do contador de pulso falharam
de início — o `onPress` desse botão específico é `async` (aguarda
`Haptics.impactAsync` antes de `setPulseTaps`), e `fireEvent.press`
síncrono não espera essa Promise resolver antes da asserção seguinte
rodar (diferente dos botões "Avançar"/"Voltar", síncronos, que já
funcionaram de primeira). Corrigido usando `fireEventAsync.press`
(`await`ado) só nos 2 toques de pulso.

### Verificação final (segunda rodada)

`tsc --noEmit` e `eslint` limpos em `apps/mobile`/`apps/api`/
`packages/shared`; suíte completa sem regressão — 6 suítes, 34 testes,
0 falhas (mesma contagem total de antes da migração).
