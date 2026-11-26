// CP-C3: câmera do Pantry na tela — permissão, captura no mesmo caminho da
// galeria (handleAnalyze → compressão → leitura), pausa sem foco/no fundo e
// Expo Go sem módulo nativo (aviso + galeria).
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { AppState, Linking, type AppStateStatus } from 'react-native';

jest.mock('../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- factory do jest.mock não pode usar import do topo
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- idem
  return { useColors: () => lightColors };
});

jest.mock('../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
    locale: 'en',
  }),
}));

jest.mock('react-native-safe-area-context', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- idem
  const { View } = require('react-native');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- idem
  return { SafeAreaView: View, useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) };
});

jest.mock('../components/ui/AuroraBackground', () => ({ AuroraBackground: () => null }));
jest.mock('../components/pulseAi/RecipeCard', () => ({ RecipeCard: () => null, LockedRecipeCard: () => null }));
jest.mock('../components/pulseAi/AgeConfirmationSheet', () => ({ AgeConfirmationSheet: () => null }));
jest.mock('../services/pulseAi.service', () => ({ confirmAlcoholAge: jest.fn() }));
jest.mock('../config/api', () => ({ api: {} }));
jest.mock('../hooks/useFavorites', () => ({ useFavorites: () => ({ favorites: [] }) }));

const mockAuthState: { user: { isPro: boolean } } = { user: { isPro: false } };
jest.mock('../store/auth.store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) => selector(mockAuthState),
}));

jest.mock('@tanstack/react-query', () => ({
  ...jest.requireActual<Record<string, unknown>>('@tanstack/react-query'),
  useQueryClient: () => ({ setQueryData: jest.fn() }),
}));

jest.mock('react-native-vision-camera', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- idem
  require('../testUtils/visionCameraMock').createVisionCameraMock(),
);

const mockLaunchImageLibrary = jest.fn();
jest.mock('expo-image-picker', () => ({
  launchImageLibraryAsync: () => mockLaunchImageLibrary() as unknown,
  MediaTypeOptions: { Images: 'Images' },
}));

// CP-C3a: apagar a foto temporária da câmera.
const mockDeleteAsync = jest.fn<Promise<void>, [string, unknown]>();
jest.mock('expo-file-system/legacy', () => ({
  deleteAsync: (uri: string, options: unknown) => mockDeleteAsync(uri, options),
}));

const mockReadPantryPhoto = jest.fn<Promise<unknown>, unknown[]>();
const mockCompress = jest.fn<Promise<unknown>, [string]>();
jest.mock('../services/pantryScanner.service', () => {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- idem
  const actual = jest.requireActual('../services/pantryScanner.service');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- idem
  return {
    ...actual,
    readPantryPhoto: (...args: unknown[]) => mockReadPantryPhoto(...args),
    compressAndEncodeImage: (uri: string) => mockCompress(uri),
  };
});

const mockShowToast = jest.fn<void, unknown[]>();
jest.mock('../utils/toast.events', () => ({
  showToast: (...args: unknown[]) => mockShowToast(...args),
}));

import * as visionCameraLoader from '../components/pantryScanner/visionCamera.loader';
import { resetVisionCameraForTests } from '../components/pantryScanner/visionCamera.loader';
import { resetVisionCameraState, visionCameraState } from '../testUtils/visionCameraMock';
import { PantryScannerScreen } from './PantryScannerScreen';

type ScreenProps = Parameters<typeof PantryScannerScreen>[0];
type NavListener = () => void;

function makeNavigation() {
  const listeners: Record<string, NavListener[]> = { focus: [], blur: [] };
  return {
    goBack: jest.fn(),
    isFocused: () => true,
    addListener: (event: 'focus' | 'blur', listener: NavListener) => {
      listeners[event]?.push(listener);
      return () => {
        listeners[event] = (listeners[event] ?? []).filter((item) => item !== listener);
      };
    },
    emit: (event: 'focus' | 'blur') => listeners[event]?.forEach((listener) => listener()),
    getParent: () => ({ navigate: jest.fn(), getParent: () => ({ navigate: jest.fn() }) }),
  };
}

function renderScreen() {
  const navigation = makeNavigation();
  const utils = render(<PantryScannerScreen {...({ navigation } as unknown as ScreenProps)} />);
  return { ...utils, navigation };
}

function readResult() {
  return {
    readId: 'read-1',
    readExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    detectedIngredients: [{ name: 'banana', confidence: 'high', isAlcoholic: false }],
    otherItems: [],
    hasLiquid: true,
    readsUsed: 1,
    readsLimit: 10,
    scansUsed: 0,
    scansLimit: 3,
  };
}

beforeEach(() => {
  resetVisionCameraForTests();
  resetVisionCameraState();
  mockAuthState.user = { isPro: false };
  mockReadPantryPhoto.mockReset();
  mockReadPantryPhoto.mockResolvedValue(readResult());
  mockCompress.mockReset();
  mockCompress.mockResolvedValue({ ok: true, imageBase64: 'base64' });
  mockShowToast.mockReset();
  mockDeleteAsync.mockReset();
  mockDeleteAsync.mockResolvedValue(undefined);
  mockLaunchImageLibrary.mockReset();
  mockLaunchImageLibrary.mockResolvedValue({ canceled: false, assets: [{ uri: 'file://gallery.jpg' }] });
});

describe('PantryScannerScreen — câmera (CP-C3)', () => {
  it('captura: a foto segue para o mesmo handleAnalyze (compressão e leitura) com o caminho file://', async () => {
    const { getByLabelText } = renderScreen();
    fireEvent.press(getByLabelText('pantryScanner.captureA11yLabel'));

    await waitFor(() => expect(mockReadPantryPhoto).toHaveBeenCalledTimes(1));
    expect(visionCameraState.takePhoto).toHaveBeenCalledWith({ flash: 'off' });
    expect(mockCompress).toHaveBeenCalledWith('file:///tmp/photo.jpg');
    expect(mockReadPantryPhoto).toHaveBeenCalledWith('base64', 'image/jpeg');
  });

  it('dois toques rápidos no disparo tiram uma foto só', async () => {
    let resolvePhoto: (value: { path: string }) => void = () => undefined;
    visionCameraState.takePhoto.mockImplementationOnce(
      () => new Promise((resolve) => {
        resolvePhoto = resolve;
      }),
    );
    const { getByLabelText } = renderScreen();
    const capture = getByLabelText('pantryScanner.captureA11yLabel');
    fireEvent.press(capture);
    fireEvent.press(capture);
    await act(async () => {
      resolvePhoto({ path: '/tmp/photo.jpg' });
      await Promise.resolve();
    });
    await waitFor(() => expect(mockCompress).toHaveBeenCalledTimes(1));
    expect(visionCameraState.takePhoto).toHaveBeenCalledTimes(1);
  });

  it('falha na captura mostra o mesmo toast de antes e não segue', async () => {
    visionCameraState.takePhoto.mockRejectedValueOnce(new Error('capture/unknown'));
    const { getByLabelText } = renderScreen();
    fireEvent.press(getByLabelText('pantryScanner.captureA11yLabel'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('errors.network_internal_server_error'));
    expect(mockCompress).not.toHaveBeenCalled();
  });

  it('permissão negada: mesmo fluxo e textos de hoje', async () => {
    visionCameraState.permission = 'not-determined';
    visionCameraState.requestResult = 'denied';
    const { getByText, queryByText, queryByLabelText } = renderScreen();
    expect(getByText('pantryScanner.permissionTitle')).toBeTruthy();
    expect(queryByLabelText('pantryScanner.captureA11yLabel')).toBeNull();

    fireEvent.press(getByText('pantryScanner.grantPermission'));
    await waitFor(() => expect(getByText('pantryScanner.permissionDenied')).toBeTruthy());
    expect(queryByText('pantryScanner.grantPermission')).toBeNull();
  });

  it('permissão concedida no pedido: abre a câmera', async () => {
    visionCameraState.permission = 'not-determined';
    visionCameraState.requestResult = 'granted';
    const { getByText, getByLabelText } = renderScreen();
    fireEvent.press(getByText('pantryScanner.grantPermission'));
    await waitFor(() => expect(getByLabelText('pantryScanner.captureA11yLabel')).toBeTruthy());
    expect(visionCameraState.lastProps?.isActive).toBe(true);
  });

  it('pausa a câmera sem foco (outra aba/tela) e no fundo; volta ao retornar', () => {
    const listeners: ((state: AppStateStatus) => void)[] = [];
    // Once: o mock do RN para AppState continua valendo nos outros testes.
    jest.spyOn(AppState, 'addEventListener').mockImplementationOnce((_type, listener) => {
      listeners.push(listener);
      return { remove: () => undefined };
    });
    const { navigation } = renderScreen();
    expect(visionCameraState.lastProps?.isActive).toBe(true);

    act(() => navigation.emit('blur'));
    expect(visionCameraState.lastProps?.isActive).toBe(false);
    act(() => navigation.emit('focus'));
    expect(visionCameraState.lastProps?.isActive).toBe(true);

    act(() => listeners.forEach((listener) => listener('background')));
    expect(visionCameraState.lastProps?.isActive).toBe(false);
    act(() => listeners.forEach((listener) => listener('active')));
    expect(visionCameraState.lastProps?.isActive).toBe(true);
  });

  it('Expo Go (sem módulo nativo): aviso na área da câmera e a galeria funciona, sem crash', async () => {
    const spy = jest.spyOn(visionCameraLoader, 'getVisionCamera').mockReturnValue(null);
    const { getByText, getByLabelText, queryByTestId } = renderScreen();

    // Vai direto à captura (sem pedir permissão de uma câmera que não existe).
    expect(getByText('pantryScanner.camera.unavailableInExpoGo')).toBeTruthy();
    expect(queryByTestId('vision-camera')).toBeNull();

    // Disparo sem câmera não faz nada (nem toast de erro).
    fireEvent.press(getByLabelText('pantryScanner.captureA11yLabel'));
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockShowToast).not.toHaveBeenCalled();
    expect(mockCompress).not.toHaveBeenCalled();

    fireEvent.press(getByLabelText('pantryScanner.galleryA11yLabel'));
    await waitFor(() => expect(mockReadPantryPhoto).toHaveBeenCalledTimes(1));
    expect(mockCompress).toHaveBeenCalledWith('file://gallery.jpg');
    spy.mockRestore();
  });
});

// CP-C3a: permissão negada com saída (Ajustes e galeria) e foto temporária apagada.
describe('PantryScannerScreen — permissão negada e foto temporária (CP-C3a)', () => {
  // O AppState do preset do RN já é um jest.fn: mockRestore apagaria a
  // implementação dele para os testes seguintes. Guarda e devolve a original.
  function captureAppStateListeners() {
    const listeners: ((state: AppStateStatus) => void)[] = [];
    const spy = jest.spyOn(AppState, 'addEventListener');
    const original = spy.getMockImplementation();
    spy.mockImplementation((_type, listener) => {
      listeners.push(listener);
      return { remove: () => undefined };
    });
    const restore = () => {
      if (original) spy.mockImplementation(original);
      else spy.mockRestore();
    };
    return { listeners, restore };
  }

  async function renderDenied() {
    visionCameraState.permission = 'denied';
    visionCameraState.requestResult = 'denied';
    const utils = renderScreen();
    fireEvent.press(utils.getByText('pantryScanner.grantPermission'));
    await waitFor(() => expect(utils.getByText('pantryScanner.permissionDenied')).toBeTruthy());
    return utils;
  }

  it('negada: mostra Abrir Ajustes e a galeria, com rótulos de acessibilidade', async () => {
    const { getByLabelText, getByText } = await renderDenied();
    expect(getByText('pantryScanner.openSettings')).toBeTruthy();
    expect(getByLabelText('pantryScanner.openSettingsA11yLabel')).toBeTruthy();
    expect(getByText('pantryScanner.chooseFromGallery')).toBeTruthy();
    expect(getByLabelText('pantryScanner.galleryA11yLabel')).toBeTruthy();
  });

  it('Abrir Ajustes chama Linking.openSettings', async () => {
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    const { getByLabelText } = await renderDenied();
    fireEvent.press(getByLabelText('pantryScanner.openSettingsA11yLabel'));
    expect(openSettings).toHaveBeenCalledTimes(1);
    openSettings.mockRestore();
  });

  it('galeria funciona sem a câmera; se a leitura volta para a captura, a tela de permissão continua', async () => {
    mockReadPantryPhoto.mockResolvedValueOnce({ ...readResult(), noFoodDetected: true });
    const { getByLabelText, getByText, queryByTestId } = await renderDenied();

    fireEvent.press(getByLabelText('pantryScanner.galleryA11yLabel'));
    await waitFor(() => expect(mockReadPantryPhoto).toHaveBeenCalledTimes(1));
    expect(mockCompress).toHaveBeenCalledWith('file://gallery.jpg');

    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('pantryScanner.noFoodDetected'));
    expect(getByText('pantryScanner.permissionDenied')).toBeTruthy();
    expect(queryByTestId('vision-camera')).toBeNull();
    // A foto da galeria é do usuário: nunca apagada.
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });

  it('volta dos Ajustes com a permissão dada: abre a câmera sem sair da tela', async () => {
    const { listeners, restore } = captureAppStateListeners();
    const { getByLabelText, queryByTestId } = await renderDenied();
    expect(queryByTestId('vision-camera')).toBeNull();

    // Voltou sem dar a permissão: continua na tela de permissão.
    act(() => listeners.forEach((listener) => listener('active')));
    expect(queryByTestId('vision-camera')).toBeNull();

    visionCameraState.permission = 'granted';
    act(() => listeners.forEach((listener) => listener('active')));
    await waitFor(() => expect(getByLabelText('pantryScanner.captureA11yLabel')).toBeTruthy());
    expect(queryByTestId('vision-camera')).toBeTruthy();
    expect(visionCameraState.lastProps?.isActive).toBe(true);
    restore();
  });

  it('foto da câmera apagada depois da compressão com sucesso', async () => {
    const { getByLabelText } = renderScreen();
    fireEvent.press(getByLabelText('pantryScanner.captureA11yLabel'));
    await waitFor(() => expect(mockDeleteAsync).toHaveBeenCalledTimes(1));
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///tmp/photo.jpg', { idempotent: true });
    expect(mockCompress.mock.invocationCallOrder[0]).toBeLessThan(mockDeleteAsync.mock.invocationCallOrder[0] ?? 0);
  });

  it('foto da câmera apagada também quando a compressão falha, e o fluxo segue com o toast de hoje', async () => {
    mockCompress.mockResolvedValueOnce({ ok: false, error: { translationKey: 'errors.scanner_image_processing_failed' } });
    const { getByLabelText } = renderScreen();
    fireEvent.press(getByLabelText('pantryScanner.captureA11yLabel'));
    await waitFor(() => expect(mockShowToast).toHaveBeenCalledWith('errors.scanner_image_processing_failed'));
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///tmp/photo.jpg', { idempotent: true });
    expect(mockReadPantryPhoto).not.toHaveBeenCalled();
  });

  it('apagar falhando (arquivo já não existe) não quebra o fluxo', async () => {
    mockDeleteAsync.mockRejectedValueOnce(new Error('not found'));
    mockReadPantryPhoto.mockResolvedValueOnce({
      ...readResult(),
      alcoholAge: 'unknown',
      nextGenerationIsPreview: false,
      ingredients: [{ name: 'banana', confidence: 'high', isAlcoholic: false }],
    });
    const { getByLabelText, findByText } = renderScreen();
    fireEvent.press(getByLabelText('pantryScanner.captureA11yLabel'));
    expect(await findByText('pantryScanner.ingredientsFound')).toBeTruthy();
    expect(mockDeleteAsync).toHaveBeenCalledTimes(1);
    expect(mockShowToast).not.toHaveBeenCalled();
  });

  it('foto da galeria nunca é apagada', async () => {
    const { getByLabelText } = renderScreen();
    fireEvent.press(getByLabelText('pantryScanner.galleryA11yLabel'));
    await waitFor(() => expect(mockReadPantryPhoto).toHaveBeenCalledTimes(1));
    expect(mockDeleteAsync).not.toHaveBeenCalled();
  });
});
