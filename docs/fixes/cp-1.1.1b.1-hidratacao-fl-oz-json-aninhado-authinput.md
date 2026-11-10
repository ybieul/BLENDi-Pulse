# CP-1.1.1b.1 — Hidratação em fl oz, JSON aninhado e escala de fonte do AuthInput

**Contexto:** corrige três achados registrados na verificação do CP-1.1.1b
([cp-1.1.1b-minhas-metas.md](cp-1.1.1b-minhas-metas.md) e
[cp-1.1.1b-testes-pentest.md](cp-1.1.1b-testes-pentest.md)). São independentes entre si.

**Resultado em uma linha:**
- quem usa o sistema imperial vê e edita a meta de hidratação em **fl oz, com uma casa
  decimal**, igual à Home, e o backend continua recebendo **ml inteiro**;
- um corpo JSON aninhado demais responde **400** em vez de 500;
- o `AuthInput` tem **teto de 1,3×** na fonte do rótulo, do valor e do erro, e o rótulo
  flutuante não encosta mais no valor com a fonte ampliada.

Sem mudança de schema nem de limites no backend ou no `packages/shared`.

| Verificação | Resultado |
|---|---|
| Typecheck (shared, api, mobile) | limpo |
| Lint (3 workspaces, mobile com `--max-warnings 0`) | limpo |
| Suíte da API | 102 → **114** testes, todos passando |
| Suíte do mobile | 357 → **463** testes, todos passando |
| Teste ao vivo (API local + Atlas `test`, conta descartável apagada) | ver [Teste ao vivo](#teste-ao-vivo) |

---

## Pontos que precisam do seu olhar

1. **A área de erro do `AuthInput` já não tinha altura fixa.** O prompt dizia que tinha.
   No código ela só tem `marginTop`, cresce com o texto e só é renderizada enquanto há
   erro. Então não havia espaço reservado a preservar. Ficou como estava, agora coberta
   por testes.
2. **São 13 arquivos que usam o `AuthInput`, não 14.** O 14º é
   `components/ui/index.ts`, que só reexporta o componente.
3. **500 a 502 ml aparecem como 16.9 fl oz, abaixo do mínimo de 17.0.** Se a pessoa
   redigitar o valor exibido (o que já está salvo), **não** é erro, o "Salvar" dos outros
   campos não trava e a hidratação não entra no PATCH. Qualquer outro valor abaixo de 17.0
   continua inválido.
4. **Lint que já falhava foi corrigido:** `CompleteProfileScreen.tsx` tinha uma conversão
   de tipo desnecessária (`translationKey as TranslationKey`). Já constava nos relatórios
   do CP-1.1.1a e do CP-1.1.1b. Removi a conversão e o import que ficou sem uso; nada muda
   em execução.

---

## Tarefa 1 — Fonte única da conversão de volume

- [volumeUnits.ts](../../apps/mobile/src/utils/volumeUnits.ts) exporta
  `MILLILITERS_PER_FLUID_OUNCE` (29,574), `mlToFlOz` e `flOzToMl` (sem arredondar).
- [useUnits.ts](../../apps/mobile/src/hooks/useUnits.ts) perdeu a constante interna e usa
  `mlToFlOz`. O `displayVolume`/`displayHydration` mostra exatamente o mesmo de antes
  (ex.: 2500 ml → "84.5 fl oz"), coberto por teste.
- Nenhuma tela repete o fator.

## Tarefa 2 — Hidratação em fl oz na tela "Minhas metas"

Só quando `unitSystem` é `"imperial"`. A unidade vem do `useUnits`, a mesma fonte da Home.
Sem unidade conhecida, vale o métrico.

| | Métrico (sem mudança) | Imperial |
|---|---|---|
| Valor inicial | ml inteiro ("2500") | fl oz com uma casa, mesmo arredondamento do `displayVolume` ("84.5") |
| Rótulo | `nutritionGoals.hydrationLabel` — "(ml)" | `nutritionGoals.hydrationLabelImperial` — "(fl oz)" (en e pt-BR) |
| Teclado | `number-pad` | `decimal-pad` |
| Entrada aceita | só dígitos | dígitos com no máximo uma casa, ponto **ou** vírgula; "84." vale 84.0 |
| Faixa | 500–8.000 ml | **17.0–270.5 fl oz** |
| PATCH | ml digitado | fl oz → ml inteiro (`Math.round`) |

Como a faixa em fl oz é calculada a partir de `DAILY_HYDRATION_TARGET_MIN/MAX` (nenhum
número fixo):

- **Mínimo:** o menor valor com uma casa cuja conversão não fica abaixo de 500 ml.
  16.9 dá 499,8 ml; 17.0 dá 502,8 ml.
- **Máximo:** o maior cuja conversão não passa de 8.000 ml.
  270.5 dá 7.999,8 ml; 270.6 dá 8.002,7 ml.

Todo valor aceito, depois de arredondado, cai dentro da faixa do backend. O erro inline
mostra a faixa em fl oz ("17.0" e "270.5").

**"Mudou ou não mudou" é decidido na unidade exibida.** 84.5 fl oz convertido dá
**2499** ml. Comparando na unidade exibida, abrir e salvar (ou redigitar "84.5"/"84,5")
não manda a hidratação, então os 2500 ml salvos não viram 2499.
A invalidação de `hydrationToday` só acontece quando a hidratação entra no PATCH.

Funções puras em
[nutritionGoals.utils.ts](../../apps/mobile/src/utils/nutritionGoals.utils.ts):

- `isGoalFieldInFlOz`, `HYDRATION_FL_OZ_LIMITS`, `parseGoalDraftText`,
  `toGoalDisplayValue`, `formatGoalDisplayValue`, `getGoalDisplayLimits`,
  `formatGoalLimit` e `toGoalStoredValue`.
- `isGoalTextValid`, `isGoalFieldChanged`, `hasUnsavedGoalChanges`, `areGoalDraftsValid`
  e `buildGoalsPatch` recebem `unitSystem` (padrão `'metric'`, que mantém o comportamento
  antigo).
- Os valores em fl oz são tratados em décimos inteiros, sem ruído de ponto flutuante.
- A defesa em profundidade do PATCH continua: confere a faixa na unidade exibida e de novo
  no ml já convertido.

## Tarefa 3 — JSON aninhado no backend

[requestSanitization.ts](../../apps/api/src/middlewares/requestSanitization.ts), registrado
em [index.ts](../../apps/api/src/index.ts) logo depois dos parsers:

1. **`rejectDeeplyNestedBody`** mede a profundidade de `req.body` com
   `exceedsMaxDepth`. A medição é iterativa, com pilha explícita, e para no primeiro nó que
   passa do limite.
   - Acima de **`MAX_REQUEST_BODY_DEPTH = 32`**, responde **400** no formato padrão:
     ```json
     { "success": false, "code": "validation/invalid-input", "message": "Request body is nested too deeply." }
     ```
   - Responde antes da sanitização e das rotas, inclusive nas duas rotas do parser de 4 MB.
2. **`sanitizeRequest`**: a mesma sanitização de antes (`mongoSanitize.sanitize` direto,
   sem reatribuir `req[key]`), só movida para o módulo para os testes usarem a mesma
   sequência de middlewares do servidor.

Decisões:

- **Por que 32:** o corpo legítimo mais profundo da API tem 3 níveis (`POST /favorites` e
  listas de compras: corpo → array → item). 32 dá mais de 10× de folga e é o mesmo teto
  que o body-parser já aplica ao corpo urlencoded.
- **Code do erro:** reaproveitei `validation/invalid-input`. Nenhum cliente legítimo chega
  perto do limite, então não há texto específico a mostrar, e o mobile já traduz esse code
  (`errors.validation_invalid_input`).
- **Query string:** o Express 5 usa o parser `simple` (`node:querystring`), que não aninha
  nada: `?a[b][c]=1` vira a chave literal `"a[b][c]"`. O **corpo** urlencoded passa pelo
  body-parser 2.2.2 com `depth: 32` e `strictDepth: true` e já responde 400 acima disso.
  Confirmado no código e em teste; não mexi.
- **Webhook do RevenueCat (não alterado):** o corpo chega cru e só é lido depois da
  autenticação.
  - `JSON.parse` não estoura a pilha: testei com 200 mil níveis.
  - O schema zod descarta campos desconhecidos sem percorrê-los, e os campos conhecidos são
    primitivos ou arrays de string.
  - Não há processamento recursivo. O webhook é montado antes da sanitização, então nunca
    passou por ela.
- **Tratamento de `RangeError` no `errorHandler`: não incluí.** Depois da checagem, a
  sanitização só recebe corpo de até 32 níveis, e `params`, `headers` e `query` são rasos
  por construção. Um tratamento genérico esconderia bugs de recursão em outras partes do
  código.
- **Reprodução:** sem a checagem, `sanitize` estoura já com 3.000 níveis nesta máquina
  (o limite exato depende da pilha disponível).

## Tarefa 4 — Escala de fonte no AuthInput

[AuthInput.tsx](../../apps/mobile/src/components/ui/AuthInput.tsx):

- **`AUTH_INPUT_MAX_FONT_SIZE_MULTIPLIER = 1.3`**, aplicado ao rótulo flutuante, ao valor
  e à mensagem de erro. O valor ainda aceita `maxFontSizeMultiplier` por prop.
- **Rótulo × valor no teto:** com a DM Sans (altura de linha ≈ 1,3× a fonte), a 1,3× o
  rótulo ocupava de 10 a cerca de 28,6 px e o valor começava em cerca de 22 px. Os dois se
  sobrepunham em cerca de 6 px.
  - `getAuthInputLabelLayout(fontScale)` ajusta as posições conforme a escala vai de 1 a
    1,3: o rótulo sobe até 6 px e o espaço interno do campo vai de 24/10 para 27/4.
  - No teto: rótulo em ~4–22,6 px e valor em ~26,8–52,2 px.
  - O rótulo em repouso fica sempre no mesmo lugar.
  - **Em escala 1 as posições são idênticas às de antes, e a altura continua 56.**
- **Área de erro:** sem altura fixa e sem limite de linhas, e só existe enquanto há erro
  (ver ponto 1).
- **`NutritionGoalsScreen`:** o teto próprio (`INPUT_MAX_FONT_SCALE`) foi removido; a tela
  herda o padrão.

Usos conferidos (13 arquivos): `LoginScreen`, `RegisterScreen`, `ForgotPasswordScreen`,
`ResetPasswordScreen`, `OnboardingModelScreen`, `OnboardingBodyScreen`,
`OnboardingMacrosScreen`, `CompleteProfileScreen`, `NutritionGoalsScreen`,
`ManageStackScreen`, `ShoppingListsScreen`, `EditSettingSheet` e `DeleteAccountSheet`.

- Só a `NutritionGoalsScreen` passava teto próprio.
- Nenhum uso dependia da altura da área de erro.
- Os elementos sobrepostos ao campo (unidade em `OnboardingBodyScreen`/`CompleteProfileScreen`
  e o olho da senha no `LoginScreen`) se posicionam pela altura do campo (56), que não
  mudou. O texto da unidade não tem teto próprio; fica para o teste manual.

---

## Testes

| Arquivo | O que cobre |
|---|---|
| `apps/api/src/middlewares/requestSanitization.test.ts` (novo, 12) | `exceedsMaxDepth`: limite exato passa, limite + 1 falha, ramo profundo no meio, 10.000 e 100.000 níveis sem estourar a pilha, payload de favorito. Cadeia real: 5.000/10.000 níveis → 400 no formato padrão, rota de 4 MB → 400, corpo normal segue e continua sanitizado, urlencoded acima do depth → 400, query não aninha |
| `apps/mobile/src/utils/volumeUnits.test.ts` (novo) | ida e volta ml ↔ fl oz em 500, 2500, 3000 e 8000; `displayVolume` igual ao de antes |
| `apps/mobile/src/components/ui/AuthInput.test.tsx` (novo) | teto 1,3× no rótulo, valor e erro; teto do valor por prop; erro sem altura fixa e sem espaço reservado; posições em escala 1 iguais às antigas; sem sobreposição de 1× a 2× |
| `nutritionGoals.utils.test.ts` | funções novas, faixa derivada (17.0/270.5), conversões, caso 500 ml → 16.9 |
| `nutritionGoals.utils.fuzz.test.ts` | 20.000 entradas hostis na hidratação imperial contra um oráculo próprio (faixa achada por busca), PATCH sempre em ml inteiro dentro da faixa, e **todo** ml de 500 a 8.000 redigitado como exibido não entra no PATCH |
| `NutritionGoalsScreen.test.tsx` | blocos "métrico (sem mudança)" e "imperial (fl oz)": valor inicial, rótulo, teclado, ponto/vírgula, rejeições, limites 16.9/17.0/270.5/270.6, PATCH em ml, abrir e salvar sem mexer, redigitar o exibido, troca invalida `hydrationToday` |
| `NutritionGoalsScreen.adversarial.test.tsx` | 19 entradas hostis decimais (duas casas, notação científica, hexadecimal, sinal, dígitos de outros alfabetos, separador arábico, espaço de largura zero, injeção…), decimal não vaza para os outros campos, 200.000 caracteres |

Os testes rodam com:

```bash
pnpm typecheck && pnpm lint
pnpm --filter @blendi/api test
(cd apps/mobile && npx jest)
```

## Teste ao vivo

API local (`NODE_ENV=development`, porta 3000) ligada ao Atlas, banco `test`. Conta
descartável `cpfix-imperial-…@test.blendi.local`, apagada no fim.

```
/ping antes: 200
SEM token  objeto 5.000 (29.996 bytes) POST /auth/login: 400 {"success":false,"code":"validation/invalid-input","message":"Request body is nested too deeply."}
           objeto 5.000, array 5.000 e array 9.000 em /auth/login e /auth/register: 400
           array 9.000 em /users/profile-photo (parser de 4 MB): 400
           objeto 9.000 (53.996 bytes): 413 (passa do limite de 50 kB antes de medir a profundidade)
/ping depois: 200
Cadastro com corpo válido: 201
COM token  objeto 5.000 e array 9.000 em PATCH /users/me: 400 · array 9.000 em POST /favorites: 400
/ping: 200
PATCH unitSystem "imperial": 200
84.5 fl oz -> 2499 ml
PATCH /users/me {"dailyHydrationTarget":2499} -> 200 {"success":true,"dailyHydrationTarget":2499,"unitSystem":"imperial"}
GET /users/me -> 200 {"dailyHydrationTarget":2499,"unitSystem":"imperial"}
DELETE /users/me -> 200 · Mongo (banco test): 0 contas cpfix-* restantes · log da API sem RangeError nem 500
```

## Testes manuais (iOS e Android)

1. **Conta imperial:** a Home mostra "84.5 fl oz" e "Minhas metas" mostra "84.5" com o
   rótulo "(fl oz)".
   - Salvar sem mexer volta ao Me sem alterar a meta.
   - Trocar para "100,5": a Home e o Track mostram 100.5 fl oz.
   - "16.9" e "270.6" mostram o erro "entre 17.0 e 270.5".
2. **Conta métrica:** "2500", rótulo "(ml)" e teclado sem separador decimal; o resto como
   antes.
3. **Teclado decimal:**
   - iOS com região pt-BR (a tecla mostra vírgula) e en-US (mostra ponto); os dois são
     aceitos.
   - Android: conferir qual separador o teclado oferece.
4. **Fonte do sistema no máximo** (iOS: Tamanhos Maiores em Acessibilidade; Android:
   fonte e tela no máximo):
   - telas: login, cadastro, esqueci/redefinir senha, onboarding (modelo, corpo, macros),
     completar perfil e "Minhas metas";
   - o rótulo flutuante não encosta no valor;
   - erros longos quebram linha sem cortar;
   - a unidade (kg/lb, cm/in) continua legível ao lado do valor.
   - Repetir com fonte normal para confirmar que o visual não mudou.

## Arquivos

- **API:** `src/middlewares/requestSanitization.ts` (novo),
  `src/middlewares/requestSanitization.test.ts` (novo), `src/index.ts`.
- **Mobile:**
  - novos: `src/utils/volumeUnits.ts`, `src/utils/volumeUnits.test.ts`,
    `src/components/ui/AuthInput.test.tsx`;
  - alterados: `src/hooks/useUnits.ts`, `src/utils/nutritionGoals.utils.ts` (+ testes e
    fuzz), `src/screens/NutritionGoalsScreen.tsx` (+ testes e adversariais),
    `src/components/ui/AuthInput.tsx`, `src/locales/en.json`, `src/locales/pt-BR.json`,
    `src/screens/CompleteProfileScreen.tsx` (só o lint).
