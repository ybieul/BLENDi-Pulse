# CP1.1.8 (Step Mode + pool de receitas da Home) — achados fora do escopo

**Contexto:** checkpoint de Step Mode estruturado dentro da `BlendScreen` +
expansão do pool fixo da Home de 1 para 20 receitas por goal, documentado
em
[cp1.1.8-step-mode-pool-receitas.md](cp1.1.8-step-mode-pool-receitas.md).
Este documento cobria originalmente a Tarefa Final do prompt original
(achados encontrados no caminho, nenhum corrigido ainda) — **os 4 achados
foram corrigidos depois**, em duas rodadas, as duas a pedido explícito do
Gabriel: Achados 1, 2 e 4 com um plano de ação próprio (aprovado antes da
implementação); Achado 3, inicialmente descartado por decisão dele mesmo
("não vale a pena agora"), reconsiderado e corrigido numa conversa
posterior. Verificação empírica em todos os passos das duas rodadas. Ver
seção "Correção" dentro de cada achado e o "Status" final.

---

## Achado 1 (Alta) — rotação diária da Home usa fronteira de dia em UTC, não no calendário local do aparelho — **CORRIGIDO**

[DailyRecipeCard.tsx:1588-1590](../../apps/mobile/src/components/home/DailyRecipeCard.tsx):

```ts
const pool = DAILY_RECIPES[goal];
const daysSinceEpoch = Math.floor(Date.now() / MS_PER_DAY); // MS_PER_DAY = 86400000
const recipe = pool[daysSinceEpoch % pool.length];
```

Essa é exatamente a fórmula que o prompt original pediu, por extenso:
"calcular quantos dias se passaram desde a época Unix dividindo
`Date.now()` (milissegundos) por 86400000 ... e usar o resto da divisão
desse número pelo tamanho do pool como índice". Foi implementada ao pé da
letra — **não é um desvio de implementação**, é uma propriedade da própria
fórmula que o texto do prompt não menciona.

`Date.now()` é sempre um instante absoluto em UTC, independentemente do
fuso do aparelho. Dividir esse valor por `86400000` calcula em qual **dia
UTC** o aparelho está, não em qual dia do **calendário local** do usuário
ele está — e os critérios de aceite do próprio prompt pedem explicitamente
"a receita exibida na Home muda de acordo com o **dia do calendário do
aparelho**" e "mesmo dia = mesma receita". Para um usuário em
`America/Sao_Paulo` (UTC-3), a virada de receita acontece às 21h locais
(ou 22h em período de horário de verão em outros fusos americanos que o
observam), não à meia-noite local — ou seja, duas pessoas no mesmo
dia-calendário local podem ver receitas diferentes se abrirem o app em
lados opostos dessa fronteira UTC, e a mesma pessoa pode ver a receita
"de ontem" ainda depois da meia-noite local.

Esta não é uma classe de bug nova neste projeto — é a mesma categoria já
corrigida no backend para outra feature:
[conversation.controller.ts:53-55](../../apps/api/src/controllers/conversation.controller.ts)
(`getDaysAgo`) usa `toLocalDate(date, timezone)` de
[timezone.utils.ts](../../apps/api/src/utils/timezone.utils.ts), convertendo
explicitamente para o fuso **armazenado no perfil do usuário** antes de
comparar dias — exatamente para evitar esse mesmo tipo de virada de dia
incorreta (comentário no próprio arquivo: "a virada de dia em UTC pode não
coincidir [com o fuso do usuário]").

A diferença que torna a correção aqui não-trivial de copiar e colar: o
mecanismo do backend depende de uma string de timezone IANA conhecida
(`user.timezone`, persistida no perfil) e de uma chamada ao servidor — o
prompt desta Home exige **inteiramente client-side, sem rede, sem
`AsyncStorage`, sem estado persistido** (requisito explícito, cumprido).
Uma correção aqui precisaria usar o fuso **local do próprio dispositivo**
(disponível via `Intl.DateTimeFormat().resolvedOptions().timeZone` ou os
getters locais do `Date`, como `getFullYear()`/`getMonth()`/`getDate()`,
em vez da divisão do epoch UTC), sem nenhuma chamada de rede — não é o
mesmo código reaproveitável do backend, mas o mesmo princípio.

### Correção

[DailyRecipeCard.tsx](../../apps/mobile/src/components/home/DailyRecipeCard.tsx) —
nova função `getLocalDayIndex(date, timezone?)`, exportada, usando a
mesma técnica de extração de ano/mês/dia via
`Intl.DateTimeFormat('en-CA', { timeZone, ... }).formatToParts(...)` já
usada em `useDateFormat.ts`/`timezone.utils.ts` — nunca aritmética manual
de offset (quebraria em fusos de offset não-inteiro como `Asia/Kolkata`,
UTC+5:30, e em transições de horário de verão). O parâmetro `timezone` é
opcional e, em produção, **nunca é passado** — o default
(`Intl.DateTimeFormat().resolvedOptions().timeZone`) sempre lê o fuso real
do aparelho, lido de novo em toda chamada. `pool[daysSinceEpoch %
pool.length]` trocado por módulo matemático
(`((daysSinceEpoch % pool.length) + pool.length) % pool.length`).

**Dois bugs reais adicionais encontrados ao escrever os testes (nenhum
estava no plano original, os dois confirmados por reprodução isolada
antes de corrigir):**

1. **`new Date()` sem argumentos ignora `jest.spyOn(Date, 'now')`:** o
   motor usado pelo `jest-expo` lê o relógio por um caminho interno que
   não passa pela propriedade `Date.now` quando ela é sobrescrita — só
   `Date.now()` chamado explicitamente respeita o mock. A chamada real no
   componente foi escrita como `getLocalDayIndex(new Date(Date.now()))`,
   nunca `new Date()` sozinho, por esse motivo (comentado no código).
2. **`pool[daysSinceEpoch % pool.length]` indexava fora dos limites perto
   da época Unix:** o operador `%` do JS pode devolver um resto negativo
   (`-1 % 20 === -1`, não `19`), e `pool[-1]` é `undefined` — travando o
   render (`Cannot read properties of undefined (reading 'nameKey')`).
   Irrelevante com datas reais (sempre muito depois de 1970), mas corrigido
   de qualquer forma com módulo matemático (ver acima), eliminando o risco
   por completo em vez de só evitar os valores de teste que o expunham.

**Testes novos** em
[DailyRecipeCard.test.tsx](../../apps/mobile/src/components/home/DailyRecipeCard.test.tsx) —
`process.env.TZ` mutado em runtime **não é confiável** neste setup de
Jest (confirmado empiricamente: `Intl.DateTimeFormat().resolvedOptions().timeZone`
continuou devolvendo o fuso real da máquina mesmo depois da troca), então
os testes de fuso chamam `getLocalDayIndex` diretamente com um fuso
explícito (`'UTC'`, `'America/Sao_Paulo'`, `'Asia/Tokyo'`), sem renderizar
nada. Os testes que renderizam o componente usam o fuso real da máquina
(igual produção) e calculam o índice esperado chamando a mesma função
exportada, em vez de hardcodar qual receita "deveria" ser — evita
acoplar os testes ao fuso de quem os executa. Um teste percorre as 20
receitas do pool em 20 dias locais consecutivos (prova de cobertura total
sem repetição/pulo) e confere `steps`/`pulseCount` fielmente em cada uma.
`DAILY_RECIPES` e `getLocalDayIndex` exportados de `DailyRecipeCard.tsx`
só para viabilizar esses testes — nenhuma mudança de comportamento
visível.

`tsc --noEmit`, lint e suíte completa (`apps/mobile`) confirmados limpos
depois da correção.

## Achado 2 (Média) — `TranslationKey` não garante chaves de tradução válidas em tempo de compilação, em 14 arquivos do app (pré-existente, não introduzido por este checkpoint) — **CORRIGIDO**

O padrão `type TranslationKey = Parameters<ReturnType<typeof useAppTranslation>['t']>[0];`
já existia antes deste checkpoint, copiado em 14 arquivos:

```
apps/mobile/src/utils/birthDate.utils.ts
apps/mobile/src/screens/MeScreen.tsx
apps/mobile/src/screens/auth/ForgotPasswordScreen.tsx
apps/mobile/src/screens/auth/LoginScreen.tsx
apps/mobile/src/screens/auth/RegisterScreen.tsx
apps/mobile/src/screens/auth/VerifyOtpScreen.tsx
apps/mobile/src/screens/auth/ResetPasswordScreen.tsx
apps/mobile/src/screens/onboarding/OnboardingMacrosScreen.tsx
apps/mobile/src/screens/CompleteProfileScreen.tsx
apps/mobile/src/components/home/DailyRecipeCard.tsx
apps/mobile/src/components/missions/MissionCard.tsx
apps/mobile/src/components/me/BadgeDetailSheet.tsx
apps/mobile/src/components/me/BadgeCard.tsx
apps/mobile/src/components/me/EditSettingSheet.tsx
```

A intenção declarada em
[useAppTranslation.ts:5-7](../../apps/mobile/src/hooks/useAppTranslation.ts)
é que o `t` com tipo completo garanta "autocomplete TypeScript para todas
as chaves" e "erro de compilação para chaves inexistentes" — e isso é
verdade para chamadas diretas `t('algo')`, porque nesse caso o TypeScript
resolve a assinatura certa da função sobrecarregada do `react-i18next`.

Mas `Parameters<T>` sobre um **tipo de função sobrecarregada** (como o `t`
do `react-i18next`, que tem várias assinaturas) resolve para os parâmetros
da **última** assinatura da sobrecarga — que, no `react-i18next`, é a
assinatura de fallback mais permissiva, efetivamente `string`. Ou seja,
`TranslationKey` não é a união real de chaves válidas, é só `string`
disfarçado.

**Confirmado por teste direto:** troquei temporariamente um `nameKey` real
de `DailyRecipeCard.tsx` por `'home.totallyBogusKeyThatDoesNotExist123'` e
roldei `tsc --noEmit` — compilou sem nenhum erro. Revertido imediatamente
depois do teste (não ficou no código final).

**Impacto:** qualquer campo tipado como `TranslationKey` (em vez de
chamado diretamente via `t(...)`) — como `nameKey`/`textKey` em
`DailyRecipeCard.tsx` (ambos usados por este checkpoint, `nameKey` com a
generalização da Tarefa 5), `mission.titleKey` em `MissionCard.tsx`,
`badge.titleKey` em `BadgeCard.tsx`, o `key` desserializado em
`birthDate.utils.ts`, etc. — pode receber uma chave com erro de digitação
ou uma chave que nunca foi criada em `en.json`/`pt-BR.json`, e o
compilador não avisa. Em runtime, `react-i18next` devolve a própria chave
como texto visível na tela (comportamento padrão do `t()` para chave
ausente), que é o sintoma visível — mas só em runtime, nunca em CI/typecheck.

A Tarefa 5 deste checkpoint generalizou `nameKey` de uma união fechada de
4 valores literais para esse mesmo `TranslationKey` — ou seja, a rede de
segurança que a generalização parecia preservar ("ainda é
`TranslationKey`, continua tipado") é mais fraca do que aparenta.

### Correção

`TranslationKey` deixou de ser extraído de `Parameters<typeof t>` e passou
a ser derivado estruturalmente do próprio `en.json`, em
[i18n.ts](../../apps/mobile/src/locales/i18n.ts) (mesmo arquivo que já
exporta `SupportedLocale`/`SUPPORTED_LOCALES`):

```ts
type DotPath<T, Prefix extends string = ''> = {
  [K in Extract<keyof T, string>]: T[K] extends string
    ? `${Prefix}${K}`
    : DotPath<T[K], `${Prefix}${K}.`>;
}[Extract<keyof T, string>];

export type TranslationKey = DotPath<typeof en> | StripPluralSuffix<DotPath<typeof en>>;
```

Verificado num `tsconfig` isolado contra o `en.json` real (1517
chaves-folha, profundidade 4) antes de aplicar no projeto: compila sem
"instantiation excessively deep", aceita chaves reais e **rejeita** uma
chave inventada com um erro de tipo genuíno. Todos os 14 arquivos trocaram
a linha local `type TranslationKey = Parameters<...>` por
`import type { TranslationKey } from '<caminho relativo>/locales/i18n'`.

**Achado extra, encontrado só ao rodar `tsc --noEmit` depois da troca nos
14 arquivos (não previsto no plano original — o plano já avisava que o
teste real decidiria, não a análise prévia):** 4 erros novos em
[BadgeDetailSheet.tsx](../../apps/mobile/src/components/me/BadgeDetailSheet.tsx),
todos de chamadas a chaves de **pluralização** do i18next
(`compatibilityJSON: 'v4'`, já configurado em `i18n.ts`) — ex.:
`t('me.badges.requirements.blendJourneyBronze', { count })`. Essas chaves
nunca existem no JSON sem sufixo: só como
`blendJourneyBronze_one`/`blendJourneyBronze_other` (resolvido em runtime
pelo próprio i18next a partir do `count`), e meu `DotPath` original só
gerava os caminhos literais do JSON — rejeitando a forma correta e
idiomática sem sufixo que o código já usava há tempos. Corrigido
estendendo o tipo:

```ts
type PluralSuffix = '_zero' | '_one' | '_two' | '_few' | '_many' | '_other';
type StripPluralSuffix<K extends string> = K extends `${infer Base}${PluralSuffix}` ? Base : never;
```

Confirmado por `grep`: só 8 famílias de chave pluralizada existem no app
inteiro (6 em `me.badges.requirements.*`, mais `shoppingList.pendingItem`
e `track.dailyTargetSummary`) — todas cobertas pela extensão acima, testada
isoladamente antes de aplicar no projeto.

**Segundo achado extra, mesma origem:** os 4 erros vinham de
`BadgeStage.requirementKey`/`Badge.titleKey`/`Badge.descriptionKey` em
[badges.utils.ts](../../apps/mobile/src/utils/badges.utils.ts), tipados
como `string` solto (nunca `TranslationKey`) — ou seja, as 22 chaves
literais de `BADGE_DEFINITIONS` nunca tinham sido verificadas pelo
compilador contra `en.json`, nem antes nem depois desta correção, até eu
decidir apertar esses 3 campos para `TranslationKey` também (fora da lista
original de 14 arquivos, mas a mesma classe de problema). Cross-check
manual das 22 chaves contra `en.json` confirmou todas reais — nenhum typo
encontrado, mas agora qualquer typo futuro nessas definições de badge será
pego em tempo de compilação, o que não acontecia antes.

`tsc --noEmit` limpo em `apps/mobile`/`apps/api`/`packages/shared`, lint
limpo (1 cast `as TranslationKey` que ficou redundante em
`BadgeCard.tsx` depois do aperto de `badges.utils.ts` — removido), suíte
completa sem regressão.

## Achado 3 (Baixa) — não havia infraestrutura de teste de componente neste projeto antes deste checkpoint — **CORRIGIDO**

Antes deste checkpoint, todo teste de `apps/mobile` (`useAppleAuth.test.tsx`,
`useGoogleAuth.test.tsx`, `auth.service.test.ts`, `analytics.service.test.ts`)
testava hooks ou services via um componente "Harness" interno, nunca
renderizava UI real nem percorria a árvore renderizada. Não há
`@testing-library/react-native` instalado. O único módulo ambiente
existente para tipar `react-test-renderer` (`apps/mobile/src/types/react-test-renderer.d.ts`,
**apagado na correção deste achado**, ver abaixo) cobria apenas `act()` e
`create()` — o suficiente para esse padrão de Harness, que nunca precisava
de `.root`.

Os critérios de aceite deste checkpoint pediram testes para a seleção
determinística da receita do dia e para a navegação do `StepModeView` —
os dois exigem renderizar o componente de verdade e simular toques.
Estendi o módulo ambiente existente (`root`, `findByProps`,
`findAllByType`, `parent`) em vez de instalar uma biblioteca nova, o que
funcionou, mas resultou em testes que navegam a árvore manualmente (ex.:
subir `.parent` até achar o ancestral com `onPress`) em vez de usar
`getByText`/`fireEvent`. Funcional, porém mais verboso e mais frágil a
mudanças de estrutura interna de componentes como `AuthButton`
(`TouchableOpacity` envolvido por `Animated.createAnimatedComponent`, que
desloca `.parent` em um nível) do que a API de uma biblioteca de teste
dedicada teria sido.

Não é um bug — é uma lacuna de ferramental que só ficou visível porque
este foi o primeiro checkpoint a precisar testar um componente renderizado
de verdade. Vale considerar `@testing-library/react-native` numa CP futura
se mais testes desse tipo forem planejados.

### Correção

Inicialmente descartado por decisão do Gabriel ("não vale a pena agora"),
reconsiderado numa conversa posterior — ele pediu pra instalar mesmo
assim, mas só depois de uma análise de conflito de dependências, não às
cegas.

**Análise de dependências antes de instalar (a pedido explícito):**
verificado via `npm view` contra o registry, não só lendo a documentação:

- A versão **mais recente** (`14.x`) depende de um pacote novo chamado
  `test-renderer` (não `react-test-renderer`) — um substituto moderno
  criado pelo mesmo autor da lib, descrito como alternativa ao
  `react-test-renderer`, que o próprio React já trata como legado. Exige
  Node `^22.13.0 || >=24` e traz utilitários internos na linha do Jest 30
  (`pretty-format@^30`, `jest-matcher-utils@^30`), enquanto este projeto
  usa Jest `~29.7.0`. Migrar pra essa versão trocaria a base de **todos**
  os testes existentes (`useAppleAuth.test.tsx`, `useGoogleAuth.test.tsx`
  incluídos, que usam `react-test-renderer` direto), não só os 2 que
  motivaram o pedido — escopo muito maior do que o combinado.
- A versão **`13.3.3`** (penúltima major, última compatível com o
  `react-test-renderer` clássico) tem `peerDependencies`
  (`react-test-renderer: '>=18.2.0'`, `react: '>=18.2.0'`,
  `react-native: '>=0.71'`, `jest: '>=29.0.0'` opcional) todas satisfeitas
  pelas versões já usadas neste projeto (`react-test-renderer`/`react`
  ambos `19.1.0` — o próprio README da lib pede exatamente essa
  igualdade exata entre os dois). `engines.node: '>=18'`, compatível com
  os `>=20.0.0` já exigidos pelo monorepo. Escolhida no lugar da latest.
- `pnpm add` confirmou: **nenhum peer dependency novo** além dos que já
  existiam no projeto antes desta instalação (os avisos de
  `expo-router`/`react-helmet-async`/`@radix-ui` esperando React
  16-18, e os de `apps/api`, são todos pré-existentes, não relacionados).

**Achado extra, descoberto só ao tentar remover o módulo ambiente
manual:** os tipos públicos que a lib `13.3.3` embute (`render.d.ts`,
`act.d.ts`, `fire-event.d.ts`) importam de `'react-test-renderer'` os
símbolos `ReactTestInstance`, `ReactTestRenderer`, `TestRendererOptions`,
`ReactTestRendererJSON` e o valor `act` — mais do que o módulo ambiente
manual (`react-test-renderer.d.ts`) cobria (só `props`/`parent`/
`findByProps`/`findAllByType`/`TestRenderer.root`/`unmount`). Em vez de
seguir estendendo esse stub à mão pra cobrir cada símbolo que a lib nova
precisa — exatamente a fragilidade que esse próprio achado já apontava —
verifiquei o registry e `@types/react-test-renderer` **existe de
verdade** e tem uma versão `19.1.0` batendo exatamente com `react`/
`react-test-renderer` já usados aqui. A suposição original (anotada no
próprio `react-test-renderer.d.ts`: "não tem @types/react-test-renderer
resolvível nesta versão") estava errada — não tinha sido checada contra o
registry, só contra o `node_modules` local sem o pacote instalado.
Instalado `@types/react-test-renderer@19.1.0` e **apagado** o módulo
ambiente manual por completo — `tsc --noEmit` ficou limpo sem ele, nos 4
arquivos de teste que dependiam dele (os 2 novos + `useAppleAuth.test.tsx`/
`useGoogleAuth.test.tsx`, que usam `act`/`create` direto do
`react-test-renderer`).

**Migração dos 2 arquivos de teste** —
[DailyRecipeCard.test.tsx](../../apps/mobile/src/components/home/DailyRecipeCard.test.tsx)
e
[StepModeView.test.tsx](../../apps/mobile/src/components/blend/StepModeView.test.tsx)
— de `act`/`create`/`.root.findByProps(...)`/subir `.parent` manualmente
para `render`/`screen`/`getByRole`/`getByText`/`fireEvent.press` da
biblioteca nova. `renderAndPressStart` (`DailyRecipeCard.test.tsx`) ficou
síncrona, sem precisar de `act()` explícito nem `async`/`await` pro
`render`+`fireEvent`, que já encapsulam isso internamente; cada chamada
desmonta o próprio render (`unmount()`) pra manter os 20 renders do teste
de loop isolados entre si.

**Achado extra real, não previsto, encontrado ao migrar
`StepModeView.test.tsx`:** as 2 asserções sobre o contador de pulso
falharam depois da migração — `fireEvent.press` no botão de pulso não
incrementava o contador. Causa raiz: o `onPress` desse botão específico é
`async` (`await Haptics.impactAsync(...)` antes de `setPulseTaps`), e
`fireEvent.press` (síncrono) não espera essa Promise resolver antes da
asserção seguinte rodar — diferente dos botões "Avançar"/"Voltar", cujos
handlers são síncronos e por isso já funcionaram de primeira com
`fireEvent.press` comum. Corrigido usando `fireEventAsync.press`
(exportado pela própria lib, `await`ado) só nos 2 toques de pulso — os
demais toques (navegação entre passos, síncronos) continuam com
`fireEvent.press` normal.

**Verificação final:** `tsc --noEmit` limpo em `apps/mobile`/`apps/api`/
`packages/shared`; `eslint` limpo em todo `apps/mobile/src`; suíte
completa sem regressão — 6 suítes, 34 testes, 0 falhas (mesma contagem
total de antes da migração).

## Achado 4 (Baixa) — comentário desatualizado sobre a derivação da gordura em `DailyRecipeCard.tsx` — **CORRIGIDO**

[DailyRecipeCard.tsx:47](../../apps/mobile/src/components/home/DailyRecipeCard.tsx):

```ts
// fat = (calories − protein×4 − carbs×4) / 9, arredondado.
```

Esse comentário documentava como a **única** receita original de cada
goal (preservada por este checkpoint, agora o primeiro item de cada pool)
foi calculada antes de existir qualquer outra receita na Home. Preservado
intacto porque não fazia parte do escopo de nenhuma tarefa alterá-lo, mas
ele não descreve mais as 76 receitas novas — o próprio prompt original
explica que a matemática delas foi "derivada ingrediente a ingrediente
(não inventada a partir de uma caloria redonda)", um processo diferente
do que o comentário descreve.

### Correção

Comentário reescrito para deixar explícito que a fórmula só se aplica ao
índice 0 de cada goal (a receita original), e que as 19 seguintes foram
derivadas ingrediente a ingrediente:

```ts
// A primeira receita de cada goal (índice 0) é a receita original, única,
// que já existia antes do pool de 20 — nela, fat = (calories − protein×4 −
// carbs×4) / 9, arredondado. As 19 seguintes de cada goal foram derivadas
// ingrediente a ingrediente (não a partir dessa fórmula reversa).
```

---

## Decisões documentadas (não são bugs, não precisam de correção)

### Posicionamento das 852 chaves i18n novas dentro de `home`

O prompt não especificou onde inserir as chaves novas dentro do objeto
`home` de `en.json`/`pt-BR.json`. Inseri logo após as chaves da receita
original (`dailyRecipeIngredientRecovery3Amount`), mantendo o agrupamento
temático já existente no arquivo (todas as chaves de receita diária
juntas), em vez de no fim do objeto `home` (depois de `protocols`/
`protocolPrompts`, que são um assunto não relacionado). Registrado aqui só
por transparência — qualquer uma das duas posições funciona
identicamente em runtime, já que chaves JSON não dependem de ordem.

---

## Limitação de verificação

Nenhuma verificação visual foi feita no Expo Go ou em dispositivo real —
a validação deste checkpoint ficou restrita a typecheck, lint, testes
automatizados e leitura de código ponta a ponta (Home → navegação →
`BlendScreen` → `StepModeView`). O layout do segmented control Timer/
Passos e a legibilidade do texto grande do `StepModeView` não foram
confirmados visualmente.

---

## Status

**Os 4 achados foram corrigidos e verificados**, em duas rodadas:

- Achados 1 (Alta), 2 (Média) e 4 (Baixa) — primeira rodada, com plano de
  ação próprio aprovado antes da implementação.
- Achado 3 (Baixa) — inicialmente deixado de lado por decisão do Gabriel;
  reconsiderado e corrigido numa segunda rodada, depois de uma análise de
  dependências confirmando ausência de conflitos antes da instalação.

`tsc --noEmit` limpo em `apps/mobile`/`apps/api`/`packages/shared`, lint
limpo em todo `apps/mobile/src`, suíte completa de `apps/mobile` sem
regressão nas duas rodadas — 34/34 testes no final (composição
diferente da original em ambos os arquivos de teste de componente,
mesma contagem total). As decisões documentadas e a limitação de
verificação acima continuam valendo sem alteração.
