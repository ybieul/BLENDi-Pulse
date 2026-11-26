// apps/mobile/src/testUtils/visionCameraMock.tsx
// CP-C3: mock do react-native-vision-camera para os testes do Pantry.
// Uso: jest.mock('react-native-vision-camera', () => require('../testUtils/visionCameraMock').createVisionCameraMock())
// e controle o aparelho/permissão por `visionCameraState` antes do render.

import { Component } from 'react';
import { View } from 'react-native';
import type { CameraDevice, PhysicalCameraDeviceType } from 'react-native-vision-camera';

type PermissionStatus = 'granted' | 'not-determined' | 'denied' | 'restricted';

interface MockCameraProps {
  zoom?: number;
  isActive?: boolean;
  onInitialized?: () => void;
  [key: string]: unknown;
}

// Padrão: permissão concedida e um aparelho de 1 lente (sem botões de lente).
export const visionCameraState = {
  devices: [fakeDevice()],
  permission: 'granted' as PermissionStatus,
  requestResult: 'granted' as 'granted' | 'denied',
  takePhoto: jest.fn<Promise<{ path: string }>, [unknown]>(() => Promise.resolve({ path: '/tmp/photo.jpg' })),
  focus: jest.fn<Promise<void>, [{ x: number; y: number }]>(() => Promise.resolve()),
  renderCount: 0,
  lastProps: null as MockCameraProps | null,
};

export function resetVisionCameraState(devices: CameraDevice[] = [fakeDevice()]): void {
  visionCameraState.devices = devices;
  visionCameraState.permission = 'granted';
  visionCameraState.requestResult = 'granted';
  visionCameraState.takePhoto.mockReset();
  visionCameraState.takePhoto.mockResolvedValue({ path: '/tmp/photo.jpg' });
  visionCameraState.focus.mockReset();
  visionCameraState.focus.mockResolvedValue(undefined);
  visionCameraState.renderCount = 0;
  visionCameraState.lastProps = null;
}

interface FakeDeviceOptions {
  id?: string;
  physicalDevices?: PhysicalCameraDeviceType[];
  minZoom?: number;
  maxZoom?: number;
  neutralZoom?: number;
  supportsFocus?: boolean;
  fieldOfView?: number;
  /** CP-C3a: padrão = mais de uma lente física. */
  isMultiCam?: boolean;
}

/** Dispositivo traseiro falso; padrão: uma lente (wide), sem botões de lente. */
export function fakeDevice(options: FakeDeviceOptions = {}): CameraDevice {
  const physicalDevices = options.physicalDevices ?? ['wide-angle-camera'];
  return {
    id: options.id ?? physicalDevices.join('+'),
    position: 'back',
    physicalDevices,
    minZoom: options.minZoom ?? 1,
    maxZoom: options.maxZoom ?? 16,
    neutralZoom: options.neutralZoom ?? 1,
    supportsFocus: options.supportsFocus ?? true,
    hardwareLevel: 'full',
    isMultiCam: options.isMultiCam ?? physicalDevices.length > 1,
    formats: [{ fieldOfView: options.fieldOfView ?? 70 }],
  } as unknown as CameraDevice;
}

// Campos de visão aproximados de um iPhone Pro (graus): 13 mm, 24 mm e 77 mm (3x).
export const IPHONE_FOV = { ultraWide: 106, wide: 73.7, telephoto: 26.2 } as const;

/** iPhone Pro com 3 lentes: a "Triple Camera" (min 1 = 0.5x, neutral 2) + as lentes físicas. */
export function iPhoneTripleDevices(): CameraDevice[] {
  return [
    fakeDevice({ id: 'wide', physicalDevices: ['wide-angle-camera'], fieldOfView: IPHONE_FOV.wide, maxZoom: 120 }),
    fakeDevice({ id: 'ultra', physicalDevices: ['ultra-wide-angle-camera'], fieldOfView: IPHONE_FOV.ultraWide }),
    fakeDevice({ id: 'tele', physicalDevices: ['telephoto-camera'], fieldOfView: IPHONE_FOV.telephoto }),
    fakeDevice({
      id: 'triple',
      physicalDevices: ['ultra-wide-angle-camera', 'wide-angle-camera', 'telephoto-camera'],
      minZoom: 1,
      neutralZoom: 2,
      maxZoom: 123.75,
      fieldOfView: IPHONE_FOV.ultraWide,
    }),
  ];
}

/** Celular com 2 lentes (ultra-wide + principal), como um iPhone sem teleobjetiva. */
export function dualWideDevices(): CameraDevice[] {
  return [
    fakeDevice({ id: 'wide', physicalDevices: ['wide-angle-camera'], fieldOfView: IPHONE_FOV.wide }),
    fakeDevice({ id: 'ultra', physicalDevices: ['ultra-wide-angle-camera'], fieldOfView: IPHONE_FOV.ultraWide }),
    fakeDevice({
      id: 'dual-wide',
      physicalDevices: ['ultra-wide-angle-camera', 'wide-angle-camera'],
      minZoom: 1,
      neutralZoom: 2,
      maxZoom: 95.6,
    }),
  ];
}

export function createVisionCameraMock() {
  class Camera extends Component<MockCameraProps> {
    static getAvailableCameraDevices = () => visionCameraState.devices;
    static addCameraDevicesChangedListener = () => ({ remove: () => undefined });
    static getCameraPermissionStatus = () => visionCameraState.permission;
    static requestCameraPermission = () => Promise.resolve(visionCameraState.requestResult);

    takePhoto(options: unknown) {
      return visionCameraState.takePhoto(options);
    }

    focus(point: { x: number; y: number }) {
      return visionCameraState.focus(point);
    }

    componentDidMount() {
      this.props.onInitialized?.();
    }

    render() {
      visionCameraState.renderCount += 1;
      visionCameraState.lastProps = this.props;
      return <View testID="vision-camera" />;
    }
  }

  return { Camera };
}
