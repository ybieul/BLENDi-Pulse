# DIAG-6 — i18n, Strings Hardcoded e Formatação Centralizada

**Data:** 2026-09-09
**Escopo:** Strings hardcoded no código, chaves referenciadas mas ausentes nos JSONs, inconsistência entre pt-BR.json e en.json, interpolações com formato errado, chaves mortas, formatação de números/datas/unidades, valores idênticos suspeitos, achados fora do escopo.
**Método:** análise estática (grep) combinada com scripts Node.js descartáveis (criados em `/tmp/`, apagados após uso). Nenhum servidor rodando, nenhuma alteração de código feita durante este diagnóstico.

**Baseline de chaves (apurado nesta sessão, via script Node.js — contagem de chaves-folha com notação de ponto):**

```
pt-BR.json total leaf keys: 863
en.json total leaf keys: 863
```

Confirma o baseline pré-FIX de 862 citado no brief + 1 chave líquida adicionada desde então. O número é uma contagem líquida — não indica se FIX-3/4/5/8 adicionaram exatamente as chaves esperadas nem se alguma foi removida no processo; a comparação estrutural fina fica para a Tarefa 3/5.

---

## Tarefa 1 — Strings hardcoded: varredura computacional e manual

Todos os 6 greps especificados no prompt foram executados literalmente contra `apps/mobile/src`. Os padrões foram testados previamente contra arquivos sintéticos para confirmar que a ferramenta de grep do ambiente (`ugrep`, compatível com GNU grep) interpreta corretamente `\s`, classes Unicode (`À-ÿ`) e `[[:space:]]` antes de aceitar qualquer resultado "zero" como real.

### 1.1 — JSX hardcoded em `screens/`

```
$ grep -rn ">[A-ZÀ-Ö][a-zA-ZÀ-ÿ\s,!?]*<" --include="*.tsx" apps/mobile/src/screens/
(0 resultados)
```

### 1.2 — JSX hardcoded em `components/`

```
$ grep -rn ">[A-ZÀ-Ö][a-zA-ZÀ-ÿ\s,!?]*<" --include="*.tsx" apps/mobile/src/components/
(0 resultados)
```

**Validação do método:** o padrão exige que o texto apareça na mesma linha, imediatamente entre `>` e `<` (ex: `<Text>Hello</Text>`). Todo o código do app escreve texto de UI como `<Text>{t('chave')}</Text>`, então o padrão nunca casa por construção — não é um falso-negativo da ferramenta. Confirmado com arquivo sintético (`<Text>Hello World</Text>` casa corretamente com o mesmo regex).

Como o padrão do prompt não cobre (a) texto quebrado em múltiplas linhas dentro de `<Text>`, nem (b) texto que começa com `{expressão}` mas contém string literal concatenada no meio, rodei uma varredura computacional suplementar (script Node.js descartável, `/tmp/i18n-audit-t1-jsx.js`, apagado após uso) que parseia `<Text ...>conteúdo</Text>` com regex multilinha em todos os `.tsx` de `screens/` e `components/`, e reporta qualquer filho que não seja puramente uma expressão `{...}`:

```
Total findings: 5
apps/mobile/src/screens/PulseAIScreen.tsx:624 => "9 && styles.badgeTextOverflow, ]}> {favoritesCount > 9 ? '9+' : String(favoritesCount)}"
apps/mobile/src/screens/TrackScreen.tsx:461 => "9 && styles.shoppingListBadgeTextOverflow, ]}> {pendingShoppingListItemsTotal > 9 ? '9+' : String(pendingShoppingListIte..."
apps/mobile/src/screens/WeeklyReportScreen.tsx:292 => "{Math.round(report.data.supplements.adherenceRate * 100)}%"
apps/mobile/src/screens/WeeklyReportScreen.tsx:425 => "{t('weeklyReport.bestDay')} — {formatWeekdayShort(report.data.nutrition.bestDay.date)}{' '} ({Math.round(report.data.nut..."
apps/mobile/src/screens/auth/RegisterScreen.tsx:481 => "void handleOpenExternalUrl(PRIVACY_URL)}> {t('auth.privacyPolicy')}"
```

**Classificação: falso positivo (artefato de regex), todos os 5.** Rastreados até a fonte: em cada caso há um operador `>` de comparação (`favoritesCount > 9`, `count > 9`) ou um closure de callback (`=> {...}`) dentro de uma prop JSX antes do fechamento real da tag `<Text>` — meu parser (que usa `[^>]*` para o final da tag de abertura) interpretou esse `>` de comparação como o fechamento da tag. Não há texto hardcoded real em nenhum dos 5 — inspecionei cada arquivo:linha e confirmei que o conteúdo textual real renderizado é sempre `{t(...)}` ou `%`/`{' '}`/pontuação de interpolação.

**Conclusão da Tarefa 1.1/1.2:** nenhuma string hardcoded como filho direto de `<Text>` em `screens/` ou `components/`. Todo texto de UI passa por `t()`.

### 1.3 — `Alert.alert` / `Alert.prompt`

```
$ grep -rn "Alert\.alert\|Alert\.prompt" --include="*.tsx" --include="*.ts" apps/mobile/src/
apps/mobile/src/screens/ShoppingListDetailScreen.tsx:385:    Alert.alert(
apps/mobile/src/screens/ManageStackScreen.tsx:133:    Alert.alert(deleteTitle, deleteMessage, [
apps/mobile/src/screens/ShoppingListsScreen.tsx:487:      Alert.alert(
apps/mobile/src/screens/ShoppingListsScreen.tsx:572:          Alert.alert(list.name, undefined, [
apps/mobile/src/screens/ShoppingListsScreen.tsx:586:          Alert.alert(list.name, undefined, [
apps/mobile/src/screens/MeScreen.tsx:868:    Alert.alert(
apps/mobile/src/screens/MeScreen.tsx:954:    Alert.alert(profilePhotoActionCopy.title, undefined, [
apps/mobile/src/screens/MeScreen.tsx:984:    Alert.alert(
apps/mobile/src/hooks/usePulseProPurchase.ts:208:          Alert.alert(
```

Cada uma das 9 ocorrências foi lida e rastreada até a origem do texto:

| Linha | Origem do texto | Classificação |
|---|---|---|
| ShoppingListDetailScreen.tsx:385-394 | `t('shoppingList.clearChecked')`, `t('shoppingList.clearCheckedConfirm', {count})`, `t('common.actions.cancel')` | Falso positivo — i18n correto |
| ManageStackScreen.tsx:133 | `deleteTitle`/`deleteMessage`/`deleteCancel`/`deleteConfirm` são props recebidas já resolvidas via `t('track.deleteConfirmTitle')` etc. no componente pai (linhas 406-409) | Falso positivo — i18n correto |
| ShoppingListsScreen.tsx:487-498 | `t('shoppingList.deleteList')`, `t('shoppingList.deleteListConfirm')`, `t('common.actions.cancel')` | Falso positivo — i18n correto |
| ShoppingListsScreen.tsx:572, 586 | Primeiro argumento é `list.name` | Falso positivo — dado do usuário (nome da lista), não copy de UI, não deveria ser traduzido |
| MeScreen.tsx:868 | `profilePhotoActionCopy.removePhotoConfirm` → `t('me.removePhotoConfirm')` | Falso positivo — i18n correto |
| MeScreen.tsx:954 | `profilePhotoActionCopy.title` → `t('me.profilePhotoTitle')`; botões usam `.takePhoto`/`.chooseFromGallery`/`.removePhoto` (todos `t()`) e `t('common.actions.cancel')` | Falso positivo — i18n correto (mas ver achado real na função `getProfilePhotoActionCopy`, seção 1.6) |
| MeScreen.tsx:984 | `t("me.signOut.title")`, `t("me.signOut.message")` | Falso positivo — i18n correto |
| usePulseProPurchase.ts:208 | `t('me.upgradeScreen.restoreNotFoundTitle')`, `t('me.upgradeScreen.restoreNotFoundMessage')` | Falso positivo — i18n correto |

Nenhum achado real nesta subtarefa.

### 1.4 — Títulos de navegação e tab bar

```
$ grep -rn "title:\s*['\"]" --include="*.tsx" --include="*.ts" apps/mobile/src/navigation/
(0 resultados)

$ grep -rn "tabBarLabel:\s*['\"]" --include="*.tsx" --include="*.ts" apps/mobile/src/
(0 resultados)
```

Validado com arquivo sintético que o padrão funciona mecanicamente. Investigação manual do único uso de `tabBarLabel` no app (`AppNavigator.tsx:61`):

```ts
const TAB_LABELS = {
  Home: 'navigation.home',
  PulseAI: 'navigation.pulseAI',
  Blend: 'navigation.blend',
  Track: 'navigation.track',
  Me: 'navigation.me',
} as const;
...
tabBarLabel: t(TAB_LABELS[route.name]),
```

**Falso positivo** — as chaves de tradução são armazenadas como constante e resolvidas via `t()` no render; não é string literal exibida ao usuário. O app não usa `options={{ title: ... }}` nativo do react-navigation em lugar nenhum — todas as telas usam headers customizados (`<Text style={styles.headerTitle}>{t('...')}</Text>`), todos confirmados usando `t()` (ex: `ConversationHistoryScreen.tsx:184`, `PantryScannerScreen.tsx:533,598`, `FavoritesListScreen.tsx:235`, `PulseAIScreen.tsx:592`, `ManageStackScreen.tsx:390`, `ShoppingListsScreen.tsx:718`).

Nenhum achado real nesta subtarefa.

### 1.5 — Placeholders de input

```
$ grep -rn "placeholder=['\"]" --include="*.tsx" apps/mobile/src/
(0 resultados)
```

Todos os 24 usos reais de `placeholder=` no app (grep sem exigir aspas, para investigação) resolvem por `t()` direto, por variável pré-resolvida com `t()` (`weightPlaceholder`/`heightPlaceholder` em `OnboardingBodyScreen.tsx:242-247`, condicionadas a `unitSystem`), por constante de chave (`TITLE_KEYS[type]` em `EditSettingSheet.tsx:67-73,323`), ou por array construído dinamicamente com `t(\`pulseAi.goals.${goalKey}.${field}\`)` (`ChatInput.tsx:95-101` — chave dinâmica, documentada separadamente na Tarefa 2). Único não-i18n: `AuthInput.tsx:207` com `placeholder={undefined}` — não é string, não aplicável.

Nenhum achado real nesta subtarefa.

### 1.6 — Labels em objetos de configuração/constantes

```
$ grep -rn "label:\s*['\"]" --include="*.tsx" --include="*.ts" apps/mobile/src/
(0 resultados)
```

Grep exploratório sem exigir aspas (`label:`, 43 ocorrências) para rastrear cada uso até a fonte. A esmagadora maioria são declarações de tipo (`label: string`) ou chaves de `StyleSheet` (`label: { ... }`) — não são strings de UI. Dos usos que de fato atribuem uma string a `label`, todos os 12 usam `t(...)` diretamente (`reconnectSync.utils.ts:59,116`, `MeScreen.tsx:506,512,518,524`, `EditSettingSheet.tsx:218,219,223,224`, `WeeklyShareCard.tsx:124,130,142`, `ShareFormatSheet.tsx:107,113`), **exceto um arquivo:**

**🔴 Achado real — `RecipeShareCard.tsx:79-108`.** Os 4 labels de macro do card de compartilhamento de receita (Proteína/Carboidratos/Gordura/Calorias) são hardcoded via ternário manual, não via i18next:

```ts
const isPortuguese = locale === 'pt-BR';
return [
  { key: 'protein',  label: isPortuguese ? 'Proteína' : 'Protein', ... },
  { key: 'carbs',    label: isPortuguese ? 'Carboidratos' : 'Carbs', ... },
  { key: 'fat',      label: isPortuguese ? 'Gordura' : 'Fat', ... },
  { key: 'calories', label: isPortuguese ? 'Calorias' : 'Calories', ... },
];
```

O mesmo arquivo usa `t('share.defaultUser')` corretamente duas linhas acima (linha 78) — a inconsistência é local a este bloco, não do arquivo inteiro. Essas 8 strings (4 labels × 2 idiomas) nunca passam pelo pipeline i18n: não aparecem nos JSONs, não são alcançáveis por tradutores, e duplicam lógica de locale que já existe centralizada em `i18n.language`/`useAppTranslation`.

Nenhum achado real nesta subtarefa.

### 1.7 — Achado adicional encontrado durante a investigação (fora dos 6 greps, via rastreamento de `Alert.alert`/`getProfilePhotoActionCopy`)

**🔴 Achado real — `MeScreen.tsx:426-461`, função `getProfilePhotoActionCopy`.** Dos 10 campos retornados por essa função, 8 usam `t(...)` corretamente e 2 são hardcoded com branch manual de locale, quebrando o mesmo padrão que os outros 8 campos da própria função seguem:

```ts
if (locale === "pt-BR") {
  return {
    ...
    cameraPermissionDenied: "Permita o acesso à câmera para tirar uma foto.",
    galleryPermissionDenied: "Permita o acesso à galeria para escolher uma foto.",
  };
}
return {
  ...
  cameraPermissionDenied: "Allow camera access to take a photo.",
  galleryPermissionDenied: "Allow photo library access to choose a photo.",
};
```

Ambas as strings são exibidas ao usuário via `showToast()` quando a permissão de câmera/galeria é negada (`MeScreen.tsx:833,852`) — visível na produção, não é código morto. 4 strings literais no total (2 campos × 2 idiomas), fora do pipeline i18n.

---

### Resumo da Tarefa 1

| Subtarefa | Grep especificado | Resultado literal | Achados reais | Falsos positivos revisados |
|---|---|---|---|---|
| 1.1 | JSX hardcoded em `screens/` | 0 | 0 | 5 (artefato de regex, via script suplementar) |
| 1.2 | JSX hardcoded em `components/` | 0 | 0 | (incluído acima) |
| 1.3 | `Alert.alert`/`Alert.prompt` | 9 ocorrências | 0 | 9 (8 i18n correto + 1 dado de usuário) |
| 1.4 | `title:`/`tabBarLabel:` em navegação | 0 | 0 | 1 (`TAB_LABELS`, i18n correto) |
| 1.5 | `placeholder=` | 0 | 0 | 24 (i18n correto, incl. 1 chave dinâmica — ver Tarefa 2) |
| 1.6 | `label:` | 0 | 2 (`RecipeShareCard.tsx`, 4 strings) | 41 (i18n correto ou não-UI) |
| 1.7 | (achado adicional, fora do escopo dos 6 greps) | — | 1 (`MeScreen.tsx`, 4 strings) | — |

**Total de achados reais na Tarefa 1: 2 locais, 8 strings literais hardcoded** (`RecipeShareCard.tsx` — 4 labels de macro; `MeScreen.tsx` — 2 mensagens de permissão negada, cada uma com 2 variantes de idioma escritas manualmente no código). Ambos os casos seguem o mesmo padrão de causa raiz: branch manual `locale === 'pt-BR'` reimplementando, de forma ad hoc, o que `t()` já resolveria — nenhum é string verdadeiramente "esquecida" sem tradução (as duas variantes de idioma existem e estão corretas), mas nenhuma das 8 strings é gerenciável pelo pipeline de tradução, não aparece nos JSONs, e diverge do padrão usado no resto do próprio arquivo.

Fora isso, a varredura (6 greps oficiais + validação sintética + script suplementar de JSX multilinha + rastreamento manual de toda variável/helper que alimenta `Alert.alert`, `label:`, `placeholder=`, `tabBarLabel`) não encontrou nenhuma outra string de UI hardcoded em `apps/mobile/src/screens/` ou `apps/mobile/src/components/`. O app usa `t()` de forma consistente fora dos dois pontos acima.

---

## Tarefa 2 — Chaves referenciadas no código mas ausentes nos JSONs

Script Node.js descartável (`/tmp/i18n-audit-t2.js`, apagado após uso) percorreu recursivamente todo `apps/mobile/src/**/*.{ts,tsx}` e extraiu:
1. Chamadas `t('...')`/`t("...")` e `i18n.t('...')`/`i18n.t("...")` com **string literal** como primeiro argumento.
2. Chamadas com **template literal** (`` t(`...${var}...`) ``) — chave dinâmica.

Cruzado contra o set plano (notação de ponto) dos dois JSONs.

### 2.1 — Chamadas com chave literal

```
=== TOTAIS ===
Total de chamadas t()/i18n.t() com string literal encontradas: 531
Chaves únicas (literal) referenciadas no código: 381
Total de chamadas com template literal (chave dinâmica): 4

=== EXISTE EM AMBOS (pt-BR + en) ===
Chamadas: 525 | Chaves únicas: 376

=== EXISTE APENAS EM pt-BR (falta em en) ===
Chaves únicas: 0

=== EXISTE APENAS EM en (falta em pt-BR) ===
Chaves únicas: 0

=== NAO EXISTE EM NENHUM DOS DOIS (CRITICO) — saída bruta do script ===
Chaves únicas: 5
  "shoppingList.pendingItem" -> apps/mobile/src/components/shoppingList/AddToListSheet.tsx:263, apps/mobile/src/screens/ShoppingListsScreen.tsx:108
  "track.dailyTargetSummary" -> apps/mobile/src/screens/ManageStackScreen.tsx:151
  "common.actions.add" -> apps/mobile/src/screens/ShoppingListDetailScreen.tsx:558
  "notifications.dailyPulsePrompt" -> apps/mobile/src/services/notifications.service.ts:54
  "notifications.channelName" -> apps/mobile/src/services/notifications.service.ts:101
```

**Cada uma das 5 foi investigada individualmente antes de classificar** (o script faz apenas matching exato de string, não é i18next-aware para plurais nem detecta erro de namespace):

| Chave reportada pelo script | Investigação | Classificação final |
|---|---|---|
| `shoppingList.pendingItem` | Chamada real é `t('shoppingList.pendingItem', { count: ... })` (`AddToListSheet.tsx:263`, `ShoppingListsScreen.tsx:108`, ambos passam `count`). O JSON não tem a chave `pendingItem` pura — tem `pendingItem_one`/`pendingItem_other` (pluralização automática do i18next, confirmada em `pt-BR.json:423-424` e `en.json:423-424`, duas vezes cada — dentro de dois namespaces distintos). | **Falso positivo do script** — i18next resolve corretamente em runtime via sufixo de plural. Nenhuma ação necessária. |
| `track.dailyTargetSummary` | Mesma causa: `t('track.dailyTargetSummary', { count: ... })` em `ManageStackScreen.tsx:151`, JSON tem `dailyTargetSummary_one`/`_other` (`pt-BR.json:500-501`). | **Falso positivo do script** — mesmo padrão de pluralização. |
| `common.actions.add` | `t('common.actions.add')` usado como `accessibilityLabel` em `ShoppingListDetailScreen.tsx:558` (botão de adicionar item à lista). O namespace `common.actions` existe (`pt-BR.json:12-24`) e tem `confirm/cancel/save/back/continue/edit/remove/done/retry/restore/close` — **não tem `add`**. | **🔴 Achado real — chave ausente nos dois JSONs.** Um leitor de tela anuncia literalmente "common.actions.add" para usuários de acessibilidade em vez de "Adicionar"/"Add". |
| `notifications.dailyPulsePrompt` | `i18n.t('notifications.dailyPulsePrompt', { recipeTitle })` em `notifications.service.ts:54`, usado como corpo de push notification (`buildDailyPulsePrompt`). A chave existe, mas em outro namespace: `me.notifications.dailyPulsePrompt` (`pt-BR.json:1047`, dentro do bloco `me.notifications`, que também tem `title/dailyPulse/streakReminder/...`). O código chama sem o prefixo `me.`. | **🔴 Achado real — chave com namespace errado no código.** A notificação push exibida ao usuário mostra o texto literal da chave (`notifications.dailyPulsePrompt`) em vez de "Me conte mais sobre a receita X" / "Tell me more about the X recipe". |
| `notifications.channelName` | `i18n.t('notifications.channelName')` em `notifications.service.ts:101`, usado como **nome do canal de notificação Android** (`Notifications.setNotificationChannelAsync`). Mesma causa: a chave real é `me.notifications.channelName` (`pt-BR.json:1046` = `"BLENDi Pulse"`). | **🔴 Achado real — chave com namespace errado no código.** O canal de notificação aparece nas configurações do Android com o literal "notifications.channelName" em vez de "BLENDi Pulse" — visível fora do app, na tela de sistema do Android. |

**Resumo 2.1:** 3 achados reais (`common.actions.add` ausente; `notifications.dailyPulsePrompt` e `notifications.channelName` com namespace errado — faltando o prefixo `me.`), 2 falsos positivos (pluralização i18next não detectada pelo matching exato do script).

### 2.2 — Chamadas com chave dinâmica (template literal)

```
=== CHAMADAS COM CHAVE DINAMICA (template literal) ===
  apps/mobile/src/components/pulseAi/ChatInput.tsx:98 -> `pulseAi.goals.${goalKey}.${field}`
  apps/mobile/src/screens/PulseAIScreen.tsx:223 -> `pulseAi.goals.${goalKey}.welcomeTitle`
  apps/mobile/src/screens/PulseAIScreen.tsx:224 -> `pulseAi.goals.${goalKey}.welcomeSubtitle`
  apps/mobile/src/screens/PulseAIScreen.tsx:226 -> `pulseAi.goals.${goalKey}.${field}`
```

Namespace único: `pulseAi.goals.*`. Sufixos possíveis rastreados até a fonte:
- `goalKey` ∈ `{muscle, wellness, energy, recovery}` (`GOAL_I18N_KEYS`, `ChatInput.tsx:90-95`/`PulseAIScreen.tsx`, mapeado a partir do enum `UserGoal`).
- `field` (ChatInput) ∈ `{inputPlaceholder1, inputPlaceholder2, inputPlaceholder3}` (`INPUT_PLACEHOLDER_FIELDS`, `ChatInput.tsx:71-75`).
- `field` (PulseAIScreen:226) ∈ `{suggestion1, suggestion2, suggestion3}` (`GOAL_SUGGESTION_FIELDS`, `PulseAIScreen.tsx:97`).
- Mais `welcomeTitle`/`welcomeSubtitle` fixos (linhas 223-224).

Verificação computacional das 4×8 = 32 combinações possíveis (`goalKey` × `{welcomeTitle, welcomeSubtitle, suggestion1-3, inputPlaceholder1-3}`) contra os dois JSONs:

```
Total combinações verificadas: 32, faltando: 0
```

**Nenhum achado** — todas as 32 chaves dinâmicas do namespace `pulseAi.goals.*` existem em ambos os idiomas.

### 2.3 — Chaves usadas indiretamente via variável/constante (não seriam capturadas pelo script padrão da Tarefa 2)

O `t()` do projeto é tipado (`useAppTranslation.ts`, autocomplete de `en.json`), o que empurra o padrão do código para **não** passar strings literais direto em boa parte dos casos — em vez disso, várias telas resolvem a chave antes, guardam em uma constante/`Record<Enum, TranslationKey>` e chamam `t(variavel)`. Esse padrão não é nem chamada-literal nem template-literal, então passa despercebido tanto pelo script oficial da Tarefa 2 quanto pelos greps da Tarefa 1. Rodei uma varredura adicional (`grep` por `t(identificador`) que encontrou 40+ pontos desse tipo; rastreei cada gerador até sua origem e testei a Tarefa 2 volta a fazer sentido: são "chaves dinâmicas" no sentido de não aparecerem como string literal na chamada, mas **estaticamente enumeráveis** (o conjunto de valores possíveis é finito e está no próprio código-fonte, diferente de `pulseAi.goals.${var}` que depende de dado em runtime só nesse sentido — aqui as origens são enums/Records fechados).

Compilei os valores literais de cada gerador e verifiquei contra os dois JSONs:

```
TITLE_KEYS (EditSettingSheet.tsx): 8 chaves, 0 faltando
TAB_LABELS (AppNavigator.tsx): 5 chaves, 0 faltando
TIMING_TRANSLATION_KEYS (SupplementCheckItem/ManageStackScreen): 5 chaves, 0 faltando
IMC_CLASS_KEYS (OnboardingBodyScreen.tsx): 4 chaves, 0 faltando
ANALYZING_STEP_KEYS (PantryScannerScreen.tsx): 3 chaves, 0 faltando
getModelKey (MeScreen.tsx): 3 chaves, 0 faltando
getGoalKey (MeScreen.tsx): 4 chaves, 0 faltando
getLanguageKey (MeScreen.tsx): 2 chaves, 0 faltando
getGreetingKey (HomeScreen.tsx): 3 chaves, 0 faltando
ACTIVITY_LEVELS.labelKey (OnboardingBodyScreen.tsx): 4 chaves, 0 faltando
GOALS.titleKey/descKey (OnboardingGoalScreen.tsx): 8 chaves, 0 faltando
MODELS.descKey (OnboardingModelScreen.tsx): 3 chaves, 0 faltando
badges.utils.ts titleKey: 6 chaves, 0 faltando
getStageLabelKey (BadgeCard.tsx): 4 chaves, 0 faltando
DailyRecipeCard.tsx nameKey (receitas): 4 chaves, 0 faltando
DailyRecipeCard.tsx ingredient nameKey/amountKey: 24 chaves, 0 faltando
PURCHASE_SUCCESS_KEY/RESTORE_SUCCESS_KEY (usePulseProPurchase.ts): 2 chaves, 0 faltando
displayUnitSystem ternário (MeScreen.tsx:1326-1329): 2 chaves, 0 faltando
missionDefinitions.ts titleKey (apps/api, consumido pelo mobile via MissionCard.tsx): 9 chaves, 0 faltando

TOTAL: 103 chaves verificadas via constante/enum indireto, 0 faltando.
```

**Nenhum achado** — todos os 103 pontos de indireção resolvem para chaves existentes em ambos os JSONs.

**Grupo à parte — namespace `errors.*`/`errors.validation.*` (aberto, não totalmente enumerável em código estático):** vários pontos (`error.translationKey`, `getAxiosErrorTranslationKey`, `getApiErrorTranslationKey`, `translateKey(issue.message)` em telas de auth, `translateKey(googleError)`) constroem a chave a partir de um **código de erro vindo do backend em runtime** (`errors.${code.replace(/[/-]/g, '_')}`, sempre em lowercase). Não é possível enumerar exaustivamente por análise estática porque depende de qualquer código de erro que a API venha a retornar. Verifiquei o que é estaticamente conhecido:
- `errors.network.timeout`, `errors.network.offline`, `errors.network_internal_server_error` (fallbacks fixos) → existem nos dois JSONs.
- `levels.beginner` … `levels.legend`, `levels.guru` (`getLevelNameKey`, `packages/shared/src/utils/level.utils.ts:4-15,52-57`) → existem nos dois JSONs.
- Todas as 67 chaves `errors.*` atualmente presentes nos JSONs foram listadas (ver Tarefa 5 para achado de chave morta por casing encontrado aqui: `errors.shoppingList_free_tier_limit` vs `errors.shoppinglist_free_tier_limit`).

Classificação: **possivelmente usada dinamicamente** — namespace correto e fallbacks confirmados corretos; cobertura exaustiva não é possível sem listar todos os `code` que o backend pode emitir (fora do escopo deste diagnóstico de mobile/i18n).

### Resumo da Tarefa 2

| Grupo | Chaves verificadas | Achados reais |
|---|---|---|
| 2.1 — Chamada literal `t('...')` | 381 únicas (531 chamadas) | 3 (`common.actions.add` ausente; `notifications.dailyPulsePrompt` e `notifications.channelName` com namespace errado, faltando `me.`) |
| 2.2 — Chave dinâmica via template literal | 32 combinações (`pulseAi.goals.*`) | 0 |
| 2.3 — Chave indireta via variável/enum/constante | 103 combinações | 0 |
| 2.3 (extra) — namespace `errors.*` aberto | 67 chaves existentes catalogadas + 3 fallbacks fixos + 11 `levels.*` | 0 nos pontos verificáveis estaticamente; 1 chave morta encontrada por casing (`errors.shoppingList_free_tier_limit` vs `errors.shoppinglist_free_tier_limit`) — detalhado na Tarefa 5 |

**Total: 3 achados críticos reais na Tarefa 2**, todos em `common`/`notifications`, todos com impacto direto ao usuário final (texto literal de chave i18n aparecendo em: leitor de tela, corpo de push notification, e nome do canal de notificação Android nas configurações do sistema).

---

## Tarefa 3 — Inconsistência estrutural entre pt-BR.json e en.json

Script Node.js descartável (`/tmp/i18n-audit-t3.js`, apagado após uso) leu os dois arquivos, construiu recursivamente o set de chaves de cada um (notação de ponto) e comparou.

```
=== CONTAGEM TOTAL ===
pt-BR.json total leaf keys: 863
en.json total leaf keys: 863
Diferença: 0

=== CHAVES EM pt-BR MAS NAO EM en ===
Total: 0

=== CHAVES EM en MAS NAO EM pt-BR ===
Total: 0

=== CHAVES EM AMBOS (somente contagem) ===
Total: 863
```

**Resultado: zero divergência estrutural.** Os dois arquivos têm exatamente as mesmas 863 chaves-folha, mesmos caminhos, nenhuma órfã de um lado só.

### Validação do resultado (evitar falso-negativo do script)

Um resultado "zero divergências" é incomum o suficiente (dado que 4 FIXes separados editaram os dois arquivos em sessões diferentes) para justificar checar se o método de comparação não está mascarando algo. Duas verificações adicionais:

**1. Chaves duplicadas no mesmo nível do objeto** (JSON.parse aceita silenciosamente uma chave duplicada dentro do mesmo objeto, mantendo só o último valor — isso inflaria a contagem de "chaves esperadas" sem aparecer na comparação por set, já que o set colapsa a duplicata). Script de varredura linha a linha, respeitando a profundidade de chaves de `{`/`}`, checando repetição de chave dentro do mesmo escopo:

```
apps/mobile/src/locales/pt-BR.json: 0 chaves duplicadas no mesmo nível
apps/mobile/src/locales/en.json: 0 chaves duplicadas no mesmo nível
```

**2. Arrays que poderiam esconder divergência de tamanho** (se um valor fosse array em vez de objeto/string, minha função `flatten` trata o array inteiro como uma folha única — duas listas de tamanhos diferentes no mesmo caminho de chave passariam despercebidas pela comparação de sets, já que a chave existe em ambos, só o conteúdo mudaria). Varredura de todos os valores-array nos dois arquivos:

```
Arrays em pt-BR.json: 0
Arrays em en.json: 0
```

Nenhum dos dois arquivos usa arrays — toda a estrutura é objetos aninhados terminando em string. Isso elimina essa classe de falso-negativo: a comparação por chave-folha é exaustiva para este formato de arquivo.

**Conclusão da Tarefa 3:** a inconsistência estrutural entre os dois JSONs, que era uma preocupação central do brief (dado o histórico de 4 FIXes editando os arquivos separadamente), **não existe atualmente**. Os dois arquivos estão perfeitamente sincronizados em termos de chaves — 863/863, sem órfãs de nenhum lado. Isso não contradiz os achados da Tarefa 2 (chaves ausentes nos dois JSONs simultaneamente, ou usadas com namespace errado no código) — aqueles são problemas de código referenciando uma chave errada/inexistente, não de os dois arquivos de tradução estarem dessincronizados entre si.

---

## Tarefa 4 — Interpolações com formato errado nos JSONs

### 4.1 — Grep literal do prompt: `{var}` (chave simples) em vez de `{{var}}`

```
$ grep -n "{[a-zA-Z][a-zA-Z0-9]*}" apps/mobile/src/locales/pt-BR.json
(76 linhas)
$ grep -n "{[a-zA-Z][a-zA-Z0-9]*}" apps/mobile/src/locales/en.json
(76 linhas)
```

Saída completa reproduzida no bloco abaixo (idêntica para os dois arquivos em número de linhas, valores traduzidos):

```
6:    "lastUpdated": "Atualizado há {{hours}}h",
8:    "daysAgoToday": "Hoje às {{time}}",
10:    "daysAgoN": "Há {{days}} dias",
164:    "macroRecommendation": "Para {{goal}}, recomendamos {{proteinMin}}–{{proteinMax}}g de proteína e {{caloriesMin}}–{{caloriesMax}} kcal",
169-171: greeting_morning/afternoon/evening: "... {{name}}."
175-177: waterAdded/waterLoggedMl/waterLoggedFlOz: "{{amount}} ..."
183-184: missionComplete/xpAvailable: "... {{xp}} ..."
188: hydrationBar: "{{current}} / {{target}}"
195-196: recipeMacros/blendTime: "{{protein}}g ... {{carbs}}g ... {{calories}} kcal" / "{{minutes}} min..."
224-226: home.greeting.morning/afternoon/evening (variante aninhada): "... {{name}}."
231: home.rings.progress: "{{current}} de {{goal}} {{unit}}"
235-236: home.streak.label_one/_other: "{{count}} dia(s) seguido(s)"
334: rateYourBlendWithName: "Avalie {{recipeName}}"
340: timerDuration: "{{seconds}}s"
398: moreIngredients: "+{{count}} itens"
423-424,443-444: pendingItem_one/_other (dois namespaces distintos): "{{count}} ..."
455: clearCheckedConfirm: "Remover {{count}} itens comprados?"
465: addedToList: "Itens adicionados a {{listName}}"
501: dailyTargetSummary_other: "{{count}}x/dia"
514: item_label: "{{name}} · {{calories}} kcal"
528: week: "Sem {{number}}"
581-594, 962-975: progressLabel + blendJourney*/streakMaster* (dois namespaces paralelos: profile.badges e me.badges)
650,713-714: queriesRemaining/scansRemaining/renewsIn: "{{count}}/{{days}} ..."
724-725: basedOnIngredients/additionalIngredients
754: resendCodeIn: "Reenviar código em {{seconds}}s"
783-785: errors.validation.too_short/too_long/number_range: "... {{min}}/{{max}} ..."
838: errors.blend_sync_failed_named: "Não foi possível sincronizar {{recipeName}} ..."
858,862,871: notifications.daily_pulse.body / notifications.streak.reminder_body / notifications.levelUpBody
881-884,914: xpToNextLevel/currentXp/levelDetail/levels.guru: "{{xp}}/{{level}} ..."
939: memberSince: "Membro desde {{date}}"
998,1017-1018: price/annualEquivalent/save (upgrade screen)
1047: me.notifications.dailyPulsePrompt: "Me conte mais sobre a receita {{recipeTitle}}"
1063-1081: weeklyReport.* (totalBlends, avgProtein, adherenceRate, streakAsOf, etc.)
```

**Classificação: 100% falso positivo.** O padrão do prompt (`{var}` com chave simples) **é um subconjunto textual de `{{var}}`** — toda ocorrência de `{{hours}}` contém a substring `{hours}` (segunda chave de abertura + nome + primeira chave de fechamento), então o grep especificado casa com **qualquer** interpolação corretamente formatada, não apenas com erros de chave simples. Validado isolando o padrão com lookaround negativo para excluir chaves adjacentes:

```
$ grep -nP "(?<!\{)\{[a-zA-Z][a-zA-Z0-9]*\}(?!\})" apps/mobile/src/locales/pt-BR.json
(0 resultados)
$ grep -nP "(?<!\{)\{[a-zA-Z][a-zA-Z0-9]*\}(?!\})" apps/mobile/src/locales/en.json
(0 resultados)
```

**Conclusão 4.1: zero interpolações com formato `{var}` (chave simples) real em qualquer um dos dois JSONs.** Todas as 76 ocorrências reportadas pelo grep literal do prompt são interpolações `{{var}}` corretamente formatadas.

### 4.2 — Caminho inverso: chave usa `{{var}}` no JSON, mas a chamada não passa o parâmetro

Script Node.js descartável (`/tmp/i18n-audit-t4.js`, apagado após uso): extrai todas as chaves com `{{var}}` de ambos os JSONs (97 chaves únicas, união pt-BR/en), localiza toda chamada `t('chave', ...)`/`i18n.t('chave', ...)` no código para cada uma, e verifica se cada variável esperada aparece no texto da chamada (heurística: presença do nome da variável dentro dos parênteses da chamada completa).

```
Total de chaves com interpolação {{var}} (pt-BR ∪ en): 97

=== CHAMADAS ONDE FALTA(M) VARIAVEL(IS) DE INTERPOLACAO ===
(0 ocorrências via chamada literal t('chave', ...))

=== CHAVES COM VAR NO JSON QUE NUNCA APARECEM EM CHAMADA LITERAL t('chave' ===
55 chaves (lista completa na saída do script)
```

O script não encontrou nenhum caso de chamada-literal `t('chave', ...)` com variável faltando — mas **55 das 97 chaves nunca aparecem como chamada literal**, porque são resolvidas por indireção (mesma situação da Tarefa 2.3) ou porque nunca são chamadas em lugar nenhum (órfãs — ver Tarefa 5). Rastreei manualmente cada uma até a origem real do call site:

**🔴 Achado real — validação de formulário nunca interpola `{{min}}`/`{{max}}`.** As chaves `errors.validation.too_short`, `errors.validation.too_long` e `errors.validation.number_range` são usadas como mensagem de erro custom do Zod em **109 pontos**, espalhados por 8 arquivos de schema compartilhado (`packages/shared/src/schemas/{auth,user,favorite,blendLog,shoppingList,pulseAi,supplementStack,pantryScanner}.ts`) — ex: `.max(100, 'errors.validation.too_long')`. No mobile, essas mensagens chegam à UI via um wrapper idêntico, duplicado em **6 telas**:

```ts
// LoginScreen.tsx:54, ForgotPasswordScreen.tsx:25, ResetPasswordScreen.tsx:155,
// RegisterScreen.tsx:170, OnboardingMacrosScreen.tsx:73, VerifyOtpScreen.tsx:69
const translateKey = (key: string) => t(key as TranslationKey);
```

`translateKey` aceita **um único argumento** — não há como passar `{ min, max }`. E o chamador (`translateKey(issue.message)` em `handleLogin`, `LoginScreen.tsx:93`, e padrão idêntico nas outras 5 telas) também nunca tem acesso ao valor numérico do limite Zod, já que o próprio schema descarta esse valor — passa só a string da chave como "mensagem" de erro do Zod, o limite (`100`, `0`, etc.) fica só no `.max(100, ...)`/`.min(0, ...)` da validação, nunca chega à interpolação. **Resultado: um usuário que digitar uma senha muito longa, por exemplo, veria literalmente "Deve ter no máximo {{max}} caracteres." / "Must be at most {{max}} characters." na tela** — o placeholder não é substituído por nenhum valor. Isso afeta qualquer campo validado por esses schemas com mensagem `too_short`/`too_long`/`number_range` nas 6 telas listadas.

**Demais 54 chaves sem chamada literal — rastreadas individualmente:**

| Chave | Situação real |
|---|---|
| `home.greeting_morning/afternoon/evening` | Chamada indireta via `t(getGreetingKey(), { name: displayName })` (`HomeScreen.tsx:295`) — **`{{name}}` passado corretamente**. Confirmado sem bug. |
| `levels.guru` (e demais `levels.*`) | Chamada indireta via `t(levelInfo.levelNameKey, { level: levelInfo.level })` (`MeScreen.tsx:1220,1240`; `LevelDetailSheet.tsx:137-138`; `AchievementShareCard.tsx:57`) — **`{{level}}` passado corretamente** em todos os 4 pontos. |
| `me.badges.progressLabel` | Chamada indireta via `translateKey('me.badges.progressLabel', { count: ..., stage: ... })` (`BadgeDetailSheet.tsx:282-285`) — **`{{count}}`/`{{stage}}` passados corretamente**. |
| `me.badges.requirements.blendJourney*`/`streakMaster*` | Chamada indireta via `translateKey(stage.requirementKey, { count: stage.requirement })` (`BadgeDetailSheet.tsx:198,252`), `requirementKey` vindo de `badges.utils.ts` — **`{{count}}` passado corretamente**. |
| `me.notifications.dailyPulsePrompt` | Já coberto na Tarefa 2 — chamada existe mas com namespace errado (`notifications.dailyPulsePrompt`, sem `me.`); quando corrigida a chave, `{{recipeTitle}}` já é passado corretamente (`{ recipeTitle }`, `notifications.service.ts:54`). |
| `blend.timerDuration` | **Órfã confirmada** — `grep` por `timerDuration` no código só encontra a variável de estado JS `timerDuration` (`BlendScreen.tsx`, `blend.store.ts`), sem relação com a chave i18n. Nenhuma chamada `t()` a referencia. Sem risco de interpolação ativo (nunca é chamada) — achado de chave morta, detalhado na Tarefa 5. |
| `errors.blend_sync_failed_generic`/`errors.blend_sync_failed_named` | **Órfãs confirmadas** — `grep` por `blend_sync`/`BlendSync` no código não encontra nenhuma referência às chaves (só um nome de variável booleana não relacionado, `hasPendingBlendSync`, em `useNetworkStatus.ts`). Sem risco de interpolação ativo — achado de chave morta, ver Tarefa 5. |
| `shoppingLists.pendingItem_one/_other` | **Órfã confirmada** — o namespace `shoppingLists` (plural) inteiro não tem nenhuma referência no código; o app usa exclusivamente `shoppingList.pendingItem_one/_other` (singular, verificado com chamada real na Tarefa 2: `AddToListSheet.tsx:263`, `ShoppingListsScreen.tsx:108`, ambos passam `{ count }` corretamente). Namespace duplicado morto — ver Tarefa 5. |
| `profile.badges.progressLabel`, `profile.badges.requirements.*` | **Órfãs confirmadas** — todo o namespace `profile.badges` não tem nenhuma referência no código; `badges.utils.ts` usa exclusivamente `me.badges.*` (já verificado acima, correto). Namespace duplicado morto — ver Tarefa 5. |
| `home.greeting.morning/afternoon/evening` (variante aninhada, distinta de `home.greeting_morning`) | **Órfã confirmada** — sem nenhuma referência no código. O app usa só a variante com underscore (`home.greeting_morning`, verificada acima). |
| `home.rings.progress`, `home.streak.label_one/_other` | **Órfãs confirmadas** — sem nenhuma referência a `rings.progress` ou `streak.label` no código. |
| `home.waterAdded`, `home.waterLoggedMl`, `home.waterLoggedFlOz` | Sem chamada literal encontrada; investigação adicional necessária para confirmar se são chamadas indiretamente (tela de hidratação) ou órfãs — sinalizado para verificação completa na Tarefa 5. |
| `track.history.item_label` | **Órfã confirmada** — sem nenhuma referência a `item_label`/`history.item_label` no código. |
| `notifications.daily_pulse.body`, `notifications.streak.reminder_body`, `notifications.levelUpBody` | **Órfãs confirmadas** — namespace `notifications.*` de nível superior (distinto de `me.notifications.*`, que é o realmente usado) sem nenhuma referência no código. |

### Resumo da Tarefa 4

| Subtarefa | Achados reais |
|---|---|
| 4.1 — `{var}` em vez de `{{var}}` | 0 — grep do prompt gera 76 falsos positivos por casar substring de `{{var}}` corretamente formatado; confirmado com lookaround que não há nenhuma interpolação de chave simples real |
| 4.2 — `{{var}}` no JSON sem parâmetro correspondente na chamada | **1 achado real de alto impacto, sistêmico**: `errors.validation.too_short/too_long/number_range` (109 pontos de uso nos schemas Zod compartilhados, 6 telas mobile com wrapper `translateKey` de um único argumento) — `{{min}}`/`{{max}}` nunca são substituídos, aparecem literalmente na tela de erro de validação |
| 4.2 (colateral) | 10 chaves com `{{var}}` confirmadas **órfãs** (nunca chamadas) — sem risco de interpolação ativo hoje, mas revelam pelo menos 4 namespaces inteiros duplicados/mortos (`shoppingLists.*` vs `shoppingList.*`, `profile.badges.*` vs `me.badges.*`, `home.rings.*`/`home.streak.*`/`home.greeting.*` (aninhado) vs `home.greeting_*` (flat), `notifications.*` de topo vs `me.notifications.*`) — detalhamento completo na Tarefa 5 |
| 4.2 (pendente) | 3 chaves (`home.waterAdded`, `home.waterLoggedMl`, `home.waterLoggedFlOz`) sem chamada literal encontrada nesta tarefa — status (indireta vs. órfã) a confirmar na Tarefa 5 |

---

## Tarefa 5 — Chaves mortas (orphaned keys)

### Metodologia

Script Node.js descartável (`/tmp/i18n-audit-t5.js`, apagado após uso): concatenou o conteúdo de **todo** `apps/mobile/src/**/*.{ts,tsx}` + `packages/shared/src/**/*.{ts,tsx}` + `apps/api/src/**/*.{ts,tsx}` (863 chaves só precisam de 1 match em qualquer um dos três, já que `packages/shared` alimenta schemas Zod com chaves de erro e `apps/api` define `missionDefinitions.ts`, cujos `titleKey` são consumidos pelo mobile). Para cada uma das 863 chaves de `pt-BR.json`, buscou a **string completa da chave entre aspas** (`'chave'`, `"chave"` ou `` `chave` ``) no texto concatenado — não apenas o último segmento, para minimizar falso positivo por homonímia (validado abaixo).

```
Total de chaves: 863
Referenciadas literalmente (string completa encontrada em .ts/.tsx): 540
Possivelmente dinâmicas (prefixo de namespace conhecido, sem match literal): 58
Candidatas a órfã (sem nenhuma referência literal, sem prefixo dinâmico conhecido): 265
```

### Correção pós-processamento: falso positivo de pluralização i18next

Antes de aceitar as 265 candidatas como órfãs, verifiquei manualmente cada uma que termina em `_one`/`_other` (i18next nunca grava a chave-base sufixada como string literal no código — só a chave-base, e o sufixo de plural é resolvido em runtime pelo `{count}`, o mesmo padrão de falso positivo já visto nas Tarefas 2 e 4). Das 32 chaves `_one`/`_other` na lista de candidatas, **16 têm a chave-base confirmada em uso ativo** em outro ponto do código já documentado neste relatório:

| Chave-base (usada) | Sufixos removidos da lista de órfãs | Evidência |
|---|---|---|
| `me.badges.requirements.blendJourneyBronze/Gold/Silver`, `streakMasterBronze/Gold/Silver` | 12 chaves `_one`/`_other` | `requirementKey` em `badges.utils.ts`, consumido via `translateKey(stage.requirementKey, { count })` (`BadgeDetailSheet.tsx:198,252`) — já verificado na Tarefa 4 |
| `shoppingList.pendingItem` | 2 chaves `_one`/`_other` | `t('shoppingList.pendingItem', { count })` (`AddToListSheet.tsx:263`, `ShoppingListsScreen.tsx:108`) — já verificado na Tarefa 2 |
| `track.dailyTargetSummary` | 2 chaves `_one`/`_other` | `t('track.dailyTargetSummary', { count })` (`ManageStackScreen.tsx:151`) — já verificado na Tarefa 2 |

As outras 16 chaves `_one`/`_other` da lista original (`home.streak.label_one/_other`, `profile.badges.requirements.*_one/_other` ×12, `shoppingLists.pendingItem_one/_other`, `recipes.ai.loading_one`) **permanecem órfãs** — confirmei que a chave-base correspondente também não tem nenhuma referência no código (namespaces `home.streak`, `profile.badges`, `shoppingLists` inteiros mortos — ver abaixo).

**Total corrigido de chaves definitivamente órfãs: 265 − 16 = 249.**

### Validação do método contra falso positivo de homonímia (exigido pelo prompt)

Testei deliberadamente o caso `track.manage` (candidata a órfã) vs. `track.manageStack` (chave viva, usada em `ManageStackScreen.tsx:390` e `MyStackSection.tsx:130`) — um grep ingênuo pelo texto `track.manage` retornaria falso-positivo "em uso" por casar a substring dentro de `track.manageStack`. Como o script busca a **string entre aspas completa** (`'track.manage'`, exigindo a aspa de fechamento logo após), `'track.manageStack'` não contém `'track.manage'` como substring válida (o caractere seguinte a "manage" ali é `S`, não uma aspa) — o script classificou corretamente `track.manage` como órfã e `track.manageStack` como em uso. Nenhuma homonímia falso-negativa foi detectada nas 249 chaves finais.

### Verificação específica pedida no prompt: `pantryScanner.analyzing`

```
$ grep -n '"analyzing"' apps/mobile/src/locales/pt-BR.json apps/mobile/src/locales/en.json
(0 resultados)
```

**A chave `pantryScanner.analyzing` já não existe em nenhum dos dois JSONs** — o FIX-3 a removeu completamente ao introduzir `pantryScanner.analyzingStep1/2/3` (confirmadas em uso ativo na Tarefa 2.3, via `ANALYZING_STEP_KEYS` em `PantryScannerScreen.tsx:66-70`). Sem resíduo — não é uma chave morta pendente, é uma remoção já completa e limpa.

### Verificação específica pedida no prompt: chaves de checkpoints de Fase 1/2 renomeadas

Achado real equivalente encontrado durante a varredura: **`onboarding.welcome.*`, `onboarding.profile.*` e `onboarding.targets.*` correspondem a telas de onboarding que não existem mais no fluxo atual.** O diretório `apps/mobile/src/screens/onboarding/` hoje só contém 4 telas: `OnboardingBodyScreen.tsx`, `OnboardingGoalScreen.tsx`, `OnboardingModelScreen.tsx`, `OnboardingMacrosScreen.tsx` — não há tela de "welcome" (boas-vindas) nem uma etapa separada de "profile" (nome/e-mail) ou "targets" (metas) que usasse essas chaves. Diferente do padrão de "duplicação de namespace" (mesma tela, duas chaves), este é conteúdo de **etapas inteiras do onboarding removidas do fluxo** cuja tradução nunca foi limpa dos JSONs — exatamente o padrão "checkpoint anterior renomeado/removido em refactoring" citado no prompt.

### Verificação específica pedida no prompt: chaves de erro de API descontinuadas/renomeadas

Cross-referenciei os 26 candidatos `errors.*` classificados como "possivelmente dinâmicos" contra os códigos de erro **realmente emitidos hoje pelo backend** (`grep -rhn "code: '" apps/api/src/`, 36 códigos únicos encontrados, normalizados do mesmo jeito que `getApiErrorTranslationKey` normaliza: `.toLowerCase().replace(/[/-]/g, '_')`):

| Situação | Chaves |
|---|---|
| Código de backend real bate com a chave — **em uso confirmado** | `errors.auth_email_already_exists`, `auth_invalid_credentials`, `auth_reset_token_invalid`, `auth_session_expired`, `auth_session_revoked`, `auth_unauthorized`, `favorites_forbidden`, `favorites_invalid_data`, `favorites_not_found`, `profilephoto_invalid_content`, `pulseai_invalid_message`, `purchases_system_unavailable`, `resource_not_found`, `scanner_invalid_content`, `scanner_invalid_image`, `scanner_monthly_limit_reached`, `scanner_vision_parse_error`, `scanner_vision_unavailable`, `supplement_log_not_found`, `supplement_not_found` (20 chaves) |
| Chave existe no JSON, mas **nenhum código de backend atual gera esse literal** — órfã confirmada | `errors.auth.email_not_verified`, `auth.google_cancelled`, `auth.invalid_state`, `auth_otp_expired`, `auth_otp_invalid`, `auth_otp_max_attempts`, `auth_too_many_registrations`, `auth_too_many_requests`, `blend_sync_failed_generic`, `blend_sync_failed_named`, `macros_inconsistent`, `not_found` (genérica, nunca emitida como código literal `not-found` sozinho) (12 chaves) |
| **Já confirmada morta por casing** (Tarefa 2) | `errors.shoppinglist_free_tier_limit` — o código real do backend é `shoppingList/free-tier-limit` (`apps/api/src/controllers/shoppingList.controller.ts:76`); o mapa específico do mobile (`shoppingList.service.ts:65-67`) intercepta esse código antes do fallback genérico e sempre retorna a variante camelCase `errors.shoppingList_free_tier_limit` — a variante lowercase nunca é alcançada na prática |
| **Achado adicional (fora do pedido original, mas descoberto no cruzamento)** — códigos de backend **sem** chave de tradução correspondente nos JSONs | `conversations/forbidden`, `conversations/invalid-id`, `conversations/not-found`, `favorites/invalid-id`, `profilePhoto/file-too-large`, `profilePhoto/not-found`, `purchases/invalid-receipt`, `purchases/provider-error`, `shoppingList/forbidden`, `shoppingList/invalid-id`, `shoppingList/item-not-found`, `shoppingList/not-found`, `weeklyReport/not-found` — se qualquer um desses erros ocorrer, `getApiErrorTranslationKey` monta uma chave que **não existe no JSON**, e a UI mostraria o literal da chave (mesmo padrão do achado da Tarefa 2, só que aqui descoberto pelo código de erro em vez de pela chamada `t()`). `webhooks/*` foi descartado por ser erro servidor-a-servidor, nunca exibido em UI mobile. **Nota de escopo:** uma auditoria completa de todo o contrato de erros da API está fora do escopo deste diagnóstico (focado em i18n mobile) — documentado aqui como achado colateral, recomendo tarefa dedicada. |

### As 249 chaves órfãs, agrupadas por namespace

| Namespace | Qtde | Classificação | Nota |
|---|---|---|---|
| `profile.*` | 60 | **Definitivamente morta — namespace legado inteiro** | `profile.badges.*` (40), `profile.edit.*` (8), `profile.fields.*` (2), `profile.imperial`/`profile.metric` (2), `profile.subscription.*` (4), `profile.title` (1), `profile.badges.requirements.*_one/_other` (12, incluído nos 40 acima) — tudo substituído por `me.badges.*`, `me.edit.*`, `me.metric`/`me.imperial`, confirmados em uso ativo nas Tarefas 2 e 4. Provável remanescente de uma tela "Profile" renomeada para "Me" (`MeScreen.tsx`) sem limpeza dos JSONs. |
| `onboarding.*` (variantes) | 40 | **Mista** — ver detalhamento abaixo | `onboarding.goal.*`/`onboarding.model.{lite,pro_plus,steel}.description`/`.title`/`.subtitle` (12): namespace aninhado duplicado, superseded pelas chaves flat (`onboarding.goalMuscle`, `onboarding.modelLiteDesc` etc., confirmadas em uso). **Atenção:** `onboarding.model.lite.name`/`pro_plus.name`/`steel.name` (irmãos dessas chaves mortas, mesma árvore) **estão vivos** — é uma árvore mista, não pode ser apagada em bloco sem checar cada folha. `onboarding.profile.*`/`onboarding.targets.*`/`onboarding.welcome.*` (22) + `onboarding.heightPlaceholder`/`weightPlaceholder` (2): telas/etapas de onboarding removidas do fluxo atual (ver seção dedicada acima) ou chaves bare superseded pelas variantes `*Imperial`/`*Metric`. |
| `home.*` (variantes) | 21 | **Definitivamente morta — duplicação + feature removida** | `home.greeting.{morning,afternoon,evening}` (3, dup aninhado de `home.greeting_*`, vivo); `home.rings.*` (4), `home.streak.*` (3), `home.days` (1) — sem equivalente vivo localizado, possível tela/widget de anéis de progresso removido; `home.protocols.*` (5) e `home.recipe_of_day.*` (2) — feature "protocolos"/nomenclatura antiga da receita do dia, superseded por `DailyRecipeCard.tsx` com chaves `home.goalMuscleRecipe` etc.; `home.waterAdded`/`waterLoggedMl`/`waterLoggedFlOz` (3) — sem call site localizado (ver nota de pendência abaixo). |
| `shoppingLists.*` | 20 | **Definitivamente morta — namespace duplicado (plural vs. singular)** | Namespace inteiro (`shoppingLists`, plural) sem nenhuma referência no código; o app usa exclusivamente `shoppingList.*` (singular) em todas as telas de lista de compras, confirmado nas Tarefas 2 e 4. |
| `missions.*` (sufixo Title/Desc) | 18 | **Definitivamente morta — duplicação de conteúdo (flat vs. aninhado)** | Cada uma tem uma irmã aninhada idêntica em conteúdo (ex: `missions.makeBlendTitle` = `missions.makeBlend.title`, mesmo texto em pt-BR e en) — a versão aninhada é a usada (`missionDefinitions.ts` no backend, consumida via `mission.titleKey`, confirmada na Tarefa 2.3); a versão flat/sufixada é resíduo pré-refactor. |
| `recipes.*` | 15 | **Definitivamente morta — tela/feature "recipes" nunca conectada ou removida** | `recipes.filters.*`, `recipes.favorites.*` (dup. de `favorites.title`, vivo), `recipes.ai.*` (mensagens de loading numeradas e placeholder — mesmo padrão do `pantryScanner.analyzingStep1/2/3`, mas nunca implementado na tela de geração de receita), `recipes.substitutes.*`. |
| `blend.*` (subset) | 15 | **Definitivamente morta — fluxo de blend anterior** | `blend.clean_reminder.*` (3), `blend.feedback.*` (3), `blend.timer.*` (3, aninhado), `blend.models.*` (3, nome de modelo durante o blend — sem call site em `BlendScreen.tsx`), `blend.adjustTimer`, `blend.freeMode`, `blend.timerDuration` (já identificada na Tarefa 4). |
| `track.*` (subset) | 12 | **Individual, dentro de namespace majoritariamente vivo** | `track.manage` (dup. de `track.manageStack`, vivo — risco de homonímia validado acima), `track.cancel`, `track.allDone`, `track.history.*` (2), `track.share_card.*` (3, dup. do `share.*` de nível superior, que é o realmente usado por `ShareFormatSheet.tsx`), `track.supplements.*` (4, nomenclatura antiga — tela atual usa outras chaves para o stack de suplementos). |
| `notifications.*` (nível superior) | 12 | **Definitivamente morta — namespace duplicado** | Já conectado ao achado da Tarefa 2 (`notifications.channelName`/`dailyPulsePrompt` deveriam ser `me.notifications.*`). As outras 10 (`dailyPulseTitle`, `daily_pulse.*`, `streak.*`, `levelUpTitle`/`levelUpBody`, `hydrationReminderTitle`, `streakReminderTitle`, `supplementReminderTitle`) não têm nenhum call site nem no mobile nem no backend — conteúdo de push notification (título/corpo) que não parece ser gerenciado por i18n em lugar nenhum do código atual. |
| `common.*` (subset) | 12 | **Individual, dentro de namespace majoritariamente vivo** | `common.actions.{confirm,continue,done,edit,remove}` (5 de 11 ações do namespace — as outras 6 confirmadas vivas na Tarefa 1), `common.macros.fat` (irmã de `common.macros.protein/carbs/calories`, também sem uso — ver nota), `common.states.{empty,offline}`, `common.units.{grams_long,kilocalories_long,milliliters,milliliters_long}`. |
| `me.*` (subset) | 8 | **Individual, dentro de namespace majoritariamente vivo** | `me.levelProgress`, `me.notifications.channelName`/`dailyPulsePrompt` (já cobertas na Tarefa 2 — chave certa, código com bug de namespace), `me.upgrade.*` (5 — dup. de `me.upgradeScreen.*`, que é o namespace confirmado em uso na tela de upgrade). |
| `favorites.*` (subset) | 5 | **Individual, dentro de namespace majoritariamente vivo** | `favorites.addError/addSuccess/alreadySaved/removeError/removeSuccess` — mensagens de toast para adicionar/remover favorito que não têm call site; `favorites.title` (usado em `FavoritesListScreen.tsx:235`) confirma que o namespace em si está vivo, só essas 5 mensagens de feedback não são usadas (possível uso de mensagem genérica em vez de específica). |
| `gamification.*` | 4 | **Definitivamente morta** | `levelUpSubtitle`, `pendingLevelUp`, `shareCard.cta`, `shareCard.unlocked` — sem call site; o compartilhamento de nível usa `AchievementShareCard.tsx`, que não referencia este namespace. |
| `auth.*` (subset) | 4 | **Individual, dentro de namespace majoritariamente vivo** | `createAccount`, `forgotPasswordSuccess`, `passwordsDoNotMatch`, `termsPrefix` — sem call site nas telas de auth atuais. |
| `shoppingList.*` (subset) | 1 | **Individual** | `shoppingList.upgradeTitle` — sem call site (a tela de upgrade usa `me.upgradeScreen.*`, confirmado vivo). |
| `share.*` (subset) | 1 | **Individual** | `share.shareAchievement` — sem call site; o botão de compartilhar conquista provavelmente usa outra chave (não localizada nesta varredura). |
| `pantryScanner.*` (subset) | 1 | **Individual** | `pantryScanner.proUnlimited` — sem call site direto; a Tarefa 1 já confirmou que a lógica de "scans ilimitados para Pro" nas duas telas (`PantryScannerScreen.tsx:399`, `PulseAIScreen.tsx:548`) é feita condicionalmente sem esta chave específica. |

**Nota de pendência (herdada da Tarefa 4):** `home.waterAdded`, `home.waterLoggedMl`, `home.waterLoggedFlOz` permanecem sem call site localizado após a Tarefa 5 também — tratadas aqui como candidatas a órfã (namespace `home.*` já majoritariamente morto), mas caso o FIX-6 encontre uso real na tela de hidratação por um caminho não coberto por este método (ex: biblioteca de terceiros que injeta a chave via config), validar antes de remover.

### Resumo da Tarefa 5

| Categoria | Quantidade |
|---|---|
| Chaves referenciadas literalmente no código | 540 |
| Chaves vivas via pluralização de uma chave-base referenciada (correção pós-processamento) | 16 |
| Chaves dinâmicas confirmadas em uso (`pulseAi.goals.*`, 32 combinações — Tarefa 2) | 32 |
| Chaves `errors.*` confirmadas em uso via código de backend real | 20 |
| Chaves `errors.*` sem código de backend correspondente hoje (órfãs) | 12 + 1 (casing) = 13 |
| **Total de chaves definitivamente órfãs** | **249** |
| Achado colateral fora do escopo original: códigos de erro do backend sem chave de tradução | 13 códigos (ver tabela acima) |

**249 das 863 chaves (≈29%) são código morto nos arquivos de tradução.** A esmagadora maioria (≈85% das 249) se agrupa em **9 árvores de namespace inteiras ou quase inteiras**, todas com a mesma causa raiz: renomeação de namespace sem limpeza da versão antiga (`profile.*`→`me.*`, `shoppingLists.*`→`shoppingList.*`, `missions.*` flat→aninhado, `notifications.*`→`me.notifications.*`, `home.greeting.*`→`home.greeting_*`) ou telas/features inteiras removidas cujo conteúdo de tradução nunca foi limpo (`onboarding.welcome/profile/targets`, `home.protocols`, `blend.clean_reminder/feedback/timer`, `recipes.*`, `gamification.*`).

---

## Tarefa 6 — Formatação de números, datas e unidades: auditoria de centralização

### PARTE A — Inventário de utilitários de formatação existentes

```
$ find apps/mobile/src -name "*format*" -o -name "*formatter*" -o -name "*util*" | grep -v node_modules
apps/mobile/src/utils
apps/mobile/src/utils/error.utils.ts
apps/mobile/src/utils/xp.utils.ts
apps/mobile/src/utils/shareCard.utils.ts
apps/mobile/src/utils/historyRange.utils.ts
apps/mobile/src/utils/badges.utils.ts
apps/mobile/src/utils/shoppingListAddItems.utils.ts
apps/mobile/src/utils/shoppingListSync.utils.ts
apps/mobile/src/utils/pendingBlends.utils.ts
apps/mobile/src/utils/pricing.utils.ts
apps/mobile/src/utils/toast.utils.tsx
apps/mobile/src/utils/reconnectSync.utils.ts
apps/mobile/src/hooks/useDateFormat.ts
apps/mobile/src/components/shareCards/ShareFormatSheet.tsx  ← falso positivo (nome contém "Format", mas é um bottom-sheet de UI para escolher formato de compartilhamento — story/feed — não formata dado nenhum)

$ grep -rn "Intl\.NumberFormat\|Intl\.DateTimeFormat\|toLocaleString\|toLocaleDateString\|toLocaleTimeString" --include="*.ts" --include="*.tsx" apps/mobile/src/
(23 ocorrências — listadas por arquivo abaixo)
```

**Existem dois utilitários centralizados reais, mas nenhum terceiro para números "crus":**

| Utilitário | Arquivo | Cobre |
|---|---|---|
| `useDateFormat()` | `hooks/useDateFormat.ts` | **Datas/horários.** `formatDate`, `formatWeekdayShort`, `formatShortDate`, `formatTime`, `formatRelative` (não usada — ver Parte C), `isSameLocalDay`. Locale-aware (mapeia `'en'→'en-US'`, `'pt-BR'→'pt-BR'` via `toIntlLocale()`) e timezone-aware (lê `user.timezone` do `useAuthStore`, cai para o timezone do dispositivo sem sessão). |
| `useUnits()` | `hooks/useUnits.ts` | **Peso/altura/volume com conversão de sistema de unidades.** `displayWeight`, `displayHeight`, `displayVolume`, `displayHydration` — lê `unitSystem` do `useAuthStore`, converte kg↔lbs, cm↔ft/in, ml↔fl oz. |
| — nenhum — | — | **Números "crus" (calorias, XP, contadores, percentuais) e conversão de moeda.** Não existe um `useNumberFormat()`/`formatNumber()` central. `pricing.utils.ts` tem `formatUsdCurrency(locale, value)` (só para preço USD da assinatura), mas nada para calorias/XP/contadores — cada tela formata por conta própria (detalhado na Parte B). |

**Conclusão da Parte A:** datas e unidades de medida (peso/altura/volume) TÊM utilitário central. **Números genéricos exibidos ao usuário (calorias, XP, contadores, percentuais) NÃO têm.**

---

### PARTE B — Formatação de números

```
$ grep -rn "\.toString()\|String(\|\.toFixed(\|\.toLocaleString(" --include="*.tsx" --include="*.ts" apps/mobile/src/
(97 ocorrências totais — triadas abaixo; a maioria é uso interno não visível ao usuário: IDs (Date.now().toString()), timestamps ISO (toISOString()), storage keys, error serialization. As ocorrências visíveis ao usuário estão na tabela.)
```

| # | Arquivo:linha | Variável/valor | Tipo | Classificação | Formato correto pt-BR / en |
|---|---|---|---|---|---|
| 1 | `MeScreen.tsx:1239` | `levelInfo.xpToNextLevel.toLocaleString()` | XP | **Sem locale (usa default do runtime, não o locale do app)** | `.toLocaleString('pt-BR')`/`'en-US'` — hoje mostra separador de milhar sempre no estilo do runtime (tipicamente `en-US`), então um usuário pt-BR vê "1,500" em vez de "1.500" |
| 2 | `LevelDetailSheet.tsx:36-38` (`formatXP`) | `value.toLocaleString()` | XP (total e faixa do nível) | **Mesmo bug, implementação duplicada e independente** | Idêntico ao #1 — segunda cópia da mesma falha |
| 3 | `MeScreen.tsx:1185,1192,1201,1208` | `currentStreak`, `blendCount`, `longestStreak`, `level` | Contadores (dias, nº de blends, nível) | Sem separador de milhar (`String()` puro) | Baixo impacto na prática (streak/nível dificilmente passam de 3 dígitos), mas `blendCount` de um usuário antigo pode passar de 1000 sem separador |
| 4 | `MeScreen.tsx:1298,1305,1312` | `dailyProteinTarget`/`dailyCarbTarget` + `"g"`, `dailyCalorieTarget` + `" kcal"` | Metas de macro (gramas/kcal) | Sem separador; **unidade hardcoded** (`"g"`/`" kcal"` em vez de `t('common.units.grams'/'kilocalories')`, que já existe e é usado em 6+ outros arquivos — ver tabela dedicada abaixo) | `dailyCalorieTarget` pode ser 4 dígitos (ex: 2500) sem separador |
| 5 | `HistoryScreen.tsx:299,305` | `totalCalories.toFixed(0)`, `bestDayCalories.toFixed(0)` | Total de calorias (semana/mês) | Sem separador de milhar | Total mensal de calorias facilmente passa de 10.000 — deveria mostrar "12.500" (pt-BR) / "12,500" (en), mostra "12500" |
| 6 | `HistoryScreen.tsx:287,390,434` | `blendCount`, `daysGoalReached`, `perfectDays` | Contadores | `String()` puro, sem separador | Baixo impacto (valores pequenos) |
| 7 | `HistoryScreen.tsx:293,428` | `avgProtein.toFixed(0)` + unidade i18n; `(avgAdherence*100).toFixed(0)` + "%" | Proteína média (g), % de aderência | Correto — valores pequenos, sem necessidade de separador; unidade via `t()` (proteína) | Sem achado |
| 8 | `WeeklyShareCard.tsx:123,135,129` | `String(totalBlends)`, `String(currentStreak)`, `${Math.round(averageDailyProtein)}g` | Contadores + macro do card de compartilhamento | Sem separador (baixo impacto); **`g` hardcoded** (mesma inconsistência de unidade do #4) | — |
| 9 | `RecipeShareCard.tsx:55-58` (`formatMacroValue`), `86,92,98,104` | protein/carbs/fat/calories da receita | Macros no card de compartilhamento | `Number.isInteger(v) ? String(v) : v.toFixed(1)` — **decimal sempre com `.`, nunca `,`** (ver achado central abaixo); `g`/`kcal` hardcoded |
| 10 | `FavoriteCard.tsx:53-56`, `RecipeCard.tsx:77-80`, `ActiveRecipeHeader.tsx:50-53`, `GoalRing.tsx:56-59`, `HighlightRecipeCard.tsx:23` | idem — protein/carbs/fat/calories | Macros exibidos em 5 outros componentes | **A mesma função `Number.isInteger(v) ? String(v) : v.toFixed(1)` está duplicada de forma independente em 6 arquivos diferentes** (`RecipeShareCard`, `FavoriteCard`, `RecipeCard`, `ActiveRecipeHeader`, `GoalRing`, `HighlightRecipeCard`) — nenhum importa de um utilitário compartilhado. `useUnits.ts` tem uma 7ª variante quase idêntica (`formatMetricValue`/`formatOneDecimal`) só para volume. | Mesmo achado de decimal: `.` em vez de `,` |
| 11 | `useUnits.ts` (`formatOneDecimal`, todas as `display*`) | peso, altura, volume, hidratação | Unidades convertidas | Usa `.toFixed(1)` — **mesmo problema de separador decimal** (ponto, não vírgula) | "72.5 kg" deveria ser "72,5 kg" em pt-BR |
| 12 | `pricing.utils.ts` (`formatUsdCurrency`) | preço da assinatura Pro (USD) | Moeda | Correto em uso — `Intl.NumberFormat(locale, {style:'currency', currency:'USD'})` — mas `locale` passado é o valor cru (`'en'`/`'pt-BR'`) do `useAppTranslation()`, não normalizado por `toIntlLocale()` como no hook de datas (inconsistência de padrão entre os dois arquivos, sem efeito visível confirmado pois `Intl.NumberFormat('en', ...)` resolve igual a `'en-US'` na prática) | Correto na prática, mas duplica a lógica de mapeamento de locale em vez de reusar `toIntlLocale` |

**🔴 Achado central da Parte B: nenhum número decimal exibido ao usuário no app inteiro usa separador decimal de acordo com o locale.** `toFixed(1)`/`toFixed(0)` do JavaScript sempre retornam `.` como separador decimal, independente do locale — nunca `,`. Busquei por qualquer uso de `Intl.NumberFormat` para exibir um valor decimal (peso, macro, volume) e **não encontrei nenhum** — o único uso de `Intl.NumberFormat` no app inteiro é `pricing.utils.ts` (moeda, que não tem casas decimais visíveis relevantes aqui) e `historyRange.utils.ts`/`getLocalDateKey` (uso interno, não é número decimal). Um usuário pt-BR vê "72.5 kg" em vez de "72,5 kg", "17.5g de proteína" em vez de "17,5g" — em qualquer lugar que exiba um valor não-inteiro (peso/altura no sistema imperial arredondado, volume em fl oz, macros de receita com decimal).

**Ação recomendada:** criar um utilitário central `formatDecimal(value, locale)` usando `Intl.NumberFormat(intlLocale, {minimumFractionDigits: N, maximumFractionDigits: N})` — substituindo as 7 implementações duplicadas de "inteiro ou 1 casa decimal" e as chamadas de `toLocaleString()` sem locale para XP/contadores grandes. Estender ou criar ao lado de `useUnits`/`useDateFormat`, reaproveitando o `toIntlLocale()` hoje privado dentro de `useDateFormat.ts` (torná-lo exportado/compartilhado).

---

### PARTE C — Formatação de datas

```
$ grep -rn "new Date\|\.toLocaleDateString\|\.toLocaleTimeString\|\.toISOString\|format(" --include="*.tsx" --include="*.ts" apps/mobile/src/
(mais de 80 ocorrências — a maioria é `new Date()`/`toISOString()` para lógica interna: timestamps de criação, chaves de cache, payload de API. As de exibição ao usuário estão detalhadas abaixo, incluindo os 4 pontos pedidos explicitamente no prompt.)
```

**1. `streakDate` passado para `WeeklyShareCard` (após o FIX-4):**

`WeeklyReportScreen.tsx:230` passa `streakDate: report.weekStartDate` (string `YYYY-MM-DD`) como prop para `WeeklyShareCard`. Dentro do componente (`WeeklyShareCard.tsx:111-117`):

```ts
const streakLabel = useMemo(
  () => streakDate === undefined
    ? t('me.currentStreak')
    : t('weeklyReport.streakAsOf', { date: formatDate(streakDate) }),
  [formatDate, streakDate, t],
);
```

`formatDate` vem do `useDateFormat()` centralizado (`WeeklyShareCard.tsx:105`) — **correto e locale-aware**. Resultado: `dateStyle: 'long'` → pt-BR: **"Streak em 22 de abril de 2026"**; en: **"Streak as of April 22, 2026"**. Sem achado — este é o caminho corretamente centralizado.

**2. Datas do relatório semanal (`weekStartDate`, `weekEndDate`) na `WeeklyReportScreen`:**

Não são exibidas diretamente na tela como texto solto — são repassadas para `WeeklyShareCard` como `weekStart`/`weekEnd` (`WeeklyReportScreen.tsx:225-226`) e formatadas lá por `formatWeekRange()` (`WeeklyShareCard.tsx:52-88`), que usa `formatDate` do hook central e depois faz **pós-processamento com regex** para condensar o intervalo (ex: "22 de abril — 28 de abril" → se mesmo mês, "22 — 28 de abril"). Essa regex (`/^(\d{1,2}) de (.+?)(?: de \d{4})?$/i` para pt-BR, `/^(.+?) (\d{1,2})(?:, \d{4})?$/i` para en) **depende do formato textual exato que `Intl.DateTimeFormat(..., {dateStyle:'long'})` retorna** — funciona hoje, mas é frágil: qualquer mudança de comportamento do ICU entre versões de runtime (Hermes) poderia quebrar o match e cair no fallback (`${startLabel} — ${endLabel}`, sem condensar) silenciosamente. Não é um bug hoje (fallback é seguro, só menos elegante), mas é uma dependência implícita de string-parsing sobre a saída do Intl — frágil o suficiente para documentar.

**3. Histórico de blends e hidratação — rótulos de dia da semana nos gráficos:**

`formatWeekdayShort(item.date)` é usado em `MacroBarChart.tsx:227`, `HydrationBarChart.tsx:217`, `HydrationSection.tsx:372`, todos via `useDateFormat()` — **centralizado**. Implementação (`useDateFormat.ts:304-307`):

```ts
function formatWeekdayShort(value) {
  const formatted = weekdayFormatter.format(toDate(value, timezone)).replace('.', '');
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}
```

`Intl.DateTimeFormat(intlLocale, {weekday:'short'})` retorna, por padrão do ICU: pt-BR → "seg.", "ter.", "qua." (com ponto abreviador); en-US → "Mon", "Tue" (sem ponto). O `.replace('.', '')` remove o ponto do pt-BR e a capitalização manual garante "Seg"/"Ter" em vez de "seg"/"ter" (Intl retorna minúsculo em pt-BR). **Correto e deliberado** — funciona nos dois locales sem achado.

**4. Timestamps de conversas do Pulse AI na `ConversationHistoryScreen`:**

```ts
const { formatTime } = useDateFormat();
if (item.daysAgo <= 0) relativeTime = t('common.daysAgoToday', { time: formatTime(item.createdAt) });
else if (item.daysAgo === 1) relativeTime = t('common.daysAgoYesterday');
else relativeTime = t('common.daysAgoN', { days: item.daysAgo });
```

`formatTime` vem do hook central (locale-aware: 12h AM/PM para en, 24h para pt-BR). `item.daysAgo` é computado no **backend**, já timezone-corrigido (achado documentado anteriormente no CP3.3 Tarefa 4). O rótulo "hoje/ontem/N dias atrás" vem de chaves i18n reais (`common.daysAgoToday/Yesterday/N`) — **corretamente centralizado e traduzido**.

**🟡 Achado da Parte C: duas implementações paralelas e divergentes de "data relativa" (hoje/ontem/N dias atrás) coexistem no código.** A que `ConversationHistoryScreen` realmente usa (acima) é 100% i18n via JSON. Mas o hook "central" `useDateFormat()` também expõe uma função **`formatRelative`** com a mesma finalidade (`useDateFormat.ts:317-346`) que **hardcoda os textos "Today"/"Hoje"/"Yesterday"/"Ontem" diretamente no código-fonte do hook**, fora do pipeline i18n:

```ts
if (dateKey === todayKey) return locale === 'en' ? 'Today' : 'Hoje';
if (dateKey === yesterdayKey) return locale === 'en' ? 'Yesterday' : 'Ontem';
```

Isso é uma string hardcoded que a varredura da Tarefa 1 não pegou por estar dentro de `hooks/`, fora do escopo `screens/`+`components/` pedido pelo prompt. **Mitigante:** busquei todos os call sites de `formatRelative` no app e **nenhum componente ou tela chama essa função** — é código morto dentro do hook central (nunca importado/usado). Baixo risco imediato, mas é uma armadilha: qualquer desenvolvedor futuro que veja "hook central de data, tem uma função pronta pra 'relativo'" e a use, reintroduziria texto hardcoded não-i18n. Recomendação: remover `formatRelative`/`formatRelativeFallback` do hook (dead code, consistente com a Tarefa 5) ou reescrevê-la para usar `t('common.daysAgoToday'/'daysAgoYesterday'/'daysAgoN')`, alinhando com o padrão já usado em `ConversationHistoryScreen`.

**Demais achados da Parte C — bypass do hook central para formatação interna (não-visível, correto):** `historyRange.utils.ts`, `HydrationSection.tsx:75-82` (`getLocalDateKey`), `TrackScreen.tsx:80-87` (`getLocalDateKey`), `MeScreen.tsx:342-351` (`getLocalDateKey`) — todos reimplementam a mesma lógica de "chave de data local YYYY-MM-DD" com `Intl.DateTimeFormat('en-CA', ...)` de forma **independente e duplicada em 4 arquivos**, mas para uso **interno** (comparação de datas, range de query, cache key) — nunca renderizado ao usuário, portanto fora do critério de "formatação visível" desta tarefa, porém é a mesma duplicação de lógica já vista na Parte B (4 cópias de uma função idêntica de ~15 linhas, incluindo a versão já existente dentro do próprio `useDateFormat.ts` como `getLocalDateKey` privada — a 5ª cópia). Vale como achado de reuso/DRY para o FIX-6, mesmo sem impacto direto no usuário.

**🟡 Achado adicional — `formatMemberSince` (`MeScreen.tsx:335-340`) bypassa o hook central e ignora timezone:**

```ts
function formatMemberSince(createdAt: string, locale: string): string {
  return new Date(createdAt).toLocaleDateString(locale, { month: "long", year: "numeric" });
}
```

Chamada em `MeScreen.tsx:579` com o `locale` cru (`'en'`/`'pt-BR'`, não mapeado por `toIntlLocale`) e **sem nenhum parâmetro `timeZone`** — usa o timezone padrão do runtime do dispositivo, não o `user.timezone` persistido que todo o resto do app usa (via `useDateFormat`). Para um usuário perto da virada do dia/mês (ex: criou a conta 31/mar 23h50 em UTC-3, mas o dispositivo está configurado num timezone diferente do salvo no perfil), o mês exibido em "Membro desde" pode divergir do que o backend registrou. Correção recomendada: usar `useDateFormat()` (estendendo o hook com uma variante `month+year`, já que hoje só expõe `dateStyle:'long'` completo) em vez de reimplementar.

---

### PARTE D — Formatação de unidades e sistema de unidades

**Campo `unitSystem`:** confirmado em `AuthUser['unitSystem']` (usado como tipo em `useUnits.ts:4`), aceita `'metric' | 'imperial'` (2 valores).

```
$ grep -rn "unitSystem" --include="*.ts" --include="*.tsx" apps/mobile/src/
(47 ocorrências)
```

Já documentado na Parte A: `useUnits()` é o conversor central — **existe e é usado de forma consistente**. Ocorrências de `unitSystem` fora do hook são majoritariamente: (a) leitura do valor para exibir/editar no perfil (`MeScreen.tsx`, `EditSettingSheet.tsx` — `t('me.metric')`/`t('me.imperial')`, já confirmado correto na Tarefa 4), (b) passagem do valor para `useUnits(unitSystemOverride)` em componentes que recebem um perfil diferente do usuário logado (ex: card de compartilhamento), (c) `onboarding.weightPlaceholderImperial/Metric` (Tarefa 1/2, correto).

**Especificações dos blenders (LITE/PRO+ = 400ml/17.5oz, STEEL = 600ml/21oz) citadas no contexto do diagnóstico:**

```
$ grep -rn "400ml\|17.5oz\|600ml\|21oz\|capacityMl\|BLENDER_CAPACITY" apps/mobile/src/ apps/api/src/ packages/shared/src/
(0 resultados)
```

**Essas especificações não aparecem em nenhuma tela do app hoje.** Busquei exaustivamente por qualquer variação de capacidade (400/600 ml/oz, nomes de constante prováveis) em mobile, API e pacote compartilhado — zero ocorrências. A única informação de modelo exibida ao usuário é wattagem, em `OnboardingModelScreen.tsx:25-27` (`MODELS`, badges "Starter"/"120W"/"180W") — e, achado colateral fora do escopo direto desta tarefa (registrado também na Tarefa 8): **a wattagem do badge diverge da wattagem mencionada no texto de descrição da mesma tela** — badge mostra "120W" (Pro+)/"180W" (Steel), mas `onboarding.modelProDesc`/`modelSteelDesc` dizem "900W"/"1400W" (`pt-BR.json:125-127`, `en.json:125-127`; Lite: badge "Starter" vs. descrição "500W"). Como a pergunta específica desta tarefa era "essas specs de capacidade aparecem em alguma tela, e como", a resposta correta é: **não aparecem — não há achado de formatação a corrigir aqui porque o dado simplesmente não é exibido**, mas fica registrado que a wattagem que É exibida já está inconsistente entre dois pontos da mesma tela.

**Conversor centralizado ml↔oz / g↔oz / kcal↔cal:**

`useUnits.ts` cobre ml→fl oz (`MILLILITERS_PER_FLUID_OUNCE = 29.574`) e kg→lbs, cm→ft/in — **não existe conversão de g→oz nem kcal→cal em nenhum lugar do código** (`grep -rn "OUNCES_PER_GRAM\|CALORIES_PER\|kcal.*cal\b"` não retornou nada). Isso é consistente, porém, com o fato de que a UI nunca exibe massa de macro em onças nem calorias em "cal" (unidade não-métrica de calorias) — o app usa kcal universalmente para energia e sempre grama para macro, independente do `unitSystem` (confirmado: `common.units.grams`/`kilocalories` são usadas sem condicional de `unitSystem` em todos os 9+ call sites já listados na Parte B). **Isso é uma decisão de produto implícita e consistente** (proteína/carbo/gordura sempre em g, energia sempre em kcal, só peso/altura/volume respeitam `unitSystem`) — não um bug, mas vale documentar explicitamente que não é universal: só peso corporal, altura e volume de líquido seguem `unitSystem`; macros e calorias não.

---

### PARTE E — Locale ativo no momento da formatação

```
$ grep -rn "i18n\.language\|useTranslation\|getLocale\|currentLanguage" --include="*.tsx" --include="*.ts" apps/mobile/src/config/
(0 resultados)
$ grep -rn "i18n\.language\|useTranslation\|getLocale\|currentLanguage" --include="*.tsx" --include="*.ts" apps/mobile/src/utils/
(0 resultados)
```

**Os diretórios sugeridos pelo prompt (`config/`, `utils/`) não são onde a resolução de locale realmente vive** — está em `apps/mobile/src/locales/i18n.ts` (a inicialização do i18next em si). Resumo do fluxo real:

1. `resolveInitialLanguage()` (`i18n.ts:46-61`) decide o idioma ativo na ordem: preferência salva no MMKV → idioma do dispositivo (`expo-localization`, `getLocales()[0].languageTag`, com `pt-*` mapeado para `pt-BR`) → fallback `'en'`. Só existem 2 valores possíveis: `'en'` | `'pt-BR'` (`SupportedLocale`).
2. `useAppTranslation()` expõe esse valor como `locale` (é literalmente `i18n.language`, tipado como `SupportedLocale`).
3. **Quando uma função usa `Intl.NumberFormat`/`Intl.DateTimeFormat`/`toLocaleString`, qual locale é passado?** Depende do call site:
   - `useDateFormat()` — **correto**: mapeia via `toIntlLocale()` privado (`'en'→'en-US'`, `'pt-BR'→'pt-BR'`) antes de passar para qualquer `Intl.DateTimeFormat`.
   - `pricing.utils.ts` (`formatUsdCurrency`) — passa o `locale` **cru** ('en'/'pt-BR'), sem o mapeamento `toIntlLocale`. Funciona na prática (Intl aceita tag de idioma sem região), mas duplica uma decisão de mapeamento que já existe em outro arquivo.
   - `MeScreen.tsx` (`formatMemberSince`) — mesma coisa, `locale` cru.
   - `MeScreen.tsx:1239`, `LevelDetailSheet.tsx:37` (`.toLocaleString()` para XP) — **nenhum locale é passado**, cai no locale **padrão do runtime** (Hermes/JSC), não necessariamente `en-US` nem o locale do i18n ativo — esse é o achado mais sério da Parte E, já detalhado na Parte B (#1, #2).
   - Todo `toFixed()` (macros, peso, volume) — **não é uma função locale-aware**, `Intl` nunca entra em jogo, resultado é sempre com `.` decimal independente do locale, também já coberto na Parte B.

**Conclusão da Parte E:** existe exatamente **um** mapeador locale→BCP-47 correto no app (`toIntlLocale` dentro de `useDateFormat.ts`), não compartilhado; 2 pontos duplicam essa lógica de forma equivalente (`formatUsdCurrency`, `formatMemberSince`); e 2 pontos (`toLocaleString()` de XP) **não aplicam locale nenhum**, dependendo do ambiente de execução do dispositivo — o único achado desta parte com risco real de exibir formato errado para o usuário pt-BR.

---

### Resumo da Tarefa 6

| Achado | Severidade | Onde |
|---|---|---|
| `toLocaleString()` sem locale para XP (2 implementações duplicadas) | 🟡 Média | `MeScreen.tsx:1239`, `LevelDetailSheet.tsx:36-38` |
| Nenhum número decimal usa separador `,` para pt-BR — `toFixed()` sempre usa `.` (7+ implementações duplicadas da mesma função "inteiro ou 1 decimal") | 🟡 Média (sistêmico, alta abrangência) | `useUnits.ts`, `RecipeShareCard`, `FavoriteCard`, `RecipeCard`, `ActiveRecipeHeader`, `GoalRing`, `HighlightRecipeCard` |
| Contadores/calorias grandes sem separador de milhar | 🟢 Baixa | `HistoryScreen.tsx` (totais), `MeScreen.tsx` (metas) |
| Unidade "g"/"kcal" hardcoded em vez de `t('common.units.*')` (que já existe e é usado em outros 9+ pontos) | 🟢 Baixa | `MeScreen.tsx:1298,1305,1312`, `WeeklyShareCard.tsx:129`, `RecipeShareCard.tsx:86-104` |
| `formatMemberSince` bypassa o hook central e não aplica timezone do usuário | 🟡 Média | `MeScreen.tsx:335-340` |
| `formatRelative`/`formatRelativeFallback` no hook central hardcodam "Today/Hoje/Yesterday/Ontem" fora do i18n — código morto, mas armadilha para reuso futuro | 🟢 Baixa (mitigado por estar morto) | `useDateFormat.ts:137-151,317-346` |
| `formatWeekRange` depende de parsing de regex sobre a string formatada pelo Intl (frágil, sem bug ativo) | 🟢 Baixa | `WeeklyShareCard.tsx:52-88` |
| 5 implementações duplicadas de "chave de data local YYYY-MM-DD" (`getLocalDateKey`) — uso interno, sem impacto no usuário, mas viola DRY | 🟢 Baixa | `useDateFormat.ts`, `historyRange.utils.ts`, `HydrationSection.tsx`, `TrackScreen.tsx`, `MeScreen.tsx` |
| `toIntlLocale` (mapeamento locale→BCP-47) não é compartilhado — duplicado/ignorado em 2 outros pontos | 🟢 Baixa | `pricing.utils.ts`, `MeScreen.tsx:335` |
| Specs de capacidade dos blenders (400ml/17.5oz, 600ml/21oz) não aparecem em nenhuma tela | Informativo | — |
| Wattagem do badge diverge da wattagem na descrição, mesma tela (achado fora do escopo, ver Tarefa 8) | Informativo | `OnboardingModelScreen.tsx:25-27` + `pt-BR.json`/`en.json:125-127` |

**Ação recomendada consolidada:** criar `utils/numberFormat.utils.ts` (ou estender `useUnits`) com um `formatDecimal(value, locale, {min,max}Digits)` central via `Intl.NumberFormat`, e um `formatCount(value, locale)` para contadores/XP com separador de milhar — substituindo as 7 cópias de macro-formatting e as 2 chamadas soltas de `toLocaleString()`. Exportar `toIntlLocale` de `useDateFormat.ts` para reuso em `pricing.utils.ts` e `MeScreen.tsx`. Estender `useDateFormat` com uma variante `month+year` para substituir `formatMemberSince`, e remover ou corrigir `formatRelative`.

---

## Tarefa 7 — Valores idênticos em ambos os idiomas (tradução ausente)

Script Node.js descartável (`/tmp/i18n-audit-t7.js`, apagado após uso): para cada uma das 863 chaves presentes em ambos os arquivos, comparação `===` (case-sensitive) do valor pt-BR vs. en.

```
Total de chaves em ambos os arquivos: 863
Total de chaves com valor idêntico (case-sensitive): 69
```

Lista completa das 69 (reproduzida integralmente, sem filtro prévio):

```
common.units.grams = "g"                                            navigation.pulseAI = "Pulse AI"
common.units.milliliters = "ml"                                     navigation.blend = "Blend"
common.units.kilocalories = "kcal"                                  onboarding.model.lite.name = "BLENDi Lite"
onboarding.model.pro_plus.name = "BLENDi Pro+"                      onboarding.model.steel.name = "BLENDi Steel"
onboarding.unitSystemImperial = "Imperial (lbs, ft, fl oz)"         home.lastBlend = "Last Blend"
home.waterAdded = "+{{amount}} ml"                                  home.hydrationBar = "{{current}} / {{target}}"
home.freePlan = "Free"                                              home.proPlan = "Pro"
home.dailyRecipeIngredientMuscle1Name = "Whey protein"              home.dailyRecipeIngredientMuscle2Name = "Banana"
home.dailyRecipeIngredientMuscle3Amount = "250ml"                   home.dailyRecipeIngredientWellness2Amount = "200g"
home.dailyRecipeIngredientEnergy1Amount = "40g"                     home.dailyRecipeIngredientEnergy3Amount = "250ml"
home.dailyRecipeIngredientRecovery1Name = "Whey protein"            home.dailyRecipeIngredientRecovery3Amount = "250ml"
blend.timerDuration = "{{seconds}}s"                                blend.models.lite = "Lite · 500W"
blend.models.pro_plus = "Pro+ · 900W"                                blend.models.steel = "Steel · 1400W"
shoppingLists.pendingItem_one = "{{count}} item"                    shoppingList.pendingItem_one = "{{count}} item"
track.title = "Track"                                                track.history.item_label = "{{name}} · {{calories}} kcal"
track.share_card.title = "Share Card"                                profile.badges.bronze = "Bronze"
profile.badges.earlyAdopterTitle = "Early Adopter"                  profile.badges.blendiLiteTitle = "BLENDi Lite"
profile.badges.blendiProPlusTitle = "BLENDi Pro+"                    profile.badges.blendiSteelTitle = "BLENDi Steel"
profile.badges.requirements.blendJourneyBronze_one = "{{count}} blend"      (+ Silver/Gold _one/_other, 6 chaves)
profile.subscription.pro_label = "Pulse Pro"                        profile.subscription.pro_badge = "PRO"
profile.language.en = "English"                                     profile.language.pt_BR = "Português (Brasil)"
profile.imperial = "Imperial (lbs/ft)"                               auth.brandWordmark = "BLENDi"
notifications.levelUpTitle = "Level Up! 🎉"                          gamification.currentXp = "{{xp}} XP total"
share.formatStories = "Stories (9:16)"                               share.formatFeed = "Feed (1:1)"
share.brandName = "BLENDi Pulse"                                     me.imperial = "Imperial"
me.badges.bronze = "Bronze"                                          me.badges.blendiLiteTitle = "BLENDi Lite"
me.badges.blendiProPlusTitle = "BLENDi Pro+"                         me.badges.blendiSteelTitle = "BLENDi Steel"
me.badges.requirements.blendJourneyBronze_one = "{{count}} blend"           (+ Silver/Gold _one/_other, 6 chaves)
me.upgradeScreen.badge = "Pro"                                       me.notifications.dailyPulse = "Daily Pulse"
me.notifications.channelName = "BLENDi Pulse"                        weeklyReport.totalBlends = "{{count}} blends"
weeklyReport.totalHydration = "Total {{amount}}"
```

### Classificação (todas as 69 revisadas individualmente)

| Categoria de falso positivo | Qtde | Exemplos | Critério |
|---|---|---|---|
| Nome próprio / marca / termo de produto | 21 | `navigation.pulseAI`, `onboarding.model.*.name` (3), `home.proPlan`, `blend.models.*` (3), `profile.badges.blendi*Title`/`me.badges.blendi*Title` (6), `profile.subscription.pro_label/pro_badge` (2), `auth.brandWordmark`, `share.brandName`, `me.upgradeScreen.badge`, `me.notifications.dailyPulse`, `me.notifications.channelName` | Nome da marca BLENDi/Pulse, nome de modelo de produto, ou nome de feature cunhado pelo produto — não é conteúdo traduzível por definição |
| Símbolo, número puro, ou interpolação sem texto | 16 | `common.units.{grams,milliliters,kilocalories}` (3), `home.waterAdded`, `home.hydrationBar`, `home.dailyRecipeIngredient*Amount` (5), `blend.timerDuration`, `shoppingList(s).pendingItem_one` (2), `track.history.item_label`, `gamification.currentXp`, `weeklyReport.totalHydration` | Só contém `{{var}}`, abreviação de unidade (g/ml/kcal) ou número+unidade sem palavra alguma — nada para traduzir |
| Termo de domínio / cognato / empréstimo estabelecido em todo o app | 22 | `navigation.blend`, `home.dailyRecipeIngredient{Muscle1,Muscle2,Recovery1}Name` ("Whey protein"/"Banana" — cognatos), `onboarding.unitSystemImperial`, `profile.imperial`, `me.imperial`, `profile/me.badges.requirements.blendJourney*_one/_other` (12, "blend" como empréstimo), `weeklyReport.totalBlends`, `share.formatStories`/`formatFeed` (termos técnicos do Instagram) | "Blend" é tratado como termo de domínio não-traduzido consistentemente em **todo** o app (confirmado em dezenas de outras chaves não-idênticas que também mantêm "blend" em pt-BR, ex: descrições de missão "Faça 1 blend hoje"); "Whey protein"/"Banana" são cognatos reais; "Imperial", "Stories", "Feed" são termos técnicos comumente não-traduzidos no domínio fitness/social media brasileiro |
| Convenção de UX — nome de idioma mostrado no próprio idioma | 2 | `profile.language.en` = "English", `profile.language.pt_BR` = "Português (Brasil)" | Padrão de UX deliberado e comum em seletores de idioma: cada nome de idioma é mostrado em sua própria forma nativa (endônimo), não traduzido — para que o usuário reconheça seu idioma mesmo se a UI estiver no idioma errado |
| **Total de falsos positivos** | **61** | | |

### As 8 chaves restantes — avaliadas manualmente

| Chave | Valor idêntico | Está viva? | Veredito |
|---|---|---|---|
| **`track.title`** | `"Track"` | ✅ **Viva** — `TrackScreen.tsx:446`, título do cabeçalho da tela inteira de Track | 🔴 **Tradução genuinamente ausente, alto impacto.** Usuário pt-BR vê o cabeçalho da tela em inglês ("Track") em vez de português. Inconsistente com `navigation.track` (chave irmã, correta: pt-BR "Acompanhar" / en "Track") — a mesma tela tem o rótulo da tab bar traduzido e o título do cabeçalho não. |
| **`home.freePlan`** | `"Free"` | ✅ **Viva** — `HomeScreen.tsx:427`, `MeScreen.tsx:1164`, badge de plano do usuário | 🔴 **Tradução genuinamente ausente.** Deveria ser "Grátis" em pt-BR. Contraste direto com a chave irmã `home.proPlan` = "Pro" (essa sim, corretamente idêntica — "Pro" é nome de marca do tier pago, "Free" é um adjetivo comum, não é marca). |
| **`home.lastBlend`** | `"Last Blend"` | ✅ **Viva** — `QuickActionTrigger.tsx:188`, rótulo do botão de ação rápida na Home | 🔴 **Tradução genuinamente ausente.** Deveria ser algo como "Último Blend" (mantendo "Blend" como termo de domínio, conforme o padrão já estabelecido em todo o resto do app). |
| **`me.badges.bronze`** | `"Bronze"` | ✅ **Viva** — `getStageLabelKey`, `BadgeCard.tsx:65` | 🟡 **Inconsistência dentro do próprio grupo de chaves.** As 3 chaves irmãs no mesmo enum de estágio de badge **estão corretamente traduzidas**: `silver` → "Prata"/"Silver", `gold` → "Ouro"/"Gold", `locked` → "Bloqueado"/"Locked". Só `bronze` ficou idêntica. Impacto visual baixo ("Bronze" é uma palavra válida em português — soa natural mesmo sem tradução), mas é uma inconsistência real dentro do mesmo conjunto de 4 valores, não uma escolha deliberada (as outras 3 provam que o padrão esperado era traduzir). |
| `track.share_card.title` | `"Share Card"` | ❌ Órfã (Tarefa 5 — `track.share_card.*` inteiro sem call site) | 🟢 Gap de conteúdo real, mas sem impacto — chave morta |
| `profile.badges.earlyAdopterTitle` | `"Early Adopter"` | ❌ Órfã (Tarefa 5 — `profile.badges.*` inteiro sem call site, superseded por `me.badges.*`) | 🟢 Gap de conteúdo real, mas sem impacto — chave morta |
| `profile.badges.bronze` | `"Bronze"` | ❌ Órfã (mesma árvore morta `profile.badges.*`) | 🟢 Mesma inconsistência de `me.badges.bronze`, mas na cópia morta — sem impacto |
| `notifications.levelUpTitle` | `"Level Up! 🎉"` | ❌ Órfã (Tarefa 5 — `notifications.*` de nível superior sem call site) | 🟢 Gap de conteúdo real, mas sem impacto — chave morta |

### Resumo da Tarefa 7

- **69 chaves com valor idêntico** entre pt-BR e en.
- **61 falsos positivos** (nomes próprios/marca, símbolos/interpolação pura, termos de domínio estabelecidos como "blend", convenção de UX para nomes de idioma) — revisados individualmente, nenhuma ação necessária.
- **3 traduções genuinamente ausentes em chaves vivas**: `track.title` ("Track" — alto impacto, cabeçalho de tela inteira), `home.freePlan` ("Free" → deveria ser "Grátis"), `home.lastBlend` ("Last Blend" → deveria ser "Último Blend").
- **1 inconsistência menor em chave viva**: `me.badges.bronze` ("Bronze" não traduzido, enquanto os 3 valores irmãos do mesmo enum — silver/gold/locked — estão corretamente traduzidos).
- **4 gaps de conteúdo adicionais** em chaves já confirmadas mortas na Tarefa 5 (`track.share_card.title`, `profile.badges.earlyAdopterTitle`, `profile.badges.bronze`, `notifications.levelUpTitle`) — sem impacto ao usuário hoje, mas se qualquer uma dessas árvores for reaproveitada no futuro (em vez de recriada do zero), o conteúdo em inglês herdado precisaria ser corrigido junto.

---

## Tarefa 8 — Achados fora do escopo explícito

### 8.1 — `accessibilityLabel`/`accessibilityHint` hardcoded sem tradução

Levantei todas as 44 ocorrências de `accessibilityLabel=`/`accessibilityHint=` em `apps/mobile/src/**/*.tsx` e rastreei cada uma até a origem do texto. 42 das 44 resolvem corretamente via `t()` (direto ou por variável já traduzida) ou são dados dinâmicos do usuário (nome de receita, ingrediente — corretamente não-traduzíveis). **2 são strings literais hardcoded, sem passar pelo i18n em nenhum idioma:**

- **`AuthScreenLayout.tsx:57`** — `accessibilityLabel="Go back"`. Este é o layout compartilhado do botão de voltar usado em **todas as telas de autenticação** (Login, Register, ForgotPassword, ResetPassword, VerifyOtp — confirmado via `grep -rln "AuthScreenLayout" apps/mobile/src/screens/auth/`). Um usuário pt-BR usando leitor de tela ouve "Go back" em inglês em vez de "Voltar", em qualquer uma dessas 5 telas. A chave `common.actions.back` já existe e já é usada em 10+ outros botões de voltar no app (`ConversationHistoryScreen`, `PantryScannerScreen`, `WeeklyReportScreen`, `FavoritesListScreen`, `ShoppingListDetailScreen`, `ShoppingListsScreen`, `HistoryScreen`, `OnboardingLayout`, `ImportFromFavoritesSheet`) — correção é trivial, só trocar para `t('common.actions.back')`.
- **`SupplementCheckItem.tsx:163`** — `accessibilityHint="Toque para adicionar uma dose. Segure para desfazer uma dose."`. Direção oposta do achado acima: hardcoded **em português**, sempre, independente do locale ativo. Um usuário com o app em inglês ouve a dica de acessibilidade em português. Não existe chave i18n pronta para reaproveitar aqui — precisaria criar uma nova (ex: `track.supplementCheckHint`).

### 8.2 — Inconsistência de pontuação dentro do namespace `errors.*`

Das 46 mensagens de erro em `errors.*` (o namespace mais homogêneo do app — todo o conteúdo é frase completa de erro, ao contrário de outros namespaces que misturam títulos curtos e mensagens longas, onde essa comparação não seria significativa), **43 terminam com ponto final**, e 3 não:

- `errors.macros_inconsistent` = "Valores nutricionais estimados — macros reais podem variar" (sem ponto)
- `errors.shoppinglist_free_tier_limit` = "O plano gratuito suporta apenas 1 lista ativa" (sem ponto)
- `errors.shoppingList_free_tier_limit` = "O plano gratuito suporta apenas 1 lista ativa" (sem ponto, idêntica à anterior — par já documentado como chave morta por duplicação de casing na Tarefa 2/5)

Mesmo padrão confirmado em `en.json` (as mesmas 3 chaves sem ponto final, as outras 43 com). Inconsistência menor, mas real e sistemática — vale alinhar ao padrão dominante do namespace no FIX-6.

### 8.3 — Valor de chave de tradução que não é conteúdo traduzível (achado atípico)

`gamification.pendingLevelUp` tem como valor, em **ambos** os idiomas:

```
pt-BR: "Chave de documentação interna para o sequenciamento adiado de subida de nível."
en:    "Internal documentation key for deferred level-up sequencing."
```

Isso não é texto de UI — é uma frase que **descreve**, em prosa, um campo de código (`pendingLevelUp` no `gamification.store.ts`, usado internamente para sequenciar a animação de level-up sem relação nenhuma com este JSON). Parece resíduo de uma geração automática de chaves onde uma descrição/comentário de código foi colada como se fosse o valor de tradução, em vez de conteúdo real voltado ao usuário. Sem impacto em produção porque `gamification.*` é um namespace inteiramente órfão (Tarefa 5) — mas é exatamente o tipo de anomalia que passaria despercebida numa revisão superficial do JSON (parece um valor "normal" à primeira vista).

### 8.4 — Conteúdo divergiu entre as cópias das árvores de namespace duplicadas

Ao comparar o texto das chaves nas árvores duplicadas identificadas na Tarefa 5 (`me.badges.*` viva vs. `profile.badges.*` morta), a maioria dos pares é idêntica, mas nem todos:

```
me.badges.blendJourneyDescription      = "Acompanhe seus marcos de blend ao construir sua rotina."
profile.badges.blendJourneyDescription = "Acompanhe seus marcos de blends enquanto constrói sua rotina."

me.badges.streakMasterTitle            = "Mestre do Streak"
profile.badges.streakMasterTitle       = "Mestre da Sequência"

me.badges.earlyAdopterTitle            = "Adotante Inicial"
profile.badges.earlyAdopterTitle       = "Early Adopter"  (não traduzida — já documentado na Tarefa 7)
```

Isso mostra que a árvore morta (`profile.badges.*`) não é simplesmente uma cópia congelada no momento da renomeação — ela recebeu edições próprias em algum momento (redação diferente, "Streak" vs. "Sequência" como tradução de "streak"), depois divergiu de vez quando o código migrou para `me.badges.*`. Confirma que a limpeza recomendada na Tarefa 5 é segura (a árvore morta não é fonte de verdade nem parcialmente), mas é um sinal de que houve trabalho de tradução investido em conteúdo que nunca chegou a ir ao ar.

### 8.5 — Achados já registrados em tarefas anteriores, consolidados aqui por serem fora do escopo estrito de suas tarefas de origem

Estes já constam no corpo do relatório (Tarefas 5 e 6), reafirmados aqui apenas para consolidação, conforme o padrão pedido pela Tarefa 8:

- **Wattagem inconsistente na tela de escolha de modelo** (Tarefa 6, Parte D): o badge mostrado (`OnboardingModelScreen.tsx:25-27`, "Starter"/"120W"/"180W") diverge da wattagem mencionada no texto de descrição da mesma tela (`onboarding.modelLiteDesc/modelProDesc/modelSteelDesc` = "500W"/"900W"/"1400W"). Não é achado de i18n (o mesmo erro existe nos dois idiomas), é inconsistência de dado de produto — fora do escopo de tradução, mas visível na mesma tela.
- **13 códigos de erro emitidos pelo backend sem chave `errors.*` correspondente** (Tarefa 5): `conversations/forbidden`, `conversations/invalid-id`, `conversations/not-found`, `favorites/invalid-id`, `profilePhoto/file-too-large`, `profilePhoto/not-found`, `purchases/invalid-receipt`, `purchases/provider-error`, `shoppingList/forbidden`, `shoppingList/invalid-id`, `shoppingList/item-not-found`, `shoppingList/not-found`, `weeklyReport/not-found`. Fora do escopo direto (é sobre o contrato de erros da API, não sobre os JSONs de tradução em si), mas qualquer um desses erros ocorrendo hoje mostraria a chave literal ao usuário.
- **`formatRelative`/`formatRelativeFallback` no hook central `useDateFormat.ts` hardcodam "Today"/"Hoje"/"Yesterday"/"Ontem" fora do pipeline i18n** (Tarefa 6, Parte C) — a varredura de strings hardcoded da Tarefa 1 foi escopada só para `screens/`+`components/`, então esse achado em `hooks/` não seria pego por ela. Mitigado por a função estar morta (nunca chamada), mas é uma armadilha de reuso.

### Resumo da Tarefa 8

5 achados novos nesta tarefa (8.1–8.4, sendo 8.1 duas ocorrências) + 3 achados de tarefas anteriores consolidados aqui por estarem fora do escopo estrito de suas dimensões de origem. Nenhuma categoria ficou vazia.

---

## Tarefa 9 (adicional, fora do prompt original) — Varredura de nicho: i18n/formatação além do que foi explicitamente pedido

O prompt do DIAG-6 não cobriu preço/moeda de assinatura, URLs de documentos legais, parsing de entrada numérica (direção inversa da formatação), nem ordenação/busca de texto — todos dentro do nicho "i18n e formatação", mas fora das 8 tarefas descritas. Investiguei os quatro.

### 9.1 — 🔴 O paywall nunca usa o preço real e localizado da loja — sempre mostra um preço USD fixo, calculado no app

`purchase.service.ts` **já busca corretamente** o preço real da RevenueCat/App Store/Play Store — `pkg.product.priceString` (`purchase.service.ts:180`, dentro de `toPurchasePlan`), que é a string de preço **localizada pela própria loja** (moeda local, formatação local, taxas already-included — exatamente o dado certo para mostrar antes de uma compra). Essa função é exposta via `getAvailablePurchasePlans()` (`purchase.service.ts:309`) e consumida por `loadPurchasePlans()`/`availablePlans` dentro de `usePulseProPurchase.ts` (linhas 158-177, 223).

**Nenhuma tela usa esse valor.** Rastreei os dois pontos onde preço é exibido ao usuário:

- `UpgradeScreen.tsx:80-106` (tela cheia do paywall) — `plans` é um `useMemo` **separado e desconectado**, que ignora `availablePlans` do hook (nem chega a desestruturar esse campo, `UpgradeScreen.tsx:63`) e em vez disso computa `formatUsdCurrency(locale, PRICING_CONFIG.PRO_MONTHLY_PRICE_USD)` — uma constante numérica fixa em `pricing.config.ts`, só passada por `Intl.NumberFormat(locale, {currency:'USD'})` para formatação cosmética.
- `MeScreen.tsx:598-603` (resumo de upgrade na tela Me) — mesmo padrão, mesma constante, mesma função, **calculado de forma completamente independente pela segunda vez**.

Confirmei que `loadPurchasePlans` (a função que buscaria o preço real) **nunca é chamada em lugar nenhum do app** (`grep -rn "loadPurchasePlans" apps/mobile/src --include="*.tsx"` → 0 resultados) — o pipeline de preço real existe, foi implementado, mas está morto. O `annualSavingsPercent` (`UpgradeScreen.tsx:66-78`, "economize X%") também deriva da mesma constante fixa, propagando o mesmo problema para o texto de desconto.

**Por que isso é um achado de i18n/formatação e não só um bug de produto:** RevenueCat/App Store/Play Store fazem conversão de moeda e ajuste de preço por país automaticamente (um usuário no Brasil paga em BRL, com o valor que a Apple/Google define para aquele mercado — que não é uma conversão direta e fixa do preço em USD). Mostrar "$9.99" formatado com separador brasileiro não resolve isso — o número em si está errado para a maioria dos usuários fora dos EUA. Esse é precisamente o tipo de "formatação de moeda não centralizada" que a Tarefa 6 (Parte B) pediu para mapear, só que o prompt original não citou preço de assinatura como um dos valores a verificar explicitamente (citou calorias, XP, hidratação, aderência) — por isso não apareceu lá.

**Ação recomendada:** trocar `formatUsdCurrency(locale, PRICING_CONFIG.PRO_*_PRICE_USD)` por `availablePlans`/`pkg.product.priceString` (já implementado e funcional, só não conectado) em `UpgradeScreen.tsx` e `MeScreen.tsx`; chamar `loadPurchasePlans()` no mount de ambas as telas. `PRICING_CONFIG.PRO_*_PRICE_USD` deveria virar só um fallback para quando a RevenueCat estiver indisponível, não o caminho principal.

### 9.2 — URLs de Termos de Serviço e Política de Privacidade sem variante de idioma, duplicadas em 2 arquivos

```
UpgradeScreen.tsx:32-33:   TERMS_URL = 'https://blendi.app/terms'; PRIVACY_URL = 'https://blendi.app/privacy';
RegisterScreen.tsx:33-34:  TERMS_URL = 'https://blendi.app/terms'; PRIVACY_URL = 'https://blendi.app/privacy';
```

Duas constantes idênticas declaradas de forma independente em dois arquivos (nenhuma delas importa de um `config/legal.ts` central). Nenhuma das duas URLs varia por idioma — um usuário pt-BR que toca em "Termos de Serviço" (`t('auth.termsOfService')`, corretamente traduzido) é levado para a mesma URL que um usuário en, sem parâmetro de idioma nem path localizado (`/terms` vs. `/pt-BR/terms` ou `?lang=pt-BR`). Não é possível confirmar sem acesso ao site `blendi.app` se a página em si detecta o idioma do navegador ou se só existe em um idioma — mas do lado do app, não há nenhuma tentativa de informar o idioma ativo na URL. Achado de baixo-médio impacto: registrado para verificação (o site pode já resolver isso do lado dele), mas a duplicação da constante em 2 arquivos é, no mínimo, um achado de reuso independente do resultado dessa verificação.

### 9.3 — Verificado e confirmado correto: entrada de número decimal com vírgula (pt-BR)

Achado da Tarefa 6 documentou que toda **exibição** de decimal usa `.` (nunca `,`) — o caminho inverso (o que acontece quando o *usuário digita* um decimal) merece checagem separada, já que um teclado `decimal-pad` em um dispositivo pt-BR mostra "," como tecla decimal, não ".". Verificado em `OnboardingBodyScreen.tsx:117-118` (campos de peso/altura, os únicos inputs decimais do app — protein/carbs/calories em `OnboardingMacrosScreen.tsx` são `parseInt`, inteiros por design):

```ts
const rawWeightNum = parseFloat(weightText.replace(',', '.'));
const rawHeightNum = parseFloat(heightText.replace(',', '.'));
```

**Correto e deliberado** — o app já tolera vírgula como separador decimal na entrada, convertendo para ponto antes do `parseFloat`. Nenhum achado aqui; documentado para constar que a checagem foi feita (o prompt original não cobriu esse ângulo).

### 9.4 — Verificado e confirmado sem achado: ordenação e busca de texto

Busquei todo uso de `.sort()` (`apps/mobile/src/**/*.{ts,tsx}`) e todo padrão de busca/filtro por texto digitado pelo usuário (`.filter(...searchQuery...)`, `.includes(...query...)`) — dois ângulos clássicos de bug de i18n (ordenação alfabética incorreta para acentuação pt-BR com `Array.prototype.sort()` puro; busca sensível a acento que não encontra "açúcar" ao digitar "acucar"). **Nenhum dos dois problemas existe hoje:** todos os 5 usos de `.sort()` no app ordenam por data ISO (`localeCompare` sobre string `YYYY-MM-DD`, correto e locale-independente por construção) ou por timestamp numérico — nenhum ordena texto livre do usuário. E **não existe nenhuma funcionalidade de busca por texto no app** (nenhuma tela filtra receitas, ingredientes, listas ou favoritos por texto digitado) — o risco de busca insensível a acento simplesmente não se aplica porque a feature não existe. Documentado para constar que a checagem foi feita.

### Resumo da Tarefa 9

| # | Achado | Severidade |
|---|---|---|
| 9.1 | Paywall (2 telas) nunca usa o preço real localizado da loja — sempre mostra preço USD fixo calculado no app; pipeline de preço real já implementado mas morto | 🔴 Alta |
| 9.2 | URLs de Termos/Privacidade sem variante de idioma, duplicadas em 2 arquivos | 🟢 Baixa |
| 9.3 | Entrada de decimal com vírgula (peso/altura) | ✅ Correto, sem achado |
| 9.4 | Ordenação e busca de texto | ✅ Correto/não aplicável, sem achado |

---

## Tabela de priorização consolidada

Todos os achados das 9 tarefas, ordenados por impacto decrescente ao usuário. IDs prefixados por tarefa de origem (`T1`–`T9`). Achados de centralização de formatação indicam explicitamente se a correção é criar um utilitário novo ou estender um existente, conforme pedido nos critérios de aceite.

| ID | Descrição | Arquivo(s) | Impacto | Ação recomendada |
|---|---|---|---|---|
| **F01** | Paywall (2 telas) nunca usa o preço real localizado da loja — sempre mostra preço USD fixo calculado no app; o pipeline de preço real via RevenueCat já existe mas está morto (`loadPurchasePlans` nunca é chamado) | `UpgradeScreen.tsx:80-106`, `MeScreen.tsx:598-603`, `usePulseProPurchase.ts:158-177,223` | 🔴 Alto | Trocar `formatUsdCurrency(locale, PRICING_CONFIG.PRO_*_PRICE_USD)` por `availablePlans`/`pkg.product.priceString` (já implementado, só desconectado); chamar `loadPurchasePlans()` no mount das 2 telas; `PRICING_CONFIG` vira fallback, não caminho principal |
| **F02** | Mensagens de erro de validação (`too_short`/`too_long`/`number_range`) nunca interpolam `{{min}}`/`{{max}}` — usuário vê o placeholder literal na tela. Sistêmico: 109 pontos de uso em 8 schemas Zod compartilhados, consumidos via wrapper `translateKey(key)` de um único argumento, duplicado idêntico em 6 telas | `packages/shared/src/schemas/*.ts` (8 arquivos), `LoginScreen.tsx:54`, `RegisterScreen.tsx:170`, `ForgotPasswordScreen.tsx:25`, `ResetPasswordScreen.tsx:155`, `VerifyOtpScreen.tsx:69`, `OnboardingMacrosScreen.tsx:73` | 🔴 Alto | Estender `translateKey`/`t()` para aceitar opções de interpolação; propagar o valor real do limite Zod (hoje descartado) até a chamada — schema precisa carregar o número, não só a chave |
| **F03** | Chamadas de notificação usam namespace errado (`notifications.*` em vez de `me.notifications.*`) — corpo da push notification e nome do canal Android mostram o literal da chave em vez do texto traduzido; o nome do canal é visível nas Configurações do Android, fora do app | `notifications.service.ts:54,101` | 🔴 Alto | Corrigir para `i18n.t('me.notifications.dailyPulsePrompt', ...)` e `i18n.t('me.notifications.channelName')` |
| **F04** | `track.title` = "Track" idêntico nos dois idiomas — cabeçalho inteiro da tela Track aparece em inglês para usuários pt-BR; inconsistente com `navigation.track` (chave irmã, corretamente traduzida: "Acompanhar") | `pt-BR.json:471`, usado em `TrackScreen.tsx:446` | 🔴 Alto | Traduzir `track.title` para "Acompanhar" em `pt-BR.json` |
| **F05** | `accessibilityLabel="Go back"` hardcoded em inglês, sem passar por `t()` — afeta o botão de voltar compartilhado por todas as 5 telas de autenticação (Login, Register, ForgotPassword, ResetPassword, VerifyOtp) | `AuthScreenLayout.tsx:57` | 🟡 Médio-Alto | Trocar por `t('common.actions.back')`, já usado em 10+ outros botões de voltar no app |
| **F06** | Nenhum número decimal exibido ao usuário usa separador `,` em pt-BR — `toFixed()` sempre retorna `.`, independente do locale. A mesma função "inteiro ou 1 casa decimal" está duplicada de forma independente em 7 arquivos | `useUnits.ts`, `RecipeShareCard.tsx`, `FavoriteCard.tsx`, `RecipeCard.tsx`, `ActiveRecipeHeader.tsx`, `GoalRing.tsx`, `HighlightRecipeCard.tsx` | 🟡 Médio (sistêmico, alta abrangência) | **Criar utilitário novo**: `formatDecimal(value, locale, digits)` central via `Intl.NumberFormat`, substituindo as 7 cópias |
| **F07** | `t('common.actions.add')` — chave não existe em nenhum dos dois JSONs. Usada como `accessibilityLabel` do botão de adicionar item da lista de compras; leitor de tela anuncia o literal da chave | `ShoppingListDetailScreen.tsx:558` | 🟡 Médio | Adicionar `common.actions.add` em `pt-BR.json`/`en.json` ("Adicionar"/"Add") |
| **F08** | `home.freePlan` = "Free" idêntico nos dois idiomas — badge de plano gratuito exibido em 2 telas | `pt-BR.json:189`, usado em `HomeScreen.tsx:427`, `MeScreen.tsx:1164` | 🟡 Médio | Traduzir para "Grátis" em `pt-BR.json` |
| **F09** | `home.lastBlend` = "Last Blend" idêntico nos dois idiomas — rótulo do botão de ação rápida na Home | `pt-BR.json:173`, usado em `QuickActionTrigger.tsx:188` | 🟡 Médio | Traduzir para "Último Blend" em `pt-BR.json` |
| **F10** | `.toLocaleString()` para exibir XP sem passar locale — cai no locale padrão do runtime (não necessariamente o idioma ativo do app), não no locale mapeado do i18n. Duplicado em 2 implementações independentes | `MeScreen.tsx:1239`, `LevelDetailSheet.tsx:36-38` | 🟡 Médio | **Estender utilitário**: usar o `formatDecimal`/`formatCount` central proposto em F06 (via `toIntlLocale`), remover as 2 cópias |
| **F11** | `formatMemberSince` ("Membro desde") bypassa o hook central de datas — não aplica o timezone do usuário (usa o timezone padrão do runtime), diferente de todo o resto do app | `MeScreen.tsx:335-340` | 🟡 Médio | **Estender utilitário existente**: adicionar variante `month+year` a `useDateFormat()`, remover a função local |
| **F12** | 13 códigos de erro emitidos hoje pelo backend não têm chave `errors.*` correspondente no mobile — se ocorrerem, a UI mostraria o literal da chave construída | `conversations/*`, `favorites/invalid-id`, `profilePhoto/file-too-large`, `profilePhoto/not-found`, `purchases/invalid-receipt`, `purchases/provider-error`, `shoppingList/{forbidden,invalid-id,item-not-found,not-found}`, `weeklyReport/not-found` (códigos de `apps/api/src/`) | 🟡 Médio | Adicionar as chaves `errors.*` correspondentes nos dois JSONs (fora do escopo direto de tradução — recomenda-se tarefa dedicada ao contrato de erros da API) |
| **F13** | `accessibilityHint` hardcoded em português, sempre — usuário com app em inglês ouve a dica em português | `SupplementCheckItem.tsx:163` | 🟢 Baixo-Médio | Criar chave nova (ex: `track.supplementCheckHint`) e usar `t()` |
| **F14** | 4 strings hardcoded via ternário manual de locale em vez de `t()`: labels de macro no card de compartilhamento de receita | `RecipeShareCard.tsx:79-108` | 🟢 Baixo | Trocar por `t('common.units.grams')`/etc., já existente e usado em 9+ outros pontos |
| **F15** | 4 strings hardcoded (2 mensagens × 2 idiomas) via branch manual de locale em vez de `t()`: permissão de câmera/galeria negada | `MeScreen.tsx:426-461` (`getProfilePhotoActionCopy`) | 🟢 Baixo | Adicionar chaves i18n e trocar as 2 strings hardcoded por `t()`, alinhando com os outros 8 campos da mesma função |
| **F16** | Unidade "g"/"kcal" hardcoded como string literal em vez de `t('common.units.grams'/'kilocalories')`, já existente e usado em 9+ outros pontos | `MeScreen.tsx:1298,1305,1312`, `WeeklyShareCard.tsx:129`, `RecipeShareCard.tsx:86-104` | 🟢 Baixo | Trocar por `t('common.units.*')` |
| **F17** | Contadores/totais grandes (calorias semanais/mensais, metas) sem separador de milhar | `HistoryScreen.tsx:299,305`, `MeScreen.tsx:1298-1312` | 🟢 Baixo | Mesmo utilitário de F06/F10 |
| **F18** | `me.badges.bronze` = "Bronze" não traduzido, enquanto os 3 valores irmãos do mesmo enum (silver/gold/locked) estão corretamente traduzidos | `pt-BR.json` (`me.badges.bronze`), usado via `getStageLabelKey`, `BadgeCard.tsx:65` | 🟢 Baixo | Avaliar se "Bronze" deve virar algo mais natural em pt-BR, ou manter por ser palavra válida — ao menos documentar a decisão |
| **F19** | 249 das 863 chaves (≈29%) são código morto — ~85% concentradas em 9 árvores de namespace inteiras duplicadas/obsoletas (`profile.*`→`me.*`, `shoppingLists.*`→`shoppingList.*`, `missions.*` flat→aninhado, `onboarding.welcome/profile/targets.*` — etapas de onboarding removidas, `home.protocols/rings/streak/greeting.*`, `blend.clean_reminder/feedback/timer/models.*`, `recipes.*`, `notifications.*` topo, `gamification.*`) | Ver lista completa na Tarefa 5 | 🟢 Baixo (sem efeito na UX; alto custo de manutenção) | Remover as 249 chaves dos dois JSONs — nenhuma tem call site confirmado |
| **F20** | Inconsistência de pontuação no namespace mais homogêneo do app: 43/46 mensagens de erro terminam com ponto final, 3 não | `errors.macros_inconsistent`, `errors.shoppinglist_free_tier_limit`, `errors.shoppingList_free_tier_limit` (ambos os JSONs) | 🟢 Baixo | Adicionar ponto final às 3 mensagens |
| **F21** | Duas implementações paralelas de "data relativa" (hoje/ontem/N dias) — a usada de fato é 100% i18n; a do hook "central" hardcoda "Today/Hoje/Yesterday/Ontem" fora do pipeline, mas está morta (nunca chamada) | `useDateFormat.ts:137-151,317-346` (`formatRelative`) | 🟢 Baixo (mitigado por estar morta) | Remover `formatRelative`/`formatRelativeFallback` (dead code) ou reescrever usando `t('common.daysAgoToday/Yesterday/N')` |
| **F22** | `formatWeekRange` depende de parsing por regex sobre a string de saída do `Intl.DateTimeFormat` — funciona hoje, mas frágil a mudanças de comportamento do ICU entre versões de runtime | `WeeklyShareCard.tsx:52-88` | 🟢 Baixo | Sem ação imediata — documentar a fragilidade; considerar construir o intervalo a partir dos componentes de data (`formatToParts`) em vez de regex sobre string formatada |
| **F23** | 5 implementações independentes e duplicadas de "chave de data local YYYY-MM-DD" (`getLocalDateKey`) — uso interno (comparação/cache), sem impacto ao usuário, mas viola DRY | `useDateFormat.ts`, `historyRange.utils.ts`, `HydrationSection.tsx:75-82`, `TrackScreen.tsx:80-87`, `MeScreen.tsx:342-351` | 🟢 Baixo | **Estender utilitário existente**: exportar a `getLocalDateKey` privada de `useDateFormat.ts` para reuso, remover as outras 4 cópias |
| **F24** | Mapeamento locale→BCP-47 (`toIntlLocale`, `'en'→'en-US'`) não é compartilhado — duplicado/ignorado em 2 outros pontos que passam o locale cru ao `Intl` | `pricing.utils.ts` (`formatUsdCurrency`), `MeScreen.tsx:335` (`formatMemberSince`) | 🟢 Baixo | **Estender utilitário existente**: exportar `toIntlLocale` de `useDateFormat.ts` para reuso |
| **F25** | `gamification.pendingLevelUp` tem como valor uma frase que descreve um campo de código (`pendingLevelUp` no Zustand store), não conteúdo de UI real — provável resíduo de geração automática de chave | `pt-BR.json`/`en.json` (`gamification.pendingLevelUp`) | 🟢 Baixo (chave já órfã) | Remover junto com a limpeza de F19 (namespace `gamification.*` inteiro é morto) |
| **F26** | URLs de Termos de Serviço e Política de Privacidade sem variante de idioma, declaradas de forma duplicada e independente em 2 arquivos | `UpgradeScreen.tsx:32-33`, `RegisterScreen.tsx:33-34` | 🟢 Baixo | Centralizar em `config/legal.ts`; avaliar se o site de destino precisa de variante por idioma |
| **F27** | Wattagem exibida no badge da tela de escolha de modelo diverge da wattagem mencionada no texto de descrição da mesma tela (achado de dado de produto, não de tradução — mesmo erro nos 2 idiomas) | `OnboardingModelScreen.tsx:25-27` + `pt-BR.json`/`en.json:125-127` | 🟢 Baixo | Alinhar os dois valores (fora do escopo de tradução — reportar ao time de produto/conteúdo) |
| **F28** | Conteúdo divergiu entre pares de chaves duplicadas (`me.badges.*` viva vs. `profile.badges.*` morta) — a árvore morta não é cópia congelada, foi editada de forma independente antes de ser abandonada | `pt-BR.json` (`me.badges.*` vs `profile.badges.*`) | Informativo | Nenhuma ação — se resolve junto com a remoção de F19 |

**Nota sobre severidade "Alta" vs. o padrão das áreas anteriores:** nenhum achado desta área chega ao nível de "corrompe dado" ou "permite ação indevida" visto em diagnósticos de lógica de negócio — o teto de impacto aqui é "usuário vê texto errado/não traduzido/mal formatado". F01–F04 foram classificados como Alto por serem **sempre visíveis** (não dependem de edge case) e por dois deles (F01, F03) vazarem para fora da experiência controlada do app (tela de compra real, Configurações do sistema Android).

---

## Encerramento do diagnóstico

**Baseline confirmado:** 863 chaves em cada arquivo de locale (862 pré-FIX + 1 líquida). Nenhuma alteração de código foi feita durante as 9 tarefas — apenas leitura, greps e scripts Node.js descartáveis (todos apagados após uso, nenhum resíduo em `apps/`).

| Dimensão (Tarefa) | Resultado |
|---|---|
| 1 — Strings hardcoded | 2 locais reais (8 strings), resto do app usa `t()` de forma consistente |
| 2 — Chaves ausentes/erradas no código | 3 achados críticos (`common.actions.add`, 2× namespace errado em `notifications.service.ts`); 135 combinações de chave dinâmica/indireta verificadas, 0 gaps |
| 3 — Inconsistência estrutural pt-BR × en | 0 — os dois arquivos têm exatamente as mesmas 863 chaves |
| 4 — Interpolação `{var}` vs `{{var}}` | 0 erros de formato de chave; 1 achado sistêmico de parâmetro nunca passado (validação Zod, 109 pontos) |
| 5 — Chaves mortas | 249/863 (≈29%), ~85% em 9 árvores de namespace inteiras |
| 6 — Formatação centralizada | Datas e unidades **têm** utilitário central; números genéricos **não têm** — achado central: nenhum decimal usa `,` em pt-BR |
| 7 — Valores idênticos nos 2 idiomas | 69 chaves idênticas, 61 falsos positivos revisados, 3 traduções genuinamente ausentes em chaves vivas + 1 inconsistência menor |
| 8 — Fora do escopo das 8 dimensões | 2 strings de acessibilidade hardcoded, inconsistência de pontuação, valor de chave anômalo, divergência de conteúdo entre árvores duplicadas |
| 9 — Nicho não citado no prompt | Achado de maior impacto do relatório: paywall nunca mostra o preço real localizado da loja |

**28 achados consolidados** na tabela de priorização (F01–F28), sendo 4 de impacto Alto, 8 de impacto Médio, 15 de impacto Baixo, 1 informativo.

**Pronto para uso direto como base do FIX-6**, sem necessidade de nova investigação — cada achado da tabela já aponta arquivo(s), linha(s) quando aplicável, e se a correção deve criar um utilitário novo ou estender um existente.
