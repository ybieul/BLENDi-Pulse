export interface MissionDefinition {
  type: string;
  titleKey: string;
  descriptionKey: string;
  requirement: number;
  xpRewardType: string;
  icon: string;
}

export interface MissionPoolEntry {
  type: string;
  weight: number;
}

export type MissionGoal = 'Muscle' | 'Wellness' | 'Energy' | 'Recovery';

export const MISSION_DEFINITIONS: MissionDefinition[] = [
  {
    type: 'makeBlend',
    titleKey: 'missions.makeBlend.title',
    descriptionKey: 'missions.makeBlend.description',
    requirement: 1,
    xpRewardType: 'missionMakeBlend',
    icon: 'cafe-outline',
  },
  {
    type: 'hitProteinGoal',
    titleKey: 'missions.hitProteinGoal.title',
    descriptionKey: 'missions.hitProteinGoal.description',
    requirement: 1,
    xpRewardType: 'missionHitProteinGoal',
    icon: 'barbell-outline',
  },
  {
    type: 'hitCalorieGoal',
    titleKey: 'missions.hitCalorieGoal.title',
    descriptionKey: 'missions.hitCalorieGoal.description',
    requirement: 1,
    xpRewardType: 'missionHitCalorieGoal',
    icon: 'flame-outline',
  },
  {
    type: 'hitHydrationGoal',
    titleKey: 'missions.hitHydrationGoal.title',
    descriptionKey: 'missions.hitHydrationGoal.description',
    requirement: 1,
    xpRewardType: 'missionHitHydrationGoal',
    icon: 'water-outline',
  },
  {
    type: 'completeSuppStack',
    titleKey: 'missions.completeSuppStack.title',
    descriptionKey: 'missions.completeSuppStack.description',
    requirement: 1,
    xpRewardType: 'missionCompleteSuppStack',
    icon: 'checkmark-circle-outline',
  },
  {
    type: 'usePulseAI',
    titleKey: 'missions.usePulseAI.title',
    descriptionKey: 'missions.usePulseAI.description',
    requirement: 1,
    xpRewardType: 'missionUsePulseAI',
    icon: 'sparkles-outline',
  },
  {
    type: 'favoriteRecipe',
    titleKey: 'missions.favoriteRecipe.title',
    descriptionKey: 'missions.favoriteRecipe.description',
    requirement: 1,
    xpRewardType: 'missionFavoriteRecipe',
    icon: 'heart-outline',
  },
  {
    type: 'scanPantry',
    titleKey: 'missions.scanPantry.title',
    descriptionKey: 'missions.scanPantry.description',
    requirement: 1,
    xpRewardType: 'missionScanPantry',
    icon: 'camera-outline',
  },
  {
    type: 'makeBlendFromFavorite',
    titleKey: 'missions.makeBlendFromFavorite.title',
    descriptionKey: 'missions.makeBlendFromFavorite.description',
    requirement: 1,
    xpRewardType: 'missionMakeBlendFromFavorite',
    icon: 'star-outline',
  },
];

export const MISSION_POOLS: Record<MissionGoal, MissionPoolEntry[]> = {
  Muscle: [
    { type: 'makeBlend', weight: 3 },
    { type: 'hitProteinGoal', weight: 3 },
    { type: 'hitCalorieGoal', weight: 2 },
    { type: 'makeBlendFromFavorite', weight: 2 },
    { type: 'usePulseAI', weight: 1 },
    { type: 'favoriteRecipe', weight: 1 },
  ],
  Wellness: [
    { type: 'hitHydrationGoal', weight: 3 },
    { type: 'completeSuppStack', weight: 3 },
    { type: 'usePulseAI', weight: 2 },
    { type: 'makeBlend', weight: 1 },
    { type: 'scanPantry', weight: 1 },
    { type: 'favoriteRecipe', weight: 1 },
  ],
  Energy: [
    { type: 'hitCalorieGoal', weight: 3 },
    { type: 'hitHydrationGoal', weight: 2 },
    { type: 'makeBlend', weight: 2 },
    { type: 'usePulseAI', weight: 1 },
    { type: 'scanPantry', weight: 1 },
    { type: 'makeBlendFromFavorite', weight: 1 },
  ],
  Recovery: [
    { type: 'completeSuppStack', weight: 3 },
    { type: 'hitHydrationGoal', weight: 3 },
    { type: 'usePulseAI', weight: 2 },
    { type: 'makeBlend', weight: 1 },
    { type: 'favoriteRecipe', weight: 1 },
    { type: 'scanPantry', weight: 1 },
  ],
};

export const FALLBACK_MISSION_TYPES: string[] = ['makeBlend', 'usePulseAI', 'hitHydrationGoal'];
