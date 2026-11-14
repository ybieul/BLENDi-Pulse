// CP-1.1.4b — sair da conta e excluir a conta apagam a última prévia do
// Pantry guardada no aparelho para aquele usuário.

const mockClearLastPantryPreview = jest.fn<void, [string]>();

jest.mock('../utils/pantryLastPreview.utils', () => ({
  clearLastPantryPreview: (userId: string) => mockClearLastPantryPreview(userId),
}));
jest.mock('../config/api', () => ({
  api: { get: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } },
}));
jest.mock('../config/storage', () => ({
  createAppStorage: () => ({ getString: () => undefined, set: jest.fn(), delete: jest.fn() }),
}));
jest.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK: 'AFTER_FIRST_UNLOCK',
  deleteItemAsync: jest.fn(() => Promise.resolve()),
  getItemAsync: jest.fn(() => Promise.resolve(null)),
  setItemAsync: jest.fn(() => Promise.resolve()),
}));
jest.mock('../services/auth.service', () => ({
  logout: jest.fn(() => Promise.resolve()),
  deleteAccount: jest.fn(() => Promise.resolve()),
  mapCurrentUserProfile: jest.fn(),
}));
jest.mock('../services/analytics.service', () => ({
  identifyAnalyticsUser: jest.fn(),
  resetAnalyticsUser: jest.fn(),
  trackEvent: jest.fn(),
}));
jest.mock('../services/purchase.service', () => ({
  identifyPurchasesUser: jest.fn(),
  logoutPurchasesUser: jest.fn(() => Promise.resolve()),
}));

import { useAuthStore } from './auth.store';
import type { AuthUser } from '../services/auth.service';

const USER = { id: 'user-1', isPro: true, totalXP: 0 } as unknown as AuthUser;

beforeEach(() => {
  mockClearLastPantryPreview.mockReset();
  useAuthStore.setState({ user: USER, accessToken: 'token', isAuthenticated: true });
});

describe('auth.store — última prévia do Pantry', () => {
  it('logout apaga a prévia do usuário que saiu', async () => {
    await useAuthStore.getState().logout();

    expect(mockClearLastPantryPreview).toHaveBeenCalledWith('user-1');
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('excluir a conta apaga a prévia do usuário', async () => {
    await useAuthStore.getState().deleteAccount();

    expect(mockClearLastPantryPreview).toHaveBeenCalledWith('user-1');
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('falha ao limpar não impede sair da conta', async () => {
    mockClearLastPantryPreview.mockImplementationOnce(() => {
      throw new Error('storage');
    });

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});
