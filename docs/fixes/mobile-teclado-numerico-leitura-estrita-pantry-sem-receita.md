# Teclado numérico no iPhone, leitura estrita dos números e Pantry sem receita

Fecha os achados de mobile das verificações do CP-1.1.1b e do CP-1.1.1d. Nenhuma mudança de backend nem no contrato do Pantry Scanner.

## Resumo

| # | Achado | Situação |
|---|---|---|
| 1 | Onboarding (corpo e metas) e completar perfil sem "Próximo/Concluir" no iPhone | Corrigido: barra compartilhada nas três telas; no Android, a tecla de ação encadeia o foco |
| 2 | `parseInt`/`parseFloat` aceitavam "12abc", "150,5", "70abc", "1.2.3" | Corrigido: leitura estrita, com erro no campo |
| 3 | Pantry sem receita mostrava a etapa de receitas vazia, sem explicação | Corrigido: estado vazio dizendo que o scan não foi descontado |
| 4 | Completar perfil sem `KeyboardAvoidingView` | Corrigido (só o necessário, ver Tarefa 2) |
| 5 | ManageStackScreen | Só reportado, sem alteração (corrigido depois no CP-1.1.1f) |

Verificação: typecheck nos 3 workspaces, lint, API **471/471**, mobile **575/575** (30 suítes).

---

## Tarefa 1 — Barra compartilhada

- [NumericKeyboardAccessory.tsx](../../apps/mobile/src/components/ui/NumericKeyboardAccessory.tsx): a barra que estava dentro da NutritionGoalsScreen, com o mesmo visual (tokens do tema), os mesmos textos (`nutritionGoals.next` / `nutritionGoals.done`) e o mesmo comportamento. Só renderiza no iOS. `keyboardAccessoryId(id)` dá o `inputAccessoryViewID` do campo (o id no iOS, `undefined` no Android).
- [useNumericFieldChain.ts](../../apps/mobile/src/hooks/useNumericFieldChain.ts): encadeia os campos na ordem dada. `fieldProps(campo)` devolve ref, `inputAccessoryViewID`, `returnKeyType` (`next`, `done` no último), `submitBehavior="submit"` e `onSubmitEditing`/`onFocus`/`onBlur`; `accessoryProps` alimenta a barra.
- NutritionGoalsScreen: passou a usar o componente e mantém a própria lógica de foco e rolagem. Os testes dela passam sem nenhuma mudança.

## Tarefa 2 — Barra nas três telas

| Tela | Ordem do "Próximo" | Teclados |
|---|---|---|
| OnboardingBodyScreen | peso → altura → data de nascimento (Concluir) | decimal-pad, decimal-pad, number-pad (sem mudança) |
| OnboardingMacrosScreen | proteína → calorias → carboidratos (Concluir) | number-pad (sem mudança) |
| CompleteProfileScreen | peso → altura → data de nascimento (Concluir) | decimal-pad, decimal-pad, number-pad (sem mudança) |

- A data de nascimento entra na sequência porque também usa number-pad. A leitura dela não mudou: a máscara já descarta o que não é dígito.
- Altura imperial é **um campo só, em polegadas**. Não há campos separados de pés e polegadas. *Atualização: desde o [CP-1.1.1f](cp-1.1.1f-altura-pes-polegadas-faixas-meta-diaria.md) são dois campos, pés e polegadas, e a ordem no imperial é peso → pés → polegadas → data.*
- Android: a altura no onboarding passou de `returnKeyType="done"` para `"next"` (agora encadeia para a data), e todos os campos ganharam o `onSubmitEditing` que faltava.

**Padrão de teclado:**
- Onboarding corpo e metas: o `OnboardingLayout` já tem `KeyboardAvoidingView` (padding/height) e `ScrollView` com `keyboardShouldPersistTaps="handled"`. Não mudei nada.
- **CompleteProfileScreen não seguia o padrão**: não tinha `KeyboardAvoidingView` nem `keyboardShouldPersistTaps`. No iPhone, o "Salvar" ficava atrás do teclado e o primeiro toque num chip só fechava o teclado. Envolvi a tela num `KeyboardAvoidingView` e pus `keyboardShouldPersistTaps="handled"` no `ScrollView`. O layout continua o mesmo. O diff do arquivo é grande só por causa da reindentação.
- Diferença que ficou: a tela de metas rola explicitamente até o campo em foco. As três telas dependem da rolagem do sistema. Os campos ficam no alto da tela, então isso deve bastar, mas precisa de conferência no aparelho (ver testes manuais).

## Tarefa 3 — Leitura estrita

- [numericInput.utils.ts](../../apps/mobile/src/utils/numericInput.utils.ts): `parseStrictInteger`, `parseStrictDecimalParts` e `parseStrictDecimal`. Só dígitos ASCII, espaços nas pontas ignorados, um separador (ponto ou vírgula), limite de casas. "70." vale 70 no meio da digitação, como já acontecia na hidratação em fl oz.
- `nutritionGoals.utils.ts` passou a usar essas funções (`parseGoalText` e a leitura em fl oz). A regra é a mesma. A única diferença de borda: um inteiro maior que o inteiro seguro do JS (20+ dígitos) agora vira `null`. Antes virava um número enorme que já falhava na faixa.
- **Casas decimais de peso e altura: 1.** Hoje a tela não limitava (o `parseFloat` aceitava qualquer quantidade), mas o app pré-preenche e exibe com uma casa (`toFixed(1)`, `displayWeight`). Mantive esse valor. Efeito: "70.55" passa a ser recusado.
- Erros:
  - Metas do onboarding: o erro inline que já existia (`errors.validation.number_range`), igual à tela de metas.
  - Peso e altura (corpo e completar perfil): essas telas não mostravam erro para esses campos (fora da faixa só não calcula ou não salva). Mostrei o erro de leitura no próprio `AuthInput`, com a chave nova `errors.validation.decimal_one_place`. Fora da faixa continua sem mensagem, como antes. *Atualização: desde o [CP-1.1.1f](cp-1.1.1f-altura-pes-polegadas-faixas-meta-diaria.md), fora da faixa mostra a faixa aceita no campo, na unidade do usuário.*
- Os limites não mudaram e continuam vindo de onde vinham: o shared para as metas, 20–300 kg e 100–250 cm nas telas de corpo. *Atualização: desde o [CP-1.1.1f](cp-1.1.1f-altura-pes-polegadas-faixas-meta-diaria.md), os de peso e altura também vêm do shared (`BODY_WEIGHT_MIN_KG` etc.), com os mesmos valores.*

## Tarefa 4 — Pantry sem receita

- Etapa de receitas com `recipes` vazio: no lugar do subtítulo "com base em…" aparecem um ícone, o título "Nenhuma receita desta vez" e a mensagem "Não conseguimos montar receitas com esses ingredientes desta vez. Seu scan não foi descontado." (en e pt-BR: `pantryScanner.noRecipesTitle` / `noRecipesMessage`). O botão "Escanear novamente" continua.
- O contador continua vindo do `scansUsed` da resposta.
- Os outros estados não caem na tela vazia (conferido no código e nos testes):

| Estado | Mensagem |
|---|---|
| nenhuma comida | toast `noFoodDetected` |
| nenhum ingrediente utilizável | toast `noUsableIngredients` |
| limite | abre o Upgrade |
| dieta não atendida (422) | toast `errors.scanner_dietary_restriction_unmet` |
| rede | toast de erro |

Todos voltam para a câmera.

## Tarefa 5 — ManageStackScreen (só reportado)

Tem o mesmo problema, em menor grau. "Meta diária" é o último campo do formulário, em number-pad com `returnKeyType="done"` e sem `onSubmitEditing`. No iPhone não há como fechar o teclado por ele, e no Android a tecla só fecha o teclado. Nome e dose (teclado de texto) já encadeiam o foco. A leitura já é estrita na prática: `onChangeText` descarta o que não é dígito e o `maxLength` é 2. Correção sugerida: aplicar a mesma barra nesse campo. *Atualização: aplicada no [CP-1.1.1f](cp-1.1.1f-altura-pes-polegadas-faixas-meta-diaria.md) (Tarefa 4).*

## Testes

| Arquivo | O que cobre |
|---|---|
| [NumericKeyboardAccessory.test.tsx](../../apps/mobile/src/components/ui/NumericKeyboardAccessory.test.tsx) (novo) | só no iOS; "Próximo" chama `onNext`; "Concluir" fecha o teclado |
| [numericInput.utils.test.ts](../../apps/mobile/src/utils/numericInput.utils.test.ts) (novo) | tabela de válidos e inválidos para inteiro e decimal (vírgula, ponto, espaços, "12abc", "1.2.3", "-3", "1e2", arábico, largura total, devanágari, ".5", "70.55") |
| [OnboardingBodyScreen.test.tsx](../../apps/mobile/src/screens/onboarding/OnboardingBodyScreen.test.tsx) (novo) | barra na ordem (iOS), tecla de ação (Android), erro no campo certo, cálculo com vírgula e sem cálculo com lixo |
| [OnboardingMacrosScreen.test.tsx](../../apps/mobile/src/screens/onboarding/OnboardingMacrosScreen.test.tsx) (+9) | barra/tecla de ação; erro no campo certo; espaços nas pontas |
| [CompleteProfileScreen.test.tsx](../../apps/mobile/src/screens/CompleteProfileScreen.test.tsx) (novo) | barra/tecla de ação, padrão de teclado, erro no campo certo, pré-preenchido válido, salvar com vírgula, lixo não salva |
| [PantryScannerScreen.test.tsx](../../apps/mobile/src/screens/PantryScannerScreen.test.tsx) (novo) | lista vazia, com receita e os 5 outros estados |

## Testes manuais (iPhone e Android)

1. **Onboarding, corpo**: tocar no peso → "Próximo" → altura → "Próximo" → data → "Concluir" fecha o teclado. No Android, a tecla de ação faz o mesmo. Conferir que cada campo em foco fica visível acima do teclado, inclusive num iPhone pequeno (SE).
2. **Onboarding, metas**: proteína → calorias → carboidratos, mesmo roteiro. Com o teclado aberto, rolar até "Concluir configuração".
3. **Completar perfil** (Me → aviso "complete seu perfil"): mesmo roteiro. Com o teclado aberto, rolar até "Salvar" e tocar num chip: o toque deve funcionar já na primeira vez.
4. **Lixo**: no peso, digitar "12abc" (teclado físico ou colar no simulador; o decimal-pad não tem letras) e ver o erro embaixo do peso. Na altura, "1.2.3". Nas metas, "12abc" e "150,5" na proteína. Depois "70,5" e "70.5" no peso: sem erro.
5. **Pantry sem receita**: pelo app não dá para forçar. Com a API local (`pnpm api`) apontada pelo app:
   - forçar temporariamente `generatePantryRecipes` (`apps/api/src/controllers/pantryScanner.controller.ts`) a devolver `{ recipes: [], generatedCount: 0 }`. Uma chave de IA inválida não serve: a análise da imagem falha antes e cai em outro erro.

   Escanear qualquer foto de comida → ingredientes → "Gerar receitas": aparece o estado vazio, e "Escanear novamente" mostra o mesmo número de scans restantes de antes do scan.
