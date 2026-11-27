// CP-C2 — Motor do tutorial guiado (sem React).
//
// Recebe tudo o que depende do app por injeção (navegação, medição, estado
// das folhas, analytics), o que deixa o motor testável com roteiro e
// ambiente falsos. Garantias:
//   - etapa que não se aplica (rota, âncora, condição, id repetido) é pulada
//     em silêncio; nunca lança, nunca trava a tela;
//   - nunca mostra o balão com folha/paywall/celebração/alerta aberto: pausa
//     e retoma quando a tela fica livre;
//   - cada etapa mostrada vai para o progresso (local + servidor), o que dá
//     a retomada depois de fechar o app.
import type { TutorialContent } from '@blendi/shared';

import {
  IDLE_TUTORIAL_VIEW_STATE,
  type PlannedTutorialStep,
  type TutorialMode,
  type TutorialRect,
  type TutorialUnavailableReason,
  type TutorialUserContext,
  type TutorialViewState,
} from './tutorial.types';
import {
  decideTutorialStart,
  planTutorial,
  type TutorialContentLocale,
  type TutorialPlan,
  type TutorialPlanSupport,
  type TutorialStartDecision,
} from './tutorialPlanner';
import type { TutorialProgressSync } from './tutorialProgressSync';
import { rectsAreClose } from './tutorialMeasure';

export interface TutorialEnvironment {
  /** Navega até a tela da etapa. false = rota desconhecida. */
  navigateTo: (screen: string) => boolean;
  /** Espera a âncora aparecer, rola até ela e mede. null = não apareceu a tempo. */
  resolveAnchor: (anchorId: string, screen: string, isCancelled: () => boolean) => Promise<TutorialRect | null>;
  /** Mede de novo a âncora já resolvida (layout, teclado, rotação). */
  measureAnchor: (anchorId: string) => Promise<TutorialRect | null>;
  /** Sem folha, paywall, celebração ou alerta por cima. */
  isSurfaceFree: () => boolean;
  subscribeSurface: (listener: () => void) => () => void;
  scrollToTop: () => void;
  dismissKeyboard: () => void;
  wait: (ms: number) => Promise<void>;
}

export type TutorialAnalyticsEvent =
  | 'tutorial_started'
  | 'tutorial_step_viewed'
  | 'tutorial_skipped'
  | 'tutorial_completed'
  | 'tutorial_step_unavailable';

export interface TutorialTelemetry {
  track: (event: TutorialAnalyticsEvent, properties: Record<string, string | number>) => void;
  /** Só id da etapa e motivo, nada do usuário. */
  logUnavailable: (stepId: string, reason: TutorialUnavailableReason) => void;
}

export interface TutorialControllerOptions {
  userId: string;
  context: TutorialUserContext;
  locale: TutorialContentLocale;
  env: TutorialEnvironment;
  telemetry: TutorialTelemetry;
  sync: TutorialProgressSync;
  loadContent: () => Promise<TutorialContent | null>;
  support: TutorialPlanSupport;
}

/** Com a tela ocupada, quanto esperar entre uma checagem e outra. */
const SURFACE_POLL_MS = 300;

export class TutorialController {
  private state: TutorialViewState = IDLE_TUTORIAL_VIEW_STATE;
  private readonly listeners = new Set<() => void>();
  private content: TutorialContent | null = null;
  private plan: TutorialPlan | null = null;
  private steps: PlannedTutorialStep[] = [];
  private generation = 0;
  private ready = false;
  private disposed = false;
  private autoStartHandled = false;
  private context: TutorialUserContext;
  private locale: TutorialContentLocale;
  private readonly unsubscribeSurface: () => void;
  private surfaceWaiters = new Set<() => void>();

  constructor(private readonly options: TutorialControllerOptions) {
    this.context = options.context;
    this.locale = options.locale;
    this.unsubscribeSurface = options.env.subscribeSurface(() => this.handleSurfaceChange());
  }

  // ─── Estado observável ────────────────────────────────────────────────────

  getState = (): TutorialViewState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private setState(partial: Partial<TutorialViewState>): void {
    if (this.disposed) return;
    this.state = { ...this.state, ...partial };
    this.listeners.forEach((listener) => listener());
  }

  get isReady(): boolean {
    return this.ready;
  }

  // ─── Ciclo de vida ────────────────────────────────────────────────────────

  private initPromise: Promise<void> | null = null;

  /** Idempotente: chamadas seguintes devolvem a mesma carga. */
  init(): Promise<void> {
    this.initPromise ??= this.load();
    return this.initPromise;
  }

  private async load(): Promise<void> {
    const [content] = await Promise.all([
      this.options.loadContent().catch(() => null),
      this.options.sync.hydrateFromServer().catch(() => undefined),
    ]);
    if (this.disposed) return;
    this.content = content;
    this.replan();
    this.ready = true;
  }

  dispose(): void {
    this.generation += 1;
    this.disposed = true;
    this.unsubscribeSurface();
    this.surfaceWaiters.forEach((resolve) => resolve());
    this.surfaceWaiters.clear();
    this.listeners.clear();
  }

  /** Plano mudou (Pro, posse do liquidificador) ou idioma mudou. */
  updateContext(context: TutorialUserContext, locale: TutorialContentLocale): void {
    const changed =
      context.isPro !== this.context.isPro ||
      context.blendiOwnership !== this.context.blendiOwnership ||
      locale !== this.locale;
    if (!changed) return;
    this.context = context;
    this.locale = locale;
    this.replan();

    // Durante o tour, só troca o texto (idioma); a lista de etapas fica.
    if (this.state.isRunning && this.plan) {
      const byId = new Map(this.plan.steps.map((step) => [step.id, step]));
      this.steps = this.steps.map((step) => {
        const updated = byId.get(step.id);
        return updated ? { ...step, title: updated.title, body: updated.body } : step;
      });
      const current = this.steps[this.state.index] ?? null;
      this.setState({ step: current });
    }
  }

  private replan(): void {
    this.plan = this.content
      ? planTutorial(this.content, this.context, this.locale, this.options.support)
      : null;
  }

  // ─── Quando o tour abre ───────────────────────────────────────────────────

  /**
   * Chamado quando a Home fica em foco e livre. Abre no máximo uma vez por
   * sessão do app (Pular / Concluir não reabrem sozinhos).
   */
  maybeAutoStart(currentScreen: string | undefined): boolean {
    if (!this.ready || this.disposed || this.state.isRunning || this.autoStartHandled) return false;
    if (currentScreen !== 'Home' || !this.options.env.isSurfaceFree()) return false;
    if (!this.content || !this.plan) return false;

    this.autoStartHandled = true;
    const decision = decideTutorialStart(
      this.plan,
      this.options.sync.progress,
      this.content,
      this.locale,
      this.options.sync.activeMode
    );
    if (!decision) return false;

    this.start(decision);
    return true;
  }

  /** "Ver tutorial de novo" em Me: apaga o progresso e começa do início. */
  replay(): boolean {
    if (!this.ready || this.disposed || !this.plan || this.plan.steps.length === 0) return false;
    this.generation += 1;
    this.autoStartHandled = true;
    this.options.sync.apply({ type: 'reset' });
    this.start({ mode: 'review', steps: this.plan.steps, startIndex: 0 });
    return true;
  }

  private start(decision: TutorialStartDecision): void {
    this.steps = [...decision.steps];
    this.options.sync.setActiveMode(decision.mode);
    this.options.env.dismissKeyboard();
    this.options.telemetry.track('tutorial_started', { mode: decision.mode, steps: this.steps.length });
    for (const item of this.plan?.unavailable ?? []) {
      this.reportUnavailable(item.id, item.reason);
    }
    this.setState({
      isRunning: true,
      mode: decision.mode,
      phase: 'resolving',
      step: null,
      index: decision.startIndex,
      total: this.steps.length,
      targetRect: null,
    });
    void this.goTo(decision.startIndex, 1);
  }

  // ─── Navegação entre etapas ───────────────────────────────────────────────

  next = (): void => {
    if (!this.state.isRunning || this.state.phase !== 'showing') return;
    if (this.state.index >= this.steps.length - 1) {
      this.complete();
      return;
    }
    void this.goTo(this.state.index + 1, 1);
  };

  back = (): void => {
    if (!this.state.isRunning || this.state.phase !== 'showing' || this.state.index === 0) return;
    void this.goTo(this.state.index - 1, -1);
  };

  skip = (): void => {
    if (!this.state.isRunning) return;
    this.options.telemetry.track('tutorial_skipped', {
      step_id: this.state.step?.id ?? 'none',
      mode: this.state.mode ?? 'full',
    });
    this.finish('skipped');
  };

  private complete(): void {
    this.options.telemetry.track('tutorial_completed', { mode: this.state.mode ?? 'full' });
    this.finish('completed');
    this.options.env.navigateTo('Home');
    this.options.env.scrollToTop();
  }

  private finish(status: 'completed' | 'skipped'): void {
    this.generation += 1;
    // Tudo o que esta versão sabe mostrar fica "visto": o modo novidades só
    // volta com etapa realmente nova (ver tutorialPlanner.ts).
    this.options.sync.apply({
      type: 'patch',
      seenStepIds: this.plan?.supportedStepIds ?? [],
      lastStepId: null,
      status,
      ...(this.content && { contentVersion: this.content.contentVersion }),
    });
    this.options.sync.setActiveMode(null);
    this.steps = [];
    this.setState(IDLE_TUTORIAL_VIEW_STATE);
  }

  private reportUnavailable(stepId: string, reason: TutorialUnavailableReason): void {
    this.options.telemetry.logUnavailable(stepId, reason);
    this.options.telemetry.track('tutorial_step_unavailable', { step_id: stepId, reason });
  }

  private async waitForFreeSurface(generation: number): Promise<boolean> {
    while (!this.options.env.isSurfaceFree()) {
      if (generation !== this.generation || this.disposed) return false;
      if (this.state.phase !== 'paused') this.setState({ phase: 'paused' });
      await new Promise<void>((resolve) => {
        this.surfaceWaiters.add(resolve);
        void this.options.env.wait(SURFACE_POLL_MS).then(() => {
          this.surfaceWaiters.delete(resolve);
          resolve();
        });
      });
    }
    return generation === this.generation && !this.disposed;
  }

  private async goTo(startIndex: number, direction: 1 | -1): Promise<void> {
    this.generation += 1;
    const generation = this.generation;
    const isCancelled = () => generation !== this.generation || this.disposed;
    let index = startIndex;
    let dir = direction;

    while (!isCancelled()) {
      const step = this.steps[index];
      if (!step) {
        if (dir === 1) {
          if (this.steps.length === 0) {
            this.finish('completed');
          } else {
            this.complete();
          }
          return;
        }
        index = 0;
        dir = 1;
        continue;
      }

      this.setState({ phase: 'resolving', index, total: this.steps.length, step, targetRect: null });

      if (!(await this.waitForFreeSurface(generation))) return;
      this.setState({ phase: 'resolving' });

      let reason: TutorialUnavailableReason | null = null;
      let rect: TutorialRect | null = null;

      if (!this.options.env.navigateTo(step.screen)) {
        reason = 'route';
      } else if (step.anchor !== undefined) {
        try {
          rect = await this.options.env.resolveAnchor(step.anchor, step.screen, isCancelled);
        } catch {
          rect = null;
        }
        if (isCancelled()) return;
        if (!rect) reason = 'anchorTimeout';
      }

      if (reason) {
        this.reportUnavailable(step.id, reason);
        this.steps.splice(index, 1);
        if (dir === -1) {
          index -= 1;
          if (index < 0) {
            index = 0;
            dir = 1;
          }
        }
        continue;
      }

      // A tela pode ter ficado ocupada enquanto a âncora era resolvida.
      if (!this.options.env.isSurfaceFree()) continue;

      this.setState({ phase: 'showing', index, total: this.steps.length, step, targetRect: rect });

      if (!step.isSynthetic) {
        this.options.sync.apply({
          type: 'patch',
          seenStepIds: [step.id],
          lastStepId: step.id,
          ...(this.content && { contentVersion: this.content.contentVersion }),
        });
      }
      this.options.telemetry.track('tutorial_step_viewed', {
        step_id: step.id,
        index: index + 1,
        total: this.steps.length,
      });
      return;
    }
  }

  // ─── Reações a mudanças do app ────────────────────────────────────────────

  private handleSurfaceChange(): void {
    this.surfaceWaiters.forEach((resolve) => resolve());
    this.surfaceWaiters.clear();
    if (!this.state.isRunning) return;

    if (!this.options.env.isSurfaceFree()) {
      if (this.state.phase === 'showing') {
        this.generation += 1;
        this.setState({ phase: 'paused' });
        void this.goTo(this.state.index, 1);
      }
    }
  }

  /** Layout, rotação, teclado: mede de novo a âncora da etapa atual. */
  async refreshTarget(): Promise<void> {
    const { step, phase, isRunning } = this.state;
    if (!isRunning || phase !== 'showing' || !step?.anchor) return;
    const generation = this.generation;
    const rect = await this.options.env.measureAnchor(step.anchor).catch(() => null);
    if (generation !== this.generation || this.state.step?.id !== step.id || this.state.phase !== 'showing') return;
    if (!rect) {
      // Âncora sumiu (tela re-renderizou): resolve a mesma etapa de novo.
      void this.goTo(this.state.index, 1);
      return;
    }
    if (!this.state.targetRect || !rectsAreClose(rect, this.state.targetRect)) {
      this.setState({ targetRect: rect });
    }
  }

  getMode(): TutorialMode | null {
    return this.state.mode;
  }
}
