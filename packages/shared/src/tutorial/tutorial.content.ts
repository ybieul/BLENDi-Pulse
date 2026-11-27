// CP-C2 — Roteiro do tutorial guiado: FONTE ÚNICA.
//
// O backend serve este arquivo em GET /tutorial e o app usa a mesma cópia
// embutida quando o servidor não responde. Nenhum texto de etapa fica nas
// telas. Como adicionar uma etapa: docs/tutorial/README.md.
//
// Regras do texto (Jon): sem travessão, sem exclamação, Title Case nos
// títulos em inglês, dizer o que o produto faz, números de nutrição como
// estimativa, texto neutro para quem não tem BLENDi. Os testes do roteiro
// (apps/api/src/services/tutorialContent.test.ts) checam essas regras.
//
// Ordem: segue a posição dos elementos de cima para baixo em cada tela, para
// o tour não ficar subindo e descendo a rolagem. `order` com folga de 10.
import type { TutorialContentInput } from '../schemas/tutorial';

export const TUTORIAL_CONTENT: TutorialContentInput = {
  schemaVersion: 1,
  contentVersion: 1,
  whatsNewIntro: {
    en: {
      title: 'What Is New',
      body: 'This update brings something new to the app. Here is a quick look at what changed and where to find it.',
    },
    'pt-BR': {
      title: 'Novidades',
      body: 'Esta atualização traz novidades para o app. Veja rapidamente o que mudou e onde encontrar.',
    },
  },
  steps: [
    // ─── Home ──────────────────────────────────────────────────────────────
    {
      id: 'home.welcome',
      order: 10,
      screen: 'Home',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Welcome to BLENDi Pulse',
          body: 'Here is a quick tour of the app. We will go through Home, Pulse AI, Blend, Track and Me and show what each part does. It takes about two minutes. You can skip at any time and replay it later from Me.',
        },
        'pt-BR': {
          title: 'Boas-vindas ao BLENDi Pulse',
          body: 'Este é um tour rápido pelo app. Vamos passar por Início, Pulse AI, Blend, Acompanhar e Perfil e mostrar o que cada parte faz. Leva uns dois minutos. Você pode pular quando quiser e rever depois em Perfil.',
        },
      },
    },
    {
      id: 'home.header',
      order: 20,
      screen: 'Home',
      anchor: 'home.header',
      placement: 'below',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Your Level and XP',
          body: 'Blends, missions and goals you hit earn XP. XP raises your level, shown here next to your greeting. Tap the level to see how much XP you need for the next one.',
        },
        'pt-BR': {
          title: 'Seu nível e XP',
          body: 'Blends, missões e metas batidas rendem XP. O XP sobe o seu nível, que aparece aqui ao lado da saudação. Toque no nível para ver quanto XP falta para o próximo.',
        },
      },
    },
    {
      id: 'home.logWater',
      order: 30,
      screen: 'Home',
      anchor: 'home.logWater',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Log Water in One Tap',
          body: 'Each tap logs a 250 ml glass of water toward your daily hydration goal. The water ring fills as you drink, and Track shows your whole day.',
        },
        'pt-BR': {
          title: 'Registre água com um toque',
          body: 'Cada toque registra um copo de 250 ml na sua meta diária de hidratação. O anel de água enche conforme você bebe, e a aba Acompanhar mostra o seu dia inteiro.',
        },
      },
    },
    {
      id: 'home.quickBlend',
      order: 40,
      screen: 'Home',
      anchor: 'home.quickBlend',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Quick Blend',
          body: 'Opens the Blend timer right away. After your first blend, this button repeats your last recipe so you can make it again in seconds.',
        },
        'pt-BR': {
          title: 'Blend rápido',
          body: 'Abre o timer do Blend na hora. Depois do seu primeiro blend, este botão repete a última receita para você fazer de novo em segundos.',
        },
      },
    },
    {
      id: 'home.rings',
      order: 50,
      screen: 'Home',
      anchor: 'home.rings',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Your Daily Rings',
          body: 'The rings compare your protein, carbs, calories and water with your daily targets. They fill as you log blends and water and start over every day. Values from recipes are estimates. Change your targets in Me, under My Goals.',
        },
        'pt-BR': {
          title: 'Seus anéis do dia',
          body: 'Os anéis comparam proteína, carboidratos, calorias e água com as suas metas do dia. Eles enchem conforme você registra blends e água e recomeçam todo dia. Os valores das receitas são estimativas. Mude as metas em Perfil, em Minhas metas.',
        },
      },
    },
    {
      id: 'home.streak',
      order: 60,
      screen: 'Home',
      anchor: 'home.streak',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Your Streak',
          body: 'Your streak counts the days in a row with at least one logged blend. Log one blend a day to keep it going. If a whole day passes without a blend, it starts again from zero.',
        },
        'pt-BR': {
          title: 'Sua sequência',
          body: 'A sequência conta os dias seguidos com pelo menos um blend registrado. Registre um blend por dia para mantê-la. Se um dia inteiro passar sem blend, ela volta para zero.',
        },
      },
    },
    {
      id: 'home.missions',
      order: 70,
      screen: 'Home',
      anchor: 'home.missions',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Daily Missions',
          body: 'Three missions every day, picked for your goal. Complete them to earn extra XP. Progress updates on its own as you blend, drink water and use the app.',
        },
        'pt-BR': {
          title: 'Missões diárias',
          body: 'Três missões por dia, escolhidas para o seu objetivo. Complete para ganhar XP extra. O progresso atualiza sozinho conforme você faz blends, bebe água e usa o app.',
        },
      },
    },
    {
      id: 'home.protocols',
      order: 80,
      screen: 'Home',
      anchor: 'home.protocols',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Quick Start',
          body: 'Each card opens Pulse AI with a request ready to send. Tap one and Pulse AI creates the recipe for you, adjusted to your profile.',
        },
        'pt-BR': {
          title: 'Início Rápido',
          body: 'Cada card abre o Pulse AI com um pedido pronto para enviar. Toque em um e o Pulse AI cria a receita para você, ajustada ao seu perfil.',
        },
      },
    },
    {
      id: 'home.dailyRecipe',
      order: 90,
      screen: 'Home',
      anchor: 'home.dailyRecipe',
      placement: 'above',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Recipe of the Day',
          body: 'A new recipe for you every day. It already follows your blender, your diet and your allergies. Tap to start the blend with the timer.',
        },
        'pt-BR': {
          title: 'Receita do dia',
          body: 'Uma receita nova para você todo dia. Ela já segue o seu liquidificador, a sua dieta e as suas alergias. Toque para começar o blend com o timer.',
        },
      },
    },

    // ─── Pulse AI ──────────────────────────────────────────────────────────
    {
      id: 'pulseAi.input',
      order: 100,
      screen: 'PulseAIChat',
      anchor: 'pulseAi.input',
      placement: 'above',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Ask for Any Recipe',
          body: 'Type what you want in your own words, like a high protein shake with banana. Everything you ask for goes into the recipe, adjusted to your blender, diet, allergies and goals. Nutrition values are estimates.',
        },
        'pt-BR': {
          title: 'Peça qualquer receita',
          body: 'Escreva o que você quer do seu jeito, como um shake com muita proteína e banana. Tudo o que você pedir entra na receita, ajustada ao seu liquidificador, dieta, alergias e metas. Os valores nutricionais são estimativas.',
        },
      },
    },
    {
      id: 'pulseAi.howToUse',
      order: 110,
      screen: 'PulseAIChat',
      anchor: 'pulseAi.howToUse',
      placement: 'below',
      addedInVersion: 1,
      text: {
        en: {
          title: 'How to Use',
          body: 'Tap here for tips on writing a good request and for ready examples. Any example can be sent with one tap.',
        },
        'pt-BR': {
          title: 'Como usar',
          body: 'Toque aqui para ver dicas de como escrever um bom pedido e exemplos prontos. Qualquer exemplo pode ser enviado com um toque.',
        },
      },
    },
    {
      id: 'pulseAi.usage',
      order: 120,
      screen: 'PulseAIChat',
      anchor: 'pulseAi.usage',
      placement: 'above',
      condition: 'notPro',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Your Free Recipes',
          body: 'The free plan includes 3 Pulse AI recipes per day. The dots show how many you have left today, and they refill the next day. Pulse Pro removes the daily limit.',
        },
        'pt-BR': {
          title: 'Suas receitas grátis',
          body: 'O plano grátis inclui 3 receitas do Pulse AI por dia. As bolinhas mostram quantas ainda restam hoje, e elas voltam no dia seguinte. O Pulse Pro tira o limite diário.',
        },
      },
    },
    {
      id: 'pulseAi.history',
      order: 130,
      screen: 'PulseAIChat',
      anchor: 'pulseAi.history',
      placement: 'below',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Conversation History',
          body: 'Your past conversations are saved here. Open one to see its recipes again or continue from where you stopped.',
        },
        'pt-BR': {
          title: 'Histórico de conversas',
          body: 'As suas conversas anteriores ficam salvas aqui. Abra uma para ver as receitas de novo ou continuar de onde parou.',
        },
      },
    },
    {
      id: 'pulseAi.favorites',
      order: 140,
      screen: 'PulseAIChat',
      anchor: 'pulseAi.favorites',
      placement: 'below',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Favorites',
          body: 'Recipes you save with the heart show up here. From a favorite you can start the blend again or add its ingredients to a shopping list.',
        },
        'pt-BR': {
          title: 'Favoritos',
          body: 'As receitas que você salva com o coração aparecem aqui. Em um favorito você pode fazer o blend de novo ou mandar os ingredientes para uma lista de compras.',
        },
      },
    },
    {
      id: 'pulseAi.pantry',
      order: 150,
      screen: 'PulseAIChat',
      anchor: 'pulseAi.pantry',
      placement: 'below',
      condition: 'notPro',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Pantry Scanner',
          body: 'Take a photo of your fridge or pantry. Pulse AI finds the ingredients, you confirm the list and it creates recipes with what you have. The camera has lenses and zoom. The free plan includes 3 scans per month.',
        },
        'pt-BR': {
          title: 'Scanner da despensa',
          body: 'Tire uma foto da geladeira ou da despensa. O Pulse AI encontra os ingredientes, você confirma a lista e ele cria receitas com o que você tem. A câmera tem lentes e zoom. O plano grátis inclui 3 leituras por mês.',
        },
      },
    },
    {
      id: 'pulseAi.pantryPro',
      order: 160,
      screen: 'PulseAIChat',
      anchor: 'pulseAi.pantry',
      placement: 'below',
      condition: 'isPro',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Pantry Scanner',
          body: 'Take a photo of your fridge or pantry. Pulse AI finds the ingredients, you confirm the list and it creates recipes with what you have. The camera has lenses and zoom to fit everything in the photo.',
        },
        'pt-BR': {
          title: 'Scanner da despensa',
          body: 'Tire uma foto da geladeira ou da despensa. O Pulse AI encontra os ingredientes, você confirma a lista e ele cria receitas com o que você tem. A câmera tem lentes e zoom para caber tudo na foto.',
        },
      },
    },

    // ─── Blend ─────────────────────────────────────────────────────────────
    {
      id: 'blend.modeToggle',
      order: 200,
      screen: 'Blend',
      anchor: 'blend.modeToggle',
      placement: 'below',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Timer or Step by Step',
          body: 'Recipes with steps can be followed one step at a time. Switch between the timer and the step by step view here.',
        },
        'pt-BR': {
          title: 'Timer ou passo a passo',
          body: 'Receitas com etapas podem ser seguidas uma etapa por vez. Alterne aqui entre o timer e o passo a passo.',
        },
      },
    },
    {
      id: 'blend.timer',
      order: 210,
      screen: 'Blend',
      anchor: 'blend.timer',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Blend Timer',
          body: 'The timer shows how long to blend. When you open a recipe, the time comes from it. Without a recipe, set the time yourself with the buttons below.',
        },
        'pt-BR': {
          title: 'Timer do blend',
          body: 'O timer mostra quanto tempo bater. Quando você abre uma receita, o tempo vem dela. Sem receita, ajuste o tempo você mesmo nos botões abaixo.',
        },
      },
    },
    {
      id: 'blend.log',
      order: 220,
      screen: 'Blend',
      anchor: 'blend.controls',
      placement: 'above',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Log Your Blend',
          body: 'Press start. When the timer ends, rate the blend or skip and it is logged. Each logged blend fills your rings, earns XP and keeps your streak going. Without a connection it is saved and sent later.',
        },
        'pt-BR': {
          title: 'Registre o seu blend',
          body: 'Aperte para começar. Quando o timer acabar, avalie o blend ou pule e ele fica registrado. Cada blend registrado enche os anéis, rende XP e mantém a sua sequência. Sem conexão, ele fica salvo e é enviado depois.',
        },
      },
    },

    // ─── Track ─────────────────────────────────────────────────────────────
    {
      id: 'track.shoppingLists',
      order: 300,
      screen: 'TrackMain',
      anchor: 'track.shoppingLists',
      placement: 'below',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Shopping Lists',
          body: 'Create lists for your ingredients, add items from recipes and favorites and check them off at the store.',
        },
        'pt-BR': {
          title: 'Listas de compras',
          body: 'Crie listas para os seus ingredientes, adicione itens de receitas e favoritos e marque no mercado.',
        },
      },
    },
    {
      id: 'track.hydration',
      order: 310,
      screen: 'TrackMain',
      anchor: 'track.hydration',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Hydration',
          body: 'Log water here and see how much you drank today and on each of the last 7 days, compared with your daily goal.',
        },
        'pt-BR': {
          title: 'Hidratação',
          body: 'Registre água aqui e veja quanto você bebeu hoje e em cada um dos últimos 7 dias, comparado com a sua meta diária.',
        },
      },
    },
    {
      id: 'track.stack',
      order: 320,
      screen: 'TrackMain',
      anchor: 'track.stack',
      addedInVersion: 1,
      text: {
        en: {
          title: 'My Supplement Stack',
          body: 'Your supplements for the day. Tap one to log a dose and hold to undo. Use Manage Stack to edit the list, the doses and when to take each one.',
        },
        'pt-BR': {
          title: 'Meu Stack de suplementos',
          body: 'Os seus suplementos do dia. Toque em um para registrar uma dose e segure para desfazer. Use Gerenciar Stack para editar a lista, as doses e quando tomar cada um.',
        },
      },
    },
    {
      id: 'track.history',
      order: 330,
      screen: 'TrackMain',
      anchor: 'track.history',
      placement: 'above',
      addedInVersion: 1,
      text: {
        en: {
          title: 'History and Charts',
          body: 'See your blends, macros, water and supplements over time in charts, so you can spot your habits.',
        },
        'pt-BR': {
          title: 'Histórico e gráficos',
          body: 'Veja seus blends, macros, água e suplementos ao longo do tempo em gráficos, para enxergar os seus hábitos.',
        },
      },
    },

    // ─── Me ────────────────────────────────────────────────────────────────
    {
      id: 'me.level',
      order: 400,
      screen: 'Me',
      anchor: 'me.level',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Your Progress',
          body: 'Your current streak, total blends, best streak and level are all here, with the XP you need for the next level.',
        },
        'pt-BR': {
          title: 'Seu progresso',
          body: 'A sua sequência atual, o total de blends, a melhor sequência e o nível ficam aqui, com o XP que falta para o próximo nível.',
        },
      },
    },
    {
      id: 'me.weeklyReport',
      order: 410,
      screen: 'Me',
      anchor: 'me.weeklyReport',
      placement: 'below',
      condition: 'isPro',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Weekly Report',
          body: 'Every week you get a summary of your blends, macros and habits, with your highlights. Open it here.',
        },
        'pt-BR': {
          title: 'Relatório Semanal',
          body: 'Toda semana você recebe um resumo dos seus blends, macros e hábitos, com os seus destaques. Abra aqui.',
        },
      },
    },
    {
      id: 'me.weeklyReportFree',
      order: 420,
      screen: 'Me',
      anchor: 'me.weeklyReport',
      placement: 'below',
      condition: 'notPro',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Weekly Report',
          body: 'A weekly summary of your blends, macros and habits, with your highlights. The full report is part of Pulse Pro.',
        },
        'pt-BR': {
          title: 'Relatório Semanal',
          body: 'Um resumo semanal dos seus blends, macros e hábitos, com os seus destaques. O relatório completo faz parte do Pulse Pro.',
        },
      },
    },
    {
      id: 'me.badges',
      order: 430,
      screen: 'Me',
      anchor: 'me.badges',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Achievements',
          body: 'Badges unlock as you reach milestones, like a number of blends or a long streak. Tap a badge to see what it takes to earn it.',
        },
        'pt-BR': {
          title: 'Conquistas',
          body: 'As medalhas são liberadas conforme você chega a marcos, como um número de blends ou uma sequência longa. Toque em uma para ver o que falta para ganhar.',
        },
      },
    },
    {
      id: 'me.modelGoal',
      order: 440,
      screen: 'Me',
      anchor: 'me.modelGoal',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Blender and Goal',
          body: 'Change the blender you use and your goal here. Recipes follow what your blender can handle, and your goal shapes your targets and missions.',
        },
        'pt-BR': {
          title: 'Liquidificador e objetivo',
          body: 'Mude aqui o liquidificador que você usa e o seu objetivo. As receitas respeitam o que o seu liquidificador aguenta, e o objetivo define as suas metas e missões.',
        },
      },
    },
    {
      id: 'me.goals',
      order: 450,
      screen: 'Me',
      anchor: 'me.nutritionGoals',
      addedInVersion: 1,
      text: {
        en: {
          title: 'My Goals',
          body: 'Set your daily protein, carbs, calories and diet here. The rings on Home follow these targets.',
        },
        'pt-BR': {
          title: 'Minhas metas',
          body: 'Defina aqui a sua proteína, carboidratos, calorias e dieta do dia. Os anéis do Início seguem essas metas.',
        },
      },
    },
    {
      id: 'me.allergies',
      order: 460,
      screen: 'Me',
      anchor: 'me.allergies',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Allergies',
          body: 'Tell us your allergies. Recipes from Pulse AI, the Pantry Scanner and the recipe of the day leave these ingredients out. Always check the ingredients too.',
        },
        'pt-BR': {
          title: 'Alergias',
          body: 'Conte as suas alergias. As receitas do Pulse AI, do scanner da despensa e a receita do dia deixam esses ingredientes de fora. Sempre confira os ingredientes também.',
        },
      },
    },
    {
      id: 'me.preferences',
      order: 470,
      screen: 'Me',
      anchor: 'me.preferences',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Units, Language and Theme',
          body: 'Choose metric or imperial units, the app language and a light or dark theme.',
        },
        'pt-BR': {
          title: 'Unidades, idioma e tema',
          body: 'Escolha unidades métricas ou imperiais, o idioma do app e o tema claro ou escuro.',
        },
      },
    },
    {
      id: 'me.replay',
      order: 480,
      screen: 'Me',
      anchor: 'me.replay',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Replay This Tour',
          body: 'Want to see this tour again? Tap here at any time to start it from the beginning.',
        },
        'pt-BR': {
          title: 'Ver o tour de novo',
          body: 'Quer ver este tour outra vez? Toque aqui quando quiser para começar do início.',
        },
      },
    },
    {
      id: 'me.planPro',
      order: 490,
      screen: 'Me',
      anchor: 'me.plan',
      condition: 'isPro',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Pulse Pro',
          body: 'Your Pulse Pro plan is active. You get Pulse AI without the daily limit, more Pantry scans and the full weekly report.',
        },
        'pt-BR': {
          title: 'Pulse Pro',
          body: 'O seu plano Pulse Pro está ativo. Você tem o Pulse AI sem limite diário, mais leituras da despensa e o relatório semanal completo.',
        },
      },
    },
    {
      id: 'me.planFree',
      order: 500,
      screen: 'Me',
      anchor: 'me.plan',
      condition: 'notPro',
      addedInVersion: 1,
      text: {
        en: {
          title: 'Pulse Pro',
          body: 'Pulse Pro removes the daily Pulse AI limit and adds more Pantry scans and the full weekly report. If you already subscribed, restore your purchase here.',
        },
        'pt-BR': {
          title: 'Pulse Pro',
          body: 'O Pulse Pro tira o limite diário do Pulse AI e adiciona mais leituras da despensa e o relatório semanal completo. Se você já assinou, restaure a compra aqui.',
        },
      },
    },

    // ─── Fim ───────────────────────────────────────────────────────────────
    {
      id: 'end.done',
      order: 1000,
      screen: 'Home',
      addedInVersion: 1,
      text: {
        en: {
          title: 'You Are All Set',
          body: 'That is the tour. Start with the recipe of the day or ask Pulse AI for something new. You can replay this tour at any time from Me.',
        },
        'pt-BR': {
          title: 'Tudo pronto',
          body: 'Esse foi o tour. Comece pela receita do dia ou peça algo novo ao Pulse AI. Você pode rever este tour quando quiser em Perfil.',
        },
      },
    },
  ],
};
