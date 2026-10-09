# Inventário Completo de Funcionalidades — BLENDi Pulse

**Data do levantamento:** 2026-10-08
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
    └── WeeklyReport (WeeklyReportScreen) — idem
```

### Lista de todas as telas e o que fazem (uma frase cada)

| Tela | Arquivo | Função |
|---|---|---|
| Login | `screens/auth/LoginScreen.tsx` | Login com e-mail/senha ou Google. |
| Register | `screens/auth/RegisterScreen.tsx` | Criação de conta (nome, e-mail, senha). |
| ForgotPassword | `screens/auth/ForgotPasswordScreen.tsx` | Pede e-mail para iniciar recuperação de senha. |
| VerifyOtp | `screens/auth/VerifyOtpScreen.tsx` | Confirma o código de 6 dígitos enviado por e-mail. |
| ResetPassword | `screens/auth/ResetPasswordScreen.tsx` | Define a nova senha após validar o OTP. |
| OnboardingModel | `screens/onboarding/OnboardingModelScreen.tsx` | Passo 1/4: escolhe o modelo físico de liquidificador (Lite/ProPlus/Steel). |
| OnboardingGoal | `screens/onboarding/OnboardingGoalScreen.tsx` | Passo 2/4: escolhe o objetivo (Muscle/Wellness/Energy/Recovery). |
| OnboardingBody | `screens/onboarding/OnboardingBodyScreen.tsx` | Passo 3/4: peso, altura, nível de atividade; calcula macros em tempo real. |
| OnboardingMacros | `screens/onboarding/OnboardingMacrosScreen.tsx` | Passo 4/4: confirma/ajusta as metas de proteína, carbo e caloria; finaliza o onboarding. |
| Home | `screens/HomeScreen.tsx` | Dashboard: saudação, nível, metas do dia, missões, atalhos, receita sugerida. |
| PulseAIChat | `screens/PulseAIScreen.tsx` | Chat com IA que gera receitas de shake/smoothie. |
| Favorites | `screens/FavoritesListScreen.tsx` | Lista de receitas favoritadas. |
| PantryScanner | `screens/PantryScannerScreen.tsx` | Scanner por câmera que reconhece ingredientes e sugere receitas. |
| ConversationHistory | `screens/ConversationHistoryScreen.tsx` | Histórico de conversas do Pulse AI por dia. |
| Blend | `screens/BlendScreen.tsx` | Timer de preparo do shake, com avaliação ao final. |
| TrackMain | `screens/TrackScreen.tsx` | Registro de água, stack de suplementos do dia, atalhos. |
| ManageStack | `screens/ManageStackScreen.tsx` | Adicionar/remover/ativar suplementos do stack pessoal. |
| History | `screens/HistoryScreen.tsx` | Histórico de 7/30/90 dias de nutrição, hidratação e suplementos. |
| ShoppingLists | `screens/ShoppingListsScreen.tsx` | Lista de listas de compras (ativas e arquivadas). |
| ShoppingListDetail | `screens/ShoppingListDetailScreen.tsx` | Itens de uma lista de compras específica. |
| Me | `screens/MeScreen.tsx` | Perfil: avatar, estatísticas, nível, badges, configurações, notificações, conta. |
| Upgrade | `screens/UpgradeScreen.tsx` | Tela de venda do plano Pulse Pro (paywall). |
| WeeklyReport | `screens/WeeklyReportScreen.tsx` | Relatório semanal (feature Pro) com paywall para quem não é Pro. |

**Telas que não aparecem na navegação principal:** nenhuma tela de erro/loading dedicada foi encontrada como rota separada — loading e erro são tratados *dentro* das telas acima (skeletons, banners de erro com retry), não como rotas próprias. Não há deep link documentado além do uso interno de `blendipulse://` para o callback do Google OAuth e para notificações push (`blendipulse://pulse-ai/chat`, `blendipulse://blend`, `blendipulse://track`, `blendipulse://me`, `blendipulse://me/weekly-report`).

---

## TAREFA 2 — Funcionalidades detalhadas por tela

### Autenticação

**LoginScreen** — campos e-mail/senha (toggle de visibilidade da senha); botão "Esqueci minha senha"; botão "Criar conta"; botão de login com Google. Erro 401 específico marca o campo de senha; outros erros aparecem como erro geral de formulário.

**RegisterScreen** — campos nome, e-mail, senha, confirmar senha; medidor de força de senha (Weak/Fair/Good/Strong, 4 critérios: 8+ caracteres, maiúscula, dígito, 12+ caracteres); senha exige minúscula+maiúscula+dígito, 8-72 caracteres. O registro já envia valores padrão fixos de modelo/objetivo/metas (`Lite`, `Wellness`, 120g proteína, 2000kcal) — o onboarding completo (4 telas) depois sobrescreve isso. Links para Termos de Uso e Política de Privacidade. Não tem botão de login social.

**ForgotPasswordScreen** — campo e-mail; sempre avança para a próxima tela mesmo se a chamada falhar (engolindo erro de rede de propósito, para não dar pista sobre e-mails inexistentes); loading mínimo artificial de 800ms antes de navegar (anti-enumeração por tempo de resposta).

**VerifyOtpScreen** — 6 caixas de código, com autofill do SMS/clipboard do sistema; auto-envia ao completar os 6 dígitos (sem botão); mostra e-mail mascarado (ex: `ga****@gmail.com`); reenviar código com contador de 60s; feedback de shake/borda vermelha em código inválido.

**ResetPasswordScreen** — campos nova senha + confirmar senha (mesmas regras de complexidade do registro); recebe o `resetToken` da tela anterior; ao suceder, roda uma animação de celebração (check com onda expansindo) e depois de 2,5s volta para o Login.

**Login social (Google)** — usa `expo-web-browser` (não usa SDK nativo do Google) para abrir um navegador in-app, autoriza no Google, e o backend redireciona de volta via deep link `blendipulse://auth/callback` com os tokens. Três casos no backend: conta já vinculada → login direto; e-mail já existente sem Google → vincula a conta; e-mail novo → cria conta com valores de onboarding padrão.

### Onboarding (4 telas, sem navegação manual entre elas — tudo guiado)

1. **Modelo** — Lite / ProPlus (120W) / Steel (180W), sem chamada de API.
2. **Objetivo** — Muscle / Wellness / Energy / Recovery, sem chamada de API.
3. **Corpo** — peso, altura (métrico ou imperial), nível de atividade (sedentário/levemente ativo/moderadamente ativo/muito ativo). **Não pergunta sexo nem idade.** Calcula macros em tempo real (debounce 600ms) chamando o backend; mostra IMC com classificação; tem botão "Pular por agora".
4. **Macros** — mostra/permite ajustar proteína (10-400g), calorias (500-10000kcal) e carboidratos (50-800g) calculados no passo anterior; ao finalizar, salva tudo e marca o onboarding como concluído — o app navega automaticamente para a tela principal.

A fórmula de cálculo (backend, `user.controller.ts`) usa Mifflin-St Jeor **com idade fixa em 30 anos e a constante "masculina" (+5) para todo mundo**, porque o app não coleta sexo nem idade em nenhum lugar. Multiplicadores de atividade e ajuste de calorias/proteína variam por objetivo escolhido.

### Início (Home)

- Saudação dinâmica por horário do dispositivo + data formatada.
- Indicador de nível (clicável, abre detalhe com barra de progresso animada) e badge Grátis/Pro.
- Atalhos rápidos: "Registrar água" (+250ml) e "Iniciar/Último Blend".
- Anéis de meta (proteína, carboidrato, caloria) + barra de progresso de hidratação do dia.
- Badge de streak (3 estágios visuais: fraco, normal, "lendário" com giro contínuo a partir de 30 dias).
- Até 3 missões diárias com progresso e recompensa de XP.
- Carrossel de "protocolos rápidos" (4 prompts prontos: treino, mães ativas, coquetel de praia, viagem) que abrem o Pulse AI já com o texto preenchido.
- Card de receita sugerida do dia, por objetivo do usuário (receitas fixas no código, não geradas por IA).
- Pull-to-refresh recarrega perfil, blends de hoje e hidratação de hoje em paralelo.

### Pulse AI (chat)

- Campo de texto livre (limite de 500 caracteres) sempre devolve **uma receita estruturada** (não é um chat genérico de texto livre — é 100% orientado à geração de receita).
- Sugestões prontas: 3 chips de boas-vindas + placeholders rotativos no input, ambos variando por objetivo do usuário.
- "Protocolo pendente": outra tela pode pré-preencher e auto-enviar uma mensagem ao abrir o chat (usado pelos atalhos da Home).
- Indicador visual de uso restante (quantas mensagens grátis sobraram hoje).
- Indicador "veio do cache" (ícone de raio) quando a resposta não precisou chamar a IA de novo.
- Banner "Visualizando uma conversa anterior" quando o usuário abre uma conversa do histórico, com botão para iniciar uma nova.

### Favoritos

- Lista de receitas favoritadas (coração animado para favoritar/desfavoritar direto no card da receita, com atualização otimista).
- Swipe para remover na lista de favoritos.

### Pantry Scanner (scanner de despensa)

- Fluxo de 5 passos: permissão de câmera → captura (ou escolha da galeria) → análise → confirmação de ingredientes → receitas.
- Reconhece até 2 receitas por scan, usando só os ingredientes confirmados pelo usuário.
- Indicador de "scans restantes no mês" (plano grátis).
- Usuário pode marcar/desmarcar ingredientes identificados e adicionar ingredientes manualmente antes de gerar as receitas.

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

### Acompanhar (Track)

- Registro rápido de água (+250ml) com atualização otimista.
- Progresso de hidratação do dia + mini-gráfico dos últimos 7 dias.
- Stack de suplementos ativos do dia: toque para somar 1 dose tomada, toque longo para subtrair; indicador visual quando todas as doses do dia foram batidas.
- Badge de itens pendentes nas listas de compras no cabeçalho.
- Atalhos para Histórico, Gerenciar Stack e Listas de Compras.

### Gerenciar Stack (suplementos)

- Lista de suplementos (ativos e inativos) com nome, dosagem, meta diária de doses e horário preferido (manhã/pré-treino/pós-treino/noite/com refeição).
- Adicionar novo suplemento via formulário (nome, dosagem opcional, meta diária de 1-20 doses, horário).
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
- Bloco de configurações (ver Tarefa 3), bloco de notificações (ver Tarefa 3), sair da conta, links de Termos e Privacidade.

### Upgrade (paywall) e Relatório Semanal

Detalhados nas Tarefas 6 e 7.

---

## TAREFA 3 — Configurações e personalização

### Metas nutricionais e hidratação

Editadas num bottom sheet único e genérico (`EditSettingSheet`) a partir da tela de Perfil:

| Configuração | Limite validado no backend |
|---|---|
| Meta de proteína (g/dia) | 10–400 |
| Meta de carboidrato (g/dia) | 50–800 |
| Meta de calorias (kcal/dia) | 500–10.000 |
| Meta de hidratação (ml) | 500–8.000 |
| Modelo BLENDi (Lite/ProPlus/Steel) | enum fixo |
| Objetivo (Muscle/Wellness/Energy/Recovery) | enum fixo |

O app **não valida esses limites antes de enviar** — só mostra erro depois que o backend rejeita. Não existe campo de meta de gordura na UI (existe só internamente, no cálculo do onboarding).

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
- **Contexto do usuário usado para personalizar:** modelo do liquidificador, objetivo, idioma, sistema de unidades, metas diárias de proteína/carboidrato/caloria, as últimas 5 receitas feitas no blender (para não repetir) e o histórico de conversa do próprio dia (até 6 trocas). **Suplementos cadastrados, streak, missões e hidratação NÃO são usados para personalizar a resposta** — o streak/XP só são atualizados *depois* como efeito colateral, nunca lidos pela IA.
- **Receitas completas, não só sugestões:** toda resposta vem em formato estruturado fixo com título, ingredientes com quantidade, macros calculadas (proteína/carbo/gordura/calorias), tempo de preparo e instrução de preparo. Há 3 camadas de validação automática no backend (formato, limite físico de proteína do liquidificador, e consistência das macros), que tentam corrigir a receita antes de entregá-la ao usuário.
- **Limite por plano:** usuário grátis tem **3 mensagens por dia** no chat (reseta à meia-noite local); usuário Pro é ilimitado.
- **Pantry Scanner:** reconhece ingredientes de despensa/geladeira por foto (usando um modelo de visão de IA) e gera exatamente 2 receitas com os ingredientes confirmados. Usuário grátis tem **3 scans por mês**; Pro é ilimitado. Um scan só é "gasto" se a foto realmente tiver ingredientes utilizáveis reconhecidos com confiança.
- **Cache de respostas:** existe um cache de 7 dias no banco de dados, por usuário + contexto completo (modelo, objetivo, idioma, texto exato da pergunta) — mesma pergunta de outro usuário, ou com outro objetivo/modelo, não aproveita o cache. Importante: **um "cache hit" ainda consome 1 das 3 mensagens grátis do dia**, só evita chamar a IA de novo.
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

**Achado crítico: o serviço de e-mail está marcado no próprio código como um "stub de desenvolvimento" — hoje o sistema NÃO envia e-mails reais de produção**, apenas registra no log do servidor. Isso afeta diretamente:
- E-mail de boas-vindas (disparado no registro e no primeiro login via Google) — hoje só loga, não chega na caixa de entrada do usuário.
- E-mail de redefinição de senha (com o código OTP) — mesma situação: o código existe e é validado normalmente no fluxo, mas a entrega real por e-mail depende desse serviço, que está em modo "stub".
- Existe um terceiro método (e-mail de verificação de conta) implementado, mas **nunca chamado por nenhuma tela ou rota** — código morto.
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
- Envio real de e-mails em produção hoje (serviço está em modo "stub de desenvolvimento").
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
