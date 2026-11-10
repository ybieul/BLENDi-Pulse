// Fuzz determinístico (PRNG com semente fixa -> reproduzível) das regras de
// valor da tela "Minhas metas". Gera milhares de textos hostis e confere
// INVARIANTES, comparando com um oráculo escrito de forma independente:
//
//   I1  parseGoalText devolve null ou um inteiro seguro >= 0 (nunca NaN/Infinity/fração/negativo);
//   I2  texto válido => valor dentro dos limites do shared, e só então;
//   I3  o PATCH nunca leva valor fora da faixa, não-inteiro, igual ao salvo, nem de campo inválido;
//   I4  bate com o oráculo (regex de dígitos ASCII + trim + comparação com os limites).
//
// Hidratação no sistema imperial (fl oz, uma casa decimal): mesmas invariantes,
// com um oráculo próprio em décimos inteiros e faixa achada por busca (não pela
// fórmula do código), e o PATCH sempre em ml inteiro dentro da faixa do shared.
import {
  DAILY_CALORIE_TARGET_MAX,
  DAILY_CALORIE_TARGET_MIN,
  DAILY_CARB_TARGET_MAX,
  DAILY_CARB_TARGET_MIN,
  DAILY_HYDRATION_TARGET_MAX,
  DAILY_HYDRATION_TARGET_MIN,
  DAILY_PROTEIN_TARGET_VALIDATION_MAX,
  DAILY_PROTEIN_TARGET_VALIDATION_MIN,
} from '@blendi/shared';

import { MILLILITERS_PER_FLUID_OUNCE } from './volumeUnits';
import {
  GOAL_FIELDS,
  HYDRATION_FL_OZ_LIMITS,
  areGoalDraftsValid,
  buildGoalsPatch,
  hasUnsavedGoalChanges,
  isGoalTextValid,
  parseGoalDraftText,
  parseGoalText,
  parseGoalWarnings,
  type GoalField,
  type GoalsValues,
} from './nutritionGoals.utils';

const LIMITS: Record<GoalField, readonly [number, number]> = {
  dailyProteinTarget: [DAILY_PROTEIN_TARGET_VALIDATION_MIN, DAILY_PROTEIN_TARGET_VALIDATION_MAX],
  dailyCarbTarget: [DAILY_CARB_TARGET_MIN, DAILY_CARB_TARGET_MAX],
  dailyCalorieTarget: [DAILY_CALORIE_TARGET_MIN, DAILY_CALORIE_TARGET_MAX],
  dailyHydrationTarget: [DAILY_HYDRATION_TARGET_MIN, DAILY_HYDRATION_TARGET_MAX],
};

const BASELINE: GoalsValues = {
  dailyProteinTarget: 150,
  dailyCarbTarget: 200,
  dailyCalorieTarget: 2000,
  dailyHydrationTarget: 2500,
  dietaryPreferences: [],
};

// mulberry32: PRNG pequeno e determinístico.
function createRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Alfabeto hostil: dígitos, sinais, separadores, espaços Unicode, invisíveis,
// dígitos de outros alfabetos, letras, símbolos de injeção e emoji.
const ALPHABET = [
  ...'0123456789'.split(''),
  ...'0123456789'.split(''), // dígitos pesam mais, para sair bastante texto "quase válido"
  '+', '-', '.', ',', 'e', 'E', 'x', ' ', '\t', '\n', '\r',
  ' ', ' ', '​', '‌', '﻿', '⁠', '‮',
  '０', '１', '５', '٣', '٠', '१', '²', '½', '∞', 'a', 'Z', '_',
  '$', '{', '}', '"', "'", '<', '>', '\\', '/', '%', '😀',
];

function randomText(random: () => number): string {
  const kind = random();
  if (kind < 0.04) {
    return '';
  }
  if (kind < 0.12) {
    // "quase número": dígitos puros, às vezes com zeros à esquerda e espaços nas pontas
    const digits = String(Math.floor(random() * 20000));
    return `${random() < 0.3 ? ' ' : ''}${random() < 0.2 ? '000' : ''}${digits}${random() < 0.3 ? ' ' : ''}`;
  }
  const length = 1 + Math.floor(random() * 9);
  let text = '';
  for (let index = 0; index < length; index += 1) {
    text += ALPHABET[Math.floor(random() * ALPHABET.length)] ?? '';
  }
  return text;
}

// Oráculo independente: só dígitos ASCII (após trim), comparado aos limites.
function oracle(field: GoalField, text: string): number | null {
  const trimmed = text.trim();
  if (!/^[0-9]+$/.test(trimmed)) {
    return null;
  }
  const value = parseInt(trimmed, 10);
  const [min, max] = LIMITS[field];
  return value >= min && value <= max ? value : null;
}

describe('fuzz — regras de valor das metas (20.000 entradas, semente fixa)', () => {
  const random = createRandom(0xc0ffee);
  const samples = Array.from({ length: 20_000 }, () => randomText(random));

  it('I1: parseGoalText só devolve null ou inteiro seguro >= 0', () => {
    for (const text of samples) {
      const value = parseGoalText(text);
      if (value !== null) {
        expect(Number.isSafeInteger(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('I2/I4: isGoalTextValid concorda com o oráculo, campo a campo', () => {
    let accepted = 0;
    for (const text of samples) {
      for (const field of GOAL_FIELDS) {
        const expected = oracle(field, text);
        expect(isGoalTextValid(field, text)).toBe(expected !== null);
        if (expected !== null) {
          accepted += 1;
          expect(parseGoalText(text)).toBe(expected);
        }
      }
    }
    // Sanidade do próprio fuzz: houve exemplos aceitos E rejeitados em volume.
    expect(accepted).toBeGreaterThan(500);
    expect(accepted).toBeLessThan(samples.length * GOAL_FIELDS.length);
  });

  it('I3: o PATCH nunca leva valor inválido, fracionário, igual ao salvo ou de texto rejeitado', () => {
    for (const text of samples) {
      for (const field of GOAL_FIELDS) {
        const patch = buildGoalsPatch(BASELINE, { [field]: text }, null);
        const sent = patch[field];
        const expected = oracle(field, text);

        if (expected === null || expected === BASELINE[field]) {
          expect(sent).toBeUndefined();
        } else {
          expect(sent).toBe(expected);
          expect(Number.isInteger(sent)).toBe(true);
        }
        // Nenhum outro campo aparece por tabela.
        expect(Object.keys(patch).filter((key) => key !== field)).toEqual([]);
        // Texto rejeitado nunca habilita o botão (areGoalDraftsValid) e é "alteração" para o aviso de saída.
        if (expected === null) {
          expect(areGoalDraftsValid({ [field]: text })).toBe(false);
          expect(hasUnsavedGoalChanges(BASELINE, { [field]: text }, null)).toBe(true);
        }
      }
    }
  });

  it('combinações dos 4 campos: o PATCH só tem campos válidos e alterados', () => {
    const rnd = createRandom(0xbadc0de);
    for (let round = 0; round < 3000; round += 1) {
      const draft = Object.fromEntries(
        GOAL_FIELDS.filter(() => rnd() < 0.7).map((field) => [field, randomText(rnd)]),
      ) as Partial<Record<GoalField, string>>;
      const patch = buildGoalsPatch(BASELINE, draft, null);

      for (const field of GOAL_FIELDS) {
        const text = draft[field];
        const expected = text === undefined ? null : oracle(field, text);
        const shouldBeSent = expected !== null && expected !== BASELINE[field];
        expect(patch[field] !== undefined).toBe(shouldBeSent);
      }
      // O botão só habilita se TODOS os campos digitados forem válidos.
      const allValid = GOAL_FIELDS.every((field) => draft[field] === undefined || oracle(field, draft[field] ?? '') !== null);
      expect(areGoalDraftsValid(draft)).toBe(allValid);
    }
  });
});

describe('fuzz — extremos e desempenho', () => {
  it.each(GOAL_FIELDS)('%s: fronteiras exatas (min-1, min, max, max+1) com zeros à esquerda e espaços', (field) => {
    const [min, max] = LIMITS[field];

    for (const [value, valid] of [
      [min - 1, false],
      [min, true],
      [min + 1, true],
      [max - 1, true],
      [max, true],
      [max + 1, false],
    ] as const) {
      if (value < 0) {
        continue; // mínimo 0: não existe "min - 1" digitável (o '-' já é rejeitado)
      }
      for (const text of [String(value), `  ${value}  `, `000${value}`]) {
        expect(isGoalTextValid(field, text)).toBe(valid);
      }
    }
  });

  it('números absurdos viram "fora da faixa", nunca valor aceito (Infinity, perda de precisão)', () => {
    for (const text of ['9'.repeat(400), '9'.repeat(17), '9007199254740993', '1' + '0'.repeat(309)]) {
      for (const field of GOAL_FIELDS) {
        expect(isGoalTextValid(field, text)).toBe(false);
      }
    }
  });

  it('textos gigantes são tratados em tempo linear (1 milhão de caracteres < 200 ms)', () => {
    const huge = '9'.repeat(1_000_000);
    const startedAt = Date.now();
    for (const field of GOAL_FIELDS) {
      isGoalTextValid(field, huge);
    }
    expect(Date.now() - startedAt).toBeLessThan(200);
  });
});

describe('fuzz — hidratação imperial em fl oz (20.000 entradas, semente fixa)', () => {
  const HYDRATION: GoalField = 'dailyHydrationTarget';
  const random = createRandom(0xf102);

  // Faixa em décimos achada por busca linear (independente da fórmula do código).
  let minTenths = 0;
  while ((minTenths / 10) * MILLILITERS_PER_FLUID_OUNCE < DAILY_HYDRATION_TARGET_MIN) {
    minTenths += 1;
  }
  let maxTenths = minTenths;
  while (((maxTenths + 1) / 10) * MILLILITERS_PER_FLUID_OUNCE <= DAILY_HYDRATION_TARGET_MAX) {
    maxTenths += 1;
  }
  const baselineTenths = Math.round((BASELINE.dailyHydrationTarget / MILLILITERS_PER_FLUID_OUNCE) * 10);

  // Oráculo: décimos (inteiro) do texto, ou null.
  function flOzOracle(text: string): number | null {
    const trimmed = text.trim();
    const match = /^([0-9]+)(?:[.,]([0-9])?)?$/.exec(trimmed);
    if (!match) {
      return null;
    }
    const tenths = parseInt(match[1] ?? '', 10) * 10 + parseInt(match[2] ?? '0', 10);
    return tenths >= minTenths && tenths <= maxTenths ? tenths : null;
  }

  function randomFlOzText(rnd: () => number): string {
    const kind = rnd();
    if (kind < 0.35) {
      const integer = String(Math.floor(rnd() * 320));
      const separator = rnd() < 0.5 ? '.' : ',';
      const decimals = ['', '0', String(Math.floor(rnd() * 10)), `${Math.floor(rnd() * 100)}`][Math.floor(rnd() * 4)];
      return `${rnd() < 0.2 ? ' ' : ''}${integer}${rnd() < 0.8 ? separator + decimals : ''}${rnd() < 0.2 ? ' ' : ''}`;
    }
    return randomText(rnd);
  }

  const samples = Array.from({ length: 20_000 }, () => randomFlOzText(random));

  it('a faixa derivada é 17.0–270.5 e coincide com a busca', () => {
    expect(HYDRATION_FL_OZ_LIMITS).toEqual({ min: 17, max: 270.5 });
    expect(minTenths).toBe(170);
    expect(maxTenths).toBe(2705);
  });

  it('I1: parseGoalDraftText só devolve null ou número >= 0 com no máximo uma casa', () => {
    for (const text of samples) {
      const value = parseGoalDraftText(HYDRATION, text, 'imperial');
      if (value !== null) {
        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(Math.round(value * 10))).toBe(true);
        expect(Math.abs(value * 10 - Math.round(value * 10))).toBeLessThan(1e-9);
      }
    }
  });

  it('I2/I4: isGoalTextValid concorda com o oráculo', () => {
    let accepted = 0;
    for (const text of samples) {
      const expected = flOzOracle(text);
      expect(isGoalTextValid(HYDRATION, text, 'imperial')).toBe(expected !== null);
      if (expected !== null) {
        accepted += 1;
      }
    }
    expect(accepted).toBeGreaterThan(1000);
    expect(accepted).toBeLessThan(samples.length);
  });

  it('I3: o PATCH só leva ml inteiro dentro da faixa do shared, e só quando o valor exibido mudou', () => {
    for (const text of samples) {
      const draft = { [HYDRATION]: text };
      const patch = buildGoalsPatch(BASELINE, draft, null, 'imperial');
      const sent = patch.dailyHydrationTarget;
      const expected = flOzOracle(text);

      if (expected === null || expected === baselineTenths) {
        expect(sent).toBeUndefined();
      } else {
        expect(sent).toBe(Math.round((expected / 10) * MILLILITERS_PER_FLUID_OUNCE));
        expect(Number.isInteger(sent)).toBe(true);
        expect(sent).toBeGreaterThanOrEqual(DAILY_HYDRATION_TARGET_MIN);
        expect(sent).toBeLessThanOrEqual(DAILY_HYDRATION_TARGET_MAX);
      }
      expect(Object.keys(patch).filter((key) => key !== HYDRATION)).toEqual([]);
      if (expected === null) {
        expect(areGoalDraftsValid(draft, 'imperial', BASELINE)).toBe(false);
        expect(hasUnsavedGoalChanges(BASELINE, draft, null, 'imperial')).toBe(true);
      }
    }
  });

  it('os outros campos continuam só inteiros no imperial', () => {
    for (const text of samples) {
      for (const field of GOAL_FIELDS.filter((item) => item !== HYDRATION)) {
        expect(isGoalTextValid(field, text, 'imperial')).toBe(oracle(field, text) !== null);
      }
    }
  });

  it('todo valor exibido possível de 500 a 8000 ml, redigitado, não entra no PATCH', () => {
    for (let ml = DAILY_HYDRATION_TARGET_MIN; ml <= DAILY_HYDRATION_TARGET_MAX; ml += 1) {
      const baseline = { ...BASELINE, dailyHydrationTarget: ml };
      const shown = (Math.round((ml / MILLILITERS_PER_FLUID_OUNCE) * 10) / 10).toFixed(1);
      for (const text of [shown, shown.replace('.', ',')]) {
        expect(buildGoalsPatch(baseline, { [HYDRATION]: text }, null, 'imperial')).toEqual({});
        expect(hasUnsavedGoalChanges(baseline, { [HYDRATION]: text }, null, 'imperial')).toBe(false);
        expect(areGoalDraftsValid({ [HYDRATION]: text }, 'imperial', baseline)).toBe(true);
      }
    }
  });

  it('texto gigante com separador é tratado em tempo linear', () => {
    const huge = `${'9'.repeat(1_000_000)}.5`;
    const startedAt = Date.now();
    expect(isGoalTextValid(HYDRATION, huge, 'imperial')).toBe(false);
    expect(Date.now() - startedAt).toBeLessThan(200);
  });
});

describe('fuzz — avisos do backend (parseGoalWarnings) com lixo arbitrário', () => {
  const random = createRandom(0x5eed);

  function randomJson(depth: number): unknown {
    const kind = Math.floor(random() * 9);
    switch (kind) {
      case 0: return null;
      case 1: return Math.floor(random() * 1000) - 500;
      case 2: return randomText(random);
      case 3: return random() < 0.5;
      case 4: return undefined;
      case 5: return depth > 2 ? 1 : Array.from({ length: Math.floor(random() * 4) }, () => randomJson(depth + 1));
      default:
        return depth > 2
          ? {}
          : Object.fromEntries(
              ['field', 'code', 'message', '__proto__', 'constructor', 'toString'].filter(() => random() < 0.5).map((key) => [key, randomJson(depth + 1)]),
            );
    }
  }

  it('nunca lança e só devolve campos editáveis com chaves de tradução conhecidas (5.000 entradas)', () => {
    const allowedFields = new Set<string>(GOAL_FIELDS);
    for (let round = 0; round < 5000; round += 1) {
      const result = parseGoalWarnings(randomJson(0));

      for (const [field, keys] of Object.entries(result)) {
        expect(allowedFields.has(field)).toBe(true);
        expect(keys?.every((key) => key.startsWith('nutritionGoals.warnings.'))).toBe(true);
      }
    }
  });
});
