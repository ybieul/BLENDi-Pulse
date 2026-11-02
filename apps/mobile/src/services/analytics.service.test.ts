// Testes de resiliência do analytics.service (mobile) — espelha o padrão já
// confirmado no backend (apps/api/src/services/analytics.service.test.ts):
// nunca lança erro, é idempotente, chama o SDK certo com os argumentos certos.
//
// O client (jest.fn() declarado fora da factory de jest.mock) é mantido estável
// entre chamadas de jest.resetModules() em loadAnalyticsService — a factory é
// reexecutada a cada require fresco do módulo, mas sempre devolve a mesma
// referência de mock, o que permite asserções consistentes entre os testes.
const mockIdentify = jest.fn();
const mockReset = jest.fn();
const mockCapture = jest.fn();
const mockPostHogConstructor = jest.fn().mockImplementation(() => ({
  identify: mockIdentify,
  reset: mockReset,
  capture: mockCapture,
}));

jest.mock('posthog-react-native', () => ({
  __esModule: true,
  default: mockPostHogConstructor,
}));

const mockGetPostHogApiKey = jest.fn();

jest.mock('../config/analytics.config', () => ({
  getPostHogApiKey: mockGetPostHogApiKey,
}));

type AnalyticsService = typeof import('./analytics.service');

// O módulo guarda o client num singleton de módulo — jest.resetModules() garante
// que cada teste comece com `client = null`, sem interferência do teste anterior.
function loadAnalyticsService(): AnalyticsService {
  jest.resetModules();
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- precisa de require (não import) pra recarregar o módulo após jest.resetModules()
  return require('./analytics.service') as AnalyticsService;
}

beforeEach(() => {
  mockIdentify.mockReset();
  mockReset.mockReset();
  mockCapture.mockReset();
  mockPostHogConstructor.mockClear();
  mockGetPostHogApiKey.mockReset();
});

describe('analytics.service (mobile)', () => {
  describe('sem chave do PostHog (getPostHogApiKey retorna null)', () => {
    it('nao cria client e as chamadas subsequentes nao lancam erro nem tocam no client', async () => {
      mockGetPostHogApiKey.mockReturnValue(null);
      const { initializeAnalytics, identifyAnalyticsUser, resetAnalyticsUser, trackEvent } =
        loadAnalyticsService();

      await initializeAnalytics();

      expect(mockPostHogConstructor).not.toHaveBeenCalled();

      expect(() => identifyAnalyticsUser('user-1')).not.toThrow();
      expect(() => resetAnalyticsUser()).not.toThrow();
      expect(() => trackEvent('event')).not.toThrow();

      expect(mockIdentify).not.toHaveBeenCalled();
      expect(mockReset).not.toHaveBeenCalled();
      expect(mockCapture).not.toHaveBeenCalled();
    });
  });

  describe('com chave valida do PostHog', () => {
    it('cria o client e e idempotente numa segunda chamada', async () => {
      mockGetPostHogApiKey.mockReturnValue('phc_valid_key');
      const { initializeAnalytics } = loadAnalyticsService();

      await initializeAnalytics();
      await initializeAnalytics();

      expect(mockPostHogConstructor).toHaveBeenCalledTimes(1);
      expect(mockPostHogConstructor).toHaveBeenCalledWith('phc_valid_key');
    });

    it('identifyAnalyticsUser chama client.identify com o userId', async () => {
      mockGetPostHogApiKey.mockReturnValue('phc_valid_key');
      const { initializeAnalytics, identifyAnalyticsUser } = loadAnalyticsService();
      await initializeAnalytics();

      identifyAnalyticsUser('user-123');

      expect(mockIdentify).toHaveBeenCalledWith('user-123');
    });

    it('resetAnalyticsUser chama client.reset', async () => {
      mockGetPostHogApiKey.mockReturnValue('phc_valid_key');
      const { initializeAnalytics, resetAnalyticsUser } = loadAnalyticsService();
      await initializeAnalytics();

      resetAnalyticsUser();

      expect(mockReset).toHaveBeenCalledTimes(1);
    });

    it('trackEvent chama client.capture com eventName e properties', async () => {
      mockGetPostHogApiKey.mockReturnValue('phc_valid_key');
      const { initializeAnalytics, trackEvent } = loadAnalyticsService();
      await initializeAnalytics();

      trackEvent('screen_viewed', { screen: 'Home' });

      expect(mockCapture).toHaveBeenCalledWith('screen_viewed', { screen: 'Home' });
    });

    it('identifyAnalyticsUser nao propaga erro lancado pelo client', async () => {
      mockGetPostHogApiKey.mockReturnValue('phc_valid_key');
      mockIdentify.mockImplementation(() => {
        throw new Error('falha simulada no identify');
      });
      const { initializeAnalytics, identifyAnalyticsUser } = loadAnalyticsService();
      await initializeAnalytics();

      expect(() => identifyAnalyticsUser('user-123')).not.toThrow();
    });

    it('resetAnalyticsUser nao propaga erro lancado pelo client', async () => {
      mockGetPostHogApiKey.mockReturnValue('phc_valid_key');
      mockReset.mockImplementation(() => {
        throw new Error('falha simulada no reset');
      });
      const { initializeAnalytics, resetAnalyticsUser } = loadAnalyticsService();
      await initializeAnalytics();

      expect(() => resetAnalyticsUser()).not.toThrow();
    });

    it('trackEvent nao propaga erro lancado pelo client', async () => {
      mockGetPostHogApiKey.mockReturnValue('phc_valid_key');
      mockCapture.mockImplementation(() => {
        throw new Error('falha simulada no capture');
      });
      const { initializeAnalytics, trackEvent } = loadAnalyticsService();
      await initializeAnalytics();

      expect(() => trackEvent('event')).not.toThrow();
    });
  });
});
