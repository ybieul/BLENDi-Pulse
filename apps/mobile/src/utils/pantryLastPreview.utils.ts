// CP-1.1.4b — última prévia bloqueada do Pantry Scanner guardada no aparelho.
//
// Não existe histórico de scans: as receitas vivem só na tela. Para quem vira
// Pro depois de ver a prévia, o app guarda o id e a validade da última prévia,
// por usuário, e a tela de captura oferece "Receitas do seu último scan". Só o
// id e a validade ficam aqui — nada da receita, que continua no servidor.
//
// Limpa ao: sair da conta, excluir a conta, expirar, desbloqueio responder
// 404, dispensar o aviso e fazer um scan novo depois de ter visto as receitas
// desbloqueadas.

import { createAppStorage } from '../config/storage';

const PANTRY_LAST_PREVIEW_STORAGE_NAMESPACE = 'blendi-pulse';
const PANTRY_LAST_PREVIEW_KEY_PREFIX = 'pantry_last_preview:';

const pantryLastPreviewStorage = createAppStorage(PANTRY_LAST_PREVIEW_STORAGE_NAMESPACE);

export interface PantryLastPreview {
  previewId: string;
  /** ISO 8601, a validade que o backend devolveu (previewExpiresAt). */
  expiresAt: string;
  /** A pessoa já viu as receitas desbloqueadas desta prévia. */
  unlockedSeen: boolean;
}

function storageKey(userId: string): string {
  return `${PANTRY_LAST_PREVIEW_KEY_PREFIX}${userId}`;
}

function parseRecord(serialized: string | undefined): PantryLastPreview | null {
  if (!serialized) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(serialized);

    if (!value || typeof value !== 'object') {
      return null;
    }

    const record = value as Record<string, unknown>;

    if (
      typeof record.previewId !== 'string'
      || record.previewId.length === 0
      || typeof record.expiresAt !== 'string'
      || Number.isNaN(new Date(record.expiresAt).getTime())
    ) {
      return null;
    }

    return {
      previewId: record.previewId,
      expiresAt: record.expiresAt,
      unlockedSeen: record.unlockedSeen === true,
    };
  } catch {
    return null;
  }
}

function writeRecord(userId: string, record: PantryLastPreview): void {
  pantryLastPreviewStorage.set(storageKey(userId), JSON.stringify(record));
}

export function saveLastPantryPreview(
  userId: string,
  preview: { previewId: string; expiresAt: string },
): void {
  writeRecord(userId, { ...preview, unlockedSeen: false });
}

/** Prévia guardada e ainda válida; inválida ou expirada é apagada aqui. */
export function readLastPantryPreview(userId: string, now = Date.now()): PantryLastPreview | null {
  const record = parseRecord(pantryLastPreviewStorage.getString(storageKey(userId)));

  if (!record || new Date(record.expiresAt).getTime() <= now) {
    clearLastPantryPreview(userId);
    return null;
  }

  return record;
}

export function markLastPantryPreviewSeen(userId: string, previewId: string): void {
  const record = parseRecord(pantryLastPreviewStorage.getString(storageKey(userId)));

  if (record?.previewId === previewId && !record.unlockedSeen) {
    writeRecord(userId, { ...record, unlockedSeen: true });
  }
}

/** Scan novo: se as receitas desbloqueadas já foram vistas, a prévia sai. */
export function clearLastPantryPreviewIfSeen(userId: string): void {
  const record = parseRecord(pantryLastPreviewStorage.getString(storageKey(userId)));

  if (record?.unlockedSeen) {
    clearLastPantryPreview(userId);
  }
}

export function clearLastPantryPreview(userId: string): void {
  pantryLastPreviewStorage.delete(storageKey(userId));
}
