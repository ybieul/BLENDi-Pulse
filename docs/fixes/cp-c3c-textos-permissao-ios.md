# CP-C3c — Textos de permissão do iOS (uso real e português)

**Entrega:** os pedidos de câmera e fotos do iPhone explicam o uso real (despensa e foto de perfil) e aparecem em português no iPhone em pt-BR.

**Sem mudança:** código do app, permissões do Android, patch do vision-camera, `eas.json`, variáveis do EAS e os locales do i18n (`src/locales/*.json`). Nenhuma biblioteca nova. Não rodei `eas build` e não commitei.

**Nota:** o prompt diz que o CP-C3b está "ainda sem commit", mas ele já está no commit `fc4619f`. Isso não muda nada aqui.

## 1. Um texto só por permissão (`apps/mobile/app.json`)

Os textos em inglês ficam **só em `ios.infoPlist`**. Saíram `cameraPermissionText` (vision-camera) e `cameraPermission` (expo-image-picker). `photosPermission` nunca foi usado.

Isso é seguro. Conferi no código dos dois plugins:
- **vision-camera 4.7.3** (`withVisionCamera.js`): `props.cameraPermissionText ?? infoPlist.NSCameraUsageDescription ?? padrão`. Sem a opção, fica o texto do `infoPlist`.
- **expo-image-picker 17** (`applyPermissions` em `@expo/config-plugins`): `opção || infoPlist[chave] || padrão`, e só apaga a chave quando a opção é `false`. Sem a opção, fica o texto do `infoPlist`, tanto para câmera quanto para fotos.
- **Android:** o image-picker só bloqueia CAMERA quando `cameraPermission === false`. Tirar o texto não muda nada no Android.

Textos novos (inglês):
- `NSCameraUsageDescription`: "BLENDi Pulse uses the camera to scan your pantry for recipe ideas and to take your profile photo."
- `NSPhotoLibraryUsageDescription`: "BLENDi Pulse only accesses the photo you choose: a pantry photo for recipe ideas or your profile photo."

## 2. Português

- **Arquivo novo:** `apps/mobile/locales/ios-pt-BR.json`, ligado em `expo.locales` (`"pt-BR": "./locales/ios-pt-BR.json"`). O formato segue a documentação do Expo ("Translating app metadata"). Este arquivo não tem nada a ver com o i18n do app em `src/locales`.
- **As chaves estão dentro de `"ios"`.** Sem isso, o Expo também mandaria as chaves para os `strings.xml` do Android.
- **`CFBundleAllowMixedLocalizations: true`** foi adicionado em `ios.infoPlist`, como a documentação do Expo pede. O template do Expo 54 já gera essa chave como `true`, então ela só deixa explícito o que já valia.
- **`CFBundleLocalizations` não é necessário.** A documentação do Expo não fala dele. O iOS descobre os idiomas do app pelas pastas `.lproj` do bundle, e o `pt-BR.lproj/InfoPlist.strings` vai para o bundle. Para os outros idiomas, o iOS usa a região de desenvolvimento (`en`), que é o Info.plist em inglês. Por isso não declarei.

## 3. Conferência (`expo prebuild --no-install`, `ios/` e `android/` apagados depois)

**`ios/BLENDiPulse/Info.plist`:** só duas chaves `*UsageDescription`, as duas com os textos novos em inglês. `CFBundleAllowMixedLocalizations` é `true`.

**`ios/BLENDiPulse/Supporting/pt-BR.lproj/InfoPlist.strings`** (UTF-8):
```
NSCameraUsageDescription = "O BLENDi Pulse usa a câmera para fotografar sua despensa e sugerir receitas, e para tirar sua foto de perfil.";
NSPhotoLibraryUsageDescription = "O BLENDi Pulse acessa só a foto que você escolher: uma foto da despensa para sugerir receitas ou a sua foto de perfil.";
```
O arquivo está no projeto Xcode e entra na fase **Copy Bundle Resources**.

**Projeto Xcode:** `knownRegions` continua só com `en` e `Base`, e `pt-BR` não aparece lá. O plugin de locales do Expo não mexe nesse campo. Isso só afeta o painel de idiomas do Xcode, não o app no aparelho, porque o iOS usa as pastas `.lproj` do bundle. Não criei plugin para mudar isso, porque o prompt não pede código novo. O passo 25 do checklist confirma o resultado no aparelho.

**Android:** comparei com um prebuild do `HEAD` (CP-C3b). O `AndroidManifest.xml` e todo o resto de `android/` ficaram iguais. A única diferença é um arquivo novo `res/values-b+pt+BR/strings.xml` com `<resources/>` vazio, que o plugin de locales cria. Ele não tem texto nem permissão.

**Mobile:** typecheck limpo, lint limpo (`--max-warnings 0`) e testes **71 suítes / 1134 testes passando**. Nenhum código mudou.

## 4. Checklist do aparelho

Os passos 25 a 27 foram adicionados à seção 8 de `cp-c3-camera-pantry-vision-camera.md`: com o iPhone em português, apagar o app, instalar e conferir o pedido de câmera no Pantry e no perfil. Com o iPhone em inglês, conferir o texto em inglês.
