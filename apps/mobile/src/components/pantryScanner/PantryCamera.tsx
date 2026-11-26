// apps/mobile/src/components/pantryScanner/PantryCamera.tsx
// CP-C3: câmera do Pantry com react-native-vision-camera v4.
// - Abre em 1x (neutralZoom = lente principal), nunca na ultra-wide.
// - Botões só das lentes que o aparelho tem (cameraZoom.utils).
// - Pinça e tocar para focar na thread de UI (gesture-handler + Reanimated):
//   o zoom vai ao componente nativo por animated props, sem setState por
//   quadro. O React só é avisado quando o botão ativo muda (runOnJS raro).
// - Sem módulo nativo (Expo Go) ou sem câmera: aviso na área da câmera; a
//   galeria (no overlay da tela) continua funcionando.
//
// O overlay da tela (barras, botões) é desenhado por cima via renderOverlay.
// Ele precisa de pointerEvents="box-none" nas áreas vazias para o toque e a
// pinça chegarem à prévia; toques nos botões nunca disparam foco (a prévia
// não é ancestral deles).

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { Camera, CameraDevice, CameraRuntimeError } from 'react-native-vision-camera';
import { borderRadius, colors, fontSizes, fonts, fontWeights, spacing } from '@blendi/shared';

import { useAppTranslation } from '../../hooks/useAppTranslation';
import { useFormatNumbers } from '../../hooks/useFormatNumbers';
import {
  activeLensIndex,
  computeLensStops,
  getZoomBounds,
  pinchZoom,
  selectBackCameraDevice,
  type LensStop,
} from '../../utils/cameraZoom.utils';
import { getVisionCamera, type VisionCamera } from './visionCamera.loader';

// Overlay da câmera sempre escuro e com ícones/textos brancos (CP-C1).
const PREVIEW_BG = colors.overlay.black[100];
const CAMERA_TEXT_COLOR = colors.text.inverse;
const LENS_BAR_BG = colors.overlay.black[45];
const LENS_ACTIVE_BG = colors.overlay.black[82];
const LENS_ACTIVE_BORDER = colors.overlay.white[80];
const NOTICE_BG = colors.overlay.black[55];

const LENS_BUTTON_SIZE = 44;
const LENS_ANIMATION_MS = 220;
const FOCUS_RING_SIZE = 72;
const TAP_MAX_DURATION_MS = 250;

// Erros que impedem a câmera de abrir: mostra o aviso e a galeria. Os de
// captura voltam pela promise do takePhoto (a tela mostra o toast).
const FATAL_ERROR_PREFIXES = ['device/', 'system/', 'permission/', 'format/'];
const FATAL_SESSION_ERRORS = new Set([
  'session/hardware-cost-too-high',
  'session/invalid-output-configuration',
]);

function isFatalCameraError(code: string): boolean {
  return (
    FATAL_SESSION_ERRORS.has(code) || FATAL_ERROR_PREFIXES.some(prefix => code.startsWith(prefix))
  );
}

/** O resto do app (Image.getSize, image-manipulator) espera um URI file://. */
export function toFileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

function readDevices(visionCamera: VisionCamera | null): CameraDevice[] {
  if (!visionCamera) return [];
  try {
    return visionCamera.Camera.getAvailableCameraDevices();
  } catch {
    return [];
  }
}

function makeAnimatedCamera(visionCamera: VisionCamera) {
  return Animated.createAnimatedComponent(visionCamera.Camera);
}
type AnimatedCameraComponent = ReturnType<typeof makeAnimatedCamera>;
// Criado uma vez (fora do render) para o React não remontar a câmera.
let animatedCamera: AnimatedCameraComponent | null = null;
function getAnimatedCamera(visionCamera: VisionCamera): AnimatedCameraComponent {
  animatedCamera ??= makeAnimatedCamera(visionCamera);
  return animatedCamera;
}

export interface PantryCameraHandle {
  /** Tira a foto e devolve o URI file:// (null se a câmera ainda não abriu). */
  takePhoto: () => Promise<string | null>;
}

interface PantryCameraProps {
  /** false pausa a câmera (tela sem foco ou app no fundo). */
  isActive: boolean;
  /** Overlay da tela; recebe os controles da câmera (lentes ou aviso). */
  renderOverlay: (cameraControls: ReactNode) => ReactNode;
}

export const PantryCamera = forwardRef<PantryCameraHandle, PantryCameraProps>(function PantryCamera(
  { isActive, renderOverlay },
  ref
) {
  const { t } = useAppTranslation();
  const visionCamera = useMemo(() => getVisionCamera(), []);
  const [devices, setDevices] = useState<CameraDevice[]>(() => readDevices(visionCamera));
  const [hasFatalError, setHasFatalError] = useState(false);
  const cameraRef = useRef<Camera>(null);
  const isReadyRef = useRef(false);

  // No Android a lista pode chegar vazia na abertura e ser preenchida depois.
  useEffect(() => {
    if (!visionCamera) return undefined;
    try {
      const subscription = visionCamera.Camera.addCameraDevicesChangedListener(setDevices);
      return () => subscription.remove();
    } catch {
      return undefined;
    }
  }, [visionCamera]);

  const device = useMemo(() => selectBackCameraDevice(devices), [devices]);

  useImperativeHandle(
    ref,
    () => ({
      takePhoto: async () => {
        const camera = cameraRef.current;
        if (!camera || !isReadyRef.current) return null;
        const photo = await camera.takePhoto({ flash: 'off' });
        return toFileUri(photo.path);
      },
    }),
    []
  );

  const handleReady = useCallback(() => {
    isReadyRef.current = true;
  }, []);

  const handleError = useCallback((error: CameraRuntimeError) => {
    // Sem log: o erro pode trazer detalhes do aparelho; só decide se a câmera fecha.
    if (isFatalCameraError(error.code)) {
      isReadyRef.current = false;
      setHasFatalError(true);
    }
  }, []);

  if (!visionCamera || !device || hasFatalError) {
    const message = !visionCamera
      ? t('pantryScanner.camera.unavailableInExpoGo')
      : t('pantryScanner.camera.unavailable');
    return (
      <View style={styles.root}>
        {renderOverlay(
          <View
            style={styles.notice}
            testID="pantry-camera-unavailable"
            accessibilityLiveRegion="polite"
          >
            <Ionicons name="camera-outline" size={20} color={CAMERA_TEXT_COLOR} />
            <Text style={styles.noticeText}>{message}</Text>
          </View>
        )}
      </View>
    );
  }

  return (
    <ActiveCamera
      // Outro dispositivo (lista mudou): recomeça em 1x com os limites dele.
      key={device.id}
      visionCamera={visionCamera}
      device={device}
      devices={devices}
      isActive={isActive}
      cameraRef={cameraRef}
      onReady={handleReady}
      onError={handleError}
      renderOverlay={renderOverlay}
    />
  );
});

interface ActiveCameraProps {
  visionCamera: VisionCamera;
  device: CameraDevice;
  devices: CameraDevice[];
  isActive: boolean;
  cameraRef: RefObject<Camera | null>;
  onReady: () => void;
  onError: (error: CameraRuntimeError) => void;
  renderOverlay: (cameraControls: ReactNode) => ReactNode;
}

function ActiveCamera({
  visionCamera,
  device,
  devices,
  isActive,
  cameraRef,
  onReady,
  onError,
  renderOverlay,
}: ActiveCameraProps) {
  const AnimatedCamera = getAnimatedCamera(visionCamera);
  const { minZoom, neutralZoom, maxZoom } = useMemo(() => getZoomBounds(device), [device]);
  const stops = useMemo(() => computeLensStops(device, devices), [device, devices]);
  const stopZooms = useMemo(() => stops.map(stop => stop.zoom), [stops]);
  const supportsFocus = device.supportsFocus;

  // Abre em 1x: neutralZoom é a lente principal (nunca a ultra-wide).
  const zoom = useSharedValue(neutralZoom);
  const pinchStartZoom = useSharedValue(neutralZoom);
  const [activeIndex, setActiveIndex] = useState(() => activeLensIndex(neutralZoom, stopZooms));

  const focusX = useSharedValue(0);
  const focusY = useSharedValue(0);
  const focusOpacity = useSharedValue(0);
  const focusScale = useSharedValue(1);

  // Só cruza para o JS quando o botão ativo muda, nunca a cada quadro.
  useAnimatedReaction(
    () => activeLensIndex(zoom.value, stopZooms),
    (current, previous) => {
      if (previous !== null && current !== previous) {
        runOnJS(setActiveIndex)(current);
      }
    },
    [stopZooms]
  );

  const animatedProps = useAnimatedProps(() => ({ zoom: zoom.value }), [zoom]);

  const focusRingStyle = useAnimatedStyle(() => ({
    opacity: focusOpacity.value,
    transform: [
      { translateX: focusX.value - FOCUS_RING_SIZE / 2 },
      { translateY: focusY.value - FOCUS_RING_SIZE / 2 },
      { scale: focusScale.value },
    ],
  }));

  const focusAt = useCallback(
    (x: number, y: number) => {
      // Aparelho que recusa o foco naquele ponto: ignora em silêncio.
      cameraRef.current?.focus({ x, y }).catch(() => undefined);
    },
    [cameraRef]
  );

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .withTestId('pantry-camera-pinch')
      .onStart(() => {
        'worklet';
        // Continua de onde o zoom estava (botão, animação ou pinça anterior).
        cancelAnimation(zoom);
        pinchStartZoom.value = zoom.value;
      })
      .onUpdate(event => {
        'worklet';
        zoom.value = pinchZoom(pinchStartZoom.value, event.scale, minZoom, maxZoom);
      });

    const tap = Gesture.Tap()
      .withTestId('pantry-camera-tap')
      .maxDuration(TAP_MAX_DURATION_MS)
      .onEnd((event, success) => {
        'worklet';
        if (!success || !supportsFocus) return;
        focusX.value = event.x;
        focusY.value = event.y;
        focusScale.value = withSequence(
          withTiming(1.2, { duration: 0 }),
          withTiming(1, { duration: 200 })
        );
        focusOpacity.value = withSequence(
          withTiming(1, { duration: 80 }),
          withDelay(700, withTiming(0, { duration: 250 }))
        );
        runOnJS(focusAt)(event.x, event.y);
      });

    // Quem ativar primeiro vence: dois dedos viram pinça, um toque curto foca.
    return Gesture.Race(pinch, tap);
  }, [
    focusAt,
    focusOpacity,
    focusScale,
    focusX,
    focusY,
    maxZoom,
    minZoom,
    pinchStartZoom,
    supportsFocus,
    zoom,
  ]);

  const selectLens = useCallback(
    (index: number) => {
      const stop = stops[index];
      if (!stop) return;
      setActiveIndex(index);
      zoom.value = withTiming(stop.zoom, { duration: LENS_ANIMATION_MS });
    },
    [stops, zoom]
  );

  return (
    <GestureHandlerRootView style={styles.root}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} collapsable={false} testID="pantry-camera-preview">
          <AnimatedCamera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={isActive}
            photo
            animatedProps={animatedProps}
            outputOrientation="preview"
            onInitialized={onReady}
            onError={onError}
          />
        </View>
      </GestureDetector>
      <Animated.View
        pointerEvents="none"
        style={[styles.focusRing, focusRingStyle]}
        testID="pantry-focus-ring"
      />
      {renderOverlay(
        stops.length > 0 ? (
          <LensBar stops={stops} activeIndex={activeIndex} onSelect={selectLens} />
        ) : null
      )}
    </GestureHandlerRootView>
  );
}

interface LensBarProps {
  stops: LensStop[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

function LensBar({ stops, activeIndex, onSelect }: LensBarProps) {
  const { t } = useAppTranslation();
  const { formatDecimal } = useFormatNumbers();

  return (
    <View style={styles.lensBar} testID="pantry-lens-bar">
      {stops.map((stop, index) => {
        const isSelected = index === activeIndex;
        const factor = formatDecimal(stop.factor, 1);
        return (
          <Pressable
            key={stop.zoom}
            accessibilityRole="button"
            accessibilityLabel={t('pantryScanner.camera.lensA11yLabel', { factor })}
            accessibilityState={{ selected: isSelected }}
            onPress={() => onSelect(index)}
            style={[styles.lensButton, isSelected && styles.lensButtonActive]}
            testID={`pantry-lens-${index}`}
          >
            <Text style={[styles.lensText, isSelected && styles.lensTextActive]}>
              {t('pantryScanner.camera.lensLabel', { factor })}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: PREVIEW_BG,
  },
  focusRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: FOCUS_RING_SIZE,
    height: FOCUS_RING_SIZE,
    borderRadius: borderRadius.md,
    borderWidth: 1.5,
    borderColor: CAMERA_TEXT_COLOR,
  },
  lensBar: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.xs,
    padding: spacing.xs,
    marginBottom: spacing.md,
    borderRadius: borderRadius.full,
    backgroundColor: LENS_BAR_BG,
  },
  lensButton: {
    width: LENS_BUTTON_SIZE,
    height: LENS_BUTTON_SIZE,
    borderRadius: LENS_BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lensButtonActive: {
    backgroundColor: LENS_ACTIVE_BG,
    // Tamanho fixo (44): a borda só no ativo não desloca o rótulo.
    borderWidth: 1,
    borderColor: LENS_ACTIVE_BORDER,
  },
  lensText: {
    color: CAMERA_TEXT_COLOR,
    fontFamily: fonts.body,
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.medium,
  },
  lensTextActive: {
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.bold,
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: spacing.sm,
    maxWidth: '86%',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: borderRadius.lg,
    backgroundColor: NOTICE_BG,
  },
  noticeText: {
    flexShrink: 1,
    color: CAMERA_TEXT_COLOR,
    fontFamily: fonts.body,
    fontSize: fontSizes.sm,
    lineHeight: 20,
  },
});
