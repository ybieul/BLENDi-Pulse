# CP-C3b: permissões que as lojas questionam (fotos, sobreposição, armazenamento, Face ID) e ajustes finos

**Ponto de partida:** `8f5281f`. O prompt diz que o CP-C3a ainda não estava commitado, mas ele já está nesse commit. Isso não muda nada aqui.

**Sem mudança:** regras da IA, o Pantry depois da foto (`handleAnalyze`, compressão, leitura), a câmera do Pantry (CP-C3/C3a), o login e as outras telas. Nenhuma biblioteca nova. O patch do vision-camera, o `eas.json` e as variáveis do EAS ficaram intocados. Não rodei `eas build` e não commitei.

## 1. Desvio do prompt, aprovado pelo Gabriel (26/11): WRITE_EXTERNAL_STORAGE limitada ao Android ≤ 9, não bloqueada

O app roda a partir do **Android 7** (minSdk 24, padrão do Expo 54). No Android 7, 8 e 9 (API < 29), o `launchCameraAsync` do expo-image-picker 17 pede **WRITE_EXTERNAL_STORAGE junto com CAMERA** e rejeita a chamada se ela não for concedida (`ImagePickerModule.kt`, `ensureCameraPermissionsAreGranted`). Bloquear a permissão quebraria o **Tirar foto** do perfil nesses aparelhos.

A solução foi um plugin de config local, [withLegacyWriteExternalStorage.js](../../apps/mobile/plugins/withLegacyWriteExternalStorage.js), sem biblioteca nova. Ele declara a permissão com `android:maxSdkVersion="28"` e `tools:node="replace"`, o que substitui no merge as declarações sem limite que vêm do template do Expo, do expo-image-picker e do expo-file-system. Do Android 10 em diante, o app não declara essa permissão.

**O critério de aceite muda:** o manifest fica sem WRITE_EXTERNAL_STORAGE a partir da API 29, e não sem ela de vez.

> **Não** coloque WRITE_EXTERNAL_STORAGE em `android.blockedPermissions`. O `tools:node="remove"` anularia o limite e quebraria a câmera do perfil no Android ≤ 9. O aviso também está no comentário do plugin.

## 2. Tarefa 1: galeria sem permissão de galeria

**Conferido no código nativo do expo-image-picker 17.0.11** (a documentação só diz que não precisa de permissão; o código confirma):

| | iOS | Android |
|---|---|---|
| `launchImageLibraryAsync` | Com `allowsEditing: false` (os 3 usos do app), abre o `PHPickerViewController`, que roda fora do processo do app e não pede autorização. O módulo não confere nenhuma permissão antes de abrir. O alvo mínimo do Expo 54 é o iOS 15.1, então o caso do iOS 13 não existe. | `PickVisualMedia` (Photo Picker do sistema; em aparelhos sem ele, cai para o `ACTION_OPEN_DOCUMENT`). Não confere nenhuma permissão. A URI escolhida é copiada para o cache do app. |
| `launchCameraAsync` | Confere a permissão de câmera (`NSCameraUsageDescription`). | Pede CAMERA, mais WRITE_EXTERNAL_STORAGE no Android ≤ 9 (seção 1). |

**Mudanças:**
- [MeScreen.tsx](../../apps/mobile/src/screens/MeScreen.tsx): saiu o `requestMediaLibraryPermissionsAsync` antes da galeria. A câmera continua com `requestCameraPermissionsAsync` e o aviso de hoje quando ela é negada. O texto `me.galleryPermissionDenied` ficou sem uso e saiu dos dois JSON.
- [app.json](../../apps/mobile/app.json): `android.permissions` ficou só com `CAMERA`. READ_EXTERNAL_STORAGE e READ_MEDIA_IMAGES foram para `android.blockedPermissions`.
- **Opção do plugin:** o plugin do expo-image-picker 17 só tem `cameraPermission`, `microphonePermission` e `photosPermission`. Esta última vale só para o iOS (texto do Info.plist). Não existe opção para não pedir fotos no Android; o próprio código do plugin diz que deixa o armazenamento de fora de propósito. Por isso o bloqueio foi feito em `blockedPermissions`.
- **iOS: `NSPhotoLibraryUsageDescription` foi mantida.** O binário do expo-image-picker continua usando a API de autorização de fotos (`PHPhotoLibrary.requestAuthorization`, de `requestMediaLibraryPermissionsAsync`). Na análise do binário que a Apple faz no envio, isso exige o texto de uso, senão o envio é rejeitado com **ITMS-90683 (Missing purpose string)**. O app não pede mais essa permissão, então o texto nunca aparece para o usuário.

## 3. Tarefa 2: permissões sem uso no Android

| Permissão | De onde vinha | Entrava no preview/production? | Agora |
|---|---|---|---|
| SYSTEM_ALERT_WINDOW | Template do Expo, no **manifest principal** (`src/main`) e no manifest de debug (`src/debug`) | **Sim**, pelo manifest principal | Bloqueada no principal. O manifest de debug continua com ela, porque o menu de desenvolvimento usa a sobreposição. Builds de release (preview/production) não usam o manifest de debug. |
| WRITE_EXTERNAL_STORAGE | Template do Expo, `expo-image-picker` e `expo-file-system` (manifests das bibliotecas) | Sim | Só até a API 28 (seção 1) |
| READ_EXTERNAL_STORAGE | `app.json`, template, `expo-image-picker` e `expo-file-system` | Sim | Bloqueada |
| READ_MEDIA_IMAGES | `app.json` | Sim | Bloqueada |
| RECORD_AUDIO | `expo-camera` (só resto no store do pnpm, fora do lockfile e do build). Os plugins do image-picker e do vision-camera já não a adicionavam. | Não | Bloqueada de forma explícita, como reforço |

O app em produção não depende de nenhuma delas. O `expo-file-system` só lê arquivos que o próprio app gerou no cache (`MeScreen`, depois do `manipulateAsync`), e o vision-camera grava a foto no cache.

### Manifest final de permissões (prebuild de 26/11 e manifests das bibliotecas)

**Declaradas:**
```
android.permission.CAMERA                     app.json, expo-image-picker, plugin do vision-camera
android.permission.INTERNET                   template do Expo, expo-file-system
android.permission.VIBRATE                    template do Expo, expo-haptics
android.permission.WRITE_EXTERNAL_STORAGE     maxSdkVersion=28, plugin local (seção 1)
android.permission.ACCESS_NETWORK_STATE       @react-native-community/netinfo
android.permission.ACCESS_WIFI_STATE          @react-native-community/netinfo
android.permission.POST_NOTIFICATIONS         expo-notifications
android.permission.RECEIVE_BOOT_COMPLETED     expo-notifications
```
**Esperadas no merge do Gradle**, vindas de AARs fora do `node_modules`. Não consegui confirmar porque não há Android SDK nesta máquina:
```
com.android.vending.BILLING                   Play Billing (react-native-purchases)
android.permission.WAKE_LOCK                  firebase-messaging (expo-notifications)
com.google.android.c2dm.permission.RECEIVE    firebase-messaging (expo-notifications)
com.blendi.pulse.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION   androidx.core (interna, não aparece ao usuário)
```
**Bloqueadas** (`tools:node="remove"`):
```
android.permission.READ_EXTERNAL_STORAGE
android.permission.READ_MEDIA_IMAGES
android.permission.READ_MEDIA_VIDEO               preventivo: mesma política de fotos e vídeos do Play
android.permission.READ_MEDIA_VISUAL_USER_SELECTED preventivo: idem (acesso parcial do Android 14)
android.permission.SYSTEM_ALERT_WINDOW
android.permission.RECORD_AUDIO
com.google.android.gms.permission.AD_ID           preventivo: nada no app usa ID de publicidade
```

**Conferir no primeiro AAB do preview:** `bundletool dump manifest --bundle app.aab | grep uses-permission`. A lista tem que bater com a de cima.

## 4. Tarefa 3: Face ID

`["expo-secure-store", { "faceIDPermission": false }]`. Na versão 15.0.8, o `false` apaga `NSFaceIDUsageDescription` (`applyPermissions` em `@expo/config-plugins`). O `configureAndroidBackup` continua no padrão (`true`), então as regras de backup do secure-store ficam iguais.

**O login silencioso não muda.** O app não chama `requireAuthentication` em lugar nenhum (só aparece num comentário em `store/auth.store.ts`), e o Info.plist não afeta as chamadas sem biometria.

## 5. Tarefa 4: ajustes finos

- **Rótulo por plataforma** (`pantryScanner.openSettings.{ios,android}` e `openSettingsA11yLabel.{ios,android}`): iOS "Abrir Ajustes" / "Open Settings"; Android "Abrir Configurações" / "Open Settings". A escolha usa `Platform.OS` com chaves literais, sem cast.
- **Além do prompt, no mesmo espírito:** o texto `permissionDenied` também foi dividido por plataforma. No iOS ele dizia "Configurações do dispositivo", mas o app do sistema se chama **Ajustes** e o botão logo abaixo dizia "Abrir Ajustes". Agora fica "nos Ajustes do dispositivo" no iOS e "nas Configurações do dispositivo" no Android. Em inglês, o texto é igual nas duas plataformas.
- **Fechar na tela de permissão:** um X no canto superior esquerdo, com o mesmo estilo de 44 pt (`cameraIconButton`), a mesma ação (`navigation.goBack()`) e o mesmo rótulo (`common.actions.close`) do X da captura. A cor segue o tema (`text.primary`), porque essa tela não tem o fundo escuro da câmera. **Escolha:** ele aparece na tela de permissão inteira, antes de pedir e depois de negar. É a mesma tela, e a versão anterior ao pedido também não tinha saída.
- **`MediaTypeOptions.Images` → `mediaTypes: ['images']`** nos 3 lugares. `quality: 1` e `allowsEditing: false` ficaram iguais.

## 6. Problemas relacionados

### Corrigidos neste CP
1. **Câmera do perfil no Android ≤ 9** (seção 1). Se o prompt fosse seguido à risca, ela quebraria.
2. **Promessas sem tratamento:** `launchCameraAsync` e `launchImageLibraryAsync` (MeScreen) e a galeria do Pantry eram chamados com `void` e sem `catch`. Uma falha ao abrir (sem app de câmera, activity destruída, a câmera do Android ≤ 9 sem armazenamento) virava uma rejeição solta e nada acontecia na tela. Agora mostram um aviso de erro: `me.photoError` no perfil e o mesmo toast do disparo da câmera no Pantry.
3. **Permissões de mídia preventivas** (READ_MEDIA_VIDEO, READ_MEDIA_VISUAL_USER_SELECTED) e **AD_ID**. Uma atualização de biblioteca poderia trazê-las de volta sem ninguém perceber e reabrir o formulário de fotos ou o de ID de publicidade no Play Console.
4. **Botão da foto de perfil sem rótulo de acessibilidade:** o leitor de tela lia só "botão". Agora lê "Foto de perfil", com o texto `me.profilePhotoTitle`, que já existia.
5. **"Configurações" no texto do iOS** (seção 5).

### Pendentes (precisam de decisão; não mexi)
1. **Textos de uso do iOS só em inglês, e incompletos.** `NSCameraUsageDescription` fala só da despensa, mas a câmera também tira a foto de perfil. `NSPhotoLibraryUsageDescription` também fala só da despensa. A diretriz 5.1.1 da Apple pede que o texto explique o uso real. Sugestão:
   - Camera: *"BLENDi Pulse uses the camera to scan your pantry for recipe ideas and to take your profile photo."*
   - Photos: *"BLENDi Pulse only accesses a photo you choose: a pantry photo for recipe ideas or your profile photo."*
   - Mudar exige trocar o mesmo texto em 3 lugares do `app.json`: `ios.infoPlist`, o plugin do vision-camera e o plugin do image-picker. Na prática vence o último plugin aplicado. Para pt-BR, o Expo aceita `locales` no `app.json` (gera `InfoPlist.strings`). São arquivos novos, por isso fica para outro CP.
2. **Câmera do perfil negada de vez:** no iOS o pedido não volta, e o usuário só vê o aviso "Permita o acesso à câmera…", sem caminho para os Ajustes. Seria bom repetir no perfil o padrão do Pantry (`canAskAgain === false` → botão para os Ajustes). Isso muda o comportamento da tela.
3. **Android matando o app durante o seletor** (aparelho com pouca memória): o expo-image-picker guarda o resultado para `getPendingResultAsync()`, mas o app não o lê. A foto escolhida se perde e o usuário precisa escolher de novo. Prioridade baixa.
4. **`expo-system-ui` não instalado:** o prebuild avisa que `userInterfaceStyle` (Android) e `ios.backgroundColor` são ignorados sem ele. Isso pode causar flash branco ou barras do sistema no tema claro. Exige biblioteca nova.
5. **Formulários de privacidade (não de permissão):** mesmo sem permissão de galeria, as fotos **saem do aparelho**. A da despensa vai para a análise por IA e a de perfil é guardada no servidor. Isso precisa estar declarado na **Segurança dos dados** (Play) e na **Privacidade do app** (App Store), no tipo "Fotos" e com a finalidade "Funcionalidade do app". Confirme com o backend se a foto da despensa fica guardada ou é descartada depois da leitura; a resposta muda o formulário.
6. **Merge das AARs não conferido** (sem Android SDK local). Conferir no AAB do preview (seção 3).

## 7. Testes

### Expectativas alteradas (todas em `PantryScannerScreen.camera.test.tsx`)
- `'pantryScanner.permissionDenied'` → `'pantryScanner.permissionDenied.ios'`: 3 lugares (o jest-expo roda como iOS). A chave mudou e o fluxo é o mesmo.
- `'pantryScanner.openSettings'` → `'.openSettings.ios'` e `'pantryScanner.openSettingsA11yLabel'` → `'.openSettingsA11yLabel.ios'`: 3 linhas em 2 testes do CP-C3a.
- O mock `mockLaunchImageLibrary` agora recebe as opções, para conferir o `mediaTypes`.

### Mocks sem expectativa alterada
- `MediaTypeOptions: { Images: 'Images' }` saiu dos mocks de `PantryScannerScreen.test.tsx`, `.cpB6.test.tsx`, `.lockedPreview.test.tsx` e `.camera.test.tsx`, porque o código não usa mais. Nenhum teste conferia esse valor.
- `MeScreen.test.tsx`: o mock do `expo-image-picker` era `{}` e agora tem `jest.fn`s. O `showToast` virou um mock nomeado. Os testes que já existiam não mudaram.

### Novos (11)
- **Pantry (6):** iOS com "Ajustes" e rótulo de acessibilidade do iOS; Android com "Configurações", rótulo do Android e `Linking.openSettings`; fechar na tela de permissão negada (44 × 44 e `goBack`); fechar antes do pedido; galeria com `{ mediaTypes: ['images'], quality: 1, allowsEditing: false }`; seletor que falha → toast.
- **MeScreen (5):** a galeria abre sem `requestMediaLibraryPermissionsAsync`; a câmera pede a permissão de câmera **antes** de abrir, sem a de galeria; câmera negada mostra o aviso de hoje e não abre; seletor ou câmera que falham → `photoError`; Android (Alert) com a galeria também sem permissão.

### Prebuild de conferência (`expo prebuild --no-install --clean`; `ios/` e `android/` apagados depois)
- **Info.plist:** `NSCameraUsageDescription` e `NSPhotoLibraryUsageDescription`. **Sem** `NSFaceIDUsageDescription` (estava presente antes) e **sem** `NSMicrophoneUsageDescription`.
- **AndroidManifest (app):** CAMERA, INTERNET, VIBRATE, WRITE_EXTERNAL_STORAGE (`maxSdkVersion="28"`, `tools:node="replace"`) e as 7 bloqueadas da seção 3.

### Resultado
- Typecheck: shared, api e mobile limpos.
- Lint: shared, api e mobile limpos (mobile com `--max-warnings 0`).
- Mobile: **71 suítes, 1134 testes passando.** Os avisos de `act(...)` no console são os que já existiam nessas telas (efeitos de `setLastPreview` e da query). O número subiu de 97 para 126 por causa dos 11 testes novos que renderizam as mesmas telas.
- API: **226 suítes, 1617 testes passando**, 0 falhas.

## 8. Respostas para os formulários das lojas (para o Jon)

Em inglês, prontas para colar.

### Google Play Console
- **Photo and video permissions:** *Not applicable.* The app does not declare READ_MEDIA_IMAGES, READ_MEDIA_VIDEO or READ_EXTERNAL_STORAGE. Users pick one photo at a time through the Android system photo picker.
- **Advertising ID:** *No, the app does not use an advertising ID.* (AD_ID is blocked in the manifest.)
- **Permissions that remain, and why:**
  - `CAMERA`: *To photograph the user's pantry so the app can identify ingredients and suggest recipes, and to take an optional profile photo. Used only when the user taps the camera.*
  - `WRITE_EXTERNAL_STORAGE` (Android 9 and below only, `maxSdkVersion=28`): *Required by the Android system camera on Android 9 and below to save the profile photo the user just took. Not requested on Android 10+.*
  - `POST_NOTIFICATIONS`: *Optional daily reminder and progress notifications the user turns on in the app.*
  - `RECEIVE_BOOT_COMPLETED`: *To restore the user's scheduled reminders after the device restarts.*
  - `com.android.vending.BILLING`: *To purchase the Pulse Pro subscription through Google Play.*
  - `INTERNET`, `ACCESS_NETWORK_STATE`, `ACCESS_WIFI_STATE`: *To connect to the BLENDi Pulse service and detect when the device is offline.*
  - `VIBRATE`: *Haptic feedback on taps.*
  - `WAKE_LOCK`, `c2dm.permission.RECEIVE`: *Delivery of push notifications (Firebase Cloud Messaging).*
- **Data safety:** see item 5 of the pending list in section 6 (photos are user-provided and uploaded).

### App Store Connect
- **Camera (`NSCameraUsageDescription`):** *Used to scan the pantry for recipe suggestions and to take an optional profile photo, only when the user taps the camera button.*
- **Photo Library (`NSPhotoLibraryUsageDescription`):** *The app uses the system photo picker (PHPicker), so the user shares only the single photo they choose. The app never requests access to the full library. The key is present because the image-picker library links the Photos authorization API.*
- **Face ID:** *Not used.* (Not declared in Info.plist.)
- **Microphone:** *Not used.* (Not declared.)
- **App Privacy:** "Photos or Videos", collected for App Functionality. Confirm the pantry photo retention with the backend (section 6, pending item 5).
