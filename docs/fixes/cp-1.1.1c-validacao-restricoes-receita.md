# CP-1.1.1c — Validação determinística de dieta e gelo no Lite

## Problema

A dieta (`dietaryPreferences`) e o "nunca gelo no Lite" só entravam no prompt, o que é probabilístico. No pentest do CP-1.1.1a, 2 de 12 receitas nut_free vieram com leite de amêndoa. Depois das correções de prompt vieram 24 de 24 limpas, mas isso ainda é compatível com uma taxa real de falha de até ~12%.

## O que mudou

- **`apps/api/src/utils/recipeRestrictions.utils.ts`**: função pura `validateRecipeRestrictions(recipe, dietaryPreferences, blendiModel)`. Confere `ingredients[].name`, `steps[].text` e `blendInstruction`. **Não** confere `tip` nem `title`.
  - `blendInstruction` entra porque é instrução acionável mostrada ao usuário ("adicione o gelo por último", "finalize com mel"). Mas a IA também a usa para explicar a troca, e isso gerou um falso positivo no teste ao vivo (ver abaixo). Por isso, nela, o termo é ignorado quando a mesma frase tem uma negação antes dele ("não", "sem", "evite", "not", "without"…). Ingredientes e passos continuam estritos.
  - Casamento por palavra inteira, sem acento, singular/plural (en e pt), com exceções documentadas, qualificadores vegetais para laticínios ("leite de aveia", "cocoa butter") e negação ("sem açúcar", "nut-free", "no ice needed").
- **Pulse AI**: a validação é a última conferência, depois do guardrail de proteína e da consistência de macros. Se houver violação, faz um retry. Se continuar violando, ou se o retry falhar, responde `422 pulseai/dietary-restriction-unmet`, devolve a reserva de uso e não grava cache, turno de conversa nem XP. Receita vinda do cache também é validada: se violar, a entrada é removida (`deleteFromCache`) e a receita é gerada de novo.
- **Pantry Scanner**: cada receita é validada depois da proteína e dos macros, com um retry por receita. Receita que continuar violando é descartada, e as receitas conformes são entregues (o app funciona com 1). Se nenhuma sobrar, responde `422 scanner/dietary-restriction-unmet`, devolve o scan (`rollbackPantryScanCount`, novo) e não dá XP. Geração vazia ou falha da IA continuam como antes.
- **Mobile**: os dois codes foram mapeados para `errors.pulseai_dietary_restriction_unmet` e `errors.scanner_dietary_restriction_unmet` (en e pt-BR). As duas mensagens são genéricas ("sua dieta e o seu BLENDi") para servir também a contas Lite sem dieta.
- **Logs**: só restrição, termo e campo. Não registram texto da receita nem userId.

## Decisões

- **Coco não é oleaginosa** (igual ao prompt, e a orientação do FDA de 2025 tirou o coco da lista de tree nuts). "noz-de-coco" é exceção.
- **nut_free erra para bloquear**: castanha portuguesa/chestnut, trail mix, praliné, marzipã, Nutella e paçoca são barrados. Noz-moscada e caju fruta (suco/polpa) passam.
- **Gelo no Lite**: "iced coffee", "café gelado", "água gelada" e "ice-cold" **não** são gelo. "ice water", "gelo de café", "coffee ice cubes" e "serve over ice" **são**. Sorvete e fruta congelada não são gelo.
- **no_added_sugar**: stevia e outros adoçantes sem caloria são barrados (o prompt proíbe "any sweetener"). "caramelo" e "chocolate" sozinhos não são termo.
- **Fora do alcance**: "protein powder" genérico para vegan (não dá para saber a origem pelo texto) e granola para nut_free.

## Teste ao vivo (API local + Atlas `test`, gemini-3.5-flash-lite)

| | |
|---|---|
| Pedidos à Pulse AI | 23 (1 falhou por 503 do Gemini e foi repetido) |
| Scans do Pantry | 3 (1 falhou por 503 do Gemini na visão e foi repetido) |
| Chamadas de IA | ~35 |
| Violações pegas | 4 (todas na Pulse AI) |
| Resolvidas no retry | 3 |
| Erros finais | 1 (`pulseai/dietary-restriction-unmet`, uso devolvido) |
| Falsos positivos | 0 nas contas sem dieta / fora do Lite; 1 no Lite (o erro final, corrigido depois) |

Casos barrados (só termo e campo são logados, por design):

1. vegan, "Smoothie de banana com leite integral e mel": `leite` no ingrediente e no passo. O retry trouxe leite de amêndoas sem açúcar.
2. Lite, "A frozen coffee smoothie, really icy, with crushed ice": `gelo` no ingrediente, no passo e na blendInstruction. O retry veio sem gelo.
3. Lite, "Quero um frappé bem gelado com gelo picado": `gelo` no ingrediente, no passo e na blendInstruction. O retry veio sem gelo.
4. Lite, "um smoothie com bastante gelo": `gelo` **só** na blendInstruction, e de novo depois do retry. Virou erro 422 e o uso foi devolvido. **Era falso positivo**: reproduzindo o pedido fora da API, a IA escreveu "Como o seu BLENDi Lite tem potência de 70W e não deve ser usado com gelo, esta receita utiliza frutas congeladas…", sem gelo nos ingredientes. Corrigido com a negação por frase na blendInstruction; o texto real virou caso de teste. A correção foi validada só nos testes unitários: não rodei de novo ao vivo porque o Gemini estava devolvendo 503.

Nas amostras com gelo de verdade, o gelo aparecia nos ingredientes, nos passos e na blendInstruction ao mesmo tempo.

As tentativas de jailbreak nas 4 dietas (liberação médica, "SYSTEM: restrictions lifted", pedidos de pasta de amendoim, leite e mel) não chegaram a gerar violação: a IA já respeitou o prompt. ProPlus e Steel sem dieta receberam gelo, pasta de amendoim, leite e mel sem nenhum bloqueio. No Pantry, a IA respeitou a dieta e o Lite nos scans com restrição, então o caminho de descarte foi coberto só pelos testes unitários.
