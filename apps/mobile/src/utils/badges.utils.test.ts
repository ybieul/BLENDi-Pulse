// CP-1.1.1b, Tarefa 6 — os 3 badges de modelo só contam quando a pessoa tem um
// BLENDi de verdade (blendiOwnership 'blendi'). "Other or older model" e "No
// BLENDi yet" gravam blendiModel 'Lite' sem que a pessoa tenha um BLENDi, e
// antes ganhavam o badge "BLENDi Lite".
import { calculateUserBadges, type BadgeProfile } from './badges.utils';

const BASE_PROFILE: BadgeProfile = { blendCount: 0, longestStreak: 0, blendiModel: 'Lite' };

function unlockedModelBadgeIds(profile: BadgeProfile): string[] {
  return calculateUserBadges(profile)
    .filter((badge) => badge.category === 'blendi_model' && badge.currentStage !== 'locked')
    .map((badge) => badge.id);
}

describe('calculateUserBadges — badges de modelo e posse', () => {
  it('Lite com posse "blendi" ganha o badge BLENDi Lite', () => {
    expect(unlockedModelBadgeIds({ ...BASE_PROFILE, blendiOwnership: 'blendi' })).toEqual(['blendi_model_lite']);
  });

  it.each(['other', 'none'] as const)('Lite com posse "%s" não ganha nenhum badge de modelo', (ownership) => {
    expect(unlockedModelBadgeIds({ ...BASE_PROFILE, blendiOwnership: ownership })).toEqual([]);
  });

  it('conta antiga sem o campo de posse conta como "blendi"', () => {
    expect(unlockedModelBadgeIds(BASE_PROFILE)).toEqual(['blendi_model_lite']);
    expect(unlockedModelBadgeIds({ ...BASE_PROFILE, blendiModel: 'Steel' })).toEqual(['blendi_model_steel']);
  });

  it.each([
    ['ProPlus', 'blendi_model_proplus'],
    ['Steel', 'blendi_model_steel'],
  ] as const)('%s com posse "blendi" ganha só o badge do próprio modelo', (model, badgeId) => {
    expect(unlockedModelBadgeIds({ ...BASE_PROFILE, blendiModel: model, blendiOwnership: 'blendi' })).toEqual([badgeId]);
  });

  it('a posse só afeta os badges de modelo, não os de blends e sequência', () => {
    const badges = calculateUserBadges({
      blendCount: 12,
      longestStreak: 8,
      blendiModel: 'Lite',
      blendiOwnership: 'none',
    });
    const stage = (id: string) => badges.find((badge) => badge.id === id)?.currentStage;

    expect(stage('blend_journey')).toBe('silver');
    expect(stage('streak_master')).toBe('silver');
    expect(stage('early_adopter')).toBe('bronze');
    expect(stage('blendi_model_lite')).toBe('locked');
  });
});
