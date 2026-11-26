# Teste no build EAS (preview) de 25-26/11: nome, idioma, câmera, macros, Pulse AI e barra de abas

**Ponto de partida:** primeiro teste do Gabriel num build EAS (perfil `preview`). Oito achados, todos conferidos no código antes de corrigir:

1. Login com Apple criou a conta com o nome tirado do e-mail ("biel782003"): a Apple só manda o nome no primeiro login (às vezes nem nele) e o backend usava `resolveDisplayName` com o começo do e-mail. Não havia onde editar o nome.
2. O header da Home mostrava o nome completo e o texto passava por baixo do nível e do badge do plano (os dois eram `position: absolute` por cima do bloco de texto).
3. Contas Apple e Google nasciam com `locale: 'en'` fixo, mesmo com o celular em pt-BR (perfil em English, IA em inglês).
4. Pantry, câmera: os ícones usavam `colors.text.primary` do tema claro (Deep Plum, escuro) sobre a faixa preta — invisíveis.
5. Card de receita: chips só com ícone + número; não dava para saber qual era proteína, carboidrato ou gordura.
6. Pulse AI: o campo de digitar ficava muito acima da barra de abas com o teclado fechado. O `ChatInput` era absoluto e somava `BASE_TAB_BAR_HEIGHT` (88) + `insets.bottom`, mas a tela já termina acima da barra: o espaço era contado duas vezes.
7. Pedido: o Pantry abre a câmera na ultra-wide (0.5x) do iPhone 15 Pro; querem botões das lentes e pinça.
8. Barra de abas: o círculo do botão "Blend" cobria o texto "Blend".

**Decisões do Gabriel (25-26/11):** nome E sobrenome no cadastro e no perfil; Home com o primeiro nome; idioma do celular nos cadastros Apple/Google; ícones da câmera brancos; rótulo VISÍVEL nos números de macros (não balão); câmera abre em 1x, com botões das lentes e pinça.

**Sem mudança:** regras da IA, limites, dieta, alergias, álcool, Pantry (exceto a câmera) e receitas da Home.

## 1. Nome e sobrenome

### Modelo e regras (`packages/shared/src/utils/personName.ts`, `apps/api/src/utils/userName.utils.ts`)

- Campos novos no usuário: `firstName`, `lastName` (até 50 caracteres cada, `FIRST_NAME_MAX_LENGTH`/`LAST_NAME_MAX_LENGTH`) e `nameNeedsConfirmation` (`apps/api/src/models/User.ts`). Sem `required`: contas antigas não têm.
- Limpeza: a mesma do texto livre de uma linha (`sanitizeSingleLineText`, CP-B6): caracteres de controle/direção e marcação `<…>`, `<`, `>` viram espaço; espaços colapsados. Acento, apóstrofo e hífen ficam (`D'Ávila`, `Ana-Clara`). Isso também evita marcação no `{{name}}` do e-mail de boas-vindas.
- `name` continua existindo (e-mails, cards de compartilhamento, iniciais da foto) e é **sempre** `composeFullName(firstName, lastName)` — "Nome Sobrenome" ou só "Nome" —, montado pelo backend em toda escrita.
- **Contas existentes — estratégia sem migração (leitura tolerante):** quem não tem `firstName` é lido com `resolvePersonNameParts`: primeira palavra do `name` = nome, o resto = sobrenome. `nameNeedsConfirmation` ausente é deduzido por `looksLikeDerivedName`: `true` só se o `name` for igual ao começo do e-mail ou ao literal `Apple User`. Os campos passam a existir no documento na primeira edição de nome (ou num login Apple que traga o nome real). Nenhum dado é apagado ou reescrito em lote.
- Respostas com os quatro campos (`name`, `firstName`, `lastName`, `nameNeedsConfirmation`): `GET`/`PATCH /users/me`, `POST /auth/register`, `/auth/login`, `/auth/apple`, `/auth/google/exchange` e `POST /purchases/verify` (o app substitui o usuário local por esta última — sem os campos, a marca se perderia).

### Apple (`apple.controller.ts`, `useAppleAuth.ts`)

- O app manda `givenName`/`familyName` separados quando a Apple entrega o nome (e `fullName`, para um backend anterior). O schema limpa e **corta** no teto em vez de recusar: um nome longo da Apple nunca impede o login.
- Conta nova sem nome real: começo do e-mail como `firstName`, sobrenome real (se veio) mantido, `nameNeedsConfirmation: true`. `resolveDisplayName` saiu.
- Login de conta "a confirmar" em que a Apple manda o nome agora (ex.: a pessoa removeu o app do "Iniciar sessão com a Apple" e entrou de novo): grava o nome real. Nome já confirmado nunca é trocado. Vincular conta por e-mail (caso 2) não muda nada.

### Google (`google.service.ts`, `google.controller.ts`)

- Usa `given_name`/`family_name` do ID token; sem eles, divide o `name`.
- **Bug relacionado corrigido:** `getUserInfoFromToken` lançava erro se o perfil Google não tivesse `name` — o login inteiro falhava. Agora o nome é opcional e a conta nasce "a confirmar".

### Cadastro

- **Apple/Google:** quem tem `nameNeedsConfirmation` vê, no topo da primeira etapa do onboarding (`OnboardingModelScreen`), "Como podemos te chamar?" com Nome (obrigatório, vazio) e Sobrenome (opcional, já preenchido quando a Apple/Google mandou o sobrenome). O nome é salvo com `PATCH /users/me` ao tocar em Continuar (não depende do resto do onboarding); erro de rede aparece na tela e não avança. A etapa aparece mesmo se o usuário chegar depois do primeiro render (o login hidrata o perfil depois de abrir o onboarding).
  - Interpretação de "já preenchidos quando houver nome real": como a marca só existe quando não há nome real, o que pode vir preenchido é o **sobrenome** (a Apple pode mandar só o `familyName`). Contas que chegam com nome real não veem a etapa.
- **E-mail:** o campo "Nome completo" virou dois — Nome e Sobrenome (opcional) — no padrão da tela (mesmo `AuthInput`, validação ao sair do campo, `textContentType` de nome/sobrenome para o preenchimento automático). Fez sentido: a tela já validava campo a campo, e o backend passa a receber as duas partes sem adivinhar. O `registerSchema` aceita `firstName`/`lastName` e mantém `name` como legado (app antigo): sem `firstName`, o `name` é dividido; sem os dois, `400` no campo `firstName`.

### Perfil

- Linha nova "Nome" no topo do card de configurações do Me; mostra o nome completo ou "Confirmar" quando a conta está "a confirmar".
- Tela `ProfileNameScreen` no padrão de Alergias/Minhas metas: voltar no topo, "Salvar" fixo (desativado sem alteração), duplo toque barrado, toast, aviso ao sair sem salvar (`beforeRemove`). Conta "a confirmar" abre com o Nome vazio e o aviso "Confirme seu nome: só tínhamos o começo do seu e-mail." — é por aqui que contas antigas como a do teste corrigem o nome.
- `PATCH /users/me`: `firstName`/`lastName` com o mesmo schema (tipo errado recusado, limpeza, limites). `firstName` tira a marca; `lastName` sozinho mantém o nome atual e não tira a marca. O schema do PATCH continua `.partial()` sem `.strict()` no objeto inteiro (chaves desconhecidas são descartadas, como sempre); "estrito" aqui = os dois campos validados com rigor.
- O nome do Me (topo) passou a quebrar em no máximo 2 linhas.

### Logs

Nada de nome nos logs (teste dedicado em `user.name.test.ts`). Bug relacionado corrigido: os avisos de produção do `email.service.ts` ("Email provider not configured — … NOT sent to <e-mail>") imprimiam o e-mail do destinatário; agora não.

## 2. Home com o primeiro nome

- `HomeGreetingHeader` (novo, `components/home/`): "Bom dia, Gabriel." com `getDisplayFirstName` (`firstName`; sem ele, a primeira palavra do `name`).
- Layout em linha: o texto ocupa o espaço que sobra (`flex: 1`, `minWidth: 0`) e corta com reticências numa linha; nível e badge ficam ao lado com a largura deles (`flexShrink: 0`), sem posição absoluta. O nível ganhou rótulo de acessibilidade.
- **Outros lugares com o nome inteiro:**
  - Me (topo): nome completo, centralizado — agora em até 2 linhas. Mantido o nome completo (é o perfil).
  - Cards de compartilhamento (receita, conquista, semanal): já usam `numberOfLines={1}` — sem mudança.
  - Iniciais da foto de perfil: usam o nome completo — sem mudança.
  - Atenção: numa conta "a confirmar", os cards de compartilhamento mostram o começo do e-mail até a pessoa confirmar o nome.

## 3. Idioma do celular nos cadastros Apple e Google

- O app manda o idioma ativo (o mesmo `preferredLanguage` do cadastro por e-mail; no primeiro uso vem do aparelho: `pt-*` → `pt-BR`, qualquer outro → `en`) — `utils/preferredLanguage.utils.ts`.
- Apple: `preferredLanguage` no corpo de `POST /auth/apple`. Google: query de `GET /auth/google/url`, guardado no `state` assinado e lido no callback (que é um GET do navegador, sem corpo do app).
- Usado só na **criação** da conta. Login e vínculo de conta existente nunca mudam o `locale`. App antigo sem o campo: `en`, como antes. Valor fora da lista: `400`.
- Contas já criadas em `en` (como a do teste) continuam em `en`: trocar em Me → Idioma.
- Bug relacionado corrigido: o evento `sign_up` de um cadastro pela Apple saía como `method: 'google'`; agora sai `'apple'`.

## 4. Ícones da câmera

- `PantryScannerScreen` (passo `capture`): ícones (fechar, galeria, disparo, fechar a última prévia), texto das pílulas e o spinner usam `colors.text.inverse` (branco, igual nos dois temas). "Renova em…" passou de branco 55% para 80%, com sombra escura.
- Contraste no pior caso (cena toda branca atrás da faixa): ícones sobre a faixa de 45% ≈ 3,4:1 (o mínimo para ícones é 3:1); texto das pílulas (pílula 55% sobre a faixa) ≈ 10:1; "Renova em…" fica sobre a faixa só — por isso a sombra. Sobre uma cena comum (despensa, geladeira), bem acima disso.
- Botões de galeria e disparo ganharam rótulo de acessibilidade ("Escolher uma foto da galeria", "Tirar foto"); o espaçador espelhado ficou fora do leitor de tela.
- **Outras telas conferidas:** leitura da foto e geração (passos `reading`/`generating`) usam o fundo do tema com as cores do tema — ok. Cards de compartilhamento e `ShareFormatSheet` têm visual fixo próprio — ok. Bottom sheets usam o preto translúcido só no fundo atrás do sheet — ok.
- **Achado fora do escopo (não corrigido):** no passo de ingredientes do Pantry, a pílula de líquido selecionada usa texto Deep Plum sobre o roxo da marca (contraste ≈ 3:1, abaixo dos 4,5:1 para texto; branco daria ≈ 5,6:1). A regra do pedido é não mexer no Pantry fora da câmera.

## 5. Zoom da câmera

**Pendente de decisão — nada implementado, nenhuma biblioteca instalada.** Conferido no código nativo do `expo-camera` 17.0.10:

- **Por que abre em 0.5x no iPhone 15 Pro:** sem `selectedLens`, o iOS usa a câmera "preferida do sistema", que nos Pro é a câmera virtual tripla. Nela, `zoom = 0` (fator 1.0 do aparelho) é a ultra-wide. O 1x da câmera principal é o fator 2.0 dessa câmera virtual.
- O `zoom` do expo-camera vai de 0 a 1 e vira, no iOS, `fator = máximo^zoom` e, no Android, `fator = zoom × máximo` (mínimo 1). O **fator máximo não é exposto ao JS** em nenhuma das plataformas, nem os pontos de troca de lente. Sem ele não dá para pedir "1x", "2x" ou "3x" com exatidão, nem mostrar no botão o fator real da pinça.
- `selectedLens` / `getAvailableLensesAsync` (só iOS) trocam de lente pelo **nome localizado** da câmera (`localizedName`, ex.: "Back Camera" em inglês, outro texto em português). O tipo da lente e o fator da teleobjetiva (2x, 3x ou 5x, conforme o modelo) não vêm.
- Android: não há API de lentes; `zoom = 0` já é 1x (não existe 0.5x pelo expo-camera).

Caminhos possíveis (decisão do Gabriel):
1. Patch local no `expo-camera` (módulo nativo) para escolher a lente principal pelo tipo e expor fator mínimo/máximo/troca de lentes.
2. Biblioteca de câmera que já expõe isso (ex.: `react-native-vision-camera`: lentes físicas, `neutralZoom`, `minZoom`/`maxZoom`) — biblioteca nova + módulo nativo, exige novo build.
3. Só JS, aproximado: escolher a lente principal pelo nome (funciona com o aparelho em inglês; em outros idiomas depende de uma tabela de nomes), botões fixos 1x/2x/3x por zoom digital estimado e pinça relativa.

## 6. Rótulo visível nos números de macros

- Componente único `components/ui/MacroChips.tsx`: número em cima ("51 g" / "388"), nome embaixo ("Proteína", "Carbo", "Gordura", "kcal"; "Protein", "Carbs", "Fat", "kcal"). Álcool (quando > 0) com "Álcool"/"Alcohol". Os ícones saíram (a gota parecia "líquido"); as cores de fundo por macro continuam.
- Acessibilidade: cada chip é um elemento só, com a frase completa ("51 gramas de proteína", "388 quilocalorias", "14 gramas de álcool").
- Tela pequena: chips com largura mínima de 56 pt que crescem para ocupar a linha e **quebram de linha** (antes a linha do RecipeCard rolava na horizontal); o nome reduz a fonte até 85% antes de cortar. 4 chips cabem numa linha no iPhone SE (320 pt).
- Onde entrou: RecipeCard (Pulse AI e Pantry), prévia bloqueada, card da Home (mesmos números de antes: proteína, carboidrato, kcal — a frase `home.recipeMacros` saiu), favoritos, destaque do relatório semanal, cabeçalho da receita no Blend (Modo Passo a Passo não mostra macros) e histórico (variante compacta, sem fundo, número na cor do macro; o card deixou de ter altura fixa).
- Chaves que saíram por ficarem sem uso: `home.recipeMacros`, `pulseAi.alcoholUnit`.
- Bug relacionado corrigido: `utils/formatNumbers.ts` importava `toIntlLocale` de `hooks/useDateFormat.ts`, e com isso qualquer componente que formata número carregava a store de auth e a config da API. A função foi para `utils/intlLocale.ts` (pura) e continua reexportada pelo hook.
- O botão de fechar do cabeçalho da receita no Blend ganhou rótulo de acessibilidade.

## 7. Campo de digitar do Pulse AI

- `ChatInput` saiu da posição absoluta: fica no fluxo do layout, no fim da tela da Pulse AI — que já termina acima da barra de abas. Teclado fechado: respiro fixo (`spacing.md`), sem barra nem área segura somadas.
- Teclado aberto: o padding é a **sobreposição real** entre o teclado (`endCoordinates.screenY`) e o fim da tela, medida na janela (`measureInWindow` no `onLayout`) + respiro (`getChatInputBottomPadding`). Cobre os três casos sem constantes: iOS (teclado por cima), barra de abas que some com o teclado (`tabBarHideOnKeyboard: true` — a tela cresce e a medida acompanha) e Android que encolhe a janela (sobreposição zero).
- `ESTIMATED_CHAT_INPUT_HEIGHT` (172) saiu do `PulseAIScreen`: a lista termina onde o campo começa, então a última mensagem não fica escondida. Ao abrir o teclado, a lista rola até a última mensagem.
- Bug relacionado corrigido: o `UsageIndicator` (bolinhas de uso do plano grátis) ficava **atrás** do campo absoluto e não aparecia; agora aparece logo acima do campo, como dizia o comentário da tela.

## 8. Botão Blend da barra de abas

- Causa: o `@react-navigation/bottom-tabs` põe cada ícone numa caixa de 28 pt e centraliza o conteúdo; o círculo de 56 pt vazava 14 pt para baixo, sobre o rótulo.
- Agora (`navigation/tabBarMetrics.ts`): círculo de 52 pt; a caixa do ícone do Blend tem o tamanho do círculo mas ocupa no layout os mesmos 28 pt (margem negativa em cima) — o círculo sobe acima da barra e o rótulo fica no lugar dos outros, com 4 pt de respiro. Toque: o item inteiro (coluna ícone + rótulo) continua sendo o botão; rótulo de acessibilidade explícito por aba.
- A altura da barra passou a somar a área segura inferior (`58 + max(insets.bottom, 12)`): antes era 88 fixo, com os rótulos sobre o indicador de início nos iPhones com notch.

## Testes

- API: `user.name.test.ts` (novo: regras de texto, schema, PATCH, leitura tolerante, nada nos logs), casos novos em `apple.controller.test.ts` (nome, sobrenome, conta "a confirmar", idioma na criação, conta existente mantém idioma), `google.controller.test.ts` (idioma no `state`, criação pt-BR/en/ausente, conta existente, nome do token, perfil sem nome) e `auth.controller.weightLoss.test.ts` (cadastro com nome/sobrenome e legado).
- Mobile (novos): `MacroChips.test.tsx`, `HomeGreetingHeader.test.tsx`, `ChatInput.test.tsx`, `tabBarMetrics.test.ts`, `ProfileNameScreen.test.tsx`, `personName.utils.test.ts`, `preferredLanguage.utils.test.ts`; casos novos em `OnboardingModelScreen.test.tsx` e `useAppleAuth.test.tsx`.
- Expectativas existentes alteradas (todas por mudança pedida):
  - `RecipeCard.cpB5.test.tsx`: o chip de álcool mostra `common.macroChips.alcohol` e "16 g", não mais `pulseAi.alcoholUnit` e "16"; o teste de textos confere as chaves novas.
  - `LockedRecipeCard.test.tsx` e `PantryScannerScreen.lockedPreview.test.tsx`: os gramas aparecem como "12 g" (antes "12") e os nomes dos macros aparecem.
  - `dailyRecipeSelection.synthetic.test.tsx`: "sem macros" agora é a ausência do chip, não da frase `home.recipeMacros`.
  - `MeScreen.test.tsx`: o card de configurações tem 8 linhas (entrou "Nome" no topo).
  - `useAppleAuth.test.tsx`: `_setSession` recebe `'apple'` e o corpo leva `givenName`/`familyName`/`preferredLanguage`.
  - `auth.service.test.ts`: `getGoogleAuthUrl` manda também `preferredLanguage`.

## Conferir no aparelho (próximo build)

1. **Apple, conta nova** (apagar a conta de teste antes): com o celular em pt-BR, entrar com Apple escolhendo "Ocultar e-mail" → a primeira etapa pede Nome/Sobrenome; Continuar vazio mostra o erro; preencher e continuar → Home "Bom dia, <Nome>." e o perfil em Português.
2. **Conta antiga** (a "biel782003"): Me → linha "Nome" mostra "Confirmar" → corrigir → Home e Me atualizam. Sair sem salvar pede confirmação.
3. **Google, conta nova** com o celular em pt-BR → perfil em Português; com o celular em inglês → English. Entrar de novo numa conta existente não muda o idioma.
4. **Cadastro por e-mail**: campos Nome e Sobrenome (opcional); preenchimento automático do iOS sugere nome e sobrenome.
5. **Home**: com um nome bem longo (editar no perfil), a saudação corta com "…" sem encostar no nível nem no badge.
6. **Pantry, câmera**: fechar, galeria, disparo e pílula de scans brancos e visíveis; VoiceOver lê "Tirar foto".
7. **Macros**: cards da Pulse AI, Pantry, prévia bloqueada, Home, favoritos, Blend e histórico mostram "Proteína / Carbo / Gordura / kcal" embaixo dos números; no iPhone SE (ou tamanho de texto grande) os chips quebram de linha sem cortar.
8. **Pulse AI**: com o teclado fechado, o campo fica logo acima da barra de abas, sem vão; abrir o teclado → campo logo acima do teclado, última mensagem visível; fechar → volta. Conferir em iPhone com notch, sem notch e Android. No plano grátis, as bolinhas de uso aparecem acima do campo.
9. **Barra de abas**: o círculo do Blend fica acima da barra e o texto "Blend" aparece inteiro; rótulos das abas acima do indicador de início (iPhone com notch) e com respiro em aparelho sem notch.
10. **Zoom**: sem mudança neste build (ver seção 5).
