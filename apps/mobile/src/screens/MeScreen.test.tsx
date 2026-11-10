// Me (CP-1.1.1b): o card de configurações perdeu as linhas de proteína,
// carboidratos, calorias e hidratação, ganhou a linha "Minhas metas" (resumo +
// navegação para a tela nova) e o cálculo dos badges recebe a posse do BLENDi.
//
// O MeScreen é grande e puxa muita coisa nativa (câmera, arquivos, compra,
// MMKV...). Aqui só os pontos que importam ao teste são reais: o card de
// configurações (SettingRow), o React Query e a tradução em inglês de verdade
// (en.json) — o resto é mockado.
import { fireEvent, render } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps } from 'react';

import en from '../locales/en.json';

type Json = { [key: string]: Json | string };

// Tradução real do en.json (com {{interpolação}}): os textos da tela aparecem
// como o usuário os vê, e uma chave inexistente aparece como a própria chave.
jest.mock('../hooks/useAppTranslation', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- hoisting do jest
  const enJson: Json = require('../locales/en.json');
  const t = (key: string, options?: Record<string, unknown>): string => {
    const value = key.split('.').reduce<Json | string | undefined>(
      (node, part) => (typeof node === 'object' ? node[part] : undefined),
      enJson,
    );
    if (typeof value !== 'string') {
      return key;
    }
    return value.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
      const replacement = options?.[name];
      return typeof replacement === 'string' || typeof replacement === 'number' ? String(replacement) : '';
    });
  };
  return { useAppTranslation: () => ({ t, locale: 'en', changeLocale: jest.fn() }) };
});

jest.mock('../hooks/useColors', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-unsafe-assignment -- hoisting do jest
  const { lightColors } = require('@blendi/shared');
  // eslint-disable-next-line @typescript-eslint/no-unsafe-return -- hoisting do jest
  return { useColors: () => lightColors };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}));

jest.mock('../components/ui/AuroraBackground', () => ({ AuroraBackground: () => null }));
jest.mock('../components/profile/ProfilePhoto', () => ({
  ProfilePhoto: () => null,
  cacheProfilePhoto: jest.fn(),
  clearProfilePhotoCache: jest.fn(),
}));
jest.mock('../components/shareCards/WeeklyShareCard', () => ({ WeeklyShareCard: () => null }));
jest.mock('../utils/shareCard.utils', () => ({ generateAndShare: jest.fn() }));
jest.mock('../utils/toast.utils', () => ({ showToast: jest.fn() }));
jest.mock('../config/storage', () => ({
  createAppStorage: () => ({ delete: jest.fn(), getString: jest.fn(), set: jest.fn() }),
}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-image-manipulator', () => ({ SaveFormat: { JPEG: 'jpeg' }, manipulateAsync: jest.fn() }));
jest.mock('expo-file-system/legacy', () => ({ EncodingType: { Base64: 'base64' } }));
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.0.0' } } }));

jest.mock('../hooks/usePulseProPurchase', () => ({
  usePulseProPurchase: () => ({
    availablePlans: [],
    isBusy: false,
    loadPurchasePlans: jest.fn().mockResolvedValue(undefined),
    restoreProAccess: jest.fn(),
  }),
}));

jest.mock('../hooks/useNotificationPreferences', () => ({
  useNotificationPreferences: () => ({
    preferences: { dailyPulse: true, streakReminder: true, supplementReminder: true, hydrationReminder: true },
    dailyPulseTime: { hour: 8, minute: 0 },
    togglePreference: jest.fn(),
    updateDailyPulseTime: jest.fn(),
  }),
}));

jest.mock('../store/theme.store', () => ({
  useThemeStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({ mode: 'dark', setMode: jest.fn() }),
}));

const mockApiGet = jest.fn<Promise<unknown>, unknown[]>();
jest.mock('../config/api', () => ({
  api: { get: (...args: unknown[]) => mockApiGet(...args), patch: jest.fn(), delete: jest.fn(), post: jest.fn() },
}));

jest.mock('../store/auth.store', () => ({
  useAuthStore: (selector: (state: Record<string, unknown>) => unknown) =>
    selector({
      user: {
        id: 'user-1',
        name: 'Gabriel',
        email: 'gabriel@example.com',
        blendiModel: 'Lite',
        goal: 'Muscle',
        locale: 'en',
        unitSystem: 'metric',
        dailyProteinTarget: 120,
        dailyCalorieTarget: 1800,
        dailyCarbTarget: 150,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      logout: jest.fn(),
      deleteAccount: jest.fn(),
      updateUserProfile: jest.fn(),
    }),
}));

// Espia calculateUserBadges sem trocar o cálculo real.
jest.mock('../utils/badges.utils', () => {
  const actual = jest.requireActual<typeof import('../utils/badges.utils')>('../utils/badges.utils');
  return { ...actual, calculateUserBadges: jest.fn(actual.calculateUserBadges) };
});

import { SettingRow } from '../components/me/SettingRow';
import { QUERY_KEYS } from '../config/cache.config';
import { calculateUserBadges } from '../utils/badges.utils';
import { MeScreen } from './MeScreen';

type MeProps = ComponentProps<typeof MeScreen>;

const mockNavigate = jest.fn();
const navigation = {
  canGoBack: () => false,
  goBack: jest.fn(),
  getParent: () => ({ navigate: mockNavigate }),
};

const PROFILE = {
  id: 'user-1',
  name: 'Gabriel',
  email: 'gabriel@example.com',
  blendiModel: 'Lite',
  blendiOwnership: 'blendi',
  goal: 'Muscle',
  preferredLanguage: 'en',
  timezone: 'America/Sao_Paulo',
  unitSystem: 'metric',
  dailyProteinTarget: 150,
  dailyCarbTarget: 200,
  dailyCalorieTarget: 2100,
  dailyHydrationTarget: 3000,
  currentStreak: 2,
  longestStreak: 5,
  blendCount: 12,
  totalXP: 100,
  isPro: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  hasRealBodyProfile: true,
};

function renderMe(profile: Record<string, unknown> = PROFILE) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  queryClient.setQueryData(QUERY_KEYS.userProfile, { success: true, data: { user: profile } });

  const props = { navigation, route: { key: 'me', name: 'Me' } } as unknown as MeProps;
  return render(
    <QueryClientProvider client={queryClient}>
      <MeScreen {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockNavigate.mockReset();
  mockApiGet.mockReset().mockResolvedValue({ data: { success: true, data: { user: PROFILE } } });
  (calculateUserBadges as jest.Mock).mockClear();
});

describe('MeScreen — card de configurações', () => {
  it('as 4 linhas de metas saíram: proteína, carboidratos, calorias e hidratação', () => {
    const { queryByText } = renderMe();

    expect(queryByText(en.profile.fields.model)).toBeTruthy(); // sanidade: o card está renderizado
    expect(queryByText('Protein target')).toBeNull();
    expect(queryByText('Carbs target')).toBeNull();
    expect(queryByText('Calorie target')).toBeNull();
    expect(queryByText(en.track.hydration)).toBeNull();
    // Nem como valor solto das linhas antigas (hidratação do perfil: 3000 ml).
    expect(queryByText('3000 ml')).toBeNull();
    expect(queryByText('3,000 ml')).toBeNull();
    // Nem como chave de tradução crua (as chaves antigas saíram do en.json).
    expect(queryByText(/protein_target|settingCarbs|calories_target|track\.hydration/)).toBeNull();
  });

  it('o card tem exatamente 6 linhas: modelo, goal, minhas metas, unidade, idioma e tema', () => {
    const { UNSAFE_getAllByType, getByText } = renderMe();
    const labels = UNSAFE_getAllByType(SettingRow).map((row) => (row.props as { label: string }).label);

    expect(labels).toEqual([
      en.profile.fields.model,
      en.profile.fields.goal,
      en.nutritionGoals.rowLabel,
      en.profile.unitSystem,
      en.profile.language.label,
      en.me.theme.label,
    ]);
    // O valor de hidratação (3000 ml) não aparece em lugar nenhum do Me.
    expect(() => getByText(/3[.,]?000/)).toThrow();
  });

  it('modelo, goal, unidade, idioma e tema continuam no card', () => {
    const { getByText } = renderMe();

    for (const label of [
      en.profile.fields.model,
      en.profile.fields.goal,
      en.profile.unitSystem,
      en.profile.language.label,
      en.me.theme.label,
    ]) {
      expect(getByText(label)).toBeTruthy();
    }
  });

  it('a nova linha "Minhas metas" mostra proteína e calorias atuais do perfil', () => {
    const { getByText } = renderMe();

    expect(getByText('My goals')).toBeTruthy();
    expect(getByText('150g · 2,100 kcal')).toBeTruthy();
  });

  it('valores extremos do shared cabem no resumo sem quebrar (800g · 15,000 kcal)', () => {
    const { getByText } = renderMe({ ...PROFILE, dailyProteinTarget: 800, dailyCalorieTarget: 15000 });

    expect(getByText('800g · 15,000 kcal')).toBeTruthy();
  });

  it('zero é valor legítimo no resumo (proteína 0 não cai no fallback)', () => {
    const { getByText } = renderMe({ ...PROFILE, dailyProteinTarget: 0 });

    expect(getByText('0g · 2,100 kcal')).toBeTruthy();
  });

  it('perfil sem as metas cai no usuário local (120g · 1,800 kcal), nunca em "undefined"/"NaN"', () => {
    const withoutTargets: Partial<typeof PROFILE> = { ...PROFILE };
    delete withoutTargets.dailyProteinTarget;
    delete withoutTargets.dailyCalorieTarget;
    const { getByText, queryByText } = renderMe(withoutTargets);

    expect(getByText('120g · 1,800 kcal')).toBeTruthy();
    expect(queryByText(/undefined|NaN|null/)).toBeNull();
  });

  it('tocar em "Minhas metas" abre a tela nova no root stack', () => {
    const { getByText } = renderMe();

    fireEvent.press(getByText('My goals'));

    expect(mockNavigate).toHaveBeenCalledTimes(1);
    expect(mockNavigate).toHaveBeenCalledWith('NutritionGoals');
  });

  it('a linha fica entre o goal e a unidade, no lugar das linhas antigas', () => {
    const { toJSON } = renderMe();
    const tree = JSON.stringify(toJSON());
    const positions = [en.profile.fields.goal, 'My goals', en.profile.unitSystem].map((text) => tree.indexOf(text));

    expect(positions.every((position) => position >= 0)).toBe(true);
    expect(positions[0]).toBeLessThan(positions[1] ?? -1);
    expect(positions[1]).toBeLessThan(positions[2] ?? -1);
  });
});

describe('MeScreen — badges de modelo', () => {
  it('o perfil usado no cálculo dos badges recebe a posse do BLENDi', () => {
    renderMe({ ...PROFILE, blendiModel: 'Lite', blendiOwnership: 'none' });

    expect(calculateUserBadges).toHaveBeenCalledWith(
      expect.objectContaining({ blendiModel: 'Lite', blendiOwnership: 'none' }),
    );
  });

  it('conta antiga (sem o campo de posse) é calculada como "blendi"', () => {
    const legacyProfile: Partial<typeof PROFILE> = { ...PROFILE };
    delete legacyProfile.blendiOwnership;
    renderMe(legacyProfile);

    expect(calculateUserBadges).toHaveBeenCalledWith(
      expect.objectContaining({ blendiModel: 'Lite', blendiOwnership: 'blendi' }),
    );
  });
});
