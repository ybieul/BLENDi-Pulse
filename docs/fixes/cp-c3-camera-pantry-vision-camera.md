# CP-C3 — Câmera do Pantry com react-native-vision-camera (1x, lentes, pinça suave, tocar para focar)

**Ponto de partida:** no teste do build EAS (25-26/11) a câmera do Pantry abriu na ultra-wide (0.5x) do iPhone 15 Pro. Causa, conferida no código nativo do vision-camera: no iOS o zoom é o fator bruto do AVFoundation; no dispositivo virtual "Triple Camera", zoom 1.0 **é** a ultra-wide e a lente principal fica no `neutralZoom` (2.0). O expo-camera não expõe nada disso.

**Decisões do Gabriel (26/11):** trocar expo-camera por react-native-vision-camera; abrir em 1x; botões só das lentes que existirem; pinça suave com Reanimated na thread de UI; tocar para focar; Expo Go sem câmera (galeria continua).

**Sem mudança:** regras da IA, limites, dieta, alergias, álcool, o fluxo do Pantry depois da foto (`handleAnalyze`, compressão, base64, leitura, limites, prévia bloqueada) e as outras telas.

## 0. Versões e compatibilidade

| Pacote | Versão | Por quê / fonte |
|---|---|---|
| `react-native-vision-camera` | **4.7.3** (fixa) | O v5 (latest, 5.2.5) exige `react-native-nitro-modules` + `react-native-nitro-image`, fora da lista permitida. O v4.7.2 traz "Fix build for RN 0.81 (#3583)" no changelog do GitHub; o 4.7.3 (12/11/2025) só tem correções. Funciona na nova arquitetura pela camada de interop (módulo nativo legado). Versão fixa para nunca subir sozinha para o v5. |
| `react-native-reanimated` | `~4.1.1` (resolvida 4.1.7) | Versão do `expo/bundledNativeModules.json` do SDK 54 (o que o `npx expo install` escolheu). O Reanimated 4 exige a nova arquitetura (já ativa). |
| `react-native-worklets` | `0.5.1` | Dependência obrigatória do Reanimated 4, versão do SDK 54. |
| `expo-camera` | removido | Nada mais usa (lockfile limpo). |

- **Babel:** sem mudança. O `babel-preset-expo` 54 já adiciona `react-native-worklets/plugin` sozinho quando o pacote está instalado (conferido no código do preset).
- **Frame processors:** desligados de duas formas: `react-native-worklets-core` não está instalado (o v4 desliga sozinho) e `enableFrameProcessors: false` no plugin. O prebuild local confirmou `$VCEnableFrameProcessors=false` no `Podfile` e `VisionCamera_enableFrameProcessors=false` no `gradle.properties`.
- **Expo Go:** o JS 4.1.7 do Reanimated convive com o nativo 4.1.x do Expo Go: a checagem de versão compara só major.minor.
- O passo automático de config plugin do `npx expo install` falhou (erro de resolução dentro do próprio expo cli). Os pacotes instalaram normalmente e o plugin foi escrito à mão no `app.json`.

## 1. Configuração (`apps/mobile/app.json`, `package.json`)

- Plugin `react-native-vision-camera`: `cameraPermissionText` com o mesmo texto de hoje, `enableMicrophonePermission: false`, `enableLocation: false`, `enableFrameProcessors: false`, `enableCodeScanner: false`.
- `expo prebuild --no-install` rodado só para conferência: o `NSCameraUsageDescription` saiu com o texto atual, a nova arquitetura e o Hermes ficaram mantidos. As pastas `ios/` e `android/` estão no `.gitignore` e foram apagadas depois.
- Outras telas: nenhuma usava `react-native-gesture-handler` nem Reanimated (só o `Animated` do RN, que não muda). A suíte inteira do mobile passa.

## 2. Câmera, permissão e lentes

### Arquivos novos
- `components/pantryScanner/visionCamera.loader.ts`: carrega o vision-camera sob demanda. **O pacote lança um erro já no import quando o módulo nativo não existe** (Expo Go). Um import estático derrubaria a tela, ou o app inteiro se a navegação importar a tela de cara. O `require` fica num try/catch e devolve `null`.
- `utils/cameraZoom.utils.ts`: funções puras (dispositivo, lentes, limites, pinça).
- `components/pantryScanner/PantryCamera.tsx`: prévia, gestos, botões de lente, foco e aviso de indisponível. A tela continua dona do overlay (barras e botões), passado por `renderOverlay`.

### Permissão (`PantryScannerScreen.tsx`)
- `Camera.getCameraPermissionStatus()` (síncrono) e `Camera.requestCameraPermission()`. O fluxo e os textos são os de hoje: botão "Ativar câmera" → negada mostra `permissionDenied`.
- A etapa inicial é calculada na montagem, sem efeito. Quem já deu permissão cai direto na câmera, sem piscar a tela de permissão.
- Erro no pedido de permissão (antes ficava sem tratamento) conta como negada.

### Dispositivo e 1x
- `selectBackCameraDevice`: dispositivo traseiro **com a lente principal** e o maior número de lentes físicas (o virtual multi-lente quando existe). Assim há zoom contínuo entre as lentes. Nunca escolhe a ultra-wide sozinha.
- Abre em `neutralZoom`: 2.0 no iPhone com ultra-wide, 1.0 no Android (onde o vision-camera fixa o neutro em 1).
- A lista de dispositivos é assinada (`addCameraDevicesChangedListener`): no Android ela pode chegar vazia na abertura.

### Botões de lente (`computeLensStops`)
- **0.5x:** existe quando `minZoom < neutralZoom` (só uma lente mais aberta permite isso). O rótulo é `minZoom / neutralZoom`, arredondado a 1 casa: 0.5 no iPhone, 0.6/0.7 em Androids com ultra-wide na câmera lógica.
- **1x:** sempre que houver outro botão.
- **Tele (2x, 3x, 5x…):** o v4 **não expõe os pontos de troca de lente** na API JS. O fator é calculado pelo campo de visão das lentes físicas listadas (`tan(FOV principal/2) / tan(FOV tele/2)`) e arredondado para 0,5, como o app de câmera. Exemplos: 3.2 → 3x no 15 Pro, 5x no 15 Pro Max. O zoom do botão é `neutralZoom × fator` (6.0 no 15 Pro, que é o ponto de troca da Apple). Só aparece se o dispositivo escolhido inclui a tele e o fator cabe no limite.
- 1 lente: sem botões. Botão ativo com fundo mais escuro, borda e texto em negrito. Tudo branco (CP-C1), 44×44 pt, `accessibilityLabel` "Zoom 3x" / "Zoom de 3x" e `accessibilityState.selected`. O número segue o idioma (0,5 em pt-BR).
- Tocar num botão anima o zoom (`withTiming`, 220 ms) até o fator.

### Limite do zoom — **valor escolhido: 10x do 1x** (ou o máximo do aparelho, se menor)
O prompt sugere "o maior fator óptico ou ~10x, o que for menor". Lido ao pé da letra, um celular de uma lente ficaria com máximo 1x, sem zoom de pinça nenhum, e o 15 Pro pararia em 3x. Usei 10x fixo, que é bom para a despensa e evita foto ruim de zoom digital alto. Se preferir parar na tele, é a constante `MAX_VISIBLE_ZOOM_FACTOR` em `cameraZoom.utils.ts`.

## 3. Pinça suave (Reanimated)

- `Gesture.Pinch` com `onStart`/`onUpdate` em worklet. O zoom é um shared value e vai ao `<Camera>` por `useAnimatedProps` num `Animated.createAnimatedComponent(Camera)` (o padrão documentado pelo v4; no Reanimated 4 o `addWhitelistedNativeProps` virou no-op e não é preciso).
- A pinça continua de onde o zoom estava, multiplicando pela escala (`pinchZoom`), e para uma animação de botão em andamento. Respeita `minZoom` e o limite de 10x.
- **Sem setState por quadro.** O JS só é chamado:
  - por `useAnimatedReaction` + `runOnJS` quando o **botão ativo muda** (cruzou um fator);
  - uma vez por toque de foco.
- **Medição:** o teste conta os renders do `<Camera>` falso. Uma pinça completa (BEGAN → 3 × ACTIVE → END) dá **zero renders**, e depois de um re-render forçado o zoom aparece com o valor certo e preso no limite. O caminho UI-thread de verdade só pode ser confirmado no aparelho (ver checklist).
- Gestos num `GestureHandlerRootView` **local** à câmera. O app não tinha um na raiz, e sem ele o `GestureDetector` falha. Embrulhar o app inteiro seria mudança global.

## 4. Tocar para focar

- `Gesture.Tap` (até 250 ms) junto da pinça em `Gesture.Race`: dois dedos viram pinça, um toque curto foca, e um não bloqueia o outro.
- Chama `camera.focus({ x, y })` em coordenadas da prévia. Um anel branco (72 pt) aparece no ponto e some sozinho (Reanimated). Recusa do aparelho: `.catch` silencioso.
- `device.supportsFocus === false`: nem anel, nem chamada.
- Os botões não disparam foco: o overlay usa `pointerEvents="box-none"` nas áreas vazias (o toque passa para a prévia), e os botões e barras recebem o toque normalmente. A prévia não é ancestral deles, então o gesto dela nunca dispara.
- Acessibilidade: foco e pinça são extras. Lentes, disparo e galeria são botões comuns.

## 5. Foto no mesmo caminho

- `handleCapture` → `PantryCamera.takePhoto()` → `camera.takePhoto({ flash: 'off' })` → `file://` + `path` (o `Image.getSize` e o image-manipulator esperam URI) → **o mesmo `handleAnalyze`**. O som do obturador fica no padrão do sistema.
- `outputOrientation="preview"`: a foto sai em retrato como a prévia (o app é só retrato), igual ao expo-camera.
- Tamanho enviado: sem mudança. A compressão redimensiona para no máximo 1024 px e reencoda JPEG 0,7, seja qual for a resolução da câmera.
- `isActive` = tela com foco **e** app fora do fundo. O foco vem dos eventos `focus`/`blur` da navegação: outra aba, ou o Upgrade por cima, pausa a câmera.
- Expo Go / sem câmera traseira / erro fatal (ex.: câmera em uso por outro app): aviso na área da câmera ("Câmera disponível no app instalado. Use a galeria." / "Não foi possível abrir a câmera. Use a galeria."), com a galeria funcionando e sem crash. No Expo Go a tela vai direto à captura, sem pedir permissão de uma câmera que não existe.
- Logs: nenhum. Os erros da câmera não são impressos (podem trazer detalhes do aparelho), e foto e caminho nunca são logados.

## 6. Testes

### Mocks
- `jest.setup.js` (novo, em `setupFiles`): setup oficial do gesture-handler (`react-native-gesture-handler/jestSetup`) e mock oficial do Reanimated (`react-native-reanimated/mock`). O único ajuste: `useSharedValue` estável entre renders, como no real (no mock ele recria a cada render e perderia o zoom). Vale para testes futuros com gestos/animações.
- `src/testUtils/visionCameraMock.tsx` (novo): `Camera` falso (APIs estáticas, `takePhoto`, `focus`, contagem de renders) e aparelhos prontos (1 lente, 2 lentes, iPhone Pro com 3).

### Os 3 testes existentes do Pantry — nenhuma expectativa alterada
Em `PantryScannerScreen.test.tsx`, `.cpB6.test.tsx` e `.lockedPreview.test.tsx` mudaram só os mocks:
1. `jest.mock('expo-camera', …)` → `jest.mock('react-native-vision-camera', …)` com o helper (aparelho de 1 lente, então sem botões de lente e com a mesma ordem de botões de antes; esses testes acham a galeria por índice).
2. O mock de `navigation` ganhou `isFocused: () => true` e `addListener: () => () => undefined`.

Todas as asserções continuam iguais: 48/48 passam.

### Novos (48 testes)
- `utils/cameraZoom.utils.test.ts` (19): escolha do dispositivo; limites (10x, máximo do aparelho, valores inválidos sem NaN); lentes com 1, 2 e 3 lentes, Android 0.6x, tele sem lente medível e tele além do limite; fator da tele (5x); pinça nos limites e com escala inválida; botão ativo.
- `components/pantryScanner/PantryCamera.test.tsx` (20): abre em `neutralZoom`; botões para 1/2/3 lentes; tocar no botão muda o zoom e o destaque; `isActive`; foto sem vídeo/áudio/frame processor e com orientação da prévia; pinça com zero renders, máximo, mínimo e continuando do botão; foco no ponto tocado, não nos botões, aparelho sem foco, foco recusado; `file://`; Expo Go; sem câmera; erro fatal e não fatal.
- `components/pantryScanner/visionCamera.loader.test.ts` (2): import que lança vira `null`.
- `screens/PantryScannerScreen.camera.test.tsx` (7): captura → mesmo `compressAndEncodeImage`/`readPantryPhoto` com `file:///…`; disparo duplo = uma foto; falha na captura = mesmo toast; permissão negada e concedida; pausa sem foco e no fundo; Expo Go com aviso e galeria.

### Resultado
| Verificação | Resultado |
|---|---|
| Typecheck `apps/mobile`, `apps/api`, `packages/shared` | limpos |
| Lint (`pnpm lint` na raiz) | limpo |
| Suíte do mobile | 71 suítes, **1108/1108** |
| Suíte da API | 226 suítes, **1617/1617** |

Os avisos de `act()` que aparecem nos testes do Pantry já existiam (8/3/42 hoje contra 10/3/42 com a abertura antiga, medido trocando só a etapa inicial).

## 7. Problemas relacionados

### Corrigidos neste CP (ligados à câmera nova)
1. **Crash no Expo Go no import** do vision-camera → loader preguiçoso.
2. **Sem `GestureHandlerRootView`** no app → root local na câmera.
3. **Câmera ligada em segundo plano:** ao trocar de aba ou abrir o Upgrade, a tela continua montada e o expo-camera seguia ligado (bateria, indicador verde do iOS) → `isActive` com foco e AppState.
4. **Duas fotos com toque duplo** no disparo (iam para duas leituras) → trava de captura.
5. **Tela de permissão piscando** ao abrir com permissão já dada → etapa inicial síncrona.
6. **Pedido de permissão sem tratamento de erro** → conta como negada.
7. **Lista de câmeras vazia na abertura (Android)** → assinatura da lista.
8. **Câmera em uso por outro app / erro fatal** → aviso e galeria, sem tela preta muda.

### Pendentes — precisam de decisão (não mexi: fora do escopo ou em outras telas)
1. **Permissão negada é um beco sem saída:** só mostra o texto, sem galeria (que não precisa da câmera) e sem "Abrir Ajustes" (`Linking.openSettings()`). No iOS, depois de negar, o pedido não aparece de novo. O prompt pediu manter o fluxo; sugiro um CP curto.
2. **Microfone no build sem uso:** o plugin do **expo-image-picker** (aplicado automaticamente pelo Expo) põe `NSMicrophoneUsageDescription` com texto genérico em inglês e `RECORD_AUDIO`. Já acontecia antes; não vem do vision-camera. O app só escolhe imagens (Pantry e foto de perfil). Proposta: `["expo-image-picker", { "microphonePermission": false }]` no `app.json`, o que remove e bloqueia as duas. Evita pergunta na revisão da App Store/Play.
3. **Orientação EXIF no Android:** o vision-camera grava a foto com a orientação no EXIF, e a compressão usa `Image.getSize` + resize com largura **e** altura. É o mesmo formato das fotos da galeria (que já funcionam), então não espero problema. Se a foto chegar deitada ou achatada no Android, a correção é redimensionar só pelo lado maior em `getResizeDimensions`.
4. **Fotos temporárias não apagadas** (3-5 MB cada, na pasta tmp que o sistema limpa). Dá para apagar depois da compressão com o `expo-file-system`.
5. **Testes acham a galeria por índice** (`getAllByRole('button')[1]`): qualquer botão novo antes dela quebra os 3 testes. Trocar por `getByLabelText('pantryScanner.galleryA11yLabel')`.
6. **Androids que expõem cada lente como câmera separada** (comum em Samsung): só o 1x aparece (trocar de câmera reinicia a sessão, não é contínuo). A pinça funciona como zoom digital. Dá para evoluir para troca de câmera no botão.
7. **2x do iPhone 15 Pro** (recorte do sensor de 48 MP): não aparece, porque não é lente física. Se quiser igual ao app da Apple, é um botão a mais no 1x × 2.
8. `app.json`/`eas.json` **da raiz** aparecem apagados no working tree (não fui eu; não mexi). Eram um stub com outro bundle id (`com.blendiblender.blendipulse`); o EAS usa os de `apps/mobile`.

### Riscos que só o aparelho confirma
- **Zoom por animated props num componente nativo legado na nova arquitetura:** é o padrão documentado do v4, mas o caminho Reanimated 4 → interop só é verificável no aparelho. Se a pinça não mexer o zoom, o plano B é o JS atualizar o zoom só nos cruzamentos e soltar o gesto.
- **Fator da tele por FOV:** aproximado e arredondado para 0,5. Se o rótulo ficar errado em algum iPhone, me diga o modelo.

## 8. Conferir no próximo build EAS

**iPhone Pro (3 lentes):**
1. Abrir o Pantry: a imagem abre em **1x** (lente principal, não a "olho de peixe").
2. Botões **0,5x · 1x · 3x** (5x no Pro Max), 1x destacado.
3. Tocar em 0,5x e 3x: o zoom anima e o destaque muda.
4. Pinça devagar e rápido: acompanha o dedo sem travar. Para no 0,5x e perto de 10x. Ao passar de 1x para 3x o destaque troca sozinho.
5. Tocar num ponto: o anel aparece e some, e a imagem foca ali. Tocar em fechar, galeria, disparo ou lentes **não** mostra o anel.
6. Tirar foto: a leitura acontece como antes, foto em pé.
7. Trocar de aba com a câmera aberta e voltar: o indicador verde do iOS apaga e a câmera volta. Mesmo teste mandando o app para o fundo.

**Celular com menos lentes (ex.: iPhone sem tele ou Android):**
8. Botões só das lentes que existem (0,5x · 1x, ou nenhum com uma lente só). Abre em 1x. Pinça e foco funcionando.
9. **Android:** tirar foto em pé e conferir que a leitura não sai deitada nem achatada (item 3 dos pendentes).

**Permissão:** num aparelho sem a permissão dada, o pedido aparece; negar mostra o texto de hoje.

**CP-C3a: lente 1x garantida (iPhone e Android):**
10. Com zoom em **1.3x**, tampe só a lente ultra-wide com o dedo: a imagem continua normal. Com zoom em **0.7x**, tampe a lente 1x: a imagem continua normal.
11. Mesmo teste aproximando o celular de um objeto (~10 cm) em **1.3x**: tampar a ultra-wide não muda a imagem. No iPhone, nessa distância a imagem pode ficar desfocada. Isso é esperado (a troca automática para a macro da ultra-wide está desligada); afaste até focar.
12. **Android:** se no passo 10 tampar a ultra-wide escurecer a imagem em 1.3x, anote o modelo. É o risco residual do Android (ver `cp-c3a-camera-lente-1x-permissao-ajustes.md`, seção 2).

**CP-C3a: permissão negada → Abrir Ajustes → voltar:**
13. Negar a câmera: aparecem o texto de hoje, **Abrir Ajustes** e **Escolher da galeria**.
14. **Escolher da galeria** lê a foto normalmente. Se a leitura voltar (ex.: "nenhum alimento"), volta a tela de permissão, não uma câmera preta.
15. **Abrir Ajustes** abre os ajustes do app. Dar a permissão e voltar ao app: a câmera abre sem sair da tela. No iPhone o sistema costuma reiniciar o app quando a permissão muda: nesse caso, abrir o Pantry de novo já mostra a câmera, sem a tela de permissão.
16. Voltar dos Ajustes **sem** dar a permissão: continua na tela de permissão negada.
