# Inventário Completo de Funcionalidades — BLENDi Pulse

**Data do levantamento:** 2026-10-08 (atualizado em 2026-11-09 pelo CP-1.1.1b: tela "Minhas metas", dieta editável, avisos de meta, limites de validação e badge de modelo — as seções afetadas estão marcadas com "CP-1.1.1b"; atualizado em 2026-11-10 pelo CP-1.1.1b.1: hidratação em fl oz no imperial, limite de profundidade do corpo JSON e escala de fonte do `AuthInput`)
**Método:** leitura direta do código-fonte do monorepo (`apps/mobile/src`, `apps/api/src`, `packages/shared/src`), sem uso de memória de conversas anteriores. Todas as afirmações abaixo têm evidência em arquivo/linha; onde o código não deixa algo claro ou algo esperado não existe, isso é dito explicitamente em vez de presumido.
**Propósito:** base técnica completa para depois traduzir em material de apresentação de negócio para o Jon. Este documento é técnico de propósito — nomes de arquivos, funções, variáveis e endpoints estão citados para permitir verificação.

---

## TAREFA 1 — Telas e navegação

### Árvore de navegação (React Navigation)

```
RootNavigator (apps/mobile/src/navigation/RootNavigator.tsx)
├── isRestoringSession=true → Splash screen (apenas visual, sem rota própria)
├── não autenticado → AuthNavigator (stack)
│   ├── Login
│   ├── Register
│   ├── ForgotPassword
│   ├── VerifyOtp
│   └── ResetPassword
├── autenticado + isNewUser=true → OnboardingNavigator (stack)
│   ├── OnboardingModel
│   ├── OnboardingGoal
│   ├── OnboardingDiet
│   ├── OnboardingBody
│   └── OnboardingMacros
└── autenticado + isNewUser=false → AppFlow + telas modais do RootStack
    ├── AppNavigator (bottom tabs)
    │   ├── Home (HomeScreen)
    │   ├── PulseAI → PulseAINavigator (stack)
    │   │   ├── PulseAIChat (PulseAIScreen)
    │   │   ├── Favorites (FavoritesListScreen)
    │   │   ├── PantryScanner (PantryScannerScreen)
    │   │   └── ConversationHistory (ConversationHistoryScreen)
    │   ├── Blend (BlendScreen)
    │   ├── Track → TrackNavigator (stack)
    │   │   ├── TrackMain (TrackScreen)
    │   │   ├── ManageStack (ManageStackScreen)
    │   │   ├── History (HistoryScreen)
    │   │   ├── ShoppingLists (ShoppingListsScreen)
    │   │   └── ShoppingListDetail (ShoppingListDetailScreen)
    │   └── Me (MeScreen)
    ├── Upgrade (UpgradeScreen) — acessível de várias telas, não é tab
    ├── WeeklyReport (WeeklyReportScreen) — idem
    ├── CompleteProfile (CompleteProfileScreen) — dados de corpo reais; aberta pelo aviso do Me
    └── NutritionGoals (NutritionGoalsScreen) — "Minhas metas"; aberta pela linha do card de configurações do Me (CP-1.1.1b)
```

### Lista de todas as telas e o que fazem (uma frase cada)

| Tela | Arquivo | Função |
|---|---|---|
| Login | `screens/auth/LoginScreen.tsx` | Login com e-mail/senha ou Google. |
| Register | `screens/auth/RegisterScreen.tsx` | Criação de conta (nome, e-mail, senha). |
| ForgotPassword | `screens/auth/ForgotPasswordScreen.tsx` | Pede e-mail para iniciar recuperação de senha. |
| VerifyOtp | `screens/auth/VerifyOtpScreen.tsx` | Confirma o código de 6 dígitos enviado por e-mail. |
| ResetPassword | `screens/auth/ResetPasswordScreen.tsx` | Define a nova senha após validar o OTP. |
| OnboardingModel | `screens/onboarding/OnboardingModelScreen.tsx` | Passo 1/5: escolhe o liquidificador — Lite (70W), Pro+ (120W), Steel (180W), "Outro modelo ou modelo antigo" (com campo opcional de marca/modelo) ou "Ainda não tenho um BLENDi". |
| OnboardingGoal | `screens/onboarding/OnboardingGoalScreen.tsx` | Passo 2/5: escolhe o objetivo (Muscle/Wellness/Energy/Recovery). |
| OnboardingDiet | `screens/onboarding/OnboardingDietScreen.tsx` | Passo 3/5: restrições alimentares (múltipla escolha, pode seguir sem marcar nada). |
| OnboardingBody | `screens/onboarding/OnboardingBodyScreen.tsx` | Passo 4/5: peso, altura, nível de atividade; calcula macros em tempo real. |
| OnboardingMacros | `screens/onboarding/OnboardingMacrosScreen.tsx` | Passo 5/5: confirma/ajusta as metas de proteína, carbo e caloria; finaliza o onboarding. |
| Home | `screens/HomeScreen.tsx` | Dashboard: saudação, nível, metas do dia, missões, atalhos, receita sugerida. |
| PulseAIChat | `screens/PulseAIScreen.tsx` | Chat com IA que gera receitas de shake/smoothie. |
| Favorites | `screens/FavoritesListScreen.tsx` | Lista de receitas favoritadas. |
| PantryScanner | `screens/PantryScannerScreen.tsx` | Scanner por câmera que reconhece ingredientes e sugere receitas. |
| ConversationHistory | `screens/ConversationHistoryScreen.tsx` | Histórico de conversas do Pulse AI por dia. |
| Blend | `screens/BlendScreen.tsx` | Timer de preparo do shake (com modo "Passos" alternativo quando a receita ativa tem passos estruturados), com avaliação ao final. |
| TrackMain | `screens/TrackScreen.tsx` | Registro de água, stack de suplementos do dia, atalhos. |
| ManageStack | `screens/ManageStackScreen.tsx` | Adicionar/remover/ativar suplementos do stack pessoal. |
| History | `screens/HistoryScreen.tsx` | Histórico de 7/30/90 dias de nutrição, hidratação e suplementos. |
| ShoppingLists | `screens/ShoppingListsScreen.tsx` | Lista de listas de compras (ativas e arquivadas). |
| ShoppingListDetail | `screens/ShoppingListDetailScreen.tsx` | Itens de uma lista de compras específica. |
| Me | `screens/MeScreen.tsx` | Perfil: avatar, estatísticas, nível, badges, configurações, notificações, conta. |
| Upgrade | `screens/UpgradeScreen.tsx` | Tela de venda do plano Pulse Pro (paywall). |
| WeeklyReport | `screens/WeeklyReportScreen.tsx` | Relatório semanal (feature Pro) com paywall para quem não é Pro. |
| CompleteProfile | `screens/CompleteProfileScreen.tsx` | Edita os dados de corpo (peso, altura, nascimento, sexo, meta de peso, atividade) fora do onboarding; recalcula as metas. Mesmos campos e mesma leitura de peso/altura do onboarding, com "Próximo/Concluir" no teclado. |
| NutritionGoals ("Minhas metas") | `screens/NutritionGoalsScreen.tsx` | CP-1.1.1b: edita proteína, carboidratos, calorias, hidratação e dieta, com validação inline, avisos de meta do backend e confirmação ao sair com alteração não salva. |

**Telas que não aparecem na navegação principal:** nenhuma tela de erro/loading dedicada foi encontrada como rota separada — loading e erro são tratados *dentro* das telas acima (skeletons, banners de erro com retry), não como rotas próprias. Não há deep link documentado além do uso interno de `blendipulse://` para o callback do Google OAuth e para notificações push (`blendipulse://pulse-ai/chat`, `blendipulse://blend`, `blendipulse://track`, `blendipulse://me`, `blendipulse://me/weekly-report`).

---

## TAREFA 2 — Funcionalidades detalhadas por tela

### Autenticação

**LoginScreen** — campos e-mail/senha (toggle de visibilidade da senha); botão "Esqueci minha senha"; botão "Criar conta"; botão de login com Google. Erro 401 específico marca o campo de senha; outros erros aparecem como erro geral de formulário.

**RegisterScreen** — campos nome, e-mail, senha, confirmar senha; medidor de força de senha (Weak/Fair/Good/Strong, 4 critérios: 8+ caracteres, maiúscula, dígito, 12+ caracteres); senha exige minúscula+maiúscula+dígito, 8-72 caracteres. O registro já envia valores padrão fixos de modelo/objetivo/metas (`Lite`, `Wellness`, 120g proteína, 2000kcal) — o onboarding completo (5 telas) depois sobrescreve isso. Links para Termos de Uso e Política de Privacidade. Não tem botão de login social.

**ForgotPasswordScreen** — campo e-mail; sempre avança para a próxima tela mesmo se a chamada falhar (engolindo erro de rede de propósito, para não dar pista sobre e-mails inexistentes); loading mínimo artificial de 800ms antes de navegar (anti-enumeração por tempo de resposta).

**VerifyOtpScreen** — 6 caixas de código, com autofill do SMS/clipboard do sistema; auto-envia ao completar os 6 dígitos (sem botão); mostra e-mail mascarado (ex: `ga****@gmail.com`); reenviar código com contador de 60s; feedback de shake/borda vermelha em código inválido.

**ResetPasswordScreen** — campos nova senha + confirmar senha (mesmas regras de complexidade do registro); recebe o `resetToken` da tela anterior; ao suceder, roda uma animação de celebração (check com onda expansindo) e depois de 2,5s volta para o Login.

**Login social (Google)** — usa `expo-web-browser` (não usa SDK nativo do Google) para abrir um navegador in-app, autoriza no Google, e o backend redireciona de volta via deep link `blendipulse://auth/callback` com os tokens. Três casos no backend: conta já vinculada → login direto; e-mail já existente sem Google → vincula a conta; e-mail novo → cria conta com valores de onboarding padrão.

### Onboarding (5 telas, sem navegação manual entre elas — tudo guiado)

1. **Modelo** — 5 opções, sem chamada de API: Lite (70W), ProPlus (120W), Steel (180W), "Outro modelo ou modelo antigo" e "Ainda não tenho um BLENDi". As duas últimas não têm badge de potência, gravam o modelo como `Lite` (limites de segurança mais conservadores da Pulse AI) e guardam a **posse** (`blendiOwnership`: `blendi`/`other`/`none`) num campo separado, para uso futuro (Shop Tab). Em "Outro modelo" aparece um campo de texto opcional para marca e modelo (até 60 caracteres, ex.: "BLENDi antigo, Ninja, NutriBullet"); o botão de continuar não depende dele. O enum `blendiModel` continua com 3 valores.
2. **Objetivo** — Muscle / Wellness / Energy / Recovery, sem chamada de API.
3. **Dieta** — 4 restrições em múltipla escolha (toque marca e desmarca): sem laticínios, vegano, sem oleaginosas, sem açúcar adicionado. Dá para continuar sem marcar nada (o botão passa a dizer "Sem restrições"). Mostra um alerta discreto: são preferências, não uma garantia para alergias. A Pulse AI e o Pantry Scanner tratam cada restrição como obrigatória em toda receita (aplicada pelo prompt, sem validação de ingredientes no backend). Desde o CP-1.1.1b a dieta também é editável depois do onboarding, na tela "Minhas metas" (os mesmos 4 cards e o mesmo alerta de alergia, via o componente compartilhado `DietaryPreferencesPicker`); contas antigas, que nunca definiram dieta, abrem com a lista vazia e já podem escolher. O rótulo pt-BR é "Sem laticínios" (a regra do prompt proíbe qualquer laticínio, inclusive leite sem lactose).
4. **Corpo** — peso, altura (métrico ou imperial), data de nascimento, sexo biológico (masculino/feminino), meta de peso (perder/manter/ganhar) e nível de atividade (sedentário/levemente ativo/moderadamente ativo/muito ativo). Calcula macros em tempo real (debounce 600ms) chamando o backend; mostra IMC com classificação; tem botão "Pular por agora". Peso e altura aceitam até uma casa decimal, com ponto ou vírgula; texto que não é número ("70abc", "1.2.3", "-3", "1e2") mostra erro no campo e não calcula. Altura no imperial é um campo só, em polegadas. No teclado, "Próximo"/"Concluir" passa por peso, altura e data de nascimento (barra acima do teclado no iOS, tecla de ação no Android).
5. **Macros** — mostra/permite ajustar proteína, calorias e carboidratos calculados no passo anterior; ao finalizar, salva tudo e marca o onboarding como concluído — o app navega automaticamente para a tela principal. Desde o CP-1.1.1b a validação usa os **mesmos limites do backend** (`packages/shared`): proteína 10–800 g, calorias 300–15.000 kcal e carboidratos 0–1.500 g (antes eram faixas locais mais estreitas — 10–400, 500–10.000 e 50–800 — que barravam aqui valores que o Me aceitava). O texto de recomendação continua mostrando faixas **recomendadas**, separadas das de validação: proteína e calorias por objetivo, e carboidratos 50–800 g. Os campos só aceitam inteiros ("12abc" e "150,5" dão erro no campo; antes eram lidos como 12 e 150) e têm o mesmo "Próximo"/"Concluir" no teclado.

A fórmula de cálculo (`calculateMacroTargets`, backend, `utils/macroCalculation.utils.ts`, chamada por `user.controller.ts`) usa Mifflin-St Jeor **com idade e sexo reais do usuário**: a idade é derivada da data de nascimento coletada na etapa de Corpo (nunca armazenada diretamente, sempre recalculada a partir de `birthDate` no momento do cálculo) e a constante da fórmula (+5 ou −161) varia pelo sexo biológico informado. Multiplicadores de atividade e ajuste de calorias/proteína variam por objetivo escolhido; o ajuste calórico (déficit/superávit) varia pela meta de peso (perder/manter/ganhar).

### Início (Home)

- Saudação dinâmica por horário do dispositivo + data formatada.
- Indicador de nível (clicável, abre detalhe com barra de progresso animada) e badge Grátis/Pro.
- Atalhos rápidos: "Registrar água" (+250ml) e "Iniciar/Último Blend".
- Anéis de meta (proteína, carboidrato, caloria) + barra de progresso de hidratação do dia.
- Badge de streak (3 estágios visuais: fraco, normal, "lendário" com giro contínuo a partir de 30 dias).
- Até 3 missões diárias com progresso e recompensa de XP.
- Carrossel de "protocolos rápidos" (4 prompts prontos: treino, mães ativas, coquetel de praia, viagem) que abrem o Pulse AI já com o texto preenchido.
- Card de receita sugerida do dia, por objetivo do usuário (pool fixo de 20 receitas por objetivo, 80 no total, escritas no código, não geradas por IA). A receita do dia é escolhida por rotação determinística 100% local (sem rede, sem estado salvo), via `getLocalDayIndex(date, timezone?)` em `DailyRecipeCard.tsx` — extrai ano/mês/dia pelo fuso real do aparelho (`Intl.DateTimeFormat(...).formatToParts(...)`), não pela divisão do epoch UTC. Bug original (fórmula calculava o dia em UTC) e correção documentados no achado 1 de [docs/fixes/cp1.1.8-achados-fora-do-escopo.md](fixes/cp1.1.8-achados-fora-do-escopo.md), **corrigido**.
- Pull-to-refresh recarrega perfil, blends de hoje e hidratação de hoje em paralelo.

### Pulse AI (chat)

- Campo de texto livre (limite de 500 caracteres) sempre devolve **uma receita estruturada** (não é um chat genérico de texto livre — é 100% orientado à geração de receita).
- Sugestões prontas: 3 chips de boas-vindas + placeholders rotativos no input, ambos variando por objetivo do usuário.
- "Protocolo pendente": outra tela pode pré-preencher e auto-enviar uma mensagem ao abrir o chat (usado pelos atalhos da Home).
- Indicador visual de uso restante (quantas mensagens grátis sobraram hoje).
- Indicador "veio do cache" (ícone de raio) quando a resposta não precisou chamar a IA de novo.
- Banner "Visualizando uma conversa anterior" quando o usuário abre uma conversa do histórico, com botão para iniciar uma nova.
- Receita gerada traz 3 a 5 passos estruturados (`steps`, campo opcional) além do parágrafo único (`blendInstruction`) — usados pelo modo "Passos" do Blend quando o usuário inicia essa receita.

### Favoritos

- Lista de receitas favoritadas (coração animado para favoritar/desfavoritar direto no card da receita, com atualização otimista).
- Swipe para remover na lista de favoritos.
- Os passos estruturados da receita (quando existirem) são preservados ao favoritar.

### Pantry Scanner (scanner de despensa)

- Fluxo de 5 passos: permissão de câmera → captura (ou escolha da galeria) → análise → confirmação de ingredientes → receitas.
- Reconhece até 2 receitas por scan, usando só os ingredientes confirmados pelo usuário.
- Indicador de "scans restantes no mês" (plano grátis).
- Usuário pode marcar/desmarcar ingredientes identificados e adicionar ingredientes manualmente antes de gerar as receitas.
- Cada receita gerada também traz passos estruturados (`steps`), mesmo campo opcional da Pulse AI.
- Sem receita (a IA falhou ou não devolveu nenhuma): a etapa de receitas mostra "Nenhuma receita desta vez" e avisa que o scan não foi descontado, com o botão de escanear de novo. O backend devolve o scan e não dá XP (CP-1.1.1d). Os outros casos (nenhuma comida, nenhum ingrediente utilizável, limite, dieta não atendida, erro de rede) continuam com a mensagem própria e voltam para a câmera.

### Histórico de conversas (Pulse AI)

- Lista as últimas 20 conversas (sem paginação adicional, sem busca por texto), com "hoje"/"ontem"/"N dias atrás".
- Ao tocar, abre a conversa completa dentro do próprio chat do Pulse AI.

### Blend

- Timer configurável (ajuste de ±5s) com início/pausa e sequência de vibrações (haptics) na conclusão.
- Avaliação de 1 a 5 estrelas (ou pular) ao final do blend, que é registrado no histórico.
- Funciona offline: se não há conexão, o blend é salvo localmente e sincronizado depois — nunca se perde.
- Lembrete de limpeza do liquidificador se não foi marcado como limpo nos últimos 7 dias.
- Recupera o timer em andamento se o app for fechado e reaberto no meio do preparo.
- Pode receber uma receita vinda do Pulse AI, da Home ou dos Favoritos; mostra cabeçalho com macros e ingredientes da receita ativa, com botão para fechar e voltar ao "blend livre".
- Quando a receita ativa tem passos estruturados (`steps`), mostra um controle de alternância Timer/Passos no topo da tela; o modo "Passos" (`StepModeView`) exibe um passo por vez com navegação e contador de toque para passos que envolvem gelo/fruta congelada, e leva ao timer de bater normal ao terminar o último passo. Sem passos (receitas de IA/favoritos anteriores a essa mudança), nenhuma alternância aparece.
- Tela permanece acesa (`expo-keep-awake`) durante toda a montagem, em qualquer modo.

### Acompanhar (Track)

- Registro rápido de água (+250ml) com atualização otimista.
- Progresso de hidratação do dia + mini-gráfico dos últimos 7 dias.
- Stack de suplementos ativos do dia: toque para somar 1 dose tomada, toque longo para subtrair; indicador visual quando todas as doses do dia foram batidas.
- Badge de itens pendentes nas listas de compras no cabeçalho.
- Atalhos para Histórico, Gerenciar Stack e Listas de Compras.

### Gerenciar Stack (suplementos)

- Lista de suplementos (ativos e inativos) com nome, dosagem, meta diária de doses e horário preferido (manhã/pré-treino/pós-treino/noite/com refeição).
- Adicionar novo suplemento via formulário (nome, dosagem opcional, meta diária de 1-20 doses, horário).
- Limitação conhecida: no iPhone, o campo de meta diária (teclado numérico) não tem como fechar o teclado pelo próprio teclado (falta a barra "Concluir" que as telas de onboarding, completar perfil e metas têm).
- Ativar/desativar e excluir suplemento (com confirmação).
- Bloqueia qualquer ação se o dispositivo estiver offline.

### Histórico (History)

- Seletor de período: 7, 30 ou 90 dias.
- Seção **Nutrição**: total de blends, proteína média/dia, calorias totais, melhor dia, gráfico de barras, lista paginada de todos os blends.
- Seção **Hidratação**: total consumido, dias com meta batida, média diária, gráfico de barras.
- Seção **Suplementos**: adesão média, dias perfeitos, suplemento mais tomado, mapa de calor (heatmap) por dia.
- Cada seção tem seu próprio estado de erro/retry independente.

### Listas de Compras

- Listagem de listas ativas (com indicador de pendências) e seção de listas arquivadas.
- Criar, renomear, arquivar/restaurar e excluir listas.
- **Limite do plano grátis: 1 lista ativa por vez** (ver Tarefa 7).
- Dentro de uma lista: duas seções (a comprar / no carrinho), marcar/desmarcar itens, adicionar item manual, limpar itens já marcados, importar ingredientes direto de uma receita favorita.
- Funciona offline com sincronização posterior.

### Perfil (Me)

- Avatar/foto de perfil: tirar foto, escolher da galeria ou remover (com compressão e validação de tamanho/formato no app e no servidor).
- 4 estatísticas em grade: streak atual, total de blends, maior streak já alcançado, nível.
- Card de progresso de nível (nome do nível + barra até o próximo).
- Grade de 6 badges/conquistas com detalhe ao tocar (ver Tarefa 4).
- Acesso ao Relatório Semanal e à tela de Upgrade (se não for Pro) ou "Restaurar compra".
- Compartilhar card da semana (se a conta já existe desde antes da semana atual).
- Bloco de configurações (ver Tarefa 3) com 6 linhas: Meu BLENDi (modelo), Objetivo, **Minhas metas** (resumo "150g · 2.100 kcal"; abre a tela própria — CP-1.1.1b), Unidade, Idioma e Tema. Proteína, carboidratos, calorias e hidratação **não** são mais editadas aqui.
- Bloco de notificações (ver Tarefa 3), sair da conta, links de Termos e Privacidade.

### Upgrade (paywall) e Relatório Semanal

Detalhados nas Tarefas 6 e 7.

---

## TAREFA 3 — Configurações e personalização

### Metas nutricionais e hidratação (CP-1.1.1b)

Editadas na tela **"Minhas metas"** (`NutritionGoalsScreen`), aberta pela linha de mesmo nome no card de configurações do Perfil. Tudo na mesma tela, com um botão "Salvar" fixo no rodapé:

| Configuração | Limite (validado no app **e** no backend, vindo de `packages/shared`) |
|---|---|
| Meta de proteína (g/dia) | 10–800 |
| Meta de carboidrato (g/dia) | 0–1.500 |
| Meta de calorias (kcal/dia) | 300–15.000 |
| Meta de hidratação (ml no métrico; **fl oz com uma casa decimal** no imperial — CP-1.1.1b.1) | 500–8.000 ml (17.0–270.5 fl oz, derivados dos limites em ml) |
| Dieta (4 restrições, múltipla escolha) | `dairy_free`, `vegan`, `nut_free`, `no_added_sugar`; lista vazia = sem restrições |

Comportamento:

- **Validação inline por campo**, só depois que a pessoa digita algo (só aceita inteiros, exceto a hidratação no imperial, que aceita uma casa decimal com ponto ou vírgula); "Salvar" fica desabilitado sem mudança ou com campo inválido.
- **Hidratação no imperial (CP-1.1.1b.1):** o campo mostra a meta em fl oz com o mesmo arredondamento da Home (2500 ml → 84.5), com rótulo "(fl oz)" e teclado decimal; ao salvar, o valor vira ml inteiro. Se a pessoa não mexeu ou redigitou o valor exibido, a hidratação não é enviada (abrir e salvar não troca 2500 ml por 2499). A conversão usa a constante única de `utils/volumeUnits.ts`.
- **PATCH só com o que mudou** (`PATCH /users/me`); a hidratação alterada também invalida a query `hydrationToday` (a Home e o Track leem a meta de lá) e o perfil local é sincronizado (Relatório Semanal e Histórico leem as metas dele).
- **Avisos de meta do backend:** em edição manual de proteína, carboidratos ou calorias fora de faixas de bom senso, o backend devolve `warnings` e a tela fica aberta mostrando, num quadro âmbar abaixo do campo, que a meta **foi salva** mas vale conferir (6 textos, em inglês e português; a regra é do backend — o app só exibe e ignora `code` desconhecido). Editar o campo apaga o aviso dele. Quem não tem dados de corpo salvos não recebe avisos.
- **Aviso fixo na tela:** mudar o objetivo ou os dados de corpo recalcula proteína, carboidratos e calorias automaticamente (e sobrescreve o que foi digitado à mão).
- **Sair com alteração não salva** pede confirmação ("Descartar alterações?"), inclusive pelo gesto do iOS e pelo botão físico do Android.
- **Teclado:** teclado numérico, "Próximo"/"Concluir" (barra acima do teclado no iOS, tecla de ação no Android), rolagem automática até o campo em foco (nos 4), tocar fora fecha o teclado, "Salvar" sempre visível. A barra é o componente compartilhado `NumericKeyboardAccessory`, usado também no onboarding (corpo e metas) e no completar perfil, e a leitura dos números é a mesma dessas telas (`utils/numericInput.utils.ts`).

As demais configurações continuam num bottom sheet genérico (`EditSettingSheet`): modelo BLENDi (as mesmas 5 opções do onboarding; em "Outro modelo" há o campo opcional de marca/modelo, já preenchido com o valor salvo), objetivo (Muscle/Wellness/Energy/Recovery), unidade, idioma e tema. A linha "Meu BLENDi" do card reflete a posse: o nome do modelo para quem tem um BLENDi, "Outro modelo" (seguido do texto digitado, quando houver) ou "Ainda não tenho um BLENDi".

Não existe campo de meta de gordura na UI (o backend a calcula e a aceita, mas a linha está desativada até o consumo de gordura ser rastreado).

### Sistema de unidades

Toggle métrico/imperial. Afeta a exibição de peso, altura, volume/hidratação e o formato de horário (24h vs 12h AM/PM) em todo o app.

### Idioma

Dois idiomas disponíveis: **inglês** e **português (Brasil)**. Troca local e imediata (persistida em MMKV, lida antes de qualquer tela renderizar) e também salva no servidor — o conteúdo das notificações push também é traduzido conforme esse idioma salvo.

### Configurações de conta

- **Nome**: exibido, mas **não existe nenhuma forma de editá-lo** no app.
- **E-mail**: exibido, **não editável**.
- **Senha**: **não há "trocar senha" dentro do app logado** — a única forma de trocar senha é o fluxo completo de "esqueci minha senha" (fora da área autenticada).
- **Excluir conta**: não existe essa opção em nenhum lugar do código.
- **Foto de perfil**: editável (ver Tarefa 2).

### Notificações configuráveis individualmente

| Notificação | Toggle na UI? | O que é | Horário |
|---|---|---|---|
| Daily Pulse | Sim | Sugestão de receita matinal | Ajustável pelo usuário (hora/minuto customizados) |
| Lembrete de Streak | Sim | Avisa à noite se ainda não fez blend hoje | Fixo, 19h local |
| Lembrete de Suplementos | Sim | Avisa quais suplementos faltam tomar hoje | Fixo, 20h local |
| Lembrete de Hidratação | Sim | Avisa se está abaixo de 50% da meta de água | Fixo, 15h local |
| Subiu de Nível | **Não** (existe no backend, mas sem controle na tela) | Comemora quando o usuário sobe de nível | Imediato, no momento do level-up |
| Relatório Semanal | **Não existe opção de desativar** | Avisa que o relatório da semana ficou pronto | Segunda-feira, 9h local, só para usuários Pro |

---

## TAREFA 4 — Sistema de gamificação

### Streak

- A única ação que conta para manter o streak é **fazer um blend**. Nenhuma outra ação (água, suplementos, Pulse AI) afeta o streak.
- Cálculo com reconhecimento de timezone do usuário: blend no mesmo dia local não soma; blend no dia seguinte ao último soma +1; se houver um buraco de 2+ dias, o streak reseta para 1.
- **Não existe nenhum tipo de proteção/"freeze" de streak** — confirmado ausente em todo o código.
- O número do streak **não é zerado automaticamente à meia-noite por um job** — ele fica "desatualizado" (mostrando o valor antigo) até o próximo blend, quando só então é recalculado e corrigido.
- Exibido na Home (badge), no Perfil (estatística) e usado para o badge "Mestre do Streak".

### XP e níveis

- XP é concedido por: fazer um blend (10), bater a meta diária de proteína (8), calorias (5), hidratação (5), completar todos os suplementos do dia (5), usar o Pulse AI (3), escanear a despensa (5), favoritar uma receita nova (2), e por completar cada uma das missões diárias (10 a 20 XP cada, variando por tipo) + bônus de 20 XP ao completar as 3 missões do dia.
- **Não há um número máximo de níveis — a progressão é infinita.** Níveis 1 a 10 têm nomes próprios (Iniciante → Lenda); a partir do nível 11, o nome exibido é genérico ("Guru do Blend (N)") e o XP necessário continua subindo a cada nível.
- Exibido na Home (pill clicável), no Perfil (card com barra de progresso), e com uma celebração em tela cheia (com opção de compartilhar) quando o usuário sobe de nível, além de notificação push.

### Badges / conquistas

**Achado importante: badges são calculados inteiramente no aplicativo (client-side), não existem no backend.** Não há persistência, histórico de desbloqueio nem celebração dedicada ao desbloquear um badge (diferente do level-up).

Lista completa dos 6 badges existentes no código, cada um com 3 estágios (bronze/prata/ouro):

| Badge | Métrica | Bronze | Prata | Ouro |
|---|---|---|---|---|
| Jornada Blend | total de blends feitos | 1 | 10 | 50 |
| Mestre do Streak | maior streak já alcançado | 3 | 7 | 30 |
| Adotante Inicial | — | sempre desbloqueado (hardcoded, sem condição real) | — | — |
| BLENDi Lite | modelo atual = Lite | desbloqueado se o modelo escolhido hoje for Lite | — | — |
| BLENDi Pro+ | modelo atual = ProPlus | desbloqueado se o modelo escolhido hoje for ProPlus | — | — |
| BLENDi Steel | modelo atual = Steel | desbloqueado se o modelo escolhido hoje for Steel | — | — |

Nota (corrigida no CP-1.1.1b): quem escolhe "Outro modelo" ou "Ainda não tenho um BLENDi" grava `Lite`, mas **não** ganha mais o badge "BLENDi Lite" — os 3 badges de modelo agora só contam quando o modelo bate **e** a posse (`blendiOwnership`) é `blendi`. Contas antigas, sem o campo de posse, contam como `blendi`.

Nota: os 3 badges de modelo são mutuamente exclusivos e **somem visualmente se o usuário troca de modelo** (não existe histórico de "já tive esse modelo").

### Missões diárias

9 tipos possíveis de missão, cada uma concluída uma única vez por dia:

| Missão | XP |
|---|---|
| Faça um blend | 15 |
| Bata a meta de proteína | 20 |
| Bata a meta de calorias | 15 |
| Bata a meta de hidratação | 15 |
| Complete os suplementos | 20 |
| Use o Pulse AI | 10 |
| Salve uma receita | 10 |
| Escaneie sua despensa | 15 |
| Faça uma receita salva (favorito) | 15 |
| **Bônus** por completar as 3 do dia | 20 |

Todo dia, o sistema sorteia **3 dessas 9** de forma ponderada pelo objetivo do usuário (ex: quem tem objetivo "Muscle" tem mais chance de receber missões de proteína/blend), removendo missões que não fazem sentido no momento (ex: "complete os suplementos" se o usuário não tem suplemento algum cadastrado; "escaneie a despensa" se o usuário grátis já usou a cota do mês). O reset acontece à meia-noite no horário local do usuário.

---

## TAREFA 5 — Pulse AI em detalhe

- **Tipo de pedido aceito:** texto livre (até 500 caracteres), mas a resposta é **sempre uma receita estruturada** de shake/smoothie — não é um assistente de texto livre genérico.
- **Contexto do usuário usado para personalizar:** modelo do liquidificador, objetivo, **restrições alimentares (dieta)**, idioma, sistema de unidades, metas diárias de proteína/carboidrato/caloria, as últimas 5 receitas feitas no blender (para não repetir) e o histórico de conversa do próprio dia (até 6 trocas). **Suplementos cadastrados, streak, missões e hidratação NÃO são usados para personalizar a resposta** — o streak/XP só são atualizados *depois* como efeito colateral, nunca lidos pela IA.
- **Receitas completas, não só sugestões:** toda resposta vem em formato estruturado fixo com título, ingredientes com quantidade, macros calculadas (proteína/carbo/gordura/calorias), tempo de preparo e instrução de preparo. Há 3 camadas de validação automática no backend (formato, limite físico de proteína do liquidificador, e consistência das macros), que tentam corrigir a receita antes de entregá-la ao usuário.
- **Limite por plano:** usuário grátis tem **3 mensagens por dia** no chat (reseta à meia-noite local); usuário Pro é ilimitado.
- **Pantry Scanner:** reconhece ingredientes de despensa/geladeira por foto (usando um modelo de visão de IA) e gera exatamente 2 receitas com os ingredientes confirmados. Usuário grátis tem **3 scans por mês**; Pro é ilimitado. Um scan só é "gasto" se a foto realmente tiver ingredientes utilizáveis reconhecidos com confiança **e** pelo menos uma receita for entregue: sem receita (falha da IA, lista vazia ou dieta não atendida), o scan é devolvido e não há XP (CP-1.1.1c e CP-1.1.1d).
- **Dieta no prompt (Pulse AI e Pantry Scanner):** com pelo menos uma restrição, o prompt ganha um bloco "obrigatório" que a mensagem do usuário não pode revogar (nem "ignore as restrições", nem "estou liberado pelo médico"), e o texto fixo do prompt deixa de sugerir ingredientes proibidos (tabela nutricional, exemplos). No Pantry Scanner, itens da foto que a dieta proíbe são tratados como indisponíveis. Quem não tem restrição recebe o mesmo prompt de antes. **A garantia é do prompt, não de uma validação:** o modelo de IA pode errar, por isso a tela de dieta avisa que não é garantia para alergias. Detalhes e medições em `docs/fixes/cp-1.1.1a-testes-pentest.md`.
- **Cache de respostas:** existe um cache de 7 dias no banco de dados, por usuário + contexto completo (modelo, objetivo, idioma, dieta, texto exato da pergunta) — mesma pergunta de outro usuário, ou com outro objetivo/modelo, não aproveita o cache. Importante: **um "cache hit" ainda consome 1 das 3 mensagens grátis do dia**, só evita chamar a IA de novo.
- **Favoritos:** qualquer receita gerada (chat ou scanner) pode ser favoritada; favoritos ficam salvos indefinidamente.
- **Histórico de conversas:** agrupado por dia (uma "conversa" por dia corrido), mostra as últimas 20, sem busca por texto.

---

## TAREFA 6 — Funcionalidades de backend com reflexo direto no usuário

### Webhook de assinatura (RevenueCat)

Processa apenas 4 tipos de evento: compra inicial, renovação, cancelamento e expiração — define o usuário como Pro ou não Pro e atualiza os dados da assinatura. **Importante: eventos de "falha de pagamento" e "reembolso" não têm tratamento dedicado no webhook** — só a expiração natural (sem renovação) de fato revoga o acesso Pro; um cancelamento mantém o acesso até a data de expiração.

### Autenticação

- Registro e login por e-mail/senha, com limite de tentativas (anti-força-bruta) e mensagens de erro genéricas propositalmente (para não revelar se um e-mail existe ou não).
- Login com Google com verificações de segurança (rejeita e-mail não verificado pelo Google antes de qualquer outra coisa).
- Recuperação de senha por código de 6 dígitos enviado por e-mail, válido por 15 minutos, com no máximo 5 tentativas.
- Trocar senha ou fazer logout invalida automaticamente todas as sessões/dispositivos anteriores do usuário.
- Limite de 120 requisições por minuto por usuário em qualquer rota autenticada.

### Relatório Semanal

- Gerado automaticamente **apenas para usuários Pro**, toda segunda-feira às 9h no horário local de cada usuário.
- Contém: resumo de nutrição da semana, hidratação, adesão a suplementos, e um resumo de gamificação (XP ganho, nível atual, missões completadas, streak, se houve level-up), além de comparação com a semana anterior quando disponível.
- **Não é enviado por e-mail** — fica disponível só dentro do app, com uma notificação push avisando que está pronto (só se o usuário tiver permitido push e tiver um token válido).

### E-mails automáticos

**O serviço de e-mail envia de verdade por SMTP (Google Workspace) em produção** (`email.service.ts`), controlado pela flag `ENABLE_DEV_EMAIL_LOG`: com a flag `true` (ambiente de desenvolvimento), só registra no log do servidor; com a flag `false` (produção), entrega de fato na caixa de entrada do usuário. Isso afeta:
- E-mail de boas-vindas (disparado no registro e no primeiro login via Google) — enviado de verdade em produção.
- E-mail de redefinição de senha (com o código OTP) — enviado de verdade em produção; o código é validado normalmente no fluxo independente do método de entrega.
- Existe um terceiro método (e-mail de verificação de conta) implementado, mas **nunca chamado por nenhuma tela ou rota** — continua código morto, e esse é o único dos três métodos que permanece como stub (loga ou avisa que o provedor não está configurado, nunca envia de fato).
- **Não existem** e-mails de recibo de assinatura, de cancelamento ou de relatório semanal.

### Notificações push

6 tipos no total: Daily Pulse, Lembrete de Streak, Lembrete de Suplementos, Lembrete de Hidratação, Relatório Semanal (detalhados na Tarefa 3) e Level Up (disparado por evento, não por horário fixo, sempre que o usuário sobe de nível). Tokens inválidos são removidos automaticamente; cada tipo nunca notifica duas vezes no mesmo dia para o mesmo usuário.

### Outras funcionalidades de backend com efeito no usuário

- **Foto de perfil**: upload com limite de tamanho e validação real do conteúdo do arquivo (não só da extensão), para impedir que um arquivo disfarçado de imagem seja aceito.
- **Limite mensal de Pantry Scanner** e **limite diário de Pulse AI** são aplicados diretamente no backend (não dependem só do app para funcionar).

---

## TAREFA 7 — Plano grátis vs Pulse Pro

**Nota de nomenclatura:** "ProPlus" no código é o nome de um **modelo físico de liquidificador** (Lite/ProPlus/Steel) — não tem nenhuma relação com o plano de assinatura. São dois conceitos completamente independentes.

| Funcionalidade | Grátis | Pro |
|---|---|---|
| Mensagens no Pulse AI (chat) | 3 por dia | Ilimitado |
| Scans no Pantry Scanner | 3 por mês | Ilimitado |
| Listas de compras ativas simultâneas | 1 | Ilimitado |
| Relatório Semanal | Nunca é gerado | Gerado automaticamente toda segunda-feira |
| Selo "Pro" no perfil | Não | Sim (cosmético) |

**Onde é verificado:** não existe um middleware único de "plano" — cada controller (Pulse AI, Pantry Scanner, Listas de Compras, geração do Relatório Semanal) checa o campo `isPro` do usuário individualmente. Favoritos, hidratação, suplementos, histórico de blends e missões diárias **não têm nenhuma diferenciação entre grátis e Pro**.

**Planos existentes:** apenas 2 SKUs — mensal (US$ 6,99) e anual (US$ 39,99, com desconto calculado dinamicamente a partir do preço real da loja).

**O que a tela de Upgrade vende (texto literal do código):** "Desbloqueie todo o potencial do BLENDi Pulse" — 5 benefícios listados: conversas ilimitadas com o assistente, scanner de despensa sem limite mensal, múltiplas listas de compras simultâneas, relatório semanal personalizado ("em um próximo checkpoint" — **o texto de marketing descreve isso como algo futuro, mas o backend já entrega essa funcionalidade de fato para quem é Pro hoje — os dois estão desalinhados**), e um selo exclusivo de assinante no perfil.

**Sobre o guardrail de proteína por modelo de liquidificador:** existe um limite de proteína por receita que varia pelo **modelo físico do liquidificador** (Lite 35g, ProPlus 45g, Steel 55g) — isso é independente do plano de assinatura; um usuário grátis com liquidificador Steel tem o mesmo teto de 55g que um usuário Pro com o mesmo modelo. Não foi encontrada no código atual nenhuma diferenciação desse guardrail por plano de assinatura.

---

## TAREFA 8 — Checklist de cobertura

| Área | Coberto? |
|---|---|
| Configurações | Sim — Tarefa 3 |
| Onboarding | Sim — Tarefas 1 e 2 |
| Autenticação | Sim — Tarefas 2 e 6 |
| Início/dashboard | Sim — Tarefa 2 |
| Pulse AI | Sim — Tarefas 2 e 5 |
| Pantry Scanner | Sim — existe; Tarefas 2 e 5 |
| Blend/timer | Sim — Tarefa 2 |
| Acompanhar (água, suplementos, histórico) | Sim — Tarefa 2 |
| Perfil (estatísticas, conquistas, nível) | Sim — Tarefas 2 e 4 |
| Gamificação (streak, XP, badges, missões) | Sim — Tarefa 4 |
| Notificações | Sim — Tarefas 3 e 6 |
| Relatório semanal | Sim — Tarefas 6 e 7 |
| Sistema de assinatura/paywall | Sim — Tarefa 7 |

**O que foi confirmado que NÃO existe no código (para não ficar implícito):**
- Edição de nome ou e-mail dentro do app.
- Troca de senha dentro da área logada (só via fluxo "esqueci minha senha").
- Exclusão de conta pelo próprio usuário.
- Envio real do e-mail de verificação de conta (o único dos três métodos de e-mail que continua em modo stub, nunca chamado por nenhuma tela ou rota) — boas-vindas e redefinição de senha **já são** enviados de verdade por SMTP em produção.
- Proteção/"freeze" de streak.
- Controle, pelo usuário, da notificação de "subiu de nível" (existe no backend, mas sem toggle na tela).
- Opção de desativar a notificação de relatório semanal.
- Persistência ou histórico de desbloqueio de badges no backend (tudo é calculado no app, na hora).
- Tratamento dedicado de falha de pagamento ou reembolso no webhook de assinatura.
- Qualquer diferenciação de plano (grátis/Pro) em: favoritos, hidratação, suplementos, histórico de blends, missões diárias, ou no guardrail de proteína por modelo de liquidificador.
- Qualquer sistema de analytics/tracking de eventos no app (procurado explicitamente nas telas de autenticação/onboarding, nenhuma lib encontrada em todo o projeto mobile).

**Pontos adicionais encontrados que não se encaixam exatamente nas categorias pedidas**, mas valem nota para quem for ler este documento:
- O app funciona **offline-first** em várias áreas (registro de blend, listas de compras): a ação é salva localmente e sincronizada depois, nunca se perde.
- Vários valores de configuração/limite estão duplicados em mais de um arquivo (ex: constantes de limite de scan aparecem em dois lugares com o mesmo valor, mas só uma delas é realmente usada) — risco de divergência futura entre código "morto" e código ativo, mas sem impacto hoje.
