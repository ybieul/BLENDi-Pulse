// CP-C2 — Ambiente real: a tela só está "livre" sem folha aberta, sem
// celebração de nível, com o app ativo (alerta do sistema deixa 'inactive')
// e sem rota de raiz por cima do AppFlow (paywall, metas...). Âncora e
// folha registram e desregistram com a montagem.
import { render } from '@testing-library/react-native';
import { AppState, Text } from 'react-native';

const mockRootState = { index: 0, routes: [{ name: 'AppFlow' }] as Array<{ name: string }> };
jest.mock('../../navigation/navigationRef', () => ({
  navigationRef: {
    isReady: () => true,
    getRootState: () => mockRootState,
    getCurrentRoute: () => ({ name: 'Home' }),
    addListener: () => () => undefined,
  },
}));
jest.mock('../../services/analytics.service', () => ({ trackEvent: jest.fn() }));

import { useGamificationStore } from '../../store/gamification.store';
import { TutorialAnchor } from './TutorialAnchor';
import { isTutorialSurfaceFree } from './tutorialEnvironment';
import { getTutorialAnchor, getTutorialBlockerCount, resetTutorialRegistryForTests } from './tutorialRegistry';
import { useTutorialBlockingSurface } from './useTutorialBlockingSurface';

function Sheet({ open }: { open: boolean }) {
  useTutorialBlockingSurface(open);
  return null;
}

describe('CP-C2 — ambiente real do tutorial', () => {
  beforeEach(() => {
    resetTutorialRegistryForTests();
    mockRootState.index = 0;
    mockRootState.routes = [{ name: 'AppFlow' }];
    useGamificationStore.setState({ levelUpData: null });
    Object.defineProperty(AppState, 'currentState', { value: 'active', configurable: true });
  });

  it('livre por padrão', () => {
    expect(isTutorialSurfaceFree()).toBe(true);
  });

  it('folha aberta bloqueia; fechar ou desmontar libera', () => {
    const { rerender, unmount } = render(<Sheet open />);
    expect(getTutorialBlockerCount()).toBe(1);
    expect(isTutorialSurfaceFree()).toBe(false);
    rerender(<Sheet open={false} />);
    expect(isTutorialSurfaceFree()).toBe(true);
    rerender(<Sheet open />);
    unmount();
    expect(getTutorialBlockerCount()).toBe(0);
  });

  it('celebração de nível bloqueia', () => {
    useGamificationStore.setState({ levelUpData: { newLevel: 2, newLevelNameKey: 'levels.x' } });
    expect(isTutorialSurfaceFree()).toBe(false);
  });

  it('paywall (rota de raiz por cima do AppFlow) bloqueia', () => {
    mockRootState.routes = [{ name: 'AppFlow' }, { name: 'Upgrade' }];
    mockRootState.index = 1;
    expect(isTutorialSurfaceFree()).toBe(false);
  });

  it('alerta do sistema (app inactive) bloqueia', () => {
    Object.defineProperty(AppState, 'currentState', { value: 'inactive', configurable: true });
    expect(isTutorialSurfaceFree()).toBe(false);
  });

  it('âncora registra ao montar e sai ao desmontar', () => {
    const { unmount } = render(
      <TutorialAnchor id="home.rings">
        <Text>rings</Text>
      </TutorialAnchor>
    );
    expect(getTutorialAnchor('home.rings')?.current).toBeTruthy();
    unmount();
    expect(getTutorialAnchor('home.rings')).toBeUndefined();
  });
});
