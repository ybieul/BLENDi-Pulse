// apps/mobile/jest.setup.js
// CP-C3: setup global de gestos e animações para os testes.

// Setup oficial do gesture-handler (mocka o módulo nativo, mantém a API de gestos
// e permite fireGestureHandler/getByGestureTestId em react-native-gesture-handler/jest-utils).
require('react-native-gesture-handler/jestSetup');

// Mock oficial do Reanimated. Único ajuste: no mock, useSharedValue cria um
// objeto novo a cada render; o real mantém o mesmo shared value entre renders.
// Sem isso um re-render descartaria o zoom da câmera nos testes.
jest.mock('react-native-reanimated', () => {
  const Reanimated = require('react-native-reanimated/mock');
  const React = require('react');
  return {
    ...Reanimated,
    useSharedValue: (initial) => {
      const ref = React.useRef(null);
      if (ref.current === null) {
        ref.current = Reanimated.useSharedValue(initial);
      }
      return ref.current;
    },
  };
});
