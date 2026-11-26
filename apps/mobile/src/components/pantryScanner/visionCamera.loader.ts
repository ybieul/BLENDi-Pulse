// apps/mobile/src/components/pantryScanner/visionCamera.loader.ts
// CP-C3: carrega o react-native-vision-camera sob demanda.
//
// O pacote LANÇA um erro já no import quando o módulo nativo não existe
// (Expo Go, build sem o pod/gradle). Um import estático derrubaria a tela do
// Pantry (e o app, se a navegação carregar a tela de cara). Aqui o require
// fica dentro de try/catch: sem módulo nativo devolve null e a tela mostra o
// aviso com a galeria funcionando.

import type * as VisionCameraModule from 'react-native-vision-camera';

export type VisionCamera = typeof VisionCameraModule;

let cached: VisionCamera | null | undefined;

export function getVisionCamera(): VisionCamera | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- require tardio de propósito: o import estático lança sem módulo nativo
    cached = require('react-native-vision-camera') as VisionCamera;
  } catch {
    cached = null;
  }
  return cached;
}

/** Só para testes: esquece o módulo carregado. */
export function resetVisionCameraForTests(): void {
  cached = undefined;
}
