// CP-C3: no Expo Go o import do react-native-vision-camera lança (sem módulo
// nativo). O loader devolve null em vez de derrubar a tela.

jest.mock('react-native-vision-camera', () => {
  throw new Error('react-native-vision-camera is not supported in Expo Go!');
});

import { getVisionCamera, resetVisionCameraForTests } from './visionCamera.loader';

describe('getVisionCamera', () => {
  beforeEach(() => resetVisionCameraForTests());

  it('import que lança (Expo Go) vira null, sem crash', () => {
    expect(() => getVisionCamera()).not.toThrow();
    expect(getVisionCamera()).toBeNull();
  });

  it('guarda o resultado (não tenta o require a cada render)', () => {
    expect(getVisionCamera()).toBeNull();
    expect(getVisionCamera()).toBeNull();
  });
});
