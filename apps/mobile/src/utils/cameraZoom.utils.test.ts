// CP-C3: dispositivo, lentes e limites do zoom da câmera do Pantry.

import {
  MAX_VISIBLE_ZOOM_FACTOR,
  activeLensIndex,
  clampZoom,
  computeLensStops,
  getTelephotoFactor,
  getZoomBounds,
  pinchZoom,
  selectBackCameraDevice,
} from './cameraZoom.utils';
import { dualWideDevices, fakeDevice, iPhoneTripleDevices, IPHONE_FOV } from '../testUtils/visionCameraMock';

function pick(devices: ReturnType<typeof iPhoneTripleDevices>) {
  const device = selectBackCameraDevice(devices);
  if (!device) throw new Error('sem dispositivo');
  return device;
}

describe('selectBackCameraDevice', () => {
  it('prefere o dispositivo virtual com mais lentes (zoom contínuo)', () => {
    expect(pick(iPhoneTripleDevices()).id).toBe('triple');
    expect(pick(dualWideDevices()).id).toBe('dual-wide');
  });

  it('ignora a câmera frontal e usa a lente principal quando é a única', () => {
    const front = { ...fakeDevice({ id: 'front' }), position: 'front' as const };
    expect(pick([front, fakeDevice({ id: 'main' })]).id).toBe('main');
  });

  it('nunca escolhe a ultra-wide sozinha quando há uma lente principal', () => {
    const devices = [
      fakeDevice({ id: 'ultra', physicalDevices: ['ultra-wide-angle-camera'] }),
      fakeDevice({ id: 'main', physicalDevices: ['wide-angle-camera'] }),
    ];
    expect(pick(devices).id).toBe('main');
  });

  it('sem câmera traseira: undefined', () => {
    expect(selectBackCameraDevice([])).toBeUndefined();
  });
});

describe('getZoomBounds', () => {
  it('abre no neutro e corta o máximo em 10x do 1x', () => {
    const triple = pick(iPhoneTripleDevices());
    expect(getZoomBounds(triple)).toEqual({ minZoom: 1, neutralZoom: 2, maxZoom: 2 * MAX_VISIBLE_ZOOM_FACTOR });
  });

  it('respeita o máximo do aparelho quando é menor que 10x', () => {
    expect(getZoomBounds(fakeDevice({ maxZoom: 4 })).maxZoom).toBe(4);
  });

  it('valores inválidos do aparelho caem no neutro, sem NaN', () => {
    const broken = fakeDevice({ minZoom: Number.NaN, maxZoom: 0, neutralZoom: Number.NaN });
    expect(getZoomBounds(broken)).toEqual({ minZoom: 1, neutralZoom: 1, maxZoom: 1 });
  });
});

describe('computeLensStops', () => {
  it('iPhone Pro com 3 lentes: 0.5x, 1x e 3x nos zooms certos', () => {
    const devices = iPhoneTripleDevices();
    expect(computeLensStops(pick(devices), devices)).toEqual([
      { factor: 0.5, zoom: 1 },
      { factor: 1, zoom: 2 },
      { factor: 3, zoom: 6 },
    ]);
  });

  it('2 lentes (ultra-wide + principal): 0.5x e 1x', () => {
    const devices = dualWideDevices();
    expect(computeLensStops(pick(devices), devices)).toEqual([
      { factor: 0.5, zoom: 1 },
      { factor: 1, zoom: 2 },
    ]);
  });

  it('1 lente: sem botões', () => {
    const devices = [fakeDevice()];
    expect(computeLensStops(pick(devices), devices)).toEqual([]);
  });

  it('Android com ultra-wide na câmera lógica (neutro 1, mínimo 0.6): 0.6x e 1x', () => {
    const logical = fakeDevice({
      id: '0',
      physicalDevices: ['ultra-wide-angle-camera', 'wide-angle-camera'],
      minZoom: 0.6,
      neutralZoom: 1,
      maxZoom: 8,
    });
    expect(computeLensStops(logical, [logical])).toEqual([
      { factor: 0.6, zoom: 0.6 },
      { factor: 1, zoom: 1 },
    ]);
  });

  it('teleobjetiva sem a lente física listada (não dá para medir): sem botão de tele', () => {
    const logical = fakeDevice({
      id: '0',
      physicalDevices: ['wide-angle-camera', 'telephoto-camera'],
      maxZoom: 30,
    });
    expect(computeLensStops(logical, [logical])).toEqual([]);
  });

  it('teleobjetiva além do limite de 10x fica sem botão', () => {
    const devices = [
      fakeDevice({ id: 'wide', fieldOfView: IPHONE_FOV.wide }),
      fakeDevice({ id: 'tele', physicalDevices: ['telephoto-camera'], fieldOfView: 4 }),
      fakeDevice({ id: 'dual', physicalDevices: ['wide-angle-camera', 'telephoto-camera'], maxZoom: 200 }),
    ];
    expect(computeLensStops(pick(devices), devices)).toEqual([]);
  });
});

describe('getTelephotoFactor', () => {
  it('arredonda para 0,5 como o app de câmera (5x de um 120 mm)', () => {
    const devices = [
      fakeDevice({ id: 'wide', fieldOfView: IPHONE_FOV.wide }),
      fakeDevice({ id: 'tele', physicalDevices: ['telephoto-camera'], fieldOfView: 16.4 }),
    ];
    expect(getTelephotoFactor(devices)).toBe(5);
  });

  it('campo de visão ausente ou maior que o da principal: null', () => {
    const devices = [
      fakeDevice({ id: 'wide', fieldOfView: IPHONE_FOV.wide }),
      fakeDevice({ id: 'tele', physicalDevices: ['telephoto-camera'], fieldOfView: 0 }),
    ];
    expect(getTelephotoFactor(devices)).toBeNull();
  });
});

describe('pinça', () => {
  it('multiplica o zoom do início do gesto pela escala', () => {
    expect(pinchZoom(2, 1.5, 1, 20)).toBe(3);
  });

  it('nunca passa dos limites', () => {
    expect(pinchZoom(2, 100, 1, 20)).toBe(20);
    expect(pinchZoom(2, 0.01, 1, 20)).toBe(1);
  });

  it('escala inválida mantém o zoom', () => {
    expect(pinchZoom(2, Number.NaN, 1, 20)).toBe(2);
    expect(pinchZoom(2, 0, 1, 20)).toBe(2);
    expect(clampZoom(50, 1, 20)).toBe(20);
  });
});

describe('activeLensIndex', () => {
  const zooms = [1, 2, 6];
  it('destaca a maior lente já alcançada', () => {
    expect(activeLensIndex(1, zooms)).toBe(0);
    expect(activeLensIndex(1.9, zooms)).toBe(0);
    expect(activeLensIndex(2, zooms)).toBe(1);
    expect(activeLensIndex(5.9, zooms)).toBe(1);
    expect(activeLensIndex(20, zooms)).toBe(2);
  });
});
