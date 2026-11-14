// CP-1.1.4b — última prévia do Pantry guardada no aparelho: separada por
// usuário, apagada quando expira, quando é inválida, ao limpar e no scan novo
// depois de vista.

const mockBacking = new Map<string, string>();

jest.mock('../config/storage', () => ({
  createAppStorage: () => ({
    getString: (key: string) => mockBacking.get(key),
    set: (key: string, value: string | number | boolean) => {
      mockBacking.set(key, String(value));
    },
    delete: (key: string) => {
      mockBacking.delete(key);
    },
  }),
}));

import {
  clearLastPantryPreview,
  clearLastPantryPreviewIfSeen,
  markLastPantryPreviewSeen,
  readLastPantryPreview,
  saveLastPantryPreview,
} from './pantryLastPreview.utils';

const NOW = Date.parse('2026-11-13T12:00:00.000Z');
const VALID_UNTIL = '2026-11-20T12:00:00.000Z';

beforeEach(() => {
  mockBacking.clear();
});

describe('pantryLastPreview.utils', () => {
  it('guarda por usuário: um não vê a prévia do outro', () => {
    saveLastPantryPreview('user-a', { previewId: 'p-a', expiresAt: VALID_UNTIL });

    expect(readLastPantryPreview('user-a', NOW)).toEqual({
      previewId: 'p-a',
      expiresAt: VALID_UNTIL,
      unlockedSeen: false,
    });
    expect(readLastPantryPreview('user-b', NOW)).toBeNull();

    clearLastPantryPreview('user-b');
    expect(readLastPantryPreview('user-a', NOW)).not.toBeNull();
  });

  it('só guarda id e validade, nada da receita', () => {
    saveLastPantryPreview('user-a', { previewId: 'p-a', expiresAt: VALID_UNTIL });

    const stored = [...mockBacking.values()];
    expect(stored).toHaveLength(1);
    expect(JSON.parse(stored[0] ?? '{}')).toEqual({
      previewId: 'p-a',
      expiresAt: VALID_UNTIL,
      unlockedSeen: false,
    });
  });

  it('expirada é apagada na leitura', () => {
    saveLastPantryPreview('user-a', { previewId: 'p-a', expiresAt: '2026-11-13T11:59:59.000Z' });

    expect(readLastPantryPreview('user-a', NOW)).toBeNull();
    expect(mockBacking.size).toBe(0);
  });

  it('registro inválido é apagado na leitura', () => {
    mockBacking.set('pantry_last_preview:user-a', '{not json');
    expect(readLastPantryPreview('user-a', NOW)).toBeNull();
    expect(mockBacking.size).toBe(0);

    mockBacking.set('pantry_last_preview:user-a', JSON.stringify({ previewId: 'p', expiresAt: 'ontem' }));
    expect(readLastPantryPreview('user-a', NOW)).toBeNull();
    expect(mockBacking.size).toBe(0);
  });

  it('scan novo só limpa depois de ver as receitas desbloqueadas', () => {
    saveLastPantryPreview('user-a', { previewId: 'p-a', expiresAt: VALID_UNTIL });

    clearLastPantryPreviewIfSeen('user-a');
    expect(readLastPantryPreview('user-a', NOW)).not.toBeNull();

    // Marcar outra prévia não conta.
    markLastPantryPreviewSeen('user-a', 'p-outra');
    clearLastPantryPreviewIfSeen('user-a');
    expect(readLastPantryPreview('user-a', NOW)).not.toBeNull();

    markLastPantryPreviewSeen('user-a', 'p-a');
    expect(readLastPantryPreview('user-a', NOW)?.unlockedSeen).toBe(true);
    clearLastPantryPreviewIfSeen('user-a');
    expect(readLastPantryPreview('user-a', NOW)).toBeNull();
  });

  it('prévia nova substitui a anterior e volta a "não vista"', () => {
    saveLastPantryPreview('user-a', { previewId: 'p-1', expiresAt: VALID_UNTIL });
    markLastPantryPreviewSeen('user-a', 'p-1');
    saveLastPantryPreview('user-a', { previewId: 'p-2', expiresAt: VALID_UNTIL });

    expect(readLastPantryPreview('user-a', NOW)).toEqual({
      previewId: 'p-2',
      expiresAt: VALID_UNTIL,
      unlockedSeen: false,
    });
  });
});
