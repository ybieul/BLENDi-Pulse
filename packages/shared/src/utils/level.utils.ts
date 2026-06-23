export const LEVEL_THRESHOLDS: number[] = [0, 0, 100, 250, 500, 850, 1300, 1850, 2500, 3250, 4100];

// Estas chaves devem existir no namespace `levels` dos arquivos de tradução.
export const LEVEL_NAMES = [
  'levels.beginner',
  'levels.explorer',
  'levels.seeker',
  'levels.builder',
  'levels.warrior',
  'levels.champion',
  'levels.expert',
  'levels.master',
  'levels.elite',
  'levels.legend',
] as const;

export interface LevelInfo {
  level: number;
  levelNameKey: string;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  progress: number;
  xpToNextLevel: number;
}

function normalizeXP(totalXP: number): number {
  if (!Number.isFinite(totalXP) || Number.isNaN(totalXP) || totalXP < 0) {
    return 0;
  }

  return Math.floor(totalXP);
}

function getLevelThreshold(level: number): number {
  if (level <= 10) {
    return LEVEL_THRESHOLDS[level] ?? LEVEL_THRESHOLDS[10];
  }

  // Para níveis acima de 10, seguimos a progressão dinâmica do CP2.3:
  // nível 11 = 5100, nível 12 = 6200, e cada novo nível cresce sobre o
  // threshold anterior com incremento base de 1000 XP, aumentado em 100 XP
  // adicionais por nível subsequente acima de 10.
  let threshold = LEVEL_THRESHOLDS[10];

  for (let currentLevel = 11; currentLevel <= level; currentLevel += 1) {
    threshold += 1000 + (currentLevel - 11) * 100;
  }

  return threshold;
}

function getLevelNameKey(level: number): string {
  if (level <= LEVEL_NAMES.length) {
    return LEVEL_NAMES[level - 1];
  }

  return 'levels.guru';
}

export const XP_EVENTS = {
  blend: 10,
  proteinGoal: 8,
  calorieGoal: 5,
  hydrationGoal: 5,
  supplementGoal: 5,
  pulseAi: 3,
  pantryScanner: 5,
  favoriteRecipe: 2,
  missionMakeBlend: 15,
  missionHitProteinGoal: 20,
  missionHitCalorieGoal: 15,
  missionHitHydrationGoal: 15,
  missionCompleteSuppStack: 20,
  missionUsePulseAI: 10,
  missionFavoriteRecipe: 10,
  missionScanPantry: 15,
  missionMakeBlendFromFavorite: 15,
  missionBonus: 20,
} as const;

export type XPEventType = keyof typeof XP_EVENTS;

export function calculateLevel(totalXP: number): LevelInfo {
  const normalizedXP = normalizeXP(totalXP);

  let currentLevel = 1;

  while (normalizedXP >= getLevelThreshold(currentLevel + 1)) {
    currentLevel += 1;
  }

  const xpForCurrentLevel = getLevelThreshold(currentLevel);
  const xpForNextLevel = getLevelThreshold(currentLevel + 1);
  const rawProgress = (normalizedXP - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel);
  const progress = Math.min(1, Math.max(0, rawProgress));

  return {
    level: currentLevel,
    levelNameKey: getLevelNameKey(currentLevel),
    xpForCurrentLevel,
    xpForNextLevel,
    progress,
    xpToNextLevel: Math.max(0, xpForNextLevel - normalizedXP),
  };
}
