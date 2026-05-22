import { colors } from '@blendi/shared';

export type BadgeStageName = 'bronze' | 'silver' | 'gold';
export type UserBadgeStage = BadgeStageName | 'locked';
export type BlendiModel = 'Lite' | 'ProPlus' | 'Steel';

export interface BadgeStage {
  stage: BadgeStageName;
  requirementKey: string;
  requirement: number;
  unlocked: boolean;
}

export interface Badge {
  id: string;
  category: string;
  titleKey: string;
  descriptionKey: string;
  icon: string;
  iconColor: string;
  stages: BadgeStage[];
}

export interface UserBadge extends Badge {
  currentStage: UserBadgeStage;
  progress: number;
}

export interface BadgeProfile {
  blendCount: number;
  longestStreak: number;
  blendiModel: BlendiModel;
}

const STREAK_MASTER_ICON_COLOR = 'rgba(245,158,11,1)';
const EARLY_ADOPTER_ICON_COLOR = 'rgba(34,197,94,0.90)';
const MODEL_LITE_ICON_COLOR = 'rgba(107,114,128,0.90)';
const MODEL_STEEL_ICON_COLOR = 'rgba(245,158,11,0.90)';

const MODEL_BADGE_IDS: Record<string, BlendiModel> = {
  blendi_model_lite: 'Lite',
  blendi_model_proplus: 'ProPlus',
  blendi_model_steel: 'Steel',
};

export const BADGE_DEFINITIONS: Badge[] = [
  {
    id: 'blend_journey',
    category: 'blend_journey',
    titleKey: 'me.badges.blendJourneyTitle',
    descriptionKey: 'me.badges.blendJourneyDescription',
    icon: 'barbell-outline',
    iconColor: colors.brand.pulse,
    stages: [
      {
        stage: 'bronze',
        requirementKey: 'me.badges.requirements.blendJourneyBronze',
        requirement: 1,
        unlocked: false,
      },
      {
        stage: 'silver',
        requirementKey: 'me.badges.requirements.blendJourneySilver',
        requirement: 10,
        unlocked: false,
      },
      {
        stage: 'gold',
        requirementKey: 'me.badges.requirements.blendJourneyGold',
        requirement: 50,
        unlocked: false,
      },
    ],
  },
  {
    id: 'streak_master',
    category: 'streak_master',
    titleKey: 'me.badges.streakMasterTitle',
    descriptionKey: 'me.badges.streakMasterDescription',
    icon: 'flash-outline',
    iconColor: STREAK_MASTER_ICON_COLOR,
    stages: [
      {
        stage: 'bronze',
        requirementKey: 'me.badges.requirements.streakMasterBronze',
        requirement: 3,
        unlocked: false,
      },
      {
        stage: 'silver',
        requirementKey: 'me.badges.requirements.streakMasterSilver',
        requirement: 7,
        unlocked: false,
      },
      {
        stage: 'gold',
        requirementKey: 'me.badges.requirements.streakMasterGold',
        requirement: 30,
        unlocked: false,
      },
    ],
  },
  {
    id: 'early_adopter',
    category: 'early_adopter',
    titleKey: 'me.badges.earlyAdopterTitle',
    descriptionKey: 'me.badges.earlyAdopterDesc',
    icon: 'star-outline',
    iconColor: EARLY_ADOPTER_ICON_COLOR,
    stages: [
      {
        stage: 'bronze',
        requirementKey: 'me.badges.requirements.earlyAdopter',
        requirement: 1,
        unlocked: true,
      },
    ],
  },
  {
    id: 'blendi_model_lite',
    category: 'blendi_model',
    titleKey: 'me.badges.blendiLiteTitle',
    descriptionKey: 'me.badges.blendiLiteDescription',
    icon: 'cafe-outline',
    iconColor: MODEL_LITE_ICON_COLOR,
    stages: [
      {
        stage: 'bronze',
        requirementKey: 'me.badges.requirements.blendiLite',
        requirement: 1,
        unlocked: false,
      },
    ],
  },
  {
    id: 'blendi_model_proplus',
    category: 'blendi_model',
    titleKey: 'me.badges.blendiProPlusTitle',
    descriptionKey: 'me.badges.blendiProPlusDescription',
    icon: 'cafe-outline',
    iconColor: colors.brand.pulse,
    stages: [
      {
        stage: 'bronze',
        requirementKey: 'me.badges.requirements.blendiProPlus',
        requirement: 1,
        unlocked: false,
      },
    ],
  },
  {
    id: 'blendi_model_steel',
    category: 'blendi_model',
    titleKey: 'me.badges.blendiSteelTitle',
    descriptionKey: 'me.badges.blendiSteelDescription',
    icon: 'cafe-outline',
    iconColor: MODEL_STEEL_ICON_COLOR,
    stages: [
      {
        stage: 'bronze',
        requirementKey: 'me.badges.requirements.blendiSteel',
        requirement: 1,
        unlocked: false,
      },
    ],
  },
];

function normalizeMetric(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  return value;
}

function clampProgress(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }

  if (value >= 1) {
    return 1;
  }

  return value;
}

function getBadgeMetric(profile: BadgeProfile, badge: Badge): number {
  switch (badge.category) {
    case 'blend_journey':
      return normalizeMetric(profile.blendCount);
    case 'streak_master':
      return normalizeMetric(profile.longestStreak);
    case 'early_adopter':
      return 1;
    case 'blendi_model':
      return MODEL_BADGE_IDS[badge.id] === profile.blendiModel ? 1 : 0;
    default:
      return 0;
  }
}

function getCurrentStage(stages: BadgeStage[]): UserBadgeStage {
  const unlockedStages = stages.filter(stage => stage.unlocked);

  if (unlockedStages.length === 0) {
    return 'locked';
  }

  return unlockedStages[unlockedStages.length - 1].stage;
}

function getProgress(currentValue: number, stages: BadgeStage[]): number {
  const nextLockedStage = stages.find(stage => !stage.unlocked);

  if (!nextLockedStage) {
    return 1;
  }

  return clampProgress(currentValue / nextLockedStage.requirement);
}

export function calculateUserBadges(profile: BadgeProfile): UserBadge[] {
  return BADGE_DEFINITIONS.map(badge => {
    const currentValue = getBadgeMetric(profile, badge);
    const stages = badge.stages.map(stage => ({
      ...stage,
      unlocked: currentValue >= stage.requirement,
    }));

    return {
      ...badge,
      stages,
      currentStage: getCurrentStage(stages),
      progress: getProgress(currentValue, stages),
    };
  });
}