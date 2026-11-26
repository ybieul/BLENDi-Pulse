// apps/mobile/src/utils/cameraZoom.utils.ts
// CP-C3: escolha do dispositivo traseiro, lentes (botões 0.5x/1x/3x…) e
// limites do zoom da câmera do Pantry (react-native-vision-camera v4).
//
// Escala do zoom no vision-camera v4:
// - iOS: fator bruto do AVFoundation. Num dispositivo virtual com ultra-wide
//   (ex.: "Triple Camera" do iPhone Pro), minZoom = 1 É a ultra-wide e
//   neutralZoom (ex.: 2) é a lente principal. Por isso a câmera abria em 0.5x.
// - Android: neutralZoom é sempre 1; minZoom < 1 quando a câmera lógica
//   inclui a ultra-wide.
// O fator mostrado ao usuário é sempre zoom / neutralZoom (1x = lente principal).
//
// As funções com 'worklet' rodam na thread de UI durante a pinça.

import type { CameraDevice } from 'react-native-vision-camera';

/** Maior fator visível (relativo ao 1x) para foto de despensa. */
export const MAX_VISIBLE_ZOOM_FACTOR = 10;

/** Botão de lente: rótulo relativo ao 1x e o valor de zoom do dispositivo. */
export interface LensStop {
  factor: number;
  zoom: number;
}

export interface ZoomBounds {
  minZoom: number;
  neutralZoom: number;
  maxZoom: number;
}

const ZOOM_EPSILON = 0.01;
// Abaixo disso a "teleobjetiva" não justifica um botão (ruído do FOV).
const MIN_TELEPHOTO_RATIO = 1.5;

function isPositiveFinite(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

/**
 * Dispositivo traseiro com zoom contínuo entre as lentes: o que inclui a lente
 * principal e tem mais lentes físicas (virtual multi-lente quando existir);
 * empate: hardware 'full'. Sem lente principal listada, o primeiro traseiro.
 */
export function selectBackCameraDevice(devices: readonly CameraDevice[]): CameraDevice | undefined {
  const back = devices.filter(device => device.position === 'back');
  const withWide = back.filter(device => device.physicalDevices.includes('wide-angle-camera'));
  const candidates = withWide.length > 0 ? withWide : back;

  let best: CameraDevice | undefined;
  for (const device of candidates) {
    if (!best) {
      best = device;
      continue;
    }
    const lensDiff = device.physicalDevices.length - best.physicalDevices.length;
    const fullDiff =
      Number(device.hardwareLevel === 'full') - Number(best.hardwareLevel === 'full');
    if (lensDiff > 0 || (lensDiff === 0 && fullDiff > 0)) {
      best = device;
    }
  }
  return best;
}

/** Limites do zoom: respeita o aparelho e corta em MAX_VISIBLE_ZOOM_FACTOR. */
export function getZoomBounds(device: CameraDevice): ZoomBounds {
  const neutralZoom = isPositiveFinite(device.neutralZoom) ? device.neutralZoom : 1;
  const deviceMin = isPositiveFinite(device.minZoom) ? device.minZoom : neutralZoom;
  const deviceMax = isPositiveFinite(device.maxZoom) ? device.maxZoom : neutralZoom;

  const minZoom = Math.min(deviceMin, neutralZoom);
  const maxZoom = Math.max(neutralZoom, Math.min(deviceMax, neutralZoom * MAX_VISIBLE_ZOOM_FACTOR));
  return { minZoom, neutralZoom, maxZoom };
}

function maxFieldOfView(device: CameraDevice): number {
  let fov = 0;
  for (const format of device.formats) {
    if (isPositiveFinite(format.fieldOfView) && format.fieldOfView > fov) {
      fov = format.fieldOfView;
    }
  }
  return fov;
}

function singleLens(
  devices: readonly CameraDevice[],
  type: CameraDevice['physicalDevices'][number]
) {
  return devices.find(
    device =>
      device.position === 'back' &&
      device.physicalDevices.length === 1 &&
      device.physicalDevices[0] === type
  );
}

/**
 * Aumento da teleobjetiva em relação à lente principal, pelo campo de visão
 * das lentes físicas (o v4 não expõe os pontos de troca de lente).
 * Arredondado para 0,5 como o app de câmera do sistema (2x, 2.5x, 3x, 5x).
 */
export function getTelephotoFactor(devices: readonly CameraDevice[]): number | null {
  const wide = singleLens(devices, 'wide-angle-camera');
  const tele = singleLens(devices, 'telephoto-camera');
  if (!wide || !tele) return null;

  const wideFov = maxFieldOfView(wide);
  const teleFov = maxFieldOfView(tele);
  if (!wideFov || !teleFov || teleFov >= wideFov) return null;

  const toHalfTan = (degrees: number) => Math.tan((degrees * Math.PI) / 360);
  const ratio = toHalfTan(wideFov) / toHalfTan(teleFov);
  if (!Number.isFinite(ratio) || ratio < MIN_TELEPHOTO_RATIO) return null;

  return Math.round(ratio * 2) / 2;
}

/**
 * Botões de lente que o aparelho tem, em ordem crescente. Um botão só existe
 * se o zoom do dispositivo escolhido alcança aquela lente sem trocar de
 * câmera. Uma lente só (ou só a principal alcançável): lista vazia, sem botões.
 */
export function computeLensStops(
  device: CameraDevice,
  allDevices: readonly CameraDevice[]
): LensStop[] {
  const { minZoom, neutralZoom, maxZoom } = getZoomBounds(device);
  const stops: LensStop[] = [];

  // Zoom abaixo do neutro só existe quando há uma lente mais aberta (ultra-wide).
  if (minZoom < neutralZoom - ZOOM_EPSILON) {
    const factor = Math.round((minZoom / neutralZoom) * 10) / 10;
    stops.push({ factor: Math.max(factor, 0.1), zoom: minZoom });
  }

  stops.push({ factor: 1, zoom: neutralZoom });

  if (device.physicalDevices.includes('telephoto-camera')) {
    const teleFactor = getTelephotoFactor(allDevices);
    const teleZoom = teleFactor ? neutralZoom * teleFactor : null;
    if (teleFactor && teleZoom && teleZoom <= maxZoom + ZOOM_EPSILON) {
      stops.push({ factor: teleFactor, zoom: Math.min(teleZoom, maxZoom) });
    }
  }

  return stops.length > 1 ? stops : [];
}

export function clampZoom(zoom: number, minZoom: number, maxZoom: number): number {
  'worklet';
  return Math.min(Math.max(zoom, minZoom), maxZoom);
}

/** Zoom da pinça: continua do zoom do início do gesto, multiplicado pela escala. */
export function pinchZoom(
  startZoom: number,
  scale: number,
  minZoom: number,
  maxZoom: number
): number {
  'worklet';
  if (!Number.isFinite(scale) || scale <= 0) {
    return clampZoom(startZoom, minZoom, maxZoom);
  }
  return clampZoom(startZoom * scale, minZoom, maxZoom);
}

/** Índice do botão ativo: a maior lente cujo zoom já foi alcançado. */
export function activeLensIndex(zoom: number, stopZooms: readonly number[]): number {
  'worklet';
  let index = 0;
  for (let i = 0; i < stopZooms.length; i += 1) {
    const stopZoom = stopZooms[i];
    if (stopZoom !== undefined && zoom >= stopZoom - ZOOM_EPSILON) {
      index = i;
    }
  }
  return index;
}
