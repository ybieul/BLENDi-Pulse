import mongoose, { type Document } from 'mongoose';
import type {
  WeeklyReportBestDay,
  WeeklyReportHighlightRecipe,
  WeeklyReportNutrition,
  WeeklyReportHydration,
  WeeklyReportSupplements,
  WeeklyReportGamification,
  WeeklyReportData,
  WeeklyReportComparison,
} from '@blendi/shared';

const WEEKLY_REPORT_TTL_SECONDS = 7_776_000;
const weekDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export interface IWeeklyReport {
  userId: mongoose.Types.ObjectId;
  weekStartDate: string;
  weekEndDate: string;
  isProAtGeneration: boolean;
  data: WeeklyReportData;
  previousWeekComparison?: WeeklyReportComparison;
  createdAt: Date;
}

export type WeeklyReportDocument = Document<unknown, object, IWeeklyReport> & IWeeklyReport;

const weeklyReportBestDaySchema = new mongoose.Schema<WeeklyReportBestDay>(
  {
    date: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
      match: [weekDatePattern, 'errors.validation.invalid_option'],
    },
    proteinAmount: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
    },
  },
  {
    _id: false,
  }
);

const weeklyReportHighlightRecipeSchema = new mongoose.Schema<WeeklyReportHighlightRecipe>(
  {
    name: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
    },
    protein: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
    },
    carbs: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
    },
    fat: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
    },
    calories: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    rating: {
      type: Number,
      required: false,
      min: [1, 'errors.validation.number_range'],
      max: [5, 'errors.validation.number_range'],
      validate: {
        validator: (value: number | null | undefined) => value == null || Number.isInteger(value),
        message: 'errors.validation.integer',
      },
    },
  },
  {
    _id: false,
  }
);

const weeklyReportNutritionSchema = new mongoose.Schema<WeeklyReportNutrition>(
  {
    blendCount: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    avgProteinPerDay: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
    },
    proteinGoalHitDays: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
      max: [7, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    calorieGoalHitDays: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
      max: [7, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    bestDay: {
      type: weeklyReportBestDaySchema,
      required: [true, 'errors.validation.required'],
    },
    highlightRecipe: {
      type: weeklyReportHighlightRecipeSchema,
      required: false,
    },
  },
  {
    _id: false,
  }
);

const weeklyReportHydrationSchema = new mongoose.Schema<WeeklyReportHydration>(
  {
    totalMl: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    avgDailyMl: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
    },
    goalHitDays: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
      max: [7, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    // Sempre 7 posições (uma por dia da semana, em ordem cronológica) mesmo
    // quando um dia não teve nenhum registro — simplifica o gráfico no mobile,
    // que nunca precisa tratar null/undefined por posição.
    dailyBreakdown: {
      type: [Number],
      required: [true, 'errors.validation.required'],
      validate: {
        validator: (values: number[]) =>
          Array.isArray(values) && values.length === 7 && values.every((value) => Number.isInteger(value) && value >= 0),
        message: 'errors.validation.invalid_option',
      },
    },
  },
  {
    _id: false,
  }
);

const weeklyReportSupplementsSchema = new mongoose.Schema<WeeklyReportSupplements>(
  {
    adherenceRate: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
      max: [1, 'errors.validation.number_range'],
    },
    perfectDays: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
      max: [7, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    // Chaves dinâmicas (nomes de suplementos do usuário) — Mixed em vez de Map
    // porque o subdocumento é escrito uma única vez na geração e precisa
    // serializar como objeto plano na resposta da API sem configuração extra.
    bySupplementName: {
      type: mongoose.Schema.Types.Mixed,
      required: [true, 'errors.validation.required'],
    },
    topSupplement: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
    },
    bottomSupplement: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
    },
  },
  {
    _id: false,
  }
);

const weeklyReportGamificationSchema = new mongoose.Schema<WeeklyReportGamification>(
  {
    xpEarned: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    currentLevel: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [1, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    missionsCompleted: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    blendDaysInWeek: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
      max: [7, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    currentStreak: {
      type: Number,
      required: [true, 'errors.validation.required'],
      min: [0, 'errors.validation.number_range'],
      validate: {
        validator: Number.isInteger,
        message: 'errors.validation.integer',
      },
    },
    streakBrokenOnDate: {
      type: String,
      required: false,
      trim: true,
      match: [weekDatePattern, 'errors.validation.invalid_option'],
    },
    levelUpOccurred: {
      type: Boolean,
      required: [true, 'errors.validation.required'],
    },
  },
  {
    _id: false,
  }
);

const weeklyReportDataSchema = new mongoose.Schema<WeeklyReportData>(
  {
    nutrition: {
      type: weeklyReportNutritionSchema,
      required: [true, 'errors.validation.required'],
    },
    hydration: {
      type: weeklyReportHydrationSchema,
      required: [true, 'errors.validation.required'],
    },
    supplements: {
      type: weeklyReportSupplementsSchema,
      required: [true, 'errors.validation.required'],
    },
    gamification: {
      type: weeklyReportGamificationSchema,
      required: [true, 'errors.validation.required'],
    },
  },
  {
    _id: false,
  }
);

const weeklyReportComparisonSchema = new mongoose.Schema<WeeklyReportComparison>(
  {
    avgProteinPerDayDeltaPercent: {
      type: Number,
      required: [true, 'errors.validation.required'],
    },
    avgDailyMlDeltaPercent: {
      type: Number,
      required: [true, 'errors.validation.required'],
    },
    adherenceRateDeltaPercent: {
      type: Number,
      required: [true, 'errors.validation.required'],
    },
  },
  {
    _id: false,
  }
);

const weeklyReportSchema = new mongoose.Schema<IWeeklyReport>(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'errors.validation.required'],
      index: true,
    },
    weekStartDate: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
      match: [weekDatePattern, 'errors.validation.invalid_option'],
    },
    weekEndDate: {
      type: String,
      required: [true, 'errors.validation.required'],
      trim: true,
      match: [weekDatePattern, 'errors.validation.invalid_option'],
    },
    // Plano do usuário capturado no momento da geração (não o plano atual) —
    // permite auditar retroativamente relatórios gerados antes de um downgrade.
    // `required` (sem default) força o gerador a sempre informar o valor,
    // já que não existe um default sensato para um snapshot de auditoria.
    isProAtGeneration: {
      type: Boolean,
      required: [true, 'errors.validation.required'],
    },
    data: {
      type: weeklyReportDataSchema,
      required: [true, 'errors.validation.required'],
    },
    previousWeekComparison: {
      type: weeklyReportComparisonSchema,
      required: false,
    },
  },
  {
    collection: 'weekly_reports',
    timestamps: { createdAt: true, updatedAt: false },
  }
);

weeklyReportSchema.index({ createdAt: 1 }, { expireAfterSeconds: WEEKLY_REPORT_TTL_SECONDS });
weeklyReportSchema.index({ userId: 1, weekStartDate: 1 }, { unique: true });

export const WeeklyReportModel = mongoose.model<IWeeklyReport>('WeeklyReport', weeklyReportSchema);
