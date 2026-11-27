// CP-C2 — Schema do roteiro do tutorial guiado (coach marks) e do progresso.
//
// O roteiro é DADO, não código: o backend serve (GET /tutorial) e o app tem
// uma cópia embutida (packages/shared/src/tutorial/tutorial.content.ts). Os
// dois passam por este mesmo schema. Regras de compatibilidade:
//   - Campo novo e opcional numa etapa: app antigo ignora (Zod tira chaves
//     desconhecidas por padrão), nada quebra.
//   - Mudança incompatível de formato: sobe TUTORIAL_SCHEMA_VERSION. App
//     antigo recusa o roteiro do servidor e usa a cópia embutida.
//   - `screen` e `anchor` são texto livre (com formato) e não enum: o app
//     decide em tempo de execução se conhece a tela/âncora. Etapa que aponta
//     para tela/âncora que a versão instalada não tem é pulada em silêncio.
//   - `condition` é uma lista FECHADA: condição desconhecida recusa o roteiro
//     inteiro (o app cai na cópia embutida). Condição nova = schemaVersion novo.
import { z } from 'zod';

/** Versão do formato. O app só aceita roteiro com a versão que conhece. */
export const TUTORIAL_SCHEMA_VERSION = 1;

/** Idiomas exigidos em toda etapa (os mesmos do app). */
export const TUTORIAL_LOCALES = ['en', 'pt-BR'] as const;
export type TutorialLocale = (typeof TUTORIAL_LOCALES)[number];

/**
 * Condições aceitas (lista fechada e tipada). Sem condição = vale para todos.
 *   isPro / notPro       → plano Pulse Pro ativo ou não
 *   hasBlendi / noBlendi → blendiOwnership 'blendi' (ausente conta como
 *                          'blendi', mesmo padrão do app) ou 'other'/'none'
 */
export const TUTORIAL_CONDITION_VALUES = ['isPro', 'notPro', 'hasBlendi', 'noBlendi'] as const;
export type TutorialCondition = (typeof TUTORIAL_CONDITION_VALUES)[number];

export const TUTORIAL_PLACEMENT_VALUES = ['above', 'below', 'auto'] as const;
export type TutorialPlacement = (typeof TUTORIAL_PLACEMENT_VALUES)[number];

// Limites pensados para o balão caber num iPhone SE (375 x 667 pt) com fonte
// padrão: título em até 2 linhas, texto em até ~8 linhas. Textos maiores
// empurrariam o balão para cima do elemento destacado.
export const TUTORIAL_TITLE_MAX_LENGTH = 48;
export const TUTORIAL_BODY_MAX_LENGTH = 300;
export const TUTORIAL_STEP_ID_MAX_LENGTH = 64;
/** Teto de etapas num roteiro (e de ids numa requisição de progresso). */
export const TUTORIAL_MAX_STEPS = 100;

/** "home.rings", "pulseAi.pantry": segmentos camelCase separados por ponto. */
export const TUTORIAL_STEP_ID_PATTERN = /^[a-z][a-zA-Z0-9]*(\.[a-z][a-zA-Z0-9]*)+$/;
/** Mesmo formato do id da etapa. */
export const TUTORIAL_ANCHOR_ID_PATTERN = TUTORIAL_STEP_ID_PATTERN;
/** Nome de rota do React Navigation: "Home", "PulseAIChat", "TrackMain". */
export const TUTORIAL_SCREEN_PATTERN = /^[A-Z][A-Za-z0-9]{1,40}$/;

const stepIdSchema = z
  .string({ required_error: 'errors.validation.required' })
  .max(TUTORIAL_STEP_ID_MAX_LENGTH, 'errors.validation.too_long')
  .regex(TUTORIAL_STEP_ID_PATTERN, 'errors.validation.invalid_format');

const localizedTextSchema = z.object({
  title: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required')
    .max(TUTORIAL_TITLE_MAX_LENGTH, 'errors.validation.too_long'),
  body: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required')
    .max(TUTORIAL_BODY_MAX_LENGTH, 'errors.validation.too_long'),
});

/** Texto nos dois idiomas, os dois obrigatórios. */
export const tutorialTextSchema = z.object({
  en: localizedTextSchema,
  'pt-BR': localizedTextSchema,
});

export const tutorialStepSchema = z.object({
  /** Estável e único. Nunca reaproveitar o id de uma etapa removida. */
  id: stepIdSchema,
  /** Posição no tour (crescente, única). Deixe folga (10, 20, 30...). */
  order: z.number().int().min(0).max(100_000),
  /** Nome da rota do app onde a etapa aparece. */
  screen: z.string().regex(TUTORIAL_SCREEN_PATTERN, 'errors.validation.invalid_format'),
  /** Id da âncora (<TutorialAnchor id>). Sem âncora = balão centralizado. */
  anchor: z
    .string()
    .max(TUTORIAL_STEP_ID_MAX_LENGTH, 'errors.validation.too_long')
    .regex(TUTORIAL_ANCHOR_ID_PATTERN, 'errors.validation.invalid_format')
    .optional(),
  placement: z.enum(TUTORIAL_PLACEMENT_VALUES).default('auto'),
  condition: z.enum(TUTORIAL_CONDITION_VALUES).optional(),
  /** contentVersion em que a etapa entrou (documenta o "novidades"). */
  addedInVersion: z.number().int().min(1),
  text: tutorialTextSchema,
});

export const tutorialContentSchema = z
  .object({
    schemaVersion: z.literal(TUTORIAL_SCHEMA_VERSION),
    /** Sobe a cada mudança no roteiro (etapa nova, texto novo). */
    contentVersion: z.number().int().min(1),
    /** Abertura do modo "novidades" (só etapas ainda não vistas). */
    whatsNewIntro: tutorialTextSchema,
    steps: z.array(tutorialStepSchema).min(1).max(TUTORIAL_MAX_STEPS),
  })
  .superRefine((content, ctx) => {
    const ids = new Set<string>();
    const orders = new Set<number>();

    content.steps.forEach((step, index) => {
      if (ids.has(step.id)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['steps', index, 'id'], message: 'tutorial/duplicate-step-id' });
      }
      ids.add(step.id);

      if (orders.has(step.order)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['steps', index, 'order'], message: 'tutorial/duplicate-step-order' });
      }
      orders.add(step.order);

      if (step.addedInVersion > content.contentVersion) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['steps', index, 'addedInVersion'],
          message: 'tutorial/added-after-content-version',
        });
      }
    });
  });

export type TutorialText = z.infer<typeof tutorialTextSchema>;
export type TutorialStep = z.infer<typeof tutorialStepSchema>;
/** Roteiro como escrito no arquivo de dados (placement pode faltar). */
export type TutorialContentInput = z.input<typeof tutorialContentSchema>;
/** Roteiro validado (placement sempre preenchido). */
export type TutorialContent = z.infer<typeof tutorialContentSchema>;

// ─── Progresso (1 documento por usuário) ─────────────────────────────────────

/** Progresso como a API devolve (GET/PATCH /tutorial/progress). */
export const tutorialProgressSchema = z.object({
  /** Etapas já tratadas: vistas, ou dispensadas por Pular/Concluir. */
  seenStepIds: z.array(z.string()).max(1000),
  lastStepId: z.string().nullable(),
  completedAt: z.string().nullable(),
  skippedAt: z.string().nullable(),
  /** Maior contentVersion que o usuário já viu. */
  contentVersion: z.number().int().min(0).nullable(),
});
export type TutorialProgress = z.infer<typeof tutorialProgressSchema>;

export const EMPTY_TUTORIAL_PROGRESS: TutorialProgress = {
  seenStepIds: [],
  lastStepId: null,
  completedAt: null,
  skippedAt: null,
  contentVersion: null,
};

/**
 * Corpo do PATCH /tutorial/progress. Tudo opcional; o servidor junta
 * (nunca apaga) os ids e ignora id que não está no roteiro atual.
 */
export const updateTutorialProgressSchema = z
  .object({
    seenStepIds: z
      .array(z.unknown(), { invalid_type_error: 'errors.validation.invalid_option' })
      .max(TUTORIAL_MAX_STEPS, 'errors.validation.too_long')
      .pipe(z.array(stepIdSchema))
      .optional(),
    lastStepId: stepIdSchema.nullable().optional(),
    status: z.enum(['completed', 'skipped']).optional(),
    contentVersion: z.number().int().min(1).max(1_000_000).optional(),
  })
  .strict();
export type UpdateTutorialProgressInput = z.infer<typeof updateTutorialProgressSchema>;

/**
 * Valida um roteiro vindo de fora (servidor, cache local). Nunca lança:
 * roteiro inválido, de outra schemaVersion ou malformado vira `null` e quem
 * chamou usa a cópia embutida.
 */
export function parseTutorialContent(raw: unknown): TutorialContent | null {
  const result = tutorialContentSchema.safeParse(raw);
  return result.success ? result.data : null;
}
