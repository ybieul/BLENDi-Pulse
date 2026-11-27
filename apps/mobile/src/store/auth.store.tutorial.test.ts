// CP-C2a — Excluir a conta apaga o estado local do tutorial (progresso e
// fila pendente) daquele usuário; logout não apaga (o progresso fica para
// retomar); exclusão que falha no servidor não apaga nada.

const mockClearTutorialLocalState = jest.fn<void, [string]>();
const mockDeleteAccount = jest.fn<Promise<void>, []>(() => Promise.resolve());

jest.mock('../features/tutorial/tutorialStorage', () => ({
  clearTutorialLocalState: (userId: string) => mockClearTutorialLocalState(userId),
}));
jest.mock('../utils/pantryLastPreview.utils', () => ({ clearLastPantryPreview: jest.fn() }));
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
  deleteAccount: () => mockDeleteAccount(),
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

const USER = { id: 'user-1', isPro: false, totalXP: 0 } as unknown as AuthUser;

beforeEach(() => {
  mockClearTutorialLocalState.mockReset();
  mockDeleteAccount.mockReset().mockResolvedValue(undefined);
  useAuthStore.setState({ user: USER, accessToken: 'token', isAuthenticated: true });
});

describe('CP-C2a — auth.store e o estado local do tutorial', () => {
  it('excluir a conta com sucesso apaga o estado do tutorial daquele usuário', async () => {
    await useAuthStore.getState().deleteAccount();
    expect(mockClearTutorialLocalState).toHaveBeenCalledWith('user-1');
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('exclusão que falha no servidor não apaga nada', async () => {
    mockDeleteAccount.mockRejectedValueOnce(new Error('500'));
    await expect(useAuthStore.getState().deleteAccount()).rejects.toThrow('500');
    expect(mockClearTutorialLocalState).not.toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(true);
  });

  it('logout não apaga (o progresso fica para retomar)', async () => {
    await useAuthStore.getState().logout();
    expect(mockClearTutorialLocalState).not.toHaveBeenCalled();
  });
});
