// CP-C3: câmera do Pantry (vision-camera + gestos + Reanimated).

import { act, fireEvent, render } from '@testing-library/react-native';
import { createRef, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { State } from 'react-native-gesture-handler';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';

jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({
    t: (key: string, options?: Record<string, unknown>) => (options ? `${key}:${JSON.stringify(options)}` : key),
    locale: 'en',
  }),
}));

jest.mock('react-native-vision-camera', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call -- factory do jest.mock não pode usar import do topo
  require('../../testUtils/visionCameraMock').createVisionCameraMock(),
);

import { PantryCamera, type PantryCameraHandle } from './PantryCamera';
import * as visionCameraLoader from './visionCamera.loader';
import { resetVisionCameraForTests } from './visionCamera.loader';
import {
  dualWideDevices,
  fakeDevice,
  iPhoneTripleDevices,
  resetVisionCameraState,
  visionCameraState,
} from '../../testUtils/visionCameraMock';

// O overlay da tela: um botão (como fechar/galeria/disparo) e os controles da câmera.
const overlayPress = jest.fn();
function renderOverlay(cameraControls: ReactNode) {
  return (
    <View pointerEvents="box-none">
      <Pressable accessibilityRole="button" accessibilityLabel="overlay-button" onPress={overlayPress}>
        <Text>overlay</Text>
      </Pressable>
      {cameraControls}
    </View>
  );
}

function renderCamera(isActive = true) {
  const ref = createRef<PantryCameraHandle>();
  const utils = render(<PantryCamera ref={ref} isActive={isActive} renderOverlay={renderOverlay} />);
  const rerender = (active = isActive) =>
    utils.rerender(<PantryCamera ref={ref} isActive={active} renderOverlay={renderOverlay} />);
  return { ...utils, ref, rerenderCamera: rerender };
}

function currentZoom(): number | undefined {
  const animatedProps = visionCameraState.lastProps?.animatedProps as { zoom?: number } | undefined;
  return animatedProps?.zoom;
}

function pinch(scale: number) {
  fireGestureHandler(getByGestureTestId('pantry-camera-pinch'), [
    { state: State.BEGAN, scale: 1 },
    { state: State.ACTIVE, scale: 1 },
    { state: State.ACTIVE, scale: (1 + scale) / 2 },
    { state: State.ACTIVE, scale },
    { state: State.END, scale },
  ]);
}

function tap(x: number, y: number) {
  fireGestureHandler(getByGestureTestId('pantry-camera-tap'), [
    { state: State.BEGAN, x, y },
    { state: State.ACTIVE, x, y },
    { state: State.END, x, y },
  ]);
}

beforeEach(() => {
  resetVisionCameraForTests();
  resetVisionCameraState();
  overlayPress.mockClear();
});

describe('PantryCamera — abertura e lentes', () => {
  it('abre em neutralZoom (1x da lente principal), nunca na ultra-wide', () => {
    visionCameraState.devices = iPhoneTripleDevices();
    renderCamera();
    expect(visionCameraState.lastProps?.device).toMatchObject({ id: 'triple' });
    expect(currentZoom()).toBe(2);
  });

  it('aparelho com 1 lente: sem botões de lente', () => {
    visionCameraState.devices = [fakeDevice()];
    const { queryByTestId } = renderCamera();
    expect(queryByTestId('pantry-lens-bar')).toBeNull();
    expect(currentZoom()).toBe(1);
  });

  it('aparelho com 2 lentes: 0.5x e 1x, 1x ativo', () => {
    visionCameraState.devices = dualWideDevices();
    const { getAllByLabelText, getByTestId } = renderCamera();
    expect(getByTestId('pantry-lens-bar')).toBeTruthy();
    const buttons = getAllByLabelText(/pantryScanner\.camera\.lensA11yLabel/);
    expect(buttons.map((button) => button.props.accessibilityLabel as string)).toEqual([
      'pantryScanner.camera.lensA11yLabel:{"factor":"0.5"}',
      'pantryScanner.camera.lensA11yLabel:{"factor":"1"}',
    ]);
    expect(getByTestId('pantry-lens-1').props.accessibilityState).toEqual({ selected: true });
    expect(getByTestId('pantry-lens-0').props.accessibilityState).toEqual({ selected: false });
  });

  it('aparelho com 3 lentes: 0.5x, 1x e 3x', () => {
    visionCameraState.devices = iPhoneTripleDevices();
    const { getByText } = renderCamera();
    expect(getByText('pantryScanner.camera.lensLabel:{"factor":"0.5"}')).toBeTruthy();
    expect(getByText('pantryScanner.camera.lensLabel:{"factor":"1"}')).toBeTruthy();
    expect(getByText('pantryScanner.camera.lensLabel:{"factor":"3"}')).toBeTruthy();
  });

  it('tocar num botão de lente leva o zoom ao fator e destaca o botão', () => {
    visionCameraState.devices = iPhoneTripleDevices();
    const { getByTestId } = renderCamera();
    fireEvent.press(getByTestId('pantry-lens-2'));
    expect(currentZoom()).toBe(6);
    expect(getByTestId('pantry-lens-2').props.accessibilityState).toEqual({ selected: true });

    fireEvent.press(getByTestId('pantry-lens-0'));
    expect(currentZoom()).toBe(1);
    expect(getByTestId('pantry-lens-0').props.accessibilityState).toEqual({ selected: true });
  });

  it('a câmera recebe isActive (pausa sem foco/no fundo)', () => {
    const { rerenderCamera } = renderCamera(true);
    expect(visionCameraState.lastProps?.isActive).toBe(true);
    rerenderCamera(false);
    expect(visionCameraState.lastProps?.isActive).toBe(false);
  });

  it('pede foto, sem microfone/vídeo, orientação da prévia (retrato)', () => {
    renderCamera();
    expect(visionCameraState.lastProps).toMatchObject({ photo: true, outputOrientation: 'preview' });
    expect(visionCameraState.lastProps?.video).toBeUndefined();
    expect(visionCameraState.lastProps?.audio).toBeUndefined();
    expect(visionCameraState.lastProps?.frameProcessor).toBeUndefined();
  });
});

describe('PantryCamera — pinça', () => {
  it('não renderiza o React durante a pinça e respeita o máximo (10x do 1x)', () => {
    visionCameraState.devices = iPhoneTripleDevices();
    const { rerenderCamera } = renderCamera();
    const rendersBefore = visionCameraState.renderCount;

    pinch(100);
    // Nenhum render: o zoom foi para a câmera pela thread de UI (animated props).
    expect(visionCameraState.renderCount).toBe(rendersBefore);

    rerenderCamera();
    expect(currentZoom()).toBe(20);
  });

  it('respeita o mínimo do aparelho', () => {
    visionCameraState.devices = iPhoneTripleDevices();
    const { rerenderCamera } = renderCamera();
    pinch(0.01);
    rerenderCamera();
    expect(currentZoom()).toBe(1);
  });

  it('continua do zoom do botão escolhido', () => {
    visionCameraState.devices = iPhoneTripleDevices();
    const { getByTestId, rerenderCamera } = renderCamera();
    fireEvent.press(getByTestId('pantry-lens-2'));
    pinch(1.5);
    rerenderCamera();
    expect(currentZoom()).toBe(9);
  });
});

describe('PantryCamera — tocar para focar', () => {
  it('toque na prévia chama focus no ponto tocado', async () => {
    renderCamera();
    tap(120, 340);
    await act(async () => {
      await Promise.resolve();
    });
    expect(visionCameraState.focus).toHaveBeenCalledWith({ x: 120, y: 340 });
  });

  it('tocar num botão do overlay ou de lente não foca', () => {
    visionCameraState.devices = iPhoneTripleDevices();
    const { getByLabelText, getByTestId } = renderCamera();
    fireEvent.press(getByLabelText('overlay-button'));
    fireEvent.press(getByTestId('pantry-lens-0'));
    expect(overlayPress).toHaveBeenCalledTimes(1);
    expect(visionCameraState.focus).not.toHaveBeenCalled();
  });

  it('aparelho sem foco por toque: ignora em silêncio', () => {
    visionCameraState.devices = [fakeDevice({ supportsFocus: false })];
    renderCamera();
    expect(() => tap(10, 10)).not.toThrow();
    expect(visionCameraState.focus).not.toHaveBeenCalled();
  });

  it('foco recusado pelo aparelho não vira erro', async () => {
    visionCameraState.focus.mockRejectedValueOnce(new Error('focus/not-supported'));
    renderCamera();
    tap(10, 10);
    await act(async () => {
      await Promise.resolve();
    });
    expect(visionCameraState.focus).toHaveBeenCalledTimes(1);
  });
});

describe('PantryCamera — foto', () => {
  it('takePhoto devolve o caminho com file:// e flash desligado', async () => {
    const { ref } = renderCamera();
    const uri = await ref.current?.takePhoto();
    expect(uri).toBe('file:///tmp/photo.jpg');
    expect(visionCameraState.takePhoto).toHaveBeenCalledWith({ flash: 'off' });
  });

  it('caminho que já vem com file:// não ganha prefixo duplicado', async () => {
    visionCameraState.takePhoto.mockResolvedValueOnce({ path: 'file:///data/photo.jpg' });
    const { ref } = renderCamera();
    await expect(ref.current?.takePhoto()).resolves.toBe('file:///data/photo.jpg');
  });
});

describe('PantryCamera — câmera indisponível', () => {
  it('sem módulo nativo (Expo Go): mostra o aviso e mantém o overlay', () => {
    const spy = jest.spyOn(visionCameraLoader, 'getVisionCamera').mockReturnValue(null);
    const { getByTestId, getByText, getByLabelText, queryByTestId } = renderCamera();
    expect(getByTestId('pantry-camera-unavailable')).toBeTruthy();
    expect(getByText('pantryScanner.camera.unavailableInExpoGo')).toBeTruthy();
    expect(queryByTestId('vision-camera')).toBeNull();
    fireEvent.press(getByLabelText('overlay-button'));
    expect(overlayPress).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it('sem câmera traseira: aviso de câmera indisponível', () => {
    visionCameraState.devices = [];
    const { getByText } = renderCamera();
    expect(getByText('pantryScanner.camera.unavailable')).toBeTruthy();
  });

  it('erro fatal da câmera (ex.: em uso por outro app): aviso, sem crash', () => {
    const { getByText, queryByTestId } = renderCamera();
    const onError = visionCameraState.lastProps?.onError as (error: { code: string }) => void;
    act(() => onError({ code: 'device/camera-already-in-use' }));
    expect(getByText('pantryScanner.camera.unavailable')).toBeTruthy();
    expect(queryByTestId('vision-camera')).toBeNull();
  });

  it('erro não fatal mantém a câmera aberta', () => {
    const { queryByTestId } = renderCamera();
    const onError = visionCameraState.lastProps?.onError as (error: { code: string }) => void;
    act(() => onError({ code: 'session/camera-not-ready' }));
    expect(queryByTestId('vision-camera')).toBeTruthy();
  });
});
