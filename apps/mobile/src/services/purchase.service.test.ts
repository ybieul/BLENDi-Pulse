// Restauração e seleção de pacote com IDs de produto nos dois formatos:
// simples (iOS, "pulse_pro_monthly") e com plano base (Android, "pulse_pro_monthly:monthly").
// Mocka o SDK da RevenueCat, a API, o analytics e o config da RevenueCat.
import { getAvailablePurchasePlans, PurchaseServiceError, restorePurchaseHistory } from './purchase.service';

// Prefixo "mock" permite usar as variáveis dentro das fábricas do jest.mock.
const mockIsConfigured = jest.fn<Promise<boolean>, unknown[]>();
const mockRestorePurchases = jest.fn<Promise<unknown>, unknown[]>();
const mockGetOfferings = jest.fn<Promise<unknown>, unknown[]>();
const mockApiPost = jest.fn<Promise<unknown>, unknown[]>();

jest.mock('react-native-purchases', () => ({
  __esModule: true,
  default: {
    isConfigured: (...args: unknown[]) => mockIsConfigured(...args),
    restorePurchases: (...args: unknown[]) => mockRestorePurchases(...args),
    getOfferings: (...args: unknown[]) => mockGetOfferings(...args),
  },
  LOG_LEVEL: { DEBUG: 'DEBUG', INFO: 'INFO' },
  PACKAGE_TYPE: { CUSTOM: 'CUSTOM' },
  PURCHASES_ERROR_CODE: {},
}));

jest.mock('../config/api', () => ({ api: { post: (...args: unknown[]) => mockApiPost(...args) } }));
jest.mock('./analytics.service', () => ({ trackEvent: jest.fn() }));
jest.mock('../config/revenuecat.config', () => ({
  getRevenueCatApiKey: () => 'test_key',
  isRevenueCatNativePlatform: () => true,
}));

const fakeUser = { id: 'user_1', isPro: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockIsConfigured.mockResolvedValue(true);
  mockApiPost.mockResolvedValue({ data: { success: true, data: { user: fakeUser } } });
});

function mockRestore(activeSubscriptions: string[]) {
  const customerInfo = { activeSubscriptions };
  mockRestorePurchases.mockResolvedValue(customerInfo);
  return customerInfo;
}

describe('restorePurchaseHistory', () => {
  const cases: Array<[string[], string]> = [
    [['pulse_pro_monthly'], 'pulse_pro_monthly'],
    [['pulse_pro_annual'], 'pulse_pro_annual'],
    [['pulse_pro_monthly:monthly'], 'pulse_pro_monthly'],
    [['pulse_pro_annual:annual'], 'pulse_pro_annual'],
    [['pulse_pro_monthly', 'pulse_pro_annual'], 'pulse_pro_annual'],
    [['pulse_pro_monthly:monthly', 'pulse_pro_annual:annual'], 'pulse_pro_annual'],
    [['pulse_pro_monthly_trial', 'pulse_pro_monthly:monthly'], 'pulse_pro_monthly'],
  ];

  it.each(cases)('encontra %j e escolhe %s', async (activeSubscriptions, expected) => {
    const customerInfo = mockRestore(activeSubscriptions);

    const result = await restorePurchaseHistory();

    expect(result.productIdentifier).toBe(expected);
    expect(result.customerInfo).toBe(customerInfo);
    expect(result.user).toEqual(fakeUser);
    expect(mockApiPost).toHaveBeenCalledWith(
      '/purchases/verify',
      expect.objectContaining({ productId: expected }),
    );
  });

  it.each([
    [[]],
    [['pulse_pro_monthly_trial']],
    [['pulse_pro_monthlyx', 'pulse_pro_annual_trial:annual']],
    [['', ':', ':monthly']],
  ])('não encontra nada em %j', async (activeSubscriptions) => {
    mockRestore(activeSubscriptions);

    await expect(restorePurchaseHistory()).rejects.toMatchObject({
      code: 'purchases/restore-not-found',
    });
    await expect(restorePurchaseHistory()).rejects.toBeInstanceOf(PurchaseServiceError);
    expect(mockApiPost).not.toHaveBeenCalled();
  });
});

describe('getAvailablePurchasePlans (selectTrackedPackage)', () => {
  function fakePackage(identifier: string) {
    return {
      identifier: `$rc_${identifier}`,
      packageType: 'CUSTOM',
      product: {
        identifier,
        title: identifier,
        description: '',
        price: 1,
        priceString: '$1.00',
        currencyCode: 'USD',
        pricePerMonthString: null,
      },
    };
  }

  function mockOffering(offering: Record<string, unknown>) {
    mockGetOfferings.mockResolvedValue({ current: offering });
  }

  it('encontra os pacotes pelo ID com plano base quando a offering não tem monthly/annual', async () => {
    mockOffering({
      monthly: null,
      annual: null,
      availablePackages: [
        fakePackage('pulse_pro_monthly_trial:monthly'),
        fakePackage('pulse_pro_annual:annual'),
        fakePackage('pulse_pro_monthly:monthly'),
      ],
    });

    const plans = await getAvailablePurchasePlans();

    expect(plans.map((plan) => [plan.id, plan.productId])).toEqual([
      ['monthly', 'pulse_pro_monthly:monthly'],
      ['annual', 'pulse_pro_annual:annual'],
    ]);
  });

  it('continua encontrando pelo ID simples (iOS)', async () => {
    mockOffering({
      monthly: null,
      annual: null,
      availablePackages: [fakePackage('pulse_pro_annual'), fakePackage('pulse_pro_monthly')],
    });

    const plans = await getAvailablePurchasePlans();

    expect(plans.map((plan) => [plan.id, plan.productId])).toEqual([
      ['monthly', 'pulse_pro_monthly'],
      ['annual', 'pulse_pro_annual'],
    ]);
  });

  it('prefere os pacotes padrão da offering quando existem', async () => {
    const monthly = fakePackage('pulse_pro_monthly:monthly');
    const annual = fakePackage('pulse_pro_annual:annual');
    mockOffering({
      monthly,
      annual,
      availablePackages: [fakePackage('pulse_pro_monthly'), fakePackage('pulse_pro_annual')],
    });

    const plans = await getAvailablePurchasePlans();

    expect(plans.map((plan) => plan.productId)).toEqual([
      'pulse_pro_monthly:monthly',
      'pulse_pro_annual:annual',
    ]);
  });

  it('recusa IDs parecidos que não são os planos', async () => {
    mockOffering({
      monthly: null,
      annual: null,
      availablePackages: [fakePackage('pulse_pro_monthlyx:monthly'), fakePackage('pulse_pro_annual_trial')],
    });

    await expect(getAvailablePurchasePlans()).rejects.toMatchObject({
      code: 'purchases/plans-unavailable',
    });
  });
});

describe('restorePurchaseHistory — entradas adversariais do SDK', () => {
  it.each([
    'PULSE_PRO_MONTHLY:monthly',
    ' pulse_pro_monthly:monthly',
    'pulse_pro_monthly :monthly',
    'pulse_pro_monthly​:monthly',
    'pulse_pro_monthly：monthly',
    'pulse_pro_monthly%3Amonthly',
    'pulsе_pro_monthly:monthly',
    'other_app:pulse_pro_monthly',
    'rc_promo_pulse_pro_monthly',
    '__proto__',
    'constructor',
  ])('não aceita %j', async (productId) => {
    mockRestore([productId]);

    await expect(restorePurchaseHistory()).rejects.toMatchObject({
      code: 'purchases/restore-not-found',
    });
    expect(mockApiPost).not.toHaveBeenCalled();
  });

  it.each([[undefined], [null], [{ pulse_pro_monthly: 'pulse_pro_monthly' }], ['pulse_pro_monthly']])(
    'activeSubscriptions fora do formato (%j) vira "nenhuma compra", não erro genérico',
    async (activeSubscriptions) => {
      mockRestorePurchases.mockResolvedValue({ activeSubscriptions });

      await expect(restorePurchaseHistory()).rejects.toMatchObject({
        code: 'purchases/restore-not-found',
      });
    },
  );

  it('ignora itens que não são string e ainda acha a assinatura válida', async () => {
    mockRestorePurchases.mockResolvedValue({
      activeSubscriptions: [null, undefined, 123, {}, 'pulse_pro_annual:annual'],
    });

    const result = await restorePurchaseHistory();

    expect(result.productIdentifier).toBe('pulse_pro_annual');
  });

  it('com 10.000 IDs desconhecidos e um válido no fim, acha o válido', async () => {
    const ids = Array.from({ length: 10_000 }, (_, i) => `pulse_pro_monthly_${i}:monthly`);
    mockRestore([...ids, 'pulse_pro_monthly:monthly']);

    const result = await restorePurchaseHistory();

    expect(result.productIdentifier).toBe('pulse_pro_monthly');
  });

  it('não manda ao backend o ID vindo do SDK, só a constante', async () => {
    mockRestore(['pulse_pro_annual:annual:../../x']);

    await restorePurchaseHistory();

    expect(mockApiPost).toHaveBeenCalledWith('/purchases/verify', {
      platform: 'ios',
      productId: 'pulse_pro_annual',
    });
  });
});

describe('getAvailablePurchasePlans — offering mal configurada no painel', () => {
  function pkg(identifier: string) {
    return {
      identifier: `$rc_${identifier}`,
      packageType: 'CUSTOM',
      product: {
        identifier,
        title: identifier,
        description: '',
        price: 1,
        priceString: '$1.00',
        currencyCode: 'USD',
        pricePerMonthString: null,
      },
    };
  }

  it('pacote padrão apontando para outro produto é ignorado e cai na busca pelo ID', async () => {
    mockGetOfferings.mockResolvedValue({
      current: {
        monthly: pkg('pulse_pro_monthly_trial'),
        annual: pkg('pulse_pro_monthly:monthly'),
        availablePackages: [pkg('pulse_pro_monthly:monthly'), pkg('pulse_pro_annual:annual')],
      },
    });

    const plans = await getAvailablePurchasePlans();

    expect(plans.map((plan) => [plan.id, plan.productId])).toEqual([
      ['monthly', 'pulse_pro_monthly:monthly'],
      ['annual', 'pulse_pro_annual:annual'],
    ]);
  });

  it('pacote padrão errado e nenhum pacote certo: planos indisponíveis, nada à venda', async () => {
    mockGetOfferings.mockResolvedValue({
      current: {
        monthly: pkg('pulse_pro_annual'),
        annual: pkg('pulse_pro_annual'),
        availablePackages: [pkg('pulse_pro_annual'), pkg('other_product')],
      },
    });

    await expect(getAvailablePurchasePlans()).rejects.toMatchObject({
      code: 'purchases/plans-unavailable',
    });
  });

  it('pacote padrão certo nos dois formatos continua sendo usado', async () => {
    mockGetOfferings.mockResolvedValue({
      current: {
        monthly: pkg('pulse_pro_monthly'),
        annual: pkg('pulse_pro_annual:annual'),
        availablePackages: [],
      },
    });

    const plans = await getAvailablePurchasePlans();

    expect(plans.map((plan) => plan.productId)).toEqual(['pulse_pro_monthly', 'pulse_pro_annual:annual']);
  });
});
