# CP1.1.8 — Step Mode + Pool de Receitas da Home

**Entrega:** Modo de blend passo a passo (Step Mode) dentro da BlendScreen, com reaproveitamento do timer existente para a etapa final de bater; e expansão do conteúdo fixo da Home de 1 receita por goal para um pool de 20 receitas por goal (80 no total) com rotação diária determinística, sem backend e sem storage.

**Tempo estimado:** 5 a 7 horas.

```
CONTEXTO

O app hoje não tem nenhum conceito de "passos estruturados" de receita em
lugar nenhum do código. Toda receita — gerada por IA (Pulse AI), favoritada
ou a receita fixa da Home — tem só um campo de texto único chamado
blendInstruction: um parágrafo livre gerado pelo backend (ou escrito à mão
na Home), exibido uma única vez antes do usuário iniciar o blend. A tela
de blend ativo (BlendScreen) nunca mostra esse parágrafo: ela só mostra um
timer circular contínuo contando o tempo total de preparo.

Foi decidido com o Gabriel que o Step Mode vai usar passos estruturados de
verdade (não apenas quebrar o parágrafo existente em frases), e que ele vai
viver dentro da própria BlendScreen, como uma visão alternativa ao timer
único — o usuário escolhe entre "Timer" e "Passos" no início do blend.

Durante o planejamento também ficou decidido expandir o conteúdo fixo da
Home: hoje cada goal (Muscle, Wellness, Energy, Recovery) tem exatamente
1 receita fixa, hardcoded, sem nenhuma rotação. Isso vai se tornar um pool
de 20 receitas por goal, com uma receita diferente escolhida todo dia de
forma determinística (mesmo dia = mesma receita para todo mundo, sem
chamada de backend, sem estado salvo — o mesmo espírito 100% client-side
que o DailyRecipeCard já usa hoje).

As 80 receitas (4 goals x 20) já foram integralmente escritas e validadas
por script antes deste prompt — não é para o Claude Code inventar ou gerar
o conteúdo das receitas. Elas vêm em 3 arquivos anexos a este prompt:

- daily-recipes-data.ts — o literal TypeScript completo da nova constante
  DAILY_RECIPES (um array de 20 objetos por goal, cada um já com nameKey,
  protein, carbs, fat, calories, durationMinutes, ingredients e steps
  referenciando chaves de tradução).
- i18n-additions-en.json — todas as chaves novas de tradução em inglês
  (852 chaves) que esse TypeScript referencia.
- i18n-additions-pt-BR.json — as mesmas 852 chaves, em português.

A receita #1 de cada goal nesses arquivos É a receita que já existe hoje em
produção (mesmos valores de macro, mesmos ingredientes, mesma nameKey) —
ela foi preservada exatamente como está, só ganhou passos novos (que não
existiam antes). As 19 receitas seguintes de cada goal são o conteúdo novo.

A matemática de macro de cada receita nova foi derivada ingrediente a
ingrediente (não inventada a partir de uma caloria redonda) e validada por
script: a equação calories = 4*protein + 4*carbs + 9*fat fecha dentro de
±10% em todas as 80 receitas — a mesma tolerância que buildCalorieEquationCheckSection
já usa para validar receitas geradas pela IA no backend. Também foi
validado por script que não há nome de receita duplicado dentro do mesmo
goal, e que toda receita tem entre 3 e 5 passos.

Os passos de pulso (pulseCount) só aparecem em receitas que usam algum
ingrediente congelado ou gelo — nessas, existe um passo específico de
"pulse N vezes para quebrar o congelado" com uma contagem alvo.

OBJETIVO

Implementar o Step Mode como visão alternativa ao timer dentro da
BlendScreen, reaproveitando os componentes de timer já existentes sem
modificá-los; e substituir a receita fixa única da Home por um pool de 20
receitas por goal com rotação diária determinística — entregando o
conteúdo das 80 receitas (já escrito e validado) exatamente como veio nos
arquivos anexos, sem reescrever nomes, ingredientes, macros ou passos.

TAREFA 1 — Schemas compartilhados (packages/shared)

No arquivo que define o tipo e o schema Zod de PulseAiRecipe, adicione um
campo novo, opcional, chamado steps: um array de objetos, cada um com um
campo text (string, obrigatório dentro do objeto) e um campo pulseCount
(number, opcional dentro do objeto). Esse campo é aditivo — não altere
nenhum campo que já existe (blendInstruction continua existindo e continua
obrigatório, sem mudança de comportamento).

Faça o mesmo campo steps (mesmo formato, opcional) no schema e no tipo de
FavoriteItem, para que uma receita favoritada também possa carregar seus
passos.

TAREFA 2 — Modelo Mongoose Favorite (apps/api)

No modelo Favorite, adicione um campo opcional steps: um array de
subdocumentos (sem _id próprio, no mesmo padrão já usado pelo array de
ingredients desse mesmo modelo), cada subdocumento com text (String,
obrigatório dentro do subdocumento, trim) e pulseCount (Number, opcional,
mínimo 1). Esse campo não deve ser obrigatório no documento Favorite como
um todo, para não quebrar favoritos que não tenham passos.

TAREFA 3 — Geração de receita por IA (apps/api)

No serviço que monta os prompts para o Gemini (tanto a estrutura de
receita única quanto a estrutura de array de receitas do pantry), adicione
ao JSON que a IA deve retornar um campo novo steps: um array de objetos
com text e, quando aplicável, pulseCount. Adicione também uma regra de
comportamento nova nas instruções do prompt, no mesmo estilo das regras já
existentes (como a que já pede para personalizar o blendInstruction):
a IA deve gerar entre 3 e 5 passos por receita, no mesmo idioma do resto da
resposta, e incluir pulseCount (um número inteiro de pulsos) somente em
passos que envolvam adicionar gelo ou fruta congelada — todos os outros
passos não devem ter esse campo. O campo blendInstruction continua sendo
pedido exatamente como já é hoje; steps é aditivo, não substitui nada.

TAREFA 4 — Nova dependência (apps/mobile)

Adicione a dependência expo-keep-awake ao apps/mobile (versão compatível
com a versão atual do Expo SDK usada no projeto). Essa biblioteca ainda
não existe no projeto.

TAREFA 5 — Pool de receitas da Home (apps/mobile)

No componente DailyRecipeCard, a constante DAILY_RECIPES hoje é um
Record<UserGoal, DailyRecipe> (uma receita fixa por goal). Substitua pelo
conteúdo completo do arquivo anexo daily-recipes-data.ts, que já é um
Record<UserGoal, DailyRecipe[]> (20 receitas por goal) — copie esse
literal exatamente como está, sem alterar nomes, números ou chaves de
tradução.

Para isso funcionar, ajuste os tipos:
- O tipo DailyRecipe precisa ganhar um campo novo: steps, um array de
  objetos com textKey (uma chave de tradução, tipada como TranslationKey
  igual nameKey e as chaves de ingrediente) e pulseCount (number,
  opcional).
- O campo nameKey do tipo DailyRecipe hoje é uma união fechada de 4
  valores específicos (uma por goal). Como agora existem 80 chaves de
  nome diferentes, esse campo deve passar a ser tipado como TranslationKey
  de forma genérica, sem a união fechada.

Troque a lógica de seleção da receita do dia: hoje o componente faz
recipe = DAILY_RECIPES[goal] diretamente. Troque para calcular o pool
(DAILY_RECIPES[goal]), calcular quantos dias se passaram desde a época
Unix dividindo Date.now() (milissegundos) por 86400000 (quantidade de
milissegundos em um dia) e arredondando para baixo, e usar o resto da
divisão desse número pelo tamanho do pool (pool.length, que vai ser 20)
como índice para escolher a receita — sem nenhuma chamada de rede, sem
nenhum estado salvo, exatamente como o resto deste componente já funciona
hoje.

Ajuste handleStartBlendPress para montar também o campo steps do
PulseAiRecipe enviado para onStartBlend, resolvendo cada textKey do passo
escolhido através da função t() (o mesmo padrão já usado para resolver
nameKey e as chaves de ingrediente), preservando a ordem dos passos e
repassando pulseCount quando existir.

Os campos blendInstruction e tip continuam usando exatamente as mesmas
chaves compartilhadas que já existem hoje (home.dailyRecipeBlendInstruction
e home.dailyRecipeTip) para as 80 receitas — não crie uma chave de
blendInstruction ou tip nova por receita. Essa é uma simplificação
deliberada: nenhum dos dois campos é exibido em lugar nenhum do fluxo de
blend a partir da Home hoje, então não há ganho em escrever 80 parágrafos
que não aparecem na tela.

TAREFA 6 — Arquivos de tradução (apps/mobile)

Os arquivos anexos i18n-additions-en.json e i18n-additions-pt-BR.json
trazem as chaves novas no formato "home.dailyRecipeMuscle02Name": "...".
Esse prefixo "home." indica onde a chave deve entrar — remova o prefixo
"home." de cada chave e insira o restante como uma propriedade nova dentro
do objeto "home" que já existe em locales/en.json (usando os valores de
i18n-additions-en.json) e em locales/pt-BR.json (usando os valores de
i18n-additions-pt-BR.json). Não crie uma chave literal "home.algumaCoisa"
no nível raiz do arquivo — o ponto é só uma notação, não faz parte do nome
real da chave dentro do JSON. Mantenha a ordenação e formatação já usadas
nesses arquivos.

TAREFA 7 — BlendScreen: alternância Timer / Passos (apps/mobile)

Adicione um estado novo viewMode, do tipo 'timer' | 'steps', com valor
inicial 'timer'. Quando activeRecipe tiver um array steps não vazio,
mostre um controle de alternância (um segmented control ou duas abas, no
estilo visual já usado em outros controles do app) entre "Timer" e
"Passos", posicionado no topo da tela, acima do que já existe hoje. Quando
activeRecipe não tiver steps (receitas antigas, ou receitas de IA geradas
antes dessa mudança), não mostre esse controle — o comportamento deve ser
idêntico ao que já existe hoje nesse caso.

Quando viewMode for 'timer', mantenha o comportamento atual sem nenhuma
alteração (TimerCircle + TimerControls como já é hoje).

Quando viewMode for 'steps', renderize o novo componente StepModeView (ver
TAREFA 8) no lugar do TimerCircle. Quando o usuário terminar de percorrer
todos os passos de preparo dentro do StepModeView, a tela deve passar a
mostrar o mesmo TimerCircle + TimerControls de sempre, com a mesma duração
(prepTimeSeconds) que o modo timer já usa — ou seja, os passos de preparo
acontecem antes, e o cronômetro de bater continua sendo o mesmo componente
existente, sem duplicar lógica de timer.

Ative expo-keep-awake enquanto a BlendScreen estiver montada (em qualquer
viewMode, não só em 'steps') — a tela deve permanecer acesa durante
qualquer blend ativo, hoje isso não acontece em nenhum modo.

TAREFA 8 — Novo componente StepModeView (apps/mobile)

Crie apps/mobile/src/components/blend/StepModeView.tsx. Esse componente
recebe a lista de steps da receita ativa (cada um já com text resolvido e,
quando houver, pulseCount) e uma função de callback para avisar quando o
usuário terminou o último passo.

Mostra um passo por vez, em texto grande e legível, com um contador de
posição (algo como "Passo 2 de 4", traduzido). Tem navegação para avançar
e voltar entre os passos.

Quando o passo atual tiver pulseCount, mostra também um contador de toque:
a cada toque do usuário num botão/área de pulso, incrementa uma contagem
local (por exemplo "Pulso 3 de 8") e dispara o mesmo tipo de feedback
háptico (via expo-haptics) que a BlendScreen já usa hoje em outras
interações — siga o estilo e a intensidade já usados no arquivo existente,
em vez de introduzir um novo padrão. Esse contador é só uma referência
visual para o usuário: atingir a contagem alvo não é obrigatório para
avançar, o botão de avançar deve continuar disponível independentemente do
valor atual do contador, para não travar ninguém que bater um número
diferente de pulsos na prática.

Ao avançar a partir do último passo da lista, o componente chama o
callback de conclusão (que a BlendScreen usa para trocar para a exibição
do TimerCircle, como descrito na TAREFA 7) — o StepModeView não inicia
nenhum timer por conta própria.

TAREFA FINAL — Achados fora do escopo

Durante a implementação, documente em um bloco separado (fora do código)
qualquer coisa relevante encontrada fora do escopo explícito deste prompt:
inconsistências nos arquivos de tradução existentes, problemas de tipo que
apareçam ao generalizar nameKey, qualquer tela ou fluxo que dependa do
formato antigo de DAILY_RECIPES (Record<UserGoal, DailyRecipe> sem array)
e que precise de ajuste não previsto aqui, ou qualquer outro ponto que
mereça um CP futuro.

REQUISITOS

- Nenhuma alteração nos campos protein, carbs, fat, calories, durationMinutes,
  nameKey, ingredients ou nos valores das 80 receitas vindas dos arquivos
  anexos — copie exatamente como está.
- blendInstruction e tip continuam sendo campos obrigatórios em
  PulseAiRecipe e FavoriteItem exatamente como já são hoje — a TAREFA 1 só
  adiciona steps, não torna nada opcional que já era obrigatório nem altera
  comportamento de nada existente.
- steps deve ser opcional em todos os lugares (schemas compartilhados,
  modelo Favorite, tipo DailyRecipe) para que qualquer receita, favorito ou
  fluxo que já exista sem passos continue funcionando sem nenhuma alteração
  de comportamento visível.
- O controle de alternância Timer/Passos na BlendScreen só aparece quando
  existem passos; sem passos, o comportamento é idêntico ao atual.
- A rotação diária da Home é inteiramente client-side (sem chamada de
  rede, sem AsyncStorage, sem estado persistido) — mesmo dia do calendário
  do aparelho = mesma receita para qualquer usuário com aquele goal.
- Todos os textos novos (passos, mensagens do StepModeView, label do
  controle de alternância) precisam existir em en.json e pt-BR.json.
- expo-keep-awake deve ficar ativo durante toda a montagem da BlendScreen,
  nos dois viewMode, e ser desativado quando a tela desmontar (comportamento
  padrão do hook useKeepAwake ao desmontar já cobre isso).

NÃO FAÇA

- Não gere, invente ou reescreva o conteúdo das 80 receitas — ele já foi
  escrito e validado fora deste prompt; use exatamente o que está nos
  arquivos anexos.
- Não crie uma chave de blendInstruction ou tip nova por receita — as 80
  receitas continuam reaproveitando as duas chaves compartilhadas que já
  existem.
- Não modifique TimerCircle nem TimerControls — eles devem ser
  reaproveitados sem alteração.
- Não torne a contagem de pulsos (pulseCount) um bloqueio para avançar de
  passo.
- Não altere nenhuma outra tela, fluxo de autenticação, ou qualquer parte
  do app fora dos arquivos listados nas tarefas acima.
- Não adicione nenhuma chamada de backend para escolher a receita do dia
  na Home — a lógica é inteiramente local.

CRITÉRIOS DE ACEITE

- As quatro receitas que já existem em produção hoje (uma por goal)
  continuam com exatamente os mesmos valores de macro, mesmos ingredientes
  e mesmo nome — só ganharam passos novos.
- Cada goal tem 20 receitas no pool, e a receita exibida na Home muda de
  acordo com o dia do calendário do aparelho, de forma determinística
  (mesmo dia = mesma receita, sem variar entre reaberturas do app no mesmo
  dia).
- Um blend iniciado a partir de qualquer uma das 80 receitas da Home chega
  na BlendScreen com steps preenchido e o controle de alternância
  Timer/Passos visível.
- Alternar para "Passos" mostra os passos da receita um por vez, com
  contador de posição, navegação para frente/trás, e contador de pulso com
  feedback háptico nos passos que têm pulseCount.
- Terminar os passos leva ao mesmo TimerCircle/TimerControls existente,
  com a mesma duração que o modo "Timer" usaria.
- Uma receita de IA ou um favorito sem steps abre a BlendScreen sem
  nenhuma alternância visível e com o comportamento idêntico ao atual.
- A tela permanece acesa durante um blend ativo, em qualquer viewMode.
- O schema compartilhado, o modelo Favorite e o prompt da IA aceitam o
  campo steps sem quebrar nenhum teste ou validação já existente.
- Nenhum teste existente quebra; novos testes cobrem a seleção
  determinística da receita do dia e a navegação do StepModeView.
```
