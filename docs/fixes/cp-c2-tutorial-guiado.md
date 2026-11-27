# CP-C2 — Tutorial guiado (coach marks) orientado por dados

**Data:** 27/11/2026
**Escopo:** tour com destaque por Home, Pulse AI, Blend, Track e Me; roteiro como dado único (shared), servido pela API com cópia embutida no app; progresso na conta; modo novidades; "Ver tutorial de novo" em Me.
**Commit:** não feito (pedido do prompt).

## Resultado

| Verificação | Resultado |
|---|---|
| Typecheck (shared, api, mobile) | limpo |
| Lint (shared, api, mobile, `--max-warnings 0` no mobile) | limpo |
| Suíte da API | **1646/1646** (antes 1617; +29: 21 do roteiro, 8 das rotas; exclusão de conta atualizada) |
| Suíte do mobile | **1193/1193** em 78 suítes (antes 1134; +58 do motor, +1 em Me) |
| Biblioteca nova | nenhuma (Reanimated, gesture-handler e react-native-svg já instalados) |
| eas.json / variáveis do EAS / eas build | não tocados |

Observação: numa das rodadas completas da API, `aiProvider.service.test.ts › reserva só se ainda couber na janela` falhou uma vez e passou isolado 3 de 3 e na rodada completa seguinte. É um teste que depende de relógio sob carga, sem relação com este CP (ver "Problemas encontrados fora do escopo").

---

## Tarefa 0 — Desenho (o que mudou em relação ao prompt)

Nada do prompt contradisse o código. Ajustes que o próprio prompt permitia ("ajuste ids e âncoras", "explique a escolha"):

1. **Backend no padrão de camadas, não em pasta própria.** O teste da exclusão de conta (`user.deleteAccount.test.ts`) registra todos os modelos lendo `src/models/`. Um modelo em `src/tutorial/` ficaria fora dessa varredura e o teste deixaria de pegar o esquecimento justamente da coleção nova. Por isso: `models/TutorialProgress.ts`, `services/tutorial.service.ts`, `controllers/tutorial.controller.ts`, `routes/tutorial.ts`.
2. **Testes do shared moram na API.** `packages/shared` não tem runner de teste (o `level.utils.test.ts` que existe lá nunca roda). Os testes do schema e do roteiro estão em `apps/api/src/services/tutorialContent.test.ts`, que roda na suíte da API.
3. **Além das âncoras, duas marcações mínimas fora da feature** (nenhuma muda comportamento):
   - `useTutorialScrollRef('Home' | 'TrackMain' | 'Me')` no `ScrollView` das 3 telas com rolagem, para o motor rolar até a âncora.
   - `useTutorialBlockingSurface(visível)` (1 linha) nos 13 componentes com `<Modal>`. Um `Modal` do React Native fica por cima de tudo e não existe forma genérica de saber que ele está aberto; sem isso o tour poderia abrir por baixo de uma folha.
4. **Ordem das etapas segue a posição na tela** (de cima para baixo), não a ordem literal do prompt, para o tour não ficar subindo e descendo a rolagem. A ordem é dado (`order`): trocar é editar números.
5. **"Registrar o blend"** não tem botão próprio: o registro acontece ao fim do timer (avaliar ou pular). A etapa destaca os controles do timer e explica o fluxo.
6. **Seletor Timer / Passo a passo** só existe quando há receita com etapas. No primeiro tour, normalmente sem receita ativa, a etapa é pulada em silêncio (`anchorTimeout`). Se quiser que sempre apareça, a alternativa é juntar a explicação no texto do timer.
7. **"Reduzir movimento"** lido pelo `AccessibilityInfo` do React Native (hook próprio `useReduceMotion`), não pelo `useReducedMotion` do Reanimated, que não existe no mock de testes do Reanimated.
8. **O mobile não importa `zod` direto** (não é dependência do app, só do shared). A validação local usa os schemas exportados pelo shared e guardas manuais.
9. **Idioma:** o texto das etapas segue o idioma ativo do app (o mesmo dos botões do motor). Na prática é o idioma da conta: trocar o idioma em Me muda os dois.

### Arquitetura final

```
packages/shared/src/
  schemas/tutorial.ts            schema Zod do roteiro e do progresso, limites, condições
  tutorial/tutorial.content.ts   ROTEIRO (fonte única, en + pt-BR)

apps/api/src/
  models/TutorialProgress.ts     coleção tutorial_progress, 1 doc por usuário, índice único em userId
  services/tutorial.service.ts   valida o roteiro 1x, ETag por hash, monta o update ($addToSet/$max)
  controllers/tutorial.controller.ts
  routes/tutorial.ts             GET /tutorial, GET|PATCH /tutorial/progress, POST /tutorial/progress/reset

apps/mobile/src/features/tutorial/
  TutorialController.ts          motor (sem React): etapas, navegação, pulos, pausa, progresso, analytics
  tutorialPlanner.ts             funções puras: condição, plano, modo (completo/retomada/novidades)
  tutorialProgressSync.ts        progresso local + fila offline, envio em ordem
  tutorialStorage.ts             MMKV (namespace próprio): estado por usuário + último roteiro + ETag
  tutorialApi.ts                 carga do roteiro: servidor → cache → cópia embutida
  tutorialHttpRemote.ts          cliente HTTP
  tutorialEnvironment.ts         ambiente real: navegação, medição, "tela livre", teclado, telemetria
  tutorialMeasure.ts             measureInWindow, rolagem até a âncora
  tutorialRegistry.ts            registro de âncoras, rolagens e folhas abertas
  tutorialAnchors.ts             catálogo das âncoras desta versão do app
  tutorialScreens.ts             telas por onde o tour passa e como navegar até cada uma
  balloonLayout.ts               posição do balão e do recorte (puro)
  TutorialOverlay.tsx            SVG com recorte animado (Reanimated) + balão
  TutorialProvider.tsx           liga tudo na raiz do AppFlow
  TutorialAnchor.tsx, useTutorialScrollRef.ts, useTutorialBlockingSurface.ts, tutorialContext.ts
```

### Fluxo de dados

1. `AppNavigator` → `<TutorialProvider>` envolve as abas. Um motor por conta (troca de conta = motor novo).
2. `init()`: em paralelo, carrega o roteiro (`GET /tutorial` com `If-None-Match`; 304 ou erro → último roteiro salvo; sem cache → cópia embutida; sempre pelo mesmo schema; entre cache e cópia embutida vale a de maior `contentVersion`) e o progresso (`GET /tutorial/progress`; a fila local pendente vale por cima).
3. Na Home livre (0,9 s depois), `maybeAutoStart` decide o modo: nunca terminou → completo, retomando de `lastStepId`; já concluiu/pulou → só ids não vistos (novidades) com abertura própria; nada novo → nada.
4. Cada etapa: espera a tela ficar livre → navega → espera a âncora (até 5 s), rola até ela, mede duas vezes até estabilizar → mostra. Não aplicável → pula, loga id + motivo, manda `tutorial_step_unavailable`.
5. Etapa mostrada → `PATCH` (`seenStepIds`, `lastStepId`, `contentVersion`) pela fila. Concluir/Pular → `PATCH` com todas as etapas que esta versão sabe mostrar + `status`.

---

## Roteiro inicial (35 etapas + abertura do modo novidades)

> **Atualizado no CP-C2a** (`contentVersion` 2): números por marcador (`{{waterGlass}}`, `{{freeAiPerDay}}`, `{{freeScansPerMonth}}`, `{{missionsPerDay}}`), Pulse AI ilimitado no Pro, Passo a passo explicado no texto do timer e o seletor depois do timer. Detalhes em `cp-c2a-tutorial-marcadores-limites.md`.

Fonte: `packages/shared/src/tutorial/tutorial.content.ts` (tabela gerada do arquivo). Condição `notPro`/`isPro`: só uma das duas versões aparece para cada pessoa. No plano grátis o tour tem 32 etapas e no Pro, 31 (sem as bolinhas de uso). Uma delas, o seletor Timer / Passo a passo, só aparece quando há receita com etapas aberta no Blend.

| # | id | Tela | Âncora | Condição | Título en / pt-BR | Texto en | Texto pt-BR |
|---|---|---|---|---|---|---|---|
| 1 | `home.welcome` | Home | (centralizado) | todos | Welcome to BLENDi Pulse / Boas-vindas ao BLENDi Pulse | Here is a quick tour of the app. We will go through Home, Pulse AI, Blend, Track and Me and show what each part does. It takes about two minutes. You can skip at any time and replay it later from Me. | Este é um tour rápido pelo app. Vamos passar por Início, Pulse AI, Blend, Acompanhar e Perfil e mostrar o que cada parte faz. Leva uns dois minutos. Você pode pular quando quiser e rever depois em Perfil. |
| 2 | `home.header` | Home | `home.header` | todos | Your Level and XP / Seu nível e XP | Blends, missions and goals you hit earn XP. XP raises your level, shown here next to your greeting. Tap the level to see how much XP you need for the next one. | Blends, missões e metas batidas rendem XP. O XP sobe o seu nível, que aparece aqui ao lado da saudação. Toque no nível para ver quanto XP falta para o próximo. |
| 3 | `home.logWater` | Home | `home.logWater` | todos | Log Water in One Tap / Registre água com um toque | Each tap logs one {{waterGlass}} glass of water toward your daily hydration goal. The water ring fills as you drink, and Track shows your whole day. | Cada toque registra um copo de {{waterGlass}} na sua meta diária de hidratação. O anel de água enche conforme você bebe, e a aba Acompanhar mostra o seu dia inteiro. |
| 4 | `home.quickBlend` | Home | `home.quickBlend` | todos | Quick Blend / Blend rápido | Opens the Blend timer right away. After your first blend, this button repeats your last recipe so you can make it again in seconds. | Abre o timer do Blend na hora. Depois do seu primeiro blend, este botão repete a última receita para você fazer de novo em segundos. |
| 5 | `home.rings` | Home | `home.rings` | todos | Your Daily Rings / Seus anéis do dia | The rings compare your protein, carbs, calories and water with your daily targets. They fill as you log blends and water and start over every day. Values from recipes are estimates. Change your targets in Me, under My Goals. | Os anéis comparam proteína, carboidratos, calorias e água com as suas metas do dia. Eles enchem conforme você registra blends e água e recomeçam todo dia. Os valores das receitas são estimativas. Mude as metas em Perfil, em Minhas metas. |
| 6 | `home.streak` | Home | `home.streak` | todos | Your Streak / Sua sequência | Your streak counts the days in a row with at least one logged blend. Log one blend a day to keep it going. If a whole day passes without a blend, it starts again from zero. | A sequência conta os dias seguidos com pelo menos um blend registrado. Registre um blend por dia para mantê-la. Se um dia inteiro passar sem blend, ela volta para zero. |
| 7 | `home.missions` | Home | `home.missions` | todos | Daily Missions / Missões diárias | {{missionsPerDay}} new missions every day, picked for your goal. Complete them to earn extra XP. Progress updates on its own as you blend, drink water and use the app. | {{missionsPerDay}} missões novas por dia, escolhidas para o seu objetivo. Complete para ganhar XP extra. O progresso atualiza sozinho conforme você faz blends, bebe água e usa o app. |
| 8 | `home.protocols` | Home | `home.protocols` | todos | Quick Start / Início Rápido | Each card opens Pulse AI with a request ready to send. Tap one and Pulse AI creates the recipe for you, adjusted to your profile. | Cada card abre o Pulse AI com um pedido pronto para enviar. Toque em um e o Pulse AI cria a receita para você, ajustada ao seu perfil. |
| 9 | `home.dailyRecipe` | Home | `home.dailyRecipe` | todos | Recipe of the Day / Receita do dia | A new recipe for you every day. It already follows your blender, your diet and your allergies. Tap to start the blend with the timer. | Uma receita nova para você todo dia. Ela já segue o seu liquidificador, a sua dieta e as suas alergias. Toque para começar o blend com o timer. |
| 10 | `pulseAi.input` | PulseAIChat | `pulseAi.input` | todos | Ask for Any Recipe / Peça qualquer receita | Type what you want in your own words, like a high protein shake with banana. Everything you ask for goes into the recipe, adjusted to your blender, diet, allergies and goals. Nutrition values are estimates. | Escreva o que você quer do seu jeito, como um shake com muita proteína e banana. Tudo o que você pedir entra na receita, ajustada ao seu liquidificador, dieta, alergias e metas. Os valores nutricionais são estimativas. |
| 11 | `pulseAi.howToUse` | PulseAIChat | `pulseAi.howToUse` | todos | How to Use / Como usar | Tap here for tips on writing a good request and for ready examples. Any example can be sent with one tap. | Toque aqui para ver dicas de como escrever um bom pedido e exemplos prontos. Qualquer exemplo pode ser enviado com um toque. |
| 12 | `pulseAi.usage` | PulseAIChat | `pulseAi.usage` | notPro | Your Free Recipes / Suas receitas grátis | The free plan includes {{freeAiPerDay}} Pulse AI recipes per day. The dots show how many you have left today, and they refill the next day. Pulse Pro gives you unlimited Pulse AI. | O plano grátis inclui {{freeAiPerDay}} receitas do Pulse AI por dia. As bolinhas mostram quantas ainda restam hoje, e elas voltam no dia seguinte. Com o Pulse Pro, o Pulse AI é ilimitado. |
| 13 | `pulseAi.history` | PulseAIChat | `pulseAi.history` | todos | Conversation History / Histórico de conversas | Your past conversations are saved here. Open one to see its recipes again or continue from where you stopped. | As suas conversas anteriores ficam salvas aqui. Abra uma para ver as receitas de novo ou continuar de onde parou. |
| 14 | `pulseAi.favorites` | PulseAIChat | `pulseAi.favorites` | todos | Favorites / Favoritos | Recipes you save with the heart show up here. From a favorite you can start the blend again or add its ingredients to a shopping list. | As receitas que você salva com o coração aparecem aqui. Em um favorito você pode fazer o blend de novo ou mandar os ingredientes para uma lista de compras. |
| 15 | `pulseAi.pantry` | PulseAIChat | `pulseAi.pantry` | notPro | Pantry Scanner / Scanner da despensa | Take a photo of your fridge or pantry. Pulse AI finds the ingredients, you confirm the list and it creates recipes with what you have. The camera has lenses and zoom. The free plan includes {{freeScansPerMonth}} scans per month. | Tire uma foto da geladeira ou da despensa. O Pulse AI encontra os ingredientes, você confirma a lista e ele cria receitas com o que você tem. A câmera tem lentes e zoom. O plano grátis inclui {{freeScansPerMonth}} leituras por mês. |
| 16 | `pulseAi.pantryPro` | PulseAIChat | `pulseAi.pantry` | isPro | Pantry Scanner / Scanner da despensa | Take a photo of your fridge or pantry. Pulse AI finds the ingredients, you confirm the list and it creates recipes with what you have. The camera has lenses and zoom to fit everything in the photo. | Tire uma foto da geladeira ou da despensa. O Pulse AI encontra os ingredientes, você confirma a lista e ele cria receitas com o que você tem. A câmera tem lentes e zoom para caber tudo na foto. |
| 17 | `blend.timer` | Blend | `blend.timer` | todos | Blend Timer / Timer do blend | The timer shows how long to blend. When you open a recipe, the time comes from it; without one, set it with the buttons below. Recipes with steps can also be followed one step at a time: switch between Timer and Steps at the top. | O timer mostra quanto tempo bater. Quando você abre uma receita, o tempo vem dela; sem receita, ajuste nos botões abaixo. Receitas com etapas também podem ser seguidas uma etapa por vez: alterne entre Timer e Passos no topo. |
| 18 | `blend.modeToggle` | Blend | `blend.modeToggle` | todos | Timer or Step by Step / Timer ou passo a passo | This recipe has steps. Tap Steps to follow it one step at a time, and Timer to go back to the countdown. | Esta receita tem etapas. Toque em Passos para seguir uma etapa por vez e em Timer para voltar à contagem. |
| 19 | `blend.log` | Blend | `blend.controls` | todos | Log Your Blend / Registre o seu blend | Press start. When the timer ends, rate the blend or skip and it is logged. Each logged blend fills your rings, earns XP and keeps your streak going. Without a connection it is saved and sent later. | Aperte para começar. Quando o timer acabar, avalie o blend ou pule e ele fica registrado. Cada blend registrado enche os anéis, rende XP e mantém a sua sequência. Sem conexão, ele fica salvo e é enviado depois. |
| 20 | `track.shoppingLists` | TrackMain | `track.shoppingLists` | todos | Shopping Lists / Listas de compras | Create lists for your ingredients, add items from recipes and favorites and check them off at the store. | Crie listas para os seus ingredientes, adicione itens de receitas e favoritos e marque no mercado. |
| 21 | `track.hydration` | TrackMain | `track.hydration` | todos | Hydration / Hidratação | Log water here and see how much you drank today and on each of the last 7 days, compared with your daily goal. | Registre água aqui e veja quanto você bebeu hoje e em cada um dos últimos 7 dias, comparado com a sua meta diária. |
| 22 | `track.stack` | TrackMain | `track.stack` | todos | My Supplement Stack / Meu Stack de suplementos | Your supplements for the day. Tap one to log a dose and hold to undo. Use Manage Stack to edit the list, the doses and when to take each one. | Os seus suplementos do dia. Toque em um para registrar uma dose e segure para desfazer. Use Gerenciar Stack para editar a lista, as doses e quando tomar cada um. |
| 23 | `track.history` | TrackMain | `track.history` | todos | History and Charts / Histórico e gráficos | See your blends, macros, water and supplements over time in charts, so you can spot your habits. | Veja seus blends, macros, água e suplementos ao longo do tempo em gráficos, para enxergar os seus hábitos. |
| 24 | `me.level` | Me | `me.level` | todos | Your Progress / Seu progresso | Your current streak, total blends, best streak and level are all here, with the XP you need for the next level. | A sua sequência atual, o total de blends, a melhor sequência e o nível ficam aqui, com o XP que falta para o próximo nível. |
| 25 | `me.weeklyReport` | Me | `me.weeklyReport` | isPro | Weekly Report / Relatório Semanal | Every week you get a summary of your blends, macros and habits, with your highlights. Open it here. | Toda semana você recebe um resumo dos seus blends, macros e hábitos, com os seus destaques. Abra aqui. |
| 26 | `me.weeklyReportFree` | Me | `me.weeklyReport` | notPro | Weekly Report / Relatório Semanal | A weekly summary of your blends, macros and habits, with your highlights. The full report is part of Pulse Pro. | Um resumo semanal dos seus blends, macros e hábitos, com os seus destaques. O relatório completo faz parte do Pulse Pro. |
| 27 | `me.badges` | Me | `me.badges` | todos | Achievements / Conquistas | Badges unlock as you reach milestones, like a number of blends or a long streak. Tap a badge to see what it takes to earn it. | As medalhas são liberadas conforme você chega a marcos, como um número de blends ou uma sequência longa. Toque em uma para ver o que falta para ganhar. |
| 28 | `me.modelGoal` | Me | `me.modelGoal` | todos | Blender and Goal / Liquidificador e objetivo | Change the blender you use and your goal here. Recipes follow what your blender can handle, and your goal shapes your targets and missions. | Mude aqui o liquidificador que você usa e o seu objetivo. As receitas respeitam o que o seu liquidificador aguenta, e o objetivo define as suas metas e missões. |
| 29 | `me.goals` | Me | `me.nutritionGoals` | todos | My Goals / Minhas metas | Set your daily protein, carbs, calories and diet here. The rings on Home follow these targets. | Defina aqui a sua proteína, carboidratos, calorias e dieta do dia. Os anéis do Início seguem essas metas. |
| 30 | `me.allergies` | Me | `me.allergies` | todos | Allergies / Alergias | Tell us your allergies. Recipes from Pulse AI, the Pantry Scanner and the recipe of the day leave these ingredients out. Always check the ingredients too. | Conte as suas alergias. As receitas do Pulse AI, do scanner da despensa e a receita do dia deixam esses ingredientes de fora. Sempre confira os ingredientes também. |
| 31 | `me.preferences` | Me | `me.preferences` | todos | Units, Language and Theme / Unidades, idioma e tema | Choose metric or imperial units, the app language and a light or dark theme. | Escolha unidades métricas ou imperiais, o idioma do app e o tema claro ou escuro. |
| 32 | `me.replay` | Me | `me.replay` | todos | Replay This Tour / Ver o tour de novo | Want to see this tour again? Tap here at any time to start it from the beginning. | Quer ver este tour outra vez? Toque aqui quando quiser para começar do início. |
| 33 | `me.planPro` | Me | `me.plan` | isPro | Pulse Pro / Pulse Pro | Your Pulse Pro plan is active. You get unlimited Pulse AI, more Pantry scans and the full weekly report. | O seu plano Pulse Pro está ativo. Você tem Pulse AI ilimitado, mais leituras da despensa e o relatório semanal completo. |
| 34 | `me.planFree` | Me | `me.plan` | notPro | Pulse Pro / Pulse Pro | Pulse Pro gives you unlimited Pulse AI, more Pantry scans and the full weekly report. If you already subscribed, restore your purchase here. | O Pulse Pro dá Pulse AI ilimitado, mais leituras da despensa e o relatório semanal completo. Se você já assinou, restaure a compra aqui. |
| 35 | `end.done` | Home | (centralizado) | todos | You Are All Set / Tudo pronto | That is the tour. Start with the recipe of the day or ask Pulse AI for something new. You can replay this tour at any time from Me. | Esse foi o tour. Comece pela receita do dia ou peça algo novo ao Pulse AI. Você pode rever este tour quando quiser em Perfil. |
| — | `tutorial.whatsNewIntro` (abertura do modo novidades) | Home | (centralizado) | só no modo novidades | What Is New / Novidades | This update brings something new to the app. Here is a quick look at what changed and where to find it. | Esta atualização traz novidades para o app. Veja rapidamente o que mudou e onde encontrar. |

**Exemplos preenchidos** (o app preenche na hora de mostrar; copo pelo mesmo formatador do botão):

| id | Conta | en | pt-BR |
|---|---|---|---|
| `home.logWater` | métrico | Each tap logs one 250 ml glass of water toward your daily hydration goal. The water ring fills as you drink, and Track shows your whole day. | Cada toque registra um copo de 250 ml na sua meta diária de hidratação. O anel de água enche conforme você bebe, e a aba Acompanhar mostra o seu dia inteiro. |
| `home.logWater` | imperial | Each tap logs one 8.5 fl oz glass of water toward your daily hydration goal. The water ring fills as you drink, and Track shows your whole day. | Cada toque registra um copo de 8,5 fl oz na sua meta diária de hidratação. O anel de água enche conforme você bebe, e a aba Acompanhar mostra o seu dia inteiro. |
| `home.missions` | qualquer | 3 new missions every day, picked for your goal. Complete them to earn extra XP. Progress updates on its own as you blend, drink water and use the app. | 3 missões novas por dia, escolhidas para o seu objetivo. Complete para ganhar XP extra. O progresso atualiza sozinho conforme você faz blends, bebe água e usa o app. |
| `pulseAi.usage` | qualquer | The free plan includes 3 Pulse AI recipes per day. The dots show how many you have left today, and they refill the next day. Pulse Pro gives you unlimited Pulse AI. | O plano grátis inclui 3 receitas do Pulse AI por dia. As bolinhas mostram quantas ainda restam hoje, e elas voltam no dia seguinte. Com o Pulse Pro, o Pulse AI é ilimitado. |
| `pulseAi.pantry` | qualquer | Take a photo of your fridge or pantry. Pulse AI finds the ingredients, you confirm the list and it creates recipes with what you have. The camera has lenses and zoom. The free plan includes 3 scans per month. | Tire uma foto da geladeira ou da despensa. O Pulse AI encontra os ingredientes, você confirma a lista e ele cria receitas com o que você tem. A câmera tem lentes e zoom. O plano grátis inclui 3 leituras por mês. |

Limites do balão: título até 48 caracteres, texto até 300 já preenchido (cabe no iPhone SE com fonte padrão; com fonte grande, o texto rola dentro do balão).

---

## Backend

- `GET /tutorial`: roteiro validado; `ETag` = hash do conteúdo (texto corrigido sem subir a versão também invalida o cache); `Cache-Control: private, max-age=300`; `If-None-Match` igual → 304. Roteiro inválido → 503 `tutorial/unavailable` (a API não cai; o app usa a cópia embutida).
- `GET /tutorial/progress`: sem documento → progresso vazio, sem criar documento.
- `PATCH /tutorial/progress`: schema `.strict()` (chave desconhecida = 400), teto de 100 ids, ids fora do roteiro descartados, `$addToSet` (nunca apaga), `contentVersion` por `$max` limitado à versão do servidor, `lastStepId` desconhecido ignorado. Upsert concorrente (E11000) repete uma vez.
- `POST /tutorial/progress/reset`: apaga o documento.
- Rate limit: o `authenticatedLimiter` global (120/min por usuário), como as demais rotas autenticadas.
- Logs: nenhum corpo, userId ou e-mail (teste confere).
- Exclusão de conta: `TutorialProgressModel.deleteMany({ userId })` dentro da transação. O teste passou de 17 para **18 coleções** (15 → 16 modelos com `userId`, mais `User` e `Otp`).
- Documentação: `docs/api/endpoints.md`, seção "Tutorial (CP-C2)"; `docs/architecture.md` cita a coleção nova.

## Mobile

- Overlay: SVG com `fillRule="evenodd"` (tela menos um retângulo arredondado com 8 pt de margem e raio 12) + anel na cor da marca; troca animada na thread de UI (`useAnimatedProps`, 260 ms). Reduzir movimento: troca direta, sem animação.
- Balão: título, texto, "N de M" (só etapas que se aplicam; se uma âncora não aparece, o total diminui), Pular sempre visível, Voltar (desabilitado na primeira), Próximo / Concluir. Acima ou abaixo conforme o espaço, sempre dentro da área segura (testado em iPhone SE, notch e Android com barra). Tamanho tirado do próprio overlay, não de `useWindowDimensions` (cobre a barra do Android em edge-to-edge).
- Toques: o overlay pega todos (`onStartShouldSetResponder`); só os botões do balão respondem. Pausado (folha/celebração por cima): o overlay some e não bloqueia.
- Android: botão voltar = Voltar do balão; consumido durante o tour (nunca sai do app no meio).
- Leitor de tela: o resto do app fica oculto (`accessibilityViewIsModal` no iOS, `importantForAccessibility="no-hide-descendants"` no Android); o foco vai para o grupo do texto, lido como "título. texto. Etapa N de M"; botões de 44 pt com rótulo; Pular tem dica ("Encerra o tour...").
- Tema: tokens (`useColors`); escurecimento `overlay.black[55]` no claro e `[82]` no escuro.
- Textos do motor: `tutorial.*` em `en.json` e `pt-BR.json` (chaves tipadas pelo `t()` estrito, sem cast).
- Me: linha "Ver tutorial de novo" / "Replay tutorial" no fim do card de configurações.
- Analytics: `tutorial_started` (`mode`), `tutorial_step_viewed` (`step_id`, `index`, `total`), `tutorial_skipped` (`step_id`, `mode`), `tutorial_completed` (`mode`), `tutorial_step_unavailable` (`step_id`, `reason`). Sem dado pessoal (teste confere que o id do usuário não aparece).
- Log (só em dev): `[tutorial] etapa pulada: <id> (<motivo>)`.

## Testes adicionados

**API**
- `services/tutorialContent.test.ts` (21): schema aceita o roteiro inicial; recusa id repetido, ordem repetida, idioma faltando ou vazio, condição desconhecida, texto longo, id fora do formato, etapa de versão futura, outra schemaVersion, roteiro sem etapas; ignora campo novo (app antigo não quebra); regras de texto (sem travessão/exclamação, Title Case, sem "no ice", Lite, estimativa, texto neutro); ETag estável e sensível a texto; If-None-Match; update descarta ids desconhecidos; teto e chaves do PATCH.
- `controllers/tutorial.controller.test.ts` (8): servidor Express real; 401 nas 4 rotas; 200 + ETag + 304; progresso vazio sem criar doc; PATCH junta e ignora desconhecidos e filtra pelo token; 400 em 7 corpos inválidos; E11000 repete; reset só do usuário; nada do usuário nos logs.
- `controllers/user.deleteAccount.test.ts`: lista passou a incluir `TutorialProgress`.

**Mobile** (roteiro de teste em `testUtils/tutorialTestKit.ts`, não o real)
- `TutorialController.test.ts` (13): tour completo entre telas; pula sem âncora/rota/condição; "N de M"; Voltar/Próximo; Pular (marca dispensado, não reabre); retomada após reinício sem rede; novidades só com ids novos e âncora de versão futura guardada para depois; cópia embutida sem rede com fila; não abre com tela ocupada; só abre na Home; pausa e retoma; "Ver tutorial de novo"; âncora que some; roteiro inválido.
- `tutorialPlanner.test.ts` (7), `tutorialProgressSync.test.ts` (11, inclui fallback servidor → cache → embutida e 304), `balloonLayout.test.ts` (6).
- `TutorialProvider.test.tsx` (8): balão, rótulos, contador, Concluir, toques bloqueados, pausado não bloqueia, auto-abertura, botão voltar do Android, replay pelo contexto.
- `tutorialEnvironment.test.tsx` (6): folha aberta, celebração de nível, paywall e alerta do sistema bloqueiam; âncora registra/desregistra.
- `tutorialAnchors.test.ts` (7): **toda âncora do roteiro real existe no catálogo e em alguma tela**, nenhuma tela usa id fora do catálogo, toda tela do roteiro é navegável, só a condição tira etapas do plano.
- `MeScreen.test.tsx`: card com 9 linhas; a linha chama o replay.

---

## Análise de problemas relacionados (prevenção)

Pedido extra do Gabriel: além do escopo, olhar o que poderia dar problema depois neste contexto.

### Prevenidos no desenho (com teste)

| Risco | O que aconteceria | Como ficou |
|---|---|---|
| Pular e "novidades" por versão | Se novidades fosse "addedInVersion maior que a versão vista", quem pulasse no meio receberia de novo, como novidade, todo o resto do tour na próxima abertura | Concluir/Pular marcam como vistas todas as etapas que a versão do app sabe mostrar; novidades = id não visto |
| Roteiro do servidor mais novo que o app | Etapa com âncora que o app instalado não tem: o tour navegaria, esperaria 5 s e pularia, toda vez que abrisse | Catálogo de âncoras por versão: etapa desconhecida sai do plano sem navegar e fica "não vista" para aparecer depois da atualização do app |
| Etapa que nunca aparece neste aparelho (ex.: seletor sem receita) | Viraria "novidade" eterna | Entra no "visto" ao concluir/pular |
| Cache antigo depois de atualizar o app (offline) | Roteiro velho do cache venceria a cópia embutida nova | Sem servidor, vence a maior `contentVersion` |
| Texto corrigido sem subir `contentVersion` | App manteria o texto antigo em cache | ETag pelo hash do conteúdo |
| Condição nova no servidor | App antigo quebraria ao ler | Schema recusa o roteiro todo e o app usa a cópia embutida; condição nova exige subir `schemaVersion` (documentado) |
| Campo novo numa etapa | App antigo quebraria | Zod tira chaves desconhecidas; teste garante |
| Roteiro inválido em produção | API cairia no boot | Valida na primeira requisição e responde 503; app usa a cópia embutida |
| Dois PATCH simultâneos na primeira gravação | 500 por índice único | Repete uma vez |
| Troca de conta no mesmo aparelho | Progresso de uma conta valendo na outra | Estado local por usuário; motor recriado por conta |
| Estado local corrompido | Crash na abertura | Validação; volta ao vazio |
| Folha (`Modal`) aberta | Balão por baixo da folha, toques travados | Registro de folhas abertas; tour espera/pausa |
| Pedido de permissão de notificação 3 s depois do login (App.tsx) | Alerta do sistema por cima do início do tour | App `inactive` conta como tela ocupada; pausa e retoma |
| Celebração de nível (renderizada fora da navegação, por cima de tudo) | Tour seguiria por baixo | Pausa enquanto `levelUpData` existe |
| Paywall ou rota de raiz por cima | Tour seguiria por baixo | Só roda com o `AppFlow` no topo |
| Android: View achatada e `removeClippedSubviews` | Âncora sem medida | `collapsable={false}`; medida pelo layout (Fabric); se `measureLayout` falhar, rola ao topo e mede de novo |
| Rolagem além do fim do conteúdo | Tela em branco no iOS | Alvo limitado a `altura do conteúdo - altura visível` |
| Barra de navegação do Android (edge-to-edge) | Faixa sem escurecer | Overlay usa a própria medida |
| Fonte grande (acessibilidade) | Balão maior que a tela | Altura máxima e texto rolável |
| Idioma trocado no meio do tour | Texto no idioma antigo | Texto atualizado sem reiniciar o tour |
| Âncora desmontada no meio da etapa | Recorte apontando para o vazio | Re-medição a cada 700 ms; sumiu → resolve de novo ou pula |

### Encontrados fora do escopo (não mexi)

1. **`packages/shared` não roda teste nenhum.** `level.utils.test.ts` existe mas nenhum runner o chama. Sugestão: rodar os testes do shared pela suíte da API (como fiz aqui) ou dar ao shared um script `test` com `node --test`.
2. **`aiProvider.service.test.ts › reserva só se ainda couber na janela` é instável** sob carga (depende de relógio real). Falhou 1 vez em 2 rodadas completas; isolado passa sempre. Sugestão: relógio falso também no `setTimeout` do teste.
3. **`DELETE /users/me` não está em `docs/api/endpoints.md`**, embora apague 18 coleções e seja citado em outros docs.
4. **Cópia local do tutorial depois de excluir a conta:** o estado (só ids de etapa) fica no MMKV do aparelho com a chave do id do usuário excluído. Sem dado pessoal, mas pode ser limpo no `deleteAccount` do auth store num CP futuro.
5. **Texto do Pro:** o app já diz "Unlimited Pulse AI queries" (`me.upgrade.benefit1`); o tour diz "tira o limite diário", mais preciso dado o orçamento de requisições de IA que existe também para Pro. Vale o Jon confirmar a promessa nos dois lugares.
6. **Toasts e o banner offline** ficam por cima do overlay (são renderizados acima da navegação). Não bloqueiam o tour, só cobrem uma faixa por alguns segundos.
7. **Abertura do modo novidades:** se todas as etapas novas falharem em tempo de execução (âncora não aparece), a abertura aparece sozinha e o tour termina. Raro (o catálogo já filtra o que a versão não tem).

---

## Checklist do aparelho

- [ ] Conta nova: depois do "Building Your Plan", o tour abre na Home sozinho (~1 s).
- [ ] Tour completo, plano grátis: passa por Home, Pulse AI, Blend, Track e Me e volta para a Home com a mensagem final; as bolinhas de uso aparecem.
- [ ] Tour completo, conta Pro: sem bolinhas de uso; Pantry, plano e relatório com o texto de Pro.
- [ ] Recorte alinhado com o elemento em todas as etapas (atenção às da Me, que exigem rolagem, e ao campo do Pulse AI no rodapé).
- [ ] Pular no meio: fecha; fechar e abrir o app não reabre.
- [ ] Retomar: fechar o app (matar) no meio, abrir de novo: continua da mesma etapa.
- [ ] Voltar no balão e botão voltar do Android: voltam uma etapa; na primeira, nada acontece e o app não fecha.
- [ ] Toque fora do balão não faz nada (nem nas abas).
- [ ] "Ver tutorial de novo" em Me: começa da primeira etapa na Home.
- [ ] Modo avião: tour funciona; ao voltar a rede, o progresso aparece em outro aparelho.
- [ ] Tema escuro: escurecimento, balão e textos legíveis.
- [ ] VoiceOver / TalkBack: foco vai para o balão, lê título, texto e "Etapa N de M"; o resto do app não recebe foco; botões com nome.
- [ ] Reduzir movimento ligado: troca sem animação.
- [ ] Fonte grande do sistema: o balão não sai da tela.
- [ ] iPhone SE (se houver): balão dentro da tela em todas as etapas.
- [ ] Android com barra de navegação de 3 botões: tela toda escurecida, balão acima da barra.
- [ ] Pedido de permissão de notificação no primeiro login: o tour espera e segue depois.
- [ ] Português: textos das etapas e dos botões em pt-BR.

## Arquivos

**Novos:** `packages/shared/src/schemas/tutorial.ts`, `packages/shared/src/tutorial/tutorial.content.ts`, `apps/api/src/models/TutorialProgress.ts`, `apps/api/src/services/tutorial.service.ts`, `apps/api/src/controllers/tutorial.controller.ts`, `apps/api/src/routes/tutorial.ts`, os 2 testes da API, `apps/mobile/src/features/tutorial/` (motor e testes), `docs/tutorial/README.md`, este relatório.

**Alterados:** `packages/shared/src/index.ts`; `apps/api/src/index.ts` (rota), `user.controller.ts` (exclusão), `user.deleteAccount.test.ts`; `AppNavigator.tsx` (Provider); Home, Pulse AI, Blend, Track e Me (âncoras; Home/Track/Me com a ref de rolagem; Me com a linha nova); `QuickActionTrigger.tsx` (2 âncoras; o `flex: 1` do botão foi para o invólucro, mesmo layout); 13 componentes com `<Modal>` (1 linha cada); `en.json`/`pt-BR.json` (`tutorial.*`); `MeScreen.test.tsx`; `docs/api/endpoints.md`; `docs/architecture.md`; `docs/README.md`.
