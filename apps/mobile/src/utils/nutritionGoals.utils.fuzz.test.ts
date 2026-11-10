// Fuzz determinístico (PRNG com semente fixa -> reproduzível) das regras de
// valor da tela "Minhas metas". Gera milhares de textos hostis e confere
// INVARIANTES, comparando com um oráculo escrito de forma independente:
//
//   I1  parseGoalText devolve null ou um inteiro seguro >= 0 (nunca NaN/Infinity/fração/negativo);
//   I2  texto válido => valor dentro dos limites do shared, e só então;
//   I3  o PATCH nunca leva valor fora da faixa, não-inteiro, igual ao salvo, nem de campo inválido;
//   I4  bate com o oráculo (regex de dígitos ASCII + trim + comparação com os limites).
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

import {
  GOAL_FIELDS,
  areGoalDraftsValid,
  buildGoalsPatch,
  hasUnsavedGoalChanges,
  isGoalTextValid,
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
