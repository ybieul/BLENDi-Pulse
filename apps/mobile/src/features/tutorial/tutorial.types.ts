// CP-C2 — Tipos do motor do tutorial guiado (o roteiro em si é tipado pelo
// schema de @blendi/shared).
import type { BlendiOwnership, TutorialPlacement, TutorialProgress } from '@blendi/shared';

/** full = primeira vez; whatsNew = só etapas novas; review = "Ver tutorial de novo". */
export type TutorialMode = 'full' | 'whatsNew' | 'review';

/** Por que uma etapa não apareceu (vai para log e analytics, sem dado do usuário). */
export type TutorialUnavailableReason =
  | 'condition'
  | 'route'
  | 'anchorUnknown'
  | 'anchorTimeout'
  | 'duplicate';

export interface TutorialUserContext {
  isPro: boolean;
  /** Ausente = 'blendi' (mesmo padrão do app para contas antigas). */
  blendiOwnership?: BlendiOwnership;
}

export interface TutorialRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Etapa pronta para mostrar: texto já no idioma da conta. */
export interface PlannedTutorialStep {
  id: string;
  screen: string;
  anchor?: string;
  placement: TutorialPlacement;
  title: string;
  body: string;
  /** Abertura do modo novidades: não é etapa do roteiro, não vai para o progresso. */
  isSynthetic?: boolean;
}

export type TutorialPhase = 'resolving' | 'showing' | 'paused';

export interface TutorialViewState {
  isRunning: boolean;
  mode: TutorialMode | null;
  phase: TutorialPhase | null;
  step: PlannedTutorialStep | null;
  /** 0-based dentro das etapas que se aplicam. */
  index: number;
  total: number;
  targetRect: TutorialRect | null;
}

export const IDLE_TUTORIAL_VIEW_STATE: TutorialViewState = {
  isRunning: false,
  mode: null,
  phase: null,
  step: null,
  index: 0,
  total: 0,
  targetRect: null,
};

/** Operação pendente de envio ao servidor (fila offline). */
export type TutorialSyncOperation =
  | { type: 'reset' }
  | {
      type: 'patch';
      seenStepIds: string[];
      lastStepId?: string | null;
      status?: 'completed' | 'skipped';
      contentVersion?: number;
    };

/** Cópia local por usuário (MMKV): funciona offline e sobrevive ao reinício. */
export interface TutorialLocalState {
  progress: TutorialProgress;
  pending: TutorialSyncOperation[];
  /** Modo do tour em andamento, para a retomada manter o mesmo modo. */
  activeMode: TutorialMode | null;
}
