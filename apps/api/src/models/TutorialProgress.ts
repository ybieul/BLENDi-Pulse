// CP-C2 — Progresso do tutorial guiado: 1 documento por usuário.
// Guarda só ids de etapa e datas (nada de dado pessoal). Entra na exclusão
// de conta (user.controller.ts → deleteAccount; o teste
// user.deleteAccount.test.ts quebra se este modelo for esquecido).
import mongoose from 'mongoose';

export interface ITutorialProgress {
  userId: mongoose.Types.ObjectId;
  /** Etapas já tratadas (vistas, ou dispensadas por Pular/Concluir). */
  seenStepIds: string[];
  lastStepId: string | null;
  completedAt: Date | null;
  skippedAt: Date | null;
  /** Maior contentVersion do roteiro que o usuário já viu. */
  contentVersion: number | null;
  createdAt: Date;
  updatedAt: Date;
}

const tutorialProgressSchema = new mongoose.Schema<ITutorialProgress>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'errors.validation.required'],
    },
    seenStepIds: {
      type: [String],
      default: [],
    },
    lastStepId: {
      type: String,
      default: null,
    },
    completedAt: {
      type: Date,
      default: null,
    },
    skippedAt: {
      type: Date,
      default: null,
    },
    contentVersion: {
      type: Number,
      default: null,
    },
  },
  {
    collection: 'tutorial_progress',
    timestamps: true,
  }
);

tutorialProgressSchema.index({ userId: 1 }, { unique: true });

export const TutorialProgressModel = mongoose.model<ITutorialProgress>('TutorialProgress', tutorialProgressSchema);
