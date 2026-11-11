# CP-1.1.1f — Altura em pés e polegadas, mensagem de faixa e "Meta diária" no iPhone

Fecha os achados de mobile da verificação do CP-1.1.1e ([mobile-teclado-numerico-leitura-estrita-pantry-sem-receita.md](mobile-teclado-numerico-leitura-estrita-pantry-sem-receita.md)). O mercado principal do app é os EUA, onde a maioria usa o sistema imperial.

Nenhuma mudança de comportamento no backend e nenhum limite de validação mudou. A segunda rodada corrigiu os 3 achados que ficaram fora do escopo da primeira (ver [Achados corrigidos depois](#achados-corrigidos-depois)).

## Resumo

| # | Achado | Situação |
|---|---|---|
| 1 | Altura imperial digitada em polegadas totais (70), mas exibida pelo app em pés e polegadas (5'10") | Corrigido: dois campos, pés e polegadas, só no imperial |
| 2 | Peso ou altura fora da faixa não mostravam mensagem: a tela só não deixava avançar ou salvar | Corrigido: a faixa aceita aparece no campo, na unidade do usuário |
| 3 | Limites de peso (20–300 kg) e altura (100–250 cm) repetidos nas telas e nos schemas do shared | Corrigido: constantes no shared, com os mesmos valores |
| 4 | "Meta diária" dos suplementos sem como fechar o teclado no iPhone | Corrigido: barra "Concluir" no iOS; no Android, a tecla de ação fecha |
| A1 | Peso pré-preenchido mudava ao salvar sem mexer (81 kg → 80,997) | Corrigido na 2ª rodada, nos dois sistemas |
| A2 | `toStorageWeight`/`toStorageHeight` sem uso no `useUnits` | Removidos na 2ª rodada |
| A3 | Polegadas com o ícone de "ok" quando a altura imperial estava fora da faixa | Corrigido na 2ª rodada (`AuthInput` ganhou a prop `invalid`) |

Verificação final: typecheck nos 3 workspaces, lint, API **492/492** (antes 471), mobile **712/712** em 33 suítes (antes 575 em 30; 690 ao fim da 1ª rodada).

---

## Tarefa 1 — Constantes de peso e altura no shared

Em [user.ts](../../packages/shared/src/schemas/user.ts), no mesmo estilo das constantes de meta e de hidratação:

| Constante | Valor |
|---|---|
| `BODY_WEIGHT_MIN_KG` | 20 |
| `BODY_WEIGHT_MAX_KG` | 300 |
| `BODY_HEIGHT_MIN_CM` | 100 |
| `BODY_HEIGHT_MAX_CM` | 250 |

- Passaram a usar as constantes: `updateUserSchema` (`weight`, `height`, `targetWeight`) e `calculateMacrosSchema` (`weight`, `height`, `targetWeight`). Nenhum outro schema do shared repetia esses números.
- As mensagens não mudaram, inclusive a diferença que já existia: o erro de tipo do `calculateMacrosSchema` em `weight`/`height` continua sendo a chave simples `errors.validation.number_range`, e não a mensagem com os limites.
- **Mongoose ([User.ts](../../apps/api/src/models/User.ts)) não mudou.** Ele continua com os números soltos, como faz com a hidratação (500/8000) desde o CP-1.1.1b.
- **Prova de que nada mudou:** [bodyLimitsSchemas.test.ts](../../apps/api/src/utils/bodyLimitsSchemas.test.ts) escreve os limites por extenso e testa os 6 campos nos extremos, logo abaixo e logo acima de cada extremo, e com valores que não são número. Os mesmos 20 casos foram rodados com o shared antigo (números soltos) e com o novo (constantes), e passaram iguais nos dois.

## Tarefa 2 — Altura em pés e polegadas

Só no imperial, no [OnboardingBodyScreen](../../apps/mobile/src/screens/onboarding/OnboardingBodyScreen.tsx) e no [CompleteProfileScreen](../../apps/mobile/src/screens/CompleteProfileScreen.tsx). No métrico continua um campo só, em cm.

**Campos:**
- Dois `AuthInput` lado a lado, com a unidade sobreposta como nos outros campos ("ft" e "in").
- Rótulos novos: `onboarding.heightFeetPlaceholder` ("Height (ft)" / "Altura (pés)") e `onboarding.heightInchesPlaceholder` ("Inches" / "Polegadas"). A chave `onboarding.heightPlaceholderImperial` ("Height in inches"), que ficou sem uso, foi removida.
- Teclado number-pad nos dois. `maxLength` 1 em pés (a faixa aceita vai de 3 a 8) e 2 em polegadas.

**Leitura** (`parseStrictInteger`, de [numericInput.utils.ts](../../apps/mobile/src/utils/numericInput.utils.ts)):
- Pés: inteiro.
- Polegadas: inteiro de 0 a 11. Vazio vale 0, então 6 com polegadas vazias é 6'0".
- Polegadas sem pés: altura incompleta, sem mensagem e sem cálculo.
- "-1", "abc", "5.5", "1e1" e dígitos de outros alfabetos mostram `errors.validation.integer` no campo.
- 12 ou mais nas polegadas mostra "Insira um valor entre 0 e 11." (`errors.validation.number_range`).

**Conversão:** [bodyUnits.ts](../../apps/mobile/src/utils/bodyUnits.ts) passou a ser a fonte única das conversões de peso e altura, como o [volumeUnits.ts](../../apps/mobile/src/utils/volumeUnits.ts) é para volume. O `useUnits` usa essas funções; as telas não repetem nenhum fator.

| Função | Regra |
|---|---|
| `feetInchesToCm(pés, pol)` | `inchesToCm(pés × 12 + pol)`: polegadas × 2,54, arredondado a uma casa. É a mesma regra e o mesmo arredondamento que o app já usava para a altura imperial |
| `cmToFeetInches(cm)` | Mesma regra do `displayHeight`: pés pelo piso, polegadas arredondadas, e 12 polegadas viram mais um pé (182,8 cm → 6'0", não 5'12") |
| `kgToPounds` / `poundsToKg` | × e ÷ 2,205, sem arredondar (é o que o app envia) |

**Altura salva:** o completar perfil pré-preenche pés e polegadas a partir do cm salvo. Enquanto a pessoa não mexe em nenhum dos dois campos, o PATCH envia o cm salvo original, e não o resultado da ida e volta (178 cm aparece como 5'10" e continua 178, não 177,8). Mexer em qualquer um dos dois, mesmo apagando e redigitando o mesmo valor, envia a conversão. O onboarding não tem altura salva para pré-preencher.

**Troca de unidade:** o comportamento de antes foi mantido nas duas telas. Trocar entre métrico e imperial limpa os campos de peso e de altura, agora incluindo pés e polegadas, nos dois sentidos. No completar perfil, a troca também descarta a altura salva.

**Ordem do "Próximo/Concluir"** (barra no iOS, tecla de ação no Android):

| Sistema | Ordem |
|---|---|
| Métrico | peso → altura → data de nascimento (Concluir) |
| Imperial | peso → pés → polegadas → data de nascimento (Concluir) |

A regra das duas telas fica em [bodyFields.utils.ts](../../apps/mobile/src/utils/bodyFields.utils.ts) (`evaluateBodyFields`, `getBodyNumericFields`, `heightCmToFeetInchesTexts`, `translateBodyFieldError`), sem lógica repetida nas telas.

## Tarefa 3 — Mensagem de fora da faixa

Quando o texto é um número válido mas está fora da faixa, o campo mostra a faixa aceita na unidade do usuário. A mensagem só aparece depois que a pessoa digitou algo, o mesmo critério do erro de formato. O erro de formato tem prioridade: "1000abc" mostra o erro de formato, não a faixa.

Todas as mensagens usam a chave que já existia, `errors.validation.number_range` ("Insira um valor entre {{min}} e {{max}}."), com a unidade dentro dos valores. Nenhuma chave nova foi necessária.

| Campo | Mensagem | Onde aparece |
|---|---|---|
| Peso, métrico | entre 20 kg e 300 kg | campo de peso |
| Altura, métrico | entre 100 cm e 250 cm | campo de altura |
| Peso, imperial | entre 44.1 lbs e 661.5 lbs | campo de peso |
| Altura, imperial | entre 3'4" e 8'2" | campo de pés |

**Faixas imperiais.** São derivadas das constantes do shared arredondando para dentro, ajustadas até bater com a checagem que a tela faz depois de converter. Assim, todo valor aceito na tela, convertido, está dentro da faixa do backend, e todo valor fora da mensagem é recusado.

| | Menor aceito | Primeiro recusado embaixo | Maior aceito | Primeiro recusado em cima |
|---|---|---|---|---|
| Peso (lbs, uma casa) | 44,1 → 20,000 kg | 44,0 → 19,95 kg | 661,5 → 300,000 kg | 661,6 → 300,05 kg |
| Altura (pés e polegadas) | 3'4" = 40 in → 101,6 cm | 3'3" → 99,1 cm | 8'2" = 98 in → 248,9 cm | 8'3" → 251,5 cm |

O teste percorre todos os pesos de 44,1 a 661,5 lbs, de 0,1 em 0,1, e todos convertem para dentro de 20–300 kg.

O mínimo absoluto de 100 cm corresponde a 3'3" (39,37 in). Mas 3'3" convertido dá 99,1 cm, abaixo do limite, por isso o menor valor aceito no imperial é 3'4".

## Tarefa 4 — "Meta diária" nos suplementos

Na [ManageStackScreen](../../apps/mobile/src/screens/ManageStackScreen.tsx), o campo usa `useNumericFieldChain` (um campo só, então é o último) e `NumericKeyboardAccessory`:

- **iOS:** a barra mostra "Concluir", que fecha o teclado.
- **Android:** sem barra; a tecla de ação (`returnKeyType="done"`) fecha o teclado pelo `onSubmitEditing`.
- A barra é renderizada **dentro do `Modal`** do formulário, porque no iOS ela precisa estar na mesma janela do campo.
- O ref do campo atende aos dois usos: o "Próximo" da dosagem continua focando a meta diária, e a corrente tem o próprio ref.
- **Não mudaram:** leitura (descarta o que não é dígito), `maxLength` 2, teclado, layout e os campos de nome e dosagem (continuam sem barra).

---

## Achados corrigidos depois

Na entrega da 1ª rodada ficaram 3 achados fora do escopo. Os 3 foram corrigidos numa 2ª rodada, sem mudança de backend, de limites, de layout ou de traduções.

### A1 — Peso salvo sem mexer (nos dois sistemas)

- **Problema:** o completar perfil pré-preenche o peso com uma casa e, ao salvar, converte o texto de volta, então o peso salvo mudava sem a pessoa mexer:
  - no imperial, 81 kg → "178.6" lbs → 80,997 kg;
  - no métrico, um peso com várias casas (comum em quem cadastrou no imperial, já que o app envia lbs ÷ 2,205 sem arredondar) aparecia como "70.0" e era salvo como 70,0 em vez de 70,0227.
- **Correção:** a mesma técnica da altura, aplicada nos dois sistemas. Enquanto o campo de peso não é editado, o PATCH envia o peso salvo original. Editar o campo (mesmo redigitando o mesmo texto) ou trocar de unidade descarta o peso salvo. Um peso salvo fora da faixa continua inválido e mostra a faixa.
- **Onde:** `untouchedSavedWeightKg` em `BodyFieldsInput` ([bodyFields.utils.ts](../../apps/mobile/src/utils/bodyFields.utils.ts)) e o estado de mesmo nome na CompleteProfileScreen. O onboarding passa `null`, porque não tem peso salvo.
- A altura no métrico não precisou disso: ela é sempre salva com no máximo uma casa decimal.

### A2 — `toStorageWeight` e `toStorageHeight` removidos

Depois da Tarefa 2 nenhuma tela usava essas duas funções do [useUnits.ts](../../apps/mobile/src/hooks/useUnits.ts). Foram removidas, junto com o tipo `StorageConversionResult` e os imports que ficaram sem uso. A conversão para armazenamento é feita por `poundsToKg` e `feetInchesToCm`/`inchesToCm` ([bodyUnits.ts](../../apps/mobile/src/utils/bodyUnits.ts)).

O `useUnits` continua com as funções de exibição (`displayWeight`, `displayHeight`, `displayVolume`, `displayHydration`) e com as unidades (`weightUnit`, `heightUnit`, `volumeUnit`, `inputHeightUnit` e o novo `inputHeightFeetUnit`).

### A3 — Polegadas sem "ok" com a altura fora da faixa

- **Problema:** o `AuthInput` mostra o ícone verde quando o campo tem conteúdo e não tem erro. Com a altura imperial fora da faixa, a mensagem fica no campo de pés, então o campo de polegadas continuava com o ícone verde.
- **Correção:**
  - [AuthInput.tsx](../../apps/mobile/src/components/ui/AuthInput.tsx) ganhou a prop opcional `invalid` (padrão `false`), que só esconde o ícone: não mostra texto e não muda a borda. A única mudança no componente é a condição do ícone: `hasContent && !error && !invalid`. Nenhuma outra tela usa a prop, então nada mais muda.
  - `evaluateBodyFields` passou a devolver `heightOutOfRange`, verdadeiro quando a altura imperial está completa, no formato certo e fora da faixa, inclusive quando é a altura salva. Nas duas telas, o campo de polegadas recebe `invalid={heightOutOfRange}`.
  - Com polegadas inválidas (ex.: 12), o erro já fica no próprio campo, então `heightOutOfRange` é falso.

---

## Testes

| Arquivo | Testes | O que cobre |
|---|---|---|
| [bodyLimitsSchemas.test.ts](../../apps/api/src/utils/bodyLimitsSchemas.test.ts) (novo, API) | 21 | Valores das constantes; os 6 campos dos dois schemas aceitam e recusam exatamente os mesmos valores, com as mesmas mensagens |
| [bodyUnits.test.ts](../../apps/mobile/src/utils/bodyUnits.test.ts) (novo) | 10 | 5'10" ↔ 177,8 e 6'0" ↔ 182,9; extremos de 100 e 250 cm; 12 polegadas viram mais um pé; ida e volta constante de 3'0" a 8'11"; faixas imperiais e o primeiro valor recusado de cada lado; todos os pesos de 44,1 a 661,5 lbs |
| [bodyFields.utils.test.ts](../../apps/mobile/src/utils/bodyFields.utils.test.ts) (novo) | 48 | Faixas e bordas nos dois sistemas; prioridade do erro de formato; lixo, negativos e 12+ polegadas; polegadas vazias; altura salva; peso salvo (A1); `heightOutOfRange` (A3); ordem dos campos |
| [OnboardingBodyScreen.test.tsx](../../apps/mobile/src/screens/onboarding/OnboardingBodyScreen.test.tsx) (15 → 47) | 47 | Imperial: dois campos, 5 e 10 enviam 177,8 cm, leitura estrita, ordem no iOS e no Android, troca de unidade nos dois sentidos; faixas e bordas nos dois sistemas, no campo certo; polegadas sem "ok" (A3) |
| [CompleteProfileScreen.test.tsx](../../apps/mobile/src/screens/CompleteProfileScreen.test.tsx) (11 → 49) | 49 | Imperial: pré-preenchimento 5'10" e 6'0"; sem mexer envia 178; mexer envia a conversão; leitura estrita; ordem da barra; troca de unidade; faixas; peso salvo nos dois sistemas (A1); polegadas sem "ok" (A3) |
| [ManageStackScreen.test.tsx](../../apps/mobile/src/screens/ManageStackScreen.test.tsx) (novo) | 5 | Barra e "Concluir" no iOS; tecla de ação fecha no Android; leitura, `maxLength` e teclado iguais; "Próximo" da dosagem; salvar como antes |
| [AuthInput.test.tsx](../../apps/mobile/src/components/ui/AuthInput.test.tsx) (15 → 19) | 19 | Prop `invalid` (A3): esconde o ícone sem texto, volta ao normal com `false`, não interfere no erro; sem a prop, igual a antes |

Os testes que já existiam nessas telas continuam passando sem alteração nos próprios testes. A única mudança neles foi no mock do store do onboarding, que passou a aceitar o sistema imperial e a troca de unidade.

## Testes manuais (iPhone e Android)

1. **Onboarding em imperial:** em pés e polegadas, digitar 5 e 10 e concluir. O IMC aparece, e o perfil fica com 177,8 cm.
2. **Completar perfil em imperial** (Me → aviso "complete seu perfil"):
   - abrir com uma conta salva com 178 cm: mostra 5 e 10;
   - salvar sem mexer: a altura continua 178;
   - mudar para 5 e 11 e salvar: fica 180,3; abrir de novo: mostra 5 e 11.
3. **Peso salvo (A1):**
   - imperial: com uma conta de 81 kg, a tela mostra 178.6; salvar sem mexer e confirmar no banco que o peso continua 81;
   - métrico: com uma conta cujo peso tem várias casas, salvar sem mexer e confirmar que o peso não mudou.
4. **Faixas no métrico:** peso 19,9 e 300,1 e altura 99,9 e 250,1 mostram a faixa em kg ou cm. 20, 300, 100 e 250 não mostram nada.
5. **Faixas no imperial:**
   - peso 44 e 661,6 mostram a faixa em lbs;
   - 3'3" e 8'3" mostram "3'4" e 8'2"" no campo de pés, e as polegadas ficam sem o ícone verde (A3);
   - 3'4" e 8'2" mostram o ícone nos dois campos;
   - polegadas 12 mostram "entre 0 e 11".
6. **Formato:** "70abc" no peso continua mostrando o erro de formato, não a faixa.
7. **Teclado:**
   - imperial: peso → pés → polegadas → data, e "Concluir" fecha;
   - Android: a tecla de ação segue a mesma ordem.
8. **Troca de unidade no onboarding:** os campos de peso e altura são limpos ao trocar, nos dois sentidos.
9. **"Meta diária" dos suplementos no iPhone:** Track → Gerenciar Stack → adicionar suplemento → tocar em "Meta diária": aparece "Concluir" acima do teclado e fecha o teclado. No Android, a tecla de ação fecha.
10. **Outras telas com `AuthInput`** (login, metas): o ícone verde continua aparecendo como antes.
11. **Visual:** os dois campos lado a lado e a mensagem de faixa no campo de pés (quebra em duas linhas) num iPhone pequeno (SE).
