// CP-C3b: WRITE_EXTERNAL_STORAGE só até o Android 9 (API 28).
//
// Por que existe: no Android 7–9 (o app suporta a partir da API 24), o
// launchCameraAsync do expo-image-picker 17 pede WRITE_EXTERNAL_STORAGE junto
// com CAMERA e rejeita se ela não estiver concedida (ImagePickerModule.kt,
// ensureCameraPermissionsAreGranted). Sem ela, "Tirar foto" no perfil quebra
// nesses aparelhos. Do Android 10 em diante a permissão não é usada.
//
// O template do Expo, o expo-image-picker e o expo-file-system declaram a
// permissão sem limite. Aqui a entrada do app ganha maxSdkVersion="28" e
// tools:node="replace", que no merge do Gradle substitui as das bibliotecas.
// Assim o APK/AAB final só pede essa permissão no Android ≤ 9.
//
// NÃO coloque WRITE_EXTERNAL_STORAGE em android.blockedPermissions: o bloqueio
// (tools:node="remove") anularia este limite e quebraria a câmera do perfil.
const { AndroidConfig, withAndroidManifest } = require('expo/config-plugins');

const PERMISSION = 'android.permission.WRITE_EXTERNAL_STORAGE';
const MAX_SDK_VERSION = '28';

function withLegacyWriteExternalStorage(config) {
  return withAndroidManifest(config, (modConfig) => {
    const manifest = AndroidConfig.Manifest.ensureToolsAvailable(modConfig.modResults);
    const others = (manifest.manifest['uses-permission'] ?? []).filter(
      (item) => item.$?.['android:name'] !== PERMISSION,
    );
    manifest.manifest['uses-permission'] = [
      ...others,
      {
        $: {
          'android:name': PERMISSION,
          'android:maxSdkVersion': MAX_SDK_VERSION,
          'tools:node': 'replace',
        },
      },
    ];
    modConfig.modResults = manifest;
    return modConfig;
  });
}

module.exports = withLegacyWriteExternalStorage;
