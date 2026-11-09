// apps/api/src/utils/blenderOwnership.utils.ts
// Regras de coerência entre blendiModel, blendiOwnership e otherBlenderModel
// aplicadas em PATCH /users/me (updateMe). Ficam no backend para não depender
// do app mandar o payload certo:
//
//   1. blendiOwnership 'other' ou 'none' → blendiModel gravado é sempre 'Lite'
//      (limites mais conservadores de BLENDER_LIMITS), mesmo que o PATCH traga
//      outro modelo.
//   2. blendiOwnership 'blendi' ou 'none' → otherBlenderModel é limpo.
//   3. blendiModel sem blendiOwnership → o usuário escolheu um BLENDi real:
//      blendiOwnership vira 'blendi' e otherBlenderModel é limpo.
//
// otherBlenderModel sozinho (sem posse nem modelo no PATCH) só é gravado se a
// posse já salva for 'other' — senão é ignorado, para nunca deixar texto de
// "outro modelo" numa conta marcada como 'blendi'/'none'.
//
// Concorrência: a posse salva é lida ANTES do update, então outra requisição
// pode trocá-la no meio (ex.: 'other' -> 'none') e o texto seria gravado numa
// conta que já não é 'other' (achado RACE01 do pentest do CP-1.1.1a, 5 de 6
// rodadas reproduziam ao vivo). Por isso a escrita de texto-solo NÃO vai no
// mesmo $set do update principal: sai em `onlyIfOwnershipIsOther`, que o
// controller aplica com filtro `{ blendiOwnership: 'other' }` — checagem e
// escrita atômicas no MongoDB. Os demais caminhos já gravam posse e texto no
// mesmo update, então não têm janela.

import type { BlendiModel, BlendiOwnership } from '../models/User';

export interface BlenderOwnershipPatch {
  blendiModel?: BlendiModel;
  blendiOwnership?: BlendiOwnership;
  otherBlenderModel?: string;
}

export interface BlenderOwnershipUpdates {
  set: {
    blendiModel?: BlendiModel;
    blendiOwnership?: BlendiOwnership;
    otherBlenderModel?: string;
  };
  unsetOtherBlenderModel: boolean;
  /**
   * Texto a gravar SÓ se, no momento da escrita, a posse no banco ainda for
   * 'other'. Aplicar com updateOne({ _id, blendiOwnership: 'other' }, ...).
   */
  onlyIfOwnershipIsOther?: { otherBlenderModel: string };
}

export function resolveBlenderOwnershipUpdates(
  patch: BlenderOwnershipPatch,
  currentOwnership: BlendiOwnership
): BlenderOwnershipUpdates {
  const result: BlenderOwnershipUpdates = { set: {}, unsetOtherBlenderModel: false };

  const applyOtherBlenderModelText = () => {
    if (patch.otherBlenderModel === undefined) {
      return;
    }

    const trimmed = patch.otherBlenderModel.trim();
    if (trimmed.length > 0) {
      result.set.otherBlenderModel = trimmed;
    } else {
      result.unsetOtherBlenderModel = true;
    }
  };

  const effectiveOwnership: BlendiOwnership | undefined =
    patch.blendiOwnership ?? (patch.blendiModel !== undefined ? 'blendi' : undefined);

  if (effectiveOwnership === undefined) {
    if (currentOwnership === 'other' && patch.otherBlenderModel !== undefined) {
      const trimmed = patch.otherBlenderModel.trim();
      if (trimmed.length > 0) {
        result.onlyIfOwnershipIsOther = { otherBlenderModel: trimmed };
      } else {
        // Limpar é seguro sob corrida: em qualquer ordem o estado final é válido.
        result.unsetOtherBlenderModel = true;
      }
    }
    return result;
  }

  result.set.blendiOwnership = effectiveOwnership;

  if (effectiveOwnership === 'blendi') {
    if (patch.blendiModel !== undefined) {
      result.set.blendiModel = patch.blendiModel;
    }
    result.unsetOtherBlenderModel = true;
    return result;
  }

  result.set.blendiModel = 'Lite';

  if (effectiveOwnership === 'none') {
    result.unsetOtherBlenderModel = true;
    return result;
  }

  applyOtherBlenderModelText();
  return result;
}
