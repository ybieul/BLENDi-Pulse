// CP-B6 — Me × alergias: linha "Alergias" (abre a tela própria) e o convite
// único "Isso é alergia?" para quem marcou nut_free sem alergia cadastrada;
// fechar grava no usuário e o convite não volta.
//
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ComponentProps } from 'react';

import en from '../locales/en.json';

type Json = { [key: string]: Json | string };

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
const mockApiPatch = jest.fn<Promise<unknown>, unknown[]>();
jest.mock('../config/api', () => ({
  api: {
    get: (...args: unknown[]) => mockApiGet(...args),
    patch: (...args: unknown[]) => mockApiPatch(...args),
    delete: jest.fn(() => Promise.resolve()),
    post: jest.fn(),
  },
}));

const mockUpdateUserProfile = jest.fn();
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
      updateUserProfile: mockUpdateUserProfile,
    }),
}));

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
  mockApiPatch.mockReset();
  mockUpdateUserProfile.mockReset();
  (calculateUserBadges as jest.Mock).mockClear();
});

describe('MeScreen — alergias (CP-B6)', () => {
  it('linha "Alergias" com o resumo e abre a tela de alergias', () => {
    const utils = renderMe({ ...PROFILE, allergies: { common: ['peanut'], custom: ['kiwi'] } });
    const row = utils.UNSAFE_getAllByType(SettingRow).find(
      (node) => (node.props as { label: string }).label === en.allergies.profile.rowLabel,
    );
    expect(row).toBeTruthy();
    // O mock de tradução deste teste não resolve plural (rowCount_one/_other).
    expect((row?.props as { value: string }).value).toBe('allergies.profile.rowCount');
    expect(en.allergies.profile.rowCount_other).toBe('{{count}} items');

    fireEvent.press(utils.getByText(en.allergies.profile.rowLabel));
    expect(mockNavigate).toHaveBeenCalledWith('Allergies');
  });

  it('sem alergia: "Nenhuma"', () => {
    const utils = renderMe();
    expect(utils.getByText(en.allergies.profile.rowNone)).toBeTruthy();
  });

  it('convite aparece para nut_free sem alergia; o botão abre a tela', () => {
    const utils = renderMe({ ...PROFILE, dietaryPreferences: ['nut_free'] });
    expect(utils.getByTestId('allergy-invite')).toBeTruthy();
    fireEvent.press(utils.getByTestId('allergy-invite-cta'));
    expect(mockNavigate).toHaveBeenCalledWith('Allergies');
  });

  it('fechar grava no usuário (PATCH) e esconde; não converte a preferência', async () => {
    mockApiPatch.mockResolvedValue({ data: { success: true } });
    const utils = renderMe({ ...PROFILE, dietaryPreferences: ['nut_free'] });

    fireEvent.press(utils.getByTestId('allergy-invite-dismiss'));

    expect(utils.queryByTestId('allergy-invite')).toBeNull();
    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalledWith('/users/me', { allergyInviteDismissed: true });
    });
    expect(mockUpdateUserProfile).toHaveBeenCalledWith({ allergyInviteDismissed: true });
  });

  it('não aparece depois de fechado, com alergia cadastrada ou sem nut_free', () => {
    expect(renderMe({ ...PROFILE, dietaryPreferences: ['nut_free'], allergyInviteDismissed: true }).queryByTestId('allergy-invite')).toBeNull();
    expect(
      renderMe({ ...PROFILE, dietaryPreferences: ['nut_free'], allergies: { common: ['tree_nuts'], custom: [] } }).queryByTestId('allergy-invite'),
    ).toBeNull();
    expect(renderMe({ ...PROFILE, dietaryPreferences: ['vegan'] }).queryByTestId('allergy-invite')).toBeNull();
  });

  it('PATCH falhou: continua escondido nesta sessão', async () => {
    mockApiPatch.mockRejectedValue(new Error('offline'));
    const utils = renderMe({ ...PROFILE, dietaryPreferences: ['nut_free'] });
    fireEvent.press(utils.getByTestId('allergy-invite-dismiss'));
    await waitFor(() => {
      expect(mockApiPatch).toHaveBeenCalled();
    });
    expect(utils.queryByTestId('allergy-invite')).toBeNull();
  });
});
