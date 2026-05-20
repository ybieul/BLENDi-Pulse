import { z } from 'zod';

const supplementTimingValues = ['morning', 'preWorkout', 'postWorkout', 'evening', 'withMeal'] as const;
const MAX_SUPPLEMENT_STACK_ITEMS = 20;
const MAX_HISTORY_RANGE_MS = 365 * 24 * 60 * 60 * 1000;
const MAX_DAILY_TARGET_COUNT = 20;

const isoDateStringSchema = z
  .string({
    required_error: 'errors.validation.required',
    invalid_type_error: 'errors.validation.required',
  })
  .min(1, 'errors.validation.required')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'errors.validation.invalid_option');

export const supplementItemSchema = z.object({
  name: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required')
    .max(60, 'errors.validation.too_long'),

  dosage: z
    .string({ required_error: 'errors.validation.required' })
    .trim()
    .min(1, 'errors.validation.required')
    .max(30, 'errors.validation.too_long'),

  dailyTargetCount: z
    .number({
      invalid_type_error: 'errors.validation.number_range',
    })
    .int('errors.validation.integer')
    .min(1, 'errors.validation.number_range')
    .max(MAX_DAILY_TARGET_COUNT, 'errors.validation.number_range')
    .optional()
    .default(1),

  timing: z.enum(supplementTimingValues, {
    required_error: 'errors.validation.required',
    message: 'errors.validation.invalid_option',
  }),

  isActive: z.boolean().optional().default(true),
});

export const updateSupplementStackSchema = z
  .array(supplementItemSchema)
  .max(MAX_SUPPLEMENT_STACK_ITEMS, 'errors.validation.too_long');

export const historyQuerySchema = z
  .object({
    from: isoDateStringSchema,

    to: isoDateStringSchema,

    page: z
      .number({
        invalid_type_error: 'errors.validation.number_range',
      })
      .int('errors.validation.integer')
      .positive('errors.validation.number_range')
      .default(1),

    limit: z
      .number({
        invalid_type_error: 'errors.validation.number_range',
      })
      .int('errors.validation.integer')
      .min(1, 'errors.validation.number_range')
      .max(100, 'errors.validation.number_range')
      .default(30),
  })
  .superRefine((value, ctx) => {
    const fromDate = new Date(value.from);
    const toDate = new Date(value.to);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return;
    }

    if (fromDate >= toDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['from'],
        message: 'errors.validation.invalid_option',
      });
    }

    if (toDate.getTime() - fromDate.getTime() > MAX_HISTORY_RANGE_MS) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['to'],
        message: 'errors.validation.invalid_option',
      });
    }
  });

export type SupplementItem = z.infer<typeof supplementItemSchema>;
export type UpdateSupplementStackInput = z.infer<typeof updateSupplementStackSchema>;
export type HistoryQuery = z.infer<typeof historyQuerySchema>;