export interface WeeklyReportBestDay {
  date: string;
  proteinAmount: number;
}

export interface WeeklyReportHighlightRecipe {
  name: string;
  protein: number;
  carbs: number;
  fat: number;
  calories: number;
  rating?: number;
}

export interface WeeklyReportNutrition {
  blendCount: number;
  avgProteinPerDay: number;
  proteinGoalHitDays: number;
  calorieGoalHitDays: number;
  bestDay: WeeklyReportBestDay;
  highlightRecipe?: WeeklyReportHighlightRecipe;
}

export interface WeeklyReportHydration {
  totalMl: number;
  avgDailyMl: number;
  goalHitDays: number;
  dailyBreakdown: number[];
}

export interface WeeklyReportSupplements {
  adherenceRate: number;
  perfectDays: number;
  bySupplementName: Record<string, number>;
  topSupplement: string;
  bottomSupplement: string;
}

export interface WeeklyReportGamification {
  xpEarned: number;
  currentLevel: number;
  missionsCompleted: number;
  blendDaysInWeek: number;
  currentStreak: number;
  streakBrokenOnDate?: string;
  levelUpOccurred: boolean;
}

export interface WeeklyReportData {
  nutrition: WeeklyReportNutrition;
  hydration: WeeklyReportHydration;
  supplements: WeeklyReportSupplements;
  gamification: WeeklyReportGamification;
}

export interface WeeklyReportComparison {
  avgProteinPerDayDeltaPercent: number;
  avgDailyMlDeltaPercent: number;
  adherenceRateDeltaPercent: number;
}

export interface WeeklyReportSummary {
  id: string;
  weekStartDate: string;
  weekEndDate: string;
  isProAtGeneration: boolean;
  data: WeeklyReportData;
  previousWeekComparison?: WeeklyReportComparison;
  createdAt: string;
}
