import { DailyMissionModel, type IDailyMissionItem, type DailyMissionDocument } from '../models/DailyMission';
import { UserModel } from '../models/User';
import { FavoriteModel } from '../models/Favorite';
import { awardXP } from './xp.service';
import { MISSION_DEFINITIONS, MISSION_POOLS, FALLBACK_MISSION_TYPES } from '../config/missionDefinitions';
import { toLocalDate } from '../utils/timezone.utils';

const MISSION_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const FREE_TIER_SCAN_LIMIT = 3;
const DEFAULT_RESULT = {
  missionUpdated: false,
  missionCompleted: false,
  allMissionsCompleted: false,
  totalXPAwarded: 0,
};
const MISSION_XP_REWARDS: Record<string, number> = {
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
};

type MissionXPType = Parameters<typeof awardXP>[1];

type MissionGenerationUser = {
  goal: keyof typeof MISSION_POOLS;
  supplementStack?: Array<{ isActive?: boolean }>;
  scanCount?: number;
  isPro?: boolean;
};

function isDuplicateKeyError(err: unknown): err is { code: number } {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === 11000;
}

function formatMissionDate(timezone: string): string {
  const localNow = toLocalDate(new Date(), timezone);
  const year = localNow.getUTCFullYear();
  const month = String(localNow.getUTCMonth() + 1).padStart(2, '0');
  const day = String(localNow.getUTCDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function shuffleInPlace(values: string[]): void {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [values[index], values[randomIndex]] = [values[randomIndex], values[index]];
  }
}

function getMissionDefinition(type: string) {
  const definition = MISSION_DEFINITIONS.find(item => item.type === type);

  if (!definition) {
    throw new Error(`Mission definition not found for type: ${type}`);
  }

  return definition;
}

function resolveMissionXPReward(xpRewardType: string): number {
  const xpReward = MISSION_XP_REWARDS[xpRewardType];

  if (!Number.isInteger(xpReward) || xpReward <= 0) {
    throw new Error(`Mission XP reward not found for type: ${xpRewardType}`);
  }

  return xpReward;
}

async function reconcileMissionBonus(
  userId: string,
  timezone: string,
  dailyMissionDocument: DailyMissionDocument
): Promise<{ allMissionsCompleted: boolean; totalXPAwarded: number }> {
  const allMissionsCompleted = dailyMissionDocument.missions.every(item => item.completed);

  if (!allMissionsCompleted || dailyMissionDocument.bonusAwarded) {
    return {
      allMissionsCompleted,
      totalXPAwarded: 0,
    };
  }

  const bonusXPResult = await awardXP(userId, 'missionBonus' as MissionXPType, timezone);
  let totalXPAwarded = 0;

  if (bonusXPResult.awarded) {
    totalXPAwarded += bonusXPResult.amount;
  }

  await DailyMissionModel.updateOne(
    {
      _id: dailyMissionDocument._id,
      bonusAwarded: false,
    },
    {
      $set: {
        bonusAwarded: true,
      },
    }
  );

  return {
    allMissionsCompleted: true,
    totalXPAwarded,
  };
}

async function generateDailyMissions(
  user: MissionGenerationUser,
  localDate: string
): Promise<[IDailyMissionItem, IDailyMissionItem, IDailyMissionItem]> {
  if (!MISSION_DATE_PATTERN.test(localDate)) {
    throw new Error(`Invalid mission date: ${localDate}`);
  }

  const goalPool = MISSION_POOLS[user.goal];

  if (!goalPool) {
    throw new Error(`Mission pool not found for goal: ${String(user.goal)}`);
  }

  const activeSupplementCount = Array.isArray(user.supplementStack)
    ? user.supplementStack.filter(item => item?.isActive === true).length
    : 0;
  const favoriteCount = await FavoriteModel.countDocuments({ userId: userIdFromGenerationUser(user) });
  const shouldRemoveScanPantry = !user.isPro && (user.scanCount ?? 0) >= FREE_TIER_SCAN_LIMIT;

  const filteredPool = goalPool.filter(entry => {
    if (entry.type === 'completeSuppStack' && activeSupplementCount === 0) {
      return false;
    }

    if (entry.type === 'makeBlendFromFavorite' && favoriteCount === 0) {
      return false;
    }

    if (entry.type === 'scanPantry' && shouldRemoveScanPantry) {
      return false;
    }

    return true;
  });

  const normalizedPool = [...filteredPool];
  const selectedTypeSet = new Set(normalizedPool.map(entry => entry.type));

  for (const fallbackType of FALLBACK_MISSION_TYPES) {
    if (selectedTypeSet.size >= 3) {
      break;
    }

    if (!selectedTypeSet.has(fallbackType)) {
      normalizedPool.push({ type: fallbackType, weight: 1 });
      selectedTypeSet.add(fallbackType);
    }
  }

  if (selectedTypeSet.size < 3) {
    throw new Error('Unable to build a mission pool with at least three unique mission types.');
  }

  const expandedPool = normalizedPool.flatMap(entry => Array(entry.weight).fill(entry.type));
  shuffleInPlace(expandedPool);

  const selectedTypes: string[] = [];
  const seenTypes = new Set<string>();

  for (const type of expandedPool) {
    if (seenTypes.has(type)) {
      continue;
    }

    selectedTypes.push(type);
    seenTypes.add(type);

    if (selectedTypes.length === 3) {
      break;
    }
  }

  if (selectedTypes.length < 3) {
    throw new Error('Unable to select three unique daily mission types.');
  }

  return selectedTypes.map(type => {
    const definition = getMissionDefinition(type);

    return {
      missionId: globalThis.crypto.randomUUID(),
      type: definition.type,
      titleKey: definition.titleKey,
      descriptionKey: definition.descriptionKey,
      requirement: definition.requirement,
      progress: 0,
      completed: false,
      xpReward: resolveMissionXPReward(definition.xpRewardType),
    };
  }) as [IDailyMissionItem, IDailyMissionItem, IDailyMissionItem];
}

function userIdFromGenerationUser(user: MissionGenerationUser & { _id?: unknown }): unknown {
  if (!('_id' in user) || user._id == null) {
    throw new Error('User _id is required to generate daily missions.');
  }

  return user._id;
}

async function findOrCreateDailyMission(userId: string, missionDate: string): Promise<DailyMissionDocument> {
  const existingMissionDocument = await DailyMissionModel.findOne({ userId, missionDate });

  if (existingMissionDocument) {
    return existingMissionDocument;
  }

  const user = await UserModel.findById(userId).select({
    goal: 1,
    supplementStack: 1,
    scanCount: 1,
    isPro: 1,
  });

  if (!user) {
    throw new Error('User not found.');
  }

  const missions = await generateDailyMissions(user as MissionGenerationUser & { _id: unknown }, missionDate);

  try {
    await DailyMissionModel.insertOne({
      userId,
      missionDate,
      missions,
      bonusAwarded: false,
    });
  } catch (err) {
    if (!isDuplicateKeyError(err)) {
      throw err;
    }
  }

  const createdMissionDocument = await DailyMissionModel.findOne({ userId, missionDate });

  if (!createdMissionDocument) {
    throw new Error('Daily mission document could not be created.');
  }

  return createdMissionDocument;
}

export async function updateMissionProgress(userId: string, missionType: string, timezone: string) {
  const missionDate = formatMissionDate(timezone);
  const dailyMissionDocument = await findOrCreateDailyMission(userId, missionDate);
  const mission = dailyMissionDocument.missions.find(item => item.type === missionType);

  if (!mission) {
    const bonusResult = await reconcileMissionBonus(userId, timezone, dailyMissionDocument);

    return {
      missionUpdated: false,
      missionCompleted: false,
      allMissionsCompleted: bonusResult.allMissionsCompleted,
      totalXPAwarded: bonusResult.totalXPAwarded,
    };
  }

  if (mission.completed) {
    const bonusResult = await reconcileMissionBonus(userId, timezone, dailyMissionDocument);

    return {
      missionUpdated: false,
      missionCompleted: false,
      allMissionsCompleted: bonusResult.allMissionsCompleted,
      totalXPAwarded: bonusResult.totalXPAwarded,
    };
  }

  const incrementedMissionDocument = await DailyMissionModel.findOneAndUpdate(
    {
      _id: dailyMissionDocument._id,
      'missions.type': missionType,
      'missions.completed': false,
    },
    {
      $inc: {
        'missions.$.progress': 1,
      },
    },
    {
      new: true,
    }
  );

  if (!incrementedMissionDocument) {
    return DEFAULT_RESULT;
  }

  const incrementedMission = incrementedMissionDocument.missions.find(item => item.type === missionType);

  if (!incrementedMission) {
    return DEFAULT_RESULT;
  }

  let missionCompleted = false;
  let allMissionsCompleted = false;
  let totalXPAwarded = 0;
  let currentMissionDocument = incrementedMissionDocument;

  if (incrementedMission.progress >= incrementedMission.requirement) {
    const completedMissionDocument = await DailyMissionModel.findOneAndUpdate(
      {
        _id: incrementedMissionDocument._id,
        'missions.type': missionType,
        'missions.completed': false,
      },
      {
        $set: {
          'missions.$.completed': true,
        },
      },
      {
        new: true,
      }
    );

    if (completedMissionDocument) {
      currentMissionDocument = completedMissionDocument;
      missionCompleted = true;

      const missionDefinition = getMissionDefinition(missionType);
      const missionXPResult = await awardXP(userId, missionDefinition.xpRewardType as MissionXPType, timezone);

      if (missionXPResult.awarded) {
        totalXPAwarded += missionXPResult.amount;
      }
    }
  }

  const bonusResult = await reconcileMissionBonus(userId, timezone, currentMissionDocument);
  allMissionsCompleted = bonusResult.allMissionsCompleted;
  totalXPAwarded += bonusResult.totalXPAwarded;

  return {
    missionUpdated: true,
    missionCompleted,
    allMissionsCompleted,
    totalXPAwarded,
  };
}

export async function getDailyMissionsForUser(userId: string, timezone: string): Promise<DailyMissionDocument> {
  const missionDate = formatMissionDate(timezone);
  return findOrCreateDailyMission(userId, missionDate);
}
