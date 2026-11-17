# CP-B4: pedido explícito preservado na nova tentativa, erro de copo sem proteína, textos neutros sem BLENDi

Fecha os dois pontos em aberto do CP-B3 ([cp-b3-volume-imperial-texto-neutro.md](cp-b3-volume-imperial-texto-neutro.md)):

1. Pedido de 70 g de proteína no Lite imperial pt-BR virou 59 g com aviso, embora coubesse. Na nova tentativa por volume, a IA cortou tudo por igual, inclusive o whey.
2. Textos do app com "BLENDi" para quem não tem BLENDi, e o erro de copo citando proteína (errado para todos desde o CP-B2).

Sem mudança em limites, leitor de volume, bloqueio, regras de dieta, receitas da Home e códigos de erro da API.

## Tarefa 1: nova tentativa por volume preserva o pedido (API)

`buildBlenderLimitRetryMessage` (`apps/api/src/utils/blenderGuardrail.utils.ts`) é usada pelo Pulse AI e pelo Pantry. A mensagem continua em inglês, o idioma de trabalho do prompt, e ganhou estas instruções:

- **Ordem de redução** (`BLENDER_LIMIT_RETRY_REDUCTION_RULES`):
  - reduzir primeiro o líquido, depois fruta, folhas e outros itens volumosos;
  - pó de proteína, cacau e outros pós ocupam pouco espaço no copo e não devem ser cortados para resolver o volume;
  - se a pessoa pediu um valor de calorias ou de macro, manter esse valor sempre que couber.
- **capacityNotice:**
  - só é preenchido se, depois de reduzir, o valor de fato deixar de ser atendido;
  - antes de devolver, a IA confere os macros corrigidos contra o valor pedido. Se chegarem lá, não preenche o aviso, que diria algo falso.
- A frase antiga "so measure protein powder by weight" saiu. Desde o CP-B3 o pó de proteína está na tabela de pesos, e a frase contradizia a regra dos pós.

A seção de tamanho do prompt do Pulse AI (`buildServingSizeSection`, só no modo de uma receita) ganhou duas linhas:

- em pedido alto de proteína, usar pó de proteína (ocupa pouco volume) antes de alimentos volumosos, respeitando dieta e goal;
- valor de macro pedido é em gramas do macro no campo de macros, não o peso de um ingrediente. Pó de proteína não é 100% proteína, então 70 g de proteína pedem mais de 70 g de pó.

A segunda linha e a conferência dos macros antes do aviso entraram depois da rodada 1 do teste ao vivo (ver abaixo).

## Tarefa 2: erro de copo sem "proteína"

| Chave | Antes | Depois |
|---|---|---|
| `errors.pulseai_blender_limit_unmet` (pt-BR) | Essa receita não coube no seu BLENDi (proteína ou volume acima do que o copo comporta). Tente pedir uma porção menor. | Essa receita não coube no copo do seu BLENDi (volume acima do que ele comporta). Tente pedir uma porção menor. |
| `errors.pulseai_blender_limit_unmet` (en) | That recipe didn't fit your BLENDi (too much protein or volume for its cup). Try asking for a smaller serving. | That recipe didn't fit your BLENDi's cup (more volume than it holds). Try asking for a smaller serving. |

Varredura dos outros textos (locales do app, mensagens e prompts da API, `packages/shared`):

- Nenhum outro texto mostrado à pessoa cita proteína como limite do copo.
- Só restavam dois comentários de código no app (`pulseAi.service.ts` e `pantryScanner.service.ts`), que diziam "proteína ou volume". Foram corrigidos.
- Comentários que registram a remoção do teto (CP-B2) ficaram como estão.

## Tarefa 3: textos neutros para quem não tem BLENDi (app)

Uma função única decide a variante: `resolveBlenderTextKey(key, blendiOwnership)`, em `apps/mobile/src/utils/blenderText.utils.ts`.

- **Regra:**
  - `'other'` e `'none'` recebem a variante neutra;
  - `'blendi'` ou ausente (contas anteriores ao campo) recebem a chave original;
  - chaves fora da lista passam iguais.
- **Lista única:** `NEUTRAL_BLENDER_TEXT_KEYS`, com tipo `satisfies Partial<Record<TranslationKey, TranslationKey>>`. Todas as chaves passam pela checagem estrita do `t()`, sem cast.

| Texto | Variante neutra (pt-BR / en) | Onde a variante é escolhida |
|---|---|---|
| `errors.pulseai_dietary_restriction_unmet` | …respeite a sua dieta e o seu liquidificador portátil desta vez… / …fits your diet and your portable blender this time… | PulseAIScreen, mensagem de erro do chat |
| `errors.pulseai_blender_limit_unmet` | Essa receita não coube no copo do seu liquidificador portátil… / …didn't fit your portable blender's cup… | idem |
| `errors.scanner_dietary_restriction_unmet` | …e o seu liquidificador portátil com esses ingredientes… / …and your portable blender with these ingredients… | PantryScannerScreen, toasts e mensagens de erro |
| `errors.scanner_blender_limit_unmet` | …que caiba no copo do seu liquidificador portátil… / …into your portable blender's cup… | idem |
| `pulseAi.goals.<goal>.welcomeSubtitle` (5 goals) | "seu modelo BLENDi" → "seu liquidificador portátil" / "your BLENDi model" → "your portable blender" | PulseAIScreen, boas-vindas |
| `blend.cleanReminder` | Hora de limpar seu liquidificador portátil / Time to clean your portable blender | CleaningReminder |
| `profile.fields.model` | Meu liquidificador / My blender | MeScreen, rótulo da linha do modelo |
| `me.edit.modelTitle` | Seu Liquidificador / Your Blender | EditSettingSheet, título da folha de troca de modelo (prop `blendiOwnership`, passada pelo MeScreen) |

Notas de implementação:

- **Erros:** os códigos da API e o mapeamento código → chave nos services não mudaram. A variante é escolhida na tela, no ponto em que a mensagem é mostrada.
- **Valor da conta nos handlers:** os handlers de erro do Pulse AI e do Pantry leem `blendiOwnership` por um ref, atualizado a cada render a partir da store. Pôr o valor nas dependências dos `useEffect` do Pantry poderia disparar a análise de novo.
- **Rótulo do modelo no Me:**
  - Para essas contas, o valor da linha já era "Outro modelo" ou "Ainda não tenho um BLENDi". Ao lado de "Meu BLENDi" ficava contraditório, por isso o rótulo vira "Meu liquidificador".
  - O valor em si é texto de escolha de modelo e não mudou.
  - O título da folha de troca (`me.edit.modelTitle`, "Seu Modelo BLENDi") também ganhou a variante neutra, a pedido do Gabriel depois da primeira entrega: 'other' e 'none' leem "Seu Liquidificador" / "Your Blender". As opções da folha não mudaram.
- **Fora do escopo, sem mudança:**
  - passos da Home (CP-A);
  - escolha de modelo no onboarding e no Me;
  - medalhas de modelo e fatos da marca;
  - "BLENDi Pulse", `brandWordmark`, `defaultUser` ("Usuário BLENDi").

## Tarefa 4: testes e verificação

| Verificação | Resultado |
|---|---|
| `pnpm typecheck` (shared, api, mobile) | limpo |
| `pnpm lint` (api, mobile) | limpo |
| API (`pnpm test`) | 938/938 (antes 930; +8) |
| Mobile (`jest`) | 922/922 em 47 suítes (antes 862 em 46; +60) |

Testes novos:

- **`apps/api/src/utils/recipeContent.cpB4.test.ts` (8):**
  - a mensagem de nova tentativa tem a ordem de redução, a regra do pó, a de manter o valor pedido, o aviso só quando o valor falta e a conferência dos macros;
  - isso vale em 4 contextos: sem contexto, en métrico, pt-BR imperial e pt-BR sem BLENDi. Em todos, a mensagem é enviada em inglês;
  - a ordem de redução vem antes da regra do aviso;
  - a mensagem não cita proteína como limite;
  - as duas linhas novas do prompt aparecem no Pulse AI em 4 perfis e não aparecem no Pantry.
- **`apps/mobile/src/utils/blenderText.utils.test.ts` (55):**
  - a lista única cobre exatamente os 12 textos;
  - para cada texto, `'blendi'` e ausente veem a chave original, com "BLENDi", em en e pt-BR;
  - `'other'` e `'none'` veem a variante, sem "BLENDi", em en e pt-BR;
  - chaves sem variante passam iguais;
  - os 2 erros de copo não citam proteína/protein em nenhuma variante;
  - o texto exato do erro corrigido.
- **`apps/mobile/src/components/me/EditSettingSheet.test.tsx` (+5):** a folha de modelo mostra `me.edit.modelTitle` para 'blendi' e ausente, `me.edit.modelTitleGeneric` para 'other' e 'none', e a folha de goal não muda com a posse.

Expectativas de testes existentes alteradas: **nenhuma** anterior ao CP-B4. No teste novo do CP-B4, o exemplo de "chave sem variante" era `me.edit.modelTitle`; virou `me.edit.goalTitle` quando o título ganhou variante.

- Dois testes antigos garantem que a mensagem de nova tentativa não fala em "g of protein": `pulseAi.blenderLimits.test.ts` ("volume acima (600 ml) → retry…") e `recipeVolume.utils.test.ts` ("acima do volume…").
- Eles falharam com o primeiro rascunho, que usava o exemplo "70 g of protein".
- O exemplo virou "70 g protein or 600 kcal", e os testes ficaram como estavam.

## Teste ao vivo (lote 7)

Método da auditoria:
- API local, banco `test` do Atlas, Gemini real;
- contas descartáveis, apagadas no fim: DELETE 200 em todas, e o Mongo confirma 0 contas e 0 documentos ligados, nas duas rodadas;
- itens 159 a 166 em `.audit/receitas-ia-2026-11-16.json`, `batch: 7`, com duas entradas em `meta.runs`.

A pergunta do Lite métrico en foi feita em inglês ("shake with 70 g of protein"), no idioma da conta. O volume é o do leitor do backend; "1ª resposta" é o volume que disparou a nova tentativa.

### Rodada 1 (itens 159-162): só a ordem de redução e a regra do pó

| Pedido | Conta | Pedido × entregue | Volume | Nova tentativa | Aviso |
|---|---|---|---|---|---|
| shake com 70 g de proteína | Lite imperial pt-BR | 70 g × **71 g** | 338 ml (1ª: 408) | sim | não (certo) |
| shake with 70 g of protein | Lite métrico en | 70 g × **60,2 g** | 370 ml | não | não (**errado**: faltou o valor e não avisou) |
| shake with 60 g of protein | Pro+ imperial en | 60 g × **60,1 g** | 310 ml (1ª: 448) | sim | **sim (errado)**: "You asked for 60 g… this recipe delivers 60.1 g…" |
| shake com 900 kcal | Lite imperial pt-BR | 900 × 827 kcal | 329 ml (1ª: 438) | sim | sim (certo), "13,5 fl oz" |

Duas falhas:
- no métrico, a IA pôs **70 g de whey**, ou seja, tomou o peso do pó pelos gramas de proteína, e entregou ~60 g sem nova tentativa (a receita cabia);
- no Pro+, o aviso foi preenchido mesmo com o valor atendido.

Daí as duas instruções acrescentadas na Tarefa 1.

### Rodada 2 (itens 163-166): com as duas instruções a mais

| Pedido | Conta | Pedido × entregue | Volume | Nova tentativa | Aviso |
|---|---|---|---|---|---|
| shake com 70 g de proteína | Lite imperial pt-BR | 70 g × **70,1 g** | 309 ml (1ª: 454) | sim | não (certo) |
| shake with 70 g of protein | Lite métrico en | 70 g × **75,4 g** | 350 ml | não | não (certo) |
| shake with 60 g of protein | Pro+ imperial en | 60 g × **60,1 g** | 352 ml (1ª: 425) | sim | não (certo) |
| shake com 900 kcal | Lite imperial pt-BR | 900 × 625 kcal | 323 ml (1ª: 506) | sim | sim (certo), "13,5 fl oz" |

- **Proteína:** os 3 pedidos foram entregues com o valor e sem aviso. Nas receitas finais, o whey responde pela maior parte da proteína (2 3/4 oz, 75 g e 2 oz).
- **900 kcal:** continuou com aviso, com 625 kcal. Na rodada 1 vieram 827, e no lote 6 vieram 612. A variação é da IA. Ela ainda mira cerca de 80% do copo, abaixo dos ~90% pedidos.

## Medição (lote 8): 15 pedidos com valor explícito, sem mudança de código

Mesmo método. Itens 167 a 182 em `.audit/receitas-ia-2026-11-16.json`, `batch: 8`.
- **Contas:** 12 contas novas, todas Muscle/maintain sem dieta, uma por combinação de modelo, idioma e unidade.
- **Repetição:** o item 180 terminou em 503 do provedor nas 2 tentativas, então o mesmo pedido foi repetido numa conta nova (item 182). Os 15 pedidos foram medidos.
- **Limpeza:** DELETE 200 em todas as contas, e o Mongo confirma 0 contas e 0 documentos ligados.

"Cabe" segue uma referência de densidade praticável (~2,5 kcal/ml, ~0,35 g de carboidrato/ml, ~0,3 g de proteína/ml). O leitor de volume aceitaria quase todos, porque o pó conta pelo peso.

| # | Conta | Pedido | Cabe? | Entregue | Volume (1ª) | Nova tentativa | Aviso |
|---|---|---|---|---|---|---|---|
| 167 | Lite pt-BR métrico | 50 g proteína | sim | 50 g (100%) | 360 (455) | sim | não |
| 168 | Lite en imperial | 90 g proteína | sim | 74,3 g (83%) | 313 (442) | sim | sim |
| 169 | Lite pt-BR imperial | 160 g proteína | não | 154 g (96%) | 315 (506) | sim | sim |
| 170 | Lite en métrico | 600 kcal | sim | 563 kcal (94%) | 350 (440) | sim | sim |
| 171 | Lite pt-BR métrico | 1300 kcal | não | 1248 kcal (96%) | 385 (580) | sim | sim |
| 172 | Lite en imperial | 70 g carbo | sim | 71 g (101%) | 366 | não | não |
| 173 | Pro+ en métrico | 80 g proteína | sim | 83,3 g (104%) | 390 | não | não |
| 174 | Pro+ pt-BR imperial | 700 kcal | sim | 707 kcal (101%) | 299 (489) | sim | não |
| 175 | Pro+ en imperial | 180 g carbo | não | 143,9 g (80%) | 345 (439) | sim | sim |
| 176 | Pro+ pt-BR métrico | 100 g carbo | sim | 100 g (100%) | 350 (460) | sim | não |
| 177 | Steel en métrico | 120 g proteína | sim | 118,9 g (99%) | 510 | não | **sim** |
| 178 | Steel pt-BR métrico | 1000 kcal | sim | 1053 kcal (105%) | 500 (630) | sim | não |
| 179 | Steel en imperial | 2000 kcal | não | 1488 kcal (74%) | 442 (762) | sim | sim |
| 182 | Steel pt-BR imperial | 150 g carbo | sim | 150,8 g (101%) | 571* | não | não |
| 181 | Steel en métrico | 250 g proteína | não | 205 g (82%) | 600 | não | sim |

\* O leitor contou 0 para "2 bananas", porque um item sem medida conta 0. O volume real passa dos 600 ml.

### As 3 contagens pedidas

- **Aviso falso (valor atendido e aviso mesmo assim):**
  - **1 de 15, no sentido estrito.** O item #177 entregou 118,9 g de 120 g (99%), ocupando 510 de 600 ml, e o aviso culpou o copo.
  - Com uma régua mais larga (entregue ≥ 90%), entram mais 3 avisos: #169 (96%), #170 (94%) e #171 (96%). Esses avisos dizem a verdade sobre um pequeno déficit, então não os conto como falsos.
  - Mas o #170 (600 kcal no Lite) cabia: a receita ficou com 350 ml e sobravam 50.
- **Valor não atendido sem aviso: 0 de 15.**
- **Confusão entre peso do pó e gramas do macro: 0 de 15.**
  - Nos 6 pedidos de proteína, o pó ficou acima do valor pedido quando era a única fonte (90 g → 113 g de pó; 160 g → 170 g), ou os outros ingredientes completaram (80 g de whey + iogurte → 83,3 g).
  - Os macros da IA batem com essa composição.

### Outros achados

- **Cabia, e veio abaixo com aviso:** 2 de 10.
  - **#168, 90 g de proteína no Lite:** veio com 74,3 g, em 313 ml. Mais 20 g de pó cabiam.
  - **#170, 600 kcal no Lite:** veio com 563 kcal, em 350 ml.
  - Nos dois, o aviso culpa o copo, mas o déficit é da IA. Ela continua mirando ~80-90% do copo e corta um pouco além do necessário.
- **Não cabia (pela referência):**
  - Os 5 vieram com aviso (#169, #171, #175, #179, #181).
  - Dois chegaram a 96% do valor (#169, 154 de 160 g de proteína; #171, 1248 de 1300 kcal). A referência de densidade foi conservadora: a IA pôs 1248 kcal em 385 ml (3,2 kcal/ml).
- **Calorias e carboidrato que cabiam:** 5 de 6 atendidos, sem aviso (#172, #174, #176, #178, #182). A exceção é o #170.
- **Unidades:** os avisos seguem o sistema da conta ("13.5 fl oz", "400 ml", "20.2 fl oz", "600ml"). O aviso misturando unidades, visto no lote 7, não se repetiu.


- **Amostra pequena:** 1 pedido por caso em cada rodada. A rodada 1 mostrou que a IA pode confundir o peso do pó com os gramas do macro. A instrução nova resolveu na rodada 2, mas não há checagem no backend para isso.
- **Aviso com valor atendido:** só é evitado pelo texto do prompt. Uma checagem no backend (descartar `capacityNotice` quando os macros alcançam o valor pedido) exigiria extrair o valor da mensagem da pessoa. Não foi feita.
- **Aviso fora do sistema de unidades:** o aviso falso da rodada 1 misturava "13.5 fl oz" com "360 ml" numa conta imperial. Não se repetiu na rodada 2.
- **Textos da Home:** os passos ("ao copo do BLENDi") ficam para o CP-A.
