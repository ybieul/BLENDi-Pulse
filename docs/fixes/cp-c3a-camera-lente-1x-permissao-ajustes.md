# CP-C3a: Câmera do Pantry (lente 1x garantida, permissão negada com saída, microfone, fotos temporárias, testes)

**Ponto de partida:** CP-C3 (commit `914addc`). Regra do Gabriel (26/11): acima de 1x a imagem nunca vem da ultra-wide recortada, em qualquer aparelho. Opção A: manter a câmera multi-lente (pinça contínua), mas a lente só troca pelo zoom.

**Sem mudança:** regras da IA, limites, dieta, alergias, álcool, fluxo do Pantry depois da foto (`handleAnalyze`, compressão, base64, leitura, limites, prévia bloqueada) e outras telas. Versões do vision-camera (4.7.3) e do Reanimated (4.1.7) iguais. Nenhuma biblioteca nova. `eas.json` intocado. Nada commitado.

## 1. iPhone: lente troca só pelo zoom (patch nativo)

### Desvio do prompt, aprovado pelo Gabriel (26/11): `.restricted` com `[]`, não com `[.videoZoomChanged]`
A documentação da Apple diz o contrário do que o prompt esperava de `[.videoZoomChanged]`:

- `videoZoomChanged`: *"This condition switches cameras when the video zoom factor changes… **All changes to video zoom factor allow switching to a fallback camera, not only those changes across switch-over zoom factors.**"* Na pinça, cada quadro muda o zoom, então cada quadro liberaria a troca para a lente de reserva (a ultra-wide, quando o objeto está mais perto que o foco mínimo da 1x). É justamente o caso dos 1.3x.
- `.restricted`: *"The device restricts fallback camera selection to certain conditions."* e *"The camera doesn't restrict camera switches necessary to honor the requested video zoom factor."*
- A opção sem condições é descrita como *"Disallow switching to a fallback camera."*

Ou seja, `.restricted` + `[]` faz o que a regra pede: a lente troca só quando o zoom cruza os pontos de troca (0.5x↔1x↔3x) e nunca por distância, foco, exposição ou pouca luz.

**Efeito colateral (esperado):** perto demais em 1x, a imagem fica desfocada em vez de ir para a macro da ultra-wide. Em 3x com pouca luz, ela fica mais escura em vez de cair para a 1x. Basta afastar o celular. Está no checklist do aparelho.

Fontes (doc JSON da Apple): `avcapturedevice/setprimaryconstituentdeviceswitchingbehavior(_:restrictedswitchingbehaviorconditions:)`, `primaryconstituentdeviceswitchingbehavior-swift.enum` (casos `auto`, `restricted`, `locked`, `unsupported`), `primaryconstituentdevicerestrictedswitchingbehaviorconditions-swift.struct/videozoomchanged`, `activeprimaryconstituent`. Assinatura: `setPrimaryConstituentDeviceSwitchingBehavior(_:restrictedSwitchingBehaviorConditions:)`, iOS 15.0+. A doc manda checar `activePrimaryConstituentDeviceSwitchingBehavior != .unsupported` antes de chamar.

### O patch (`patches/react-native-vision-camera@4.7.3.patch`)
Registrado por `pnpm patch` / `pnpm patch-commit` em `pnpm.patchedDependencies` no `package.json` da raiz. Só iOS e sem mudança na API JS.

```diff
--- a/ios/Core/CameraSession.swift
+++ b/ios/Core/CameraSession.swift
@@ -169,6 +169,10 @@
           if difference.formatChanged {
             try self.configureFormat(configuration: config, device: device)
           }
+          // 5b. [BLENDi patch] Lens switching only by zoom (see configureLensSwitching).
+          if difference.inputChanged || difference.formatChanged {
+            self.configureLensSwitching(device: device)
+          }
--- a/ios/Core/CameraSession+Configuration.swift
+++ b/ios/Core/CameraSession+Configuration.swift
@@ -322,6 +322,28 @@
+  // pragma MARK: Lens switching [BLENDi patch]
+  /** …comentário: .restricted sem condições desliga a troca de reserva
+     (foco mínimo/macro, foco, exposição, pouca luz)… */
+  func configureLensSwitching(device: AVCaptureDevice) {
+    guard #available(iOS 15.0, *) else { return }
+    guard device.isVirtualDevice,
+          device.constituentDevices.count > 1,
+          device.activePrimaryConstituentDeviceSwitchingBehavior != .unsupported else { return }
+    device.setPrimaryConstituentDeviceSwitchingBehavior(.restricted, restrictedSwitchingBehaviorConditions: [])
+  }
```

- Roda **dentro** do `lockForConfiguration` que a biblioteca já usa (passo 5, bloco de configuração do dispositivo). `inputChanged` sempre marca esse bloco como sujo, então a regra vale sempre que a câmera abre ou troca de dispositivo. Também é reaplicada quando o formato muda: a doc não diz se uma troca de formato desfaz a configuração, e reaplicar não custa nada.
- O pod declara iOS 12.4, por isso o `#available(iOS 15.0, *)`. O Expo SDK 54 já exige 15.1.
- **Problema do `pnpm patch` 9.0.0:** o patch gerado trazia dois `deleted file: README.md` falsos (a cópia de edição do pnpm não inclui os READMEs). Tirei essas duas partes do arquivo e reinstalei. O patch final tem só as 2 mudanças em Swift, e os READMEs continuam no pacote instalado.

### Instalação limpa e EAS
| Verificação | Resultado |
|---|---|
| Cópia limpa do repo (sem `node_modules`), `pnpm@9.0.0 install --frozen-lockfile` | ok, patch aplicado, lockfile sem mudança |
| Mesma cópia, `pnpm@10.14.0` (a versão da imagem do EAS para o SDK 54), comportamento padrão | ok: o pnpm 10 troca sozinho para o 9.0.0 do `packageManager`, patch aplicado, lockfile sem mudança |
| Mesma cópia, `pnpm@10.14.0` **forçado** (`manage-package-manager-versions=false`) | **falha**: `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH` (o pnpm 10 calcula o hash do patch de outro jeito) |

Fontes Expo/EAS:
- *Caching* (docs.expo.dev/build-reference/caching): *"By default, Node packages will be installed with your preferred package manager's immutable lockfile flag/command"*.
- *Project upload* (docs.expo.dev/build-reference/project-upload): *"EAS CLI creates a shallow Git clone of your repository. Then it copies your working directory into the clone… except the files that your ignore files exclude"* e *"Expo Build installs your dependencies on the build server."* A pasta `patches/` não está em nenhum `.gitignore` e não há `.easignore`.
- *Infrastructure*: imagem do SDK 54 com pnpm 10.14.0.
- pnpm (pnpm.io/cli/patch-commit): *"After recording the patch, pnpm runs an install to apply it."*; pnpm.io/cli/patch: *"A patch that fails to apply fails the install."*

**A doc do Expo não fala de patches do pnpm.** A conclusão (o EAS aplica o patch) vem da combinação de três coisas: o EAS envia o repo com `patches/`, instala com lockfile congelado, e o pnpm aplica `patchedDependencies` no install. O teste com pnpm 10.14 confirma esse caminho. Se algo der errado, o build **falha com erro**, não sai sem o patch. Confirmação final: o log do próximo build EAS mostra `patch_hash=` no nome do pacote, e o teste de tampar a lente (checklist) confirma o comportamento.

## 2. Android: multi-lente só quando segura

`selectBackCameraDevice(devices, platform = Platform.OS)`:
1. **Android:** câmera lógica segura = `isMultiCam` **e** inclui `wide-angle-camera` **e** `minZoom < neutralZoom` (zoom contínuo abaixo de 1x, com valores finitos e positivos). Se existir, é usada (a de mais lentes).
2. Senão, a câmera **só com a lente principal** (`physicalDevices` igual a `['wide-angle-camera']`).
3. Senão, a escolha de hoje (traseira com a principal, nunca a ultra-wide sozinha).
4. **iOS:** sem mudança (o patch cuida da troca).

Como o vision-camera 4.7.3 monta isso no Android (conferido no código Kotlin): `isMultiCam = physicalDeviceIds.size > 1`; `physicalDevices` é classificado pelo campo de visão de cada câmera física (>94° ultra-wide, 60–94° principal, <60° tele); `minZoom` vem do `zoomState` do CameraX e é 0 quando ainda não existe. O 0 cai como "não seguro", então vale a lente principal.

### Risco residual (não dá para eliminar pelo código)
A pesquisa nas docs do Camera2/CameraX e do AOSP não achou nenhum sinal estático que garanta a troca de lente pelo zoom:
- developer.android.com/media/camera/camera2/multi-camera: *"What the logical camera provides is entirely dependent on the OEM implementation of the Camera HAL."*
- source.android.com/docs/core/camera/multi-camera: *"The fused output of the logical camera device depends entirely on the HAL implementation."* A troca é *"transparent to the app and Android camera framework."*
- `CONTROL_ZOOM_RATIO_RANGE` só diz os limites do zoom (*"Minimum and maximum zoom ratios supported by this camera device."*), não qual lente é usada.
- O único sinal da lente ativa é `CaptureResult.LOGICAL_MULTI_CAMERA_ACTIVE_PHYSICAL_ID`, **durante** a captura (Android 10+). O vision-camera 4.7.3 não o expõe, e usá-lo exigiria um patch Android maior.

A regra acima é a melhor heurística: `minZoom < 1` numa câmera lógica com a principal indica que o próprio HAL faz a troca em 1x, e é assim nos aparelhos que expõem a ultra-wide por zoom. **O teste no aparelho confirma** (checklist item 10: em 1.3x, tampar a ultra-wide não pode mudar a imagem). Se algum modelo falhar, a correção é forçar a lente principal nele.

## 3. Permissão negada com saída

- Na tela de permissão negada, abaixo do texto de hoje: **Abrir Ajustes** (`Linking.openSettings()`, erro ignorado), com o `AuthButton` (56 pt), e **Escolher da galeria** (o mesmo `handleGallery`, 44 pt mínimo, ícone + texto, rótulo `pantryScanner.galleryA11yLabel`). Os dois têm rótulo de acessibilidade.
- **Volta dos Ajustes:** enquanto a câmera não está liberada, um listener do `AppState` relê a permissão em `active`. Se ela foi dada, a tela vai para a câmera. Se não, continua igual. Com a câmera liberada o listener sai (sem custo).
- No iOS, mudar a permissão nos Ajustes costuma reiniciar o app. Nesse caso vale a etapa inicial do CP-C3, que já abre direto na câmera.
- Textos novos (en / pt-BR): `pantryScanner.openSettings` ("Open Settings" / "Abrir Ajustes"), `openSettingsA11yLabel`, `chooseFromGallery` ("Choose from gallery" / "Escolher da galeria"). Chaves tipadas pelo `t()` estrito, sem cast.
- **Problema relacionado corrigido:** com a galeria na tela de permissão, a leitura que volta para a captura (nenhum alimento, erro de rede, "voltar" dos ingredientes) abriria a câmera **sem permissão**, o que dá erro fatal e o aviso "Não foi possível abrir a câmera". Agora, se a câmera não está liberada, a etapa de captura mostra a tela de permissão no lugar. Os `setStep('capture')` do fluxo depois da foto não mudaram: a proteção fica só no render.
- No Android o status já é `denied` antes do primeiro pedido (o vision-camera não distingue). Por isso o estado "negado" só aparece depois do pedido, como hoje.

## 4. Microfone

`app.json`: `["expo-image-picker", { "cameraPermission": "<mesmo texto do vision-camera>", "microphonePermission": false }]`. As fotos continuam com o texto do `ios.infoPlist`. O `cameraPermission` explícito deixa o texto da câmera independente da ordem dos plugins.

`expo prebuild --no-install` (só conferência; `ios/` e `android/` apagados depois):
- **Info.plist:** `NSCameraUsageDescription` (texto do app), `NSPhotoLibraryUsageDescription` (texto do app), `NSFaceIDUsageDescription` (genérico, ver seção 7). **Sem `NSMicrophoneUsageDescription`.**
- **AndroidManifest:** `CAMERA`, `INTERNET`, `READ_EXTERNAL_STORAGE`, `READ_MEDIA_IMAGES`, `RECORD_AUDIO` com **`tools:node="remove"`** (removido inclusive do que as bibliotecas trouxerem no merge), `SYSTEM_ALERT_WINDOW`, `VIBRATE`, `WRITE_EXTERNAL_STORAGE`.
- Manifests das bibliotecas (merge do build): nenhuma declara `RECORD_AUDIO` (netinfo, expo-file-system, expo-haptics, expo-image-picker, expo-notifications conferidos). Nenhum outro pacote adiciona microfone.

## 5. Fotos temporárias

`handleCapture`: depois do `await handleAnalyze(photoUri)` (a compressão terminou, com sucesso ou erro), um `finally` chama `discardCameraPhoto(uri)`, que faz `deleteAsync(uri, { idempotent: true })` do `expo-file-system/legacy` (a mesma API que o `MeScreen` usa). O apagar não é esperado, o erro é ignorado e não há log. Só a foto da câmera: o `handleGallery` não passa por aí.

## 6. Testes e verificação

- Busca por índice trocada por `getByLabelText('pantryScanner.galleryA11yLabel')` em `PantryScannerScreen.test.tsx`, `.cpB6.test.tsx` e também `.lockedPreview.test.tsx` (usava "penúltimo botão"). Nenhuma asserção mudou. Ficou de fora, de propósito, o `expect(getAllByRole('button')).toHaveLength(3)` do lockedPreview: é o que aquele teste confere ("nada novo na captura"), não uma busca.
- Novos:
  - `cameraZoom.utils.test.ts` (+7): Android usa a multi-lente segura; usa a principal quando a lógica não tem zoom abaixo de 1x, não se diz multi-câmera, não tem a principal ou tem `minZoom` inválido; sem nenhuma das duas cai na escolha de hoje; iOS sem mudança.
  - `PantryScannerScreen.camera.test.tsx` (+8): negada mostra os dois botões com rótulo; Abrir Ajustes chama `Linking.openSettings`; a galeria funciona e a volta da leitura mostra a tela de permissão (não a câmera); voltar dos Ajustes sem permissão continua na tela e com permissão abre a câmera; a foto da câmera é apagada depois da compressão com sucesso (ordem conferida) e com erro (toast de hoje); erro ao apagar não quebra o fluxo; a foto da galeria nunca é apagada.
  - Conferência dos testes: tirar o `discardCameraPhoto` derruba 3 testes, e tirar a proteção da tela de permissão derruba 1.
- `visionCameraMock.fakeDevice` ganhou a opção `isMultiCam`.

| Verificação | Resultado |
|---|---|
| Typecheck `packages/shared`, `apps/mobile`, `apps/api` | limpos |
| Lint (`pnpm lint` na raiz) | limpo |
| Suíte do mobile | 71 suítes, **1123/1123** |
| Suíte da API | 226 suítes, **1617/1617** |

Checklist do aparelho: itens 10–16 em `cp-c3-camera-pantry-vision-camera.md`, seção 8.

## 7. Problemas relacionados (prevenção)

### Corrigidos aqui
1. **Câmera sem permissão depois da galeria** (seção 3).
2. **Patch do pnpm 9.0.0 apagando READMEs** (seção 1).
3. **Texto da câmera dependendo da ordem dos plugins** (seção 4).

### Riscos que ficam (todos falham com erro no install, nenhum em silêncio)
1. **Versão do pnpm × hash do patch.** O lockfile tem o hash do pnpm 9. Se o `packageManager` subir para o pnpm 10, ou o EAS deixar de trocar de versão, o install congelado falha (`ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`). Correção: rodar `pnpm install` com a versão nova e commitar o lockfile. O **pnpm 11** (imagens do EAS a partir do SDK 57) não lê mais o campo `pnpm` do `package.json`. Na troca de SDK, mover `patchedDependencies` para o `pnpm-workspace.yaml`.
2. **Atualizar o vision-camera.** O patch é amarrado à 4.7.3. Numa versão nova, o install falha com patch não aplicado (`ERR_PNPM_UNUSED_PATCH`) e é preciso refazê-lo (ou conferir se a biblioteca já expõe a opção).

### Pendentes: precisam de decisão (não mexi: outras telas, políticas ou fora do escopo)
1. **Google Play, permissões de fotos:** o manifest declara `READ_MEDIA_IMAGES` e `READ_EXTERNAL_STORAGE` (do `app.json`). Pela política de fotos e vídeos do Play, um app que só escolhe fotos de vez em quando deve usar o seletor do sistema (o expo-image-picker 17 já usa) e **não** declarar `READ_MEDIA_IMAGES`, senão precisa justificar no formulário. Só que o `MeScreen` (foto de perfil) chama `requestMediaLibraryPermissionsAsync()`, que depende dela. Proposta: tirar essa chamada no MeScreen e bloquear as duas permissões. É um CP curto.
2. **`SYSTEM_ALERT_WINDOW` e `WRITE_EXTERNAL_STORAGE`** no manifest: o app não desenha sobre outros apps, e a escrita externa não vale mais no Android 10+. O Play pode perguntar sobre a primeira. Dá para bloquear em `android.blockedPermissions` depois de confirmar que nada usa.
3. **`NSFaceIDUsageDescription` genérico em inglês** (do plugin do expo-secure-store): o app não usa `requireAuthentication`. Um texto genérico de Face ID sem uso pode gerar pergunta na revisão da Apple. Proposta: `["expo-secure-store", { "faceIDPermission": false }]`.
4. **"Abrir Ajustes" no Android:** lá o nome do sistema é "Configurações", e o texto `permissionDenied` já fala em "Configurações do dispositivo". Usei "Ajustes" como o prompt pediu. Dá para trocar o rótulo por plataforma.
5. **Tela de permissão sem botão de fechar** (a pilha esconde o cabeçalho). Sair depende do gesto de voltar ou da barra de abas. A captura tem o "fechar".
6. **Saída do image-manipulator não apagada** (~100–300 KB por foto, câmera e galeria, no cache que o sistema limpa). Fica dentro do `compressAndEncodeImage` (fluxo depois da foto), então não mexi.
7. **`ImagePicker.MediaTypeOptions` está obsoleto** no expo-image-picker 17 (aviso hoje, remoção futura). A troca é `mediaTypes: ['images']`, no Pantry e no MeScreen.
