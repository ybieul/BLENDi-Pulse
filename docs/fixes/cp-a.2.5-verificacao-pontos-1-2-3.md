# CP-A.2.5 — Verificação de 2 pontos da revisão do CP-A.2.4

Verificação feita de fora sobre a seção "Revisão (CP-A.2.4)" do documento consolidado [cp-a.2-macros-complementares.md](cp-a.2-macros-complementares.md). Encontrou problema em 2 dos 3 pontos daquela revisão. Este documento é novo — não altera o documento consolidado. Nenhum código (`.ts`) foi alterado nesta tarefa.

## Ponto 1 — erro aritmético na frase de resolução (CORRIGIDO)

**O que o CP-A.2.4 disse** ([cp-a.2-macros-complementares.md:271](cp-a.2-macros-complementares.md#L271)):

> `DAILY_FAT_TARGET_MIN`/`MAX` sempre estiveram no único bloco de import (`User.ts:16-27`), junto com as outras 7 (hoje 9, depois da Tarefa 3 abaixo) constantes de `@blendi/shared`.

**Verificação contra o import real**, lido agora em [`apps/api/src/models/User.ts:16-27`](../../apps/api/src/models/User.ts#L16-L27):

```ts
import {
  DAILY_CALORIE_TARGET_MAX,       // 17
  DAILY_CALORIE_TARGET_MIN,       // 18
  DAILY_CARB_TARGET_MAX,          // 19
  DAILY_CARB_TARGET_MIN,          // 20
  DAILY_FAT_TARGET_MAX,           // 21
  DAILY_FAT_TARGET_MIN,           // 22
  DAILY_PROTEIN_TARGET_VALIDATION_MAX,  // 23
  DAILY_PROTEIN_TARGET_VALIDATION_MIN,  // 24
  MAX_PLAUSIBLE_AGE_YEARS,        // 25 — Tarefa 3 do CP-A.2.3
  MIN_PLAUSIBLE_AGE_YEARS,        // 26 — Tarefa 3 do CP-A.2.3
} from '@blendi/shared';
```

São **10 constantes no total**, confirmando a contagem já documentada em [cp-a.2-macros-complementares.md:208](cp-a.2-macros-complementares.md#L208) ("as 8 ligadas a macros... e as 2 de idade plausível"). `DAILY_FAT_TARGET_MIN`/`MAX` são **2 dessas 10** (linhas 22 e 21).

A conta certa:
- **Hoje**, excluindo gordura: 10 − 2 = **8** constantes, não 9.
- **Na origem** (antes da Tarefa 3 do CP-A.2.3 adicionar `MAX_PLAUSIBLE_AGE_YEARS`/`MIN_PLAUSIBLE_AGE_YEARS`, linhas 25-26): o bloco tinha só as 8 ligadas a macro (linhas 17-24). Excluindo gordura: 8 − 2 = **6**, não 7.

A frase "outras 7 (hoje 9)" erra por 1 em cada um dos dois números. A frase correta é:

> ...junto com as outras **6 (hoje 8)**, depois da Tarefa 3 abaixo, constantes de `@blendi/shared`.

A substância do Ponto 1 permanece correta e não muda: o import real de 10 constantes existe, gordura está nas linhas 21-22, `tsc --noEmit` compila limpo (não reexecutado aqui — não é o que estava em questão; o erro era só na frase, não no comportamento do código). Só a conta da frase de resolução estava errada.

## Ponto 2 — cronologia de `targetWeight`: permanece indeterminada

**O que o CP-A.2.4 concluiu** ([cp-a.2-macros-complementares.md:273-279](cp-a.2-macros-complementares.md#L273-L279)): que a cronologia estava "confirmada por citação literal", citando como "o texto original, exato, do achado 1 daquela primeira versão do CP-A.2":

> 1. **`calculateMacrosSchema.targetWeight` não tem piso de 20kg** (só `.positive()`), ao contrário de `updateUserSchema.targetWeight` (20–300kg) — mesma assimetria entre os dois schemas de peso já registrada como achado incidental no CP-A.1 para `weight`, agora repetida para `targetWeight`.

**Por que isso NÃO constitui prova auditável:**

**(a) Não existe nenhuma trilha de commit para verificar quando esse texto foi escrito.** Rodado agora (2026-10-16):

```
$ git log --all --oneline -- docs/fixes/cp-a.2-macros-complementares.md
(saída vazia)

$ git ls-files docs/fixes/
(saída vazia — o diretório inteiro não está nem rastreado pelo git)

$ git status --short
...
?? docs/fixes/
```

Zero commits, em qualquer branch, para este arquivo — e o arquivo nem chegou a ser adicionado ao índice do git (`git ls-files` vazio, `git status` marca `docs/fixes/` inteiro como `??`/untracked). Não existe nenhuma trilha externa e verificável de quando o texto citado foi escrito pela primeira vez. A única "fonte" por trás da citação do CP-A.2.4 é a memória da própria sessão sobre sua escrita anterior — isso é autoatestação, não uma citação auditável por terceiros.

**(b) A frase do CP-A.2.2 usada como apoio é ambígua.** Em [cp-a.2-macros-complementares.md:113](cp-a.2-macros-complementares.md#L113):

> a instância de `targetWeight` foi registrada no próprio CP-A.2

Essa frase admite duas leituras:
- "antes do CP-A.2.2 existir" — ou seja, na primeira versão do arquivo, antes de qualquer revisão; **ou**
- simplesmente "neste documento chamado CP-A.2" — o arquivo `cp-a.2-macros-complementares.md` inteiro, nome usado em todas as revisões (2.1 a 2.4), já que a convenção declarada deste documento ([linha 7](cp-a.2-macros-complementares.md#L7)) é precisamente "atualizado em linha nas 4 revisões, sem criar arquivo novo fragmentado" — isto é, tudo o que está neste arquivo, incluindo o que a auditoria do CP-A.2.2 escreveu, é "o CP-A.2".

Nada no texto da linha 113 resolve essa ambiguidade a favor da primeira leitura.

**O texto citado é consistente com a redação antiga, mas consistência não é prova.** A citação do CP-A.2.4 contém a expressão "agora repetida" — exatamente a palavra que a nota "Correção de redação (CP-A.2.3)" ([cp-a.2-macros-complementares.md:302](cp-a.2-macros-complementares.md#L302)) diz ter sido removida da versão atual do mesmo achado (comparar com o texto atual do achado 1 em [linhas 298-300](cp-a.2-macros-complementares.md#L298-L300), que não contém essa palavra). Isso não é evidência de fabricação — mas também não é prova de autenticidade: um texto plausível e consistente com a descrição da correção não é, só por isso, uma cópia literal preservada desde a escrita original.

**Conclusão correta:** a cronologia de `targetWeight` em `calculateMacrosSchema` permanece **indeterminada** entre "CP-A.2 original" (antes do CP-A.2.2) e "CP-A.2.2" (a auditoria que teria sido a primeira a mencioná-lo). Não há evidência auditável disponível — fora da memória da própria sessão que escreveu os documentos — capaz de decidir entre as duas. Este ponto deve ficar registrado como aberto, não como confirmado.

## Ponto 3 — duplicação do cálculo de idade eliminada (RECONFIRMADO, sem mudança)

Reexecução dos mesmos 4 casos de teste de idade (10/13/120/125 anos) usados no CP-A.2.3 e no CP-A.2.4, como regressão pura — nenhuma alteração de código ou de conclusão.

**Método:** script isolado (fora do repositório), executado via `tsx`, importando diretamente `calculateMacrosSchema` real de [`packages/shared/src/schemas/user.ts`](../../packages/shared/src/schemas/user.ts) e `UserModel` real de [`apps/api/src/models/User.ts`](../../apps/api/src/models/User.ts). Para cada idade, construída uma `birthDate` com a mesma data (dia/mês) de hoje, N anos atrás — garantindo idade exata N no momento do teste. Para o Zod, checado o campo `birthDate` isoladamente via `safeParse`; para o Mongoose, checado `doc.validateSync(['birthDate'])` isoladamente (os demais campos obrigatórios, ausentes no documento de teste, não interferem no resultado do path `birthDate`).

| Idade enviada | `birthDate` usada | Zod (`calculateMacrosSchema`) | Mongoose (`UserModel`) |
|---|---|---|---|
| 10 | 2016-10-16 | REJEITADO | REJEITADO |
| 13 | 2013-10-16 | ACEITO | ACEITO |
| 120 | 1906-10-16 | ACEITO | ACEITO |
| 125 | 1901-10-16 | REJEITADO | REJEITADO |

**Idêntico ao já reportado no CP-A.2.4** ([cp-a.2-macros-complementares.md:289-296](cp-a.2-macros-complementares.md#L289-L296)). Confirmado novamente, nesta verificação, que a cadeia de dependência segue sendo apenas `User.ts -> macroCalculation.utils.ts`: `calculateAge` está definida e exportada em [`apps/api/src/utils/macroCalculation.utils.ts:92`](../../apps/api/src/utils/macroCalculation.utils.ts#L92), importada como valor em [`apps/api/src/models/User.ts:34`](../../apps/api/src/models/User.ts#L34) e usada dentro do validador do Mongoose em `User.ts:613-619` (a lógica de idade plausível, hoje nessas linhas — o número exato de linha pode ter se deslocado desde a citação original do CP-A.2.4 por comentários adicionados depois, mas a estrutura e o comportamento são os mesmos). Nenhuma mudança de comportamento; nenhum código alterado nesta tarefa.

## Veredito

| Ponto | Status |
|---|---|
| 1 — conta da frase de resolução | **Corrigido.** "outras 7 (hoje 9)" → "outras 6 (hoje 8)", com citação de linha exata (`User.ts:16-27`, gordura em 21-22, idade em 25-26). A substância (import de 10 constantes, sem bug de código) não mudou. |
| 2 — cronologia de `targetWeight` | **Permanece indeterminado.** A conclusão de "confirmado por citação literal" não se sustenta: 0 commits auditáveis (confirmado agora via `git log --all` e `git ls-files`) e a frase-fonte do CP-A.2.2 é ambígua entre "antes do CP-A.2.2" e "neste arquivo chamado CP-A.2". Não há como decidir com os recursos disponíveis. |
| 3 — duplicação de cálculo de idade | **Reconfirmado, sem nenhuma mudança.** Os 4 casos de teste (Zod e Mongoose) produzem hoje exatamente o mesmo resultado já reportado no CP-A.2.4. |

**A linha de revisões CP-A.2.x pode ser considerada encerrada** — mas não porque os 3 pontos chegaram à mesma resposta. Os Pontos 1 e 3 foram resolvidos com o máximo de confiança que o código permite (aritmética verificável contra o import real; comportamento verificável por teste real). O Ponto 2 não foi "deixado em aberto por falta de tempo" — ele é **estruturalmente irresolúvel** com os recursos disponíveis: a trilha de trabalho inteira nunca foi commitada (confirmado agora, não só assumido), então não existe e não vai passar a existir retroativamente nenhuma evidência externa capaz de decidir essa cronologia específica. Registrar isso como indeterminado, em vez de forçar uma conclusão, é o encerramento correto para este ponto — não um trabalho pendente. Não sobra nada a investigar aqui; sobra apenas a aceitação de que a resposta é "não se sabe, e não dá para saber".
