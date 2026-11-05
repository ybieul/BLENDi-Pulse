// Testa a seleção determinística da receita do dia (rotação client-side por
// goal, sem rede/estado persistido, pelo fuso LOCAL do aparelho) e o
// repasse de steps/pulseCount pro PulseAiRecipe enviado em onStartBlend.
// useColors e useAppTranslation são mockados pra isolar da store de tema
// (MMKV) e do i18next reais — aqui importa só a lógica de seleção e
// montagem do PulseAiRecipe.
//
// getLocalDayIndex aceita um parâmetro de fuso opcional só pra teste
// determinístico: mutar process.env.TZ em runtime NÃO é confiável neste
// setup de Jest (confirmado empiricamente — Intl.DateTimeFormat()
// .resolvedOptions().timeZone continua devolvendo o fuso real da máquina
// mesmo depois da troca). As provas de "segue o fuso certo" ficam no
// describe de baixo, chamando getLocalDayIndex diretamente com um fuso
// explícito — sem depender de process.env.TZ nem de renderizar nada. Os
// testes que renderizam o componente usam o fuso REAL da máquina que roda
// o teste (igual à produção) e calculam o índice esperado chamando a
// mesma função exportada, em vez de hardcodar qual receita "deveria" ser
// — isso evita que os testes fiquem acoplados ao fuso de quem os executa.
import { fireEvent, render } from '@testing-library/react-native';
import type { PulseAiRecipe } from '@blendi/shared';

jest.mock('../../hooks/useColors', () => ({
  useColors: () => ({
    overlay: { plum: { 7: '#000', 10: '#000' } },
    brand: { pulse: '#000' },
    text: { primary: '#000' },
  }),
}));

jest.mock('../../hooks/useAppTranslation', () => ({
  useAppTranslation: () => ({
    t: (key: string) => key,
  }),
}));

import { DAILY_RECIPES, DailyRecipeCard, getLocalDayIndex } from './DailyRecipeCard';

const MS_PER_DAY = 86400000;
const MUSCLE_POOL_SIZE = DAILY_RECIPES.Muscle.length;

function renderAndPressStart(goal: 'Muscle' | 'Wellness' | 'Energy' | 'Recovery') {
  const onStartBlend = jest.fn<void, [PulseAiRecipe]>();
  const { getByRole, unmount } = render(<DailyRecipeCard goal={goal} onStartBlend={onStartBlend} />);

  fireEvent.press(getByRole('button'));
  unmount();

  return onStartBlend;
}

// Mesma fórmula do componente (módulo matemático, sempre não-negativo),
// usando o fuso REAL da máquina — nenhum override, de propósito.
function expectedMuscleIndex(nowMs: number): number {
  const rawIndex = getLocalDayIndex(new Date(nowMs));
  return ((rawIndex % MUSCLE_POOL_SIZE) + MUSCLE_POOL_SIZE) % MUSCLE_POOL_SIZE;
}

describe('DailyRecipeCard — seleção determinística da receita do dia (fuso real do dispositivo)', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('percorre as 20 receitas do pool em 20 dias locais consecutivos, sem repetição nem pulo, repassando steps/pulseCount fielmente em cada uma', () => {
    const now = Date.now();
    const seenTitles = new Set<string>();

    for (let offset = 0; offset < MUSCLE_POOL_SIZE; offset += 1) {
      const instant = now + offset * MS_PER_DAY;
      jest.spyOn(Date, 'now').mockReturnValue(instant);

      const onStartBlend = renderAndPressStart('Muscle');
      const recipe = onStartBlend.mock.calls[0][0];
      const sourceRecipe = DAILY_RECIPES.Muscle[expectedMuscleIndex(instant)];

      expect(recipe.title).toBe(sourceRecipe.nameKey);
      expect(recipe.steps).toEqual(
        sourceRecipe.steps.map((step) => ({
          text: step.textKey, // t() mockado é identidade
          pulseCount: step.pulseCount,
        }))
      );

      seenTitles.add(recipe.title);
      jest.restoreAllMocks();
    }

    // As 20 receitas do pool foram todas visitadas, cada uma exatamente
    // uma vez — prova direta de que o índice cobre o pool inteiro sem
    // lacunas nem repetição espúria.
    expect(seenTitles.size).toBe(MUSCLE_POOL_SIZE);

    // Wraparound: exatamente MUSCLE_POOL_SIZE dias locais depois, a receita
    // volta a ser a mesma do offset 0 (módulo do tamanho do pool).
    jest.spyOn(Date, 'now').mockReturnValue(now);
    const day0 = renderAndPressStart('Muscle');
    jest.restoreAllMocks();

    jest.spyOn(Date, 'now').mockReturnValue(now + MUSCLE_POOL_SIZE * MS_PER_DAY);
    const dayPoolSize = renderAndPressStart('Muscle');

    expect(dayPoolSize.mock.calls[0][0].title).toBe(day0.mock.calls[0][0].title);
  });

  it('mantém a mesma receita em qualquer horário dentro do mesmo dia local', () => {
    const now = Date.now();

    jest.spyOn(Date, 'now').mockReturnValue(now);
    const firstCall = renderAndPressStart('Muscle');
    jest.restoreAllMocks();

    jest.spyOn(Date, 'now').mockReturnValue(now + 5000);
    const secondCall = renderAndPressStart('Muscle');

    expect(firstCall.mock.calls[0][0].title).toBe(secondCall.mock.calls[0][0].title);
  });
});

describe('DailyRecipeCard — getLocalDayIndex segue o fuso horário correto, não UTC fixo', () => {
  it('UTC: dia 0 na época Unix', () => {
    expect(getLocalDayIndex(new Date(0), 'UTC')).toBe(0);
  });

  it('América/São Paulo (UTC-3): perto da virada UTC, o dia local ainda é o dia ANTERIOR', () => {
    // 1970-01-02T01:00:00Z é dia 1 em UTC, mas ainda 1969-12-31T22:00 em
    // America/Sao_Paulo (UTC-3) — dia local 0, um dia ANTES do dia UTC.
    const instant = new Date(MS_PER_DAY + 1 * 60 * 60 * 1000);
    expect(getLocalDayIndex(instant, 'UTC')).toBe(1);
    expect(getLocalDayIndex(instant, 'America/Sao_Paulo')).toBe(0);
  });

  it('Ásia/Tóquio (UTC+9): perto da virada UTC, o dia local já é o dia SEGUINTE', () => {
    // 1970-01-02T23:00:00Z é dia 1 em UTC, mas já 1970-01-03T08:00 em
    // Asia/Tokyo (UTC+9) — dia local 2, um dia DEPOIS do dia UTC.
    const instant = new Date(MS_PER_DAY + 23 * 60 * 60 * 1000);
    expect(getLocalDayIndex(instant, 'UTC')).toBe(1);
    expect(getLocalDayIndex(instant, 'Asia/Tokyo')).toBe(2);
  });

  it('usa o fuso real do dispositivo quando nenhum fuso é passado explicitamente', () => {
    const instant = new Date();
    const deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    expect(getLocalDayIndex(instant)).toBe(getLocalDayIndex(instant, deviceTimezone));
  });
});
