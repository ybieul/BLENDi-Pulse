// apps/api/src/models/PantryRead.ts
// CP-B7 — leitura da foto do Pantry Scanner guardada entre as duas etapas
// (POST /pantry-scanner/read → POST /pantry-scanner/generate).
//
// Guarda SÓ o resultado da visão (nomes, quantidade estimada, confiança,
// bebida alcoólica pela lista do validador e se há líquido). A imagem nunca é
// gravada. O índice TTL apaga a leitura no vencimento (~30 min da foto).
//
// Cada leitura gera receitas uma vez só (consumedAt, gravado de forma atômica
// no generate). Para editar e gerar de novo sem nova foto, o generate cria
// uma leitura nova com os mesmos ingredientes e o MESMO vencimento.

import { PANTRY_READ_TTL_MS } from '@blendi/shared';
import mongoose from 'mongoose';

export { PANTRY_READ_TTL_MS };

export interface IPantryReadIngredient {
  name: string;
  estimatedQuantity?: string;
  confidence: 'high' | 'medium' | 'low';
  isAlcoholic: boolean;
  /**
   * CP-B7: serve para shake/smoothie. false = "Outros itens na foto"
   * (desmarcado). Leitura gravada antes do CP-B7 não tem o campo: ausente =
   * true (isBlendSuitable, em pantryRequest.utils.ts).
   */
  blendSuitable?: boolean;
}

export interface IPantryRead {
  userId: mongoose.Types.ObjectId;
  ingredients: IPantryReadIngredient[];
  hasLiquid: boolean;
  /** Gravado quando a leitura gera receitas; ausente/null = ainda disponível. */
  consumedAt?: Date | null;
  /** Fim da validade; usado pelo índice TTL. */
  expiresAt: Date;
  createdAt: Date;
}

const pantryReadIngredientSchema = new mongoose.Schema<IPantryReadIngredient>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    estimatedQuantity: { type: String, required: false, trim: true, maxlength: 200 },
    confidence: { type: String, required: true, enum: ['high', 'medium', 'low'] },
    isAlcoholic: { type: Boolean, required: true },
    blendSuitable: { type: Boolean, required: false },
  },
  { _id: false }
);

const pantryReadSchema = new mongoose.Schema<IPantryRead>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    ingredients: {
      type: [pantryReadIngredientSchema],
      default: [],
    },
    hasLiquid: {
      type: Boolean,
      required: true,
    },
    consumedAt: {
      type: Date,
      required: false,
      default: null,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    collection: 'pantry_reads',
    timestamps: { createdAt: true, updatedAt: false },
  }
);

pantryReadSchema.index({ userId: 1, createdAt: -1 });

// Remoção automática no instante de expiresAt. O monitor de TTL do Mongo roda
// a cada ~60 s, então o generate também filtra expiresAt > agora.
pantryReadSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PantryReadModel = mongoose.model<IPantryRead>('PantryRead', pantryReadSchema);
